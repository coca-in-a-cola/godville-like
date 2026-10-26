# Foundation result

Increment: deterministic combat engine plus a thin text-only combat sandbox
(`docs/FOUNDATION_BRIEF.md`). Run on 2026-10-27 with Node v24.22.1 and
pnpm 10.34.9, from `/home/tyler/workspaces/godville`.

## Commands run and real outcomes

| Command | Outcome |
|---|---|
| `pnpm install` | OK. 138 packages, `pnpm-lock.yaml` generated. Resolved TypeScript 5.9.3, Vitest 3.2.7, fast-check 4.10.2, Vite 7.3.7, Zod 4.6.7. pnpm reported "Ignored build scripts: esbuild"; the build works without it. |
| `pnpm typecheck` | OK, exit 0: strict `tsc` for `packages/data`, `packages/sim`, `apps/web`, then `tsconfig.tests.json` for all tests. |
| `pnpm test` | OK: 12 test files, 82 tests passed (Vitest 3.2.7, about 1.8 s). |
| `pnpm build` | OK: `validate:data` printed `data ok: monsters=5 towns=4 trophies=2 bases=6 modifiers=2`, then `vite build` emitted `dist/index.html`, `assets/index-*.js` (191.9 kB, 61.6 kB gzip), `assets/forecast.worker-*.js` (8.5 kB) and CSS. Rollup printed two harmless warnings about `@__PURE__` comment positions inside zod. The built HTML and the worker URL use relative paths (`./assets/...`). |

The first `pnpm test` run had one failing assertion in my own stats test (it
validated an item block as if it were a total). I fixed the test, not the
engine. Vitest wrote the inline golden snapshots (RNG sequence, sandbox fight
transcript, forecast counts) on that first run. I then checked the transcript
by hand against the rules: monster swings every 12 ticks at +25%, hero every
15, the tie at tick 60 goes to the hero, defense 1 turns rolls 4/5/6 into
3/4/5, and regeneration adds +6 tenths per 12 ticks.

## What the tests cover

- Golden known-seed transcript and final state; the same seed, stats and
  action schedule replay identically; the actions change the outcome.
- JSON save and restore mid-fight (pending ms, queued blessing, RNG, partial
  bars, regen carry) equals uninterrupted advancement.
- Any split of the same game time gives identical state and events; 1× and
  0.1× give identical fights for equal game time.
- Attack overflow, the attack-speed cap and floor, fullest-bar order and the
  hero-first tie; inclusive damage bounds; crit ×2 before the defense floor;
  dodge ends the swing; vampirism heal and clamp; 0.5 HP/s regeneration
  accumulating per tick; negative regeneration; counters one level deep.
- Lethal ordering: a lethal first swing, the fuller monster bar killing first,
  a counter killing the attacker, a lethal queued Smite at step 1, a
  simultaneous-death draw, a terminal fight refusing time and actions, and
  inputs never being mutated (deep-frozen).
- Affordable and unaffordable interventions, FIFO at the next tick, Smite
  bypassing evasion and defense, Blessing clamps, the corpse-Smite refusal,
  GP regeneration and cap, and GP that is identical across world speeds.
- Forecast: deterministic for an explicit seed (pinned counts: 29 of 200 hero
  wins for the sandbox matchup), live state and RNG untouched, independent
  trial seeds, 100%/0% one-sided matchups, terminal fights, a bounded
  stalemate (`unresolved`), draws. Also the EDPS/TTK formula and Infinity
  guards.
- fast-check (150 runs, random stats, seeds, GP and action schedules): HP in
  [0, max], GP in [0, max], every number a safe integer, nothing after `end`,
  no counter of a counter, every hit consistent with the damage formula.
- Purity scan of `packages/sim/src` for forbidden APIs.
- CSV validation: real data loads; malformed numbers, duplicate ids, bad
  enums, empty names, bad ids, wrong headers and wrong field counts are
  rejected with file, line and column.
- ICU plural rendering, every `en.json` message parses, log line formatting
  and stat-editor parsing.

## Not verified

- **Browser interaction was not exercised.** No browser was available in this
  session, and I did not start a dev server. The sandbox UI, the Web Worker
  and Comlink path, visibility handling and the real-time loop compile and
  bundle, but nobody has clicked through them yet.
- Some commands were refused by this session's permission policy, so I
  avoided them: `pnpm add`, `pnpm view`, `pnpm --filter … typecheck`,
  `corepack --version`. Dependency versions were declared as caret ranges in
  the manifests, and plain `pnpm install` resolved them.
- No Git repository was initialized and nothing was committed or published.

## Known limits

- The sandbox monster preset is the zone-1 formula with a 1.2 s interval; at
  these values the base hero loses most fights (forecast about 14.5%). No
  balancing was attempted.
- Monster family tilts, zone-based monster generation and the hero's flee rule
  (Courage) are not implemented. Only the raw estimate utility exists.
- The forecast keeps already-paid queued interventions, and caps each trial at
  6,000 ticks. Both are documented policies, not GDD values.
- Trophy `base_price` values are placeholders. The modifier `value` for
  `of_vampirism` keeps the GDD sample's `1`, which conflicts with the
  catalog's 1.5%.
- No automatic 0.1× on a hidden tab, no persistence or offline catch-up, no
  accumulator charges, Voice or Faith.

## Next increment

Combat acceptance: a 10,000-fight headless batch (CLI or dev page) per zone,
built on `runFight`; monster stats from the zone formulas and family tilts;
tuning toward roughly 85% wins ending at 40–60% HP; then a browser
walkthrough of the sandbox.
