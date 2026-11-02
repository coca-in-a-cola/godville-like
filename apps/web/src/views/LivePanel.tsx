import { useEffect, useRef, useState } from 'preact/hooks';
import { BAR_FULL, type SessionState } from '@godville/sim';
import { translator as t } from '../gameData.ts';
import type { GameRuntime } from '../gameRuntime.ts';
import { formatEvent, formatGameTime } from '../logFormat.ts';
import { contentName, diaryLines, n, questName, questNarrative } from '../viewFormat.ts';
import { Meter } from './HeroPanel.tsx';

/** Keeps a scrolling list pinned to the newest entry unless the reader has scrolled up. */
function useFollow(newest: unknown) {
  const ref = useRef<HTMLOListElement>(null);
  const follow = useRef(true);
  useEffect(() => { if (follow.current && ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [newest]);
  const onScroll = (event: Event) => { const el = event.currentTarget as HTMLElement; follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48; };
  return { ref, onScroll };
}

export function FocusCard({ session: s, runtime: r }: { session: SessionState; runtime: GameRuntime }) {
  const combat = s.world.combat;
  const log = r.combatLog.value;
  const { ref, onScroll } = useFollow(combat ? `${combat.monster.id}:${log.length}` : null);
  const heroName = r.profile.value.heroName;
  if (!combat) {
    const q = s.world.hero.quest, tuning = s.world.tuning;
    return <section class="card focus-card"><h2 class="card-title">{t.t('ui.activeQuest')}</h2>
      {q ? <><h3 class="quest-name">{questName(q.id)}</h3><p class="narrative">{questNarrative(q.id)}</p>
        <Meter label={t.t('ui.quest')} value={q.progress} max={100} text={t.t('ui.questMeter', { value: n(q.progress) })} kind="quest" />
        <p class="hint num">{t.t('ui.questReward', { gold: n(tuning.questGold * q.level), xp: n(tuning.questXp * q.level), faith: n(tuning.questFaith) })}</p></>
        : <p class="narrative">{t.t('ui.noQuest')}</p>}
    </section>;
  }
  const enemy = contentName('monsters', combat.monster.contentId);
  const forecast = r.forecast.value;
  return <section class="card focus-card combat"><h2 class="card-title">{t.t('ui.activeCombat')}</h2>
    <div class="duel">{([['hero', heroName, combat.fight.hero], ['monster', enemy, combat.fight.monster]] as const).map(([side, name, fighter]) => <div class={`duelist ${side}`} key={side}><h3>{name}</h3><Meter label={t.t('ui.hp')} value={fighter.hp} max={fighter.stats.maxHp} kind="health" text={t.t('hp.value', { hp: t.hp(fighter.hp), max: t.hp(fighter.stats.maxHp) })} /><Meter label={t.t('bar.attack')} value={fighter.bar} max={BAR_FULL} kind="attack-meter" text={t.t('bar.attack')} /></div>)}</div>
    <div class="forecast-ledger"><span class="eyebrow">{t.t('forecast.title')}</span> {forecast && forecast.fightId === combat.monster.id ? <><strong class="win-chance num">{t.t('forecast.win', { percent: t.number(forecast.result.heroWinBp / 10000, { style: 'percent' }) })}</strong><p class="hint">{t.t('forecast.detail', { trials: forecast.result.trials, tick: forecast.tick, draws: forecast.result.draws, unresolved: forecast.result.unresolved })}</p></> : <span class="hint">{t.t('forecast.pending')}</span>}</div>
    <ol class="ledger-log combat-log" ref={ref} onScroll={onScroll} aria-label={t.t('log.title')}>
      {log.flatMap((entry, index) => { const line = formatEvent(t, { hero: heroName, monster: enemy }, entry.event); return line ? [<li key={`${entry.fightId}:${index}`} class={`tone-${line.tone}`}><time>{line.time}</time> <span class="log-actor">{line.actor}</span> <span>{line.text}</span></li>] : []; })}
      {log.length === 0 && <li class="hint">{t.t('ui.waiting')}</li>}
    </ol>
  </section>;
}

export function DiaryCard({ session: s, runtime: r }: { session: SessionState; runtime?: GameRuntime }) {
  const history = diaryLines(s);
  const entries = [...history].reverse();
  const scrollRef = useRef<HTMLOListElement>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isScrolledDown, setIsScrolledDown] = useState(false);
  const lastTopId = useRef<string | null>(null);

  useEffect(() => {
    const currentTopId = entries[0]?.id ?? null;
    if (lastTopId.current !== null && currentTopId !== lastTopId.current) {
      if (isScrolledDown) {
        setUnreadCount((prev: number) => prev + 1);
      } else {
        setUnreadCount(0);
      }
    }
    lastTopId.current = currentTopId;
  }, [entries.length, entries[0]?.id, isScrolledDown]);

  const handleScroll = (event: Event) => {
    const el = event.currentTarget as HTMLElement;
    const atTop = el.scrollTop <= 15;
    setIsScrolledDown(!atTop);
    if (atTop) setUnreadCount(0);
  };

  const scrollToTop = () => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    setUnreadCount(0);
    setIsScrolledDown(false);
  };

  const combat = s.world.combat;
  const enemy = combat ? contentName('monsters', combat.monster.contentId) : null;
  const heroName = r ? r.profile.value.heroName : t.t('ui.heroTitle');

  return (
    <section class="card diary-card">
      <h2 class="card-title">{t.t('ui.diaryTitle')}</h2>
      
      {unreadCount > 0 && (
        <button type="button" class="diary-new-badge" onClick={scrollToTop}>
          {t.t('ui.newEntries', { count: unreadCount })}
        </button>
      )}

      {combat && enemy && (
        <details class="diary-combat-pinned" open>
          <summary class="combat-pinned-summary">
            <span class="combat-tag">{t.t('ui.activeCombat')}</span>
            <span class="serif">{t.t('ui.combatVs', { monster: enemy })}</span>
          </summary>
          <div class="combat-pinned-body">
            <div class="duel-mini">
              <Meter label={t.t('ui.hp')} value={combat.fight.hero.hp} max={combat.fight.hero.stats.maxHp} kind="health" text={t.t('hp.value', { hp: t.hp(combat.fight.hero.hp), max: t.hp(combat.fight.hero.stats.maxHp) })} />
              <Meter label={t.t('ui.hp')} value={combat.fight.monster.hp} max={combat.fight.monster.stats.maxHp} kind="health" text={t.t('hp.value', { hp: t.hp(combat.fight.monster.hp), max: t.hp(combat.fight.monster.stats.maxHp) })} />
            </div>
            {r && r.combatLog.value.length > 0 && (
              <ol class="combat-mini-log">
                {r.combatLog.value.slice(-4).map((entry, idx) => {
                  const line = formatEvent(t, { hero: heroName, monster: enemy }, entry.event);
                  return line ? <li key={idx} class={`tone-${line.tone}`}><time class="num">{line.time}</time> <span class="serif">{line.text}</span></li> : null;
                })}
              </ol>
            )}
          </div>
        </details>
      )}

      <ol class="ledger-log diary" ref={scrollRef} onScroll={handleScroll} aria-label={t.t('ui.diary')}>
        {entries.map(line => (
          <li class={`diary-item ${line.divine ? 'tone-god' : ''}`} key={line.id}>
            <div class="diary-meta">
              <time class="num">{formatGameTime(t, line.time)}</time>
              {line.data && <span class="diary-data num">{line.data}</span>}
            </div>
            <span class="serif diary-text">{line.text}</span>
          </li>
        ))}
        {entries.length === 0 && <li class="hint">{t.t('ui.waiting')}</li>}
      </ol>
      <p class="hint">{t.t('ui.logHint')}</p>
    </section>
  );
}
