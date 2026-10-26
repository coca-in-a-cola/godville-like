import { describe, expect, it } from 'vitest';
import { DEFAULT_FAMILY_TUNING, generateItem, generateMonster, monsterStats, seedRng, type MonsterFamily } from '../src/index.ts';
import { lootData } from './loot-fixtures.ts';
import { deepFreeze } from './fixtures.ts';
const families = Object.keys(DEFAULT_FAMILY_TUNING) as MonsterFamily[];
describe('monster formulas and seeded content selection', () => {
  it.each(families)('%s follows exact level formulas and the family interval contract', (family) => {
    for (const level of [0, 1, 10, 20]) {
      const tuning = DEFAULT_FAMILY_TUNING[family]; const stats = monsterStats(level, family);
      expect(stats.maxHp).toBe(40 + 18 * level);
      expect(stats.damageMin).toBe((3 + 1.5 * level) * tuning.damageMultiplier);
      expect(stats.damageMax).toBe((5 + 2.5 * level) * tuning.damageMultiplier);
      expect(stats.defense).toBe(0.6 * level * tuning.defenseMultiplier);
      expect(1.5 / (1 + stats.attackSpeed / 100)).toBeCloseTo(tuning.intervalSeconds);
      expect(tuning.intervalSeconds).toBeGreaterThanOrEqual(1.2); expect(tuning.intervalSeconds).toBeLessThanOrEqual(2.4);
      expect(stats).toMatchObject({ crit: tuning.crit, evasion: tuning.evasion, vampirism: tuning.vampirism, counter: 0, regen: 0 });
    }
  });
  it('retains the explicit family differences', () => {
    expect(monsterStats(10, 'spider').damageMax).toBe(24);
    expect(monsterStats(10, 'golem').defense).toBe(12);
    expect(monsterStats(10, 'wraith').evasion).toBe(15);
    expect(monsterStats(10, 'leech').vampirism).toBe(15);
    expect(monsterStats(10, 'brute').crit).toBe(15);
  });
  it('selects real CSV names and families deterministically without input mutation', () => {
    const names = deepFreeze(lootData.monsters); const rng = deepFreeze(seedRng(123));
    const before = JSON.stringify({ names, rng });
    const run = () => generateMonster(names, rng, { id: 'monster', level: 10 });
    expect(run()).toEqual(run()); expect(JSON.stringify({ names, rng })).toBe(before);
    for (const family of families) {
      const result = generateMonster(names, rng, { id: family, level: 10, family });
      expect(result.monster.family).toBe(family);
      expect(names.find((n) => n.id === result.monster.contentId)?.family).toBe(family);
    }
    expect(new Set(Array.from({ length: 100 }, (_, seed) => generateMonster(names, seedRng(seed), { id: 'm', level: 1 }).monster.family))).toEqual(new Set(families));
  });
  it('rejects invalid levels, empty name pools and invalid family tuning', () => {
    for (const level of [-1, 0.5, NaN, Infinity]) expect(() => monsterStats(level, 'spider')).toThrow();
    expect(() => generateMonster([], seedRng(0), { id: 'm', level: 1 })).toThrow();
    for (const intervalSeconds of [1.19, 2.41, NaN]) expect(() => monsterStats(1, 'spider', { ...DEFAULT_FAMILY_TUNING, spider: { ...DEFAULT_FAMILY_TUNING.spider, intervalSeconds } })).toThrow();
    expect(() => monsterStats(1, 'spider', { ...DEFAULT_FAMILY_TUNING, spider: { ...DEFAULT_FAMILY_TUNING.spider, damageMultiplier: -1 } })).toThrow();
  });
  it('pins a real seeded item and monster golden result', () => {
    const item = generateItem(lootData, seedRng(123), { id: 'golden-item', level: 20 });
    const monster = generateMonster(lootData.monsters, item.rng, { id: 'golden-monster', level: 20 });
    expect({ item, monster }).toMatchSnapshot();
  });
});
