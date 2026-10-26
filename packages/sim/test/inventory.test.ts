import { describe, expect, it } from 'vitest';
import { HERO_BASE_STATS, applyDeathLoss, blessItem, buildItem, createGodState, emptyInventory, equipBest, inventoryCombatStats, inventoryMiracleEffects, inventoryStats, perceivedPower, pickupGear, pickupTrophy, seedRng, sellInTown, type GearItem, type Inventory } from '../src/index.ts';
import { lootData } from './loot-fixtures.ts';
import { deepFreeze } from './fixtures.ts';
const item = (id: string, power = 20, locked = false): GearItem => ({ ...buildItem(lootData, { id, baseId: 'sword', level: 0, baseStats: [], modifiers: [] }), power, godBlessed: locked });
const held = (bag: readonly GearItem[] = []): Inventory => ({ ...emptyInventory(), equipped: { weapon: item('equipped', 1000) }, bag });

describe('immutable inventory policy', () => {
  it('keeps ten gear and ten trophies independent and rejects overflow', () => {
    let inventory = held(Array.from({ length: 10 }, (_, i) => item(`bag-${i}`, i)));
    for (let i = 0; i < 10; i++) {
      const result = pickupTrophy(inventory, { id: `trophy-${i}`, contentId: 'trophy', price: 10 });
      expect(result.accepted).toBe(true); expect(result.full).toBe(i === 9); inventory = result.inventory;
    }
    expect(inventory.bag).toHaveLength(10); expect(inventory.trophies).toHaveLength(10);
    expect(pickupTrophy(inventory, { id: 'overflow', contentId: 'trophy', price: 10 })).toMatchObject({ accepted: false, full: true });
    const result = pickupGear(deepFreeze(inventory), item('replacement', 50));
    expect(result.accepted).toBe(true); expect(result.inventory.bag).toHaveLength(10);
    expect(result.events[0]).toEqual({ type: 'drop', itemId: 'bag-0' });
    expect(result.inventory.trophies).toEqual(inventory.trophies);
    expect(pickupGear(result.inventory, item('weak', 1)).accepted).toBe(false);
  });
  it('never drops a locked item even from an entirely locked full bag', () => {
    const inventory = deepFreeze(held(Array.from({ length: 10 }, (_, i) => item(`locked-${i}`, i, true))));
    expect(pickupGear(inventory, item('strong', 5000))).toEqual({ inventory, accepted: false, events: [] });
  });
  it.each([[100, 104.99, false], [100, 105, true], [-100, -96, false], [-100, -95, true], [0, 0, false], [0, 1, true]])('requires a monotone five-percent upgrade from %s to %s', (old, next, swaps) => {
    const inventory = deepFreeze({ ...emptyInventory(), equipped: { weapon: item('old', old) }, bag: [item('new', next)] });
    const result = equipBest(inventory);
    expect(result.inventory.equipped.weapon?.id).toBe(swaps ? 'new' : 'old');
    expect(result.inventory.bag[0]?.id).toBe(swaps ? 'old' : 'new');
  });
  it('applies alignment, favorite-word and blessing multipliers only to perception', () => {
    const cursed = buildItem(lootData, { id: 'cursed', baseId: 'sword', level: 0, baseStats: [], modifiers: [{ id: 'cursed', curseStat: 'regen' }] });
    const locked = { ...cursed, godBlessed: true };
    expect(perceivedPower(locked, { alignment: 1, favoriteModifierId: 'cursed' })).toBeCloseTo(cursed.power * 1.5 * 0.7 * 1.25);
    expect(perceivedPower(cursed, { alignment: -1, favoriteModifierId: null })).toBeCloseTo(cursed.power * 1.3);
    expect(locked.stats).toEqual(cursed.stats);
  });
  it('charges exactly five GP once and locks bag or equipped gear without mutation', () => {
    const inventory = deepFreeze(held([item('bag')])); const god = deepFreeze(createGodState(5));
    expect(blessItem(inventory, createGodState(4), 'bag')).toEqual({ ok: false, reason: 'insufficient_gp' });
    expect(blessItem(inventory, god, 'missing')).toEqual({ ok: false, reason: 'unknown_item' });
    for (const id of ['bag', 'equipped']) {
      const result = blessItem(inventory, god, id); expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('expected blessing');
      expect(result.god.gp).toBe(0);
      expect(blessItem(result.inventory, result.god, id)).toEqual({ ok: false, reason: 'already_blessed' });
      expect([...result.inventory.bag, result.inventory.equipped.weapon!].find((i) => i.id === id)?.godBlessed).toBe(true);
    }
    expect(god.gp).toBe(5); expect(inventory.bag[0]?.godBlessed).toBe(false);
  });
  it('equips first, sells the weakest floor-half eligible gear and all trophies at 30%', () => {
    const inventory = deepFreeze({ ...held([item('locked', -100, true), item('weak', 1), item('middle', 2), item('strong', 3), item('strongest', 4)]), trophies: [{ id: 't', contentId: 'trophy', price: 50 }] });
    const result = sellInTown(inventory);
    expect(result.sold).toEqual(['weak', 'middle', 't']);
    expect(result.gold).toBeCloseTo(39); // Two real sword sell prices (12 each), plus 15 trophy gold.
    expect(result.inventory.bag.map((i) => i.id)).toEqual(['locked', 'strong', 'strongest']);
    expect(result.inventory.trophies).toEqual([]);
    const upgrade = sellInTown({ ...held([item('upgrade', 2000), item('weak', 1)]) });
    expect(upgrade.inventory.equipped.weapon?.id).toBe('upgrade');
    expect(upgrade.sold).toEqual(['weak']);
  });
  it('loses 25% gold and one random unlocked equipped item, never bag or trophies', () => {
    const inventory = deepFreeze({ ...held([item('bag')]), equipped: { weapon: item('weapon'), shield: { ...item('shield'), slot: 'shield' as const }, helmet: { ...item('safe', 20, true), slot: 'helmet' as const } }, trophies: [{ id: 't', contentId: 't', price: 2 }] });
    const rng = deepFreeze(seedRng(42)); const before = JSON.stringify({ inventory, rng });
    const result = applyDeathLoss(inventory, 101, rng);
    expect(result).toEqual(applyDeathLoss(inventory, 101, rng));
    expect(result.goldLost).toBe(25.25); expect(result.gold).toBe(75.75);
    expect(['weapon', 'shield']).toContain(result.lostItem?.id);
    expect(Object.keys(result.inventory.equipped)).toHaveLength(2);
    expect(result.inventory.equipped.helmet?.id).toBe('safe');
    expect(result.inventory.bag).toEqual(inventory.bag); expect(result.inventory.trophies).toEqual(inventory.trophies);
    expect(new Set(Array.from({ length: 30 }, (_, seed) => applyDeathLoss(inventory, 0, seedRng(seed)).lostItem?.id))).toEqual(new Set(['weapon', 'shield']));
    const safe = { ...emptyInventory(), equipped: { weapon: item('locked', 20, true) } };
    expect(applyDeathLoss(safe, 0, rng)).toMatchObject({ lostItem: null, rng, events: [] });
    expect(JSON.stringify({ inventory, rng })).toBe(before);
  });
  it('caps only combat totals, preserves uncapped items and aggregates miracle metadata', () => {
    const gear = deepFreeze({ ...item('overcap'), stats: { ...item('base').stats, crit: 120, evasion: 120, vampirism: 120, counter: 120, attackSpeed: 300, regen: -2 }, blessingHealMultiplier: 1.1, miracleMultiplier: 0.9 });
    const inventory = deepFreeze({ ...emptyInventory(), equipped: { weapon: gear } });
    expect(inventoryStats(HERO_BASE_STATS, inventory).crit).toBe(120);
    expect(inventoryCombatStats(HERO_BASE_STATS, inventory)).toMatchObject({ critBp: 5000, evasionBp: 6000, vampirismBp: 3000, counterBp: 4000, attackSpeedBp: 20000, regenMilliHp: -1500 });
    expect(gear.stats.crit).toBe(120);
    expect(inventoryMiracleEffects(inventory)).toEqual({ blessingHealMultiplier: 1.1, miracleMultiplier: 0.9 });
    expect(inventoryStats(HERO_BASE_STATS, { ...inventory, equipped: { weapon: { ...gear, stats: { ...gear.stats, maxHp: -1000 } } } }).maxHp).toBe(0.1);
  });
  it('rejects duplicate IDs, slot mismatch, excess capacity and invalid money', () => {
    expect(() => pickupGear(held(), item('equipped'))).toThrow();
    expect(() => pickupTrophy(held(), { id: 'equipped', contentId: 't', price: 1 })).toThrow();
    expect(() => pickupTrophy(emptyInventory(), { id: 't', contentId: 't', price: -1 })).toThrow();
    expect(() => equipBest({ ...emptyInventory(), equipped: { shield: item('wrong') } })).toThrow();
    expect(() => equipBest(held(Array.from({ length: 11 }, (_, i) => item(String(i)))))).toThrow();
    expect(() => applyDeathLoss(emptyInventory(), NaN, seedRng(0))).toThrow();
  });
});
