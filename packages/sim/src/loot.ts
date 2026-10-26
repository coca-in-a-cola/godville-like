/** Pure loot domain. Content is explicit plain data; RNG is cloned at public boundaries. */
import { cloneRng, randomBelow, type RngState } from './rng.ts';
import { STAT_KEYS, sumStatBlocks, type StatBlock, type StatKey } from './stats.ts';

export const GEAR_SLOTS = ['weapon', 'helmet', 'armor', 'shield', 'ring', 'amulet'] as const;
export type GearSlot = typeof GEAR_SLOTS[number];
export const STANDARD_STATS = ['maxHp', 'damage', 'attackSpeed', 'defense', 'crit', 'evasion', 'regen', 'vampirism', 'counter'] as const;
export type StandardStat = typeof STANDARD_STATS[number];
export const CURSE_STATS: readonly StandardStat[] = ['maxHp', 'damage', 'defense', 'attackSpeed', 'regen'];
export const STANDARD_VALUES: Readonly<Record<StandardStat, number>> = { maxHp: 10, damage: 2, attackSpeed: 4, defense: 2, crit: 2, evasion: 2, regen: 0.3, vampirism: 1.5, counter: 2 };
export const POWER_WEIGHTS: Readonly<Record<StandardStat, number>> = { maxHp: 1, damage: 5, attackSpeed: 2.5, defense: 5, crit: 5, evasion: 5, regen: 33, vampirism: 6.7, counter: 5 };
export const MODIFIER_EFFECTS = ['mult_all', 'mult_all_plus_curse', 'mult_all_plus_regen', 'blessing_heal', 'mult_all_weaken_miracles', 'mult_all_rusty', 'mult_all_polished', 'mult_all_attic', 'mult_price', 'counterfeit', 'add_damage', 'add_max_hp', 'add_attack_speed', 'add_defense', 'add_crit', 'add_evasion', 'add_regen', 'add_vampirism', 'add_counter', 'add_justice', 'add_everything', 'random_standard', 'add_beerburgh'] as const;
export type ModifierEffect = typeof MODIFIER_EFFECTS[number];
export type ModifierGroup = 'quality' | 'morality' | 'condition' | 'economy' | 'stat' | 'origin';
export interface LootBase { id: string; slot: GearSlot; name_en: string }
export interface LootModifier { id: string; group: ModifierGroup; position: 'prefix' | 'suffix'; effect: ModifierEffect; value: number; min_zone: number; weight: number; name_en: string }
export interface LootContent { bases: readonly LootBase[]; modifiers: readonly LootModifier[] }
export interface ModifierRoll { id: string; /** Resolved random draw, preserved for saves/replays. */ randomStat?: StandardStat; curseStat?: StandardStat }
export interface ItemRecipe { id: string; baseId: string; level: number; baseStats: readonly StandardStat[]; modifiers: readonly ModifierRoll[] }
export type ItemRarity = 'grey' | 'white' | 'green' | 'blue' | 'purple' | 'orange';
export interface GearItem extends ItemRecipe {
  slot: GearSlot;
  stats: StatBlock;
  power: number;
  basePower: number;
  rarity: ItemRarity;
  price: number;
  sellPrice: number;
  shopPrice: number;
  godBlessed: boolean;
  /** Effects consumed by future world intervention adapter, not hidden combat stat changes. */
  blessingHealMultiplier: number;
  miracleMultiplier: number;
}
export function zeroStats(): StatBlock { return sumStatBlocks([]); }
export function itemScale(level: number): number {
  if (!Number.isSafeInteger(level) || level < 0) throw new RangeError('item level must be a non-negative safe integer');
  return 1 + 0.15 * level;
}
export function itemPower(stats: StatBlock): number {
  let power = (stats.damageMin + stats.damageMax) / 2 * POWER_WEIGHTS.damage;
  for (const key of STANDARD_STATS) if (key !== 'damage') power += stats[key] * POWER_WEIGHTS[key];
  return power;
}
export function rarityForRatio(ratio: number): ItemRarity {
  if (ratio < 0.9) return 'grey';
  if (ratio < 1.2) return 'white';
  if (ratio < 1.6) return 'green';
  if (ratio < 2.2) return 'blue';
  if (ratio <= 3.5) return 'purple';
  return 'orange';
}
function add(stats: StatBlock, key: StandardStat, value: number): void {
  if (key === 'damage') { stats.damageMin += value; stats.damageMax += value; }
  else stats[key] += value;
}
function scaleStats(stats: StatBlock, scale: number): void { for (const key of STAT_KEYS) stats[key] *= scale; }
function requireRow<T extends { id: string }>(rows: readonly T[], id: string): T {
  const row = rows.find((r) => r.id === id);
  if (!row) throw new RangeError(`unknown content id: ${id}`);
  return row;
}
export function buildItem(content: LootContent, recipe: ItemRecipe): GearItem {
  const scale = itemScale(recipe.level);
  const base = requireRow(content.bases, recipe.baseId);
  const stats = zeroStats();
  switch (base.slot) {
    case 'weapon': stats.damageMin = 3; stats.damageMax = 5; break;
    case 'helmet': stats.maxHp = 10; stats.defense = 2; break;
    case 'armor': stats.maxHp = 20; break;
    case 'shield': stats.defense = 4; break;
    case 'ring':
      if (recipe.baseStats.length !== 1) throw new RangeError('ring needs one base stat');
      add(stats, recipe.baseStats[0]!, STANDARD_VALUES[recipe.baseStats[0]!] * 2); break;
    case 'amulet':
      if (recipe.baseStats.length !== 2 || recipe.baseStats[0] === recipe.baseStats[1]) throw new RangeError('amulet needs two different base stats');
      for (const key of recipe.baseStats) add(stats, key, STANDARD_VALUES[key]); break;
  }
  let multiplier = 1;
  let priceMultiplier = 1;
  let shopMultiplier = 1;
  let blessingHealMultiplier = 1;
  let miracleMultiplier = 1;
  const curses: StandardStat[] = [];
  const flatKeys: Partial<Record<ModifierEffect, StandardStat>> = { add_damage: 'damage', add_max_hp: 'maxHp', add_attack_speed: 'attackSpeed', add_defense: 'defense', add_crit: 'crit', add_evasion: 'evasion', add_regen: 'regen', add_vampirism: 'vampirism', add_counter: 'counter' };
  for (const roll of recipe.modifiers) {
    const mod = requireRow(content.modifiers, roll.id);
    const key = flatKeys[mod.effect];
    if (key) { add(stats, key, mod.value); continue; }
    switch (mod.effect) {
      case 'mult_all': multiplier *= mod.value; break;
      case 'mult_all_plus_curse':
        multiplier *= mod.value;
        if (!roll.curseStat || !CURSE_STATS.includes(roll.curseStat)) throw new RangeError('curse needs valid target');
        curses.push(roll.curseStat); break;
      case 'mult_all_plus_regen': multiplier *= mod.value; add(stats, 'regen', STANDARD_VALUES.regen); break;
      case 'blessing_heal': blessingHealMultiplier *= mod.value; break;
      case 'mult_all_weaken_miracles': multiplier *= mod.value; miracleMultiplier *= 0.9; break;
      case 'mult_all_rusty': multiplier *= mod.value; priceMultiplier *= 0.7; shopMultiplier *= 0.7; break;
      case 'mult_all_polished': multiplier *= mod.value; priceMultiplier *= 1.2; shopMultiplier *= 1.2; break;
      case 'mult_all_attic': multiplier *= mod.value; priceMultiplier *= 0.3; shopMultiplier *= 0.3; break;
      case 'mult_price': priceMultiplier *= mod.value; shopMultiplier *= mod.value; break;
      case 'counterfeit': priceMultiplier *= mod.value; shopMultiplier *= 3; break;
      case 'add_justice': add(stats, 'crit', STANDARD_VALUES.crit * 0.5 * mod.value); add(stats, 'counter', STANDARD_VALUES.counter * 0.5 * mod.value); break;
      case 'add_everything': for (const k of STANDARD_STATS) add(stats, k, STANDARD_VALUES[k] * mod.value); break;
      case 'random_standard':
        if (!roll.randomStat || !STANDARD_STATS.includes(roll.randomStat)) throw new RangeError('origin needs resolved standard stat');
        add(stats, roll.randomStat, STANDARD_VALUES[roll.randomStat] * mod.value); priceMultiplier *= 1.5; shopMultiplier *= 1.5; break;
      case 'add_beerburgh': add(stats, 'maxHp', STANDARD_VALUES.maxHp * mod.value); add(stats, 'attackSpeed', -STANDARD_VALUES.attackSpeed * mod.value); break;
      default: throw new RangeError(`unsupported modifier effect: ${mod.effect}`);
    }
  }
  scaleStats(stats, scale * multiplier);
  for (const key of curses) add(stats, key, -1.5 * STANDARD_VALUES[key] * scale);
  const power = itemPower(stats);
  if (!Number.isFinite(power) || STAT_KEYS.some((key) => !Number.isFinite(stats[key]))) throw new RangeError('non-finite item stats');
  const price = Math.max(0, power * 2 * priceMultiplier);
  const shopPrice = Math.max(0, power * 2 * shopMultiplier);
  if (!Number.isFinite(price) || !Number.isFinite(shopPrice)) throw new RangeError('non-finite item price');
  const basePower = 20 * scale;
  return { ...recipe, baseStats: [...recipe.baseStats], modifiers: recipe.modifiers.map((m) => ({ ...m })), slot: base.slot, stats, power, basePower, rarity: rarityForRatio(power / basePower), price, sellPrice: price * 0.3, shopPrice, godBlessed: false, blessingHealMultiplier, miracleMultiplier };
}
export function modifierCountRange(level: number): readonly [number, number] {
  itemScale(level);
  return level <= 5 ? [1, 3] : level <= 15 ? [3, 6] : [6, 12];
}
/** Choice: descending integer weights make low counts more likely; per-mod weights are CSV data. */
export function weightedPick<T>(rng: RngState, rows: readonly T[], weight: (row: T, index: number) => number): T {
  const weights = rows.map(weight);
  const total = weights.reduce((a, b) => a + b, 0);
  if (!weights.every((w) => Number.isSafeInteger(w) && w > 0) || !Number.isSafeInteger(total) || total < 1 || total > 4294967296) throw new RangeError('invalid weighted pool');
  let roll = randomBelow(rng, total);
  for (let i = 0; i < rows.length; i++) { roll -= weights[i]!; if (roll < 0) return rows[i]!; }
  throw new Error('unreachable weighted selection');
}
export function generateItem(content: LootContent, inputRng: RngState, options: { id: string; level: number; slot?: GearSlot }): { item: GearItem; rng: RngState } {
  const [min, max] = modifierCountRange(options.level);
  const rng = cloneRng(inputRng);
  const pool = options.slot ? content.bases.filter((b) => b.slot === options.slot) : content.bases;
  const base = weightedPick(rng, pool, () => 1);
  const baseStats: StandardStat[] = [];
  if (base.slot === 'ring' || base.slot === 'amulet') baseStats.push(weightedPick(rng, STANDARD_STATS, () => 1));
  if (base.slot === 'amulet') baseStats.push(weightedPick(rng, STANDARD_STATS.filter((k) => k !== baseStats[0]), () => 1));
  const counts = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  const count = weightedPick(rng, counts, (_, i) => counts.length - i);
  // Zone 0 retains level scale 1, but uses the early-zone eligibility pool.
  const eligible = content.modifiers.filter((m) => m.min_zone <= Math.max(1, options.level));
  const modifiers: ModifierRoll[] = [];
  for (let i = 0; i < count; i++) {
    const mod = weightedPick(rng, eligible, (m) => m.weight);
    const roll: ModifierRoll = { id: mod.id };
    if (mod.effect === 'random_standard') roll.randomStat = weightedPick(rng, STANDARD_STATS, () => 1);
    if (mod.effect === 'mult_all_plus_curse') roll.curseStat = weightedPick(rng, CURSE_STATS, () => 1);
    modifiers.push(roll);
  }
  return { item: buildItem(content, { id: options.id, level: options.level, baseId: base.id, baseStats, modifiers }), rng };
}
export interface ItemNamePart { kind: 'base' | 'modifier'; id: string; text: string; rollIndex: number }
export const EN_ITEM_GROUP_ORDER: readonly ModifierGroup[] = ['quality', 'morality', 'condition', 'economy', 'stat', 'origin'];
/** Locale boundary: replace group order, row labels and renderer for other languages. */
export function itemNameParts(content: LootContent, item: ItemRecipe, groupOrder = EN_ITEM_GROUP_ORDER, shop = false): ItemNamePart[] {
  const mods = item.modifiers.map((roll, rollIndex) => ({ ...requireRow(content.modifiers, roll.id), rollIndex }));
  mods.sort((a, b) => groupOrder.indexOf(a.group) - groupOrder.indexOf(b.group) || a.rollIndex - b.rollIndex);
  const part = (m: typeof mods[number]): ItemNamePart => ({ kind: 'modifier', id: m.id, text: shop && m.effect === 'counterfeit' ? requireRow(content.modifiers, 'golden').name_en : m.name_en, rollIndex: m.rollIndex });
  return [...mods.filter((m) => m.position === 'prefix').map(part), { kind: 'base', id: item.baseId, text: requireRow(content.bases, item.baseId).name_en, rollIndex: -1 }, ...mods.filter((m) => m.position === 'suffix').map(part)];
}
export function renderItemName(content: LootContent, item: ItemRecipe, compact = false, shop = false): string {
  const parts = itemNameParts(content, item, EN_ITEM_GROUP_ORDER, shop);
  if (!compact) return parts.map((p) => p.text).join(' ');
  const collapsed: { text: string; id: string; count: number; kind: string }[] = [];
  for (const p of parts) {
    const last = collapsed.at(-1);
    if (last && last.id === p.id && last.kind === p.kind) last.count++;
    else collapsed.push({ text: p.text, id: p.id, kind: p.kind, count: 1 });
  }
  const baseIndex = collapsed.findIndex((p) => p.kind === 'base');
  const prefix = collapsed.slice(0, baseIndex);
  const suffix = collapsed.slice(baseIndex + 1);
  const show = (p: typeof collapsed[number]): string => p.text + (p.count > 1 ? `×${p.count}` : '');
  const hidden = [...prefix.slice(2), ...suffix.slice(1)].reduce((n, p) => n + p.count, 0);
  return [...prefix.slice(0, 2).map(show), ...(prefix.length > 2 ? ['…'] : []), show(collapsed[baseIndex]!), ...suffix.slice(0, 1).map(show), ...(hidden ? [`+${hidden}`] : [])].join(' ');
}
/** Useful to adapters without dropping a hero's base HP, regen or level growth. */
export function aggregateGearStats(base: StatBlock, items: readonly GearItem[]): StatBlock { return sumStatBlocks([base, ...items.map((item) => item.stats)]); }
export function statFieldForStandard(key: StandardStat): StatKey { return key === 'damage' ? 'damageMin' : key; }
