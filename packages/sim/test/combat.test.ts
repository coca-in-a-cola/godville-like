import { describe, expect, it } from 'vitest';
import {
  BAR_FULL,
  advanceFight,
  createGodState,
  dealtAfterDefense,
  requestIntervention,
  stepFight,
  type FightEvent,
  type FightState,
} from '../src/index.ts';
import { deepFreeze, fightOf, runEvents, ticksOf } from './fixtures.ts';

const swingsBy = (side: 'hero' | 'monster') => (e: FightEvent) =>
  (e.type === 'hit' || e.type === 'dodge') && e.attacker === side && !e.counter;

function eventsAt(events: readonly FightEvent[], tick: number): FightEvent[] {
  return events.filter((e) => e.tick === tick);
}

describe('attack timing', () => {
  it('fires every 1.5 s at 0% attack speed and keeps bar overflow', () => {
    const start = fightOf({ attackSpeed: 100 }, { maxHp: 1000 });
    const { state, events } = runEvents(start, 30);
    // +100% fills 20000 per tick: 160000 at tick 8 (overflow 10000), then exactly 150000 at tick 15.
    expect(ticksOf(events, swingsBy('hero'))).toEqual([8, 15, 23, 30]);
    expect(ticksOf(events, swingsBy('monster'))).toEqual([15, 30]);
    expect(state.hero.bar).toBe(0);
    const afterEight = runEvents(start, 8).state;
    expect(afterEight.hero.bar).toBe(10000);
    expect(afterEight.monster.bar).toBe(80000);
  });

  it('caps attack speed at +200% (interval 0.5 s) and floors it at -90% (15 s)', () => {
    const fast = runEvents(fightOf({ attackSpeed: 500 }, { maxHp: 1000, attackSpeed: -500 }), 150);
    expect(ticksOf(fast.events, swingsBy('hero')).slice(0, 4)).toEqual([5, 10, 15, 20]);
    expect(ticksOf(fast.events, swingsBy('monster'))).toEqual([150]);
  });

  it('resolves the fullest bar first when both fire in the same tick', () => {
    // Monster +7%: 10700/tick -> 160500 at tick 15, fuller than the hero's 150000.
    const { events } = runEvents(fightOf({ maxHp: 1000 }, { maxHp: 1000, attackSpeed: 7 }), 15);
    const swings = eventsAt(events, 15).filter((e) => e.type === 'hit');
    expect(swings.map((e) => (e.type === 'hit' ? e.attacker : null))).toEqual(['monster', 'hero']);
  });

  it('lets the hero go first on an exact tie', () => {
    const { events } = runEvents(fightOf({ maxHp: 1000 }, { maxHp: 1000 }), 15);
    const swings = eventsAt(events, 15).filter((e) => e.type === 'hit');
    expect(swings.map((e) => (e.type === 'hit' ? e.attacker : null))).toEqual(['hero', 'monster']);
  });
});

describe('resolving a hit', () => {
  it('applies the 20% defense floor with integer ceil', () => {
    expect(dealtAfterDefense(10, 0)).toBe(10);
    expect(dealtAfterDefense(10, 3)).toBe(7);
    expect(dealtAfterDefense(10, 9)).toBe(2);
    expect(dealtAfterDefense(10, 1000)).toBe(2);
    expect(dealtAfterDefense(11, 10)).toBe(3);
    expect(dealtAfterDefense(1, 5)).toBe(1);
    expect(dealtAfterDefense(0, 0)).toBe(0);
  });

  it('rolls inclusive integer damage between min and max', () => {
    const { events } = runEvents(fightOf({ damageMin: 1, damageMax: 3, attackSpeed: 200 }, { maxHp: 100000 }), 3000);
    const rolls = events.flatMap((e) => (e.type === 'hit' && e.attacker === 'hero' ? [e.roll] : []));
    expect(rolls.length).toBeGreaterThan(500);
    expect(new Set(rolls)).toEqual(new Set([1, 2, 3]));
  });

  it('doubles crits before defense and records the blocked amount', () => {
    const { events } = runEvents(
      fightOf({ damageMin: 5, damageMax: 5, crit: 50, attackSpeed: 200 }, { maxHp: 100000, defense: 4 }),
      3000,
    );
    const hits = events.filter((e): e is Extract<FightEvent, { type: 'hit' }> => e.type === 'hit' && e.attacker === 'hero');
    const crits = hits.filter((h) => h.crit);
    const normals = hits.filter((h) => !h.crit);
    expect(crits.length).toBeGreaterThan(0);
    expect(normals.length).toBeGreaterThan(0);
    for (const h of crits) expect(h).toMatchObject({ roll: 5, raw: 10, dealt: 6, blocked: 4, hpLoss: 60 });
    // raw 5 - DEF 4 = 1, floor ceil(0.2 * 5) = 1.
    for (const h of normals) expect(h).toMatchObject({ roll: 5, raw: 5, dealt: 1, blocked: 4, hpLoss: 10 });
    const rate = crits.length / hits.length;
    expect(rate).toBeGreaterThan(0.45);
    expect(rate).toBeLessThan(0.55);
  });

  it('dodges end the hit: no damage, no vampirism, no counter', () => {
    const { events } = runEvents(
      fightOf({ damageMin: 1, damageMax: 1, attackSpeed: 200, vampirism: 30 }, { maxHp: 100000, evasion: 60, counter: 40 }),
      3000,
    );
    const heroSwings = events.filter(swingsBy('hero'));
    const dodges = heroSwings.filter((e) => e.type === 'dodge');
    const rate = dodges.length / heroSwings.length;
    expect(rate).toBeGreaterThan(0.55);
    expect(rate).toBeLessThan(0.65);
    events.forEach((e, i) => {
      if (e.type === 'dodge') {
        const next = events[i + 1];
        expect(next === undefined || next.type !== 'counter' || next.tick !== e.tick || next.side !== e.defender).toBe(true);
        expect(next?.type === 'heal' && next.tick === e.tick).toBe(false);
      }
    });
    const none = runEvents(fightOf({ attackSpeed: 200 }, { maxHp: 1000 }), 600).events;
    expect(none.some((e) => e.type === 'dodge')).toBe(false);
  });

  it('heals the attacker by vampirism share of HP removed, clamped to max', () => {
    // Hero hits for 10 with 30% vampirism; the monster hits the hero for 20.
    const start = fightOf({ damageMin: 10, damageMax: 10, vampirism: 30 }, { maxHp: 1000, damageMin: 20, damageMax: 20 });
    const { state, events } = runEvents(start, 30);
    // Tick 15 (tie, hero first): hero at full HP heals nothing, then takes 20.
    expect(eventsAt(events, 15).map((e) => e.type)).toEqual(['hit', 'hit']);
    // Tick 30: hero hits (100 tenths removed) and heals floor(100 * 0.3) = 30 tenths, then takes 20 again.
    const at30 = eventsAt(events, 30);
    expect(at30.map((e) => e.type)).toEqual(['hit', 'heal', 'hit']);
    expect(at30[1]).toEqual({ type: 'heal', tick: 30, side: 'hero', source: 'vampirism', amount: 30, hp: 830 });
    expect(state.hero.hp).toBe(630);
  });

  it('counters at most one level deep', () => {
    const { events } = runEvents(
      fightOf({ maxHp: 100000, damageMin: 1, damageMax: 1, counter: 40 }, { maxHp: 100000, damageMin: 1, damageMax: 1, counter: 40 }),
      6000,
    );
    const counters = events.filter((e) => e.type === 'counter');
    expect(counters.length).toBeGreaterThan(100);
    events.forEach((e, i) => {
      if (e.type !== 'counter') return;
      const strike = events[i + 1];
      expect(strike?.type === 'hit' || strike?.type === 'dodge').toBe(true);
      if (strike?.type === 'hit' || strike?.type === 'dodge') {
        expect(strike.counter).toBe(true);
        expect(strike.attacker).toBe(e.side);
      }
      expect(events[i + 2]?.type).not.toBe('counter');
    });
  });
});

describe('regeneration', () => {
  it('accumulates 0.05 HP per tick instead of rounding it away', () => {
    const fight = fightOf({}, { maxHp: 100, regen: 0.5 });
    const smite = requestIntervention(fight, createGodState(100), 'smite');
    if (!smite.ok) throw new Error('smite rejected');
    const one = stepFight(smite.fight).state;
    expect(one.monster.hp).toBe(800); // 1000 - 200 smite; first 0.05 HP is carried
    expect(one.monster.regenCarry).toBe(500);
    const two = stepFight(one).state;
    expect(two.monster.hp).toBe(801);
    expect(two.monster.regenCarry).toBe(0);
    expect(advanceFight(smite.fight, 2100).state.monster.hp).toBe(810);
    expect(advanceFight(smite.fight, 10000).state.monster.hp).toBe(850); // 10 s x 0.5 HP/s
  });

  it('drains HP with negative regeneration and never exceeds max HP', () => {
    const fight = fightOf({ regen: 5 }, { maxHp: 100, regen: -0.5 });
    const after = advanceFight(fight, 4000).state;
    expect(after.monster.hp).toBe(980);
    expect(after.hero.hp).toBe(1000);
  });
});

describe('lethal ordering and terminal state', () => {
  it('a lethal first swing prevents the victim from swinging in the same tick', () => {
    const { state, events } = runEvents(fightOf({ damageMin: 1000, damageMax: 1000 }, { maxHp: 1, damageMin: 1000, damageMax: 1000 }), 100);
    expect(state.outcome).toBe('hero_won');
    expect(state.tick).toBe(15);
    expect(events.map((e) => e.type)).toEqual(['hit', 'death', 'end']);
    expect(state.hero.hp).toBe(1000);
    expect(state.monster.hp).toBe(0);
  });

  it('the fuller monster bar kills first and the hero never swings', () => {
    const { state, events } = runEvents(
      fightOf({ damageMin: 1000, damageMax: 1000 }, { maxHp: 1000, damageMin: 1000, damageMax: 1000, attackSpeed: 7 }),
      100,
    );
    expect(state.outcome).toBe('monster_won');
    expect(events.filter((e) => e.type === 'hit').map((e) => (e.type === 'hit' ? e.attacker : null))).toEqual(['monster']);
    expect(state.monster.hp).toBe(10000);
  });

  it('a counter can kill the attacker', () => {
    const { state, events } = runEvents(
      fightOf({ damageMin: 1, damageMax: 1 }, { maxHp: 1000, damageMin: 1000, damageMax: 1000, counter: 40, attackSpeed: -90 }, 11),
      200,
    );
    expect(state.outcome).toBe('monster_won');
    const killing = events.filter((e) => e.type === 'hit' && e.defender === 'hero');
    expect(killing).toHaveLength(1);
    expect(killing[0]).toMatchObject({ counter: true, attacker: 'monster', hp: 0 });
    const tail = events.slice(-4).map((e) => e.type);
    expect(tail).toEqual(['counter', 'hit', 'death', 'end']);
  });

  it('a lethal queued Smite at step 1 ends the tick before any swing', () => {
    // Monster bleeds 6 HP per tick: 16 HP left after 14 ticks; both bars are due on tick 15.
    const fight = fightOf({ damageMin: 5, damageMax: 5 }, { maxHp: 100, regen: -60 });
    const at14 = advanceFight(fight, 1400).state;
    expect(at14.monster.hp).toBe(160);
    const queued = requestIntervention(at14, createGodState(100), 'smite');
    if (!queued.ok) throw new Error('smite rejected');
    const { state, events } = stepFight(queued.fight);
    expect(events).toEqual([
      { type: 'god', tick: 15, action: 'smite', target: 'monster', cost: 25, amount: 160, hp: 0 },
      { type: 'death', tick: 15, side: 'monster' },
      { type: 'end', tick: 15, outcome: 'hero_won' },
    ]);
    expect(state.hero.bar).toBe(BAR_FULL); // never fired: no target
  });

  it('simultaneous deaths in the regeneration step are a draw', () => {
    const { state, events } = runEvents(fightOf({ maxHp: 1, regen: -10 }, { maxHp: 1, regen: -10 }), 10);
    expect(state.outcome).toBe('draw');
    expect(events).toEqual([
      { type: 'death', tick: 1, side: 'hero' },
      { type: 'death', tick: 1, side: 'monster' },
      { type: 'end', tick: 1, outcome: 'draw' },
    ]);
  });

  it('a finished fight ignores further time and refuses interventions', () => {
    const done = runEvents(fightOf({ damageMin: 1000, damageMax: 1000 }, { maxHp: 1 }), 100).state;
    const later = advanceFight(done, 5000);
    expect(later.events).toEqual([]);
    expect(later.state).toEqual(done);
    expect(requestIntervention(done, createGodState(100), 'blessing')).toEqual({ ok: false, reason: 'fight_over' });
  });

  it('never mutates its input state', () => {
    const frozen: FightState = deepFreeze(fightOf({ regen: 0.5 }, { damageMin: 3, damageMax: 9 }));
    const snapshot = JSON.stringify(frozen);
    const advanced = advanceFight(frozen, 20000);
    expect(advanced.ticks).toBeGreaterThan(0);
    expect(JSON.stringify(frozen)).toBe(snapshot);
  });
});
