import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  createFight,
  createGodState,
  dealtAfterDefense,
  requestIntervention,
  stepFight,
  type FightEvent,
  type FightState,
  type GodState,
  type StatBlock,
} from '../src/index.ts';

const statBlock: fc.Arbitrary<StatBlock> = fc
  .record({
    maxHp: fc.integer({ min: 1, max: 300 }),
    damageMin: fc.integer({ min: -5, max: 30 }),
    spread: fc.integer({ min: 0, max: 20 }),
    attackSpeed: fc.integer({ min: -120, max: 300 }),
    defense: fc.integer({ min: -5, max: 15 }),
    crit: fc.integer({ min: -10, max: 90 }),
    evasion: fc.integer({ min: -10, max: 90 }),
    regen: fc.double({ min: -3, max: 3, noNaN: true }),
    vampirism: fc.integer({ min: -10, max: 60 }),
    counter: fc.integer({ min: -10, max: 80 }),
  })
  .map(({ spread, ...s }) => ({ ...s, damageMax: s.damageMin + spread }));

const schedule = fc.array(
  fc.record({ tick: fc.integer({ min: 0, max: 400 }), kind: fc.constantFrom('blessing' as const, 'smite' as const) }),
  { maxLength: 8 },
);

function assertFiniteIntegers(value: unknown, path: string): void {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new Error(`${path} is not a safe integer: ${value}`);
  } else if (typeof value === 'object' && value !== null) {
    for (const [k, v] of Object.entries(value)) assertFiniteIntegers(v, `${path}.${k}`);
  }
}

describe('fight invariants (property-based)', () => {
  it('keeps HP and GP bounded, numbers integral and counters one level deep', () => {
    fc.assert(
      fc.property(statBlock, statBlock, fc.nat({ max: 0xffffffff }), fc.integer({ min: 0, max: 100 }), schedule, (hero, monster, seed, gp, actions) => {
        let fight: FightState = createFight({ seed, hero, monster });
        let god: GodState = createGodState(gp);
        const all: FightEvent[] = [];
        while (fight.outcome === null && fight.tick < 600) {
          for (const a of actions) {
            if (a.tick !== fight.tick) continue;
            const r = requestIntervention(fight, god, a.kind);
            if (r.ok) ({ fight, god } = r);
          }
          const step = stepFight(fight);
          fight = step.state;
          all.push(...step.events);

          for (const c of [fight.hero, fight.monster]) {
            expect(c.hp).toBeGreaterThanOrEqual(0);
            expect(c.hp).toBeLessThanOrEqual(c.stats.maxHp);
            expect(Math.abs(c.regenCarry)).toBeLessThan(1000);
          }
          expect(god.gp).toBeGreaterThanOrEqual(0);
          expect(god.gp).toBeLessThanOrEqual(god.gpMax);
          expect(fight.pendingMs).toBe(0);
        }
        assertFiniteIntegers(fight, 'fight');
        assertFiniteIntegers(god, 'god');

        const endIndex = all.findIndex((e) => e.type === 'end');
        if (fight.outcome !== null) expect(endIndex).toBe(all.length - 1);
        else expect(endIndex).toBe(-1);

        all.forEach((e, i) => {
          assertFiniteIntegers(e, `event ${i}`);
          if (e.type === 'counter') {
            const strike = all[i + 1];
            expect(strike && (strike.type === 'hit' || strike.type === 'dodge') && strike.counter).toBe(true);
          }
          if ((e.type === 'hit' || e.type === 'dodge') && e.counter) {
            expect(all[i - 1]?.type).toBe('counter');
            // The counter strike itself is never countered.
            const following = all.slice(i + 1).find((n) => n.type !== 'heal');
            expect(following?.type === 'counter' && following.tick === e.tick && following.side === e.defender).toBe(false);
          }
          if (e.type === 'hit') {
            const att = e.attacker === 'hero' ? fight.hero : fight.monster;
            const def = e.defender === 'hero' ? fight.hero : fight.monster;
            expect(e.roll).toBeGreaterThanOrEqual(att.stats.damageMin);
            expect(e.roll).toBeLessThanOrEqual(att.stats.damageMax);
            expect(e.raw).toBe(e.crit ? e.roll * 2 : e.roll);
            expect(e.dealt).toBe(dealtAfterDefense(e.raw, def.stats.defense));
            expect(e.hpLoss).toBeLessThanOrEqual(e.dealt * 10);
          }
        });
      }),
      { numRuns: 150 },
    );
  });
});
