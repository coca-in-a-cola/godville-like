/**
 * Deterministic 1v1 fight in fixed 100 ms ticks.
 *
 * Tick order (GDD "Combat model"):
 *   1. apply interventions queued before this tick (FIFO);
 *   2. regeneration;
 *   3. advance attack bars by 0.1 s;
 *   4. resolve full bars, fullest first, hero first on ties;
 *   5. death check, ending the fight.
 * Hit order: evasion -> damage roll -> crit -> defense floor -> vampirism ->
 * one counter by a surviving defender (never countered back).
 *
 * Everything is integer: HP in tenths, chances in basis points, bars in
 * fixed point. Public functions never mutate their arguments.
 */

import { cloneRng, randomIntInclusive, rollBp, seedRng, type RngState } from './rng.ts';
import { normalizeStats, type CombatStats, type StatBlock } from './stats.ts';

export const FIGHT_SCHEMA_VERSION = 1;
export const TICK_MS = 100;
/**
 * Attack bar fixed point: a bar fills by `BAR_FILL_BASE + attackSpeedBp` per
 * tick and fires at `BAR_FULL`. With AS = 0 that is 15 ticks = 1.5 s, and in
 * general 1.5 s / (1 + AS) exactly, with no rounding.
 */
export const BAR_FILL_BASE = 10_000;
export const BAR_FULL = 150_000;
/** Regen carry units per tenth of HP; see `applyRegen`. */
export const REGEN_CARRY_PER_TENTH = 1000;
export const BLESSING_HEAL_PERCENT = 25;
export const SMITE_DAMAGE_PERCENT = 20;

export type Side = 'hero' | 'monster';
export type FightOutcome = 'hero_won' | 'monster_won' | 'draw';
export type InterventionKind = 'blessing' | 'smite';

export interface CombatantState {
  stats: CombatStats;
  /** Current HP in tenths, in [0, stats.maxHp]. */
  hp: number;
  /** Attack bar in fixed point, fires at BAR_FULL; overflow is kept. */
  bar: number;
  /** Regeneration not yet worth a whole tenth, in (-1000, 1000). */
  regenCarry: number;
}

export interface QueuedIntervention {
  seq: number;
  kind: InterventionKind;
  /** GP already paid when the intervention was queued. */
  cost: number;
}

export interface FightState {
  schemaVersion: typeof FIGHT_SCHEMA_VERSION;
  /** Seed the fight was created with (live RNG state is `rng`). */
  seed: number;
  /** Number of ticks already simulated. Event times are `tick * TICK_MS`. */
  tick: number;
  /** Game milliseconds received but not yet worth a whole tick, in [0, 100). */
  pendingMs: number;
  rng: RngState;
  hero: CombatantState;
  monster: CombatantState;
  /** Applied at step 1 of the next tick, in order. */
  queue: QueuedIntervention[];
  nextSeq: number;
  outcome: FightOutcome | null;
}

export type FightEvent =
  | {
      type: 'god';
      tick: number;
      action: InterventionKind;
      target: Side;
      cost: number;
      /** Tenths of HP actually healed (blessing) or removed (smite). */
      amount: number;
      hp: number;
    }
  | { type: 'dodge'; tick: number; attacker: Side; defender: Side; counter: boolean }
  | {
      type: 'hit';
      tick: number;
      attacker: Side;
      defender: Side;
      counter: boolean;
      /** Uniform damage roll, points. */
      roll: number;
      crit: boolean;
      /** Damage before defense (roll, doubled on crit). */
      raw: number;
      /** Points removed by defense: raw - dealt. */
      blocked: number;
      /** Damage after defense, points. */
      dealt: number;
      /** Tenths of HP actually removed (dealt clamped to remaining HP). */
      hpLoss: number;
      /** Defender HP after the hit, tenths. */
      hp: number;
    }
  | { type: 'counter'; tick: number; side: Side }
  | { type: 'heal'; tick: number; side: Side; source: 'vampirism'; amount: number; hp: number }
  | { type: 'death'; tick: number; side: Side }
  | { type: 'end'; tick: number; outcome: FightOutcome };

export interface FightSetup {
  seed: number;
  hero: StatBlock;
  monster: StatBlock;
}

export interface FightAdvance {
  state: FightState;
  events: FightEvent[];
  ticks: number;
}

function newCombatant(stats: CombatStats): CombatantState {
  return { stats, hp: stats.maxHp, bar: 0, regenCarry: 0 };
}

/** Builds the initial state. Throws RangeError on an invalid seed or stat block. */
export function createFight(setup: FightSetup): FightState {
  return {
    schemaVersion: FIGHT_SCHEMA_VERSION,
    seed: setup.seed,
    tick: 0,
    pendingMs: 0,
    rng: seedRng(setup.seed),
    hero: newCombatant(normalizeStats(setup.hero)),
    monster: newCombatant(normalizeStats(setup.monster)),
    queue: [],
    nextSeq: 0,
    outcome: null,
  };
}

function cloneCombatant(c: CombatantState): CombatantState {
  return { stats: { ...c.stats }, hp: c.hp, bar: c.bar, regenCarry: c.regenCarry };
}

export function cloneFight(state: FightState): FightState {
  return {
    schemaVersion: state.schemaVersion,
    seed: state.seed,
    tick: state.tick,
    pendingMs: state.pendingMs,
    rng: cloneRng(state.rng),
    hero: cloneCombatant(state.hero),
    monster: cloneCombatant(state.monster),
    queue: state.queue.map((q) => ({ ...q })),
    nextSeq: state.nextSeq,
    outcome: state.outcome,
  };
}

export function opponentOf(side: Side): Side {
  return side === 'hero' ? 'monster' : 'hero';
}

/** dealt = max(ceil(0.2 * raw), raw - DEF), in integers. */
export function dealtAfterDefense(raw: number, defense: number): number {
  return Math.max(Math.floor((raw + 4) / 5), raw - defense);
}

export function blessingHeal(maxHp: number): number {
  return Math.floor((maxHp * BLESSING_HEAL_PERCENT) / 100);
}

export function smiteDamage(maxHp: number): number {
  return Math.floor((maxHp * SMITE_DAMAGE_PERCENT) / 100);
}

/**
 * Regeneration per tick is `regenMilliHp / 1000` tenths (regen HP/s x 0.1 s).
 * The carry keeps the fraction, so 0.5 HP/s gives +1 tenth every 2 ticks
 * instead of rounding 0.05 HP to zero. HP is clamped to [0, max].
 */
function applyRegen(c: CombatantState): void {
  if (c.hp <= 0) return;
  const carry = c.regenCarry + c.stats.regenMilliHp;
  const whole = Math.trunc(carry / REGEN_CARRY_PER_TENTH) + 0;
  c.regenCarry = carry - whole * REGEN_CARRY_PER_TENTH + 0;
  if (whole === 0) return;
  const hp = c.hp + whole;
  c.hp = hp > c.stats.maxHp ? c.stats.maxHp : hp < 0 ? 0 : hp;
}

function applyIntervention(s: FightState, q: QueuedIntervention, out: FightEvent[] | null): void {
  if (q.kind === 'blessing') {
    const hero = s.hero;
    const amount = hero.hp > 0 ? Math.min(blessingHeal(hero.stats.maxHp), hero.stats.maxHp - hero.hp) : 0;
    hero.hp += amount;
    out?.push({ type: 'god', tick: s.tick, action: 'blessing', target: 'hero', cost: q.cost, amount, hp: hero.hp });
  } else {
    const monster = s.monster;
    const amount = Math.min(smiteDamage(monster.stats.maxHp), monster.hp);
    monster.hp -= amount;
    out?.push({ type: 'god', tick: s.tick, action: 'smite', target: 'monster', cost: q.cost, amount, hp: monster.hp });
  }
}

function resolveHit(s: FightState, attackerSide: Side, isCounter: boolean, out: FightEvent[] | null): void {
  const defenderSide = opponentOf(attackerSide);
  const att = s[attackerSide];
  const def = s[defenderSide];
  const rng = s.rng;

  if (rollBp(rng, def.stats.evasionBp)) {
    out?.push({ type: 'dodge', tick: s.tick, attacker: attackerSide, defender: defenderSide, counter: isCounter });
    return;
  }
  const roll = randomIntInclusive(rng, att.stats.damageMin, att.stats.damageMax);
  const crit = rollBp(rng, att.stats.critBp);
  const raw = crit ? roll * 2 : roll;
  const dealt = dealtAfterDefense(raw, def.stats.defense);
  const hpLoss = Math.min(dealt * 10, def.hp);
  def.hp -= hpLoss;
  out?.push({
    type: 'hit',
    tick: s.tick,
    attacker: attackerSide,
    defender: defenderSide,
    counter: isCounter,
    roll,
    crit,
    raw,
    blocked: raw - dealt,
    dealt,
    hpLoss,
    hp: def.hp,
  });

  if (att.stats.vampirismBp > 0 && hpLoss > 0) {
    const heal = Math.min(Math.floor((hpLoss * att.stats.vampirismBp) / 10000), att.stats.maxHp - att.hp);
    if (heal > 0) {
      att.hp += heal;
      out?.push({ type: 'heal', tick: s.tick, side: attackerSide, source: 'vampirism', amount: heal, hp: att.hp });
    }
  }

  if (!isCounter && def.hp > 0 && rollBp(rng, def.stats.counterBp)) {
    out?.push({ type: 'counter', tick: s.tick, side: defenderSide });
    resolveHit(s, defenderSide, true, out);
  }
}

/**
 * Simulates one tick on `s` in place. Internal: callers outside the package
 * use `stepFight` / `advanceFight`, which clone first.
 */
export function stepInPlace(s: FightState, out: FightEvent[] | null): void {
  if (s.outcome !== null) return;
  s.tick += 1;
  const { hero, monster } = s;

  // 1. Interventions queued during the previous tick.
  if (s.queue.length > 0) {
    for (const q of s.queue) applyIntervention(s, q, out);
    s.queue = [];
  }

  // 2. Regeneration. A combatant at 0 HP is dead and inert for the rest of the tick.
  applyRegen(hero);
  applyRegen(monster);

  // 3. Attack bars.
  if (hero.hp > 0) hero.bar += BAR_FILL_BASE + hero.stats.attackSpeedBp;
  if (monster.hp > 0) monster.bar += BAR_FILL_BASE + monster.stats.attackSpeedBp;

  // 4. Full bars, fullest first, hero wins ties. At most one swing per side per
  //    tick, because the fill per tick (<= 30000) is below BAR_FULL.
  const heroReady = hero.hp > 0 && hero.bar >= BAR_FULL;
  const monsterReady = monster.hp > 0 && monster.bar >= BAR_FULL;
  if (heroReady || monsterReady) {
    const order: Side[] =
      heroReady && monsterReady
        ? monster.bar > hero.bar
          ? ['monster', 'hero']
          : ['hero', 'monster']
        : heroReady
          ? ['hero']
          : ['monster'];
    for (const side of order) {
      const attacker = s[side];
      // A combatant killed earlier this tick (by a hit or a counter) does not swing.
      if (attacker.hp <= 0 || s[opponentOf(side)].hp <= 0) continue;
      attacker.bar -= BAR_FULL;
      resolveHit(s, side, false, out);
    }
  }

  // 5. Deaths.
  const heroDead = hero.hp <= 0;
  const monsterDead = monster.hp <= 0;
  if (heroDead || monsterDead) {
    if (heroDead) out?.push({ type: 'death', tick: s.tick, side: 'hero' });
    if (monsterDead) out?.push({ type: 'death', tick: s.tick, side: 'monster' });
    s.outcome = heroDead && monsterDead ? 'draw' : heroDead ? 'monster_won' : 'hero_won';
    out?.push({ type: 'end', tick: s.tick, outcome: s.outcome });
  }
}

/** Simulates exactly one tick, ignoring `pendingMs`. */
export function stepFight(state: FightState): FightAdvance {
  const s = cloneFight(state);
  const events: FightEvent[] = [];
  const before = s.tick;
  stepInPlace(s, events);
  return { state: s, events, ticks: s.tick - before };
}

/**
 * Advances by `gameMs` of game time (a non-negative integer). Whole ticks are
 * simulated; the remainder is kept in `pendingMs`, so any split of the same
 * total produces the same state and events. Time after the fight ends is
 * discarded and `pendingMs` becomes 0.
 */
export function advanceFight(state: FightState, gameMs: number): FightAdvance {
  if (!Number.isSafeInteger(gameMs) || gameMs < 0) {
    throw new RangeError(`gameMs must be a non-negative safe integer, got ${String(gameMs)}`);
  }
  const s = cloneFight(state);
  const events: FightEvent[] = [];
  if (s.outcome !== null) return { state: s, events, ticks: 0 };
  let budget = s.pendingMs + gameMs;
  let ticks = 0;
  while (budget >= TICK_MS && s.outcome === null) {
    stepInPlace(s, events);
    budget -= TICK_MS;
    ticks += 1;
  }
  s.pendingMs = s.outcome === null ? budget : 0;
  return { state: s, events, ticks };
}
