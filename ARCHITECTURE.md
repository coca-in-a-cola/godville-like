# Architecture

## Boundaries

- `packages/sim`: pure deterministic TypeScript domain. Seeded RNG, integer/fixed
  point combat, monsters, loot, inventory, world, progression, divine actions,
  session/time orchestration, forecasts and batch measurements. No DOM, platform
  clocks, storage, signals, locale rendering or `Math.random`. Caller supplies
  elapsed time, visibility and validated catalogs. Retain returned state.
- `packages/data`: Zod schemas and CSV parsing/validation. Stable IDs and content
  live in `data/`; build validation rejects malformed catalogs/duplicate IDs.
- `apps/web`: Preact/signals presentation plus explicit platform adapters.
  `gameRuntime.ts` coordinates persistence/replay/actions, `browserGame.ts` injects
  clocks/storage/ownership/lifecycle and worker plumbing. `sessionSchema.ts`
  validates untrusted save JSON before domain restore; a TS cast is not validation.
- `locales/en.json` and `i18n.ts`: ICU presentation of typed events. Do not feed
  translated strings or presentation randomness into simulation state/RNG.

## Execution

The default entry mounts the autonomous ledger. Sandbox routing lazily loads an
isolated combat harness. Dedicated Comlink workers run visible forecasts and
cancellable batch balances separately; worker responses must not overwrite newer
session/input generations. Host lifecycle owns timers/listeners and disposal.

World time is watched 1× / unwatched 0.1×; GP uses real time. Runtime replay yields
in bounded slices without dropping elapsed time. Save envelopes retain RNG,
remainders and pending work for exact resume. Web Locks are preferred for one
writer; a lease is only a best-effort fallback. Persistence is client-local,
untrusted and not a cloud backup or authentication system.

## Verification and delivery

Vitest/fast-check cover domain, validated catalogs and adapter seams. Real-browser
scripts are a separate optional acceptance layer; unit passes do not establish
browser or balance acceptance. See [commands](README.md#run-locally),
[browser evidence](docs/BROWSER_QA.md), [balance gap](docs/BALANCE_RESULT.md).

Vite emits a static relative-base site into ignored `apps/web/dist`. Root build
adds a build-time provenance receipt and `.nojekyll`. Actions checks source on
`develop`, retains a candidate zip/checksum and deploys a Pages artifact via OIDC;
no server installation or runtime credentials are needed. The owner must enable
Pages first. A successful local build is not a successful remote deployment.
