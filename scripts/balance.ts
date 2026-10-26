/** Node >=22.18 native type stripping; all imports are relative, no runtime alias loader. */
import { readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { loadGameData } from '../packages/data/src/load.ts';
import { balanceLoadout, runBalance } from '../packages/sim/src/balance.ts';
import { normalizeStats } from '../packages/sim/src/stats.ts';
const args = process.argv.slice(2);
const allowed = ['--zones', '--seed', '--trials', '--max-ticks', '--output'];
const options: Record<string, string> = {};
for (let i = 0; i < args.length; i += 2) {
  const key = args[i]!; const value = args[i + 1];
  if (!allowed.includes(key) || value === undefined || options[key] !== undefined) throw new Error(`Usage: pnpm balance [--zones 0,1,5,10,20,30] [--seed 20261027] [--trials 10000] [--max-ticks 6000] [--output /absolute/result.json]`);
  options[key] = value;
}
function number(raw: string): number {
  if (!/^\d+$/.test(raw)) throw new RangeError(`expected unsigned integer: ${raw}`);
  return Number(raw);
}
const zones = (options['--zones'] ?? '0,1,5,10,20,30').split(',').map(number);
const seed = number(options['--seed'] ?? '20261027');
const trials = number(options['--trials'] ?? '10000');
const maxTicks = number(options['--max-ticks'] ?? '6000');
const csv = (name: string) => readFileSync(new URL(`../data/${name}.csv`, import.meta.url), 'utf8');
const data = loadGameData({ bases: csv('bases'), modifiers: csv('modifiers'), monsters: csv('monsters'), towns: csv('towns'), trophies: csv('trophies') });
const measurements = zones.map((zone) => {
  const loadout = balanceLoadout(data, zone, seed);
  const started = performance.now();
  const result = runBalance({ hero: loadout.hero, monsters: data.monsters, zone, seed, trials, maxTicks });
  const elapsedMs = performance.now() - started;
  return { zone, seed, trials, maxTicks, loadout, normalizedHero: normalizeStats(loadout.hero), result, elapsedMs };
});
const report = { schemaVersion: 1, policy: 'fixed generated six-slot kit; heroLevel=max(1,zone); gearLevel=zone; uniform families; fresh HP each trial; no interventions', measurements };
const json = JSON.stringify(report, null, 2) + '\n';
if (options['--output']) writeFileSync(options['--output'], json);
process.stdout.write(json);
