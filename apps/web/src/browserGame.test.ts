/// <reference lib="dom" />
import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => {
  const runtime = { tick: vi.fn(async () => {}), requestForecast: vi.fn(async () => {}), setVisible: vi.fn(async (_visible: boolean) => {}), pageHide: vi.fn(), stop: vi.fn(), start: vi.fn(async () => {}) };
  return { runtime, create: vi.fn(() => runtime), release: vi.fn(), terminate: vi.fn(), forecast: vi.fn() };
});
vi.mock('./gameRuntime.ts', () => ({ createGameRuntime: mocks.create }));
vi.mock('./gameData.ts', () => ({ gameData: {} }));
vi.mock('comlink', () => ({ wrap: () => ({ forecast: mocks.forecast, [Symbol.for('release')]: mocks.release }), releaseProxy: Symbol.for('release') }));
import { createBrowserGame } from './browserGame.ts';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); vi.clearAllMocks(); });
describe('browser lifecycle host wiring (structural browser seams)', () => {
  it('starts autonomously, forwards lifecycle, restores bfcache and removes listeners/timers on disposal', async () => {
    vi.useFakeTimers();
    const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
    const win = new EventTarget();
    vi.stubGlobal('document', doc); vi.stubGlobal('window', win);
    vi.stubGlobal('navigator', { locks: { request: vi.fn() } });
    vi.stubGlobal('Worker', class { terminate = mocks.terminate; });
    const removeDoc = vi.spyOn(doc, 'removeEventListener');
    const removeWin = vi.spyOn(win, 'removeEventListener');
    const game = createBrowserGame();
    expect(mocks.runtime.start).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(mocks.runtime.tick).toHaveBeenCalledTimes(10);
    expect(mocks.runtime.requestForecast).toHaveBeenCalledTimes(1);
    doc.visibilityState = 'hidden'; doc.dispatchEvent(new Event('visibilitychange'));
    expect(mocks.runtime.setVisible).toHaveBeenLastCalledWith(false);
    win.dispatchEvent(Object.assign(new Event('pagehide'), { persisted: true }));
    expect(mocks.runtime.pageHide).toHaveBeenCalledTimes(1);
    expect(mocks.runtime.stop).not.toHaveBeenCalled();
    doc.visibilityState = 'visible'; win.dispatchEvent(new Event('pageshow'));
    expect(mocks.runtime.setVisible).toHaveBeenLastCalledWith(true);
    game.dispose(); game.dispose();
    expect(mocks.runtime.stop).toHaveBeenCalledTimes(1);
    expect(removeDoc).toHaveBeenCalledTimes(1); expect(removeWin).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
});
