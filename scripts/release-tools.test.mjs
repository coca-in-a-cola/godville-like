import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

const temp = mkdtempSync(join(tmpdir(), 'godville-release-test-'));
after(() => rmSync(temp, { recursive: true, force: true }));
const source = new URL('../', import.meta.url);
function fixture(name) {
  const root = join(temp, name);
  mkdirSync(join(root, 'scripts'), { recursive: true });
  mkdirSync(join(root, 'apps/web/dist'), { recursive: true });
  for (const script of ['build-metadata.mjs', 'package-release.py']) {
    copyFileSync(new URL(`scripts/${script}`, source), join(root, 'scripts', script));
  }
  copyFileSync(new URL('package.json', source), join(root, 'package.json'));
  writeFileSync(join(root, 'pnpm-lock.yaml'), 'fixture lockfile\n');
  writeFileSync(join(root, '.gitignore'), 'apps/web/dist/\n');
  writeFileSync(join(root, 'apps/web/dist/index.html'), '<!doctype html>fixture\n');
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  git('init', '-q');
  git('add', '.');
  git(
    '-c',
    'user.name=Release Test',
    '-c',
    'user.email=test@example.invalid',
    'commit',
    '-qm',
    'fixture',
  );
  const sha = git('rev-parse', 'HEAD');
  const run = (env = {}) =>
    spawnSync(process.execPath, ['scripts/build-metadata.mjs'], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, GITHUB_SHA: '', GITHUB_ACTIONS: '', ...env },
    });
  return { root, sha, run };
}

test('clean receipt records actual source and toolchain inputs', () => {
  const f = fixture('clean');
  assert.equal(f.run({ GITHUB_SHA: f.sha, GITHUB_ACTIONS: 'true' }).status, 0);
  const info = JSON.parse(readFileSync(join(f.root, 'apps/web/dist/build-info.json'), 'utf8'));
  assert.equal(info.commit, f.sha);
  assert.equal(info.dirty, false);
  assert.equal(info.node, process.version);
  assert.equal(`pnpm@${info.pnpm}`, info.packageManager);
  assert.equal(
    info.lockfileSha256,
    createHash('sha256').update('fixture lockfile\n').digest('hex'),
  );
  assert.equal(readFileSync(join(f.root, 'apps/web/dist/.nojekyll'), 'utf8'), '');
});
test('mismatched CI SHA is rejected rather than fabricated', () => {
  const f = fixture('mismatch');
  const result = f.run({ GITHUB_SHA: '0'.repeat(40) });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /does not match/);
});
test('dirty CI is rejected while local dirt is honestly recorded', () => {
  const f = fixture('dirty');
  writeFileSync(join(f.root, 'untracked.txt'), 'change');
  assert.notEqual(f.run({ GITHUB_ACTIONS: 'true' }).status, 0);
  assert.equal(f.run().status, 0);
  assert.equal(JSON.parse(readFileSync(join(f.root, 'apps/web/dist/build-info.json'))).dirty, true);
});
test('packager creates a readable zip and matching checksum for a clean build', () => {
  const f = fixture('archive');
  assert.equal(f.run().status, 0);
  const out = join(temp, 'archive-output');
  const result = spawnSync('python3', ['scripts/package-release.py', out], {
    cwd: f.root,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  const version = JSON.parse(readFileSync(join(f.root, 'package.json'))).version;
  const name = `godville-like-${version}-dist.zip`;
  assert.equal(
    readFileSync(join(out, `${name}.sha256`), 'utf8'),
    `${createHash('sha256')
      .update(readFileSync(join(out, name)))
      .digest('hex')}  ${name}\n`,
  );
  execFileSync('python3', [
    '-c',
    'import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; assert {"index.html",".nojekyll","build-info.json"} <= set(z.namelist())',
    join(out, name),
  ]);
});
test('packager rejects dirty and stale receipt inputs', () => {
  const f = fixture('reject-archive');
  assert.equal(f.run().status, 0);
  const receipt = join(f.root, 'apps/web/dist/build-info.json');
  const info = JSON.parse(readFileSync(receipt));
  writeFileSync(receipt, JSON.stringify({ ...info, commit: '0'.repeat(40) }));
  const pack = () =>
    spawnSync('python3', ['scripts/package-release.py', join(temp, 'rejected-output')], {
      cwd: f.root,
      encoding: 'utf8',
    });
  assert.notEqual(pack().status, 0);
  writeFileSync(receipt, JSON.stringify(info));
  writeFileSync(join(f.root, 'dirty.txt'), 'change');
  assert.notEqual(pack().status, 0);
});
