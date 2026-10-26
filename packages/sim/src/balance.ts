/** Dev-only measurement harness: no world state, interventions, or alternative combat formulas. */
import { createFight, TICK_MS } from './fight.ts';
import { runFight } from './runner.ts';
import { isUint32, mixSeed, seedRng } from './rng.ts';
import { HERO_BASE_STATS, normalizeStats, type StatBlock } from './stats.ts';
import { aggregateGearStats, generateItem, GEAR_SLOTS, type GearItem, type LootContent } from './loot.ts';
import { generateMonster, monsterStats, type MonsterFamily, type MonsterName } from './monsters.ts';

export const BALANCE_FAMILIES: readonly MonsterFamily[] = ['spider', 'golem', 'wraith', 'leech', 'brute'];
export interface BalanceInput {
  hero: StatBlock;
  monsters: readonly MonsterName[];
  zone: number;
  seed: number;
  trials: number;
  maxTicks: number;
}
export interface BalanceSummary {
  trials: number; wins: number; losses: number; draws: number; unresolved: number;
  winRate: number;
  /** Fraction of normalized starting hero HP. Includes deaths and censored/unresolved fights. */
  meanHpAll: number;
  /** null when no wins. NOT averaged over losses/draws/unresolved. */
  meanHpWins: number | null;
  /** Includes capped durations of unresolved fights; not an estimate of their completion time. */
  meanDurationSeconds: number;
}
export interface BalanceResult extends BalanceSummary {
  perFamily: Record<MonsterFamily, BalanceSummary>;
  completed: boolean;
}
interface Totals { trials: number; wins: number; losses: number; draws: number; unresolved: number; hp: number; winHp: number; ticks: number }
function empty(): Totals { return { trials: 0, wins: 0, losses: 0, draws: 0, unresolved: 0, hp: 0, winHp: 0, ticks: 0 }; }
function summarize(t: Totals): BalanceSummary {
  return { trials: t.trials, wins: t.wins, losses: t.losses, draws: t.draws, unresolved: t.unresolved, winRate: t.trials ? t.wins / t.trials : 0, meanHpAll: t.trials ? t.hp / t.trials : 0, meanHpWins: t.wins ? t.winHp / t.wins : null, meanDurationSeconds: t.trials ? t.ticks * TICK_MS / 1000 / t.trials : 0 };
}
function integer(value: number, min: number, max: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError(`invalid ${name}: expected integer ${min}..${max}`);
}
/** Domain-separated index seeds: changing combat duration never consumes the next encounter's stream. */
export function balanceTrialSeeds(seed: number, index: number): { encounter: number; combat: number } {
  if (!isUint32(seed)) throw new RangeError('invalid seed');
  integer(index, 0, 99999, 'trial index');
  const trial = mixSeed(seed, index);
  return { encounter: mixSeed(trial, 0x454e434f), combat: mixSeed(trial, 0x46494748) };
}
/** Synchronous pure iterator. Workers yield to their event loop between bounded chunks. */
export function* balanceChunks(input: BalanceInput, chunkSize = 100): Generator<BalanceResult, BalanceResult> {
  integer(input.zone, 0, 100, 'zone');
  integer(input.trials, 1, 100000, 'trials');
  integer(input.maxTicks, 0, 60000, 'maxTicks');
  integer(chunkSize, 1, 1000, 'chunkSize');
  if (input.trials * input.maxTicks > 600000000) throw new RangeError('batch tick budget exceeds 600 million');
  if (!isUint32(input.seed)) throw new RangeError('invalid seed');
  normalizeStats(input.hero);
  if (!Array.isArray(input.monsters) || input.monsters.length > 10000 || BALANCE_FAMILIES.some((f) => !input.monsters.some((m) => m.family === f)) || input.monsters.some((m) => !BALANCE_FAMILIES.includes(m.family) || !m.id || !m.name_en)) throw new RangeError('monster table must contain all five families and valid names');
  for (const f of BALANCE_FAMILIES) normalizeStats(monsterStats(input.zone, f));
  const total = empty();
  const families = Object.fromEntries(BALANCE_FAMILIES.map((f) => [f, empty()])) as Record<MonsterFamily, Totals>;
  const snapshot = (): BalanceResult => ({ ...summarize(total), completed: total.trials === input.trials, perFamily: Object.fromEntries(BALANCE_FAMILIES.map((f) => [f, summarize(families[f])])) as Record<MonsterFamily, BalanceSummary> });
  for (let i = 0; i < input.trials; i++) {
    const seeds = balanceTrialSeeds(input.seed, i);
    const { monster } = generateMonster(input.monsters, seedRng(seeds.encounter), { id: `batch_${i}`, level: input.zone });
    const r = runFight(createFight({ seed: seeds.combat, hero: input.hero, monster: monster.stats }), { maxTicks: input.maxTicks, collectEvents: false });
    const hp = r.state.hero.hp / r.state.hero.stats.maxHp;
    for (const t of [total, families[monster.family]]) {
      t.trials++; t.hp += hp; t.ticks += r.ticks;
      if (r.outcome === 'hero_won') { t.wins++; t.winHp += hp; }
      else if (r.outcome === 'monster_won') t.losses++;
      else if (r.outcome === 'draw') t.draws++;
      else t.unresolved++;
    }
    if ((i + 1) % chunkSize === 0 && i + 1 < input.trials) yield snapshot();
  }
  return snapshot();
}
export function runBalance(input: BalanceInput): BalanceResult {
  const chunks = balanceChunks(input);
  let step = chunks.next();
  while (!step.done) step = chunks.next();
  return step.value;
}
/** One reproducible generated item per slot, held fixed across all fights (no cherry-picking).
 * Hero level=max(1,zone); growth matches world.ts: +8 HP and +0.5 damage per level after 1.
 * Gear level=zone. This mapping is an explicit measurement assumption, not a world guarantee.
 */
export function balanceLoadout(content: LootContent, zone: number, seed: number): { heroLevel: number; base: StatBlock; gear: GearItem[]; hero: StatBlock } {
  integer(zone, 0, 100, 'zone');
  if (!isUint32(seed)) throw new RangeError('invalid seed');
  const heroLevel = Math.max(1, zone);
  const growth = heroLevel - 1;
  const base = { ...HERO_BASE_STATS, maxHp: HERO_BASE_STATS.maxHp + 8 * growth, damageMin: HERO_BASE_STATS.damageMin + 0.5 * growth, damageMax: HERO_BASE_STATS.damageMax + 0.5 * growth };
  const gear = GEAR_SLOTS.map((slot, index) => generateItem(content, seedRng(mixSeed(mixSeed(seed, 0x47454152), index)), { id: `balance_${slot}`, level: zone, slot }).item);
  const hero = aggregateGearStats(base, gear);
  normalizeStats(hero);
  return { heroLevel, base, gear, hero };
}
