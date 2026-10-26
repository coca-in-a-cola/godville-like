/**
 * Renders typed fight events into localized log lines. Events stay the
 * source of truth; switching language re-renders the same history.
 */

import { TICK_MS, type FightEvent, type FightOutcome, type Side } from '@godville/sim';
import type { Translator } from './i18n.ts';

/** GDD colors: dealt white, taken red, heals green, dodge grey, crit yellow, god violet. */
export type LogTone = 'dealt' | 'taken' | 'heal' | 'dodge' | 'crit' | 'god' | 'death' | 'outcome';

export interface LogLine {
  time: string;
  actor: string;
  text: string;
  tone: LogTone;
}

export interface LogNames {
  hero: string;
  monster: string;
}

export function formatGameTime(t: Translator, gameMs: number): string {
  const totalTenths = Math.floor(gameMs / 100);
  const minutes = Math.floor(totalTenths / 600);
  const seconds = (totalTenths % 600) / 10;
  return t.t('log.time', {
    minutes: t.number(minutes, { minimumIntegerDigits: 2 }),
    seconds: t.number(seconds, { minimumIntegerDigits: 2, minimumFractionDigits: 1, maximumFractionDigits: 1 }),
  });
}

function nameOf(names: LogNames, side: Side): string {
  return side === 'hero' ? names.hero : names.monster;
}

/** Returns null for events that are folded into neighbouring lines (counter triggers, the end marker). */
export function formatEvent(t: Translator, names: LogNames, event: FightEvent): LogLine | null {
  const time = formatGameTime(t, event.tick * TICK_MS);
  switch (event.type) {
    case 'hit':
      return {
        time,
        actor: t.t('log.arrow', { attacker: nameOf(names, event.attacker), defender: nameOf(names, event.defender) }),
        text: t.t('log.hit', {
          counter: event.counter ? 'yes' : 'no',
          crit: event.crit ? 'yes' : 'no',
          dealt: event.dealt,
          blocked: event.blocked,
        }),
        tone: event.crit ? 'crit' : event.defender === 'hero' ? 'taken' : 'dealt',
      };
    case 'dodge':
      return {
        time,
        actor: t.t('log.arrow', { attacker: nameOf(names, event.attacker), defender: nameOf(names, event.defender) }),
        text: t.t('log.dodge', { counter: event.counter ? 'yes' : 'no' }),
        tone: 'dodge',
      };
    case 'heal':
      return { time, actor: nameOf(names, event.side), text: t.t('log.vampirism', { amount: t.hp(event.amount) }), tone: 'heal' };
    case 'god':
      return {
        time,
        actor: t.t('side.god'),
        text: t.t(event.action === 'blessing' ? 'log.blessing' : 'log.smite', { amount: t.hp(event.amount) }),
        tone: 'god',
      };
    case 'death':
      return { time, actor: '', text: t.t('log.death', { name: nameOf(names, event.side) }), tone: 'death' };
    case 'counter':
    case 'end':
      return null;
  }
}

export interface FightSummary {
  hits: number;
  crits: number;
  dodges: number;
  counters: number;
}

export function summarize(events: readonly FightEvent[]): FightSummary {
  const summary: FightSummary = { hits: 0, crits: 0, dodges: 0, counters: 0 };
  for (const e of events) {
    if (e.type === 'hit') {
      summary.hits += 1;
      if (e.crit) summary.crits += 1;
    } else if (e.type === 'dodge') summary.dodges += 1;
    else if (e.type === 'counter') summary.counters += 1;
  }
  return summary;
}

export function outcomeText(t: Translator, names: LogNames, outcome: FightOutcome): string {
  return t.t(`outcome.${outcome}`, { monster: names.monster });
}
