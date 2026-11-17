# Atomic cancellation — local evidence for owner review

## Decision and scope

**Local implementation complete for this bounded cancellation candidate. Production release is blocked and not approved. Final acceptance remains 0/9.**

- Branch: `arena/dd44efbe-james-denning`.
- Base: `b6f4734f0095d0eeb32debac9e9713d267d3e00e` (merged PR #93).
- Both cancellation release constants remain **legacy**. Checked cancellation is disabled in shipping source; this report does not claim to have repaired deployed legacy cancellation.
- The owner chose local work only, no billable infrastructure, and owner review of evidence before production approval. No cloud provisioning, migration/function deployment, workflow dispatch, approval-variable change or production-record mutation was performed for this candidate.
- No staging environment was established. Earlier discovery found no identifiable JD staging project/branch and no required Supabase release environments; GitHub Actions variables were inaccessible (403). Those are unresolved gates, not proof of absent variables.
- Source hashes in `SOURCE_SHA256SUMS.txt` identify the tested working-tree candidate; the base commit alone does not identify these uncommitted changes. This report uses the session assessment date, not an inferred provider deployment timestamp.

## What changed

1. **Transactional SQL cancellation**: same-tenant owner/admin authority, profile/job/run locks, observed run/version preconditions, queued/waiting-only eligibility, and atomic job/run/audit persistence. Failed run/audit writes roll back all changes. Service-only execute privileges and an emergency revoke-only rollback are included.
2. **Explicit backend release routing**: legacy compatibility preserved; checked mode calls the RPC without fallback. Authenticated actor identity cannot be overwritten by request-body fields. Missing or malformed receipts remain failures.
3. **Checked client/controller**: sends the observed microsecond timestamp unchanged, validates job/run/audit receipt identities, and reconciles matching persisted job/run cancellation and job version. Lost acknowledgements require refresh; no automatic retry.
4. **Compatibility release guard**: the existing narrow artifact planner now rejects either cancellation constant switching early. SQL is still excluded. A separately approved release-plan change is required to activate the candidate.
5. **Tests and persisted local evidence**: the execution suite now includes actual repository SQL, checked handler/client integration and actual transformed HTTP-route tests. CI already runs `test:execution`, so the added suite is included without new infrastructure.

Prior completed steps, checkpoints, results, attempt counts and queue-message IDs are retained. **No prior external effect is reversed.** Running jobs (even with expired leases), terminal run outcomes and approval waits cannot be cancelled through this contract.

## Test results

| Check | Result | Artifact |
|---|---|---|
| Backend compatibility / release planning | 81 passed | `backend-release.log` |
| Operational tasks | 250 passed | `tasks.log` |
| Execution | 163 passed, including 62 candidate tests and 25 HTTP-route tests | `execution.log` |
| Capabilities | 58 passed | `capabilities.log` |
| Navigation / identity | 106 passed | `navigation.log` |
| History | 23 passed | `history.log` |
| Checklist | 13 passed; 222 entries, 0 verified | `checklist.log` |
| Verification guards | 43 checks passed | `guards.log` |
| Chromium ChatHome layout | Six viewport cases passed | `layout.log` |
| Web verification, mobile and default builds | Passed | `verify-web.log`, `build-mobile.log`, `build.log` |
| Deno check of changed `jd-automation` entrypoint | Passed | `deno-automation.log` |
| npm audit | 0 reported vulnerabilities | `audit.log` |

Total: **694 Node tests, 43 guard checks and six Chromium layout cases passed.** These are local checks, not remote CI or live acceptance. The browser suite covers existing ChatHome layout, not a real-device or deployed checked-cancellation interaction. Build chunk-size and dependency deprecation warnings remain nonblocking; the npm audit result is not a full security review.

### SQL and failure evidence

- `committed-cancellation.json`: synthetic persisted job/run/audit records and the returned receipt for an owner cancelling a retry-wait job with a running run summary. Prior result JSON and queue-message ID remain; the unrelated tenant's run stays unchanged.
- `audit-failure-rollback.json`: before/after snapshots match after an intentionally forced audit constraint failure (`23514`). No partial cancellation survives.
- Tests also force a run-update failure; check duplicate replay, stale microsecond versions, disallowed roles, service-only grants, cross-tenant run corruption, terminal states, profile demotion, expired leases, retained completed steps/checkpoints and revoke/reapply.
- The actual repository worker-claim function is tested sequentially: cancellation first prevents claim; claim first prevents cancellation. **This is not a multi-connection race/locking test.**
- Handler/controller tests cover missing RPC, transport failure, malformed receipts, no unchecked fallback, forged identity fields, lost acknowledgement with refresh recovery, and mismatched version read-back. Authentication is synthetic.

### Encountered failure and resolution

The first browser setup attempt could not import the temporary Chromium package using a CommonJS package-directory path. Chromium had not been extracted, and the layout check failed because `/tmp/chromium` was absent (`layout-setup-failure.log`). Imported the package's ESM entrypoint explicitly and extracted its supporting libraries; the subsequent six viewport cases passed. No application patch was needed for that tooling failure.

## Not established / release blockers

- No real isolated Supabase migration, pgmq redelivery, authenticated lifecycle, deployed JWT/PostgREST/RLS or multi-session locking verification.
- No live worker-timeout correlation, real provider compensation or general running-job cancellation.
- No new-session audit persistence acceptance by the owner; local persisted snapshots are synthetic fixtures, not production records.
- No full dependency/CSP/secret review. Runtime remote dependency resolution is not locked by the existing source artifact.
- No deployment approval, protected release-environment configuration or production release. No checklist item is marked verified by this work.
- Legacy cancellation remains separate writes and does not acknowledge a transactional audit receipt. Do not claim the shipping application now has atomic cancellation.
- The broader department workflows, hiring/publication approvals, NaijaHaul critical readiness and remaining phase acceptance gates are unchanged.

## Owner review requested

Review the candidate, logs, synthetic before/after records and limitations using [the staged cancellation procedure](../../../documentation/JD_CANCELLATION_RELEASE.md). The next external step is permission and configuration for **genuinely isolated staging**, followed by recorded lifecycle/concurrency tests and explicit owner review of the tested release. No infrastructure cost or production approval is inferred from accepting this local report.
