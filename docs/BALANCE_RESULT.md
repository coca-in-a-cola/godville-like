# Combat balance measurement — prerelease devtool

## Status

The deterministic measurement tool is verified. **Combat balance is not certified:** all six measured zones miss both GDD references (about 85% wins and 40–60% remaining HP). No combat, monster, loot, or progression formulas were calibrated or changed for this measurement. Shipping this devtool is not completion of the balance-target acceptance criterion.

## Reproduction and assumptions

From the repository root with Node >=22.18 and pnpm available:

```sh
pnpm balance --zones 0,1,5,10,20,30 --seed 20261027 --trials 10000 --max-ticks 6000 --output /absolute/path/balance-baseline.json
pnpm build
BALANCE_BASELINE=/absolute/path/balance-baseline.json /opt/agents/playwright/venv/bin/python scripts/balance-smoke.py
```

The Python runner requires Playwright and its cached Chromium; optionally set `CHROMIUM_PATH`. `BALANCE_QA_OUT` selects the browser evidence directory. The runner starts and cleans up only its own preview process group.

- Each zone runs 10,000 independent encounters through canonical `createFight` / `runFight`; every fight starts at full hero HP. No interventions, fleeing, persistent attrition, or world progression occur within a batch.
- Hero level is `max(1, zone)`, with existing +8 HP / +0.5 base damage per level after level 1. Gear level is the zone. This mapping is a measurement assumption, not a guarantee about actual player progression.
- One seeded generated item per slot (weapon, helmet, armor, shield, ring, amulet) is held fixed across the entire zone batch. No best-of selection or rerolling. This is one reproducible kit per zone, not a population-wide gear sample.
- Five monster families are sampled uniformly using the existing generator. Index-derived, domain-separated encounter and combat seeds prevent combat length from shifting subsequent encounters. The same seed across zones yields correlated family samples, not six independent population estimates.
- The cap is 6,000 simulation ticks per fight. Unresolved fights are explicitly counted; capped durations are included in the duration mean.
- `meanHpWins` averages remaining normalized starting-HP fractions over wins only (null without wins); `meanHpAll` averages over all trials, including losses, draws and unresolved fights. They happen to coincide here because every fight was won.

## Actual 60,000-fight results

Seed: `20261027`; 10,000 trials per row. HP columns are fractions, not percentages. Every row has 10,000 wins, zero losses, zero draws, zero unresolved fights, and `completed=true`.

| Zone | Win rate | Mean HP, wins only | Mean HP, all trials | Mean duration (s) | GDD targets |
| --- | --- | --- | --- | --- | --- |
| 0 | 100% | 0.9984985385 | 0.9984985385 | 5.89936 | Both missed |
| 1 | 100% | 0.9936035688 | 0.9936035688 | 8.23172 | Both missed |
| 5 | 100% | 0.8783506869 | 0.8783506869 | 14.02854 | Both missed |
| 10 | 100% | 0.9839921126 | 0.9839921126 | 11.39234 | Both missed |
| 20 | 100% | 0.9827227617 | 0.9827227617 | 15.84870 | Both missed |
| 30 | 100% | 0.9834559297 | 0.9834559297 | 15.18253 | Both missed |

These observations show the measured fixed fresh-hero kits outperform the references. They do not establish the cause or authorize retuning another domain. A separate approved calibration task must resolve the target misses and representative progression/loadout policy.

## Verification and retained evidence

- Root `pnpm test`: 245 tests passed across 22 files, including 21 balance tests.
- Root `pnpm typecheck`, `pnpm build`, and `git diff --check`: exit 0. Build emits existing third-party Zod PURE-comment warnings, not errors.
- Production cached-Chromium smoke: 12 checks passed, no page errors. Exercises real dedicated batch workers, intermediate progress, cancellation with incomplete data and no stale updates, completed 10,000-fight accounting, deterministic rerun including gear, JSON export data, draft/result isolation, exact browser/Node equality, distinct forecast/batch workers, and mobile overflow.
- The export check decodes the actual download link payload; it does not test an OS download dialog.
- Retained evidence outside the checkout: `/home/tyler/.hermes/profiles/tyler/artifacts/godville-balance/`. `balance-baseline.json` contains complete loadouts, normalized stats, per-family summaries and timings. `browser/results.json`, `browser/zone1-worker.json`, desktop/mobile screenshots and the preview log retain real browser outputs.
