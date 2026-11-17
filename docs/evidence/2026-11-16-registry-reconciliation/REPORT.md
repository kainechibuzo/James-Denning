# Registry branch reconciled with updated master

## Inputs and resolution

- Session branch: `arena/f4e67afd-james-denning` (never switched or renamed).
- Original base: `753971562cab3c0b2d4bff303cc6dca27b88826f`.
- Registry work preserved as checkpoint commit: `1d01e17573b7c86e0668d736978156415699c9cd`.
- Incoming default branch: `master`, commit `c1f13917fbec41ee50f4c42419c80b63176dbb59`.
- Incoming work includes PR #104 deployment/checklist evidence and PR #105 legacy school-portal removal.

The first merge attempt could not establish ancestry because both ends were shallow grafts. Fetching 50 more commits established the original base as the common ancestor. No unrelated-history override, reset, rebase or force push was used.

One text conflict occurred, in `README.md`. Resolution retains the new concise business-platform README and adds the registry documentation/test links. The package scripts and both CI workflows merged automatically: new registry tests remain, removed legacy tests/functions remain removed, and the upstream dependency removal is preserved.

`upstream-preservation.txt` verifies **92 upstream-only paths byte-for-byte (or absent when deleted)**. The four combined paths are README, package.json, ci.yml and verify.yml. No retired portal page, mobile school app, legacy login endpoint or fee-payment endpoint was restored. Legacy database identifiers remain unchanged, consistent with `docs/LEGACY_SCHEMA.md`.

The incoming checklist/evidence records are preserved exactly; this reconciliation did not perform new live deployment verification or independently approve those records. The registry remains release-gated, with no hiring, tool grants or charges enabled.

## Post-merge validation

| Check | Result |
|---|---|
| `npm ci` with incoming lockfile | Passed; 0 vulnerabilities reported |
| Registry tests | 92 passed |
| Usage tests | 104 passed |
| Foundation tests | 91 passed |
| Agent Studio tests | 63 passed |
| Settings tests | 51 passed |
| Capability tests | 58 passed |
| Execution tests | 276 passed |
| Task tests | 250 passed |
| Navigation tests | 79 passed |
| History tests | 23 passed |
| Backend release tests | 82 passed |
| Checklist tests | 13 passed |
| **Node total** | **1,182 passed, 0 failed** |
| Verification guards | 43 passed |
| Full Chromium layout command | 22 viewport flows passed |
| Web verification, mobile build, default build | All three passed |
| `npm audit --audit-level=high` | 0 vulnerabilities reported |
| Staged automation/worker/MCP type checks, cached/non-frozen mode | Passed |
| Additional account/auth Deno checks | Blocked fetching `deno.land` imports (TLS handshake EOF) |
| Frozen Deno backend lock verification | Failed: incoming `deno.lock` lacks backend dependency entries |

Logs for each command are retained here. The Node count is 33 lower than the pre-merge 1,215 because upstream retired six settings and 27 navigation tests with the school portal. Our 92 registry tests remain intact. No tests were removed or weakened to resolve this merge.

The browser run covers six chat, four settings, four Agent Studio, four Business Foundation and four registry viewport flows. It uses local components with synthetic services, not the deployed site. Existing large-chunk/module-type warnings remain.

### Deno limitations retained, not hidden

- `deno-check-network-blocked.log`: attempted the three staged backend entrypoints plus updated `manage-account`, with the incoming frozen lockfile. It stopped fetching `https://deno.land/std@0.168.0/http/server.ts`.
- `deno-auth.log`: updated pre-auth retirement/auth contract could not fetch the standard assertion library from `deno.land`.
- `deno-frozen-lock-incomplete.log`: the separate three-entrypoint frozen check identified missing backend dependencies in the incoming lockfile. That lockfile is preserved byte-for-byte; no dependency upgrade or lockfile rewrite was silently applied.
- `deno-check.log`: the same three staged backend entrypoints passed with `--cached-only --no-lock --node-modules-dir=none`. This establishes local typecheck success, **not frozen dependency reproducibility**. The updated account/auth checks still need a network-capable CI run.

Full merge whitespace checking also reports two extra EOF blank lines already present upstream (`src/components/ui.jsx`, `src/services/email/index.js`). They were preserved rather than modifying unrelated user files; the registry diff against incoming master passes whitespace checks. See `upstream-whitespace-warnings.log`.

## Evidence identity and remaining gates

The original registry report/hash manifests describe the pre-reconciliation checkpoint and were not rewritten. Their source hashes were verified against `1d01e17` using Git object content. They are historical evidence, not a claim that every original hash still matches the merged working tree.

The new source manifest identifies the existing changed files from both inputs, and `DELETED_PATHS.txt` records preserved upstream deletions. Artifact hashes cover these new logs and the reconciliation report.

No push, PR creation, main-branch write, deployment, migration application, provider request or production approval was performed for this reconciliation. Independent staging/release gates and the distinction between contract checks and operational employee evaluations remain unchanged.

## Pre-publication push-protection cleanup

The first push was rejected because historical negative-test titles printed a synthetic credential-shaped value. Both unpublished commits were recreated with redacted logs, safe test case labels and refreshed manifests while preserving the merge topology and all upstream files. No actual credential was used and no scanner bypass was requested. The post-cleanup registry suite passed all 92 tests (`test-registry-sanitised.log`). See `PUSH_PROTECTION.md`.
