/** Parses and validates CSV game data. Any malformed row or duplicate id throws. */

import Papa from 'papaparse';
import { DATA_FILE_NAMES, DATA_SCHEMAS, type DataFileName, type DataRows } from './schemas.ts';

export interface DataIssue {
  file: string;
  /** 1-based CSV line (the header is line 1); 0 for file-level issues. */
  line: number;
  column: string | null;
  message: string;
}

export class DataValidationError extends Error {
  readonly issues: readonly DataIssue[];

  constructor(issues: readonly DataIssue[]) {
    super(
      `invalid game data:\n` +
        issues.map((i) => `  ${i.file}:${i.line}${i.column ? ` [${i.column}]` : ''} ${i.message}`).join('\n'),
    );
    this.name = 'DataValidationError';
    this.issues = issues;
  }
}

function expectedColumns(file: DataFileName): string[] {
  return Object.keys(DATA_SCHEMAS[file].shape);
}

/** Validates one CSV file and returns its rows, or the list of issues. */
export function parseTable<F extends DataFileName>(
  file: F,
  text: string,
): { rows: DataRows[F][]; issues: DataIssue[] } {
  const fileName = `${file}.csv`;
  const issues: DataIssue[] = [];
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: 'greedy' });

  for (const error of parsed.errors) {
    issues.push({
      file: fileName,
      line: error.row === undefined ? 0 : error.row + 2,
      column: null,
      message: `${error.code}: ${error.message}`,
    });
  }

  const header = parsed.meta.fields ?? [];
  const expected = expectedColumns(file);
  if (header.join(',') !== expected.join(',')) {
    issues.push({
      file: fileName,
      line: 1,
      column: null,
      message: `header must be "${expected.join(',')}", got "${header.join(',')}"`,
    });
    return { rows: [], issues };
  }

  const schema = DATA_SCHEMAS[file];
  const rows: DataRows[F][] = [];
  const seen = new Map<string, number>();
  parsed.data.forEach((record, index) => {
    const line = index + 2;
    const result = schema.safeParse(record);
    if (!result.success) {
      for (const issue of result.error.issues) {
        issues.push({
          file: fileName,
          line,
          column: issue.path.length > 0 ? String(issue.path[0]) : null,
          message: issue.message,
        });
      }
      return;
    }
    const row = result.data as DataRows[F];
    const firstLine = seen.get(row.id);
    if (firstLine !== undefined) {
      issues.push({ file: fileName, line, column: 'id', message: `duplicate id "${row.id}" (first on line ${firstLine})` });
      return;
    }
    seen.set(row.id, line);
    rows.push(row);
  });

  return { rows, issues };
}

export type GameData = { readonly [F in DataFileName]: readonly DataRows[F][] };
export type DataSources = Readonly<Record<DataFileName, string>>;

/** Validates all five files; throws DataValidationError listing every issue. */
export function loadGameData(sources: DataSources): GameData {
  const issues: DataIssue[] = [];
  const data = {} as { [F in DataFileName]: DataRows[F][] };
  for (const file of DATA_FILE_NAMES) {
    const result = parseTable(file, sources[file]);
    issues.push(...result.issues);
    (data as Record<DataFileName, unknown[]>)[file] = result.rows;
  }
  if (issues.length > 0) throw new DataValidationError(issues);
  return data;
}

export function findById<T extends { id: string }>(rows: readonly T[], id: string): T | undefined {
  return rows.find((row) => row.id === id);
}
