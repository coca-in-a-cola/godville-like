# Foundation QA review

## Verdict

Approve a **develop source checkpoint only**, not gameplay completion, a release, or browser acceptance. No critical correctness/security defect was found in the bounded combat-core review. No gameplay source was changed. The findings below remain open for the next implementation slice; none prevents preserving this explicitly incomplete foundation in the authorized public repository.

## Findings (exact source anchors)

1. **Required regression — paid queued actions are not protected by forecast tests.** `packages/sim/test/forecast.test.ts:42-50` checks isolation without a pending intervention; `packages/sim/src/forecast.ts:62-65` relies on `cloneFight` preserving the queue (`packages/sim/src/fight.ts:145-156`). In an isolated full-source copy, adding `trial.queue = []` immediately after the forecast clone left all 10 forecast tests green (exit 0). Add a frozen-state forecast case with five already-paid Smites against an inert monster: 200 hero wins, identical live state/RNG/queue, unchanged GP, and a live continuation matching the control. **Current implementation is correct:** an independent probe returned 200 hero wins, GP 75 after paying from 200, unchanged live input, and a live next-tick hero win. This is a demonstrated coverage gap, not a claim that the engine drops actions.

2. **Required before browser acceptance — stale forecast responses can overwrite a newer intervention state.** `apps/web/src/sandbox.ts:125-135` queues an action without invalidating the displayed/in-flight forecast; `:189-195` accepts a response using only the reset generation, which changes only at `:115-116`. A response started before a paid Smite can therefore be displayed after the Smite, even at the same tick. Preserve the useful tick-labelled historical forecast policy if intended, but use an action/input revision to invalidate obsolete responses and mark the display pending on intervention. Add a deferred-worker regression covering intervening while a forecast is outstanding. This is a source-proven asynchronous ordering defect; it was not reproduced in a real browser.

3. **Consider — the visible log limit does not bound retained history or rendering work.** `apps/web/src/sandbox.ts:173` copies the entire event history on each event batch; `apps/web/src/app.tsx:248-253` limits displayed lines to 400 but summarizes the full history on every render. Editable zero-damage or outhealed fights can run indefinitely, unlike the bounded forecast runner. Keep bounded event storage and incremental summary totals, or explicitly limit sandbox sessions. This is nonblocking for short foundation fights, but should be addressed before a long-lived autonomous loop.

4. **Optional API consistency — terminal forecasts bypass max-tick validation.** `packages/sim/src/forecast.ts:53-65` validates seed/trials, but only `runFight` validates `maxTicks` (`packages/sim/src/runner.ts:25-29`); terminal states skip it. A direct probe accepted `{ maxTicks: -1 }` and returned `maxTicks: -1` for a finished fight. Validate options before the terminal branch and add terminal/nonterminal invalid-budget cases. The browser uses the valid default and is unaffected.

## Reviewed invariants and architecture

- Pure plain-data simulation, explicit serialized RNG, integer HP/basis points, copied nested state/queue, fixed-point bars and regen carry: `packages/sim/src/fight.ts:121-157,177-190,255-337`; normalization/caps: `packages/sim/src/stats.ts:189-208`.
- Forecast independently replaces each cloned RNG and uses the actual bounded engine, not the live RNG: `packages/sim/src/forecast.ts:62-65`; no forecast call changes `GodState`.
- Affordability and immediate payment are separate from next-tick FIFO application: `packages/sim/src/god.ts:67-79`, `packages/sim/src/fight.ts:260-264`. Real-time GP carry/cap is separate from world speed: `packages/sim/src/god.ts:40-48`, adapter `apps/web/src/sandbox.ts:159-165`.
- Existing tests cover lethal ordering, replay, save/restore, split advancement, GP speed invariance and bounds. `apps/web/src/adapters.test.ts:11-59` covers parsing/formatting, **not** the timer/Worker adapter.

## Actual verification

- `pnpm install --frozen-lockfile --ignore-scripts`: exit 0, lockfile current.
- `pnpm test`: exit 0; 12 files, **82 tests passed**.
- `pnpm typecheck`: exit 0; all three packages plus test configuration.
- `pnpm build`: exit 0; five CSV datasets validated and web/Worker bundles generated. Two upstream Zod `@__PURE__` annotation warnings remain; no build error.
- Isolated forecast queue-dropping mutation: **10 tests still passed**, exit 0. Original gameplay sources were never mutated.
- Direct paid-queue/isolation/GP/live-continuation probe: exit 0. Terminal invalid-budget behavior confirmed separately in the same probe.
- No lint command/config is supplied; no lint gate is claimed.
- **Browser interaction, Worker/Comlink runtime, visibility behavior and the actual timer loop remain unverified.** No browser, Pages, release or remote CI result is claimed by these local checks.

## Public checkpoint scope

Track source, tests, CSV data, localization, lockfile, portable project configuration and authorized GDD/design documentation. Exclude dependencies, generated bundles, caches, logs, credentials and the machine/session-specific `docs/FOUNDATION_BRIEF.md` and `tasks/` orchestration inputs via repository-local exclusion. Historical execution/provenance documents contain local workspace/artifact locations, not their private contents; the raw Notion JSON and authentication materials remain outside the source tree. No Pages configuration, tag, release, main-branch write or board change belongs to this checkpoint.
