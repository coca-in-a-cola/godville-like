import { describe, expect, it } from 'vitest';
import { lootData } from './loot-fixtures.ts';
import { actionWorld, advanceWorld, applyDeathLoss, createWorld, DEFAULT_WORLD_TUNING, GEAR_SLOTS, inventoryCombatStats, worldShopOffers, worldXpThreshold, worldZone, WORLD_RESOURCE_CAP, type GameData, type WorldState } from '../src/index.ts';

const peaceful = { encounterBp: 0, goldFindBp: 0, itemFindBp: 0, brickFindBp: 0 };
function clone<T>(s: T): T { return JSON.parse(JSON.stringify(s)) as T; }
function travelWorld(overrides = {}): WorldState { return advanceWorld(createWorld(lootData, 123, overrides), lootData, 2000).state; }
function finiteTree(value: unknown): void {
  if (typeof value === 'number') expect(Number.isFinite(value)).toBe(true);
  else if (value && typeof value === 'object') for (const entry of Object.values(value)) finiteTree(entry);
}

describe('autonomous world routes', () => {
  it('starts in zone zero with six real base items and takes a quest at the town deadline', () => {
    const s = createWorld(lootData, 123);
    expect(worldZone(s, lootData)).toBe(0);
    expect(GEAR_SLOTS.every((slot) => s.hero.inventory.equipped[slot]?.modifiers.length === 0)).toBe(true);
    expect(s.hero.stats.damageMin).toBe(11);
    expect(s.hero.stats.defense).toBe(8);
    expect(s.hero.stats.maxHp).toBe(1400);
    expect(advanceWorld(s, lootData, 1999).state.phase).toBe('town');
    const next = advanceWorld(s, lootData, 2000);
    expect(next.state.phase).toBe('travel');
    expect(next.state.hero.quest).toEqual({ id: 'quest_0', level: 1, progress: 0 });
    expect(s.hero.quest).toBeNull();
  });

  it('walks exact fixed steps, completes miles quest, returns, pays once, heals and departs', () => {
    const start = travelWorld(peaceful);
    const before = advanceWorld(start, lootData, 99999).state;
    expect(before.phase).toBe('travel'); expect(before.hero.distance).toBe(19); expect(before.hero.quest?.progress).toBe(95);
    const returning = advanceWorld(before, lootData, 1).state;
    expect(returning.phase).toBe('return'); expect(returning.hero.distance).toBe(20); expect(returning.hero.quest?.progress).toBe(100);
    const arrived = advanceWorld(returning, lootData, 100000).state;
    expect(arrived.phase).toBe('town'); expect(arrived.hero.distance).toBe(0); expect(arrived.totals.quests).toBe(0);
    const paid = advanceWorld(arrived, lootData, 2000);
    expect(paid.state.totals.quests).toBe(1); expect(paid.state.hero.xp).toBe(60); expect(paid.state.faith).toBe(3);
    expect(paid.events.filter((e) => e.type === 'quest_paid')).toHaveLength(1);
    expect(paid.state.hero.hp).toBe(paid.state.hero.stats.maxHp);
    expect(paid.state.hero.quest?.id).toBe('quest_1');
    expect(paid.state.hero.gold).toBeGreaterThanOrEqual(0);
    expect(paid.state.hero.gold).toBeLessThanOrEqual(60);
  });

  it.each(['hp', 'pouch', 'quest'] as const)('returns autonomously for %s without directly moving the hero', (reason) => {
    const s = travelWorld(peaceful); s.hero.distance = 2;
    if (reason === 'hp') s.hero.hp = 419;
    if (reason === 'quest') s.hero.quest!.progress = 100;
    if (reason === 'pouch') s.hero.inventory.trophies = Array.from({ length: 10 }, (_, i) => ({ id: `t_${i}`, contentId: 'x', price: 1 }));
    const result = advanceWorld(s, lootData, 100);
    expect(result.state.phase).toBe('return'); expect(result.state.hero.distance).toBe(2);
    expect(result.events).toContainEqual(expect.objectContaining({ type: 'return', reason }));
    expect(advanceWorld(result.state, lootData, 9999).state.phase).toBe('return');
    expect(advanceWorld(result.state, lootData, 10000).state.phase).toBe('town');
  });

  it('does not return at exactly 30% HP', () => {
    const s = travelWorld(peaceful); s.hero.hp = s.hero.stats.maxHp * 0.3;
    expect(advanceWorld(s, lootData, 100).state.phase).toBe('travel');
  });

  it('migrates only on completed quest hand-in and only one eligible next town', () => {
    const c: GameData = { ...lootData, towns: [{ id: 'home', base_mile: 0, min_level: 1 }, { id: 'next', base_mile: 50, min_level: 2 }, { id: 'later', base_mile: 120, min_level: 3 }] };
    const s = createWorld(c, 9, peaceful); s.hero.level = 2; s.hero.nextLevelXp = worldXpThreshold(2);
    s.hero.quest = { id: 'unfinished', level: 1, progress: 99 };
    const noMigration = advanceWorld(s, c, 2000).state;
    expect(noMigration.hero.currentTownId).toBe('home');
    noMigration.phase = 'town'; noMigration.phaseMs = 0; noMigration.hero.quest!.progress = 100;
    const migrated = advanceWorld(noMigration, c, 2000);
    expect(migrated.state.hero.currentTownId).toBe('next');
    expect(worldZone(migrated.state, c)).toBe(5);
    expect(migrated.events).toContainEqual(expect.objectContaining({ type: 'migration', from: 'home', to: 'next' }));
    const notEligible = createWorld(c, 9, { ...peaceful, questXp: 0 });
    notEligible.hero.quest = { id: 'done', level: 1, progress: 100 };
    expect(advanceWorld(notEligible, c, 2000).state.hero.currentTownId).toBe('home');
  });

  it('resurrects exactly at timeout with canonical seeded loss, protects locked gear and preserves quest/bag', () => {
    const s = travelWorld(); s.phase = 'dead'; s.hero.hp = 0; s.deathRemainingMs = s.tuning.deathMs;
    s.hero.gold = 101; s.hero.distance = 8;
    const locked = s.hero.inventory.equipped.weapon!; locked.godBlessed = true;
    const expected = applyDeathLoss(s.hero.inventory, s.hero.gold, s.rng);
    const early = advanceWorld(s, lootData, 59999).state;
    expect(early.phase).toBe('dead'); expect(early.deathRemainingMs).toBe(100); expect(early.hero.gold).toBe(101);
    const result = advanceWorld(early, lootData, 1).state;
    expect(result.phase).toBe('town'); expect(result.hero.gold).toBe(75.75);
    expect(result.rng).toEqual(expected.rng); expect(result.hero.inventory).toEqual(expected.inventory);
    expect(result.hero.quest).toEqual(s.hero.quest); expect(result.hero.inventory.bag).toEqual(s.hero.inventory.bag);
    expect(result.hero.inventory.equipped.weapon?.godBlessed).toBe(true);
    expect(result.hero.hp).toBe(inventoryCombatStats(result.hero.base, result.hero.inventory).maxHp);
    expect(result.hero.distance).toBe(0);
  });

  it('settles actual combat victory, kill progress, XP/gold/trophy and returns when quest done', () => {
    let s = travelWorld({ ...peaceful, encounterBp: 10000, itemDropBp: 10000 });
    s = advanceWorld(s, lootData, 5000).state;
    expect(s.phase).toBe('combat'); expect(s.combat?.fight.tick).toBe(0); expect(s.combat?.monster.level).toBe(1);
    s.hero.quest!.progress = 95;
    const active = s.combat!; active.fight.monster.hp = 1; active.fight.hero.bar = 140000;
    const result = advanceWorld(s, lootData, 100);
    expect(result.state.phase).toBe('return'); expect(result.state.combat).toBeNull();
    expect(result.state.totals.kills).toBe(1); expect(result.state.hero.xp).toBe(20); expect(result.state.hero.gold).toBe(8);
    expect(result.state.hero.inventory.trophies).toHaveLength(1);
    expect(result.state.hero.quest?.progress).toBe(100);
    expect(result.events).toContainEqual(expect.objectContaining({ type: 'loot', kind: 'item' }));
  });

  it('settles actual lethal combat into a timed death, not a free heal or quest payout', () => {
    let s = travelWorld({ ...peaceful, encounterBp: 10000 }); s = advanceWorld(s, lootData, 5000).state;
    s.combat!.fight.hero.hp = 1; s.combat!.fight.hero.stats.regenMilliHp = 0;
    s.combat!.fight.hero.bar = 0; s.combat!.fight.monster.bar = 149999;
    const result = advanceWorld(s, lootData, 100).state;
    expect(result.phase).toBe('dead'); expect(result.hero.hp).toBe(0); expect(result.combat).toBeNull();
    expect(result.deathRemainingMs).toBe(60000); expect(result.totals.deaths).toBe(1); expect(result.totals.quests).toBe(0);
  });

  it('uses cheap estimate plus courage for flee, with seeded success/failure and no movement controls', () => {
    const outcomes = new Set<boolean>();
    for (let seed = 0; seed < 20; seed++) {
      let s = advanceWorld(createWorld(lootData, seed, { ...peaceful, encounterBp: 10000 }), lootData, 2000).state;
      s = actionWorld(s, lootData, { type: 'personality', courage: 1 });
      const result = advanceWorld(s, lootData, 5000);
      const flee = result.events.find((e) => e.type === 'flee');
      expect(flee?.type).toBe('flee');
      if (flee?.type === 'flee') {
        outcomes.add(flee.success); expect(result.state.phase).toBe(flee.success ? 'travel' : 'combat');
      }
      expect(result.state.hero.distance).toBe(1);
    }
    expect(outcomes).toEqual(new Set([true, false]));
    expect(() => actionWorld(createWorld(lootData, 1), lootData, { type: 'personality', courage: NaN })).toThrow();
  });

  it('town sells the weaker half and trophies, buys at most one affordable daily offer', () => {
    const s = createWorld(lootData, 123); s.hero.gold = 10000;
    const offers = worldShopOffers(lootData, s.seed, s.hero.currentTownId, 0);
    s.hero.inventory.bag = offers.slice(0, 4).map((item, i) => ({ ...item, id: `bag_${i}`, power: -100 - i }));
    s.hero.inventory.trophies = [{ id: 'trophy', contentId: 'x', price: 10 }];
    const result = advanceWorld(s, lootData, 2000);
    const service = result.events.find((e) => e.type === 'town_service');
    expect(service?.type).toBe('town_service');
    if (service?.type === 'town_service') { expect(service.sold).toBe(3); expect(service.gold).toBeGreaterThanOrEqual(3); }
    expect(result.state.hero.inventory.trophies).toHaveLength(0);
    expect(result.state.shop!.bought.length).toBeLessThanOrEqual(1);
    expect(result.state.hero.gold).toBeGreaterThanOrEqual(0);
    expect(worldShopOffers(lootData, 123, s.hero.currentTownId, 0)).toEqual(offers);
    expect(worldShopOffers(lootData, 123, s.hero.currentTownId, 1)).not.toEqual(offers);
  });

  it('level reward persists threshold and exactly +8 HP/+0.5 base damage and Faith', () => {
    const s = createWorld(lootData, 123, { ...peaceful, questXp: 100, questFaith: 3 });
    s.hero.quest = { id: 'done', level: 1, progress: 100 };
    const next = advanceWorld(s, lootData, 2000).state;
    expect(next.hero.level).toBe(2); expect(next.hero.xp).toBe(0);
    expect(next.hero.base).toEqual({ ...s.hero.base, maxHp: 108, damageMin: 4.5, damageMax: 6.5 });
    expect(next.hero.nextLevelXp).toBe(worldXpThreshold(2)); expect(next.faith).toBe(4);
  });

  it.each(['gold', 'item', 'brick'] as const)('resolves a seeded travel %s find with bounded resources', (kind) => {
    const s = travelWorld({ ...peaceful, goldFindBp: kind === 'gold' ? 10000 : 0, itemFindBp: kind === 'item' ? 10000 : 0, brickFindBp: kind === 'brick' ? 10000 : 0 });
    s.hero.gold = WORLD_RESOURCE_CAP;
    const result = advanceWorld(s, lootData, 5000);
    expect(result.state.phase).toBe('travel'); expect(result.state.hero.distance).toBe(1);
    if (kind === 'item') expect(result.events).toContainEqual(expect.objectContaining({ type: 'loot', kind: 'item', accepted: true }));
    else expect(result.events).toContainEqual(expect.objectContaining({ type: 'find', kind, amount: kind === 'gold' ? 5 : 1 }));
    expect(result.state.hero.gold).toBe(WORLD_RESOURCE_CAP);
    expect(result.state.bricks).toBe(kind === 'brick' ? 1 : 0);
  });

  it('replays JSON save/restore and arbitrary split advances identically, including pending time', () => {
    const s = createWorld(lootData, 5678);
    const once = advanceWorld(s, lootData, 3600123).state;
    let split = s;
    for (const ms of [17, 1983, 5017, 73419, 700001, 2819686]) split = advanceWorld(clone(split), lootData, ms).state;
    expect(split).toEqual(once); expect(once.pendingMs).toBe(23);
    expect(s.elapsedMs).toBe(0); expect(s.diary).toHaveLength(0);
  });

  it.each([1, 123, 5678])('runs a real seeded game-hour (%s) with progression and bounded finite state', (seed) => {
    const start = createWorld(lootData, seed); start.god.gp = 0; start.god.regenCarryMs = 123;
    const result = advanceWorld(start, lootData, 3600000); const s = result.state;
    expect(s.elapsedMs).toBe(3600000); expect(s.totals.kills).toBeGreaterThan(0);
    expect(s.totals.quests).toBeGreaterThan(0); expect(s.hero.level).toBeGreaterThan(1);
    expect(s.hero.gold).toBeGreaterThanOrEqual(0); expect(s.hero.gold).toBeLessThanOrEqual(WORLD_RESOURCE_CAP);
    expect(s.diary.length).toBeLessThanOrEqual(60); expect(result.events.length).toBeLessThanOrEqual(60);
    expect(s.hero.inventory.bag.length).toBeLessThanOrEqual(10); expect(s.hero.inventory.trophies.length).toBeLessThanOrEqual(10);
    expect(s.god).toEqual(start.god); finiteTree(s);
    if (seed === 123) {
      expect(s.totals).toEqual({ kills: 84, deaths: 0, quests: 33, miles: 286, fled: 0 });
      expect(s.hero.level).toBe(11); expect(s.hero.currentTownId).toBe('tradeburg');
      expect(s.phase).toBe('return'); expect(s.hero.distance).toBe(4); expect(s.nextEventSeq).toBe(874);
    }
  });

  it('validates duration/policy/action boundaries and preserves zero-time state', () => {
    const s = createWorld(lootData, 1);
    expect(advanceWorld(s, lootData, 0)).toEqual({ state: s, events: [] });
    for (const ms of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER]) expect(() => advanceWorld(s, lootData, ms === Number.MAX_SAFE_INTEGER ? ms + 1 : ms)).toThrow();
    expect(() => createWorld(lootData, 1, { stepMs: 1 })).toThrow();
    expect(() => createWorld(lootData, 1, { encounterBp: 10001 })).toThrow();
    expect(() => createWorld(lootData, 1, { diaryLimit: 101 })).toThrow();
    expect(() => worldShopOffers(lootData, 1, s.hero.currentTownId, -1)).toThrow();
    expect(() => worldXpThreshold(0)).toThrow();
    expect(DEFAULT_WORLD_TUNING.encounterBp).toBe(3000);
  });
});
