import { readFileSync } from 'node:fs';
import { DATA_FILE_NAMES, loadGameData, type DataSources } from '../../data/src/index.ts';
export const lootData = loadGameData(Object.fromEntries(DATA_FILE_NAMES.map((f) => [f, readFileSync(new URL(`../../../data/${f}.csv`, import.meta.url), 'utf8')])) as DataSources);
