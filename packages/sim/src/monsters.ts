/** GDD monster formulas with explicit, untuned family policy. */
import { cloneRng, type RngState } from './rng.ts';
import { itemScale, weightedPick, zeroStats } from './loot.ts';
import type { StatBlock } from './stats.ts';
export type MonsterFamily = 'spider' | 'golem' | 'wraith' | 'leech' | 'brute';
export interface MonsterName { id: string; family: MonsterFamily; name_en: string }
export interface FamilyTuning { intervalSeconds: number; damageMultiplier: number; defenseMultiplier: number; evasion: number; vampirism: number; crit: number }
/** Choices, not GDD numbers; no claim to the 85% win / 40–60% HP balance gate. */
export const DEFAULT_FAMILY_TUNING: Readonly<Record<MonsterFamily, Readonly<FamilyTuning>>> = {
  spider: { intervalSeconds: 1.2, damageMultiplier: 0.8, defenseMultiplier: 1, evasion: 0, vampirism: 0, crit: 0 },
  golem: { intervalSeconds: 2.4, damageMultiplier: 1, defenseMultiplier: 2, evasion: 0, vampirism: 0, crit: 0 },
  wraith: { intervalSeconds: 1.5, damageMultiplier: 1, defenseMultiplier: 1, evasion: 15, vampirism: 0, crit: 0 },
  leech: { intervalSeconds: 1.8, damageMultiplier: 1, defenseMultiplier: 1, evasion: 0, vampirism: 15, crit: 0 },
  brute: { intervalSeconds: 2, damageMultiplier: 1, defenseMultiplier: 1, evasion: 0, vampirism: 0, crit: 15 },
};
export interface GeneratedMonster { id: string; contentId: string; family: MonsterFamily; level: number; stats: StatBlock }
export function monsterStats(level: number, family: MonsterFamily, tuning = DEFAULT_FAMILY_TUNING): StatBlock {
  itemScale(level); // Shared level contract: zone 0 allowed, negatives/fractions rejected.
  const t = tuning[family];
  if (!t || Object.values(t).some((n) => !Number.isFinite(n)) || t.intervalSeconds < 1.2 || t.intervalSeconds > 2.4 || t.damageMultiplier < 0 || t.defenseMultiplier < 0) throw new RangeError('invalid monster family tuning');
  return { ...zeroStats(), maxHp: 40 + 18 * level, damageMin: (3 + 1.5 * level) * t.damageMultiplier, damageMax: (5 + 2.5 * level) * t.damageMultiplier, defense: 0.6 * level * t.defenseMultiplier, attackSpeed: (1.5 / t.intervalSeconds - 1) * 100, evasion: t.evasion, vampirism: t.vampirism, crit: t.crit };
}
export function generateMonster(names: readonly MonsterName[], inputRng: RngState, options: { id: string; level: number; family?: MonsterFamily }, tuning = DEFAULT_FAMILY_TUNING): { monster: GeneratedMonster; rng: RngState } {
  const rng = cloneRng(inputRng);
  const families: readonly MonsterFamily[] = ['spider', 'golem', 'wraith', 'leech', 'brute'];
  const family = options.family ?? weightedPick(rng, families, () => 1);
  const row = weightedPick(rng, names.filter((n) => n.family === family), () => 1);
  return { monster: { id: options.id, contentId: row.id, family, level: options.level, stats: monsterStats(options.level, family, tuning) }, rng };
}
