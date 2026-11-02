/** GDD monster formulas with explicit, untuned family policy. */
import { cloneRng, type RngState } from './rng.ts';
import { itemScale, weightedPick, zeroStats } from './loot.ts';
import type { StatBlock } from './stats.ts';

export type MonsterFamily = 'spider' | 'golem' | 'wraith' | 'leech' | 'brute';
export interface MonsterName { id: string; family: MonsterFamily; name_en: string }

export interface FamilyTuning {
  intervalSeconds: number;
  damageMultiplier: number;
  defenseMultiplier: number;
  evasion: number;
  vampirism: number;
  crit: number;
  hpBase: number;
  hpPerLevel: number;
  damageMinBase: number;
  damageMinPerLevel: number;
  damageMaxBase: number;
  damageMaxPerLevel: number;
  defensePerLevel: number;
}

export const DEFAULT_FAMILY_TUNING: Readonly<Record<MonsterFamily, Readonly<FamilyTuning>>> = {
  spider: {
    intervalSeconds: 1.2,
    damageMultiplier: 0.8,
    defenseMultiplier: 1,
    evasion: 0,
    vampirism: 0,
    crit: 0,
    hpBase: 50,
    hpPerLevel: 20,
    damageMinBase: 4,
    damageMinPerLevel: 1.8,
    damageMaxBase: 6,
    damageMaxPerLevel: 2.6,
    defensePerLevel: 0.8,
  },
  golem: {
    intervalSeconds: 2.4,
    damageMultiplier: 1,
    defenseMultiplier: 2,
    evasion: 0,
    vampirism: 0,
    crit: 0,
    hpBase: 50,
    hpPerLevel: 20,
    damageMinBase: 4,
    damageMinPerLevel: 1.8,
    damageMaxBase: 6,
    damageMaxPerLevel: 2.6,
    defensePerLevel: 0.8,
  },
  wraith: {
    intervalSeconds: 1.5,
    damageMultiplier: 1,
    defenseMultiplier: 1,
    evasion: 15,
    vampirism: 0,
    crit: 0,
    hpBase: 50,
    hpPerLevel: 20,
    damageMinBase: 4,
    damageMinPerLevel: 1.8,
    damageMaxBase: 6,
    damageMaxPerLevel: 2.6,
    defensePerLevel: 0.8,
  },
  leech: {
    intervalSeconds: 1.8,
    damageMultiplier: 1,
    defenseMultiplier: 1,
    evasion: 0,
    vampirism: 15,
    crit: 0,
    hpBase: 50,
    hpPerLevel: 20,
    damageMinBase: 4,
    damageMinPerLevel: 1.8,
    damageMaxBase: 6,
    damageMaxPerLevel: 2.6,
    defensePerLevel: 0.8,
  },
  brute: {
    intervalSeconds: 2.0,
    damageMultiplier: 1,
    defenseMultiplier: 1,
    evasion: 0,
    vampirism: 0,
    crit: 15,
    hpBase: 50,
    hpPerLevel: 20,
    damageMinBase: 4,
    damageMinPerLevel: 1.8,
    damageMaxBase: 6,
    damageMaxPerLevel: 2.6,
    defensePerLevel: 0.8,
  },
};

export interface BalanceRowInput {
  family: MonsterFamily;
  interval_seconds: number;
  damage_multiplier: number;
  defense_multiplier: number;
  evasion: number;
  vampirism: number;
  crit: number;
  hp_base: number;
  hp_per_level: number;
  damage_min_base: number;
  damage_min_per_level: number;
  damage_max_base: number;
  damage_max_per_level: number;
  defense_per_level: number;
}

export function tuningFromBalanceRows(rows: readonly BalanceRowInput[]): Record<MonsterFamily, FamilyTuning> {
  const result = {} as Record<MonsterFamily, FamilyTuning>;
  for (const row of rows) {
    result[row.family] = {
      intervalSeconds: row.interval_seconds,
      damageMultiplier: row.damage_multiplier,
      defenseMultiplier: row.defense_multiplier,
      evasion: row.evasion,
      vampirism: row.vampirism,
      crit: row.crit,
      hpBase: row.hp_base,
      hpPerLevel: row.hp_per_level,
      damageMinBase: row.damage_min_base,
      damageMinPerLevel: row.damage_min_per_level,
      damageMaxBase: row.damage_max_base,
      damageMaxPerLevel: row.damage_max_per_level,
      defensePerLevel: row.defense_per_level,
    };
  }
  return result;
}

export interface GeneratedMonster { id: string; contentId: string; family: MonsterFamily; level: number; stats: StatBlock }

export function monsterStats(level: number, family: MonsterFamily, tuning = DEFAULT_FAMILY_TUNING): StatBlock {
  itemScale(level); // Shared level contract: zone 0 allowed, negatives/fractions rejected.
  const t = tuning[family];
  if (!t || Object.values(t).some((n) => !Number.isFinite(n)) || t.intervalSeconds < 1.2 || t.intervalSeconds > 2.4 || t.damageMultiplier < 0 || t.defenseMultiplier < 0) throw new RangeError('invalid monster family tuning');
  return {
    ...zeroStats(),
    maxHp: t.hpBase + t.hpPerLevel * level,
    damageMin: (t.damageMinBase + t.damageMinPerLevel * level) * t.damageMultiplier,
    damageMax: (t.damageMaxBase + t.damageMaxPerLevel * level) * t.damageMultiplier,
    defense: t.defensePerLevel * level * t.defenseMultiplier,
    attackSpeed: (1.5 / t.intervalSeconds - 1) * 100,
    evasion: t.evasion,
    vampirism: t.vampirism,
    crit: t.crit,
  };
}

export function generateMonster(names: readonly MonsterName[], inputRng: RngState, options: { id: string; level: number; family?: MonsterFamily }, tuning = DEFAULT_FAMILY_TUNING): { monster: GeneratedMonster; rng: RngState } {
  const rng = cloneRng(inputRng);
  const families: readonly MonsterFamily[] = ['spider', 'golem', 'wraith', 'leech', 'brute'];
  const family = options.family ?? weightedPick(rng, families, () => 1);
  const row = weightedPick(rng, names.filter((n) => n.family === family), () => 1);
  return { monster: { id: options.id, contentId: row.id, family, level: options.level, stats: monsterStats(options.level, family, tuning) }, rng };
}
