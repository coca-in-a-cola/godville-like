import { wrap, releaseProxy } from 'comlink';
import { createGameRuntime } from './gameRuntime.ts';
import { leaseOwnership, webLockOwnership } from './ownership.ts';
import { gameData } from './gameData.ts';
import type { ForecastWorkerApi } from './forecast.worker.ts';

/** Owns exactly one browser mount. Runtime imports stay platform-neutral. */
export function createBrowserGame() {
  const worker = new Worker(new URL('./forecast.worker.ts', import.meta.url), { type: 'module' });
  const api = wrap<ForecastWorkerApi>(worker);
  const channel = new MessageChannel();
  const waiting: (() => void)[] = [];
  channel.port1.onmessage = () => waiting.shift()?.();
  const yieldTask = () => new Promise<void>(resolve => { waiting.push(resolve); channel.port2.postMessage(0); });
  // Access failures are forwarded through the runtime's fail-closed storage boundary.
  const storage = { getItem: (key: string) => localStorage.getItem(key), setItem: (key: string, value: string) => localStorage.setItem(key, value), removeItem: (key: string) => localStorage.removeItem(key) };
  const ownership = navigator.locks ? webLockOwnership(navigator.locks) : leaseOwnership(storage, crypto.randomUUID(), Date.now, () => new Promise(resolve => setTimeout(resolve, 30)));
  const runtime = createGameRuntime({ content: gameData, seed: () => crypto.getRandomValues(new Uint32Array(1))[0]!, storage, ownership, now: Date.now, monotonicNow: () => performance.now(), yieldTask, visible: document.visibilityState === 'visible', catchupChunkMs: 10000,
    forecast: { forecast: (state, seed) => api.forecast(state, seed), dispose: () => { api[releaseProxy](); worker.terminate(); } } });
  let disposed = false;
  const frame = setInterval(() => { void runtime.tick(); }, 100);
  const forecast = setInterval(() => { void runtime.requestForecast(); }, 1000);
  const visible = () => { void runtime.setVisible(document.visibilityState === 'visible'); };
  const hide = (event: PageTransitionEvent) => { runtime.pageHide(); if (!event.persisted) dispose(); };
  const show = () => { visible(); void runtime.tick(); };
  document.addEventListener('visibilitychange', visible);
  window.addEventListener('pagehide', hide);
  window.addEventListener('pageshow', show);
  function dispose() {
    if (disposed) return;
    disposed = true;
    clearInterval(frame); clearInterval(forecast);
    document.removeEventListener('visibilitychange', visible);
    window.removeEventListener('pagehide', hide); window.removeEventListener('pageshow', show);
    runtime.stop();
    // Resolve pending yields so a stopped pump can unwind before closing ports.
    waiting.splice(0).forEach(resolve => resolve());
    channel.port1.close(); channel.port2.close();
  }
  void runtime.start();
  return { runtime, dispose };
}
