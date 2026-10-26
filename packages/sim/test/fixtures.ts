import { createFight, runFight, type FightEvent, type FightState, type StatBlock } from '../src/index.ts';

/** A 100 HP dummy that does nothing: no damage, no regen, no chances. */
export const DUMMY: StatBlock = Object.freeze({
  maxHp: 100,
  damageMin: 0,
  damageMax: 0,
  attackSpeed: 0,
  defense: 0,
  crit: 0,
  evasion: 0,
  regen: 0,
  vampirism: 0,
  counter: 0,
});

export function stats(overrides: Partial<StatBlock>): StatBlock {
  return { ...DUMMY, ...overrides };
}

/** The sandbox's default monster (GDD zone-1 formulas, 1.2 s interval). */
export const ZONE1_MONSTER: StatBlock = Object.freeze({
  ...DUMMY,
  maxHp: 58,
  damageMin: 4.5,
  damageMax: 7.5,
  attackSpeed: 25,
  defense: 0.6,
});

export function fightOf(hero: Partial<StatBlock>, monster: Partial<StatBlock>, seed = 1): FightState {
  return createFight({ seed, hero: stats(hero), monster: stats(monster) });
}

export function runEvents(state: FightState, maxTicks: number): { state: FightState; events: FightEvent[] } {
  const result = runFight(state, { maxTicks });
  return { state: result.state, events: result.events };
}

export function ticksOf(events: readonly FightEvent[], predicate: (e: FightEvent) => boolean): number[] {
  return events.filter(predicate).map((e) => e.tick);
}

export function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export function roundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
