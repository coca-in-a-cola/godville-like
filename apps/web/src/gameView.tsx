import { useEffect, useRef, useState } from 'preact/hooks';
import { worldZone, type SessionAction, type SessionState } from '@godville/sim';
import type { GameRuntime } from './gameRuntime.ts';
import { gameData, translator as t } from './gameData.ts';
import { createCalmMusic } from './music.ts';
import { music, musicStored, setMusic, setTheme, theme } from './settings.ts';
import { absoluteMile, contentName, n } from './viewFormat.ts';
import { HeroCard, StatsCard, StatusCard } from './views/HeroPanel.tsx';
import { DiaryCard, FocusCard } from './views/LivePanel.tsx';
import { GodPanel } from './views/GodPanel.tsx';
import { BagCard, EquipmentCard } from './views/InventoryPanel.tsx';
import { RoadMapCard } from './views/RoadMap.tsx';
import { SceneCard } from './views/Scene.tsx';
import { StartScreen } from './views/StartScreen.tsx';
export type Act = (action: SessionAction) => Promise<void>;
/** Dev-only real-time multipliers; 0 pauses the simulation. */
const DEV_SPEEDS = [0, 1, 2, 4, 8, 16] as const;

function TopBar({ session: s, runtime: r }: { session: SessionState; runtime: GameRuntime }) {
  const h = s.world.hero;
  const scale = r.timeScale.value;
  return <header class="topbar">
    <div class="topbar-main"><span class="hero-level num">{t.t('ui.levelShort', { level: h.level })}</span><p class="topbar-subtitle num">{t.t('ui.topSubtitle', { hero: r.profile.value.heroName, town: contentName('towns', h.currentTownId), mile: n(absoluteMile(s)), zone: worldZone(s.world, gameData), speed: scale === 0 ? t.t('ui.pause') : t.t('ui.speedValue', { value: scale }) })}</p></div>
    <div class="xp-strip" role="meter" aria-label={t.t('ui.xp')} aria-valuemin={0} aria-valuemax={h.nextLevelXp} aria-valuenow={h.xp} title={t.t('ui.xpValue', { xp: n(h.xp), max: n(h.nextLevelXp) })}><span style={{ width: `${Math.min(100, h.xp / Math.max(1, h.nextLevelXp) * 100)}%` }} /></div>
  </header>;
}

function MusicControls() {
  const m = music.value;
  return <span class="music-controls"><button type="button" class={m.on ? 'toggle active' : 'toggle'} aria-pressed={m.on} onClick={() => setMusic({ ...m, on: !m.on })}>{t.t('ui.music')}</button>
    <label class="volume"><span class="sr-only">{t.t('ui.volume')}</span><input type="range" min={0} max={1} step={0.05} value={m.volume} aria-label={t.t('ui.volume')} onInput={event => setMusic({ ...m, volume: Number(event.currentTarget.value) })} /></label></span>;
}
function ThemeToggle() {
  const dark = theme.value === 'dark';
  return <button type="button" class="toggle" aria-pressed={dark} title={t.t('ui.themeToggle')} onClick={() => setTheme(dark ? 'light' : 'dark')}>{t.t(dark ? 'ui.themeDark' : 'ui.themeLight')}</button>;
}
function SpeedButtons({ runtime: r }: { runtime: GameRuntime }) {
  return <span class="speed-buttons" role="group" aria-label={t.t('ui.devSpeed')}>{DEV_SPEEDS.map(value => <button type="button" key={value} class={r.timeScale.value === value ? 'active' : ''} aria-pressed={r.timeScale.value === value} onClick={() => r.setTimeScale(value)}>{value === 0 ? t.t('ui.pause') : t.t(`ui.speed${value}x`)}</button>)}</span>;
}
function ControlRow({ runtime: r, compact, onCompact }: { runtime: GameRuntime; compact: boolean; onCompact: (value: boolean) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  return <nav class="control-row" aria-label={t.t('ui.sections')}>
    <MusicControls /><ThemeToggle />
    <button type="button" onClick={() => dialog.current?.showModal()}>{t.t('ui.settings')}</button>
    <details class="more"><summary aria-label={t.t('ui.moreMenu')}>{t.t('ui.more')}</summary><div class="menu"><a href="?sandbox=1">{t.t('ui.sandbox')}</a><span class="hint">{t.t('ui.localOnly')}</span><span class="hint">{t.t('ui.clockRule')}</span></div></details>
    {import.meta.env.DEV && <SpeedButtons runtime={r} />}
    <dialog ref={dialog} class="settings-dialog" aria-label={t.t('ui.settingsTitle')}><form method="dialog"><h2 class="card-title">{t.t('ui.settingsTitle')}</h2>
      <p><span class="eyebrow">{t.t('ui.themeToggle')}</span> <ThemeToggle /></p>
      <p><MusicControls /></p>
      <label class="compact"><input type="checkbox" checked={compact} onChange={event => onCompact(event.currentTarget.checked)} />{t.t('ui.compact')}</label>
      <p class="hint">{t.t('ui.preferencesHint')}</p>
      <button>{t.t('ui.close')}</button></form></dialog>
  </nav>;
}

/** Calm music and procedural SFX follow stored preferences and start on the first user gesture. */
function useMusic(profileMusic: boolean, r: GameRuntime, s: SessionState | null) {
  const engineRef = useRef<ReturnType<typeof createCalmMusic> | null>(null);
  const lastCombatEventCount = useRef(0);
  const lastWorldSeq = useRef(0);

  useEffect(() => {
    if (!musicStored) music.value = { ...music.value, on: profileMusic };
    const engine = createCalmMusic();
    engineRef.current = engine;
    let unlocked = false;
    const unlock = () => { unlocked = true; engine.set(music.value); };
    const off = music.subscribe(value => { if (unlocked) engine.set(value); });
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => {
      off();
      window.removeEventListener('pointerdown', unlock);
      engine.dispose();
      engineRef.current = null;
    };
  }, [profileMusic]);

  // Fast-forward gating: silence SFX during acceleration or catch-up
  const isFast = r.timeScale.value > 1 || r.catchingUp.value;
  useEffect(() => {
    engineRef.current?.setFastForward(isFast);
  }, [isFast]);

  // Event-driven SFX
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || isFast) return;

    // 1. Combat Log events
    const log = r.combatLog.value;
    if (log.length > lastCombatEventCount.current) {
      const newEntries = log.slice(lastCombatEventCount.current);
      for (const entry of newEntries) {
        const ev = entry.event;
        if (ev.type === 'hit') {
          if (ev.crit) engine.playCrit();
          else engine.playHit();
        } else if (ev.type === 'dodge') {
          engine.playDodge();
        } else if (ev.type === 'god') {
          if (ev.action === 'smite') engine.playSmite();
          else if (ev.action === 'blessing') engine.playBlessing();
        }
      }
    }
    lastCombatEventCount.current = log.length;

    // 2. World / Level events
    if (s && s.world.nextEventSeq > lastWorldSeq.current) {
      const latest = s.world.diary.at(-1);
      if (latest && latest.seq >= lastWorldSeq.current) {
        if (latest.type === 'level') engine.playLevelUp();
      }
      lastWorldSeq.current = s.world.nextEventSeq;
    }
  }, [r.combatLog.value.length, s?.world.nextEventSeq, isFast]);
}

export function GameView({ runtime: r }: { runtime: GameRuntime }) {
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const [compact, setCompact] = useState(false);
  const s = r.canonicalSession.value;
  const profile = r.profile.value;
  useMusic(profile.calmMusic, r, s);
  const disabled = pending || r.loading.value || r.catchingUp.value || r.status.value !== 'ready';
  const act: Act = async action => {
    if (disabled) return;
    setPending(true);
    try {
      const result = await r.userAction(action);
      setMessage(result ? result.ok ? t.t('ui.actionAccepted') : t.t(`reject.${result.reason}`) : t.t('ui.actionUnavailable'));
    } catch (error) { setMessage(t.t('ui.actionFailed', { error: String(error) })); }
    finally { setPending(false); }
  };

  if (!r.loading.value && !r.started.value) {
    return <StartScreen runtime={r} />;
  }
  const items = { act, disabled, compact };

  return <main class="ledger">
    {s && <TopBar session={s} runtime={r} />}
    <ControlRow runtime={r} compact={compact} onCompact={setCompact} />
    {r.status.value === 'readonly' && <aside class="notice" role="status">{t.t('ui.readonly')} <button onClick={() => location.reload()}>{t.t('ui.reload')}</button></aside>}
    {r.errors.value.length > 0 && <aside class="notice error" role="alert"><strong>{t.t('ui.error')}</strong><ul>{r.errors.value.map(error => <li key={error}>{error}</li>)}</ul><p>{t.t('ui.errorAdvice')}</p><button onClick={() => location.reload()}>{t.t('ui.reload')}</button></aside>}
    {(r.loading.value || r.catchingUp.value) && <aside class="notice" role="status" aria-live="polite"><strong>{t.t(r.catchingUp.value ? 'ui.catchingUp' : 'ui.loading')}</strong><progress max={Math.max(1, r.progress.value.totalMs)} value={r.progress.value.completedMs} /><p>{t.t('ui.progress', { done: t.number(r.progress.value.completedMs / 1000, { maximumFractionDigits: 0 }), total: t.number(r.progress.value.totalMs / 1000, { maximumFractionDigits: 0 }) })}</p></aside>}
    {s && <div class="game-columns" aria-busy={r.catchingUp.value}>
      <div class="column" id="hero"><HeroCard session={s} profile={profile} /><StatusCard session={s} /><StatsCard session={s} /></div>
      <div class="column" id="live"><SceneCard session={s} runtime={r} /><FocusCard session={s} runtime={r} /><DiaryCard session={s} runtime={r} /></div>
      <div class="column" id="god"><GodPanel session={s} godName={profile.godName} act={act} disabled={disabled} /><p class="action-result" role="status" aria-live="polite">{message}</p><EquipmentCard session={s} {...items} /><BagCard session={s} {...items} onCompact={setCompact} /><RoadMapCard session={s} /></div>
    </div>}
    <footer>{t.t('ui.footer')}</footer>
  </main>;
}
