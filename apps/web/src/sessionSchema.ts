/** Explicit JSON boundary, not a parallel DTO: schemas are checked against domain types. */
import { z } from 'zod';
import { GEAR_SLOTS, STANDARD_STATS, type SessionState, type WorldEvent, type DivineEvent } from '@godville/sim';
const n = z.number().finite();
const uint = n.int().min(0).max(Number.MAX_SAFE_INTEGER);
const word = uint.max(0xffffffff);
const resource = n.min(0).max(1e12);
const id = z.string().min(1).max(256);
const bool = z.boolean();
const obj = z.strictObject;
// Zod's optional output includes undefined; JSON never does. Normalize only validated objects.
function clean<T extends object>(value: T): { [K in keyof T]: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as { [K in keyof T]: Exclude<T[K], undefined> };
}
const phase = z.enum(['town', 'travel', 'combat', 'return', 'dead']);
const voice = z.enum(['fight', 'flee', 'rest', 'town', 'dig']);
const upgrade = z.enum(['capacity', 'flow', 'miracle', 'clarity']);
const kind = z.enum(['blessing', 'smite']);
const outcome = z.enum(['hero_won', 'monster_won', 'draw']);
const rng = obj({ a: word, b: word, c: word, d: word });
const stats = obj({ maxHp: n, damageMin: n, damageMax: n, attackSpeed: n, defense: n, crit: n, evasion: n, regen: n, vampirism: n, counter: n });
const combatStats = obj({ maxHp: uint.min(1), damageMin: uint, damageMax: uint, attackSpeedBp: n.int().min(-9000).max(20000), defense: uint, critBp: uint.max(5000), evasionBp: uint.max(6000), regenMilliHp: n.int(), vampirismBp: uint.max(3000), counterBp: uint.max(4000) }).refine(s => s.damageMin <= s.damageMax);
const combatant = obj({ stats: combatStats, hp: uint, bar: uint.max(149999), regenCarry: n.int().min(-999).max(999) }).refine(s => s.hp <= s.stats.maxHp);
const fight = obj({ schemaVersion: z.literal(1), seed: word, tick: uint, pendingMs: uint.max(99), rng, hero: combatant, monster: combatant, queue: z.array(obj({ seq: uint, kind, cost: uint, strengthBp: uint.min(1).max(1000000).optional() }).transform(clean)).max(100), nextSeq: uint, outcome: outcome.nullable() }).refine(s => s.queue.every(q => q.seq < s.nextSeq));
const item = obj({ id, baseId: id, level: uint, baseStats: z.array(z.enum(STANDARD_STATS)).max(2), modifiers: z.array(obj({ id, randomStat: z.enum(STANDARD_STATS).optional(), curseStat: z.enum(STANDARD_STATS).optional() }).transform(clean)).max(12), slot: z.enum(GEAR_SLOTS), stats, power: n, basePower: n.min(0), rarity: z.enum(['grey', 'white', 'green', 'blue', 'purple', 'orange']), price: n.min(0), sellPrice: n.min(0), shopPrice: n.min(0), godBlessed: bool, blessingHealMultiplier: n.positive(), miracleMultiplier: n.positive() });
const inventory = obj({ equipped: obj({ weapon: item.optional(), helmet: item.optional(), armor: item.optional(), shield: item.optional(), ring: item.optional(), amulet: item.optional() }).transform(clean), bag: z.array(item).max(10), trophies: z.array(obj({ id, contentId: id, price: n.min(0) })).max(10) }).refine(s => {
  const ids = [...Object.values(s.equipped), ...s.bag, ...s.trophies].map(i => i.id);
  return new Set(ids).size === ids.length && GEAR_SLOTS.every(slot => !s.equipped[slot] || s.equipped[slot].slot === slot);
});
const eventBase = { seq: uint, atMs: uint };
const worldEvent = z.discriminatedUnion('type', [
  obj({ ...eventBase, type: z.literal('phase'), phase }),
  obj({ ...eventBase, type: z.literal('quest_taken'), questId: id }),
  obj({ ...eventBase, type: z.literal('quest_paid'), questId: id, gold: resource, xp: resource, faith: resource }),
  obj({ ...eventBase, type: z.literal('level'), level: uint.min(1).max(1000) }),
  obj({ ...eventBase, type: z.literal('migration'), from: id, to: id }),
  obj({ ...eventBase, type: z.literal('return'), reason: z.enum(['hp', 'pouch', 'quest']) }),
  obj({ ...eventBase, type: z.literal('encounter'), monsterId: id, contentId: id, level: uint }),
  obj({ ...eventBase, type: z.literal('flee'), success: bool }),
  obj({ ...eventBase, type: z.literal('combat_end'), outcome, monsterId: id, ticks: uint, hp: uint }),
  obj({ ...eventBase, type: z.literal('loot'), kind: z.enum(['item', 'trophy']), id, accepted: bool }),
  obj({ ...eventBase, type: z.literal('find'), kind: z.enum(['gold', 'brick']), amount: resource }),
  obj({ ...eventBase, type: z.literal('diary'), variant: uint.max(15) }),
  obj({ ...eventBase, type: z.literal('town_service'), sold: uint, gold: n.min(0), boughtId: id.nullable() }),
  obj({ ...eventBase, type: z.literal('resurrect'), goldLost: n.min(0), itemId: id.nullable() }),
  obj({ ...eventBase, type: z.literal('voice_effect'), intent: voice, amount: n.min(0) }),
]) satisfies z.ZodType<WorldEvent>;
const divineBase = { seq: uint, atRealMs: uint, atGameMs: uint };
const divineEvent = z.discriminatedUnion('type', [
  obj({ ...divineBase, type: z.literal('miracle'), kind, queued: bool, amount: uint, strengthBp: uint.min(1).max(1000000) }),
  obj({ ...divineBase, type: z.literal('voice'), keyword: voice.nullable(), obeyed: bool }),
  obj({ ...divineBase, type: z.literal('upgrade'), upgrade, level: uint.max(10), cost: uint }),
  obj({ ...divineBase, type: z.literal('charge_used'), amount: uint }),
  obj({ ...divineBase, type: z.literal('item_blessed'), itemId: id }),
]) satisfies z.ZodType<DivineEvent>;
const duration = uint.min(100).max(1e12).multipleOf(100);
const bp = uint.max(10000);
const tuning = obj({ stepMs: duration, milesPerStep: n.positive().max(10), townMs: duration, deathMs: duration, encounterBp: bp, goldFindBp: bp, itemFindBp: bp, brickFindBp: bp, itemDropBp: bp, killXp: resource, killGold: resource, findGold: resource, questKillProgress: n.min(0).max(100), questMileProgress: n.positive().max(100), questGold: resource, questXp: resource, questFaith: resource, levelFaith: resource, shopOffers: uint.min(1).max(20), shopPriceMultiplier: resource, dayMs: duration, diaryLimit: uint.min(20).max(100) }).refine(t => t.encounterBp + t.goldFindBp + t.itemFindBp + t.brickFindBp <= 10000);
const world = obj({
  schemaVersion: z.literal(1), seed: word, rng, elapsedMs: uint.multipleOf(100), pendingMs: uint.max(99), nextId: uint, nextEventSeq: uint, phase, phaseMs: uint, travelCarryMs: uint, deathRemainingMs: uint,
  hero: obj({ hp: uint, stats: combatStats, base: stats, level: uint.min(1).max(1000), xp: resource, nextLevelXp: n.positive(), gold: resource, courage: n.min(0).max(1), alignment: n.min(-100).max(100), favoriteModifierId: id.nullable(), inventory, quest: obj({ id, level: uint.min(1).max(1000), progress: n.min(0).max(100) }).nullable(), currentTownId: id, distance: n.min(0) }),
  combat: obj({ fight, monster: obj({ id, contentId: id, family: z.enum(['spider', 'golem', 'wraith', 'leech', 'brute']), level: uint, stats }) }).nullable(), voiceIntent: voice.optional(), faith: resource, bricks: resource,
  god: obj({ gp: uint.max(350), gpMax: uint.min(100).max(350), regenCarryMs: uint.max(359999) }),
  shop: obj({ townId: id, day: uint, bought: z.array(id).max(20) }).nullable(), diary: z.array(worldEvent).max(100), tuning,
  totals: obj({ kills: uint, deaths: uint, quests: uint, miles: resource, fled: uint }),
}).transform(clean).refine(s => s.hero.hp <= s.hero.stats.maxHp && s.god.gp <= s.god.gpMax && (s.phase === 'combat') === (s.combat !== null) && (s.phase !== 'dead' || s.hero.hp === 0) && s.diary.length <= s.tuning.diaryLimit && s.diary.every(e => e.seq < s.nextEventSeq && e.atMs <= s.elapsedMs));
export const sessionSchema = obj({ schemaVersion: z.literal(1), world, clock: obj({ carry: uint.max(9) }), realElapsedMs: uint, upgrades: obj({ capacity: uint.max(10), flow: uint.max(10), miracle: uint.max(10), clarity: uint.max(7) }), charges: uint.max(3), overflowGp: uint.max(99), nextEventSeq: uint, diary: z.array(divineEvent).max(60) }).refine(s => s.world.god.gpMax === 100 + s.upgrades.capacity * 25 && (s.charges < 3 || s.overflowGp === 0) && s.diary.every(e => e.seq < s.nextEventSeq && e.atRealMs <= s.realElapsedMs && e.atGameMs <= s.world.elapsedMs)) satisfies z.ZodType<SessionState>;
const pendingSegment = obj({ end: uint, speed: z.enum(['watched', 'unwatched']) });
export const saveEnvelopeSchema = obj({ version: z.literal(1), savedAtMs: uint, session: sessionSchema, pending: z.array(pendingSegment).optional() }).refine(s => (s.pending ?? []).every((segment, i, all) => segment.end > (i === 0 ? s.savedAtMs : all[i - 1]!.end)));
export interface SaveEnvelope { version: 1; savedAtMs: number; session: SessionState; pending?: { end: number; speed: 'watched' | 'unwatched' }[] }
