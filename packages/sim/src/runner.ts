/** Bounded headless fight runner. */

import { cloneFight, stepInPlace, type FightEvent, type FightOutcome, type FightState } from './fight.ts';

/** Implementation policy: 6000 ticks = 10 minutes of game time. */
export const DEFAULT_MAX_TICKS = 6000;

/** `unresolved`: the tick budget ran out first (stalemate or a very long fight). */
export type RunOutcome = FightOutcome | 'unresolved';

export interface RunOptions {
  /** Maximum ticks to simulate from the given state. */
  maxTicks?: number;
  /** Collect the event transcript (default true). Forecasts turn it off. */
  collectEvents?: boolean;
}

export interface RunResult {
  state: FightState;
  events: FightEvent[];
  outcome: RunOutcome;
  ticks: number;
}

export function runFight(state: FightState, options: RunOptions = {}): RunResult {
  const maxTicks = options.maxTicks ?? DEFAULT_MAX_TICKS;
  if (!Number.isSafeInteger(maxTicks) || maxTicks < 0) {
    throw new RangeError(`maxTicks must be a non-negative safe integer, got ${String(maxTicks)}`);
  }
  const s = cloneFight(state);
  const events: FightEvent[] = [];
  const sink = options.collectEvents === false ? null : events;
  let ticks = 0;
  while (s.outcome === null && ticks < maxTicks) {
    stepInPlace(s, sink);
    ticks += 1;
  }
  return { state: s, events, outcome: s.outcome ?? 'unresolved', ticks };
}
