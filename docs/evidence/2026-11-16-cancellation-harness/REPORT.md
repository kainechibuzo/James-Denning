# Offline cancellation evidence harness — local results

## Scope and decision

**Implemented and tested locally. No staging test was executed, no release was approved, and atomic cancellation remains disabled.**

- Branch: `arena/18f85510-james-denning`.
- Base: `f760b8bf8e80e2c1ede779e45e0f213164d58eb8` (merged PR #94).
- The owner requested continuing local work. The standing no-provisioning/no-billable-infrastructure restriction is unchanged.
- No cloud resources, SQL migrations, backend functions, release configuration, credentials or production records were changed. The application runtime, candidate cancellation SQL and both legacy release constants are unchanged in this slice.
- Overall acceptance remains **0/9**, with no checklist item newly verified. Source hashes identify this tested working-tree change; this is not a deployed source attestation.

## What was built

### Offline command-line harness

`scripts/jd-cancellation-acceptance.mjs` supports only `--init DIRECTORY` and `--check DIRECTORY`.

- Initialization prepares a fresh source-identified, entirely **not-run** register: 18 observation cases and eight live-review gates. Existing evidence directories cannot be overwritten.
- Checking verifies source SHA/file hashes and clean-tree identity, required case coverage, relative regular-file paths, evidence hashes and per-file bounds. Production/legacy target refs, source/environment mismatches, missing cases, duplicate IDs, partial data and untrusted `passed` flags cannot yield a ready result.
- Local or unconfigured observations always remain **blocked**. A staging-labelled, internally consistent bundle can at most be **ready-for-independent-review**. Both `liveAcceptanceVerified` and `productionApproved` are always false.
- There is no network, auth, SQL, deployment or approval-variable API. The tool only reads local evidence and invokes read-only git identity/status commands. Raw observations and arbitrary error details are not echoed into its result.

### Executable persisted-record assertions

`scripts/lib/jd-cancellation-evidence.mjs` checks positive cancellation, role/tenant denial, missing session, stale microsecond version, rollback, duplicate replay, running/terminal states and incompatible client/backend releases.

Successful cancellation requires matching job/run changes, advanced version/completion timestamps, one correctly scoped audit, a matching receipt, and preservation of prior results, steps, checkpoints, queue identity and unrelated rows. Denials/failures require unchanged before/after snapshots with an actual target fixture; empty-table isolation is not a pass.

The existing PGlite tests now call the same assertions against **actual repository SQL** for owner queued cancellation, admin retry-wait cancellation and forced audit rollback. Synthetic observation tests separately perturb receipts, records, roles, hashes, timestamps, fixture coverage and paths to ensure rejection.

### Collection procedure

[The operator guide](../../../documentation/JD_CANCELLATION_ACCEPTANCE.md) documents schema, commands, result meanings, safe fixture collection, evidence attachment hashing, preserved failures and independent review requirements. [The release procedure](../../../documentation/JD_CANCELLATION_RELEASE.md) links the harness without weakening any deployment gate.

## Validation results

| Suite/check | Result | Artifact |
|---|---|---|
| Execution, including evidence harness | **276 passed** (113 new harness tests; existing 163 retained) | `execution.log` |
| Backend compatibility/release gates | 81 passed | `backend-release.log` |
| Operational tasks | 250 passed | `tasks.log` |
| Capabilities | 58 passed | `capabilities.log` |
| Navigation/identity | 106 passed | `navigation.log` |
| History | 23 passed | `history.log` |
| Checklist | 13 passed; 222 entries, 0 verified | `checklist.log` |
| Verification guards | 43 checks passed | `guards.log` |
| Web verification, mobile and default builds | Passed | `verify-web.log`, `build-mobile.log`, `build.log` |
| npm audit | 0 reported vulnerabilities | `audit.log` |

Total: **807 Node tests and 43 guard checks passed.** Logs are local, with whitespace/terminal escapes normalized. Build size warnings remain nonblocking. No new remote CI, browser-layout or Edge type-check result is claimed for this slice; runtime/UI/SQL files were not changed.

### Persisted outputs and expected blocked result

- `committed-cancellation.json`: actual local PGlite job/run/audit receipt and records (synthetic fixtures only).
- `audit-failure-rollback.json`: equal before/after persisted snapshots after intentionally forced SQLSTATE `23514`; this is the expected tested failure, not a passing live operation.
- `unexecuted-plan.json`: actual CLI-generated register. Environment unconfigured, every case/gate not-run; dirty working-tree identity is explicitly retained rather than misrepresented as the base commit's clean source.
- `unexecuted-check.json`: actual CLI result, **blocked**, 28 issues (18 cases + eight review gates + dirty-source + no staging); `productionApproved: false` and `liveAcceptanceVerified: false`. Exit **2** was expected and observed.
- `harness-init.log`: confirms no requests were sent or approvals granted.

All executed local validation commands above passed. Deliberately inconsistent fixtures were rejected as expected. The blocked CLI check is a safety result, **not** evidence that staging tests ran or that a business acceptance criterion passed.

## Remaining gaps and honesty boundaries

This is an **offline evidence consistency harness**, not an authenticated staging runner or an evidence-signing service. Files and their source/project labels can be fabricated; hashes establish byte consistency, not authenticity. Manually recorded gates receive presence/integrity checks, not automatic judgment of their claimed outcomes. The operator/owner must independently review real deployed/session/queue evidence.

Outstanding live gates: genuine isolated project and migration/schema/dependency review; real JWT/PostgREST/RLS sessions/grants; simultaneous PostgreSQL claim/cancel and profile-change tests; real pgmq delivery/redelivery; scoped fault injection; lost HTTP acknowledgements/new-session audit read-back; full state/version matrix; emergency disable and in-flight reconciliation. These were not performed here.

No credentials or real customer data are required for local tests. The harness is not a comprehensive secret scanner; only redacted synthetic-fixture evidence should be collected. Selected source hashes are not a full remote dependency lock. Legacy shipping cancellation remains nontransactional; this tool does not enable the checked path or undo external effects.

## Next step

Owner review of these local results. Continue to require separate permission before any staging provisioning or write/deployment, then collect source-identified live observations under the documented procedure. Explicit owner approval of the tested release remains required before production. No scorecard progress is inferred from building the harness.
