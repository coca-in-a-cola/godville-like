/** Persistence-ready orchestration. Trusted states/content only; no platform clocks. */
import { blessingHeal } from './fight.ts';
import { GP_REGEN_INTERVAL_MS, requestIntervention } from './god.ts';
import { blessItem, equipBest, inventoryCombatStats, inventoryMiracleEffects } from './inventory.ts';
import { rollBp } from './rng.ts';
import { createWorldClock, scaleRealToGame, type GameSpeed, type WorldClock } from './time.ts';
import { advanceWorld, createWorld, enterWorldDeathInPlace, type GameData, type VoiceIntent, type WorldEvent, type WorldState, type WorldTuning } from './world.ts';

export type FaithUpgrade = 'capacity' | 'flow' | 'miracle' | 'clarity';
/** Explicit prototype policy; saves pin levels, not caller-controlled rates/costs. */
export const DIVINE_TUNING = Object.freeze({
  baseCapacity: 100, capacityPerLevel: 25, flowRatePerLevel: 1,
  miracleBpPerLevel: 1000, clarityBpPerLevel: 1000, baseObeyBp: 3000,
  upgradeBaseCost: 5, upgradeCostStep: 5, maxLevel: 10, maxClarityLevel: 7,
  chargeGp: 100, maxCharges: 3, voiceCost: 5, alignmentCap: 100,
  smiteHeroPercent: 10, smiteQuestProgress: 5, logLimit: 60,
});
export interface SessionState {
  schemaVersion: 1;
  world: WorldState;
  clock: WorldClock;
  realElapsedMs: number;
  upgrades: Record<FaithUpgrade, number>;
  charges: number;
  /** Overflow must earn a whole 100 GP before becoming spendable. */
  overflowGp: number;
  nextEventSeq: number;
  diary: DivineEvent[];
}
export type DivinePayload =
  | { type: 'miracle'; kind: 'blessing' | 'smite'; queued: boolean; amount: number; strengthBp: number }
  | { type: 'voice'; keyword: VoiceIntent | null; obeyed: boolean }
  | { type: 'upgrade'; upgrade: FaithUpgrade; level: number; cost: number }
  | { type: 'charge_used'; amount: number }
  | { type: 'item_blessed'; itemId: string };
export type DivineEvent = DivinePayload & { seq: number; atRealMs: number; atGameMs: number };
export type SessionAction =
  | { type: 'blessing' | 'smite' }
  | { type: 'voice'; keyword: string }
  | { type: 'upgrade'; upgrade: FaithUpgrade }
  | { type: 'use_charge' }
  | { type: 'bless_item'; itemId: string };
export type SessionRejection = 'dead' | 'insufficient_gp' | 'insufficient_faith' | 'upgrade_cap' | 'no_charge' | 'insufficient_room' | 'in_combat' | 'unknown_item' | 'already_blessed' | 'fight_over' | 'target_doomed';
export type SessionActionResult = { ok: true; state: SessionState; events: DivineEvent[] } | { ok: false; state: SessionState; events: []; reason: SessionRejection };
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function emit(s: SessionState, payload: DivinePayload): DivineEvent {
  if (!Number.isSafeInteger(s.nextEventSeq + 1)) throw new RangeError('divine event limit');
  const event = { ...payload, seq: s.nextEventSeq++, atRealMs: s.realElapsedMs, atGameMs: s.world.elapsedMs };
  s.diary.push(event); if (s.diary.length > DIVINE_TUNING.logLimit) s.diary.shift();
  return event;
}
export function createSession(content: GameData, seed: number, worldTuning: Partial<WorldTuning> = {}): SessionState {
  return { schemaVersion: 1, world: createWorld(content, seed, worldTuning), clock: createWorldClock(), realElapsedMs: 0,
    upgrades: { capacity: 0, flow: 0, miracle: 0, clarity: 0 }, charges: 0, overflowGp: 0, nextEventSeq: 0, diary: [] };
}
export function faithUpgradeCost(s: SessionState, upgrade: FaithUpgrade): number | null {
  if (!Object.hasOwn(s.upgrades, upgrade)) throw new RangeError('unknown upgrade');
  const level = s.upgrades[upgrade];
  if (level >= (upgrade === 'clarity' ? DIVINE_TUNING.maxClarityLevel : DIVINE_TUNING.maxLevel)) return null;
  return DIVINE_TUNING.upgradeBaseCost + level * DIVINE_TUNING.upgradeCostStep;
}
/** Carry is weighted regeneration milliseconds at current Flow. Flow purchases retain earned credit. */
function regenerate(s: SessionState, realMs: number): void {
  const g = s.world.god;
  const total = g.regenCarryMs + realMs * (1 + s.upgrades.flow * DIVINE_TUNING.flowRatePerLevel);
  if (!Number.isSafeInteger(total)) throw new RangeError('regeneration budget overflow');
  let gain = Math.floor(total / GP_REGEN_INTERVAL_MS);
  g.regenCarryMs = total % GP_REGEN_INTERVAL_MS;
  const refill = Math.min(gain, g.gpMax - g.gp); g.gp += refill; gain -= refill;
  if (s.charges < DIVINE_TUNING.maxCharges) {
    const overflow = s.overflowGp + gain;
    const charges = Math.min(DIVINE_TUNING.maxCharges - s.charges, Math.floor(overflow / DIVINE_TUNING.chargeGp));
    s.charges += charges; s.overflowGp = overflow - charges * DIVINE_TUNING.chargeGp;
  }
  if (s.charges === DIVINE_TUNING.maxCharges) {
    s.overflowGp = 0;
    if (g.gp === g.gpMax) g.regenCarryMs = 0;
  }
}
/** No elapsed cap. Hosts can yield between bounded calls; every carry survives each call. */
export function advanceSession(state: SessionState, content: GameData, realMs: number, visibility: GameSpeed): { state: SessionState; events: WorldEvent[] } {
  if ((visibility !== 'watched' && visibility !== 'unwatched') || !Number.isSafeInteger(realMs) || realMs < 0 || !Number.isSafeInteger(state.realElapsedMs + realMs) || !Number.isSafeInteger(realMs * 10 + state.clock.carry)) throw new RangeError('invalid real time budget');
  const s = clone(state);
  const scaled = scaleRealToGame(s.clock, realMs, visibility);
  regenerate(s, realMs); s.realElapsedMs += realMs; s.clock = scaled.clock;
  const advanced = advanceWorld(s.world, content, scaled.gameMs); s.world = advanced.state;
  return { state: s, events: advanced.events };
}
function miracleStrength(s: SessionState, kind: 'blessing' | 'smite'): number {
  const effects = inventoryMiracleEffects(s.world.hero.inventory);
  const strength = (10000 + s.upgrades.miracle * DIVINE_TUNING.miracleBpPerLevel) * effects.miracleMultiplier * (kind === 'blessing' ? effects.blessingHealMultiplier : 1);
  return Math.max(1, Math.min(1000000, Math.floor(strength)));
}
export function actionSession(state: SessionState, _content: GameData, action: SessionAction): SessionActionResult {
  const reject = (reason: SessionRejection): SessionActionResult => ({ ok: false, state, events: [], reason });
  const s = clone(state); const w = s.world; const h = w.hero; const g = w.god;
  const done = (payload: DivinePayload): SessionActionResult => ({ ok: true, state: s, events: [emit(s, payload)] });
  switch (action.type) {
    case 'upgrade': {
      const cost = faithUpgradeCost(s, action.upgrade);
      if (cost === null) return reject('upgrade_cap');
      if (w.faith < cost) return reject('insufficient_faith');
      w.faith -= cost; s.upgrades[action.upgrade]++;
      if (action.upgrade === 'capacity') g.gpMax = DIVINE_TUNING.baseCapacity + s.upgrades.capacity * DIVINE_TUNING.capacityPerLevel;
      return done({ type: 'upgrade', upgrade: action.upgrade, cost, level: s.upgrades[action.upgrade] });
    }
    case 'use_charge':
      if (s.charges === 0) return reject('no_charge');
      // Refuse partial redemption: never destroy paid credit or create GP by retrying.
      if (g.gpMax - g.gp < DIVINE_TUNING.chargeGp) return reject('insufficient_room');
      s.charges--; g.gp += DIVINE_TUNING.chargeGp;
      return done({ type: 'charge_used', amount: DIVINE_TUNING.chargeGp });
    case 'bless_item': {
      if (w.phase === 'dead' || h.hp <= 0) return reject('dead');
      if (w.combat) return reject('in_combat');
      const result = blessItem(h.inventory, g, action.itemId);
      if (!result.ok) return reject(result.reason);
      w.god = result.god; h.inventory = equipBest(result.inventory, h).inventory;
      h.stats = inventoryCombatStats(h.base, h.inventory); h.hp = Math.min(h.hp, h.stats.maxHp);
      return done({ type: 'item_blessed', itemId: action.itemId });
    }
    case 'voice': {
      if (w.phase === 'dead' || h.hp <= 0) return reject('dead');
      const keyword = (['fight', 'flee', 'rest', 'town', 'dig'] as const).find((k) => k === action.keyword) ?? null;
      // Unknown text is ignored without cost, RNG consumption, or storing raw input.
      if (keyword === null) return done({ type: 'voice', keyword: null, obeyed: false });
      if (g.gp < DIVINE_TUNING.voiceCost) return reject('insufficient_gp');
      g.gp -= DIVINE_TUNING.voiceCost;
      const obeyed = rollBp(w.rng, Math.min(10000, DIVINE_TUNING.baseObeyBp + s.upgrades.clarity * DIVINE_TUNING.clarityBpPerLevel));
      if (obeyed) w.voiceIntent = keyword;
      return done({ type: 'voice', keyword, obeyed });
    }
    case 'blessing': case 'smite': {
      if (w.phase === 'dead' || h.hp <= 0) return reject('dead');
      const strengthBp = miracleStrength(s, action.type);
      if (w.combat) {
        const result = requestIntervention(w.combat.fight, g, action.type, strengthBp);
        if (!result.ok) return reject(result.reason);
        w.combat.fight = result.fight; w.god = result.god;
        return done({ type: 'miracle', kind: action.type, queued: true, amount: 0, strengthBp });
      }
      if (g.gp < 25) return reject('insufficient_gp');
      g.gp -= 25;
      let amount: number;
      if (action.type === 'blessing') {
        amount = Math.min(h.stats.maxHp - h.hp, Math.floor(blessingHeal(h.stats.maxHp) * strengthBp / 10000)); h.hp += amount;
        h.alignment = Math.min(DIVINE_TUNING.alignmentCap, h.alignment + 1);
      } else {
        amount = Math.min(h.hp, Math.max(1, Math.floor(h.stats.maxHp * DIVINE_TUNING.smiteHeroPercent * strengthBp / 1000000))); h.hp -= amount;
        if (h.quest) h.quest.progress = Math.min(100, h.quest.progress + DIVINE_TUNING.smiteQuestProgress);
        h.alignment = Math.max(-DIVINE_TUNING.alignmentCap, h.alignment - 1);
        if (h.hp === 0) enterWorldDeathInPlace(w, []);
      }
      return done({ type: 'miracle', kind: action.type, queued: false, amount, strengthBp });
    }
    default: throw new RangeError('unknown session action');
  }
}
/** Trusted snapshot boundary only. NOT a validator for player-edited/imported JSON. */
export function saveSession(state: SessionState): SessionState { return clone(state); }
/** Exact trusted resume; unknown versions fail closed. Untrusted import is deliberately deferred. */
export function restoreSession(snapshot: SessionState): SessionState {
  if (snapshot.schemaVersion !== 1 || snapshot.world.schemaVersion !== 1) throw new RangeError('unsupported session schema');
  return clone(snapshot);
}
