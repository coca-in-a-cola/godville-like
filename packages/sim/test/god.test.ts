import { describe, expect, it } from 'vitest';
import {
  GP_REGEN_INTERVAL_MS,
  advanceFight,
  advanceGodpower,
  createGodState,
  createWorldClock,
  requestIntervention,
  scaleRealToGame,
  stepFight,
  type FightState,
  type GameSpeed,
  type GodState,
} from '../src/index.ts';
import { deepFreeze, fightOf } from './fixtures.ts';

function queue(fight: FightState, god: GodState, kind: 'blessing' | 'smite') {
  const r = requestIntervention(fight, god, kind);
  if (!r.ok) throw new Error(`${kind} rejected: ${r.reason}`);
  return r;
}

describe('godpower', () => {
  it('regenerates +1 GP per 6 real minutes with a carry, capped at 100', () => {
    const god = createGodState(50);
    const almost = advanceGodpower(god, GP_REGEN_INTERVAL_MS - 1);
    expect(almost).toEqual({ gp: 50, gpMax: 100, regenCarryMs: GP_REGEN_INTERVAL_MS - 1 });
    expect(advanceGodpower(almost, 1)).toEqual({ gp: 51, gpMax: 100, regenCarryMs: 0 });
    expect(advanceGodpower(god, 10 * 60 * 60 * 1000)).toEqual({ gp: 100, gpMax: 100, regenCarryMs: 0 });
    expect(advanceGodpower(createGodState(99), 3 * GP_REGEN_INTERVAL_MS + 5)).toEqual({ gp: 100, gpMax: 100, regenCarryMs: 0 });
    expect(() => advanceGodpower(god, -1)).toThrow(RangeError);
    expect(() => createGodState(101)).toThrow(RangeError);
  });

  it('depends on real time only, not on the world speed', () => {
    const simulate = (speed: GameSpeed) => {
      let god = createGodState(10);
      let clock = createWorldClock();
      let fight = fightOf({ maxHp: 100000 }, { maxHp: 100000 });
      for (let t = 0; t < 30 * 60 * 1000; t += 250) {
        god = advanceGodpower(god, 250);
        const scaled = scaleRealToGame(clock, 250, speed);
        clock = scaled.clock;
        fight = advanceFight(fight, scaled.gameMs).state;
      }
      return { god, ticks: fight.tick };
    };
    const watched = simulate('watched');
    const unwatched = simulate('unwatched');
    expect(watched.ticks).toBe(18000);
    expect(unwatched.ticks).toBe(1800);
    expect(watched.god).toEqual({ gp: 15, gpMax: 100, regenCarryMs: 0 });
    expect(unwatched.god).toEqual(watched.god);
  });
});

describe('interventions', () => {
  it('rejects unaffordable actions without touching either state', () => {
    const fight = deepFreeze(fightOf({}, {}));
    const god = deepFreeze(createGodState(24));
    expect(requestIntervention(fight, god, 'blessing')).toEqual({ ok: false, reason: 'insufficient_gp' });
    expect(requestIntervention(fight, god, 'smite')).toEqual({ ok: false, reason: 'insufficient_gp' });
    expect(god.gp).toBe(24);
    expect(fight.queue).toEqual([]);
  });

  it('charges 25 GP at queue time and applies at step 1 of the next tick, FIFO', () => {
    const fight = deepFreeze(fightOf({}, { maxHp: 100 }));
    const first = queue(fight, createGodState(100), 'blessing');
    const second = queue(first.fight, first.god, 'smite');
    expect(second.god.gp).toBe(50);
    expect(second.fight.queue.map((q) => [q.seq, q.kind, q.cost])).toEqual([
      [0, 'blessing', 25],
      [1, 'smite', 25],
    ]);
    expect(fight.queue).toEqual([]);
    const { state, events } = stepFight(second.fight);
    expect(events).toEqual([
      { type: 'god', tick: 1, action: 'blessing', target: 'hero', cost: 25, amount: 0, hp: 1000 },
      { type: 'god', tick: 1, action: 'smite', target: 'monster', cost: 25, amount: 200, hp: 800 },
    ]);
    expect(state.queue).toEqual([]);
  });

  it('Smite deals exactly 20% of max HP through any evasion and defense', () => {
    const fight = fightOf({}, { maxHp: 250, evasion: 60, defense: 100000 });
    const { state, events } = stepFight(queue(fight, createGodState(100), 'smite').fight);
    expect(events[0]).toMatchObject({ type: 'god', action: 'smite', amount: 500, hp: 2000 });
    expect(state.monster.hp).toBe(2000);
  });

  it('Blessing heals 25% of max HP, clamped to max', () => {
    // The monster hits for exactly 10 and 50 HP to set up two wounded heroes.
    const hitFor = (dmg: number) =>
      advanceFight(fightOf({}, { maxHp: 1000, damageMin: dmg, damageMax: dmg }), 1500).state;
    const light = hitFor(10);
    expect(light.hero.hp).toBe(900);
    expect(stepFight(queue(light, createGodState(100), 'blessing').fight).state.hero.hp).toBe(1000);
    const heavy = hitFor(50);
    expect(heavy.hero.hp).toBe(500);
    expect(stepFight(queue(heavy, createGodState(100), 'blessing').fight).state.hero.hp).toBe(750);
  });

  it('refuses a Smite that could only hit a corpse', () => {
    let fight = fightOf({}, { maxHp: 100 });
    let god = createGodState(200, 200);
    for (let i = 0; i < 5; i++) ({ fight, god } = queue(fight, god, 'smite'));
    expect(requestIntervention(fight, god, 'smite')).toEqual({ ok: false, reason: 'target_doomed' });
    expect(god.gp).toBe(75);
    const { state, events } = stepFight(fight);
    expect(events.filter((e) => e.type === 'god')).toHaveLength(5);
    expect(state.outcome).toBe('hero_won');
  });
});
