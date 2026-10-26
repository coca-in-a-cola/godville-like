/** Derived thresholds are computed at creation/level-up and persisted, never per combat tick. */
export const WORLD_LEVEL_CAP = 1000;
/** GDD: 100 * level^1.5. No rounding of the design formula. */
export function worldXpThreshold(level: number): number {
  if (!Number.isInteger(level) || level < 1 || level > WORLD_LEVEL_CAP) throw new RangeError('invalid hero level');
  return 100 * level ** 1.5;
}
