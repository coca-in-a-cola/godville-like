import { useEffect, useRef } from 'preact/hooks';
import { BAR_FULL, type SessionState } from '@godville/sim';
import { translator as t } from '../gameData.ts';
import type { GameRuntime } from '../gameRuntime.ts';
import { formatEvent, formatGameTime } from '../logFormat.ts';
import { contentName, diaryLines } from '../viewFormat.ts';
import { Meter } from './HeroPanel.tsx';
export function LivePanel({ session: s, runtime: r }: { session: SessionState; runtime: GameRuntime }) {
  const combat = s.world.combat;
  const ref = useRef<HTMLOListElement>(null);
  const follow = useRef(true);
  const history = diaryLines(s);
  const log = r.combatLog.value;
  const newest = combat ? `${combat.monster.id}:${log.length}:${combat.fight.tick}` : history.at(-1)?.id;
  useEffect(() => { if (follow.current && ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [newest]);
  const enemy = combat ? contentName('monsters', combat.monster.contentId) : t.t('ui.opponent');
  const forecast = r.forecast.value;
  return <section class="sheet live-sheet"><p class="eyebrow">{t.t('ui.liveAccount')}</p><h2>{t.t(combat ? 'ui.liveCombat' : 'ui.diary')}</h2><p class="hint">{t.t(`phase.${s.world.phase}`)} · {formatGameTime(t, s.world.elapsedMs)}</p>
    {combat && <><div class="duel">{([['hero', t.t('ui.heroName'), combat.fight.hero], ['monster', enemy, combat.fight.monster]] as const).map(([side, name, fighter]) => <div class={`duelist ${side}`} key={side}><h3>{name}</h3><Meter label={t.t('ui.hp')} value={fighter.hp} max={fighter.stats.maxHp} kind="health" text={t.t('hp.value', { hp: t.hp(fighter.hp), max: t.hp(fighter.stats.maxHp) })} /><Meter label={t.t('bar.attack')} value={fighter.bar} max={BAR_FULL} kind="attack-meter" text={t.t('bar.attack')} /></div>)}</div><div class="forecast-ledger"><h3>{t.t('forecast.title')}</h3>{forecast && forecast.fightId === combat.monster.id ? <><strong class="win-chance">{t.t('forecast.win', { percent: t.number(forecast.result.heroWinBp / 10000, { style: 'percent' }) })}</strong><p class="hint">{t.t('forecast.detail', { trials: forecast.result.trials, tick: forecast.tick, draws: forecast.result.draws, unresolved: forecast.result.unresolved })}</p></> : <p class="hint">{t.t('forecast.pending')}</p>}</div></>}
    <ol class="ledger-log" ref={ref} onScroll={event => { const el = event.currentTarget; follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48; }} aria-label={t.t(combat ? 'log.title' : 'ui.diary')}>
      {combat ? log.flatMap((entry, index) => { const line = formatEvent(t, { hero: t.t('ui.heroName'), monster: enemy }, entry.event); return line ? [<li key={`${entry.fightId}:${index}`} class={`tone-${line.tone}`}><time>{line.time}</time><span class="log-actor">{line.actor}</span><span>{line.text}</span></li>] : []; }) : history.map(line => <li class={line.divine ? 'tone-god' : ''} key={line.id}><time>{formatGameTime(t, line.time)}</time><span>{line.text}</span></li>)}
      {(combat ? log.length === 0 : history.length === 0) && <li class="hint">{t.t('ui.waiting')}</li>}
    </ol>
    {combat && <details class="diary-drawer"><summary>{t.t('ui.diary')}</summary><ol class="diary-history">{history.slice(-20).map(line => <li key={line.id}>{line.text}</li>)}</ol></details>}
    <p class="hint reading-note">{t.t('ui.logHint')}</p>
  </section>;
}
