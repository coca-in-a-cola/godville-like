import { describe, expect, it } from 'vitest';
import { balanceChunks, balanceLoadout, balanceTrialSeeds, runBalance, type BalanceInput } from '../src/balance.ts';
import { createFight } from '../src/fight.ts';
import { runFight } from '../src/runner.ts';
import { generateMonster } from '../src/monsters.ts';
import { seedRng } from '../src/rng.ts';
import { HERO_BASE_STATS } from '../src/stats.ts';
import { lootData } from './loot-fixtures.ts';
const input = (): BalanceInput => ({ hero: { ...HERO_BASE_STATS }, monsters: structuredClone(lootData.monsters), zone: 1, seed: 20261027, trials: 200, maxTicks: 6000 });
function freeze(value: unknown): void {
  if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); }
}
describe('combat balance batch', () => {
  it('replays exactly and never mutates input (including nested CSV content)', () => {
    const a = input(); const before = structuredClone(a); freeze(a);
    expect(runBalance(a)).toEqual(runBalance(a)); expect(a).toEqual(before);
    const content = structuredClone(lootData); const saved = structuredClone(content); freeze(content);
    const kit = balanceLoadout(content, 10, 42);
    expect(kit).toEqual(balanceLoadout(content, 10, 42)); expect(content).toEqual(saved);
    expect(new Set(kit.gear.map((g) => g.slot)).size).toBe(6);
    expect(kit.gear.every((g) => g.level === 10)).toBe(true);
    expect(kit.heroLevel).toBe(10); expect(kit.base.maxHp).toBe(172);
  });
  it('chunk sizes do not change outcomes and yields detached snapshots', () => {
    const a = input(); const iterator = balanceChunks(a, 17);
    let next = iterator.next(); const first = structuredClone(next.value);
    expect(next.value.trials).toBe(17);
    while (!next.done) next = iterator.next();
    expect(next.value).toEqual(runBalance(a)); expect(first.trials).toBe(17);
    const r = next.value;
    expect(r.wins + r.losses + r.draws + r.unresolved).toBe(a.trials);
    expect(Object.values(r.perFamily).reduce((n, f) => n + f.trials, 0)).toBe(a.trials);
    expect(r.completed).toBe(true);
  });
  it('uses exactly the existing generated monster and runFight for each independently seeded trial', () => {
    const a = { ...input(), trials: 1 };
    const seeds = balanceTrialSeeds(a.seed, 0);
    expect(seeds.encounter).not.toBe(seeds.combat);
    expect(balanceTrialSeeds(a.seed, 1)).not.toEqual(seeds);
    const { monster } = generateMonster(a.monsters, seedRng(seeds.encounter), { id: 'manual', level: a.zone });
    const r = runFight(createFight({ seed: seeds.combat, hero: a.hero, monster: monster.stats }), { maxTicks: a.maxTicks, collectEvents: false });
    const batch = runBalance(a);
    expect(batch.wins).toBe(r.outcome === 'hero_won' ? 1 : 0);
    expect(batch.meanHpAll).toBe(r.state.hero.hp / r.state.hero.stats.maxHp);
    expect(batch.meanDurationSeconds).toBe(r.ticks / 10);
    expect(batch.perFamily[monster.family].trials).toBe(1);
  });
  it('does not disguise unresolved fights as losses or wins', () => {
    const r = runBalance({ ...input(), maxTicks: 0 });
    expect(r.unresolved).toBe(200); expect(r.wins).toBe(0); expect(r.losses).toBe(0);
    expect(r.meanHpWins).toBeNull(); expect(r.meanHpAll).toBe(1); expect(r.meanDurationSeconds).toBe(0);
  });
  it('reports actual losses separately with no conditional HP when no wins', () => {
    const r = runBalance({ ...input(), hero: { ...HERO_BASE_STATS, maxHp: 0.1, damageMin: 0, damageMax: 0, regen: 0 } });
    expect(r.losses).toBe(200); expect(r.meanHpWins).toBeNull(); expect(r.meanHpAll).toBe(0);
  });
  it.each([
    { trials: 0 }, { trials: 100001 }, { trials: 1.2 }, { seed: -1 }, { seed: 4294967296 }, { seed: NaN },
    { zone: -1 }, { zone: 101 }, { zone: 1.5 }, { maxTicks: -1 }, { maxTicks: 60001 },
    { maxTicks: 60000, trials: 100000 }, { monsters: [] }, { monsters: lootData.monsters.filter((m) => m.family !== 'brute') },
    { hero: { ...HERO_BASE_STATS, maxHp: Infinity } },
  ])('rejects invalid declarative input %j before running', (patch) => {
    expect(() => runBalance({ ...input(), ...patch })).toThrow(RangeError);
  });
  it('rejects invalid loadouts/chunk budgets', () => {
    expect(() => balanceLoadout(lootData, -1, 1)).toThrow();
    expect(() => balanceLoadout(lootData, 1, -1)).toThrow();
    expect(() => balanceChunks(input(), 0).next()).toThrow();
  });
});
