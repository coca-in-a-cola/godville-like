import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { GEAR_SLOTS, MODIFIER_EFFECTS, POWER_WEIGHTS, STANDARD_STATS, STANDARD_VALUES, buildItem, generateItem, itemNameParts, itemPower, modifierCountRange, rarityForRatio, renderItemName, seedRng, weightedPick, zeroStats, type GearSlot, type ItemRecipe, type ModifierRoll, type StandardStat } from '../src/index.ts';
import { lootData as data } from './loot-fixtures.ts';
import { deepFreeze } from './fixtures.ts';
const bases: Record<GearSlot, string> = { weapon: 'sword', helmet: 'helmet', armor: 'chainmail', shield: 'shield', ring: 'ring', amulet: 'amulet' };
export function plainItem(id = 'plain', slot: GearSlot = 'weapon', level = 0, modifiers: readonly ModifierRoll[] = []) {
  return buildItem(data, { id, baseId: bases[slot], level, baseStats: slot === 'ring' ? ['crit'] : slot === 'amulet' ? ['maxHp', 'defense'] : [], modifiers });
}
const recipe: ItemRecipe = { id: 'worked', baseId: 'ring', level: 20, baseStats: ['crit'], modifiers: ['legendary', 'legendary', 'epic', 'bad', 'cursed', 'torn', 'worn', 'expensive', 'of_justice', 'of_vampirism', 'from_far_lands'].map((id) => id === 'cursed' ? { id, curseStat: 'regen' } : id === 'from_far_lands' ? { id, randomStat: 'maxHp' } : { id }) };

describe('loot catalog and exact math', () => {
  it('completes the authoritative catalog and executable effects', () => {
    expect(data.modifiers).toHaveLength(35);
    expect(data.modifiers.find((m) => m.id === 'of_vampirism')?.value).toBe(1.5);
    expect(new Set(data.modifiers.map((m) => m.effect))).toEqual(new Set(MODIFIER_EFFECTS));
    for (const mod of data.modifiers) {
      const item = plainItem('effect', 'weapon', 20, [{ id: mod.id, randomStat: 'maxHp', curseStat: 'regen' }]);
      expect(Number.isFinite(item.power)).toBe(true);
      expect(item.sellPrice).toBeCloseTo(item.price * 0.3, 10);
    }
  });
  it.each(GEAR_SLOTS)('%s base starts at power 20 (rounded standard weights excepted)', (slot) => {
    expect(plainItem('base', slot).power).toBe(20);
    expect(plainItem('scaled', slot, 20).power).toBe(80);
  });
  it('uses all nine power weights, retaining negative contributions', () => {
    for (const key of STANDARD_STATS) {
      const stats = zeroStats();
      if (key === 'damage') stats.damageMin = stats.damageMax = -2;
      else stats[key] = -2;
      expect(itemPower(stats)).toBe(-2 * POWER_WEIGHTS[key]);
    }
    expect(STANDARD_VALUES.regen * POWER_WEIGHTS.regen).toBeCloseTo(9.9);
    expect(STANDARD_VALUES.vampirism * POWER_WEIGHTS.vampirism).toBeCloseTo(10.05);
  });
  it('reproduces GDD worked example with table-authoritative unrounded values', () => {
    const item = buildItem(data, deepFreeze(recipe));
    expect(item.stats.crit).toBeCloseTo(43.74, 10);
    expect(item.stats.counter).toBeCloseTo(8.748, 10);
    expect(item.stats.vampirism).toBeCloseTo(13.122, 10);
    expect(item.stats.maxHp).toBeCloseTo(87.48, 10);
    expect(item.stats.regen).toBeCloseTo(-1.8, 10);
    expect(item.power).toBeCloseTo(378.4374, 8);
    expect(item.price).toBeCloseTo(2270.6244, 8);
    // GDD illustration rounds intermediate stats: approximate 377 / 2260, not exact targets.
    expect(Math.abs(item.power - 377)).toBeLessThan(2);
    expect(Math.abs(item.price - 2260)).toBeLessThan(12);
    expect(renderItemName(data, item)).toBe('Legendary Legendary Epic Bad Cursed Torn Worn Expensive Ring of Justice of Vampirism from Far Lands');
    // Eleven rolls: Legendary×2, Epic and Justice display four; seven are hidden.
    expect(renderItemName(data, item, true)).toBe('Legendary×2 Epic … Ring of Justice +7');
  });
  it('adds flats before multiplicative duplicates, then curses outside the product', () => {
    const item = plainItem('stack', 'armor', 0, [{ id: 'of_the_bull' }, { id: 'legendary' }, { id: 'legendary' }, { id: 'cursed', curseStat: 'maxHp' }]);
    expect(item.stats.maxHp).toBeCloseTo(30 * 2.25 * 1.5 - 15);
    expect(plainItem('crit', 'ring', 20, [{ id: 'divine' }, { id: 'divine' }]).stats.crit).toBe(64);
  });
  it('keeps negative items uncapped, but never pays negative gold', () => {
    const item = plainItem('negative', 'armor', 0, Array.from({ length: 10 }, () => ({ id: 'cursed', curseStat: 'regen' as StandardStat })));
    expect(item.stats.regen).toBeCloseTo(-4.5);
    const negative = plainItem('negative', 'weapon', 0, Array.from({ length: 12 }, () => ({ id: 'squeaky' })));
    expect(negative.power).toBe(-100);
    expect(negative.price).toBe(0);
    expect(negative.rarity).toBe('grey');
  });
  it('separates price-only effects, counterfeit appearance, and miracle metadata', () => {
    const base = plainItem();
    const cheap = plainItem('cheap', 'weapon', 0, [{ id: 'cheap' }]);
    expect(cheap.stats).toEqual(base.stats); expect(cheap.power).toBe(base.power); expect(cheap.price).toBe(base.price / 2);
    const fake = plainItem('fake', 'weapon', 0, [{ id: 'counterfeit' }]);
    expect(fake.price).toBe(4); expect(fake.sellPrice).toBeCloseTo(1.2); expect(fake.shopPrice).toBe(120);
    expect(renderItemName(data, fake, false, true)).toBe('Golden Sword');
    const holy = plainItem('holy', 'weapon', 0, [{ id: 'holy' }, { id: 'holy' }, { id: 'heretical' }]);
    expect(holy.blessingHealMultiplier).toBeCloseTo(1.21); expect(holy.miracleMultiplier).toBe(0.9);
    expect(plainItem('blessed', 'weapon', 0, [{ id: 'blessed' }]).godBlessed).toBe(false);
  });
  it('orders by group while retaining roll order, resolves every word through data', () => {
    const item = plainItem('name', 'weapon', 0, [{ id: 'from_tradeburg' }, { id: 'fine' }, { id: 'epic' }, { id: 'of_haste' }, { id: 'bad' }]);
    expect(itemNameParts(data, item).map((p) => p.id)).toEqual(['fine', 'epic', 'bad', 'sword', 'of_haste', 'from_tradeburg']);
    const renamed = { ...data, bases: data.bases.map((b) => ({ ...b, name_en: `base:${b.id}` })), modifiers: data.modifiers.map((m) => ({ ...m, name_en: `mod:${m.id}` })) };
    expect(renderItemName(renamed, item)).toBe('mod:fine mod:epic mod:bad base:sword mod:of_haste mod:from_tradeburg');
  });
  it.each([[0.89, 'grey'], [0.9, 'white'], [1.2, 'green'], [1.6, 'blue'], [2.2, 'purple'], [3.5, 'purple'], [3.5001, 'orange']] as const)('ratio %s has rarity %s', (ratio, rarity) => expect(rarityForRatio(ratio)).toBe(rarity));
  it('rejects malformed recipes and random pools', () => {
    expect(() => buildItem(data, { ...recipe, level: -1 })).toThrow();
    expect(() => buildItem(data, { ...recipe, baseStats: [] })).toThrow();
    expect(() => buildItem(data, { ...recipe, modifiers: [{ id: 'cursed' }] })).toThrow();
    expect(() => buildItem(data, { ...recipe, modifiers: [{ id: 'from_far_lands' }] })).toThrow();
    expect(() => plainItem('x', 'weapon', 0, [{ id: 'missing' }])).toThrow();
    expect(() => weightedPick(seedRng(0), [], () => 1)).toThrow();
  });
});

describe('seeded item generation', () => {
  it.each([[0, 1, 3], [1, 1, 3], [5, 1, 3], [6, 3, 6], [15, 3, 6], [16, 6, 12], [20, 6, 12]])('zone %s respects count range', (level, min, max) => {
    expect(modifierCountRange(level)).toEqual([min, max]);
    const counts = new Set<number>();
    for (let seed = 0; seed < 300; seed++) {
      const { item } = generateItem(data, seedRng(seed), { id: 'test', level });
      counts.add(item.modifiers.length);
      expect(item.modifiers.length).toBeGreaterThanOrEqual(min!); expect(item.modifiers.length).toBeLessThanOrEqual(max!);
      for (const roll of item.modifiers) expect(data.modifiers.find((m) => m.id === roll.id)!.min_zone).toBeLessThanOrEqual(Math.max(1, level!));
    }
    expect(counts.has(min!)).toBe(true); expect(counts.has(max!)).toBe(true);
  });
  it('generates 100 deterministic JSON-safe items without mutating input content/RNG', () => {
    const rng = deepFreeze(seedRng(123));
    const content = deepFreeze(data);
    const before = JSON.stringify({ rng, content });
    const run = () => { let cursor = rng; return Array.from({ length: 100 }, (_, i) => { const result = generateItem(content, cursor, { id: `loot-${i}`, level: 20 }); cursor = result.rng; return result.item; }); };
    const first = run(); expect(run()).toEqual(first); expect(JSON.parse(JSON.stringify(first))).toEqual(first);
    expect(JSON.stringify({ rng, content })).toBe(before);
    expect(new Set(first.map((i) => i.slot))).toEqual(new Set(GEAR_SLOTS));
    expect(first.some((i) => new Set(i.modifiers.map((m) => m.id)).size < i.modifiers.length)).toBe(true);
  });
  it('uses descending count weights and CSV modifier weights', () => {
    const counts = [0, 0, 0];
    let rng = seedRng(777);
    for (let i = 0; i < 3000; i++) { const r = generateItem(data, rng, { id: 'distribution', level: 1 }); rng = r.rng; counts[r.item.modifiers.length - 1]!++; }
    expect(counts[0]).toBeGreaterThan(counts[1]!); expect(counts[1]).toBeGreaterThan(counts[2]!);
    const only = { ...data, modifiers: [data.modifiers.find((m) => m.id === 'fine')!] };
    expect(generateItem(only, seedRng(1), { id: 'only', level: 20 }).item.modifiers.every((m) => m.id === 'fine')).toBe(true);
  });
  it('ring/amulet base rolls stay valid across seeds', () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 0xffffffff }), (seed) => {
      for (const slot of ['ring', 'amulet'] as const) {
        const { item } = generateItem(data, seedRng(seed), { id: 'property', level: 12, slot });
        expect(item.baseStats.length).toBe(slot === 'ring' ? 1 : 2);
        expect(new Set(item.baseStats).size).toBe(item.baseStats.length);
        expect(buildItem(data, item).stats).toEqual(item.stats);
      }
    }), { numRuns: 100 });
  });
});
