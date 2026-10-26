/**
 * Godpower and in-combat interventions.
 *
 * GP regenerates in REAL time only: the adapter passes real elapsed
 * milliseconds, never game time, so the 1x/0.1x world speed cannot change
 * the god's budget. GP is paid when an intervention is queued; the fight
 * applies it at step 1 of its next tick.
 */

import { cloneFight, smiteDamage, type FightState, type InterventionKind, type QueuedIntervention } from './fight.ts';

export const GP_MAX_BASE = 100;
/** +1 GP per 6 real minutes (full meter in 10 hours). */
export const GP_REGEN_INTERVAL_MS = 360_000;
export const INTERVENTION_COST: Readonly<Record<InterventionKind, number>> = Object.freeze({
  blessing: 25,
  smite: 25,
});

export interface GodState {
  /** Whole GP in [0, gpMax]. */
  gp: number;
  gpMax: number;
  /** Real milliseconds toward the next GP, in [0, GP_REGEN_INTERVAL_MS). */
  regenCarryMs: number;
}

export function createGodState(gp: number = GP_MAX_BASE, gpMax: number = GP_MAX_BASE): GodState {
  if (!Number.isSafeInteger(gpMax) || gpMax < 0) throw new RangeError(`gpMax must be a non-negative integer`);
  if (!Number.isSafeInteger(gp) || gp < 0 || gp > gpMax) {
    throw new RangeError(`gp must be an integer in [0, ${gpMax}], got ${String(gp)}`);
  }
  return { gp, gpMax, regenCarryMs: 0 };
}

/**
 * Adds real elapsed time. A full meter does not bank time (accumulator
 * charges are a later increment), so the carry resets at the cap.
 */
export function advanceGodpower(god: GodState, realElapsedMs: number): GodState {
  if (!Number.isSafeInteger(realElapsedMs) || realElapsedMs < 0) {
    throw new RangeError(`realElapsedMs must be a non-negative safe integer, got ${String(realElapsedMs)}`);
  }
  if (god.gp >= god.gpMax) return { gp: god.gpMax, gpMax: god.gpMax, regenCarryMs: 0 };
  const total = god.regenCarryMs + realElapsedMs;
  const gp = Math.min(god.gpMax, god.gp + Math.floor(total / GP_REGEN_INTERVAL_MS));
  const regenCarryMs = gp >= god.gpMax ? 0 : total % GP_REGEN_INTERVAL_MS;
  return { gp, gpMax: god.gpMax, regenCarryMs };
}

export type InterventionRejection =
  /** The fight already has an outcome. */
  | 'fight_over'
  | 'insufficient_gp'
  /** Smites already queued will kill the monster at the next tick's step 1. */
  | 'target_doomed';

export type InterventionResult =
  | { ok: true; fight: FightState; god: GodState; queued: QueuedIntervention }
  | { ok: false; reason: InterventionRejection };

/**
 * Pays for and queues an intervention. Rejections leave both states untouched.
 * Nothing happens between ticks, so queued smites hit the monster at its
 * current HP; a smite that could only hit a corpse is refused up front.
 */
export function requestIntervention(fight: FightState, god: GodState, kind: InterventionKind): InterventionResult {
  if (fight.outcome !== null) return { ok: false, reason: 'fight_over' };
  const cost = INTERVENTION_COST[kind];
  if (god.gp < cost) return { ok: false, reason: 'insufficient_gp' };
  if (kind === 'smite') {
    const queuedDamage = fight.queue.filter((q) => q.kind === 'smite').length * smiteDamage(fight.monster.stats.maxHp);
    if (queuedDamage >= fight.monster.hp) return { ok: false, reason: 'target_doomed' };
  }
  const next = cloneFight(fight);
  const queued: QueuedIntervention = { seq: next.nextSeq, kind, cost };
  next.queue.push(queued);
  next.nextSeq += 1;
  return { ok: true, fight: next, god: { ...god, gp: god.gp - cost }, queued: { ...queued } };
}
