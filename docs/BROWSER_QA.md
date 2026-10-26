# Production browser QA

## Result

The completed production-preview smoke returned **exit 0: 82/82 checks passed**
in headless Chromium **156.0.8078.4**. No page errors, console errors, failed
requests, or HTTP errors were recorded, including the real forecast worker.
The empty data-URL favicon fixes the previously observed favicon 404.

Evidence from this run (local artifacts, not committed):
`/home/tyler/.hermes/profiles/tyler/artifacts/godville-browser-qa/`
contains `results.json`, `run.log`, `preview.log`, seven screenshots, and normal
and combat save snapshots. `results.json` records each assertion and its detail.

Also verified at the repository root: `pnpm test` (**223 tests passed**),
`pnpm typecheck`, `pnpm build`, and `git diff --check` (all exit 0).
Build emits non-blocking third-party Zod PURE-comment annotation warnings.

## What the browser actually exercised

- A fresh session advances without Start; HP, GP, and quest readouts render;
  refresh retains the seed and progress and updates the save timestamp.
- An actual travel-generated combat advances, with a real Comlink worker
  displaying a 200-trial forecast. Blessing and Smite each debit 25 GP,
  record queued events, and apply on advancing combat ticks.
- Item blessing debits 5 GP and persists protection. Known Voice commands debit
  5 GP, persist obey/disobey feedback, and unknown text costs nothing. Maximum
  clarity demonstrates obedience. All four Faith upgrade buttons work;
  capacity increases the maximum without refilling current GP.
- A save timestamp aged 60 seconds catches up at 0.1 world speed; GP uses wall
  time. The visibility listener also uses 0.1 speed under a synthetic event.
- Two real same-origin tabs use Web Locks: the secondary is read-only, does not
  overwrite after primary closure, and acquires the released lock on reload.
- Desktop 1440×1000 and mobile 390×844 have no horizontal document overflow.
  Real generated long catalog names are expanded on mobile. Query and hash
  sandbox routes render separately. Corrupt save bytes and their backup are
  preserved with an actionable error, not silently reset.

The runner uses fresh isolated browser contexts, not a user's browser profile.
Controlled localStorage fixtures are explicitly labeled in assertions and
screenshot filenames; they set encounter/loot probabilities, damaged HP, Faith,
clarity, or timestamps. They are not evidence of naturally earning those states.
Loot generation now gets bounded retries: a previous 2.2-second random sample
failed the >50-character-name assertion. The assertion remains in place.

## Visual review

The five supplied images were visually inspected: `desktop-new-session.png`,
`desktop-combat-controlled-save.png`, `mobile-new-session.png`,
`mobile-inventory-controlled-loot.png`, and `mobile-god-controls.png`.

No blocking clipping, horizontal overflow, or broken control layout is visible.
Desktop uses a consistent ledger hierarchy, clear bars, and separated columns;
the combat image visibly includes both combatants, forecast, and miracle log.
Mobile stacks panels cleanly; long inventory names wrap and expanded item
properties stay within their panel. The God anchor places usable controls below
the navigation, with readable cost labels and explanatory text.

Non-blocking usability concerns: the desktop live panel starts unusually low,
leaving a large empty central area and putting combat below the initial viewport.
Mobile is long and text-dense; muted small explanatory copy is less comfortable
than the main labels. The fixed mobile navigation crosses content in full-page
captures; the dedicated anchored God viewport shows it above the controls.
These observations are not a measured contrast/accessibility certification.

## Limits

- **Real bfcache restoration: UNKNOWN.** Playwright's Chromium launch disables
  back-forward cache. Synthetic persisted lifecycle unit coverage is not a real
  bfcache browser result.
- **Native background-tab visibility: NOT PROVEN.** The runner overrides the
  visibility getter and dispatches `visibilitychange` to the actual listener;
  it does not establish native OS/browser hiding or suspension behavior.
- **Pseudo-locale: NOT RUN.** Long catalog names are not localization acceptance.
- This is one headless Chromium run, not cross-browser, real-device, keyboard,
  screen-reader, long-soak, or full accessibility acceptance. Screenshot review
  concerns the supplied images, not a pixel-diff baseline of regenerated images.

## Reproduce

From the repository root, with project dependencies and Python Playwright plus a
compatible Chromium already available:

```sh
pnpm build
python scripts/browser-smoke.py
pnpm test
pnpm typecheck
pnpm build
git diff --check
```

The runner binds only `127.0.0.1:4173` with `--strictPort`; that port must be free.
It starts its own production preview and terminates that process group and its
browser on completion/failure. It does not terminate unrelated servers.
`BROWSER_QA_OUT` overrides the artifact directory (default:
`tempfile.gettempdir()/godville-browser-qa`, honoring `TMPDIR`);
`CHROMIUM_PATH` overrides the executable (default: Playwright-managed Chromium).
Use an output directory outside version control. To preserve logs and exit status:

```sh
export BROWSER_QA_OUT="${TMPDIR:-$HOME/.cache}/godville-browser-qa"
mkdir -p "$BROWSER_QA_OUT"
# Optional: export CHROMIUM_PATH=/path/to/compatible/chrome
python scripts/browser-smoke.py > "$BROWSER_QA_OUT/run.log" 2>&1
status=$?
printf 'Browser smoke exit: %s\n' "$status"
# In a CI shell, finish with: exit "$status"
```

On the QA host, `python` was
`/opt/agents/playwright/venv/bin/python`, `CHROMIUM_PATH` was
`/home/tyler/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`, and the
project toolchain was prepended with
`PATH=/home/tyler/.local/share/godville-toolchain/bin:$PATH`.
No package installation or user-save reset was required.
