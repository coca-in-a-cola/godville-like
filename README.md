# Godville-like — combat foundation

A single-player, text-only browser prototype of a Godville-style game (design:
`docs/GDD.md`). This first increment delivers the **deterministic combat
engine** and a **thin combat sandbox**. It is not the game yet.

## Requirements

- Node.js ≥ 22.18 (developed on 24.22; the data check script relies on Node's
  built-in TypeScript type stripping)
- pnpm 10 (pinned via `packageManager`: `pnpm@10.34.9`)

## Commands

```bash
pnpm install      # install workspace dependencies (lockfile: pnpm-lock.yaml)
pnpm dev          # start the Vite dev server for the sandbox (apps/web)
pnpm test         # Vitest + fast-check: sim, data and web adapter tests
pnpm typecheck    # strict tsc for packages/sim, packages/data, apps/web and tests
pnpm build        # validate data/*.csv, then build apps/web to apps/web/dist
```

`pnpm build` fails on malformed CSV data or duplicate ids. The build uses a
relative base (`./`) so it can later be served from a GitHub project Pages
path. Nothing is published.

## Layout

```
packages/sim/   pure engine: seeded RNG, stats, fight ticks, interventions,
                godpower, time scaling, headless runner, forecast, estimate
packages/data/  Zod schemas + Papa Parse loader for the five CSV files
apps/web/       Preact + signals sandbox, Comlink forecast worker, ICU i18n
data/           monsters.csv, towns.csv, trophies.csv, bases.csv, modifiers.csv
locales/        en.json (ICU MessageFormat)
docs/           GDD, acceptance inventory, implementation notes, result
```

`packages/sim` has no DOM, clock, storage, signals, `Math.random` or locale
formatting. Its `tsconfig` has no DOM lib, and a test scans its sources for
forbidden APIs.

## What the sandbox does (delivered)

- Two editable nine-stat blocks (hero and monster) with inline validation.
  Invalid input is reported and never reaches the engine.
- Explicit seed, Reset / Start / Pause, 1× / 0.1× game speed.
- HP bars and attack bars, game clock, terminal outcome with a short summary.
- Godpower meter (real-time regeneration, +1 GP per 6 minutes, max 100) and
  working Blessing / Smite (25 GP each, queued for the next tick). A sandbox
  field sets GP on reset.
- Colored typed combat log (dealt white, taken red, heals green, dodge grey,
  crit yellow, god violet).
- A real 200-trial Monte Carlo win forecast in a Web Worker, at most once per
  second while the tab is visible, plus the hero's cheap EDPS/TTK estimate.
- Monster names come from `data/monsters.csv`; UI strings come from
  `locales/en.json`.

## Not built yet (deferred)

Planned in later increments, in GDD order: the 10,000-fight balance tool and
zone tuning; monster generation by zone and family; loot generation, the
modifier catalog, item names, power and inventory; the hero state machine,
road, towns, quests, diary and death; persistence, automatic 0.1× on hidden
tabs, offline catch-up; accumulator charges, Voice, out-of-combat actions,
Faith and god stats; temple, pets, multiplayer and publication.

See `docs/IMPLEMENTATION_NOTES.md` for rounding, bounds, same-tick death
rules and forecast policies. See `docs/FOUNDATION_RESULT.md` for the checks
that were run.
