# Godville-like

A single-player, text-only browser alpha: an autonomous hero travels, fights,
collects gear, visits towns and completes quests while you intervene as their god.
No accounts, server, MMO/social systems, graphics or audio.

**Alpha, not a balanced or finished game.** The fixed-loadout baseline won **100%**
of fights in all six measured zones, missing the GDD's approximately **85%** win
and **40–60%** finishing-HP targets. See [measurement and assumptions](docs/BALANCE_RESULT.md).
Temple construction is phase 2; pseudo-locale/expanded-string QA is still pending.

- [Play on GitHub Pages](https://coca-in-a-cola.github.io/godville-like/)
  — deployment is available only after the repository owner enables Pages and CI succeeds.
- [Alpha release notes](docs/RELEASE_NOTES_v0.1.0-alpha.1.md)
- [Design document](docs/GDD.md) · [architecture](ARCHITECTURE.md) ·
  [release runbook](docs/RELEASING.md)

## Playable systems

- Seeded deterministic combat, nine stats, five monster families, six equipment
  slots, item modifiers, perceived power and autonomous equipment choices.
- Travel/towns, shops, quests, XP/levels, death, diary and local persistence.
- GP, Blessing/Smite, five Voice keywords, accumulator charges, Faith upgrades
  and item blessings. Numeric policies and effects are visible in the UI.
- Three-column hero/live/god ledger; stacked narrow-screen layout, colored combat
  log, real 200-trial worker forecast and a separate cancellable balance worker.
- Visible world time at 1×; hidden/offline world time at 0.1×, with real-time GP
  regeneration. Offline catch-up can take time: it is not silently truncated.
- English ICU messages and data-driven CSV names. Other locales are not shipped.
- Isolated combat sandbox at `?sandbox=1` (or `#sandbox`); it is not the default game.

## Run locally

Use Node **24** (CI), pnpm **10.34.9**, and Git. Node ≥22.18 is supported by the
existing TypeScript scripts; lint tooling additionally requires a current Node
22 minor (≥22.13). Node 24 is the simplest consistent choice.

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm lint             # recommended TS correctness + Preact hook rules; zero warnings
pnpm typecheck
pnpm test
pnpm build            # CSV validation, Vite bundle, build-info.json and .nojekyll
pnpm check            # lint → typecheck → tests → build
pnpm --filter @godville/web preview --host 127.0.0.1 --port 4173
```

Build provenance requires Git and the pinned pnpm; `pnpm test` also runs five
release-tool checks using Python 3 (stdlib only). Browser QA additionally needs
Python Playwright and Chromium, as below.

Serve `apps/web/dist` over HTTP(S), not `file://`, so module workers work. Vite's
relative base `./` supports a project Pages path. Generated dependencies and
bundles are ignored, not committed. A build's `build-info.json` records its actual
source revision, dirty status, version, lockfile hash and toolchain input.

### Balance and browser checks

```sh
pnpm balance --zones 0,1,5,10,20,30 --seed 20261027 --trials 10000 --max-ticks 6000 --output ../balance-baseline.json
# Optional separate browser QA environment; not part of pnpm check:
python3 -m venv ../godville-qa
../godville-qa/bin/pip install playwright
../godville-qa/bin/python -m playwright install chromium
../godville-qa/bin/python scripts/browser-smoke.py
BALANCE_BASELINE="$PWD/../balance-baseline.json" ../godville-qa/bin/python scripts/balance-smoke.py
```

Build first; browser scripts start/stop their own localhost preview on port 4173.
`CHROMIUM_PATH` selects an installed Chromium; `BROWSER_QA_OUT` and `BALANCE_QA_OUT`
select evidence directories. Prior browser evidence: [browser QA](docs/BROWSER_QA.md).
The balance tool measures outcomes, not acceptance of the missed balance targets.

## Saves and limitations

Saves live in this browser's **localStorage for the exact origin**. They do not
sync between devices, browser profiles, localhost and Pages. Clearing site data
or private-session closure can lose progress; there is no cloud backup or save
import/export UI. Multiple projects on one Pages origin may share a storage
namespace. Use one active tab: Web Locks provide ownership where available; the
lease fallback is best-effort, not an atomic cross-tab guarantee. Invalid saves
fail safely rather than being silently overwritten. Local saves are not a
security or anti-cheat boundary. See [runtime policies](docs/RUNTIME_RESULT.md).

Historical departed items do not retain full naming recipes. Diary variety uses
five main templates plus codas per event rather than independently authored prose
for every variant. Build warnings from third-party Zod PURE comments are known.

## Conventions and rights

EditorConfig and `.gitattributes` set portable UTF-8/LF conventions. ESLint checks
correctness, not formatting. Use `pnpm format path/to/changed-file.ts` for an
intentional narrow formatting change. `pnpm format:check` reports existing mixed
formatting debt; **it is not a passing CI gate**. Do not mass-format gameplay code
as part of unrelated work; the exported GDD and CSV corpus are excluded from the
formatter to preserve their source representation.

This is an independent prototype, **not an official Godville product and not
endorsed by or affiliated with Godville**. The GDD identifies Godville-derived
names as placeholders; see [content provenance and rights](docs/ATTRIBUTION.md).
No software/content license has been selected by the owner. Public visibility is
not a grant of redistribution rights, and no trademark rights are claimed.
