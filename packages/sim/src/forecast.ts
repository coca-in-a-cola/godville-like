/**
 * The god's Monte Carlo win forecast. Each trial runs the real combat engine
 * from a clone of the current fight state with its own derived seed, so the
 * live state and live RNG are never read for randomness or modified.
 *
 * Policies (implementation choices, see docs/IMPLEMENTATION_NOTES.md):
 * - interventions already queued (and paid for) stay in the clone; no
 *   hypothetical player actions are added;
 * - each trial is bounded by `maxTicks` and counted as `unresolved` if the
 *   budget runs out;
 * - a fight that is already over reports its outcome for every trial
 *   without simulating.
 */

import { cloneFight, type FightOutcome, type FightState } from './fight.ts';
import { isUint32, mixSeed, seedRng } from './rng.ts';
import { DEFAULT_MAX_TICKS, runFight } from './runner.ts';

export const FORECAST_TRIALS = 200;
const FORECAST_SALT = 0x464f5243; // "FORC"

export interface ForecastOptions {
  /** Explicit forecast seed; trial i uses mixSeed(seed, i). */
  seed: number;
  trials?: number;
  maxTicks?: number;
}

export interface ForecastResult {
  seed: number;
  trials: number;
  maxTicks: number;
  heroWins: number;
  monsterWins: number;
  draws: number;
  unresolved: number;
  /** floor(heroWins * 10000 / trials). */
  heroWinBp: number;
  /** Set when the input fight was already over and nothing was simulated. */
  terminal: FightOutcome | null;
}

/** Forecast seed for a live fight at a given tick, independent of the live RNG. */
export function deriveForecastSeed(fightSeed: number, tick: number): number {
  return mixSeed((fightSeed ^ FORECAST_SALT) >>> 0, tick >>> 0);
}

export function trialSeed(forecastSeed: number, trial: number): number {
  return mixSeed(forecastSeed, trial);
}

export function forecastFight(state: FightState, options: ForecastOptions): ForecastResult {
  const trials = options.trials ?? FORECAST_TRIALS;
  const maxTicks = options.maxTicks ?? DEFAULT_MAX_TICKS;
  if (!isUint32(options.seed)) throw new RangeError(`forecast seed must be a uint32`);
  if (!Number.isSafeInteger(trials) || trials < 1) throw new RangeError(`trials must be a positive integer`);

  if (!Number.isSafeInteger(maxTicks) || maxTicks < 0) {
    throw new RangeError(`maxTicks must be a non-negative safe integer, got ${String(maxTicks)}`);
  }
  const counts = { hero_won: 0, monster_won: 0, draw: 0, unresolved: 0 };
  if (state.outcome !== null) {
    counts[state.outcome] = trials;
  } else {
    for (let i = 0; i < trials; i++) {
      const trial = cloneFight(state);
      trial.rng = seedRng(trialSeed(options.seed, i));
      counts[runFight(trial, { maxTicks, collectEvents: false }).outcome] += 1;
    }
  }
  return {
    seed: options.seed,
    trials,
    maxTicks,
    heroWins: counts.hero_won,
    monsterWins: counts.monster_won,
    draws: counts.draw,
    unresolved: counts.unresolved,
    heroWinBp: Math.floor((counts.hero_won * 10000) / trials),
    terminal: state.outcome,
  };
}
