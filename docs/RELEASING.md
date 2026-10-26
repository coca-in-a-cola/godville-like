# Release and Pages runbook

## Owner-controlled remote setup

This repository uses `develop`; do not create or modify `main`. The workflow is
**CI and GitHub Pages** (`.github/workflows/pages.yml`), triggered by pushes to
`develop` and manual `workflow_dispatch`. Manual dispatch on other branches checks
and packages but does not deploy. There is no automatic tag/release publication.

The owner must create the Pages site once before deployment (after confirming
`GET /repos/coca-in-a-cola/godville-like/pages` is genuinely 404):

```sh
gh api --method POST repos/coca-in-a-cola/godville-like/pages -f build_type=workflow
gh api repos/coca-in-a-cola/godville-like/pages
```

For an existing site, preserve unrelated settings; change `build_type` to
`workflow` only if needed. Do not set a branch-based source or enablement token
workaround. The workflow explicitly uses `configure-pages` with `enablement:
false`, so the parent creates the site, not a CI token. Check repository Actions
policy and the `github-pages` environment permits `develop`. Build has only
`contents: read`; deploy adds `pages: write` and `id-token: write`. No credential
or host service setup is needed. Workflow concurrency serializes deployments.

All seven action SHAs were resolved with `git ls-remote` against their official
upstream tag refs when this workflow was prepared. Comments identify the major
version; update pins deliberately and verify the new upstream commits.

## Build and delivery gates

```sh
pnpm install --frozen-lockfile
pnpm check
git diff --check
```

Commit accepted source first. Rebuild from a clean full-source checkout, not an
app-only copy. Root build writes `apps/web/dist/build-info.json` with actual Git
HEAD, dirty flag, root version, Node version, declared pnpm version, lockfile hash,
UTC build timestamp and CI repository/run inputs. It rejects a mismatched
`GITHUB_SHA` and dirty CI source; local dirty builds are explicitly marked dirty.
This receipt is not a signature, SLSA attestation or reproducible-build claim.

For a local release candidate, use an output directory **outside** the checkout:

```sh
pnpm build
python3 scripts/package-release.py ../godville-release
(cd ../godville-release && sha256sum -c godville-like-0.1.0-alpha.1-dist.zip.sha256)
```

Packaging requires a clean tree and matching clean build commit. It creates a
zip with `index.html`, assets, `.nojekyll` and receipt at its root, plus checksum.
Never commit `node_modules`, `dist`, archives or local evidence. Serve archives
over HTTP(S), not `file://`.

After the owner's normal `develop` push, read back the remote SHA and inspect the
workflow run for that exact SHA. It separately executes frozen install, lint,
typecheck, tests and build. It retains `release-candidate-<full-commit-SHA>` (zip
and checksum) for 14 days and uploads `github-pages` for deployment. Download the
candidate from that run rather than rebuilding a different revision to tag.

```sh
gh run list --workflow pages.yml --branch develop --commit "$BUILT_SHA"
gh run view "$RUN_ID" --exit-status
gh run download "$RUN_ID" -n "release-candidate-$BUILT_SHA" -D ../godville-release
(cd ../godville-release && sha256sum -c godville-like-0.1.0-alpha.1-dist.zip.sha256)
curl --fail --show-error https://coca-in-a-cola.github.io/godville-like/
curl --fail --show-error https://coca-in-a-cola.github.io/godville-like/build-info.json
```

Verify the downloaded zip's receipt and live receipt have `commit == BUILT_SHA`,
`version == 0.1.0-alpha.1`, `dirty == false`, and expected lockfile digest. Confirm
live entry HTML and worker assets load, not just HTTP 200. Remote run/artifact/live
verification is separate from local validation. Check balance and pseudo-locale
gaps remain visible in the release notes.

## Explicit prerelease publication (owner only)

Set `BUILT_SHA` to the verified full commit from the accepted artifact, never an
unreviewed moving branch. Do not replace an existing tag/release. For a local
candidate, the same SHA must match the clean packaging receipt.

```sh
git tag -a v0.1.0-alpha.1 "$BUILT_SHA" -m 'v0.1.0-alpha.1: playable uncalibrated alpha'
git push origin refs/tags/v0.1.0-alpha.1
git ls-remote origin 'refs/tags/v0.1.0-alpha.1*'
# Explicit API booleans; --input JSON avoids provider defaults.
python3 -c 'import json, os; from pathlib import Path; print(json.dumps({"tag_name":"v0.1.0-alpha.1","target_commitish":os.environ["BUILT_SHA"],"name":"v0.1.0-alpha.1 — playable uncalibrated alpha","body":Path("docs/RELEASE_NOTES_v0.1.0-alpha.1.md").read_text(),"draft":False,"prerelease":True,"make_latest":"false"}))' | gh api --method POST repos/coca-in-a-cola/godville-like/releases --input -
gh release upload v0.1.0-alpha.1 ../godville-release/godville-like-0.1.0-alpha.1-dist.zip ../godville-release/godville-like-0.1.0-alpha.1-dist.zip.sha256
gh api repos/coca-in-a-cola/godville-like/releases/tags/v0.1.0-alpha.1
```

Export `BUILT_SHA` before the Python command. Read back the exact release and
annotated tag's peeled commit. Verify `prerelease=true`, `draft=false`, both asset
names/sizes/digests, then download published assets and verify the checksum again.
Record run URL/ID, artifact handle, built SHA, tag object/peeled SHA, release URL
and live receipt. A later documentation-only commit is not the built revision.
