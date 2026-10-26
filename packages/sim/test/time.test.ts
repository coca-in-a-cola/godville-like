import { describe, expect, it } from 'vitest';
import {
  HERO_BASE_STATS,
  advanceFight,
  createFight,
  createGodState,
  createWorldClock,
  requestIntervention,
  scaleRealToGame,
  type FightEvent,
  type FightState,
  type GameSpeed,
} from '../src/index.ts';
import { ZONE1_MONSTER, roundTrip } from './fixtures.ts';

const baseFight = (): FightState => createFight({ seed: 99, hero: HERO_BASE_STATS, monster: ZONE1_MONSTER });

function advanceInSteps(state: FightState, steps: readonly number[]): { state: FightState; events: FightEvent[] } {
  let current = state;
  const events: FightEvent[] = [];
  for (const ms of steps) {
    const next = advanceFight(current, ms);
    current = next.state;
    events.push(...next.events);
  }
  return { state: current, events };
}

describe('elapsed game time', () => {
  it('keeps the sub-tick remainder', () => {
    const a = advanceFight(baseFight(), 250);
    expect(a.ticks).toBe(2);
    expect(a.state.tick).toBe(2);
    expect(a.state.pendingMs).toBe(50);
    const b = advanceFight(a.state, 50);
    expect(b.ticks).toBe(1);
    expect(b.state.pendingMs).toBe(0);
  });

  it('gives identical state and events for any split of the same total', () => {
    const whole = advanceFight(baseFight(), 12_000);
    const tenths = advanceInSteps(baseFight(), Array.from({ length: 120 }, () => 100));
    const ragged = advanceInSteps(baseFight(), [1, 99, 37, 263, 600, 3, 9997, 1000]);
    const tiny = advanceInSteps(baseFight(), Array.from({ length: 1200 }, () => 10));
    expect(whole.events.length).toBeGreaterThan(10);
    for (const split of [tenths, ragged, tiny]) {
      expect(split.state).toEqual(whole.state);
      expect(split.events).toEqual(whole.events);
    }
  });

  it('rejects invalid elapsed time', () => {
    for (const bad of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => advanceFight(baseFight(), bad)).toThrow(RangeError);
    }
  });

  it('restores a serialized mid-fight state and continues identically', () => {
    // Stop mid-tick with a queued blessing, live RNG, partial bars and a regen carry.
    let mid = advanceFight(baseFight(), 7_350);
    const blessing = requestIntervention(mid.state, createGodState(100), 'blessing');
    if (!blessing.ok) throw new Error('blessing rejected');
    const saved = blessing.fight;
    expect(saved.pendingMs).toBe(50);
    expect(saved.queue).toHaveLength(1);
    expect(saved.hero.regenCarry).not.toBe(0);
    expect(saved.hero.bar % 150000).not.toBe(0);

    const restored = roundTrip(saved);
    expect(restored).toEqual(saved);
    const uninterrupted = advanceFight(saved, 30_000);
    const resumed = advanceFight(restored, 30_000);
    expect(resumed.state).toEqual(uninterrupted.state);
    expect(resumed.events).toEqual(uninterrupted.events);
    expect(resumed.events[0]).toMatchObject({ type: 'god', action: 'blessing', tick: saved.tick + 1 });
    mid = resumed;
    expect(mid.state.outcome).not.toBeNull();
  });
});

describe('world speed', () => {
  it('scales real time to game time with an integer carry', () => {
    expect(scaleRealToGame(createWorldClock(), 1000, 'watched').gameMs).toBe(1000);
    expect(scaleRealToGame(createWorldClock(), 1000, 'unwatched').gameMs).toBe(100);
    let clock = createWorldClock();
    let game = 0;
    for (let i = 0; i < 7; i++) {
      const r = scaleRealToGame(clock, 3, 'unwatched');
      clock = r.clock;
      game += r.gameMs;
    }
    expect(game).toBe(2);
    expect(clock.carry).toBe(1);
  });

  it('produces the same fight at 1x and 0.1x for the same game time', () => {
    const run = (speed: GameSpeed, realMs: number, frameMs: number) => {
      let clock = createWorldClock();
      let state = baseFight();
      const events: FightEvent[] = [];
      for (let t = 0; t < realMs; t += frameMs) {
        const scaled = scaleRealToGame(clock, frameMs, speed);
        clock = scaled.clock;
        const next = advanceFight(state, scaled.gameMs);
        state = next.state;
        events.push(...next.events);
      }
      return { state, events };
    };
    const watched = run('watched', 20_000, 16);
    const unwatched = run('unwatched', 200_000, 16);
    expect(watched.state.tick).toBeGreaterThan(0);
    expect(unwatched.state).toEqual(watched.state);
    expect(unwatched.events).toEqual(watched.events);
  });
});
