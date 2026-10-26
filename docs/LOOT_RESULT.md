# Loot, inventory and monster increment

## Portable interfaces

All domain APIs are exported by `packages/sim/src/index.ts`. Runtime modules use only local simulation imports (including type-only imports); CSV/filesystem loading stays in the data package and test fixtures. No clock, DOM, storage or UI dependency is introduced.

- `LootContent` contains plain `bases` and `modifiers`; validated `loadGameData` output satisfies it. `ItemRecipe` stores caller-owned `id`, `baseId`, nonnegative integer `level`, resolved `baseStats` and modifier rolls (`id`, optional `randomStat`/`curseStat`). `buildItem(content, recipe)` computes a `GearItem`; `generateItem(content, rng, { id, level, slot? })` returns `{ item, rng }` without mutating inputs. Save the recipe and RNG for replay. Item stats remain uncapped; `power`, `rarity`, `price`, `sellPrice`, `shopPrice`, blessing/miracle metadata and lock state are explicit.
- `itemNameParts` provides content-derived structured parts; `renderItemName` supports full/compact English and shop counterfeit appearance. Locale adapters can replace group order/labels/renderer. Compact hidden counts count modifier rolls, not collapsed labels: the worked example hides seven rolls, not six.
- `Inventory` is `{ equipped, bag, trophies }`, using six `GEAR_SLOTS`, independent ten-item gear bag and ten-item trophy pouch. IDs must be unique across the inventory and supplied by the caller. `emptyInventory`, `perceivedPower`, `equipBest`, `pickupGear`, `pickupTrophy`, `sellInTown`, `blessItem`, `applyDeathLoss` return immutable transitions or explicit rejection results. Gear transitions expose typed events for future diary adapters. Trophy `full` is a signal for a future world controller, not an implemented return-to-town action.
- `inventoryStats(base, inventory)` adds equipped gear to caller-supplied hero base/growth; `inventoryCombatStats` normalizes and caps the aggregate once. Bag items do not affect combat. `inventoryMiracleEffects` returns equipped multiplicative blessing/miracle factors; future intervention adapters must consume these explicitly.
- `monsterStats(level, family, tuning?)` computes a human-facing `StatBlock`. `generateMonster(names, rng, { id, level, family? }, tuning?)` returns `{ monster, rng }`, including caller ID, selected content ID, family, level and stats. Feed validated monster rows from `loadGameData`; normalize totals at the existing combat boundary. Family and name selection are seeded and uniform in their respective pools.

## Explicit policies and limits

- Item scale is `1 + 0.15 * level`; zone zero uses early-zone modifier eligibility. Modifier counts use descending integer weights; individual modifier weights live in CSV. Resolved random targets and duplicate modifiers are retained.
- Exact table values outrank rounded illustrative examples. Worked power is `378.4374`, price `2270.6244`; negative item power remains legal, but prices floor at zero. Gold is not rounded by inventory transitions.
- Equipping requires a strict improvement of at least `abs(old perceived power) * 0.05`, so negative-power upgrades remain monotone; zero-to-zero does not swap. Ties retain stable input order. Bag replacement/sale ranks true power, excluding locked items. An entirely locked full bag rejects pickup even when the incoming item could improve equipment.
- Town equips first, then sells up to `floor(post-equip bag size / 2)` weakest unlocked items and all trophies at 30% of trophy price. Locks may reduce the number sold. God blessing costs exactly 5 GP, changes perception/lock only, and has no lock-count limit in this prototype; rejected/repeated blessings charge nothing. A locked equipped item may be moved into the bag, but is never discarded, sold or lost on death.
- Death loses exactly 25% of gold and one seeded random unlocked equipped item; bag/trophies are untouched. No eligible equipment means no item loss and no RNG consumption. Combat-ready max HP floors at 0.1 after aggregation; individual cursed items are never clamped.
- Monster HP is `40 + 18L`, damage `(3 + 1.5L)..(5 + 2.5L)` before family multipliers, defense `0.6L` before family multiplier. Family intervals are 1.2–2.4 seconds. `DEFAULT_FAMILY_TUNING` is explicit provisional policy, **not calibrated to the 85% win / 40–60% remaining-HP target**.
- This increment does not implement the world loop, UI, shop purchase orchestration or a `loot100` CLI. The seeded regression generates 100 real items and verifies determinism/serialization; there is no separate CLI command.

## Verified recovery result

- `pnpm test`: 15 files, 145 tests passed, including 14 inventory and 9 monster tests and the real generated item/monster golden snapshot.
- `pnpm typecheck`: all workspace packages and test TypeScript passed.
- `pnpm build`: passed; validated catalogs contain 19 monsters, 4 towns, 7 trophies, 19 bases and 35 modifiers. Rollup reports two nonfatal annotation-position warnings in the installed Zod dependency.
- Reversing the inventory five-percent comparator caused four focused regressions to fail; restoring it returned the full suite to green.
- Seed 123 at item level 20 produces a purple ring (power `265.20417`); continuing its returned RNG produces the level-20 `battle_hamster` spider (HP 400). The checked-in snapshot was generated by executing the real implementations and CSV content, then passed again without snapshot updates.
