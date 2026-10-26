/** Editor drafts (raw input strings) -> validated sim inputs. */

import {
  STAT_KEYS,
  isUint32,
  validateStatBlock,
  type StatBlock,
  type StatErrorCode,
  type StatKey,
} from '@godville/sim';

export type StatDraft = Record<StatKey, string>;

export type DraftResult =
  | { ok: true; value: StatBlock; errors: Partial<Record<StatKey, StatErrorCode>> }
  | { ok: false; errors: Partial<Record<StatKey, StatErrorCode>> };

export function draftFromStats(stats: StatBlock): StatDraft {
  const draft = {} as StatDraft;
  for (const key of STAT_KEYS) draft[key] = String(stats[key]);
  return draft;
}

/** Strict decimal parse: empty strings and things like "1e3" or "12abc" are rejected. */
function parseDecimal(text: string): number {
  const trimmed = text.trim();
  return /^-?(\d+(\.\d*)?|\.\d+)$/.test(trimmed) ? Number(trimmed) : Number.NaN;
}

export function parseStatDraft(draft: StatDraft): DraftResult {
  const candidate = {} as Record<StatKey, number>;
  for (const key of STAT_KEYS) candidate[key] = parseDecimal(draft[key]);
  const validation = validateStatBlock(candidate);
  if (validation.ok) return { ok: true, value: validation.value, errors: {} };
  const errors: Partial<Record<StatKey, StatErrorCode>> = {};
  for (const error of validation.errors) errors[error.field] ??= error.code;
  return { ok: false, errors };
}

export function parseSeed(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return isUint32(value) ? value : null;
}

export function parseGp(text: string, max: number): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value <= max ? value : null;
}
