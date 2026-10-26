# v0.1.0-alpha.1 — playable, uncalibrated alpha

Single-player, client-only, English, text-only browser prototype. **Not a finished
or balance-certified game. No MMO, accounts, graphics, audio or server.**

## Included

- Autonomous travel, town visits, combat, shops, quests, XP/progression, death,
  typed diary and deterministic save/resume with hidden/offline 0.1× world time.
- Seeded combat, nine stats, generated monsters, six equipment slots, item
  modifiers, inventory and autonomous equipment decisions.
- Blessing/Smite, five keyword Voice actions, charges, Faith upgrades and item
  blessing; local GP regeneration uses real time.
- Responsive hero/live/god ledger, separate combat sandbox, worker Monte Carlo
  forecast and cancellable 10,000-fight balance measurement/export tool.
- Source-only pnpm workspace, correctness lint, typecheck/test/build gates, pinned
  CI→Pages workflow and build receipt/candidate zip with SHA-256 checksum.

## Known acceptance gaps

**Balance target missed, not waived by tests.** At seed `20261027`, 10,000 fights
in each of zones 0, 1, 5, 10, 20 and 30 produced **100% wins in every zone** under
the documented fixed fresh-hero kit assumptions. GDD references are approximately
**85% wins and 40–60% finishing HP**; every measured row missed both. These are
measurements, not representative progression certification or tuning. See
[BALANCE_RESULT](BALANCE_RESULT.md) for exact HP values and methodology.

- Temple construction is phase 2; pets, multiplayer/social systems are not shipped.
- Pseudo-locale and expanded-string browser acceptance remain pending. English
  ICU parsing and event rendering tests are not a substitute for that gate.
- Saves are origin-local localStorage, without cloud backup or import/export UI.
  Lease ownership fallback is best-effort; Web Locks are preferred.
- Historical departed item recipes/names are incomplete. Diary variants combine
  five main templates with codas, not a fully authored new sentence every time.
- Formatting is mixed; optional repository-wide format check is not a CI gate.
- Third-party Zod PURE-comment Rollup warnings remain nonfatal.
- Placeholder Godville-derived names need replacement/rights review. This is an
  independent, unaffiliated prototype. No owner-selected license is asserted;
  see [attribution and rights](ATTRIBUTION.md).

## Verification scope

The baseline source checkpoint recorded **245 passing tests**, typecheck/build
success, production browser **82/82** checks and balance-worker browser **12/12**
checks; [browser evidence](BROWSER_QA.md) and [balance evidence](BALANCE_RESULT.md)
retain scope and limitations. Local tooling changes rerun the 245-test suite,
five release-tool tests, lint, typecheck and production build. Browser checks are historical evidence,
not claimed as rerun for each tooling commit. No passing suite establishes the
missed balance acceptance or pseudo-locale gate.

Publication requires the owner to enable Pages, push the accepted `develop`
commit, inspect that exact workflow run, verify live `build-info.json`, and create
an annotated tag/prerelease for the **actual clean built commit**. Release notes
and workflow source alone do not prove remote CI, deployment or release success.
