/** Headless host adapter. Importing this module reads no DOM, storage, clocks or workers. */
import { signal } from '@preact/signals';
import { actionSession, advanceSession, createSession, deriveForecastSeed, type FightState, type ForecastResult, type GameData, type GameSpeed, type SessionAction, type SessionActionResult, type SessionState, type WorldCombatEvent, type WorldEvent } from '@godville/sim';
import { createPersistence, type StoragePort } from './persistence.ts';
import type { OwnershipPort } from './ownership.ts';
export interface ForecastPort { forecast(state: FightState, seed: number): Promise<ForecastResult>; dispose(): void }
export interface RuntimeOptions {
  content: GameData; seed: number | (() => number); storage: StoragePort; ownership: OwnershipPort;
  now: () => number; monotonicNow: () => number; yieldTask: () => Promise<void>;
  forecast?: ForecastPort; visible?: boolean;
  /** Browser replay batching only; default preserves the narrow headless contract. */
  catchupChunkMs?: number;
}
export function createGameRuntime(options: RuntimeOptions) {
  const canonicalSession = signal<SessionState | null>(null);
  const loading = signal(true);
  const catchingUp = signal(false);
  const status = signal<'loading' | 'ready' | 'readonly' | 'error' | 'stopped'>('loading');
  const progress = signal({ completedMs: 0, totalMs: 0 });
  const errors = signal<readonly string[]>([]);
  const forecast = signal<{ fightId: string; tick: number; result: ForecastResult } | null>(null);
  const combatLog = signal<readonly WorldCombatEvent[]>([]);
  const combatSummary = signal<WorldEvent | null>(null);
  const persistence = createPersistence(options.storage);
  let visible = options.visible ?? true;
  let stopped = false;
  let started = false;
  let observedAt = 0;
  let accountedAt = 0;
  let generation = 0;
  let forecasting = false;
  let lastForecastAt = -Infinity;
  let lastForecastInput: FightState | null = null;
  let pumping: Promise<void> | null = null;
  const segments: { end: number; speed: GameSpeed; collect: boolean }[] = [];
  const maxChunkMs = Math.max(1000, Math.min(10000, Math.floor(options.catchupChunkMs ?? 1000)));
  let chunkMs = Math.min(5000, maxChunkMs);
  function report(error: unknown) { errors.value = [...errors.value, String(error)].slice(-10); }
  function fail(error: unknown) { report(error); status.value = 'error'; generation++; forecast.value = null; }
  function owned(): boolean {
    if (stopped || status.value === 'error' || status.value === 'readonly') return false;
    if (!options.ownership.owns()) { status.value = 'readonly'; generation++; forecast.value = null; return false; }
    return true;
  }
  function clock(): number {
    const value = options.now();
    if (!Number.isSafeInteger(value) || value < 0) throw new RangeError('Invalid wall clock');
    return value;
  }
  function capture(speed: GameSpeed, collect: boolean) {
    const time = clock();
    if (time < observedAt) {
      if (errors.value.at(-1) !== 'Wall clock moved backwards; waiting for previous timestamp') report('Wall clock moved backwards; waiting for previous timestamp');
      return;
    }
    if (time === observedAt) return;
    const tail = segments.at(-1);
    if (tail && tail.speed === speed && tail.collect === collect) tail.end = time;
    else segments.push({ end: time, speed, collect });
    progress.value = { completedMs: progress.value.completedMs, totalMs: progress.value.totalMs + time - observedAt };
    observedAt = time;
  }
  function advanceOne(limit = chunkMs): boolean {
    if (!segments.length || !canonicalSession.value || !owned()) return false;
    const segment = segments[0]!;
    const amount = Math.min(limit, segment.end - accountedAt);
    const previousId = canonicalSession.value.world.combat?.monster.id;
    const began = options.monotonicNow();
    const advanced = advanceSession(canonicalSession.value, options.content, amount, segment.speed, { collectCombatEvents: segment.collect });
    const duration = options.monotonicNow() - began;
    if (maxChunkMs > 1000) chunkMs = Math.max(1000, Math.min(maxChunkMs, duration > 8 ? Math.floor(chunkMs / 2) : chunkMs + 1000));
    canonicalSession.value = advanced.state; accountedAt += amount;
    const nextId = advanced.state.world.combat?.monster.id;
    if (previousId !== nextId) { generation++; forecast.value = null; combatLog.value = []; }
    // Only the current fight (or most recently finished fight) is displayed.
    const newestId = nextId ?? advanced.combatEvents?.at(-1)?.fightId;
    const events = advanced.combatEvents?.filter(e => e.fightId === newestId) ?? [];
    if (events.length) combatLog.value = [...combatLog.value.filter(e => e.fightId === newestId), ...events].slice(-400);
    for (const event of advanced.events) if (event.type === 'combat_end') combatSummary.value = event;
    if (accountedAt === segment.end) segments.shift();
    progress.value = { ...progress.value, completedMs: progress.value.completedMs + amount };
    return true;
  }
  function flush(): boolean {
    if (!canonicalSession.value || !owned()) return false;
    try { return persistence.save(canonicalSession.value, accountedAt, segments.map(({ end, speed }) => ({ end, speed }))); } catch (error) { fail(error); return false; }
  }
  function pump(): Promise<void> {
    if (pumping) return pumping;
    pumping = (async () => {
      // Establish the mutex before an empty or single-slice pump can finish.
      await Promise.resolve();
      try {
        catchingUp.value = segments.length > 0 && observedAt - accountedAt > chunkMs;
        // Yield before any offline work; each continuation also rechecks ownership/teardown.
        if (catchingUp.value) await options.yieldTask();
        while (advanceOne()) {
          if (segments.length) await options.yieldTask();
        }
        flush();
      } catch (error) { fail(error); }
      finally { catchingUp.value = false; pumping = null; }
    })();
    // Even an empty pump must settle asynchronously before resetting the mutex.
    return pumping;
  }
  async function start() {
    if (started) throw new Error('Runtime already started');
    started = true;
    try {
      const acquired = await options.ownership.acquire();
      if (stopped) { options.ownership.release(); return; }
      const loaded = persistence.load();
      if (loaded.kind === 'error') { fail(loaded.error); return; }
      observedAt = accountedAt = loaded.kind === 'saved' ? loaded.envelope.savedAtMs : clock();
      canonicalSession.value = loaded.kind === 'saved' ? loaded.envelope.session : createSession(options.content, typeof options.seed === 'function' ? options.seed() : options.seed);
      if (loaded.kind === 'saved' && loaded.envelope.pending?.length) {
        segments.push(...loaded.envelope.pending.map(segment => ({ ...segment, collect: false })));
        observedAt = segments.at(-1)!.end;
        progress.value = { completedMs: 0, totalMs: observedAt - accountedAt };
      }
      if (!acquired) { status.value = 'readonly'; return; }
      status.value = 'ready';
      capture('unwatched', false);
      await pump();
    } catch (error) { fail(error); }
    finally { loading.value = false; }
  }
  async function tick() {
    if (loading.value || !owned()) return;
    try { capture(visible ? 'watched' : 'unwatched', visible); await pump(); } catch (error) { fail(error); }
  }
  async function setVisible(value: boolean) {
    if (value === visible) return;
    if (!loading.value && owned()) capture(visible ? 'watched' : 'unwatched', visible);
    visible = value; generation++; forecast.value = null;
    if (!loading.value) await pump();
  }
  async function userAction(action: SessionAction): Promise<SessionActionResult | null> {
    if (loading.value || !owned()) return null;
    await tick();
    if (!canonicalSession.value || !owned()) return null;
    const result = actionSession(canonicalSession.value, options.content, action);
    if (result.ok) { generation++; forecast.value = null; canonicalSession.value = result.state; flush(); }
    return result;
  }
  async function requestForecast() {
    const state = canonicalSession.value;
    const active = state?.world.combat;
    if (!options.forecast || loading.value || catchingUp.value || !owned() || !visible || forecasting || !active || active.fight.outcome || active.fight === lastForecastInput) return;
    const time = options.monotonicNow();
    if (time - lastForecastAt < 1000) return;
    lastForecastAt = time; lastForecastInput = active.fight; forecasting = true;
    const requestedGeneration = generation;
    try {
      const result = await options.forecast.forecast(active.fight, deriveForecastSeed(active.fight.seed, active.fight.tick));
      if (!stopped && visible && owned() && generation === requestedGeneration && canonicalSession.value?.world.combat?.monster.id === active.monster.id) forecast.value = { fightId: active.monster.id, tick: active.fight.tick, result };
    } catch (error) { if (!stopped) report(error); }
    finally { forecasting = false; }
  }
  /** Synchronous lifecycle flush: one bounded slice only; timestamp never claims unsimulated time. */
  function pageHide() {
    if (loading.value || !owned()) return;
    try {
      capture(visible ? 'watched' : 'unwatched', visible); visible = false; generation++; forecast.value = null;
      advanceOne(1000); flush();
    } catch (error) { fail(error); }
  }
  function stop() {
    if (stopped) return;
    pageHide(); stopped = true; generation++; forecast.value = null; status.value = 'stopped';
    options.forecast?.dispose(); options.ownership.release();
  }
  return { canonicalSession, loading, catchingUp, status, progress, errors, forecast, combatLog, combatSummary, start, tick, setVisible, userAction, requestForecast, flush, pageHide, stop };
}
export type GameRuntime = ReturnType<typeof createGameRuntime>;
