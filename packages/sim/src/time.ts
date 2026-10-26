/**
 * Converts real elapsed time to game time for the world speed (Divine Gaze).
 * Pure integer arithmetic with a carry, so many small frames and one large
 * frame give the same game time. Clocks are read by the adapter, not here.
 */

export type GameSpeed = 'watched' | 'unwatched';

/** Game speed in tenths: 1.0x watched, 0.1x unwatched. */
export const GAME_SPEED_TENTHS: Readonly<Record<GameSpeed, number>> = Object.freeze({
  watched: 10,
  unwatched: 1,
});

export interface WorldClock {
  /** Tenths of a game millisecond not yet emitted, in [0, 10). */
  carry: number;
}

export function createWorldClock(): WorldClock {
  return { carry: 0 };
}

export function scaleRealToGame(
  clock: WorldClock,
  realMs: number,
  speed: GameSpeed,
): { clock: WorldClock; gameMs: number } {
  if (!Number.isSafeInteger(realMs) || realMs < 0) {
    throw new RangeError(`realMs must be a non-negative safe integer, got ${String(realMs)}`);
  }
  const total = clock.carry + realMs * GAME_SPEED_TENTHS[speed];
  return { clock: { carry: total % 10 }, gameMs: Math.floor(total / 10) };
}
