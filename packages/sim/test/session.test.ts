import { describe, expect, it } from 'vitest';
import { lootData } from './loot-fixtures.ts';
import { actionSession, advanceSession, buildItem, createSession, DIVINE_TUNING, faithUpgradeCost, GP_REGEN_INTERVAL_MS, inventoryCombatStats, restoreSession, saveSession, seedRng, type SessionAction, type SessionState } from '../src/index.ts';
const c = lootData;
const peaceful = { encounterBp: 0, goldFindBp: 0, itemFindBp: 0, brickFindBp: 0 };
function act(s: SessionState, a: SessionAction): SessionState {
  const r = actionSession(s, c, a); if (!r.ok) throw new Error(r.reason); return r.state;
}
function reject(s: SessionState, a: SessionAction, reason: string): void {
  const before = saveSession(s); const r = actionSession(s, c, a);
  expect(r.ok).toBe(false); if (!r.ok) expect(r.reason).toBe(reason);
  expect(r.state).toBe(s); expect(s).toEqual(before); expect(r.events).toEqual([]);
}
function travel(): SessionState { return advanceSession(createSession(c, 123, peaceful), c, 2000, 'watched').state; }
function combat(): SessionState {
  let s = createSession(c, 123, { encounterBp: 10000, goldFindBp: 0, itemFindBp: 0, brickFindBp: 0 });
  s.world.hero.courage = 0;
  s = advanceSession(s, c, 7000, 'watched').state;
  expect(s.world.phase).toBe('combat'); return s;
}
function clearGp(s: SessionState): SessionState { s.world.god.gp = 0; return s; }
function clarity(s: SessionState): SessionState {
  s.world.faith = 10000;
  for (let i = 0; i < 7; i++) s = act(s, { type: 'upgrade', upgrade: 'clarity' });
  return s;
}

describe('real-time session orchestration', () => {
  it('uses one canonical GP state with equal regeneration at 1x and 0.1x world speed', () => {
    const start = clearGp(createSession(c, 123));
    const watched = advanceSession(start, c, 360000, 'watched').state;
    const hidden = advanceSession(start, c, 360000, 'unwatched').state;
    expect(watched.world.god).toEqual(hidden.world.god); expect(watched.world.god.gp).toBe(1);
    expect(watched.world.elapsedMs).toBe(360000); expect(hidden.world.elapsedMs).toBe(36000);
    expect(start.world.god.gp).toBe(0);
  });
  it('executes a real ten-hour offline interval and watched interval using validated catalogs', () => {
    const start = clearGp(createSession(c, 123));
    const realMs = 10 * 60 * 60 * 1000;
    const hidden = advanceSession(start, c, realMs, 'unwatched').state;
    const watched = advanceSession(start, c, realMs, 'watched').state;
    expect(hidden.world.elapsedMs).toBe(3600000); expect(watched.world.elapsedMs).toBe(36000000);
    expect(hidden.world.god.gp).toBe(100); expect(watched.world.god).toEqual(hidden.world.god);
    expect(hidden.world.totals.kills).toBeGreaterThan(0); expect(watched.world.totals.quests).toBeGreaterThan(100);
    expect(hidden.world.diary.length).toBeLessThanOrEqual(60); expect(watched.world.diary.length).toBeLessThanOrEqual(60);
    console.info('overnight session', JSON.stringify({ realMs, hidden: { level: hidden.world.hero.level, totals: hidden.world.totals }, watched: { level: watched.world.hero.level, totals: watched.world.totals } }));
  });
  it.each(['watched', 'unwatched'] as const)('preserves arbitrary split, weighted regen and JSON carries at %s speed', (speed) => {
    let s = clearGp(createSession(c, 77)); s.world.faith = 100;
    s = act(s, { type: 'upgrade', upgrade: 'flow' });
    const budgets = [1, 99, 300001, 7, 599993, 117, 2900003, 360001];
    const one = advanceSession(s, c, budgets.reduce((a, b) => a + b, 0), speed).state;
    let split = s;
    for (const ms of budgets) split = restoreSession(JSON.parse(JSON.stringify(saveSession(advanceSession(split, c, ms, speed).state))) as SessionState);
    expect(split).toEqual(one);
  });
  it('retains fractional hidden time across visibility switches and zero advances', () => {
    let s = createSession(c, 1, peaceful);
    s = advanceSession(s, c, 9, 'unwatched').state; expect(s.clock.carry).toBe(9);
    s = advanceSession(s, c, 100, 'watched').state;
    expect(s.world.elapsedMs).toBe(100); expect(s.clock.carry).toBe(9);
    s = advanceSession(s, c, 1, 'unwatched').state; expect(s.world.pendingMs).toBe(1);
    expect(advanceSession(s, c, 0, 'unwatched').state).toEqual(s);
  });
  it('rejects unsafe/negative time and unsupported schema; snapshots are independent', () => {
    const s = createSession(c, 1);
    for (const ms of [-1, 0.1, Infinity, Number.MAX_SAFE_INTEGER]) expect(() => advanceSession(s, c, ms, 'watched')).toThrow(RangeError);
    const snapshot = saveSession(s); snapshot.world.hero.hp = 1; expect(s.world.hero.hp).not.toBe(1);
    snapshot.schemaVersion = 2 as 1; expect(() => restoreSession(snapshot)).toThrow(RangeError);
  });
});

describe('accumulator and Faith', () => {
  it('banks only complete hundred-GP charges, caps at three, discards saturated credit invariantly', () => {
    const s = createSession(c, 1);
    let next = advanceSession(s, c, GP_REGEN_INTERVAL_MS * 99 + 17, 'unwatched').state;
    expect(next.charges).toBe(0); expect(next.overflowGp).toBe(99); expect(next.world.god.regenCarryMs).toBe(17);
    next = advanceSession(next, c, GP_REGEN_INTERVAL_MS - 17, 'unwatched').state;
    expect(next.charges).toBe(1); expect(next.overflowGp).toBe(0);
    const total = GP_REGEN_INTERVAL_MS * 400 + 137;
    const one = advanceSession(s, c, total, 'unwatched').state;
    let split = s; for (const ms of [123, GP_REGEN_INTERVAL_MS * 299, total - 123 - GP_REGEN_INTERVAL_MS * 299]) split = advanceSession(split, c, ms, 'unwatched').state;
    expect(split).toEqual(one); expect(one.charges).toBe(3); expect(one.overflowGp).toBe(0); expect(one.world.god.regenCarryMs).toBe(0);
  });
  it('never partially wastes or duplicates charge GP, including retries and empty stock', () => {
    let s = createSession(c, 1); reject(s, { type: 'use_charge' }, 'no_charge'); s.charges = 1;
    reject(s, { type: 'use_charge' }, 'insufficient_room'); s.world.god.gp = 1;
    reject(s, { type: 'use_charge' }, 'insufficient_room'); s.world.god.gp = 0;
    s = act(s, { type: 'use_charge' }); expect(s.charges).toBe(0); expect(s.world.god.gp).toBe(100);
    reject(s, { type: 'use_charge' }, 'no_charge');
  });
  it.each(['capacity', 'flow', 'miracle', 'clarity'] as const)('uses rising costs and explicit %s cap', (upgrade) => {
    let s = createSession(c, 1); reject(s, { type: 'upgrade', upgrade }, 'insufficient_faith'); s.world.faith = 10000;
    const max = upgrade === 'clarity' ? 7 : 10;
    for (let i = 0; i < max; i++) {
      expect(faithUpgradeCost(s, upgrade)).toBe(5 + i * 5);
      const faith = s.world.faith; s = act(s, { type: 'upgrade', upgrade }); expect(s.world.faith).toBe(faith - (5 + i * 5));
    }
    expect(faithUpgradeCost(s, upgrade)).toBeNull(); reject(s, { type: 'upgrade', upgrade }, 'upgrade_cap');
    expect(s.world.god.gpMax).toBe(upgrade === 'capacity' ? 350 : 100); expect(s.world.god.gp).toBe(100);
  });
  it('Flow improves real-time regeneration and purchases preserve already earned carry', () => {
    let s = clearGp(createSession(c, 1)); s.world.faith = 10;
    s = advanceSession(s, c, 100001, 'unwatched').state; s = act(s, { type: 'upgrade', upgrade: 'flow' });
    s = advanceSession(s, c, 129999, 'unwatched').state;
    expect(s.world.god.gp).toBe(0); expect(s.world.god.regenCarryMs).toBe(359999);
    s = advanceSession(s, c, 1, 'unwatched').state; expect(s.world.god.gp).toBe(1); expect(s.world.god.regenCarryMs).toBe(1);
  });
});

describe('integrated interventions', () => {
  it.each(['blessing', 'smite'] as const)('pays %s once and applies only on the next canonical fight tick', (type) => {
    let s = combat(); s.world.hero.hp = 500; s.world.combat!.fight.hero.hp = 500;
    const original = saveSession(s); s = act(s, { type });
    expect(s.world.god.gp).toBe(75); expect(s.world.combat!.fight.queue).toHaveLength(1);
    expect(s.world.hero.hp).toBe(500); expect(s.world.combat!.fight.monster.hp).toBe(original.world.combat!.fight.monster.hp);
    const before = advanceSession(s, c, 99, 'watched').state; expect(before.world.combat!.fight.queue).toHaveLength(1);
    const next = advanceSession(before, c, 1, 'watched').state;
    expect(next.world.combat!.fight.queue).toHaveLength(0); expect(next.world.hero.hp).toBe(next.world.combat!.fight.hero.hp);
    if (type === 'blessing') expect(next.world.hero.hp).toBe(850);
    else expect(next.world.combat!.fight.monster.hp).toBe(original.world.combat!.fight.monster.hp - Math.floor(original.world.combat!.fight.monster.stats.maxHp * 0.2));
    expect(next.world.god.gp).toBe(75);
  });
  it('honors miracle power and equipped healing/weaken-miracle effects when queuing, not later', () => {
    let s = combat(); s.world.faith = 100;
    const base = c.bases.find((b) => b.slot === 'helmet')!;
    const blessing = c.modifiers.find((m) => m.effect === 'blessing_heal')!;
    const weaken = c.modifiers.find((m) => m.effect === 'mult_all_weaken_miracles')!;
    s.world.hero.inventory.equipped.helmet = buildItem(c, { id: 'divine_helm', baseId: base.id, level: 0, baseStats: [], modifiers: [{ id: blessing.id }, { id: weaken.id }] });
    s = act(s, { type: 'upgrade', upgrade: 'miracle' });
    s.world.hero.hp = 100; s.world.combat!.fight.hero.hp = 100;
    const queued = act(s, { type: 'blessing' });
    const strength = Math.floor(11000 * 0.9 * blessing.value);
    expect(queued.world.combat!.fight.queue[0]!.strengthBp).toBe(strength);
    const next = advanceSession(queued, c, 100, 'watched').state;
    expect(next.world.hero.hp).toBe(100 + Math.floor(350 * strength / 10000));
    expect(act(s, { type: 'smite' }).world.combat!.fight.queue[0]!.strengthBp).toBe(9900);
  });
  it('rejects insufficient GP and scaled smites aimed at an already doomed target without spending', () => {
    let s = combat(); s.world.god.gp = 24;
    reject(s, { type: 'blessing' }, 'insufficient_gp'); reject(s, { type: 'smite' }, 'insufficient_gp');
    s.world.god.gp = 100; s.world.combat!.fight.monster.hp = 1;
    s = act(s, { type: 'smite' }); reject(s, { type: 'smite' }, 'target_doomed');
    const next = advanceSession(s, c, 100, 'watched').state; expect(next.world.totals.kills).toBe(1);
  });
  it('heals + good alignment outside combat and punishes with quest/evil consequences', () => {
    let s = travel(); s.world.hero.hp = 600;
    s = act(s, { type: 'blessing' }); expect(s.world.hero.hp).toBe(950); expect(s.world.hero.alignment).toBe(1);
    s = act(s, { type: 'smite' }); expect(s.world.hero.hp).toBe(810); expect(s.world.hero.quest!.progress).toBe(5); expect(s.world.hero.alignment).toBe(0);
    expect(s.world.god.gp).toBe(50);
  });
  it('lethal punishment enters canonical death timeout; dead controls cannot heal/reward/resurrect early', () => {
    let s = travel(); s.world.hero.hp = 1; s.world.hero.gold = 100;
    s = act(s, { type: 'smite' }); expect(s.world.phase).toBe('dead'); expect(s.world.totals.deaths).toBe(1);
    for (const a of [{ type: 'smite' }, { type: 'blessing' }, { type: 'voice', keyword: 'rest' }, { type: 'bless_item', itemId: 'starter_armor' }] as const) reject(s, a, 'dead');
    const before = advanceSession(s, c, 59999, 'watched').state; expect(before.world.hero.hp).toBe(0); expect(before.world.phase).toBe('dead');
    const next = advanceSession(before, c, 1, 'watched').state; expect(next.world.phase).toBe('town'); expect(next.world.hero.gold).toBe(75); expect(next.world.hero.hp).toBe(next.world.hero.stats.maxHp);
    expect(next.world.totals.deaths).toBe(1); expect(next.world.god.gp).toBe(75);
  });
  it('does not revive a zero-HP combat hero even with paid Blessing', () => {
    let s = combat(); s.world.hero.hp = 1; s.world.combat!.fight.hero.hp = 1;
    s = act(s, { type: 'blessing' }); s.world.hero.hp = 0; s.world.combat!.fight.hero.hp = 0;
    const next = advanceSession(s, c, 100, 'watched').state; expect(next.world.phase).toBe('dead'); expect(next.world.hero.hp).toBe(0);
  });
});

describe('paid Voice policy and item blessings', () => {
  it('ignores unknown text without GP/RNG cost or raw text persistence', () => {
    const s = travel(); const next = act(s, { type: 'voice', keyword: 'cheese' });
    expect(next.world).toEqual(s.world); expect(next.diary[0]).toMatchObject({ type: 'voice', keyword: null, obeyed: false });
    expect(JSON.stringify(next)).not.toContain('cheese');
  });
  it('uses seeded 30% obedience, charges known ignored commands, and rejects insufficient GP', () => {
    const obeyed = new Set<boolean>();
    for (let seed = 0; seed < 50; seed++) {
      const s = createSession(c, seed); const r = actionSession(s, c, { type: 'voice', keyword: 'fight' });
      expect(r).toEqual(actionSession(s, c, { type: 'voice', keyword: 'fight' }));
      if (r.ok) { const e = r.events[0]!; if (e.type === 'voice') obeyed.add(e.obeyed); expect(r.state.world.god.gp).toBe(95); }
    }
    expect(obeyed).toEqual(new Set([true, false])); const s = travel(); s.world.god.gp = 4; reject(s, { type: 'voice', keyword: 'rest' }, 'insufficient_gp');
  });
  it.each(['rest', 'dig', 'town'] as const)('persists %s intent without direct movement until the world decision', (keyword) => {
    let s = clarity(travel()); s.world.hero.hp = 800; s.world.hero.distance = 3;
    const before = saveSession(s); s = act(s, { type: 'voice', keyword });
    expect(s.world.phase).toBe('travel'); expect(s.world.hero.distance).toBe(3); expect(s.world.voiceIntent).toBe(keyword);
    expect(s.world.god.gp).toBe(before.world.god.gp - 5);
    s = restoreSession(JSON.parse(JSON.stringify(s)) as SessionState);
    const next = advanceSession(s, c, keyword === 'town' ? 100 : 5000, 'watched').state;
    expect(next.world.voiceIntent).toBeUndefined(); expect(next.world.hero.distance).toBe(3);
    expect(next.world.diary.some((e) => e.type === 'voice_effect' && e.intent === keyword)).toBe(true);
    if (keyword === 'rest') expect(next.world.hero.hp).toBe(870);
    if (keyword === 'dig') expect(next.world.hero.gold + next.world.bricks).toBeGreaterThan(0);
    if (keyword === 'town') { expect(next.world.phase).toBe('return'); expect(advanceSession(next, c, 15000, 'watched').state.world.phase).toBe('town'); }
  });
  it('fight overrides a cowardly flee decision on the next natural encounter', () => {
    let s = createSession(c, 123, { encounterBp: 10000, goldFindBp: 0, itemFindBp: 0, brickFindBp: 0 }); s.world.hero.courage = 1;
    s = clarity(s); s = act(s, { type: 'voice', keyword: 'fight' });
    const next = advanceSession(s, c, 7000, 'watched').state; expect(next.world.phase).toBe('combat'); expect(next.world.voiceIntent).toBeUndefined();
    expect(next.world.diary.some((e) => e.type === 'flee')).toBe(false);
  });
  it('flee attempts deterministically after paid miracles, with both success and failure reachable', () => {
    const outcomes = new Set<boolean>();
    for (let seed = 0; seed < 40; seed++) {
      let s = combat(); s.world.rng = seedRng(seed); s = clarity(s);
      s = act(s, { type: 'smite' }); s = act(s, { type: 'voice', keyword: 'flee' });
      const next = advanceSession(s, c, 100, 'watched').state;
      const e = [...next.world.diary].reverse().find((event) => event.type === 'flee');
      if (e?.type === 'flee') { outcomes.add(e.success); expect(next.world.phase).toBe(e.success ? 'travel' : 'combat'); }
      if (next.world.combat) expect(next.world.combat.fight.queue).toHaveLength(0);
      expect(next.world.god.gp).toBe(70);
    }
    expect(outcomes).toEqual(new Set([true, false]));
  });
  it('defers rest requested during battle until safe travel without bypassing combat', () => {
    let s = clarity(combat()); s = act(s, { type: 'voice', keyword: 'rest' });
    const next = advanceSession(s, c, 100, 'watched').state; expect(next.world.phase).toBe('combat'); expect(next.world.voiceIntent).toBe('rest');
  });
  it('blesses gear for 5 GP, equips through canonical preference and refreshes stats without healing', () => {
    let s = travel(); s.world.hero.hp = 500;
    const armor = s.world.hero.inventory.equipped.armor!;
    const better = buildItem(c, { ...armor, id: 'candidate', level: 1, modifiers: [] });
    s.world.hero.inventory.bag = [better]; s = act(s, { type: 'bless_item', itemId: better.id });
    expect(s.world.god.gp).toBe(95); expect(s.world.hero.inventory.equipped.armor!.id).toBe('candidate');
    expect(s.world.hero.stats).toEqual(inventoryCombatStats(s.world.hero.base, s.world.hero.inventory)); expect(s.world.hero.hp).toBe(500);
    reject(s, { type: 'bless_item', itemId: better.id }, 'already_blessed'); reject(s, { type: 'bless_item', itemId: 'unknown' }, 'unknown_item');
    const fighting = combat(); reject(fighting, { type: 'bless_item', itemId: 'starter_armor' }, 'in_combat');
  });
  it('bounds localization-friendly divine logs and never allows action mutation', () => {
    let s = travel(); const initial = saveSession(s);
    for (let i = 0; i < 75; i++) s = act(s, { type: 'voice', keyword: 'ignored' });
    expect(s.diary).toHaveLength(DIVINE_TUNING.logLimit); expect(s.nextEventSeq).toBe(75); expect(s.diary[0]!.seq).toBe(15);
    expect(initial.world).toEqual(s.world); expect(saveSession(restoreSession(saveSession(s)))).toEqual(s);
  });
});
