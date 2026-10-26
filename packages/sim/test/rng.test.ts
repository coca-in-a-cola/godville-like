import { describe, expect, it } from 'vitest';
import { mixSeed, nextU32, randomBelow, randomIntInclusive, rollBp, seedRng, cloneRng } from '../src/index.ts';
import { roundTrip } from './fixtures.ts';

describe('seeded RNG', () => {
  it('produces a pinned uint32 sequence for a known seed', () => {
    const rng = seedRng(42);
    const values = Array.from({ length: 5 }, () => nextU32(rng));
    expect(values).toMatchInlineSnapshot(`
      [
        1854947151,
        1967844160,
        887071210,
        3104651849,
        1264417530,
      ]
    `);
    for (const v of values) expect(Number.isInteger(v) && v >= 0 && v < 2 ** 32).toBe(true);
  });

  it('gives different streams for different seeds', () => {
    const a = seedRng(1);
    const b = seedRng(2);
    expect(nextU32(a)).not.toBe(nextU32(b));
  });

  it('continues identically after a JSON round trip of its state', () => {
    const live = seedRng(7);
    for (let i = 0; i < 10; i++) nextU32(live);
    const restored = roundTrip(cloneRng(live));
    const fromLive = Array.from({ length: 20 }, () => nextU32(live));
    const fromRestored = Array.from({ length: 20 }, () => nextU32(restored));
    expect(fromRestored).toEqual(fromLive);
  });

  it('rejects seeds that are not uint32', () => {
    for (const bad of [-1, 1.5, 2 ** 32, Number.NaN]) expect(() => seedRng(bad)).toThrow(RangeError);
  });

  it('draws inclusive integer ranges and hits both ends', () => {
    const rng = seedRng(3);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = randomIntInclusive(rng, 4, 6);
      expect(v).toBeGreaterThanOrEqual(4);
      expect(v).toBeLessThanOrEqual(6);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([4, 5, 6]);
    expect(randomIntInclusive(rng, 9, 9)).toBe(9);
    expect(() => randomBelow(rng, 0)).toThrow(RangeError);
  });

  it('treats 0 and 10000 basis points as never and always', () => {
    const rng = seedRng(5);
    for (let i = 0; i < 500; i++) {
      expect(rollBp(rng, 0)).toBe(false);
      expect(rollBp(rng, 10000)).toBe(true);
    }
  });

  it('derives distinct seeds deterministically', () => {
    expect(mixSeed(10, 1)).toBe(mixSeed(10, 1));
    const derived = new Set(Array.from({ length: 1000 }, (_, i) => mixSeed(10, i)));
    expect(derived.size).toBe(1000);
  });
});
