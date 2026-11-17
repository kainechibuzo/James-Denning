# Employee usage accounting stage — local evidence

**Result: a durable, default-off shadow usage ledger is implemented and connected to the existing JD worker. The requested five-area product completion is NOT achieved.**

Branch: `arena/b917fb74-james-denning`

Base: `618941faedc560e27a0cec358324a898f3da3e1c` (merged PR #102).

This stage follows the standing local-only/no-new-billable-infrastructure and independent-release-review restrictions. No hosted database writes, migration application, deployment, real provider request, hiring, invoice, charge, catalogue publication or production approval occurred. No commit, push or PR was performed during this implementation pass.

## Implemented and exercised

- Candidate SQL account/reservation/event ledger linked to **existing execution jobs**, not a new queue.
- Explicit administrator shadow-policy confirmation, bounded budgets and atomic reservations. One open reservation per tenant/subject reference. References are explicitly unverified labels, not hired employees.
- Private service-only mutation RPCs; direct anonymous/authenticated access denied. Actor/tenant derived from authenticated identity and rechecked in SQL. Service role cannot directly mutate ledger tables.
- Existing worker instrumentation behind `JD_USAGE_SHADOW_ENABLED=true`, default off. Unreserved jobs remain unmetered, even with the flag on.
- Server-timestamped phase observations fenced by existing live job leases and expected sequence, with exact replay receipts and no caller-supplied time/cost.
- Entire model requests/streaming/retries, tool batches, memory and checkpoint waits excluded from active estimates. Idle, queued, paused and approval-wait time does not accrue.
- Bounded active deadlines; stale/replaced leases, missed deadlines and ambiguous acknowledgements stop further measured work at phase boundaries. Unconfirmed active time is not reconstructed or charged.
- Append-only events plus atomic existing audit entries; terminal orphan reconciliation and derived-counter drift detection.
- Empty-schema rollback/reapply; populated rollback refuses evidence loss.
- API routes, CI tests and shared/nested backend packaging assertions. No UI changes or actual billing integration.

## Actual validation

| Suite | Result | Evidence |
|---|---:|---|
| `npm run test:usage` | **104 passed** | `test-usage.log` |
| `npm run test:foundation` | 91 passed | `test-foundation.log` |
| `npm run test:agents` | 63 passed | `test-agents.log` |
| `npm run test:settings` | 57 passed | `test-settings.log` |
| `npm run test:capabilities` | 58 passed | `test-capabilities.log` |
| `npm run test:execution` | 276 passed | `test-execution.log` |
| `npm run test:tasks` | 250 passed | `test-tasks.log` |
| `npm run test:navigation` | 106 passed | `test-navigation.log` |
| `npm run test:history` | 23 passed | `test-history.log` |
| `npm run test:backend-release` | 82 passed | `test-backend-release.log` |
| `npm run test:checklist` | 13 passed; no live acceptance advanced | `test-checklist.log` |
| **Node total** | **1,123 passed, 0 failed** | Above logs |
| `npm run test:guards` | 43 checks passed | `test-guards.log` |
| Deno runtime + worker-helper tests | 11 passed | `deno-tests.log` |
| Packaged automation / worker / MCP Deno checks | Passed | `deno-check.log` |
| `npm run verify:web` | Passed | `verify-web.log` |
| `npm run build:mobile` | Passed | `build-mobile.log` |
| `npm run build` | Passed | `build.log` |
| `npm audit --audit-level=high` | 0 vulnerabilities reported | `npm-audit.log` |

Environment: Node 22.22.3; Deno 2.9.6 / TypeScript 6.0.3; npm dependencies from the existing lockfile. Deno checks used `--no-lock --node-modules-dir=none` and the existing release collector's actual nested worker layout. This was a local typecheck staging directory, not a source-approved deployment artifact.

Browser checks were **not rerun** in this stage; no browser/UI code changed. Existing React UI suites did run as part of the Node regressions. Earlier PR evidence is not presented as fresh browser acceptance. Existing large-chunk/module-type warnings remain.

## Persisted evidence and what it proves

- `synthetic-ledger.json`: actual PGlite records from shadow consent -> reservation -> server observation -> excluded wait -> settlement -> audit/snapshot reconciliation.
- `runtime-ledger.json`: actual existing `runAgent` + `runWithShadowUsage` + real SQL RPCs with a synthetic streamed provider response. The provider stub checks that the ledger is in `external_wait` and deliberately simulates a long excluded wait. Final confirmed estimates and audit receipts are persisted.
- `reopened-ledger.json`: **on-disk** PGlite account, reservation and active/closed observation records survive database close/reopen. Replaying both configuration and closing observation after reopen returns the original receipts without duplicate events or accrual.

These are synthetic records, not customer records or actual employee work. Some duration tests adjust timestamps using the test database owner to exercise time boundaries deterministically; the exposed RPCs do not accept those timestamps, and direct service-role table mutation is tested as denied.

Tests cover budget exhaustion and combined reservations; negative/oversized/fractional inputs; replay collisions across actions; wrong actor/tenant/role; private lease token redaction; stale sequences; expired/replaced leases; role revocation; deadline expiry; terminal reconciliation; audit-transaction rollback; immutable event mutation denial; drift reporting; unsupported browser metering/charging actions; disabled/unreserved worker compatibility; ambiguous transport receipts; parallel phase handling; and no provider/tool invocation after meter denial.

**Not proved:** real Supabase JWT/PostgREST boundaries, hosted concurrent locking/queue redelivery, crash/power-loss durability, production migration compatibility, provider timings/costs, hard process preemption, employee quality or live billing acceptance. PGlite auth is synthetic and most SQL tests are sequential. The reopened database test is a clean close/reopen, not a crash recovery test.

## Failures retained and corrected

1. Initial test invocation could not resolve PGlite because restored ephemeral dependencies were absent. `npm ci` restored the lockfile dependencies. Log: `dependency-setup-failure.log`.
2. The first SQL fixture omitted existing `jd_automation_runs.request_text`, causing all 32 initial SQL tests to fail in setup. The fixture now supplies the required synthetic request; it does not weaken the production constraint. Log: `fixture-initial-failure.log`.
3. Initial staged Deno parsing found an incorrectly closed nested `runAgent` callback in the worker wrapper. Corrected the callback/object closure and added an executable worker-entrypoint parsing regression. Final staged checks pass. Log: `deno-initial-failure.log`.

All failures remain recorded; they are not production incidents and were not hidden as successful checks.

## Scope limits and unresolved requested work

| Requested outcome | Actual status |
|---|---|
| 400+ evaluated employees | **Not delivered.** Still 16 draft definitions, zero operationally evaluated/hireable. No generated profile padding or fake evaluations. |
| Actual employee execution | **Not delivered.** Existing JD jobs gained explicit shadow instrumentation; no hired-definition binding, new isolated runner or evaluated employee lifecycle. |
| Activated generated workspaces | **Not delivered.** Reviewed module blueprints remain proposals, not activated generated CRUD/navigation. |
| End-to-end SaaS deployment | **Not delivered.** No generated repository/build/deploy pipeline or customer preview deployment was completed. |
| Durable usage billing | **Partial: shadow ledger only.** Durable accounts, reservations, observations, estimates and reconciliation now exist; no final invoice ledger/payment/dispute/retry-credit policy or actual charge. |

Normal platform subscriptions remain unchanged; proposed employee usage is additional. Provider/tool waits are conservatively excluded in this shadow instrumentation; this is not a validated commercial definition of active employee compute time. Observational network/DB overhead may affect the estimate. Budget deadlines stop accounting/new work at cooperative phase boundaries, not arbitrary processes already in flight.

The flag must not be enabled merely because tests pass. Enabling it requires a separately reviewed migration/backend deployment in isolated staging; disabling it is not an execution cancellation. Foreign-key retention also requires a reviewed tenant/user deletion policy before live release. No production checklist item or owner approval was changed.

See [implementation, API, safety limitations and remaining delivery sequence](../../../documentation/JD_EMPLOYEE_USAGE_LEDGER.md). Source/artifact SHA-256 manifests identify the tested local files; they do not attest a deployed revision.
