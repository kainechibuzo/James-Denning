# Atomic execution cancellation — staged candidate

**Status: locally tested, disabled, not deployed or accepted.** The owner requested local-only work, no billable infrastructure, and evidence review before production approval. This document does not grant approval. Do not use production or an unrelated project as staging.

## Contract and boundaries

The candidate migration is `supabase/migrations/20261117220000_jd_atomic_execution_cancel.sql`. Its version sorts after the existing staged repairs; it is not an assertion that a deployment occurred at that timestamp.

`jd_cancel_execution_job_checked(actor, job, expected_run, expected_updated_at)`:

1. Rechecks the actor's owner/admin profile in SQL under a shared row lock. Only the service role has execute permission; the authenticated HTTP handler supplies the actor, not the request body.
2. Locks the tenant-scoped job, then its same-tenant run, in worker-claim/retry lock order. Requires the observed run ID and exact job `updated_at` timestamp, including microseconds.
3. Allows only `queued` or `retry_wait` jobs. Running jobs, including expired leases, are not supported by this cancellation contract. The job schema forbids active lease fields on non-running jobs.
4. Allows run summaries `queued`, `planning` or `running`. A waiting retry can retain the prior attempt's running summary; the locked job ledger is the ownership authority. Approval waits and terminal summaries are not overwritten.
5. Changes job and run to `cancelled`, advances their timestamp, and inserts `execution.cancelled` in **one transaction**. A run or audit write failure rolls the entire transaction back. Returns both identities, an audit ID and `externalEffectsReversed: false` only after successful SQL execution.

Completed steps, checkpoints, attempt counts, prior result JSON and queue-message IDs are retained. **Cancellation does not undo emails, payments, documents or other prior external effects.** Queue messages remain hints; the actual worker claim refuses a cancelled job. Real pgmq redelivery/cleanup still requires staging acceptance. This does not add running cancellation, compensation, or global executor audit completeness.

## Explicit release gates

- Frontend: `EXECUTION_CANCELLATION_RELEASE = 'legacy'` in `src/chat/execution-monitor.mjs`.
- Backend: `BACKEND_CANCELLATION_RELEASE = 'legacy'` in `supabase/functions/_shared/jd-execution-cancellation.mjs`.
- Legacy accepts `execution.job.cancel`; checked accepts `execution.job.cancel_checked` with `jobId`, `expectedRunId`, and `expectedUpdatedAt`.
- The caller cannot switch the backend with JSON flags. Checked requests in legacy mode, and legacy requests in checked mode, receive 409. The server never manufactures a fresh expected version for an old caller.
- Missing RPC, transport errors, permission denials, stale versions and malformed acknowledgements never trigger an unchecked fallback.
- The checked client reconciles job/run cancellation and the receipt's exact job version. An uncertain response blocks additional writes until refresh. A transactional audit receipt is not independent business-outcome verification.

**Shipping legacy cancellation is still nontransactional.** Its separate job/run/audit writes and lack of audit acknowledgement are preserved for compatibility; this candidate does not repair the currently deployed backend. Existing UI language continues to disclose that limitation.

The existing [backend compatibility release planner](JD_BACKEND_RELEASE.md) now rejects an early cancellation mode switch in either source. Its artifact excludes SQL. Enabling checked cancellation requires a **separate reviewed release-plan change**; do not weaken the current guard ad hoc or deploy all pending migrations.

## Required isolated-staging evidence — not yet executed

Before any production proposal:

1. Obtain permission for genuinely isolated infrastructure and synthetic tenants; current authorisation is local-only. Reconcile deployed migration history and constraints against this repository. Never run a blind `db push --include-all`.
2. Independently review the migration, service-only grants, trigger/policy differences, and exact source/dependency identities. Approve only the specific staging changes. Retain pre-change schema and release metadata.
3. Apply the candidate SQL in staging only. Deploy a separately reviewed checked backend/client candidate. Test the mismatched client/backend matrix; older cached clients must fail closed, not silently downgrade. Do not equate staging permission with production approval.
4. Authenticate real owner/admin, manager, staff and outsider sessions. Exercise missing/expired sessions, forged identities, cross-tenant jobs/runs, role revocation, stale microsecond versions, all job/run states, and RPC grants via deployed JWT/PostgREST/RLS.
5. Use separate PostgreSQL sessions to overlap worker claim and cancellation, both lock orderings, role changes and repeated requests. Include lock waits, timeouts, deadlocks, real pgmq delivery/redelivery and exhausted retries. The local tests cover sequential orderings, **not concurrent sessions**.
6. Force run/audit-write failures in the isolated fixture. Capture before/after job, run, steps, audit rows, real queue state, request IDs and worker logs. Confirm rollback and exactly one cancellation audit for a successful request. Lose the HTTP acknowledgement; refresh and start a new session without issuing a duplicate cancellation.
7. Rehearse an emergency disable with the rollback SQL, then explicit reviewed reapplication. Revocation blocks later calls but cannot recall an already-authorised in-flight transaction. Reconcile in-flight work before declaring the service stopped. Preserve prior cancellation/audit evidence.
8. Present expected/actual results and every failure to the owner. **Production approval remains absent until the owner explicitly approves the tested, source-identified release.** Independent review, release protections and same-source staging evidence are still required.

## Emergency disable boundaries

`supabase/rollback/20261117220000_jd_atomic_execution_cancel.rollback.sql` revokes execute access, including service role, without deleting records. Coordinate an approved release that disables cancellation controls; do not automatically fall back to the weaker legacy write path. Revocation does not reverse committed cancellations or external effects. Re-enabling requires a reviewed reapplication and fresh tests.

## Offline acceptance-evidence preparation

The [offline evidence harness](JD_CANCELLATION_ACCEPTANCE.md) prepares 18 not-run observation cases and eight independent live-review gates, then checks source identities, artifact hashes and persisted-record invariants. It does not execute staging tests. Local simulation remains blocked even if every record assertion passes; no result authorises production or enables the feature.

## Reproduce local evidence

```sh
npm ci
npm run test:execution
npm run test:backend-release
```

To retain synthetic PostgreSQL snapshots alongside the test log:

```sh
JD_CANCELLATION_EVIDENCE_DIR=docs/evidence/2026-11-16-atomic-cancellation \
  npm run test:execution
```

The fixture executes repository run/job/audit/step DDL and the actual candidate RPC in PGlite. Profiles/auth and HTTP sessions are synthetic; no Supabase project, production records, real queue or live JWT infrastructure is involved. See the [local evidence report](../docs/evidence/2026-11-16-atomic-cancellation/REPORT.md).
