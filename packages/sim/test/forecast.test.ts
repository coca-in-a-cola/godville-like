import { describe, expect, it } from 'vitest';
import {
  FORECAST_TRIALS,
  HERO_BASE_STATS,
  advanceFight,
  createFight,
  deriveForecastSeed,
  estimateDuel,
  forecastFight,
  meanDealt,
  runFight,
  trialSeed,
  type FightState,
} from '../src/index.ts';
import { ZONE1_MONSTER, deepFreeze, fightOf } from './fixtures.ts';

const sandboxFight = (): FightState => createFight({ seed: 20261026, hero: HERO_BASE_STATS, monster: ZONE1_MONSTER });

describe('Monte Carlo forecast', () => {
  it('is deterministic for an explicit forecast seed', () => {
    const state = sandboxFight();
    const a = forecastFight(state, { seed: 1234 });
    const b = forecastFight(state, { seed: 1234 });
    expect(b).toEqual(a);
    expect(a.trials).toBe(FORECAST_TRIALS);
    expect(a.heroWins + a.monsterWins + a.draws + a.unresolved).toBe(200);
    expect(a).toMatchInlineSnapshot(`
      {
        "draws": 0,
        "heroWinBp": 1450,
        "heroWins": 29,
        "maxTicks": 6000,
        "monsterWins": 171,
        "seed": 1234,
        "terminal": null,
        "trials": 200,
        "unresolved": 0,
      }
    `);
  });

  it('never consumes or mutates the live state or RNG', () => {
    const live = deepFreeze(advanceFight(sandboxFight(), 5_000).state);
    const before = JSON.stringify(live);
    forecastFight(live, { seed: deriveForecastSeed(live.seed, live.tick) });
    expect(JSON.stringify(live)).toBe(before);
    const withForecast = advanceFight(live, 60_000);
    const control = advanceFight(JSON.parse(before) as FightState, 60_000);
    expect(withForecast).toEqual(control);
  });

  it('uses independent per-trial seeds derived from the forecast seed', () => {
    const seeds = new Set(Array.from({ length: 200 }, (_, i) => trialSeed(77, i)));
    expect(seeds.size).toBe(200);
    expect(deriveForecastSeed(5, 10)).not.toBe(deriveForecastSeed(5, 11));
    expect(deriveForecastSeed(5, 10)).not.toBe(deriveForecastSeed(6, 10));
  });

  it('reports one-sided matchups as 100% and 0%', () => {
    const strong = fightOf({ maxHp: 1000, damageMin: 50, damageMax: 60 }, { damageMin: 1, damageMax: 2 });
    expect(forecastFight(strong, { seed: 1 })).toMatchObject({ heroWins: 200, heroWinBp: 10000 });
    const weak = fightOf({ damageMin: 1, damageMax: 2 }, { maxHp: 1000, damageMin: 50, damageMax: 60 });
    expect(forecastFight(weak, { seed: 1 })).toMatchObject({ monsterWins: 200, heroWinBp: 0 });
  });

  it('classifies a finished fight without simulating', () => {
    const done = runFight(fightOf({ damageMin: 1000, damageMax: 1000 }, { maxHp: 1 })).state;
    expect(done.outcome).toBe('hero_won');
    expect(forecastFight(done, { seed: 3 })).toEqual({
      seed: 3,
      trials: 200,
      maxTicks: 6000,
      heroWins: 200,
      monsterWins: 0,
      draws: 0,
      unresolved: 0,
      heroWinBp: 10000,
      terminal: 'hero_won',
    });
  });

  it('bounds a stalemate and reports it as unresolved', () => {
    const stalemate = fightOf({}, {});
    const result = forecastFight(stalemate, { seed: 9, maxTicks: 300 });
    expect(result).toMatchObject({ unresolved: 200, heroWins: 0, monsterWins: 0, draws: 0, heroWinBp: 0, terminal: null });
    expect(runFight(stalemate, { maxTicks: 300 })).toMatchObject({ outcome: 'unresolved', ticks: 300 });
  });

  it('counts draws', () => {
    const result = forecastFight(fightOf({ maxHp: 1, regen: -10 }, { maxHp: 1, regen: -10 }), { seed: 2, trials: 10 });
    expect(result).toMatchObject({ draws: 10, trials: 10, heroWinBp: 0 });
  });
});

describe("hero's EDPS / TTK estimate", () => {
  it('matches the GDD formula for the sandbox matchup', () => {
    const { hero, monster } = sandboxFight();
    // Monster normalizes to 58 HP, damage 5-8, +25% speed, defense 1.
    expect(meanDealt(4, 6, 1)).toBe(4);
    const e = estimateDuel(hero, monster);
    expect(e.heroEdps).toBeCloseTo(4 / 1.5, 10);
    expect(e.monsterEdps).toBeCloseTo((1.25 / 1.5) * 6.5, 10);
    expect(e.heroTtk).toBeCloseTo(58 / (4 / 1.5), 10);
    expect(e.monsterTtk).toBeCloseTo(100 / ((1.25 / 1.5) * 6.5 - 0.5), 10);
    expect(e.verdict).toBe('monster');
  });

  it('applies evasion, crit and the defense floor', () => {
    const { hero, monster } = fightOf({ damageMin: 10, damageMax: 10, crit: 50, attackSpeed: 50 }, { evasion: 20, defense: 9 });
    // mean dealt = max(2, 1) = 2; (1.5 / 1.5) * 0.8 * 2 * 1.5 = 2.4
    expect(estimateDuel(hero, monster).heroEdps).toBeCloseTo(2.4, 10);
  });

  it('returns Infinity instead of dividing by zero or a negative rate', () => {
    const zero = fightOf({}, {});
    expect(estimateDuel(zero.hero, zero.monster)).toMatchObject({
      heroEdps: 0,
      heroTtk: Number.POSITIVE_INFINITY,
      monsterTtk: Number.POSITIVE_INFINITY,
      verdict: 'stalemate',
    });
    const outhealed = fightOf({ damageMin: 1, damageMax: 1 }, { regen: 50 });
    expect(estimateDuel(outhealed.hero, outhealed.monster).heroTtk).toBe(Number.POSITIVE_INFINITY);
  });
});
