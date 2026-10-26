import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const sha = git('rev-parse', 'HEAD');
if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('Expected a full Git commit SHA');
if (process.env.GITHUB_SHA && process.env.GITHUB_SHA !== sha) {
  throw new Error('GITHUB_SHA does not match the checked-out commit');
}
const dirty = git('status', '--porcelain', '--untracked-files=normal') !== '';
if (process.env.GITHUB_ACTIONS === 'true' && dirty) {
  throw new Error('CI provenance requires an unmodified source checkout');
}
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const pnpmVersion = execFileSync('pnpm', ['--version'], { cwd: root, encoding: 'utf8' }).trim();
if (`pnpm@${pnpmVersion}` !== pkg.packageManager) throw new Error('Use the pinned pnpm version');
const lock = await readFile(new URL('../pnpm-lock.yaml', import.meta.url));
const metadata = {
  schemaVersion: 1,
  version: pkg.version,
  commit: sha,
  dirty,
  builtAt: new Date().toISOString(),
  node: process.version,
  packageManager: pkg.packageManager,
  pnpm: pnpmVersion,
  lockfileSha256: createHash('sha256').update(lock).digest('hex'),
  base: './',
  repository: process.env.GITHUB_REPOSITORY ?? null,
  runId: process.env.GITHUB_RUN_ID ?? null,
  runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
};
// Build-time receipt only: never fabricate a revision or inject one into saved games.
await writeFile(
  new URL('../apps/web/dist/build-info.json', import.meta.url),
  `${JSON.stringify(metadata, null, 2)}\n`,
);
await writeFile(new URL('../apps/web/dist/.nojekyll', import.meta.url), '');
console.log(
  `Build provenance: ${sha} (${dirty ? 'dirty local checkout' : 'clean'}), ${pkg.version}`,
);
