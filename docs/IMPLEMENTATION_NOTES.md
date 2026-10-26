# Implementation notes — combat foundation

These are the concrete choices made where `docs/GDD.md` is silent or ambiguous
(see `docs/GDD_ACCEPTANCE.md`, "Numerical ambiguities"). Anything marked
**choice** is an implementation decision, not a GDD requirement, and can be
retuned. Every rule below is covered by a test in `packages/sim/test/`.

## Units and rounding

| Quantity | Internal unit | Conversion from `StatBlock` |
|---|---|---|
| Max HP, current HP | integer tenths of HP | `Math.round(hp × 10)`, at least 1 |
| Damage min/max | integer points | `Math.round` each end |
| Defense | integer points | `Math.round` |
| Attack speed, crit, evasion, vampirism, counter | integer basis points | `Math.round(percent × 100)` |
| Regeneration | integer milli-HP per second | `Math.round(hp_per_s × 1000)` |

- `Math.round` rounds half toward +∞ (4.5 → 5, −2.5 → −2). Results are
  normalized so −0 never appears in state (JSON round trips stay exact).
- Rounding happens once, in `normalizeStats`, on the **aggregated total**.
  `sumStatBlocks` adds blocks (base + items) without caps or rounding, so an
  item can carry 80% crit while the hero's total is still capped at 50%.
- Fractional monster formulas (e.g. zone 1 damage 4.5–7.5, defense 0.6)
  therefore become 5–8 and 1. Hero level growth (+0.5 per damage end) is
  rounded the same way when hero levels exist.

## Caps and lower bounds

GDD caps, applied to totals: attack speed +200%, crit 50%, evasion 60%,
vampirism 30%, counter 40%.

Lower bounds (**choice**; the GDD gives none):

- Attack speed ≥ −90%: the interval is at most 15 s and never ≤ 0.
- Defense ≥ 0: negative defense would otherwise *add* damage.
- Damage min ≥ 0, damage max ≥ damage min.
- Crit, evasion, vampirism, counter ≥ 0%.
- Max HP ≥ 0.1 HP (1 tenth). Inputs below 0.1 are a validation error.
- Regeneration has no lower bound. Negative regeneration (curses) drains HP
  each tick and can kill.
- Sanity input domain: every value must be finite with |value| ≤ 1,000,000.
  This keeps every integer product in a tick far below 2^53.

`validateStatBlock` reports field errors (`not_a_number`, `out_of_range`,
`max_hp_too_low`, `min_above_max`) and is what the UI uses. `normalizeStats`
and `createFight` throw on invalid input instead of producing a broken state.

## Attack bars (exact fixed point)

A bar gains `10000 + attackSpeedBp` per tick and fires at `150000`. With AS = 0
that is 15 ticks = 1.5 s; in general the average interval is exactly
1.5 s / (1 + AS), with no approximation. Overflow is kept (`bar −= 150000`).
The highest fill is 30000 per tick, so a side swings at most once per tick.
"Fullest bar first" compares the raw bar values (same threshold for both
sides), and the hero wins exact ties.

## Regeneration remainder

Per tick a combatant gains `regenMilliHp / 1000` tenths of HP. The carry
(`regenCarry`, in (−1000, 1000)) keeps the fraction, so 0.5 HP/s gives
+1 tenth every second tick (0.05 HP/tick is never rounded away). The carry
uses truncation toward zero, so negative regeneration works symmetrically.
HP is clamped to [0, max]; the carry keeps accumulating at full HP.

## RNG

- sfc32 with four uint32 words, seeded through splitmix32 and 12 discarded
  outputs. All arithmetic is `Math.imul`/shifts/`>>> 0`.
- Integers are drawn by rejection sampling (unbiased).
- Chance rolls always draw, even at 0% or 100%, so the draw order depends on
  the event sequence and not on stat values.
- Draw order per swing: defender evasion → damage roll → attacker crit →
  (defender counter roll, only if the defender survived and this is not a
  counter strike).
- The RNG state is part of `FightState` and serializes as plain JSON.

## Tick order and hit resolution

Exactly the GDD order:

1. Apply interventions queued before this tick, FIFO.
2. Regeneration (hero, then monster).
3. Advance bars.
4. Resolve full bars, fullest first, hero first on ties.
5. Death check.

One swing: evasion (`DODGE` ends the swing: no damage, no vampirism, no
counter) → uniform inclusive integer damage → crit ×2 → defense
`dealt = max(ceil(0.2 × raw), raw − DEF)` (integer: `floor((raw + 4) / 5)`)
→ vampirism → counter.

- **Vampirism (choice):** heals `floor(hpRemoved × vampBp / 10000)` tenths,
  where `hpRemoved` is the HP actually removed (damage beyond the defender's
  remaining HP does not heal). Clamped to the attacker's max HP. A heal event
  is emitted only for a positive heal.
- **Counter:** only after a hit that landed and left the defender alive. The
  counter strike is a full swing (dodge, damage, crit, defense, vampirism)
  and is never countered itself.

## Same-tick deaths and terminal state

The GDD only says "check deaths; end the fight" at step 5. Rules chosen:

- A combatant at 0 HP is **dead and inert for the rest of the tick**: it does
  not regenerate, its bar does not advance, and it does not swing or counter.
- A swing whose attacker or target is already dead is skipped (its bar is
  left as it is). So when both bars are full, a lethal first swing (the
  fuller bar, or the hero on a tie) prevents the victim's swing.
- A counter strike can kill the original attacker.
- A queued Smite that kills at step 1 ends the tick before any swing, even if
  both bars become full in step 3.
- The fight ends at step 5 of the tick in which the first death happened.
  Events: one `death` per dead side (hero first), then `end`.
- Outcome: one side dead → the other side won; both dead → `draw`. A draw is
  only reachable when both sides die in the same step (in practice: negative
  regeneration in step 2).
- After the end, `advanceFight` returns no events and discards time
  (`pendingMs` becomes 0), and interventions are refused with `fight_over`.

## Interventions and godpower

- Godpower lives in a separate `GodState` (`gp`, `gpMax`, `regenCarryMs`),
  not in `FightState`. It regenerates +1 GP per 360,000 real ms from
  `advanceGodpower(god, realElapsedMs)`. The adapter passes **real** elapsed
  ms, so the world speed never changes GP. At the cap the carry resets to 0
  (no banking; accumulator charges are a later increment).
- `requestIntervention` pays the cost (25 GP each) immediately and appends to
  `fight.queue`. Both are applied at step 1 of the next tick, in queue order.
- Blessing heals `floor(25% × hero max HP)` tenths, clamped to max. It is
  allowed at full HP (the event shows `amount: 0`); the GDD does not forbid it.
- Smite removes `floor(20% × monster max HP)` tenths, ignoring evasion and
  defense, clamped to the remaining HP.
- **Choice:** nothing happens between ticks, so queued smites hit the monster
  at its current HP. A smite that could only hit a corpse (queued smite damage
  already ≥ monster HP) is refused with `target_doomed`, so GP is never spent
  on a dead target and no refund mechanism is needed.
- Rejections (`insufficient_gp`, `fight_over`, `target_doomed`) leave both
  states untouched.

## Time

- `advanceFight(state, gameMs)` takes a non-negative integer of game ms,
  simulates whole 100 ms ticks, and keeps the remainder in `pendingMs`. Any
  split of the same total gives the same state and events.
- `scaleRealToGame(clock, realMs, speed)` converts integer real ms to game ms
  at 1.0× (`watched`) or 0.1× (`unwatched`) with a carry in tenths of a ms.
- The web adapter floors `performance.now()` deltas to integer ms and keeps
  the fraction. The sandbox has a manual 1×/0.1× toggle. Automatic 0.1× on a
  hidden tab, persistence and offline catch-up are later increments. Page
  Visibility is used only to pause the forecast.

## Headless runner and forecast

- `runFight(state, { maxTicks })` is bounded (default 6,000 ticks = 10 game
  minutes, **choice**) and returns `hero_won`, `monster_won`, `draw` or
  `unresolved` (the budget ran out, e.g. a stalemate).
- `forecastFight(state, { seed })` runs 200 trials. Trial *i* clones the
  current state and replaces only its RNG with `seedRng(mixSeed(seed, i))`.
  The live state and RNG are never read for randomness or modified.
- **Choice:** interventions already queued (and paid for) stay in the cloned
  state, because they are part of the current fight. No hypothetical player
  actions are added.
- A finished fight is reported as its outcome for every trial, with no
  simulation (`terminal` is set).
- `heroWinBp = floor(heroWins × 10000 / trials)`. Draws and unresolved trials
  are reported separately and do not count as wins.
- The web app derives the forecast seed from `(fight seed, current tick)`, runs
  it in a Web Worker through Comlink, at most once per real second, only
  while the page is visible, and skips a state it has already forecast.

## Hero's cheap estimate

`estimateDuel` uses the GDD EDPS/TTK formulas in plain floating point. It is
a heuristic outside the tick loop, never part of fight state.
`mean(dealt)` is the exact mean over the integer damage rolls after defense;
crit enters as the GDD's `(1 + CR)` factor; counters are ignored, as in the
GDD. A non-positive net damage rate gives `Infinity`; both infinite means
`stalemate`. Mapping this to a flee decision (Courage threshold) belongs to
the hero state machine and is not implemented.

## Data and localization

- The five CSV schemas follow the GDD column lists. Ids are `lower_snake_case`
  and must be unique per file. Headers must match exactly. Malformed values,
  unknown enum values, empty names, wrong field counts and duplicate ids all
  fail `pnpm test` (`packages/data/test`) and `pnpm build` (`validate:data`).
- The rows are representative only: one monster per family, the four GDD
  towns, one base per slot, two trophies, and the two modifier rows from the
  GDD's sample CSV. The modifier `effect` vocabulary is left as a token until
  the loot generator defines it. The sample's `of_vampirism` value `1`
  conflicts with the catalog's standard 1.5%. It is kept verbatim and must be
  settled when loot is built.
- **Placeholder:** the trophy `base_price` values (5, 8) are not in the GDD.
- The sandbox monster preset uses the GDD zone-1 formulas (HP 58, damage
  4.5–7.5, defense 0.6) with a 1.2 s interval (+25% attack speed). Its name is
  chosen from `monsters.csv`. Family stat tilts are not generated yet.
- UI and log strings are ICU messages in `locales/en.json`. The log renders the
  typed events, so a language switch can re-render history.
