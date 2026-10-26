/** Immutable inventory transitions; IDs are caller-owned, unique per inventory. */
import { GEAR_SLOTS, aggregateGearStats, type GearItem, type GearSlot } from './loot.ts';
import { cloneRng, randomBelow, type RngState } from './rng.ts';
import { normalizeStats, type StatBlock } from './stats.ts';
import type { GodState } from './god.ts';
export const GEAR_BAG_CAPACITY = 10;
export const TROPHY_POUCH_CAPACITY = 10;
export const ITEM_BLESSING_COST = 5;
export interface Trophy { id: string; contentId: string; price: number }
export interface Inventory { equipped: Partial<Record<GearSlot, GearItem>>; bag: readonly GearItem[]; trophies: readonly Trophy[] }
export interface HeroQuirks { alignment: number; favoriteModifierId: string | null }
export const NEUTRAL_QUIRKS: Readonly<HeroQuirks> = { alignment: 0, favoriteModifierId: null };
export type InventoryEvent = { type: 'pickup' | 'drop' | 'equip' | 'sell' | 'bless' | 'death_loss'; itemId: string };
export function emptyInventory(): Inventory { return { equipped: {}, bag: [], trophies: [] }; }
export function perceivedPower(item: GearItem, quirks: HeroQuirks): number {
  let multiplier = item.godBlessed ? 1.5 : 1;
  if (item.modifiers.some((m) => m.id === 'cursed' || m.id === 'heretical')) multiplier *= quirks.alignment > 0 ? 0.7 : quirks.alignment < 0 ? 1.3 : 1;
  if (quirks.favoriteModifierId && item.modifiers.some((m) => m.id === quirks.favoriteModifierId)) multiplier *= 1.25;
  return item.power * multiplier;
}
function gear(inventory: Inventory): GearItem[] { return [...inventory.bag, ...GEAR_SLOTS.flatMap((slot) => inventory.equipped[slot] ? [inventory.equipped[slot]!] : [])]; }
function assertInventory(inventory: Inventory): void {
  if (inventory.bag.length > GEAR_BAG_CAPACITY || inventory.trophies.length > TROPHY_POUCH_CAPACITY) throw new RangeError('inventory exceeds capacity');
  const ids = [...gear(inventory).map((i) => i.id), ...inventory.trophies.map((i) => i.id)];
  if (new Set(ids).size !== ids.length) throw new RangeError('inventory IDs must be unique');
  for (const slot of GEAR_SLOTS) if (inventory.equipped[slot] && inventory.equipped[slot]!.slot !== slot) throw new RangeError('equipment slot mismatch');
}
/** Weakest true-power unlocked item; input index breaks ties deterministically. */
function weakest(bag: readonly GearItem[]): number {
  let index = -1;
  for (let i = 0; i < bag.length; i++) if (!bag[i]!.godBlessed && (index < 0 || bag[i]!.power < bag[index]!.power)) index = i;
  return index;
}
export function equipBest(inventory: Inventory, quirks: HeroQuirks = NEUTRAL_QUIRKS): { inventory: Inventory; events: InventoryEvent[] } {
  assertInventory(inventory);
  const bag = [...inventory.bag];
  const equipped = { ...inventory.equipped };
  const events: InventoryEvent[] = [];
  for (const slot of GEAR_SLOTS) {
    let best = -1;
    for (let i = 0; i < bag.length; i++) if (bag[i]!.slot === slot && (best < 0 || perceivedPower(bag[i]!, quirks) > perceivedPower(bag[best]!, quirks))) best = i;
    if (best < 0) continue;
    const old = equipped[slot];
    const candidate = bag[best]!;
    // Choice: 5% of absolute old power also makes negative-power upgrades monotone.
    if (old) {
      const oldPower = perceivedPower(old, quirks);
      const nextPower = perceivedPower(candidate, quirks);
      if (nextPower <= oldPower || nextPower < oldPower + Math.abs(oldPower) * 0.05) continue;
    }
    bag.splice(best, 1);
    equipped[slot] = candidate;
    if (old) bag.push(old); // The candidate freed a bag slot, including when old is locked.
    events.push({ type: 'equip', itemId: candidate.id });
  }
  return { inventory: { ...inventory, bag, equipped }, events };
}
export function pickupGear(inventory: Inventory, item: GearItem, quirks: HeroQuirks = NEUTRAL_QUIRKS): { inventory: Inventory; accepted: boolean; events: InventoryEvent[] } {
  assertInventory(inventory);
  if (gear(inventory).some((i) => i.id === item.id) || inventory.trophies.some((i) => i.id === item.id)) throw new RangeError('duplicate pickup ID');
  const bag = [...inventory.bag];
  const events: InventoryEvent[] = [];
  if (bag.length >= GEAR_BAG_CAPACITY) {
    const index = weakest(bag);
    if (index < 0 || item.power <= bag[index]!.power) return { inventory, accepted: false, events };
    events.push({ type: 'drop', itemId: bag[index]!.id });
    bag.splice(index, 1);
  }
  bag.push(item);
  events.push({ type: 'pickup', itemId: item.id });
  const result = equipBest({ ...inventory, bag }, quirks);
  return { ...result, accepted: true, events: [...events, ...result.events] };
}
export function pickupTrophy(inventory: Inventory, trophy: Trophy): { inventory: Inventory; accepted: boolean; full: boolean } {
  assertInventory(inventory);
  if (!Number.isFinite(trophy.price) || trophy.price < 0) throw new RangeError('invalid trophy price');
  if ([...gear(inventory), ...inventory.trophies].some((i) => i.id === trophy.id)) throw new RangeError('duplicate trophy ID');
  if (inventory.trophies.length >= TROPHY_POUCH_CAPACITY) return { inventory, accepted: false, full: true };
  const trophies = [...inventory.trophies, { ...trophy }];
  return { inventory: { ...inventory, trophies }, accepted: true, full: trophies.length === TROPHY_POUCH_CAPACITY };
}
/** Town order: equip, sell floor(bag size/2) weakest eligible gear, sell all trophies. */
export function sellInTown(inventory: Inventory, quirks: HeroQuirks = NEUTRAL_QUIRKS): { inventory: Inventory; gold: number; sold: readonly string[]; events: InventoryEvent[] } {
  const result = equipBest(inventory, quirks);
  const bag = [...result.inventory.bag];
  const count = Math.floor(bag.length / 2);
  const sold: string[] = [];
  let gold = 0;
  for (let i = 0; i < count; i++) {
    const index = weakest(bag);
    if (index < 0) break;
    const item = bag.splice(index, 1)[0]!;
    sold.push(item.id); gold += item.sellPrice;
  }
  for (const trophy of inventory.trophies) { sold.push(trophy.id); gold += trophy.price * 0.3; }
  return { inventory: { ...result.inventory, bag, trophies: [] }, gold, sold, events: [...result.events, ...sold.map((itemId) => ({ type: 'sell' as const, itemId }))] };
}
export type BlessItemResult = { ok: false; reason: 'unknown_item' | 'already_blessed' | 'insufficient_gp' } | { ok: true; inventory: Inventory; god: GodState; events: InventoryEvent[] };
/** Choice: no lock-count limit; GDD leaves prototype limit ambiguous. No charge on rejection. */
export function blessItem(inventory: Inventory, god: GodState, id: string): BlessItemResult {
  assertInventory(inventory);
  const item = gear(inventory).find((i) => i.id === id);
  if (!item) return { ok: false, reason: 'unknown_item' };
  if (item.godBlessed) return { ok: false, reason: 'already_blessed' };
  if (god.gp < ITEM_BLESSING_COST) return { ok: false, reason: 'insufficient_gp' };
  const blessed = { ...item, godBlessed: true };
  const equipped = { ...inventory.equipped };
  if (equipped[item.slot]?.id === id) equipped[item.slot] = blessed;
  return { ok: true, inventory: { ...inventory, equipped, bag: inventory.bag.map((i) => i.id === id ? blessed : i) }, god: { ...god, gp: god.gp - ITEM_BLESSING_COST }, events: [{ type: 'bless', itemId: id }] };
}
export function applyDeathLoss(inventory: Inventory, gold: number, inputRng: RngState): { inventory: Inventory; gold: number; goldLost: number; lostItem: GearItem | null; rng: RngState; events: InventoryEvent[] } {
  assertInventory(inventory);
  if (!Number.isFinite(gold) || gold < 0) throw new RangeError('invalid gold');
  const rng = cloneRng(inputRng);
  const eligible = GEAR_SLOTS.filter((slot) => inventory.equipped[slot] && !inventory.equipped[slot]!.godBlessed);
  const equipped = { ...inventory.equipped };
  let lostItem: GearItem | null = null;
  if (eligible.length) {
    const slot = eligible[randomBelow(rng, eligible.length)]!;
    lostItem = equipped[slot]!; delete equipped[slot];
  }
  const goldLost = gold * 0.25;
  return { inventory: { ...inventory, equipped }, gold: gold - goldLost, goldLost, lostItem, rng, events: lostItem ? [{ type: 'death_loss', itemId: lostItem.id }] : [] };
}
/** Compute combat-ready totals once. Choice: lethal max-HP curses floor totals at 0.1, never items. */
export function inventoryStats(base: StatBlock, inventory: Inventory): StatBlock {
  const total = aggregateGearStats(base, GEAR_SLOTS.flatMap((slot) => inventory.equipped[slot] ? [inventory.equipped[slot]!] : []));
  return { ...total, maxHp: Math.max(0.1, total.maxHp) };
}
export function inventoryCombatStats(base: StatBlock, inventory: Inventory) { return normalizeStats(inventoryStats(base, inventory)); }
export function inventoryMiracleEffects(inventory: Inventory): { blessingHealMultiplier: number; miracleMultiplier: number } {
  let blessingHealMultiplier = 1, miracleMultiplier = 1;
  for (const slot of GEAR_SLOTS) { const item = inventory.equipped[slot]; if (item) { blessingHealMultiplier *= item.blessingHealMultiplier; miracleMultiplier *= item.miracleMultiplier; } }
  return { blessingHealMultiplier, miracleMultiplier };
}
