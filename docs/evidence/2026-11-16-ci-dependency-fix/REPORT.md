# GitHub dependency-audit failure: temporary local security backport

Branch: `arena/6e7c1c96-james-denning`, based on merged `09cac6d`.
The user explicitly selected a local security patch rather than waiting for an upstream release.

## Diagnosis

- Web CI run **44146753553** failed at **Audit npm dependencies**, before application checks; the duplicate branch run **44146717320** reported the same failure.
- Verify application passed for PR head (`44146753416`) and merged master (`44146913076`). It previously did not include an audit step.
- The five high audit findings are one underlying advisory, **GHSA-fc5q-39xc-vjpf / CVE-2026-112366**, propagated through picomatch, fdir, tinyglobby, Vite and its React plugin.
- At inspection, npm's latest picomatch was **4.0.7**, the advisory covered **<=4.0.7**, and no first patched version was listed.
- Tested npm's suggested Vite 6.2.7 / React plugin 5.2.0 downgrade in an ignored isolated directory. It exposed other high and moderate Vite vulnerabilities, so it was rejected. No Vite/plugin downgrade or lockfile-wide refresh was applied.

## Change

Vendor upstream picomatch 4.0.7 with a narrowly scoped repeated-wildcard guard in `lib/parse.js`. An unsafe `+(...)` or `*(...)` body is handled by the existing literalization mechanism rather than emitting nested unbounded regex quantifiers. The added guard is independent of the caller's recursion-depth opt-out. See `vendor/picomatch/SECURITY.md`, `PATCH.diff`, `LICENSE`, and `PROVENANCE.json` for semantics, source integrity and the removal plan.

A root local devDependency and `$picomatch` override route all installed Vite/tinyglobby/fdir consumers to this copy. `.npmrc` packs local file dependencies consistently (`install-links=true`); it does not disable security or script execution. A clean `npm ci` was tested.

Both workflows now verify installed patch hashes, transitive resolution and bounded regression payloads **before** running `npm audit --audit-level=high`. Web CI also watches vendor/config changes. Verify application gains the same audit gate so master pushes cannot silently skip it. No audit allowlist, `--omit=dev`, downgraded severity threshold or continue-on-error was added.

## Local results

| Check | Result | Evidence |
|---|---|---|
| Clean npm ci | Passed | `npm-ci.log` |
| Local dependency security tests | **22 passed** | `dependency-security.log` |
| Advisory reproduction against upstream | Timed out after 1,500 ms; child forcibly killed | `advisory-reproduction.log` |
| Same payload against patch | Rejected in 29 ms including process startup | `advisory-reproduction.log` |
| npm audit --audit-level=high | Passed, 0 registry findings | `audit-gate.log`, `audit-after.json` |
| Dependency resolution | All consumers use one local copy | `resolution.log` |
| Application Node regression | **1,182 passed** | `node-regression.log` |
| Fail-closed verification guards | **43 passed** | `node-regression.log` |
| Browser/layout regression | **193 passed** | `browser-regression.log` |
| Web verification/default/mobile builds | Passed | build logs |
| Unmodified upstream suite, original implementation | **1,983 passed** | `upstream-baseline.log` |
| Unmodified upstream suite, patched implementation | **1,979 passed, 4 failed intentionally** | `upstream-compatibility.log` |

The four upstream failures expect unsafe wildcard-repeat behavior that this conservative backport deliberately removes: `+(*)c` (two cases), `*(a*|b)`, and `*/*(W*, *)*`. They were not skipped, edited or represented as passing. Application tests and ordinary Vite glob compatibility checks pass. The upstream suite was obtained from tag `4.0.7` in an ignored temporary directory; its test dependencies are not application dependencies.

## Security and acceptance boundary

**Zero npm audit findings does not mean upstream has fixed the advisory.** npm does not independently assess this local backport. The dedicated regression/integrity gate, published patch and maintainer review are required alongside the registry audit. This is not a proof that all possible regex-complexity problems are eliminated. Repository maintainers own the temporary patch until a tested fixed upstream release replaces it.

Existing Vite config-format and large spreadsheet-chunk warnings remain nonfatal. Application backend and production services were not changed or exercised. Remote verification of the new branch is recorded separately after push; do not confuse prior master/PR verification with this patch's CI result. No merge or production acceptance is authorised by this record.

## Remote verification after push

**Web CI passed** on code commit `c329b70b8f88f61f4bdf74e87f39392c5f13378e`:
https://github.com/kainechibuzo/James-Denning/actions/runs/44148979914

The complete job finished successfully in 3m35s, including clean installation, local-patch security tests, the unchanged registry audit, all application/browser tests, web/mobile builds, Deno tests and secured Edge Function type-checks. `github-verification-after.json` retains the GitHub job/step results. This evidence-only follow-up does not change tested code.

Non-failing runner annotations note Node 20 action-runtime deprecation (`checkout@v4`, `setup-node@v4`, forced to run on Node 24) and the Ubuntu-latest image migration. They are not the original audit failure and were not suppressed. No new PR, merge, production deployment or production acceptance was performed in this task. The separate Verify application workflow's added audit gate will run when a PR is opened or the patch reaches master; its prior successful runs do not certify the new gate.
