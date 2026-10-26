import { describe, expect, it } from 'vitest';
import { advanceSession, createSession, type ForecastResult } from '@godville/sim';
import { lootData as gameData } from '../../../packages/sim/test/loot-fixtures.ts';
import { createGameRuntime, type RuntimeOptions } from './gameRuntime.ts';
import { createPersistence, SAVE_KEY, type StoragePort } from './persistence.ts';
import { leaseOwnership, webLockOwnership, type OwnershipPort, type WebLocksPort } from './ownership.ts';

function memoryStorage() {
  const values = new Map<string, string>();
  let writes = 0;
  return { values, get writes() { return writes; }, getItem: (key: string) => values.get(key) ?? null,
    setItem(key: string, value: string) { writes++; values.set(key, value); }, removeItem(key: string) { values.delete(key); } };
}
function owner(): OwnershipPort { let held = true; return { acquire: async () => held, owns: () => held, release() { held = false; } }; }
function harness(storage: StoragePort = memoryStorage(), extra: Partial<RuntimeOptions> = {}) {
  let time = 100000;
  let yields = 0;
  const runtime = createGameRuntime({ content: gameData, seed: 42, storage, ownership: owner(), now: () => time,
    monotonicNow: () => time, yieldTask: async () => { yields++; }, ...extra });
  return { runtime, setTime(value: number) { time = value; }, get yields() { return yields; } };
}
function store(storage: StoragePort, session = createSession(gameData, 42), savedAtMs = 100000) {
  const persistence = createPersistence(storage); persistence.load(); persistence.save(session, savedAtMs);
}

describe('headless runtime acceptance', () => {
  it('releases the empty-start mutex and advances every later tick', async () => {
    const h = harness(); await h.runtime.start();
    h.setTime(100123); await h.runtime.tick();
    expect(h.runtime.canonicalSession.value?.realElapsedMs).toBe(123);
    h.setTime(100789); await h.runtime.tick();
    expect(h.runtime.canonicalSession.value).toEqual(advanceSession(createSession(gameData, 42), gameData, 789, 'watched').state);
  });
  it('roundtrips paid action, exact save, and offline 0.1 game speed with real-time GP', async () => {
    const storage = memoryStorage(); const h = harness(storage); await h.runtime.start();
    h.setTime(101237); await h.runtime.tick();
    expect((await h.runtime.userAction({ type: 'blessing' }))?.ok).toBe(true);
    const saved = h.runtime.canonicalSession.value!;
    h.runtime.stop();
    const resumed = harness(storage); resumed.setTime(461237); await resumed.runtime.start();
    expect(resumed.runtime.errors.value).toEqual([]);
    expect(resumed.runtime.canonicalSession.value).toEqual(advanceSession(saved, gameData, 360000, 'unwatched').state);
    expect(resumed.runtime.canonicalSession.value!.world.god.gp).toBe(saved.world.god.gp + 1);
  });
  it('preserves arbitrary visibility boundaries and pending watched time across pagehide reload', async () => {
    const storage = memoryStorage(); const h = harness(storage); await h.runtime.start();
    h.setTime(100137); await h.runtime.setVisible(false);
    h.setTime(100684); await h.runtime.setVisible(true);
    h.setTime(105391); h.runtime.pageHide(); h.runtime.stop();
    const resumed = harness(storage); resumed.setTime(105807); await resumed.runtime.start();
    let expected = createSession(gameData, 42);
    for (const [duration, speed] of [[137, 'watched'], [547, 'unwatched'], [4707, 'watched'], [416, 'unwatched']] as const) expected = advanceSession(expected, gameData, duration, speed).state;
    expect(resumed.runtime.errors.value).toEqual([]);
    expect(resumed.runtime.canonicalSession.value).toEqual(expected);
  });
  it('simulates all ten offline hours with yields, exact progress, and no elapsed cap', async () => {
    const storage = memoryStorage(); store(storage);
    const h = harness(storage); h.setTime(36100000); await h.runtime.start();
    expect(h.runtime.status.value).toBe('ready');
    expect(h.runtime.errors.value).toEqual([]);
    expect(h.runtime.progress.value).toEqual({ completedMs: 36000000, totalMs: 36000000 });
    expect(h.yields).toBeGreaterThan(35000);
    expect(h.runtime.canonicalSession.value).toEqual(advanceSession(createSession(gameData, 42), gameData, 36000000, 'unwatched').state);
  }, 30000);
  it('keeps a secondary runtime read-only with no actions, simulation, or saves', async () => {
    const storage = memoryStorage(); store(storage); const before = storage.writes;
    const h = harness(storage, { ownership: { acquire: async () => false, owns: () => false, release() {} } });
    await h.runtime.start(); h.setTime(200000); await h.runtime.tick();
    expect(await h.runtime.userAction({ type: 'blessing' })).toBeNull();
    h.runtime.pageHide(); expect(h.runtime.flush()).toBe(false); h.runtime.stop();
    expect(storage.writes).toBe(before);
    expect(h.runtime.canonicalSession.value?.realElapsedMs).toBe(0);
  });
  it('checks ownership again after yielding before any simulation', async () => {
    const storage = memoryStorage(); store(storage); const lock = owner(); const before = storage.writes;
    const h = harness(storage, { ownership: lock, yieldTask: async () => { lock.release(); } });
    h.setTime(200000); await h.runtime.start();
    expect(h.runtime.status.value).toBe('readonly');
    expect(h.runtime.canonicalSession.value?.realElapsedMs).toBe(0);
    expect(storage.writes).toBe(before);
  });
  it.each(['action', 'stop'] as const)('rejects an in-flight forecast after %s', async mode => {
    let session = createSession(gameData, 42);
    for (let i = 0; i < 1000 && !session.world.combat; i++) session = advanceSession(session, gameData, 1000, 'watched').state;
    expect(session.world.combat).not.toBeNull();
    const storage = memoryStorage(); store(storage, session);
    let resolve!: (value: ForecastResult) => void; let disposed = false;
    const h = harness(storage, { forecast: { forecast: () => new Promise(done => { resolve = done; }), dispose() { disposed = true; } } });
    await h.runtime.start(); const request = h.runtime.requestForecast();
    if (mode === 'action') expect((await h.runtime.userAction({ type: 'blessing' }))?.ok).toBe(true);
    else h.runtime.stop();
    resolve({} as ForecastResult); await request;
    expect(h.runtime.forecast.value).toBeNull(); expect(disposed).toBe(mode === 'stop');
  });
  it('collects current-fight events without changing canonical state and bounds the log', async () => {
    const h = harness(); await h.runtime.start(); let sawEvents = false;
    for (let i = 1; i <= 300; i++) {
      h.setTime(100000 + i * 1000); await h.runtime.tick();
      sawEvents ||= h.runtime.combatLog.value.length > 0;
      expect(h.runtime.combatLog.value.length).toBeLessThanOrEqual(400);
      expect(new Set(h.runtime.combatLog.value.map(e => e.fightId)).size).toBeLessThanOrEqual(1);
    }
    expect(sawEvents).toBe(true);
    expect(h.runtime.canonicalSession.value).toEqual(advanceSession(createSession(gameData, 42), gameData, 300000, 'watched').state);
  });
});

describe('persistence fail-closed boundary', () => {
  it.each(['json', 'shape', 'unsafe tuning'] as const)('preserves corrupt %s and refuses overwrite', async kind => {
    const storage = memoryStorage(); const session = createSession(gameData, 42);
    session.world.tuning.stepMs = 0;
    const raw = kind === 'json' ? '{broken' : kind === 'shape' ? JSON.stringify({ version: 1 }) : JSON.stringify({ version: 1, savedAtMs: 100000, session });
    storage.setItem(SAVE_KEY, raw); const h = harness(storage); await h.runtime.start();
    expect(h.runtime.status.value).toBe('error');
    h.runtime.flush(); h.runtime.stop();
    expect(storage.getItem(SAVE_KEY)).toBe(raw);
    expect(storage.getItem(`${SAVE_KEY}.corrupt`)).toBe(raw);
  });
  it('does not write identical saves and rejects conflicting writes', () => {
    const storage = memoryStorage(); const p = createPersistence(storage); p.load(); const session = createSession(gameData, 42);
    expect(p.save(session, 100000)).toBe(true); const before = storage.writes;
    expect(p.save(session, 100000)).toBe(false); expect(storage.writes).toBe(before);
    storage.setItem(SAVE_KEY, 'replacement');
    expect(() => p.save(session, 100001)).toThrow('another tab');
    expect(storage.getItem(SAVE_KEY)).toBe('replacement'); expect(p.blocked).toBe(true);
  });
  it('fails closed when storage quota prevents a write', () => {
    const storage = memoryStorage(); const p = createPersistence({ ...storage, setItem() { throw new Error('quota'); } });
    p.load(); expect(() => p.save(createSession(gameData, 42), 100000)).toThrow('quota'); expect(p.blocked).toBe(true);
  });
});

describe('lease replacement', () => {
  it('holds an exclusive Web Lock until release and keeps secondary acquisition nonblocking', async () => {
    let held = false;
    const locks: WebLocksPort = { async request(_name, options, callback) {
      expect(options).toEqual({ ifAvailable: true, mode: 'exclusive' });
      if (held) { await callback(null); return; }
      held = true;
      try { await callback({}); } finally { held = false; }
    } };
    const first = webLockOwnership(locks); const second = webLockOwnership(locks);
    expect(await first.acquire()).toBe(true); expect(first.owns()).toBe(true);
    expect(await second.acquire()).toBe(false); expect(second.owns()).toBe(false);
    first.release(); await Promise.resolve(); await Promise.resolve();
    expect(first.owns()).toBe(false);
    const replacement = webLockOwnership(locks);
    expect(await replacement.acquire()).toBe(true); replacement.release();
  });
  it('rejects a secondary owner and expires the old owner without deleting its replacement', async () => {
    const storage = memoryStorage(); let now = 100000;
    const first = leaseOwnership(storage, 'first', () => now, async () => {});
    const second = leaseOwnership(storage, 'second', () => now, async () => {});
    expect(await first.acquire()).toBe(true); expect(await second.acquire()).toBe(false);
    now += 5001; expect(await second.acquire()).toBe(true);
    expect(first.owns()).toBe(false); first.release(); expect(second.owns()).toBe(true);
    second.release(); expect(storage.getItem('godville.session.lease')).toBeNull();
  });
  it('settles racing acquisitions to exactly one owner', async () => {
    const storage = memoryStorage(); const first = leaseOwnership(storage, 'first', () => 100000, async () => {});
    const second = leaseOwnership(storage, 'second', () => 100000, async () => {});
    const results = await Promise.all([first.acquire(), second.acquire()]);
    expect(results.filter(Boolean)).toHaveLength(1); expect([first.owns(), second.owns()].filter(Boolean)).toHaveLength(1);
  });
});


