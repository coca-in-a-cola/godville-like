/** Autonomous hero domain. Content must be validated by the caller; no data loader lives here. */
import { createFight, stepInPlace, TICK_MS, type FightState, type FightEvent } from './fight.ts';
import { estimateDuel } from './estimate.ts';
import { createGodState, type GodState } from './god.ts';
import { applyDeathLoss, emptyInventory, inventoryCombatStats, inventoryStats, perceivedPower, pickupGear, pickupTrophy, sellInTown, TROPHY_POUCH_CAPACITY, type Inventory, type HeroQuirks } from './inventory.ts';
import { buildItem, generateItem, GEAR_SLOTS, type GearItem, type LootContent } from './loot.ts';
import { generateMonster, type GeneratedMonster, type MonsterName } from './monsters.ts';
import { mixSeed, nextU32, randomBelow, rollBp, seedRng, type RngState } from './rng.ts';
import { HERO_BASE_STATS, type CombatStats, type StatBlock } from './stats.ts';
import { WORLD_LEVEL_CAP, worldXpThreshold } from './progression.ts';
export { WORLD_LEVEL_CAP, worldXpThreshold } from './progression.ts';

export interface TownContent { id: string; base_mile: number; min_level: number }
export interface TrophyContent { id: string; base_price: number }
/** Structurally satisfied by validated data-package GameData. Never imports that package. */
export interface GameData extends LootContent {
  towns: readonly TownContent[];
  monsters: readonly MonsterName[];
  trophies: readonly TrophyContent[];
}
export interface WorldTuning {
  stepMs: number; milesPerStep: number; townMs: number; deathMs: number;
  encounterBp: number; goldFindBp: number; itemFindBp: number; brickFindBp: number;
  itemDropBp: number; killXp: number; killGold: number; findGold: number;
  questKillProgress: number; questMileProgress: number;
  questGold: number; questXp: number; questFaith: number; levelFaith: number;
  shopOffers: number; shopPriceMultiplier: number; dayMs: number; diaryLimit: number;
}
/** Unspecified design values are policy, not combat calibration. */
export const DEFAULT_WORLD_TUNING: Readonly<WorldTuning> = Object.freeze({
  stepMs: 5000, milesPerStep: 1, townMs: 2000, deathMs: 60000,
  encounterBp: 3000, goldFindBp: 1500, itemFindBp: 500, brickFindBp: 10,
  itemDropBp: 2000, killXp: 20, killGold: 8, findGold: 5,
  questKillProgress: 25, questMileProgress: 5,
  questGold: 60, questXp: 60, questFaith: 3, levelFaith: 1,
  shopOffers: 6, shopPriceMultiplier: 1, dayMs: 86400000, diaryLimit: 60,
});
export const WORLD_RESOURCE_CAP = 1_000_000_000_000;

export type WorldPhase = 'town' | 'travel' | 'combat' | 'return' | 'dead';
export type VoiceIntent = 'fight' | 'flee' | 'rest' | 'town' | 'dig';
export const VOICE_WORLD_POLICY = Object.freeze({ restHealPercent: 5, digBrickBp: 50 });
export type ReturnReason = 'hp' | 'pouch' | 'quest';
export interface WorldQuest { id: string; level: number; progress: number }
export interface WorldHero extends HeroQuirks {
  hp: number; stats: CombatStats; base: StatBlock; level: number; xp: number; nextLevelXp: number;
  gold: number; courage: number; inventory: Inventory; quest: WorldQuest | null;
  currentTownId: string; distance: number;
}
export type WorldEvent = { seq: number; atMs: number } & (
  | { type: 'phase'; phase: WorldPhase }
  | { type: 'quest_taken'; questId: string }
  | { type: 'quest_paid'; questId: string; gold: number; xp: number; faith: number }
  | { type: 'level'; level: number }
  | { type: 'migration'; from: string; to: string }
  | { type: 'return'; reason: ReturnReason }
  | { type: 'encounter'; monsterId: string; contentId: string; level: number }
  | { type: 'flee'; success: boolean }
  | { type: 'combat_end'; outcome: 'hero_won' | 'monster_won' | 'draw'; monsterId: string; ticks: number; hp: number }
  | { type: 'loot'; kind: 'item' | 'trophy'; id: string; accepted: boolean }
  | { type: 'find'; kind: 'gold' | 'brick'; amount: number }
  | { type: 'diary'; variant: number }
  | { type: 'town_service'; sold: number; gold: number; boughtId: string | null }
  | { type: 'resurrect'; goldLost: number; itemId: string | null }
  | { type: 'voice_effect'; intent: VoiceIntent; amount: number }
);
type EventPayload = WorldEvent extends infer E ? E extends WorldEvent ? Omit<E, 'seq' | 'atMs'> : never : never;
export interface WorldState {
  schemaVersion: 1; seed: number; rng: RngState; elapsedMs: number; pendingMs: number;
  nextId: number; nextEventSeq: number; phase: WorldPhase; phaseMs: number;
  travelCarryMs: number; deathRemainingMs: number; hero: WorldHero;
  combat: { fight: FightState; monster: GeneratedMonster } | null;
  /** Internal decision hint from paid, obeyed Voice; never direct movement. */
  voiceIntent?: VoiceIntent;
  faith: number; bricks: number; god: GodState;
  shop: { townId: string; day: number; bought: string[] } | null;
  diary: WorldEvent[]; tuning: WorldTuning;
  totals: { kills: number; deaths: number; quests: number; miles: number; fled: number };
}
export interface AdvanceOptions { collectCombatEvents?: boolean }
export interface WorldCombatEvent { fightId: string; event: FightEvent }
export interface WorldAdvance { state: WorldState; /** Bounded newest events, just like diary. */ events: WorldEvent[]; combatEvents?: WorldCombatEvent[] }
function validateTuning(t: WorldTuning): void {
  for (const [key, value] of Object.entries(t)) {
    if (!Number.isFinite(value) || value < 0 || value > WORLD_RESOURCE_CAP) throw new RangeError(`invalid tuning ${key}`);
  }
  for (const key of ['stepMs', 'townMs', 'deathMs', 'dayMs'] as const) {
    if (!Number.isSafeInteger(t[key]) || t[key] < TICK_MS || t[key] % TICK_MS !== 0) throw new RangeError(`invalid duration ${key}`);
  }
  for (const key of ['encounterBp', 'goldFindBp', 'itemFindBp', 'brickFindBp', 'itemDropBp'] as const) {
    if (!Number.isInteger(t[key]) || t[key] > 10000) throw new RangeError(`invalid probability ${key}`);
  }
  if (t.encounterBp + t.goldFindBp + t.itemFindBp + t.brickFindBp > 10000) throw new RangeError('travel probabilities exceed 100%');
  if (t.milesPerStep <= 0 || t.milesPerStep > 10 || t.questMileProgress <= 0 || t.questMileProgress > 100 || t.questKillProgress > 100) throw new RangeError('invalid travel/quest policy');
  if (!Number.isInteger(t.diaryLimit) || t.diaryLimit < 20 || t.diaryLimit > 100 || !Number.isInteger(t.shopOffers) || t.shopOffers < 1 || t.shopOffers > 20) throw new RangeError('invalid bounded collection policy');
}
function towns(content: GameData): TownContent[] { return [...content.towns].sort((a, b) => a.base_mile - b.base_mile); }
function town(s: WorldState, c: GameData): TownContent {
  const result = c.towns.find((r) => r.id === s.hero.currentTownId);
  if (!result) throw new RangeError('unknown current town');
  return result;
}
export function worldZone(s: WorldState, c: GameData): number { return Math.ceil((town(s, c).base_mile + s.hero.distance) / 10); }
function bounded(value: number): number { return Math.max(0, Math.min(WORLD_RESOURCE_CAP, value)); }
function id(s: WorldState, kind: string): string {
  if (!Number.isSafeInteger(s.nextId + 1)) throw new RangeError('world ID limit');
  return `${kind}_${s.nextId++}`;
}
function emit(s: WorldState, events: WorldEvent[], payload: EventPayload): void {
  if (!Number.isSafeInteger(s.nextEventSeq + 1)) throw new RangeError('world event limit');
  const event = { ...payload, seq: s.nextEventSeq++, atMs: s.elapsedMs } as WorldEvent;
  s.diary.push(event); events.push(event);
  if (s.diary.length > s.tuning.diaryLimit) s.diary.shift();
  if (events.length > s.tuning.diaryLimit) events.shift();
}
function phase(s: WorldState, events: WorldEvent[], next: WorldPhase): void {
  s.phase = next; s.phaseMs = 0; s.travelCarryMs = 0;
  emit(s, events, { type: 'phase', phase: next });
}
function refreshStats(s: WorldState): void {
  s.hero.stats = inventoryCombatStats(s.hero.base, s.hero.inventory);
  s.hero.hp = Math.min(s.hero.hp, s.hero.stats.maxHp);
}

function xp(s: WorldState, events: WorldEvent[], amount: number): void {
  const h = s.hero; h.xp = bounded(h.xp + amount);
  while (h.level < WORLD_LEVEL_CAP && h.xp >= h.nextLevelXp) {
    h.xp -= h.nextLevelXp; h.level += 1; h.nextLevelXp = worldXpThreshold(h.level);
    h.base.maxHp += 8; h.base.damageMin += 0.5; h.base.damageMax += 0.5;
    refreshStats(s); // Growth increases capacity, not a free full heal.
    s.faith = bounded(s.faith + s.tuning.levelFaith);
    emit(s, events, { type: 'level', level: h.level });
  }
}
export function createWorld(content: GameData, seed: number, overrides: Partial<WorldTuning> = {}): WorldState {
  const tuning = { ...DEFAULT_WORLD_TUNING, ...overrides }; validateTuning(tuning);
  const ordered = towns(content);
  if (!ordered.length || !content.trophies.length || !content.monsters.length || ordered[0]!.min_level !== 1) throw new RangeError('missing starter world content');
  let inventory = emptyInventory();
  for (const slot of GEAR_SLOTS) {
    const base = content.bases.find((row) => row.slot === slot);
    if (!base) throw new RangeError(`missing starter slot ${slot}`);
    const item = buildItem(content, { id: `starter_${slot}`, baseId: base.id, level: 0, baseStats: slot === 'ring' ? ['damage'] : slot === 'amulet' ? ['maxHp', 'defense'] : [], modifiers: [] });
    inventory = { ...inventory, equipped: { ...inventory.equipped, [slot]: item } };
  }
  const stats = inventoryCombatStats(HERO_BASE_STATS, inventory);
  return {
    schemaVersion: 1, seed, rng: seedRng(seed), elapsedMs: 0, pendingMs: 0, nextId: 0, nextEventSeq: 0,
    phase: 'town', phaseMs: 0, travelCarryMs: 0, deathRemainingMs: 0,
    hero: { hp: stats.maxHp, stats, base: { ...HERO_BASE_STATS }, level: 1, xp: 0, nextLevelXp: worldXpThreshold(1), gold: 0, alignment: 0, courage: 0.5, favoriteModifierId: null, inventory, quest: null, currentTownId: ordered[0]!.id, distance: 0 },
    combat: null, faith: 0, bricks: 0, god: createGodState(), shop: null, diary: [], tuning,
    totals: { kills: 0, deaths: 0, quests: 0, miles: 0, fled: 0 },
  };
}
/** Day is explicitly caller supplied. World uses floor(elapsed game ms / dayMs), not civil time. */
export function worldShopOffers(content: GameData, seed: number, townId: string, day: number, tuning: WorldTuning = DEFAULT_WORLD_TUNING): GearItem[] {
  validateTuning(tuning);
  if (!Number.isSafeInteger(day) || day < 0) throw new RangeError('invalid shop day');
  const ordered = towns(content); const index = ordered.findIndex((r) => r.id === townId);
  if (index < 0) throw new RangeError('unknown shop town');
  let rng = seedRng(mixSeed(mixSeed(seed, index), day >>> 0));
  const result: GearItem[] = [];
  for (let i = 0; i < tuning.shopOffers; i++) {
    const generated = generateItem(content, rng, { id: `shop_${townId}_${day}_${i}`, level: Math.ceil(ordered[index]!.base_mile / 10) });
    rng = generated.rng; result.push(generated.item);
  }
  return result;
}
function serviceTown(s: WorldState, c: GameData, events: WorldEvent[]): void {
  const h = s.hero; const t = s.tuning;
  if (h.quest && h.quest.progress >= 100) {
    const q = h.quest; const gold = t.questGold * q.level; const experience = t.questXp * q.level;
    h.gold = bounded(h.gold + gold); s.faith = bounded(s.faith + t.questFaith); s.totals.quests++;
    xp(s, events, experience);
    emit(s, events, { type: 'quest_paid', questId: q.id, gold, xp: experience, faith: t.questFaith });
    h.quest = null;
    const ordered = towns(c); const index = ordered.findIndex((r) => r.id === h.currentTownId); const next = ordered[index + 1];
    if (next && h.level >= next.min_level) {
      const from = h.currentTownId; h.currentTownId = next.id;
      emit(s, events, { type: 'migration', from, to: next.id });
    }
  }
  const sale = sellInTown(h.inventory, h); h.inventory = sale.inventory; h.gold = bounded(h.gold + sale.gold);
  const day = Math.floor(s.elapsedMs / t.dayMs);
  if (!s.shop || s.shop.day !== day || s.shop.townId !== h.currentTownId) s.shop = { townId: h.currentTownId, day, bought: [] };
  const offers = worldShopOffers(c, s.seed, h.currentTownId, day, t);
  let boughtId: string | null = null;
  // Buy at most one affordable strict perceived upgrade; stable catalog order breaks ties.
  for (const item of offers) {
    const old = h.inventory.equipped[item.slot];
    if (s.shop.bought.includes(item.id) || item.shopPrice * t.shopPriceMultiplier > h.gold || (old && perceivedPower(item, h) <= perceivedPower(old, h) + Math.abs(perceivedPower(old, h)) * 0.05)) continue;
    const picked = pickupGear(h.inventory, item, h);
    if (!picked.accepted) continue;
    h.inventory = picked.inventory; h.gold = bounded(h.gold - item.shopPrice * t.shopPriceMultiplier);
    s.shop.bought.push(item.id); boughtId = item.id; break;
  }
  refreshStats(s); h.hp = h.stats.maxHp; h.distance = 0;
  emit(s, events, { type: 'town_service', sold: sale.sold.length, gold: sale.gold, boughtId });
  if (!h.quest) {
    h.quest = { id: id(s, 'quest'), level: h.level, progress: 0 };
    emit(s, events, { type: 'quest_taken', questId: h.quest.id });
  }
  phase(s, events, 'travel');
}
function returnReason(s: WorldState): ReturnReason | null {
  if (s.hero.hp < s.hero.stats.maxHp * 0.3) return 'hp';
  if (s.hero.inventory.trophies.length >= TROPHY_POUCH_CAPACITY) return 'pouch';
  if (s.hero.quest && s.hero.quest.progress >= 100) return 'quest';
  return null;
}
function decideReturn(s: WorldState, events: WorldEvent[]): boolean {
  const reason = returnReason(s); if (!reason) return false;
  emit(s, events, { type: 'return', reason }); phase(s, events, 'return'); return true;
}
function progress(s: WorldState, amount: number): void { if (s.hero.quest) s.hero.quest.progress = Math.min(100, s.hero.quest.progress + amount); }
function itemLoot(s: WorldState, c: GameData, events: WorldEvent[], level: number): void {
  const generated = generateItem(c, s.rng, { id: id(s, 'item'), level }); s.rng = generated.rng;
  const picked = pickupGear(s.hero.inventory, generated.item, s.hero); s.hero.inventory = picked.inventory; refreshStats(s);
  emit(s, events, { type: 'loot', kind: 'item', id: generated.item.id, accepted: picked.accepted });
}
function encounter(s: WorldState, c: GameData, events: WorldEvent[]): void {
  const generated = generateMonster(c.monsters, s.rng, { id: id(s, 'monster'), level: worldZone(s, c) }); s.rng = generated.rng;
  const monster = generated.monster;
  const fight = createFight({ seed: nextU32(s.rng), hero: inventoryStats(s.hero.base, s.hero.inventory), monster: monster.stats });
  fight.hero.hp = s.hero.hp;
  emit(s, events, { type: 'encounter', monsterId: monster.id, contentId: monster.contentId, level: monster.level });
  const estimate = estimateDuel(fight.hero, fight.monster);
  // Cheap TTK ratio is a heuristic score, NOT a calibrated probability.
  const score = !Number.isFinite(estimate.heroTtk) ? 0 : !Number.isFinite(estimate.monsterTtk) ? 1 : estimate.monsterTtk / (estimate.heroTtk + estimate.monsterTtk);
  const threshold = Math.max(0, Math.min(1, s.hero.courage + s.hero.alignment * 0.01));
  const intent = s.voiceIntent;
  if (intent === 'fight' || intent === 'flee') {
    delete s.voiceIntent; emit(s, events, { type: 'voice_effect', intent, amount: 0 });
  }
  if (intent === 'flee' || (intent !== 'fight' && score < threshold)) {
    const success = rollBp(s.rng, Math.min(10000, 5000 + s.hero.stats.evasionBp));
    emit(s, events, { type: 'flee', success });
    if (success) { s.totals.fled++; return; }
  }
  s.combat = { fight, monster }; phase(s, events, 'combat');
}
function travel(s: WorldState, c: GameData, events: WorldEvent[]): void {
  if (s.voiceIntent === 'town') {
    delete s.voiceIntent; emit(s, events, { type: 'voice_effect', intent: 'town', amount: 0 });
    phase(s, events, 'return'); return;
  }
  if (decideReturn(s, events)) return;
  s.travelCarryMs += TICK_MS;
  if (s.travelCarryMs < s.tuning.stepMs) return;
  s.travelCarryMs -= s.tuning.stepMs;
  if (s.voiceIntent === 'rest' || s.voiceIntent === 'dig') {
    const intent = s.voiceIntent; delete s.voiceIntent;
    let amount: number;
    if (intent === 'rest') {
      amount = Math.min(s.hero.stats.maxHp - s.hero.hp, Math.floor(s.hero.stats.maxHp * VOICE_WORLD_POLICY.restHealPercent / 100));
      s.hero.hp += amount;
    } else if (rollBp(s.rng, VOICE_WORLD_POLICY.digBrickBp)) {
      amount = 1; s.bricks = bounded(s.bricks + amount); emit(s, events, { type: 'find', kind: 'brick', amount });
    } else {
      amount = s.tuning.findGold; s.hero.gold = bounded(s.hero.gold + amount); emit(s, events, { type: 'find', kind: 'gold', amount });
    }
    emit(s, events, { type: 'voice_effect', intent, amount }); return;
  }
  s.hero.distance += s.tuning.milesPerStep; s.totals.miles = bounded(s.totals.miles + s.tuning.milesPerStep);
  progress(s, s.tuning.questMileProgress * s.tuning.milesPerStep);
  if (decideReturn(s, events)) return;
  const roll = randomBelow(s.rng, 10000); const t = s.tuning;
  if (roll < t.encounterBp) encounter(s, c, events);
  else if (roll < t.encounterBp + t.goldFindBp) {
    const amount = t.findGold * Math.max(1, worldZone(s, c)); s.hero.gold = bounded(s.hero.gold + amount);
    emit(s, events, { type: 'find', kind: 'gold', amount });
  } else if (roll < t.encounterBp + t.goldFindBp + t.itemFindBp) itemLoot(s, c, events, worldZone(s, c));
  else if (roll < t.encounterBp + t.goldFindBp + t.itemFindBp + t.brickFindBp) {
    s.bricks = bounded(s.bricks + 1); emit(s, events, { type: 'find', kind: 'brick', amount: 1 });
  } else emit(s, events, { type: 'diary', variant: randomBelow(s.rng, 16) });
  if (s.phase === 'travel') decideReturn(s, events);
}
/** @internal Shared lethal transition for combat and session punishment; mutates owned clones only. */
export function enterWorldDeathInPlace(s: WorldState, events: WorldEvent[]): void {
  if (s.phase === 'dead') return;
  delete s.voiceIntent; s.combat = null; s.hero.hp = 0;
  s.totals.deaths++; s.deathRemainingMs = s.tuning.deathMs; phase(s, events, 'dead');
}
function combat(s: WorldState, c: GameData, events: WorldEvent[], combatEvents?: WorldCombatEvent[]): void {
  const active = s.combat!; const fight = active.fight;
  const tickEvents: FightEvent[] | null = combatEvents ? [] : null;
  stepInPlace(fight, tickEvents); s.hero.hp = fight.hero.hp;
  if (combatEvents && tickEvents) {
    for (const event of tickEvents) combatEvents.push({ fightId: active.monster.id, event });
    if (combatEvents.length > 400) combatEvents.splice(0, combatEvents.length - 400);
  }
  if (!fight.outcome && (s.voiceIntent === 'fight' || s.voiceIntent === 'flee')) {
    const intent = s.voiceIntent; delete s.voiceIntent;
    emit(s, events, { type: 'voice_effect', intent, amount: 0 });
    if (intent === 'flee') {
      const success = rollBp(s.rng, Math.min(10000, 5000 + s.hero.stats.evasionBp));
      emit(s, events, { type: 'flee', success });
      if (success) { s.totals.fled++; s.combat = null; phase(s, events, 'travel'); return; }
    }
  }
  if (!fight.outcome) return;
  emit(s, events, { type: 'combat_end', outcome: fight.outcome, monsterId: active.monster.id, ticks: fight.tick, hp: s.hero.hp });
  s.combat = null;
  if (fight.outcome !== 'hero_won') {
    enterWorldDeathInPlace(s, events); return;
  }
  s.totals.kills++; const rewardLevel = Math.max(1, active.monster.level);
  s.hero.gold = bounded(s.hero.gold + s.tuning.killGold * rewardLevel); xp(s, events, s.tuning.killXp * rewardLevel);
  progress(s, s.tuning.questKillProgress);
  const row = c.trophies[randomBelow(s.rng, c.trophies.length)]!;
  const trophy = { id: id(s, 'trophy'), contentId: row.id, price: row.base_price * rewardLevel };
  const picked = pickupTrophy(s.hero.inventory, trophy); s.hero.inventory = picked.inventory;
  emit(s, events, { type: 'loot', kind: 'trophy', id: trophy.id, accepted: picked.accepted });
  if (rollBp(s.rng, s.tuning.itemDropBp)) itemLoot(s, c, events, active.monster.level);
  if (rollBp(s.rng, 50)) { s.bricks = bounded(s.bricks + 1); emit(s, events, { type: 'find', kind: 'brick', amount: 1 }); }
  phase(s, events, 'travel'); decideReturn(s, events);
}
/** Immutable boundary; the internal loop mutates only this JSON clone. No full combat logs retained. */
export function advanceWorld(state: WorldState, content: GameData, gameMs: number, options: AdvanceOptions = {}): WorldAdvance {
  if (!Number.isSafeInteger(gameMs) || gameMs < 0 || !Number.isSafeInteger(state.elapsedMs + state.pendingMs + gameMs)) throw new RangeError('invalid game time budget');
  const s = JSON.parse(JSON.stringify(state)) as WorldState; const events: WorldEvent[] = [];
  const combatEvents: WorldCombatEvent[] | undefined = options.collectCombatEvents ? [] : undefined;
  let budget = s.pendingMs + gameMs;
  while (budget >= TICK_MS) {
    budget -= TICK_MS; s.elapsedMs += TICK_MS; s.phaseMs += TICK_MS;
    switch (s.phase) {
      case 'town': if (s.phaseMs >= s.tuning.townMs) serviceTown(s, content, events); break;
      case 'travel': travel(s, content, events); break;
      case 'combat': combat(s, content, events, combatEvents); break;
      case 'return':
        s.travelCarryMs += TICK_MS;
        if (s.travelCarryMs >= s.tuning.stepMs) {
          s.travelCarryMs -= s.tuning.stepMs;
          s.hero.distance = Math.max(0, s.hero.distance - s.tuning.milesPerStep);
          if (s.hero.distance === 0) phase(s, events, 'town');
        }
        break;
      case 'dead':
        s.deathRemainingMs = Math.max(0, s.deathRemainingMs - TICK_MS);
        if (s.deathRemainingMs === 0) {
          const loss = applyDeathLoss(s.hero.inventory, s.hero.gold, s.rng);
          s.rng = loss.rng; s.hero.inventory = loss.inventory; s.hero.gold = loss.gold; s.hero.distance = 0;
          refreshStats(s); s.hero.hp = s.hero.stats.maxHp;
          emit(s, events, { type: 'resurrect', goldLost: loss.goldLost, itemId: loss.lostItem?.id ?? null }); phase(s, events, 'town');
        }
        break;
    }
  }
  s.pendingMs = budget; return { state: s, events, ...(combatEvents ? { combatEvents } : {}) };
}
/** Personality editing only: no direct movement or fake god controls. */
export type WorldAction = { type: 'personality'; courage?: number; favoriteModifierId?: string | null };
export function actionWorld(state: WorldState, content: GameData, action: WorldAction): WorldState {
  if (action.type !== 'personality') throw new RangeError('unknown world action');
  if (action.courage !== undefined && (!Number.isFinite(action.courage) || action.courage < 0 || action.courage > 1)) throw new RangeError('courage must be in [0, 1]');
  if (action.favoriteModifierId != null && !content.modifiers.some((m) => m.id === action.favoriteModifierId)) throw new RangeError('unknown favorite modifier');
  return { ...state, hero: { ...state.hero, ...(action.courage !== undefined ? { courage: action.courage } : {}), ...(action.favoriteModifierId !== undefined ? { favoriteModifierId: action.favoriteModifierId } : {}) } };
}
