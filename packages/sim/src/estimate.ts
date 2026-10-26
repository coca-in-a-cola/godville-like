/**
 * The hero's cheap closed-form fight estimate (GDD "Win forecast"):
 *
 *   EDPS_A = (1 + AS_A) / 1.5 * (1 - EV_B) * mean(dealt A->B) * (1 + CR_A)
 *   TTK_A->B = HP_B / (EDPS_A - regen_B - EDPS_B * VAMP_B)
 *
 * Plain floating point is fine here: this is a decision heuristic run outside
 * ticks, never part of the deterministic fight state. A non-positive
 * denominator means A never kills B and yields Infinity.
 */

import { dealtAfterDefense, type CombatantState } from './fight.ts';
import type { CombatStats } from './stats.ts';

/** Mean dealt damage over the uniform integer roll range, before crits. */
export function meanDealt(damageMin: number, damageMax: number, defense: number): number {
  let sum = 0;
  for (let roll = damageMin; roll <= damageMax; roll++) sum += dealtAfterDefense(roll, defense);
  return sum / (damageMax - damageMin + 1);
}

/** Expected damage per second (HP/s) of `attacker` against `defender`. */
export function expectedDps(attacker: CombatStats, defender: CombatStats): number {
  const attacksPerSecond = (1 + attacker.attackSpeedBp / 10000) / 1.5;
  const hitChance = 1 - defender.evasionBp / 10000;
  const critFactor = 1 + attacker.critBp / 10000;
  return attacksPerSecond * hitChance * meanDealt(attacker.damageMin, attacker.damageMax, defender.defense) * critFactor;
}

/** Seconds for an attacker with `attackerEdps` to kill `defender` from its current HP. */
export function timeToKill(attackerEdps: number, defender: CombatantState, defenderEdps: number): number {
  const regen = defender.stats.regenMilliHp / 1000;
  const vampirism = defender.stats.vampirismBp / 10000;
  const net = attackerEdps - regen - defenderEdps * vampirism;
  if (!(net > 0)) return Number.POSITIVE_INFINITY;
  return defender.hp / 10 / net;
}

export type EstimateVerdict = 'hero' | 'monster' | 'even' | 'stalemate';

export interface DuelEstimate {
  heroEdps: number;
  monsterEdps: number;
  /** Seconds for the hero to kill the monster (Infinity if never). */
  heroTtk: number;
  /** Seconds for the monster to kill the hero (Infinity if never). */
  monsterTtk: number;
  verdict: EstimateVerdict;
}

export function estimateDuel(hero: CombatantState, monster: CombatantState): DuelEstimate {
  const heroEdps = expectedDps(hero.stats, monster.stats);
  const monsterEdps = expectedDps(monster.stats, hero.stats);
  const heroTtk = timeToKill(heroEdps, monster, monsterEdps);
  const monsterTtk = timeToKill(monsterEdps, hero, heroEdps);
  const verdict: EstimateVerdict =
    heroTtk === Number.POSITIVE_INFINITY && monsterTtk === Number.POSITIVE_INFINITY
      ? 'stalemate'
      : heroTtk < monsterTtk
        ? 'hero'
        : heroTtk > monsterTtk
          ? 'monster'
          : 'even';
  return { heroEdps, monsterEdps, heroTtk, monsterTtk, verdict };
}
