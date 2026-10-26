/**
 * Seeded, serializable random generator: sfc32 seeded through splitmix32.
 *
 * All arithmetic is 32-bit integer (`Math.imul`, shifts, `>>> 0`), so the
 * sequence is bit-identical in every JavaScript engine. The state is four
 * uint32 words and survives `JSON.stringify` unchanged.
 */

export interface RngState {
  a: number;
  b: number;
  c: number;
  d: number;
}

const TWO_POW_32 = 4294967296;

export function isUint32(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < TWO_POW_32;
}

/** One splitmix32 output for `x`; used for seeding and seed derivation. */
function splitmix32(x: number): number {
  let z = (x + 0x9e3779b9) >>> 0;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
  return (z ^ (z >>> 16)) >>> 0;
}

/** Deterministically derives an independent uint32 seed from two uint32 inputs. */
export function mixSeed(seed: number, salt: number): number {
  return splitmix32((splitmix32(seed >>> 0) ^ Math.imul(salt >>> 0, 0x27d4eb2d)) >>> 0);
}

export function seedRng(seed: number): RngState {
  if (!isUint32(seed)) {
    throw new RangeError(`seed must be an integer in [0, 2^32), got ${String(seed)}`);
  }
  const a = splitmix32(seed);
  const b = splitmix32(a);
  const c = splitmix32(b);
  const d = splitmix32(c);
  const state: RngState = { a, b, c, d };
  // Discard the first outputs so nearby seeds decorrelate.
  for (let i = 0; i < 12; i++) nextU32(state);
  return state;
}

export function cloneRng(state: RngState): RngState {
  return { a: state.a, b: state.b, c: state.c, d: state.d };
}

/** Advances `state` in place and returns the next uint32. */
export function nextU32(state: RngState): number {
  const t = (((state.a + state.b) | 0) + state.d) | 0;
  state.d = (state.d + 1) >>> 0;
  state.a = (state.b ^ (state.b >>> 9)) >>> 0;
  state.b = (state.c + (state.c << 3)) >>> 0;
  const rotated = (state.c << 21) | (state.c >>> 11);
  state.c = (rotated + t) >>> 0;
  return t >>> 0;
}

/** Unbiased integer in [0, n) by rejection sampling; `n` in [1, 2^32]. */
export function randomBelow(state: RngState, n: number): number {
  if (!Number.isInteger(n) || n < 1 || n > TWO_POW_32) {
    throw new RangeError(`randomBelow bound must be an integer in [1, 2^32], got ${n}`);
  }
  const limit = TWO_POW_32 - (TWO_POW_32 % n);
  for (;;) {
    const x = nextU32(state);
    if (x < limit) return x % n;
  }
}

/** Uniform integer in [min, max], both inclusive. */
export function randomIntInclusive(state: RngState, min: number, max: number): number {
  return min + randomBelow(state, max - min + 1);
}

/**
 * True with probability `chanceBp / 10000`. Always rolls, even for 0 or
 * 10000, so the draw sequence does not depend on the stat values.
 */
export function rollBp(state: RngState, chanceBp: number): boolean {
  return randomBelow(state, 10000) < chanceBp;
}
