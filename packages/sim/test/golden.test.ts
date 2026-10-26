import { describe, expect, it } from 'vitest';
import {
  HERO_BASE_STATS,
  createFight,
  createGodState,
  requestIntervention,
  runFight,
  stepFight,
  type FightEvent,
  type FightState,
  type GodState,
  type InterventionKind,
} from '../src/index.ts';
import { ZONE1_MONSTER } from './fixtures.ts';

const SEED = 20261026;

/** Plays a fight tick by tick, queueing interventions before the given ticks. */
function play(seed: number, schedule: ReadonlyArray<{ beforeTick: number; kind: InterventionKind }>) {
  let fight: FightState = createFight({ seed, hero: HERO_BASE_STATS, monster: ZONE1_MONSTER });
  let god: GodState = createGodState(100);
  const events: FightEvent[] = [];
  const rejections: string[] = [];
  while (fight.outcome === null && fight.tick < 6000) {
    for (const action of schedule) {
      if (action.beforeTick !== fight.tick + 1) continue;
      const r = requestIntervention(fight, god, action.kind);
      if (r.ok) ({ fight, god } = r);
      else rejections.push(`${fight.tick}:${r.reason}`);
    }
    const step = stepFight(fight);
    fight = step.state;
    events.push(...step.events);
  }
  return { fight, god, events, rejections };
}

function transcript(events: readonly FightEvent[]): string[] {
  return events.map((e) => {
    switch (e.type) {
      case 'hit':
        return `${e.tick} ${e.attacker}>${e.defender}${e.counter ? ' COUNTER' : ''}${e.crit ? ' CRIT' : ''} roll=${e.roll} dealt=${e.dealt} hp=${e.hp}`;
      case 'dodge':
        return `${e.tick} ${e.attacker}>${e.defender}${e.counter ? ' COUNTER' : ''} DODGE`;
      case 'heal':
        return `${e.tick} heal ${e.side} +${e.amount} hp=${e.hp}`;
      case 'god':
        return `${e.tick} god ${e.action} ${e.amount} hp=${e.hp}`;
      case 'counter':
        return `${e.tick} counter ${e.side}`;
      case 'death':
        return `${e.tick} death ${e.side}`;
      case 'end':
        return `${e.tick} end ${e.outcome}`;
    }
  });
}

describe('golden fight transcript', () => {
  it('replays the known-seed sandbox fight exactly', () => {
    const result = runFight(createFight({ seed: SEED, hero: HERO_BASE_STATS, monster: ZONE1_MONSTER }));
    expect(result.outcome).not.toBe('unresolved');
    expect(transcript(result.events)).toMatchInlineSnapshot(`
      [
        "12 monster>hero roll=7 dealt=7 hp=930",
        "15 hero>monster roll=4 dealt=3 hp=550",
        "24 monster>hero roll=5 dealt=5 hp=886",
        "30 hero>monster roll=4 dealt=3 hp=520",
        "36 monster>hero roll=5 dealt=5 hp=842",
        "45 hero>monster roll=5 dealt=4 hp=480",
        "48 monster>hero roll=7 dealt=7 hp=778",
        "60 hero>monster roll=5 dealt=4 hp=440",
        "60 monster>hero roll=5 dealt=5 hp=734",
        "72 monster>hero roll=5 dealt=5 hp=690",
        "75 hero>monster roll=6 dealt=5 hp=390",
        "84 monster>hero roll=5 dealt=5 hp=646",
        "90 hero>monster roll=4 dealt=3 hp=360",
        "96 monster>hero roll=7 dealt=7 hp=582",
        "105 hero>monster roll=4 dealt=3 hp=330",
        "108 monster>hero roll=8 dealt=8 hp=508",
        "120 hero>monster roll=6 dealt=5 hp=280",
        "120 monster>hero roll=6 dealt=6 hp=454",
        "132 monster>hero roll=8 dealt=8 hp=380",
        "135 hero>monster roll=6 dealt=5 hp=230",
        "144 monster>hero roll=7 dealt=7 hp=316",
        "150 hero>monster roll=6 dealt=5 hp=180",
        "156 monster>hero roll=6 dealt=6 hp=262",
        "165 hero>monster roll=6 dealt=5 hp=130",
        "168 monster>hero roll=7 dealt=7 hp=198",
        "180 hero>monster roll=4 dealt=3 hp=100",
        "180 monster>hero roll=6 dealt=6 hp=144",
        "192 monster>hero roll=8 dealt=8 hp=70",
        "195 hero>monster roll=4 dealt=3 hp=70",
        "204 monster>hero roll=7 dealt=7 hp=6",
        "210 hero>monster roll=6 dealt=5 hp=20",
        "216 monster>hero roll=5 dealt=5 hp=0",
        "216 death hero",
        "216 end monster_won",
      ]
    `);
    expect({ outcome: result.outcome, tick: result.state.tick, heroHp: result.state.hero.hp, monsterHp: result.state.monster.hp })
      .toMatchInlineSnapshot(`
        {
          "heroHp": 0,
          "monsterHp": 20,
          "outcome": "monster_won",
          "tick": 216,
        }
      `);
  });

  it('replays identically for the same seed, stats and action schedule', () => {
    const schedule = [
      { beforeTick: 60, kind: 'blessing' as const },
      { beforeTick: 90, kind: 'smite' as const },
      { beforeTick: 91, kind: 'smite' as const },
    ];
    const a = play(SEED, schedule);
    const b = play(SEED, schedule);
    expect(b).toEqual(a);
    expect(a.god.gp).toBe(25);
    const godEvents = a.events.filter((e) => e.type === 'god');
    expect(godEvents.map((e) => [e.tick, e.action])).toEqual([
      [60, 'blessing'],
      [90, 'smite'],
      [91, 'smite'],
    ]);
    for (const e of godEvents) if (e.action === 'smite') expect(e.amount).toBe(116); // 20% of 58 HP
    const withoutActions = play(SEED, []);
    expect(withoutActions.events).not.toEqual(a.events);
    expect(transcript(a.events).slice(-3)).toMatchInlineSnapshot(`
      [
        "135 hero>monster roll=6 dealt=5 hp=0",
        "135 death monster",
        "135 end hero_won",
      ]
    `);
  });
});
