/**
 * Build gate: validates every CSV under the root data/ directory.
 * Run with `pnpm validate:data` (Node strips the TypeScript types).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DATA_FILE_NAMES, DataValidationError, loadGameData, type DataSources } from '../src/index.ts';

const dataDir = fileURLToPath(new URL('../../../data/', import.meta.url));

const sources = Object.fromEntries(
  DATA_FILE_NAMES.map((file) => [file, readFileSync(`${dataDir}${file}.csv`, 'utf8')]),
) as DataSources;

try {
  const data = loadGameData(sources);
  const summary = DATA_FILE_NAMES.map((file) => `${file}=${data[file].length}`).join(' ');
  console.log(`data ok: ${summary}`);
} catch (error) {
  console.error(error instanceof DataValidationError ? error.message : error);
  process.exitCode = 1;
}
