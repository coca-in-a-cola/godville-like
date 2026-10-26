/**
 * Zod schemas for the five GDD data files. Columns follow the GDD
 * "Writing, names and humor" table exactly; values arrive as CSV strings.
 */

import { z } from 'zod';

const id = z.string().regex(/^[a-z][a-z0-9_]*$/, 'id must be lower_snake_case');
const name = z.string().trim().min(1, 'name must not be empty');
const nonNegativeInt = z
  .string()
  .regex(/^\d+$/, 'expected a non-negative integer')
  .transform(Number);
const positiveInt = nonNegativeInt.refine((n) => n >= 1, 'expected an integer >= 1');
const decimal = z
  .string()
  .regex(/^-?\d+(\.\d+)?$/, 'expected a decimal number')
  .transform(Number);

export const MONSTER_FAMILIES = ['spider', 'golem', 'wraith', 'leech', 'brute'] as const;
export const ITEM_SLOTS = ['weapon', 'helmet', 'armor', 'shield', 'ring', 'amulet'] as const;
export const MODIFIER_GROUPS = ['quality', 'morality', 'condition', 'economy', 'stat', 'origin'] as const;
export const MODIFIER_POSITIONS = ['prefix', 'suffix'] as const;

export const monsterRow = z.strictObject({
  id,
  family: z.enum(MONSTER_FAMILIES),
  name_en: name,
});

export const townRow = z.strictObject({
  id,
  base_mile: nonNegativeInt,
  min_level: positiveInt,
  name_en: name,
});

export const trophyRow = z.strictObject({
  id,
  base_price: nonNegativeInt,
  name_en: name,
});

export const baseRow = z.strictObject({
  id,
  slot: z.enum(ITEM_SLOTS),
  name_en: name,
});

export const modifierRow = z.strictObject({
  id,
  group: z.enum(MODIFIER_GROUPS),
  position: z.enum(MODIFIER_POSITIONS),
  /** Closed vocabulary shared structurally with the pure loot domain. */
  effect: z.enum(['mult_all', 'mult_all_plus_curse', 'mult_all_plus_regen', 'blessing_heal', 'mult_all_weaken_miracles', 'mult_all_rusty', 'mult_all_polished', 'mult_all_attic', 'mult_price', 'counterfeit', 'add_damage', 'add_max_hp', 'add_attack_speed', 'add_defense', 'add_crit', 'add_evasion', 'add_regen', 'add_vampirism', 'add_counter', 'add_justice', 'add_everything', 'random_standard', 'add_beerburgh']),
  value: decimal,
  min_zone: positiveInt,
  weight: positiveInt,
  name_en: name,
});

export const DATA_SCHEMAS = {
  monsters: monsterRow,
  towns: townRow,
  trophies: trophyRow,
  bases: baseRow,
  modifiers: modifierRow,
} as const;

export type DataFileName = keyof typeof DATA_SCHEMAS;
export const DATA_FILE_NAMES = Object.keys(DATA_SCHEMAS) as DataFileName[];

export type MonsterRow = z.output<typeof monsterRow>;
export type TownRow = z.output<typeof townRow>;
export type TrophyRow = z.output<typeof trophyRow>;
export type BaseRow = z.output<typeof baseRow>;
export type ModifierRow = z.output<typeof modifierRow>;

export interface DataRows {
  monsters: MonsterRow;
  towns: TownRow;
  trophies: TrophyRow;
  bases: BaseRow;
  modifiers: ModifierRow;
}
