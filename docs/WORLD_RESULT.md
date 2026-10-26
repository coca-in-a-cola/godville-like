# Autonomous hero world increment

## Exported domain contract

`packages/sim/src/index.ts` exports the world API. There are no data-package runtime imports, browser APIs, filesystem access, clock reads, or localized sentences in the world domain.

```ts
const state = createWorld(validatedContent, 123);
const { state: next, events } = advanceWorld(state, validatedContent, 60_000);
const saved = JSON.stringify(next);
const resumed = advanceWorld(JSON.parse(saved), validatedContent, 123);
```

- `GameData` is a structural plain-data interface extending `LootContent` with `towns`, `monsters`, and `trophies`; validated `loadGameData` output satisfies it. Catalog validation/loading remains the caller's responsibility. Keep content and tuning stable across replay/save restoration; there is no content-version migration or untrusted-save validator in this increment.
- `createWorld(content, seed, overrides?)` creates schema version 1 with explicit `WorldTuning`. Duration/probability/collection policies are validated and saved in state.
- `advanceWorld(state, content, gameMs)` accepts nonnegative safe-integer **game** milliseconds and returns `{ state, events }`. It does not mutate inputs. Every phase uses the existing 100 ms tick. `pendingMs` persists sub-tick time; `travelCarryMs`, phase/death timers, RNG, IDs, current combat, quest, equipment and progression are serializable. Any split of the same budget produces identical state, including diary.
- `WorldEvent` is a discriminated union of localization-friendly payloads with global sequence and game-time fields. Both returned events and saved diary retain only the latest `diaryLimit` events (default 60, configurable 20–100). Large advances intentionally truncate returned history; compare sequence numbers if an adapter needs a truncation indicator. Combat stores one summary, not the full hit log.
- `worldZone(state, content)` uses exactly `ceil((town.base_mile + distance) / 10)`; zone zero is legal.
- `worldShopOffers(content, seed, townId, day, tuning?)` has an explicit integer day argument and independent seeded RNG. World services use `floor(elapsedMs / dayMs)`: a **game-day since creation**, not local/UTC civil midnight. Purchased IDs persist for the current town/day; offers refresh on town service. Shop generation never consumes encounter RNG.
- `actionWorld(state, content, { type: 'personality', courage?, favoriteModifierId? })` edits only bounded personality/configuration fields. It cannot move the hero, advance time, or pretend to implement divine controls.
- `worldXpThreshold(level)` is `100 * level^1.5`, computed at creation/level-up and persisted as `nextLevelXp`. The narrowly scoped purity-test exception permits only that expression in `progression.ts`, not exponentiation in tick modules.

## Implemented route and explicit policies

Town → Travel → Combat → Travel/Return → Town, or Combat → Dead → Town. Town service happens after a configurable dwell (default two game seconds). It equips/sells through `sellInTown`, sells all trophies, buys at most one affordable strict perceived upgrade from daily offers, heals fully and takes/continues a quest. Quest payout occurs once on completed-quest hand-in, followed by migration to at most the next eligible town; reaching a level without completing the current quest does not migrate. Death preserves the current quest.

Starter equipment is six genuine, unmodified, level-zero `buildItem` recipes: weapon, helmet, armor, shield, damage ring, HP/defense amulet. Aggregated initial combat stats include 140 HP, 11–15 damage and 8 defense. No monster formula, family tuning, combat or loot module was changed.

Default unspecified policies are all visible in `DEFAULT_WORLD_TUNING`:

| Policy | Default |
| --- | --- |
| Travel step / distance | 5 game seconds / 1 mile |
| Travel roll, exclusive | 30% encounter, 15% gold, 5% item, 0.1% brick, remainder diary variant |
| Gold find | 5 × max(1, zone) |
| Kill rewards | 20 XP and 8 gold × max(1, monster zone), one seeded trophy |
| Kill item / brick | 20% tunable item; GDD 0.5% brick |
| Quest progress | 25 points per kill + 5 per outbound mile, capped at 100 |
| Quest payout | 60 gold + 60 XP × quest creation level; 3 Faith |
| Level-up | +8 base HP, +0.5 each base damage end, 1 Faith; no free field heal |
| Death timeout | 60 game seconds |
| Shop | 6 daily offers, original item shop price × tunable multiplier 1 |
| Day / diary | 86,400,000 game ms / latest 60 events |

The hero uses existing `estimateDuel` at encounter time. Its decision score is monster TTK / (hero TTK + monster TTK), with explicit infinity handling: a cheap **heuristic**, not a calibrated win probability. It attempts fleeing below `clamp(courage + alignment * 0.01, 0, 1)`; success is 50% + evasion. A failed flee starts the original fight without a synthetic attack penalty; success continues travel. Returns trigger at HP strictly below 30%, ten trophies, or completed quest. Return travel has no encounters or quest-mile progress. Noncombat field regeneration is not added; existing combat regeneration and full town healing remain canonical.

Death timeout calls existing `applyDeathLoss`: exactly 25% gold plus one seeded unlocked equipped item, never locked gear. Resurrection restores HP against the reduced equipment and returns to the same town. Gold/Faith/bricks and XP bank saturate at `WORLD_RESOURCE_CAP` (10^12); hero level caps at 1000 as an explicit numerical safety policy. Gold remains fractional, matching inventory prices/death loss.

`god` is reserved using existing `GodState`, but **advanceWorld never regenerates GP**. Adapters must eventually apply real-time GP separately and convert real→game time through the existing clock API. Faith accrues, but Faith upgrades, accumulator charges, voice/blessing/smite integration, UI, persistence adapters, workers and releases are deliberately out of scope.

## Real execution and verification

- Root `pnpm test`: **16 files, 168 tests passed**, including 21 focused world tests.
- Root `pnpm typecheck`: passed for workspace packages and tests.
- Root `pnpm build`: passed, catalogs validated; existing two nonfatal Zod/Rollup annotation warnings remain.
- `git diff --check`: passed.
- Mutation check: reversing the low-HP return condition caused the focused HP-route test to fail; restoring it returned the full suite to green.
- Covered exact town/travel/return/death deadlines, strict 30% boundary, canonical seeded locked-item death loss, actual combat win/death transitions, both seeded flee outcomes, kill/mile quest progress, migration eligibility, town sales and purchase limit, daily deterministic offers, all travel-find types, growth/Faith, currency bounds, JSON restore and arbitrary split budgets, and GP non-regeneration.

Three actual one-game-hour runs using validated CSV catalogs and default policy:

| Seed | Level | Kills | Deaths | Quests | Outbound miles | Town | Final route |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| 1 | 12 | 96 | 0 | 35 | 285 | tradeburg | Return, distance 7 |
| 123 | 11 | 84 | 0 | 33 | 286 | tradeburg | Return, distance 4 |
| 5678 | 11 | 78 | 0 | 31 | 281 | tradeburg | Return, distance 2 |

Seed 123's exact totals/phase/town/distance/event sequence are regression-pinned. Each run retained at most 60 diary/events and finite state; the separate split test reproduces 3,600,123 game ms including a 23 ms remainder.

These outcomes are smoke/regression evidence, **not** the GDD 10,000-fights-per-zone 85% win / 40–60% HP calibration gate. That balance gate remains unperformed; no tuning claim or release claim is made. Board hold remains untouched; publishing/push belongs to the parent agent.
