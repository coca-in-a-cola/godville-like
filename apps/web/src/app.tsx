import type { Signal } from '@preact/signals';
import {
  ATTACK_SPEED_CAP_BP,
  BAR_FULL,
  BLESSING_HEAL_PERCENT,
  COUNTER_CAP_BP,
  CRIT_CAP_BP,
  EVASION_CAP_BP,
  GP_REGEN_INTERVAL_MS,
  INTERVENTION_COST,
  SMITE_DAMAGE_PERCENT,
  STAT_KEYS,
  TICK_MS,
  VAMPIRISM_CAP_BP,
  type CombatantState,
  type InterventionKind,
  type StatKey,
} from '@godville/sim';
import { useEffect, useRef } from 'preact/hooks';
import { gameData, translator as t } from './gameData.ts';
import { formatEvent, formatGameTime, outcomeText, summarize, type LogNames } from './logFormat.ts';
import {
  estimate,
  events,
  fight,
  forecast,
  god,
  gpDraft,
  gpParsed,
  heroDraft,
  heroParsed,
  intervene,
  monsterDraft,
  monsterId,
  monsterName,
  monsterParsed,
  pageVisible,
  rejection,
  resetFight,
  running,
  seedDraft,
  seedParsed,
  setupDirty,
  setupValid,
  speed,
  toggleRunning,
} from './sandbox.ts';
import type { DraftResult, StatDraft } from './statForm.ts';

const CAPS_BP: Partial<Record<StatKey, number>> = {
  attackSpeed: ATTACK_SPEED_CAP_BP,
  crit: CRIT_CAP_BP,
  evasion: EVASION_CAP_BP,
  vampirism: VAMPIRISM_CAP_BP,
  counter: COUNTER_CAP_BP,
};

/** Rendering the whole log is cheap for one fight, but keep the DOM bounded. */
const LOG_LIMIT = 400;

function names(): LogNames {
  return { hero: t.t('side.hero'), monster: monsterName.value };
}

function StatEditor({ title, draft, parsed }: { title: string; draft: Signal<StatDraft>; parsed: DraftResult }) {
  return (
    <fieldset class="stats">
      <legend>{title}</legend>
      {STAT_KEYS.map((key) => {
        const error = parsed.errors[key];
        const cap = CAPS_BP[key];
        return (
          <label key={key} class={error ? 'stat invalid' : 'stat'}>
            <span class="stat-name">{t.t(`stat.${key}`)}</span>
            <input
              type="text"
              inputMode="decimal"
              value={draft.value[key]}
              onInput={(e) => {
                draft.value = { ...draft.value, [key]: e.currentTarget.value };
              }}
            />
            <span class="stat-note">
              {error ? t.t(`error.${error}`) : cap !== undefined ? t.t('stat.cap', { cap: cap / 100 }) : ''}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

function Setup() {
  const seedOk = seedParsed.value !== null;
  const gpOk = gpParsed.value !== null;
  return (
    <section class="panel setup">
      <h2>{t.t('setup.title')}</h2>
      <div class="setup-row">
        <label class={seedOk ? 'field' : 'field invalid'}>
          <span>{t.t('setup.seed')}</span>
          <input type="text" inputMode="numeric" value={seedDraft.value} onInput={(e) => (seedDraft.value = e.currentTarget.value)} />
          {!seedOk && <span class="stat-note">{t.t('error.seed')}</span>}
        </label>
        <label class="field">
          <span>{t.t('setup.monsterName')}</span>
          <select value={monsterId.value} onChange={(e) => (monsterId.value = e.currentTarget.value)}>
            {gameData.monsters.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name_en}
              </option>
            ))}
          </select>
        </label>
        <label class={gpOk ? 'field' : 'field invalid'}>
          <span>{t.t('setup.gp')}</span>
          <input type="text" inputMode="numeric" value={gpDraft.value} onInput={(e) => (gpDraft.value = e.currentTarget.value)} />
          {!gpOk && <span class="stat-note">{t.t('error.gp', { max: god.value.gpMax })}</span>}
        </label>
      </div>
      <div class="editors">
        <StatEditor title={t.t('side.hero')} draft={heroDraft} parsed={heroParsed.value} />
        <StatEditor title={monsterName.value} draft={monsterDraft} parsed={monsterParsed.value} />
      </div>
      {!setupValid.value ? (
        <p class="notice invalid">{t.t('error.fixFirst')}</p>
      ) : setupDirty.value ? (
        <p class="notice">{t.t('setup.dirty')}</p>
      ) : null}
    </section>
  );
}

function Combatant({ label, c, side }: { label: string; c: CombatantState; side: 'hero' | 'monster' }) {
  const hpPct = (c.hp / c.stats.maxHp) * 100;
  const barPct = Math.min(1, c.bar / BAR_FULL) * 100;
  return (
    <div class={`combatant ${side}`}>
      <div class="combatant-name">{label}</div>
      <div class="bar hp" role="meter" aria-valuenow={c.hp} aria-valuemin={0} aria-valuemax={c.stats.maxHp}>
        <div class="fill" style={{ width: `${hpPct}%` }} />
        <span class="bar-text">{t.t('hp.value', { hp: t.hp(c.hp), max: t.hp(c.stats.maxHp) })}</span>
      </div>
      <div class="bar attack" title={t.t('bar.attack')}>
        <div class="fill" style={{ width: `${barPct}%` }} />
      </div>
    </div>
  );
}

function Controls() {
  const over = fight.value.outcome !== null;
  const status = over ? 'status.over' : running.value ? 'status.running' : fight.value.tick > 0 ? 'status.paused' : 'status.ready';
  return (
    <div class="controls">
      <button type="button" onClick={() => resetFight()} disabled={!setupValid.value}>
        {t.t('button.reset')}
      </button>
      <button type="button" onClick={toggleRunning} disabled={over}>
        {running.value ? t.t('button.pause') : t.t('button.start')}
      </button>
      <span class="speed" role="group" aria-label={t.t('speed.label')}>
        {t.t('speed.label')}:
        {(['watched', 'unwatched'] as const).map((s) => (
          <button key={s} type="button" class={speed.value === s ? 'active' : ''} aria-pressed={speed.value === s} onClick={() => (speed.value = s)}>
            {t.t(`speed.${s}`)}
          </button>
        ))}
      </span>
      <span class="status">
        {t.t(status)} · {t.t('status.time', { time: formatGameTime(t, fight.value.tick * TICK_MS) })}
      </span>
    </div>
  );
}

function GodPanel() {
  const g = god.value;
  const f = fight.value;
  const minutesLeft = Math.ceil((GP_REGEN_INTERVAL_MS - g.regenCarryMs) / 60000);
  const button = (kind: InterventionKind, hint: string) => (
    <div class="intervention">
      <button
        type="button"
        class="god-action"
        disabled={f.outcome !== null || g.gp < INTERVENTION_COST[kind]}
        onClick={() => intervene(kind)}
      >
        {t.t(`button.${kind}`, { cost: INTERVENTION_COST[kind] })}
      </button>
      <span class="hint">{hint}</span>
    </div>
  );
  return (
    <section class="panel god">
      <h2>{t.t('god.title')}</h2>
      <div class="bar gp">
        <div class="fill" style={{ width: `${(g.gp / g.gpMax) * 100}%` }} />
        <span class="bar-text">{t.t('god.gp', { gp: g.gp, max: g.gpMax })}</span>
      </div>
      <p class="hint">{g.gp >= g.gpMax ? t.t('god.full') : t.t('god.nextGp', { minutes: minutesLeft })}</p>
      {button('blessing', t.t('god.blessingHint', { percent: BLESSING_HEAL_PERCENT }))}
      {button('smite', t.t('god.smiteHint', { percent: SMITE_DAMAGE_PERCENT }))}
      {f.queue.length > 0 && <p class="hint god-text">{t.t('god.queued', { count: f.queue.length })}</p>}
      {rejection.value && <p class="notice invalid">{t.t(`reject.${rejection.value}`)}</p>}
    </section>
  );
}

function seconds(value: number): string {
  return Number.isFinite(value) ? t.t('estimate.seconds', { value: t.number(value, { maximumFractionDigits: 1 }) }) : t.t('estimate.never');
}

function Forecast() {
  const f = fight.value;
  const current = forecast.value;
  const est = estimate.value;
  let body;
  if (f.outcome !== null) body = <p>{t.t('forecast.over')}</p>;
  else if (!pageVisible.value) body = <p>{t.t('forecast.hidden')}</p>;
  else if (current === null) body = <p>{t.t('forecast.pending')}</p>;
  else {
    const r = current.result;
    body = (
      <>
        <p class="forecast-win">{t.t('forecast.win', { percent: t.number(r.heroWinBp / 10000, { style: 'percent' }) })}</p>
        <p class="hint">{t.t('forecast.detail', { trials: r.trials, tick: current.tick, draws: r.draws, unresolved: r.unresolved })}</p>
      </>
    );
  }
  return (
    <section class="panel forecast">
      <h2>{t.t('forecast.title')}</h2>
      {body}
      <p class="hint">{t.t('estimate.line', { heroTtk: seconds(est.heroTtk), monsterTtk: seconds(est.monsterTtk) })}</p>
    </section>
  );
}

function CombatLog() {
  const list = events.value;
  const n = names();
  const ref = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [list.length]);
  const lines = list.slice(-LOG_LIMIT).flatMap((event, i) => {
    const line = formatEvent(t, n, event);
    return line ? [{ ...line, key: list.length - Math.min(list.length, LOG_LIMIT) + i }] : [];
  });
  const outcome = fight.value.outcome;
  const summary = summarize(list);
  return (
    <section class="panel log">
      <h2>{t.t('log.title')}</h2>
      <ol class="log-lines" ref={ref}>
        {lines.length === 0 && <li class="hint">{t.t('log.empty')}</li>}
        {lines.map((line) => (
          <li key={line.key} class={`tone-${line.tone}`}>
            <span class="log-time">{line.time}</span>
            <span class="log-actor">{line.actor}</span>
            <span class="log-text">{line.text}</span>
          </li>
        ))}
      </ol>
      {outcome !== null && (
        <div class={`outcome outcome-${outcome}`}>
          <strong>{outcomeText(t, n, outcome)}</strong>
          <p class="hint">
            {t.t('outcome.summary', {
              seconds: t.number((fight.value.tick * TICK_MS) / 1000, { maximumFractionDigits: 1 }),
              ...summary,
            })}
          </p>
        </div>
      )}
    </section>
  );
}

export function App() {
  return (
    <main class="app">
      <header>
        <h1>{t.t('app.title')}</h1>
        <p class="hint">{t.t('app.subtitle')}</p>
      </header>
      <section class="panel arena">
        <Controls />
        <div class="combatants">
          <Combatant label={t.t('side.hero')} c={fight.value.hero} side="hero" />
          <Combatant label={monsterName.value} c={fight.value.monster} side="monster" />
        </div>
      </section>
      <div class="columns">
        <CombatLog />
        <div class="side">
          <Forecast />
          <GodPanel />
        </div>
      </div>
      <Setup />
    </main>
  );
}
