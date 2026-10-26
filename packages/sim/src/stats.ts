/**
 * The nine prototype combat stats.
 *
 * `StatBlock` is the human-facing form (points, percents, HP/s) used by
 * editors, items and data. `CombatStats` is the normalized integer form the
 * tick engine runs on. Caps and lower bounds are applied only by
 * `normalizeStats`, i.e. to a combatant's aggregated total, never to the
 * individual blocks that are summed into it.
 */

export interface StatBlock {
  /** Health pool, HP. */
  maxHp: number;
  /** Damage roll lower end, points. */
  damageMin: number;
  /** Damage roll upper end, points. */
  damageMax: number;
  /** Attack speed, percent (+100 halves the 1.5 s interval). */
  attackSpeed: number;
  /** Damage removed per incoming hit, points. */
  defense: number;
  /** Crit chance, percent. */
  crit: number;
  /** Evasion chance, percent. */
  evasion: number;
  /** Regeneration, HP per second. */
  regen: number;
  /** Share of damage dealt returned as HP, percent. */
  vampirism: number;
  /** Counter-attack chance, percent. */
  counter: number;
}

export type StatKey = keyof StatBlock;

export const STAT_KEYS: readonly StatKey[] = [
  'maxHp',
  'damageMin',
  'damageMax',
  'attackSpeed',
  'defense',
  'crit',
  'evasion',
  'regen',
  'vampirism',
  'counter',
];

/** Normalized integer stats used inside ticks. */
export interface CombatStats {
  /** Tenths of HP, >= 1. */
  maxHp: number;
  /** Integer points, >= 0. */
  damageMin: number;
  /** Integer points, >= damageMin. */
  damageMax: number;
  /** Basis points, in [ATTACK_SPEED_MIN_BP, ATTACK_SPEED_CAP_BP]. */
  attackSpeedBp: number;
  /** Integer points, >= 0. */
  defense: number;
  critBp: number;
  evasionBp: number;
  /** Thousandths of HP per second; may be negative (curses). */
  regenMilliHp: number;
  vampirismBp: number;
  counterBp: number;
}

/** Hero base values from the GDD "Stats and items" table. */
export const HERO_BASE_STATS: Readonly<StatBlock> = Object.freeze({
  maxHp: 100,
  damageMin: 4,
  damageMax: 6,
  attackSpeed: 0,
  defense: 0,
  crit: 0,
  evasion: 0,
  regen: 0.5,
  vampirism: 0,
  counter: 0,
});

/** GDD caps, in basis points. */
export const ATTACK_SPEED_CAP_BP = 20000;
export const CRIT_CAP_BP = 5000;
export const EVASION_CAP_BP = 6000;
export const VAMPIRISM_CAP_BP = 3000;
export const COUNTER_CAP_BP = 4000;

/**
 * Implementation choice (not from the GDD): attack speed never drops below
 * -90%, so the interval is at most 15 s and always positive.
 */
export const ATTACK_SPEED_MIN_BP = -9000;

/**
 * Implementation choice: editor/input sanity domain. Keeps every integer
 * product inside the tick engine far below 2^53.
 */
export const STAT_INPUT_LIMIT = 1_000_000;
export const MAX_HP_MIN_INPUT = 0.1;

export type StatErrorCode = 'not_a_number' | 'out_of_range' | 'min_above_max' | 'max_hp_too_low';

export interface StatError {
  field: StatKey;
  code: StatErrorCode;
}

export type StatValidation =
  | { ok: true; value: StatBlock }
  | { ok: false; errors: StatError[] };

/**
 * Structural validation of a stat block. Rejects missing, non-finite and
 * absurd values and `damageMin > damageMax`. Negative values are legal (they
 * come from curses) and are bounded later by `normalizeStats`.
 */
export function validateStatBlock(input: unknown): StatValidation {
  const errors: StatError[] = [];
  const source = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
  const value = {} as StatBlock;
  for (const key of STAT_KEYS) {
    const raw = source[key];
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      errors.push({ field: key, code: 'not_a_number' });
      continue;
    }
    if (Math.abs(raw) > STAT_INPUT_LIMIT) {
      errors.push({ field: key, code: 'out_of_range' });
      continue;
    }
    value[key] = raw;
  }
  if (typeof value.maxHp === 'number' && value.maxHp < MAX_HP_MIN_INPUT) {
    errors.push({ field: 'maxHp', code: 'max_hp_too_low' });
  }
  if (
    typeof value.damageMin === 'number' &&
    typeof value.damageMax === 'number' &&
    value.damageMin > value.damageMax
  ) {
    errors.push({ field: 'damageMin', code: 'min_above_max' });
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value };
}

/** Field-wise sum of stat blocks (base + items + ...), with no caps. */
export function sumStatBlocks(blocks: readonly StatBlock[]): StatBlock {
  const total: StatBlock = {
    maxHp: 0,
    damageMin: 0,
    damageMax: 0,
    attackSpeed: 0,
    defense: 0,
    crit: 0,
    evasion: 0,
    regen: 0,
    vampirism: 0,
    counter: 0,
  };
  for (const block of blocks) {
    for (const key of STAT_KEYS) total[key] += block[key];
  }
  return total;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/**
 * Round half toward +infinity (`Math.round`), as documented in
 * IMPLEMENTATION_NOTES. `+ 0` turns -0 into 0 so serialized state round-trips.
 */
function roundScaled(value: number, scale: number): number {
  return Math.round(value * scale) + 0;
}

function percentToBp(percent: number, cap: number): number {
  return clamp(roundScaled(percent, 100), 0, cap);
}

/**
 * Converts a validated total into integer combat stats, applying GDD caps and
 * the documented lower bounds. Throws on an invalid block; call
 * `validateStatBlock` first to get field errors.
 */
export function normalizeStats(total: StatBlock): CombatStats {
  const validation = validateStatBlock(total);
  if (!validation.ok) {
    const fields = validation.errors.map((e) => `${e.field}:${e.code}`).join(', ');
    throw new RangeError(`invalid stat block (${fields})`);
  }
  const v = validation.value;
  const damageMin = Math.max(0, roundScaled(v.damageMin, 1));
  const damageMax = Math.max(damageMin, roundScaled(v.damageMax, 1));
  return {
    maxHp: Math.max(1, roundScaled(v.maxHp, 10)),
    damageMin,
    damageMax,
    attackSpeedBp: clamp(roundScaled(v.attackSpeed, 100), ATTACK_SPEED_MIN_BP, ATTACK_SPEED_CAP_BP),
    defense: Math.max(0, roundScaled(v.defense, 1)),
    critBp: percentToBp(v.crit, CRIT_CAP_BP),
    evasionBp: percentToBp(v.evasion, EVASION_CAP_BP),
    regenMilliHp: roundScaled(v.regen, 1000),
    vampirismBp: percentToBp(v.vampirism, VAMPIRISM_CAP_BP),
    counterBp: percentToBp(v.counter, COUNTER_CAP_BP),
  };
}
