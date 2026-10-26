import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const srcDir = new URL('../src/', import.meta.url);
const files = readdirSync(srcDir).filter((f) => f.endsWith('.ts'));

/** Things the simulation must never touch (GDD "Engine rules from day one"). */
const FORBIDDEN: ReadonlyArray<[string, RegExp]> = [
  ['unseeded randomness', /Math\.random|crypto\./],
  ['non-portable math', /Math\.(pow|exp|log|sin|cos|tan|sqrt|cbrt|hypot)\b|[\w)\]] ?\*\* ?[\w(]/],
  ['clock reads', /\bDate\b|performance\.|setTimeout|setInterval|requestAnimationFrame/],
  ['DOM or storage', /\bdocument\b|\bwindow\b|localStorage|indexedDB|navigator\./],
  ['UI libraries', /preact|@preact\/signals|comlink/],
  ['locale formatting', /\bIntl\.|toLocale/],
];

describe('sim package purity', () => {
  it('has source files to check', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  for (const file of files) {
    it(`${file} stays framework-free and deterministic`, () => {
      const source = readFileSync(new URL(file, srcDir), 'utf8');
      for (const [label, pattern] of FORBIDDEN) {
        expect(pattern.test(source), `${file}: ${label} (${pattern})`).toBe(false);
      }
      for (const match of source.matchAll(/from '([^']+)'/g)) {
        expect(match[1]?.startsWith('./'), `${file} imports ${match[1]}`).toBe(true);
      }
    });
  }
});
