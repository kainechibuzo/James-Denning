# Employee delivery stage: durable shadow usage accounting

## Status and boundaries

This is the **first bounded implementation stage** toward the requested evaluated workforce, employee execution, activated workspaces, Software Factory and usage billing. It does not finish those five product areas. It extends the existing execution queue; it does not introduce a second runner or publish/hire any employees.

Implemented locally: durable shadow accounting, worker instrumentation, an administrator API, candidate migration/rollback, executable database/runtime tests and persisted synthetic evidence. **There are no invoices, actual charges, published employees, new tool permissions or production deployment.** Normal platform subscriptions/payment flows are unchanged.

The existing catalogue still contains **16 draft definitions, 0 operationally evaluated and 0 hireable**. Do not inflate this to 400 using generated names or treat the accounting tests as employee quality evaluations.

[Actual test/evidence report](../docs/evidence/2026-11-16-usage-ledger/REPORT.md).

## Data model

Candidate migration: `supabase/migrations/20261117120000_jd_usage_ledger.sql`.

- `jd_usage_accounts`: one shadow budget per tenant, outstanding reservations, accrued estimates and optimistic configuration version.
- `jd_usage_runs`: exactly one reservation per existing `jd_execution_jobs` entry, explicitly authorised by a tenant owner/admin. Contains worker-private fencing and observation state.
- `jd_usage_events`: append-only requests/receipts for configuration, reservation, observations and terminal reconciliation. Events cannot be updated or deleted, including by the service role. The existing `jd_audit_events` is written in the same transaction as every state transition.

Authenticated/anonymous callers have no direct table or RPC access. The service role has SELECT only on the tables; writes require narrow security-definer functions with an empty search path. Owner/admin identity is checked in SQL, not just hidden in the UI. HTTP dispatch derives the actor from the verified session, never payload actor/tenant fields.

Private lease tokens are never included in administrator snapshots or audit receipts. Worker request receipts are kept in the private event table to permit exact replay. There is no agent/model tool to configure accounting, authorise budgets or submit time.

Foreign keys retain accounting evidence when a parent job/account is deleted. This intentionally means existing destructive tenant/user cleanup may be refused when records exist: a reviewed retention/redaction/deletion policy is required before any live billing release.

## Explicit shadow consent and reservations

`jd-automation` exposes these **administrator-only** actions, gated by `JD_USAGE_SHADOW_ENABLED=true` (default off):

| Action | Inputs in addition to action | Effect |
|---|---|---|
| `usage.snapshot` | None | Sanitised current budget, totals, reconciliation balance and latest 50 reservations |
| `usage.configure` | `confirm:true`, UUID `requestId`, `expectedVersion`, integer `budgetMicros`, policy exactly `employee-active-v1-shadow` | Explicit shadow budget at proposed USD 1/active hour |
| `usage.reserve` | `confirm:true`, UUID `requestId`, UUID `jobId`, `subjectReference`, integer `maxMicros` | Reserve part of the shadow budget for an existing **queued** job |
| `usage.reconcile` | `confirm:true`, UUID `requestId`, UUID `jobId` | Close an open reservation on a **terminal** job, preserving confirmed estimates and flagging unconfirmed time |

Amounts are microdollars (1 USD = 1,000,000 microdollars), not currency converted to NGN and not amounts to send to a payment provider. Limits are USD 1,000,000 per shadow account and USD 1,000 per reservation. These are implementation safety bounds, not platform plan prices or real authorised spending limits.

`subjectReference` is a bounded **unverified reference**, not a catalogue lookup or a hired worker ID. There is at most one open reservation for the same trimmed reference in a tenant, preventing accidental simultaneous accounting for the same label. A different label is not proof of a different real employee. Actual hiring identity binding remains a release prerequisite.

Tenant locking serialises reservation/configuration/observation/reconciliation. `accrued + reserved <= budget` is enforced in SQL. A budget cannot be reduced below existing exposure. Reservations cannot enrol a job after execution starts. They neither enqueue the job nor grant permission to execute it.

There is no accounting dashboard in this stage. Use the API only in separately approved isolated staging. Do not enable a flag against an unapplied migration. No configuration or reservation was created in a hosted environment here.

## Existing worker integration

`jd-execution-worker` wraps `runAgent` in `runWithShadowUsage`:

1. With the flag off, it calls the existing runtime without querying new tables.
2. With the flag on, it looks up the current tenant/job reservation. Unreserved jobs remain unmetered; they are **not silently enrolled**.
3. For an open reservation, it validates a service-only SQL observation under the existing job's current live lease before invoking model/tools.
4. The runtime's optional phase callback records server observation boundaries. Whole model requests (including retries/streaming), memory reads, tool batches and checkpoint writes are `external_wait`, not active time.
5. Local runtime processing between those waits is `active`. The wrapper closes a confirmed estimate after the runtime returns. Existing reply/run/queue persistence follows; usage settlement is **not proof the job ultimately completed**.
6. Accounting failures stop the opted-in runtime before proceeding across the next phase boundary. The existing execution failure/retry mechanism remains; a closed reservation cannot be reused on a retry. New work needs an independently reviewed new job/reservation, not an automatic new budget.

The adapter never submits timestamps, durations or prices. SQL observes `clock_timestamp()` and maintains the cumulative amount. Queued, idle, approval-wait, paused and external-wait phases contribute zero time.

**Important measurement limitation:** this is conservative wall-time shadow instrumentation, not verified CPU time or model-provider compute time. All provider/tool waits are excluded, including any useful compute inside those calls. Network/database latency around observation boundaries can affect the remaining estimate. The commercial meaning of active employee work must be evaluated and independently approved before real metering/invoices. Do not interpret these estimates as payable.

## Fencing, limits and ambiguous outcomes

Each observation includes an existing job ID, live worker lease token, monotonically expected sequence and unique request UUID. SQL locks the job and tenant, rechecks the worker lease/status and current administrator authority, then writes counters, the receipt and audit atomically.

- Same request and same arguments replay the original receipt, even after a lost acknowledgement or database reopen. No second interval or reservation is created.
- Reusing the request for different arguments/action, or a stale sequence, fails closed.
- Unknown or expired leases cannot append observations. A replacement worker cannot confirm an old worker's active interval.
- Each active interval has a deadline: the earliest of 30 seconds, the lease expiry or remaining reservation capacity. Crossing that deadline discards the unconfirmed interval and closes the reservation as `review_required`.
- These are accounting limits and cooperative phase-boundary stops, **not a process sandbox or hard CPU/external-provider cancellation guarantee**. No billable worker may be launched on that assumption.
- Role/tenant revocation is checked again at observation time. A lost or failed acknowledgement blocks new adapter observations. Explicit `retryPending()` replays the exact same request; the production wrapper does not automatically retry uncertain observations.
- Terminal orphan reconciliation never reconstructs unobserved time. It releases the unused reservation, retains already confirmed estimates and marks the result for review.

Estimates use integer microseconds and round up once per job: `ceil(total_confirmed_active_microseconds / 3600)` microdollars at the proposed USD 1/hour. Simultaneous distinct references consume separate reservations. Retries, failures, disputes, credits and invoice rounding are **not commercially approved billing policies**.

Snapshots compare account counters to the complete tenant reservation ledger, not only the displayed latest 50 rows. A mismatch returns `balanced:false`; the API does not hide it by rewriting history.

## Release and recovery

1. Independently review the exact migration, source revision, grants, retention constraints and the pricing/active-time policy. Do not use a blind `db push --include-all` against divergent migration history.
2. Use genuinely separate staging with synthetic data. Keep both API and worker flags off while applying the explicitly reviewed migration.
3. Release `jd-automation`, `jd-execution-worker`, and `jd-mcp` using the existing source-pinned packaging. Shared `.ts` and `.mjs` files must reach the worker's nested `_shared` layout. Deployment packaging does not install SQL.
4. Before enabling shadow mode, verify real authenticated JWT/RLS boundaries, concurrent tenant locking, actual worker delivery/retries/cancellation/lease expiry, database restarts, timing overhead, table retention and migration compatibility. Local sequential PGlite tests are not that acceptance.
5. Explicitly enrol only synthetic test jobs and inspect persisted events, estimates and drift. Ensure no automatic charging, subscription changes or employee publication occurs.
6. Production remains blocked pending independent owner acceptance. A flag alone is not acceptance.

Recovery: stop/review opted-in jobs before disabling the flag. Disabling it does not cancel work: later workers would run without instrumentation. Preserve all usage/audit records and reconcile terminal reservations; do not treat feature-disable as a spending stop. Revert function versions without dropping data. The rollback SQL refuses any populated ledger; an empty schema can be rolled back/reapplied without removing existing jobs or audits.

## Remaining delivery sequence

| Requested area | Current status after this stage | Required implementation/evidence |
|---|---|---|
| 400+ evaluated employees | 16 drafts; zero operationally evaluated | Versioned evaluation corpus and runner; genuine distinct roles; recorded task-quality/tool/security/budget evaluations, failure handling and independent publication review |
| Actual employee execution | Existing JD job runtime now supports explicit shadow observations; no employee hiring/binding | Evaluated-definition-to-hire linkage; owner-approved permission/model/tool bindings; bounded isolated execution; scoped lifecycle/cancellation; artifact verification and real provider acceptance |
| Activated generated workspaces | Still reviewed blueprint proposals | Permissioned schema renderer and CRUD, server-side module/data access, reviewed activation/version rollback and cross-tenant tests |
| End-to-end SaaS deployment | Still design definitions, not generated/deployed SaaS | Isolated repository/build/test/security pipeline; verified artifact previews; customer-specific deployment authority, provider targets, rollback and post-deploy evidence |
| Durable usage billing | Durable **shadow** account/reservation/event records and runtime observations now implemented | Trusted employee identity and active-time policy, commercial failure/retry/credit rules, finalised invoice ledger, payment idempotency, reconciliation, disputes, customer controls and live acceptance |

No employee evaluation, hire, workspace activation, hosted SaaS deployment, invoice or charge is marked completed by these tests. Continue these stages without bypassing the existing local-only/no-billable-infrastructure and independent-release-review constraints.
