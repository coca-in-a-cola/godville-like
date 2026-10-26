# Runtime recovery result

## Delivered

Headless runtime and persistence/ownership adapters, with executed acceptance tests. No dashboard, browser lifecycle mount, deployment, push, or board-state changes.

- Fixed the demonstrated pump mutex defect: an unconditional asynchronous boundary establishes `pumping` before an empty or single-slice pump can finish. The regression starts with an empty pump and verifies that subsequent ticks advance exact canonical state.
- Fixed lifecycle accounting loss: synchronous `pageHide()` processes at most one 1,000 ms slice, then saves all remaining visibility-segment endpoints and speeds. Reload replays those segments at their original speed before new offline time; historical combat events are not replayed. Both fractional carries survive. A watched backlog is not silently reclassified as offline.
- Added explicit nested Zod validation and fail-closed storage. Corrupt JSON, malformed shapes, and unsafe tuning preserve the original save and attempt a separate `.corrupt` backup. Conflicting writes, unavailable storage, and failed writes block further writes. Identical saves are no-ops.
- Added bounded opt-in world/session combat observation. Default calls return no combat event collection; enabled calls retain the newest 400 without changing canonical state, world events, or RNG. Runtime display retains only the current/latest fight and at most 400 events.

## Integration contract

`createGameRuntime(options)` in `apps/web/src/gameRuntime.ts` imports no browser lifecycle globals. Inject:

- `content`, `seed`, `storage: StoragePort`, `ownership: OwnershipPort`;
- `now()` (nonnegative safe integer wall-clock milliseconds), `monotonicNow()`, `yieldTask()`;
- optional `visible` (default true) and `forecast: ForecastPort`.

Signals: `canonicalSession`, `loading`, `catchingUp`, `status`, `progress`, `errors`, `forecast`, `combatLog`, `combatSummary`.

Methods: `start()`, `tick()`, `setVisible(boolean)`, `userAction(action)`, `requestForecast()`, `flush()`, `pageHide()`, `stop()`. Start only once. The browser host must schedule ticks, forward visibility/page lifecycle events, and stop on teardown. Canonical session is the sole resource/time authority. Successful paid actions invalidate pending forecasts and persist immediately. Forecast work is single-flight, throttled to one request per second, and discarded after action, visibility/ownership changes, fight replacement, or teardown.

`createPersistence(storage)` uses `SAVE_KEY = 'godville.session.v1'`; `save(session, accountedAtMs, pending?)` validates before serializing. The version-1 envelope contains `version`, `savedAtMs`, `session`, and optional ordered `pending: { end, speed }[]`. Existing version-1 saves without pending segments remain valid. `savedAtMs` never claims unsimulated time.

`OwnershipPort`: `acquire(): Promise<boolean>`, `owns(): boolean`, `release(): void`. `webLockOwnership()` accepts a structural `WebLocksPort` compatible with browser Web Locks. `leaseOwnership()` provides a 5-second best-effort storage fallback with settlement, expiry/replacement checks, and no blind renewals. Secondary runtimes are read-only, with no simulation, paid actions, or canonical saves. Ownership is rechecked before simulation slices and writes.

## Verified

18 new tests: 17 runtime/persistence/ownership acceptance cases in `apps/web/src/gameRuntime.test.ts`, plus one simulation observation test in `packages/sim/test/world-events.test.ts`. Tests use validated real CSV fixtures, injected clocks, memory storage counters, controlled ownership and forecast seams.

Coverage includes:

- Empty-start pump regression and repeated later ticks.
- Runtime tick → paid action → save → fresh runtime restore → exact offline advancement, including real-time GP regeneration at 0.1x world speed.
- Arbitrary fractional visibility splits and pagehide reload with multiple unprocessed watched slices.
- A real headless simulation of all 36,000,000 offline milliseconds: exact progress, more than 35,000 yielding continuations, no elapsed cap, and full-state equality against the domain reference. No real-time waiting.
- Read-only secondaries, ownership loss during catchup, exclusive Web Lock hold/release, lease expiry/replacement, and competing acquisitions.
- Stale forecast rejection after a paid action and stop.
- Corrupt JSON/shape/tuning preservation, idempotent saves, conflicting writers, quota failure.
- Live combat observation, bounded logs, exact canonical state and RNG preservation, and absent-by-default event collection.

Root gates executed successfully:

- `pnpm test`: **217 tests passed across 19 files**.
- `pnpm typecheck`: all workspace projects and test TypeScript passed.
- `pnpm build`: CSV validation and production Vite build passed.
- `git diff --check`: passed.

## Boundaries and remaining work

- This is tested headless integration, not a mounted browser feature. Actual browser lifecycle wiring, real multi-tab/browser QA, and connecting a concrete forecast worker remain with the UI host. No new Comlink shell was added.
- Storage leases are best-effort, not an atomic cross-tab transaction; use Web Locks where available. Lease safety assumes a unique owner identifier per runtime. Save compare/readback adds fail-closed conflict detection but does not turn localStorage into transactional storage.
- Offline replay deliberately omits historical combat logs; canonical state and elapsed time are preserved. World/session diaries remain bounded by domain policy.
- No import/reset API exists; reset-race behavior is therefore not claimed. Existing sandbox race/log changes are outside this recovery-only scope.
- Build emits nonfatal Rollup annotation-position warnings from Zod 4.6.7; build completes. Zod was already present in the lockfile through the data workspace; the web workspace now declares its direct dependency.
