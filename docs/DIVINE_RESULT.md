# Integrated divine session interface

The simulation package exports a pure, JSON-compatible session layer. Existing GDD documents remain unchanged; the policies below are explicit prototype assumptions, not new GDD requirements. No browser/UI integration is included.

## Public entry points

```ts
createSession(content: GameData, seed: number, worldTuning?: Partial<WorldTuning>): SessionState
advanceSession(state: SessionState, content: GameData, realMs: number,
  visibility: 'watched' | 'unwatched'): { state: SessionState; events: WorldEvent[] }
actionSession(state: SessionState, content: GameData, action: SessionAction): SessionActionResult
faithUpgradeCost(state: SessionState, upgrade: FaithUpgrade): number | null
saveSession(state: SessionState): SessionState
restoreSession(snapshot: SessionState): SessionState
```

All are exported from `packages/sim/src/index.ts`. Use validated catalogs as `GameData`. Retain the returned state after each operation; calls do not mutate the supplied state. Action results discriminate on `ok`: success supplies the new state and divine events; rejection supplies the original state, an empty events array, and a typed `reason`. Invalid time budgets and unsupported restore versions throw `RangeError`.

The exact action union is:

```ts
type FaithUpgrade = 'capacity' | 'flow' | 'miracle' | 'clarity';
type SessionAction =
  | { type: 'blessing' | 'smite' }
  | { type: 'voice'; keyword: string }
  | { type: 'upgrade'; upgrade: FaithUpgrade }
  | { type: 'use_charge' }
  | { type: 'bless_item'; itemId: string };
```

`SessionState` owns the canonical `world` (including hero stats, inventory, Faith and `world.god` GP), fractional world clock, real elapsed milliseconds, upgrade levels, charges, overflow GP, and divine diary. Do not maintain a second GP balance or regenerate GP separately in a host adapter. `enterWorldDeathInPlace` is an internal mutating helper for owned world clones, not a host orchestration entry point.

## Time, resources and policy assumptions

- The host supplies nonnegative safe-integer elapsed real milliseconds. The session reads no platform clock. Watched world time runs at 1x; unwatched at 0.1x. Fractional conversion and regeneration carries survive splitting and trusted save/restore. No silent offline elapsed cap is imposed; hosts can yield between bounded calls.
- GP regeneration uses real time, independent of visibility: base one GP per 360,000 real milliseconds. Flow multiplies the rate by `1 + level`, retaining previously earned weighted carry. Regeneration is applied before advancing the world.
- Capacity starts at 100 GP and adds 25 per level. Excess regeneration banks complete 100-GP charges, up to three. Incomplete overflow is retained until saturation; at saturation excess credit is discarded. A charge redeems exactly 100 GP only when there is room for all of it; rejection never consumes stock.
- Faith upgrade cost is `5 + 5 * currentLevel`. Capacity, Flow and Miracle cap at level 10; Clarity caps at 7. `faithUpgradeCost` returns `null` at the cap. Capacity raises the maximum without filling it.
- Miracle adds 1,000 basis points of power per level to base 10,000. Equipped miracle weakening and blessing-heal effects participate. Combat interventions pay once through the canonical intervention API and snapshot strength when queued; they apply on the next fight tick, not immediately.
- Outside combat, Blessing costs 25 GP, heals with canonical blessing healing and raises alignment by one. Smite costs 25 GP, damages the hero by scaled 10% maximum HP (at least one), adds five quest progress if a quest exists, and lowers alignment by one. Alignment is bounded to ±100. Lethal punishment uses the same death transition and timeout as combat, without early healing/resurrection or repeated death rewards.
- Voice accepts exact lowercase `fight`, `flee`, `rest`, `town`, `dig`. Known commands cost five GP even when disobeyed. Seeded obedience starts at 30%, rising ten percentage points per Clarity level. Unknown strings return a successful ignored event without GP/RNG cost or raw text persistence. An obeyed command stores one pending world intent; another obeyed command replaces it. World decisions consume intents rather than moving the hero directly. Rest/dig wait for safe travel; town requests return; flee attempts follow the canonical fight tick and paid interventions. Rest heals 5% max HP; dig yields a brick at 50 basis points or configured find gold.
- Item blessing uses the existing five-GP inventory operation, rejects combat/death, equips through canonical preference, and refreshes stats without healing HP.

`advanceSession` returns world events; `actionSession` returns divine events. Divine events carry stable sequence, real/game timestamps and structured payloads, with the latest 60 retained in `session.diary`. World events remain in `session.world.diary`; adapters localize/render structured events rather than storing user strings.

## Persistence trust boundary

`saveSession` only deep-clones a trusted session. `restoreSession` checks the session and nested world schema versions (both currently 1) and deep-clones the snapshot. Neither function validates untrusted JSON, runtime action payloads, catalogs, numeric invariants, or imported saves. TypeScript annotations are not runtime validation.

A browser must validate parsed localStorage data before restoration, or fail safely without overwriting the corrupt save. Do not cast arbitrary parsed JSON to `SessionState` and treat restoration as validation. Untrusted import validation/migrations and browser wiring are intentionally outside this slice. Preserve the complete trusted snapshot, including RNG, carries, queued interventions and pending Voice intent, for exact resume.

## Verification

Executed at repository root after restoring the intentional charge-guard mutation:

- `pnpm test`: 17 files, 199 tests passed, including 30 session tests.
- `pnpm typecheck`: passed for data, sim, web, and test TypeScript configuration.
- `pnpm build`: data validation and production Vite build passed. Rollup emitted two nonfatal dependency-comment annotation warnings in Zod.
- `git diff --check`: passed.

The ten-hour real-time test actually ran against validated catalogs: unwatched world elapsed one hour, level 11, 84 kills and 33 quests; watched world elapsed ten hours, level 58, 892 kills and 355 quests. Both regenerated 100 GP from empty. Tests also cover split/resumed time, charge boundaries and retry safety, upgrade caps/carry, queued scaled miracles, canonical death, seeded Voice outcomes and deferred intents, item stat refresh, bounded logs and input immutability.
