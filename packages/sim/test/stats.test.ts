import { describe, expect, it } from 'vitest';
import { HERO_BASE_STATS, normalizeStats, sumStatBlocks, validateStatBlock, type StatBlock } from '../src/index.ts';
import { DUMMY, deepFreeze, stats } from './fixtures.ts';

describe('stat normalization', () => {
  it('converts the GDD hero base to integer units', () => {
    expect(normalizeStats(HERO_BASE_STATS)).toEqual({
      maxHp: 1000,
      damageMin: 4,
      damageMax: 6,
      attackSpeedBp: 0,
      defense: 0,
      critBp: 0,
      evasionBp: 0,
      regenMilliHp: 500,
      vampirismBp: 0,
      counterBp: 0,
    });
  });

  it('applies the GDD caps', () => {
    const n = normalizeStats(stats({ attackSpeed: 350, crit: 80, evasion: 75, vampirism: 45, counter: 99 }));
    expect(n.attackSpeedBp).toBe(20000);
    expect(n.critBp).toBe(5000);
    expect(n.evasionBp).toBe(6000);
    expect(n.vampirismBp).toBe(3000);
    expect(n.counterBp).toBe(4000);
  });

  it('caps aggregated totals, not the blocks summed into them', () => {
    const ring = stats({ maxHp: 0, crit: 80 });
    expect(sumStatBlocks([ring]).crit).toBe(80); // an absurd item keeps its value
    const total = sumStatBlocks([HERO_BASE_STATS, ring, stats({ maxHp: 0, crit: 40 })]);
    expect(total.crit).toBe(120);
    expect(total.maxHp).toBe(100);
    expect(normalizeStats(total).critBp).toBe(5000);
  });

  it('applies documented lower bounds to negative totals', () => {
    const n = normalizeStats(
      stats({ attackSpeed: -150, defense: -5, damageMin: -3, damageMax: -1, crit: -10, evasion: -2, regen: -1.8 }),
    );
    expect(n.attackSpeedBp).toBe(-9000);
    expect(n.defense).toBe(0);
    expect(n.damageMin).toBe(0);
    expect(n.damageMax).toBe(0);
    expect(n.critBp).toBe(0);
    expect(n.evasionBp).toBe(0);
    expect(n.regenMilliHp).toBe(-1800);
    expect(normalizeStats(stats({ damageMin: -2, damageMax: 3 }))).toMatchObject({ damageMin: 0, damageMax: 3 });
  });

  it('rounds half up into integer units', () => {
    const n = normalizeStats(stats({ maxHp: 87.46, damageMin: 4.5, damageMax: 7.5, defense: 0.6, crit: 43.75 }));
    expect(n.maxHp).toBe(875);
    expect(n.damageMin).toBe(5);
    expect(n.damageMax).toBe(8);
    expect(n.defense).toBe(1);
    expect(n.critBp).toBe(4375);
    expect(Object.is(normalizeStats(stats({ regen: -0.0004 })).regenMilliHp, 0)).toBe(true);
  });

  it('reports field errors for invalid input', () => {
    const result = validateStatBlock({
      ...DUMMY,
      maxHp: 0,
      damageMin: 5,
      damageMax: 2,
      crit: Number.NaN,
      evasion: Number.POSITIVE_INFINITY,
      counter: '3',
      regen: 2_000_000,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual(
      expect.arrayContaining([
        { field: 'maxHp', code: 'max_hp_too_low' },
        { field: 'damageMin', code: 'min_above_max' },
        { field: 'crit', code: 'not_a_number' },
        { field: 'evasion', code: 'not_a_number' },
        { field: 'counter', code: 'not_a_number' },
        { field: 'regen', code: 'out_of_range' },
      ]),
    );
    expect(validateStatBlock(null).ok).toBe(false);
    const { vampirism: _omitted, ...missing } = DUMMY;
    expect(validateStatBlock(missing)).toEqual({ ok: false, errors: [{ field: 'vampirism', code: 'not_a_number' }] });
  });

  it('throws instead of normalizing an invalid block, and never mutates input', () => {
    expect(() => normalizeStats(stats({ damageMin: 9, damageMax: 1 }))).toThrow(RangeError);
    const frozen = deepFreeze<StatBlock>({ ...HERO_BASE_STATS, crit: 99 });
    expect(normalizeStats(frozen).critBp).toBe(5000);
    expect(frozen.crit).toBe(99);
  });
});
