# Playable ledger UI result

## Delivered

The default page now mounts an autonomous session, not the combat sandbox. No Start click, reset, direct-equipment control, release, push, or board-state change was added.

- `main.tsx` selects the ledger by default; `?sandbox=1` or `#sandbox` selects the isolated sandbox and its own loop. Startup failures produce an actionable localized error panel.
- `browserGame.ts` supplies the real CSV content, localStorage, wall/monotonic clocks, crypto seed factory (called only for a new session), Web Locks or unique-owner lease, MessageChannel yields, Comlink forecast worker, 100 ms ticks and 1 s forecast scheduling. Visibility and page lifecycle listeners have a single disposal path; persisted pagehide keeps the mount for bfcache pageshow restoration.
- Browser replay grows toward 10,000 real ms per slice, backs off when a measured slice exceeds 8 ms, and never changes the domain's exact elapsed accounting. Slow slices may back down to 1,000 ms. Synchronous pagehide retains its 1,000 ms bound. The old narrow default remains available to headless callers.
- Hero, inventory, live and god panels are separate components. All resources come from canonical session state. The hero sheet includes town/distance/zone, phase, level/XP, HP, gold, Faith, quest, courage/alignment, and nine effective/raw stat rows with caps. Damage and defense use integer point units; only HP uses tenths.
- Six equipment slots, a power-sorted ten-capacity gear bag and a separate trophy pouch expose CSV-generated full/compact names, true/perceived power, prices, item stats and permanent 5 GP blessing/protection. Equipment remains autonomous; unavailable item blessings explain their policy.
- Combat shows both HP and attack meters, CSV enemy names, actual worker Monte Carlo forecast metadata, and typed colored combat events. Diary replaces combat outside a fight. Autoscroll follows only while the reader is within 48 px of the bottom.
- God controls call `userAction`: Blessing/Smite, five exact Voice keywords with visible rejections/diary outcomes, charge redemption, four Faith upgrades with real costs/caps. Descriptions distinguish combat and outside-combat effects and phase-2 temple construction is explicitly unimplemented.
- All new UI prose and diary templates live in `locales/en.json`. Every actual world/divine event has five typed main templates. Composite variants pair those templates with 21 localized codas, providing 21 distinct identities/texts per event type; selection excludes identities used within the preceding 20 displayed entries, even for consecutive travel entries. Selection uses seed/sequence only, never simulation RNG or Math.random.
- Plain CSS uses dark ink/parchment, champagne rules, serif headings and system monospace. Desktop has hero/live/god columns; narrower layouts stack and include mobile section navigation. No images, canvas, audio, gradients, Tailwind, or external font dependencies were added.
- Sandbox interventions now invalidate in-flight forecasts and sandbox events are capped at 400.

## Executed verification

- `pnpm test`: **223 passed across 21 files** (217 baseline plus six new cases).
- `pnpm typecheck`: all workspace and test TypeScript passed.
- `pnpm build`: validated CSV catalogs and emitted the ledger, sandbox chunks and real forecast worker.
- `git diff --check`: passed.
- Adaptive ten-hour replay test: exact canonical equality and progress against one domain reference advance, fewer than 4,000 yielding tasks; executed test took approximately 0.63 s in the headless harness. This is not a browser frame-time benchmark.
- Structural browser-host test: autonomous startup, 100 ms/1 s timers, visibility forwarding, persisted pagehide/pageshow, idempotent disposal and listener/timer removal. This uses mocked runtime/worker seams, not a real browser.
- Localization tests: every message parses as ICU; all event families render with typed values; catalog labels and missing-key behavior; deterministic no-reuse for 100 consecutive travel entries.
- Mutation check: disabling recent-variant exclusion made the no-reuse regression fail; restored implementation passes.

Initial expanded test imports exposed missing Vite/DOM ambient types in the root test compiler. Scoped triple-reference declarations in the two browser-facing test files resolve that without widening the simulation package configuration.

## Remaining acceptance work / honest limitations

1. **Actual browser QA remains unperformed**, as requested for the next worker. Verify desktop/mobile wrapping and contrast, real Comlink forecasts and paid actions, local reload/offline catch-up, multi-tab ownership, bfcache, and lifecycle behavior in target browsers. No browser or services were installed or launched here.
2. **Historical item-name limitation:** world loot/death/service events retain instance IDs but not historical item recipes/content IDs. Current items resolve to their actual CSV-built names; departed items use an explicit localized description rather than inventing a name. Historical combat summaries resolve a CSV enemy name while its encounter remains in the bounded diary; otherwise they truthfully say “the opponent”. Rich historical inspection requires an additive domain event-payload slice, not guessed lookups.
3. Composite diary variants satisfy the no-repeat identity/text window but reuse five main sentences with different codas; this is not 21 independently authored main sentences per type. Selection is reproducible for the same retained history. Trimming the bounded event history can change collision resolution for older retained entries.
4. Pseudo-locale/expanded-string browser QA is deferred. English localization infrastructure and ICU parsing are tested; additional languages and inflection are not implemented.
5. The god panel shows policy descriptions and upgrade levels, not a separate aggregate gear-miracle multiplier readout. The forecast is actual simulation, not a calibration claim. Balance is explicitly uncalibrated.
6. Existing nonfatal Zod Rollup annotation warnings remain. Storage leases remain best-effort when Web Locks are unavailable. No cloud backup or import/reset UI is claimed.

## Mount for next browser worker

Repository: `/home/tyler/workspaces/godville`.

```sh
export PATH=/home/tyler/.local/share/godville-toolchain/bin:$PATH
pnpm --filter @godville/web dev --host 127.0.0.1 --port 5173
```

Open `http://127.0.0.1:5173/` for the live game. Sandbox: `http://127.0.0.1:5173/?sandbox=1` or `http://127.0.0.1:5173/#sandbox`. Production output is `apps/web/dist`; use the existing web preview script after building when testing production worker chunks.
