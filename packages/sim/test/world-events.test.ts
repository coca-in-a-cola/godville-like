import { expect, it } from 'vitest';
import { advanceSession, createSession } from '../src/index.ts';
import { lootData } from './loot-fixtures.ts';

it('bounds optional combat events without changing full session state, world events, or RNG', () => {
  const session = createSession(lootData, 42);
  const plain = advanceSession(session, lootData, 3000000, 'watched');
  const collected = advanceSession(session, lootData, 3000000, 'watched', { collectCombatEvents: true });
  expect(plain.combatEvents).toBeUndefined();
  expect(collected.combatEvents).toHaveLength(400);
  expect(collected.state).toEqual(plain.state);
  expect(collected.events).toEqual(plain.events);
});
