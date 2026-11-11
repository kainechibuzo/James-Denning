# JD-004 — Durable Background Execution Design

- **Created (UTC):** 2026-11-11
- **Status:** architecture proposed; JD-004A primitives implemented on a review branch, database verification pending
- **Priority:** critical
- **Target:** Supabase Postgres + Supabase Queues (pgmq) + authenticated JD worker Edge Function

## User outcome

A user can ask JD to perform work that takes longer than one HTTP request. The task remains visible after the chat request ends, continues in the background, survives worker restarts, resumes from persisted checkpoints, and reports a truthful final or partial result.

## Current-state evidence

- The repository has JD conversation, run, step, approval and audit migrations, plus the synchronous agent runtime and bounded provider retries.
- The configured Supabase project has no JD tables and its migration history does not contain the JD migration versions currently in the repository. The JD automation Edge Function is not a verified deployed capability.
- The project's extension catalogue lists `pgmq`, `pg_cron` and `pg_net`, but their installed versions are null. They are available to enable, not currently enabled.
- Therefore this document is a design proposal only. No production extensions, migrations, secrets, schedules or functions were changed.

## Architecture decision

Use **Postgres as the authoritative execution ledger** and **Supabase Queues/pgmq as durable delivery and wake-up infrastructure**.

Do not treat a queue message as the source of truth for run state. Queue delivery is at-least-once in practice around worker crashes and visibility expiry; application side effects must be idempotent. A visibility timeout is not proof that a side effect happened exactly once.

### Components

1. **Run ledger** — existing `jd_automation_runs` and `jd_automation_steps`, extended additively with lease, attempt, scheduling and checkpoint metadata.
2. **Job ledger** — a dedicated tenant-scoped `jd_execution_jobs` table records run ID, state, attempt count, next attempt, lease owner/token/expiry, heartbeat, last safe error and timestamps. One active job per run is enforced by a unique constraint.
3. **Queue** — one durable basic pgmq queue, initially `jd_execution_jobs`. Messages contain only opaque job ID and schema/version metadata; no prompts, credentials, customer records or tool payloads.
4. **Enqueue transaction** — one server-only database RPC creates/updates the job ledger row and enqueues its message in the same transaction. Duplicate idempotency keys return the existing job.
5. **Worker** — a dedicated Edge Function validates an internal worker secret or equivalent trusted invocation, reads a bounded batch, claims each job atomically, verifies tenant/run consistency, and executes one persisted checkpoint at a time.
6. **Scheduler/dispatcher** — only after staging validation, use a scheduled invocation (pg_cron + pg_net or a supported external scheduler) to wake the worker. The exact trigger mechanism remains a deployment decision; do not put service-role credentials in client code or queue payloads.
7. **Progress** — persist step transitions and safe progress events; the UI polls or subscribes to tenant-authorized run/step records. A disconnected browser must not affect worker execution.

### State model

- Job: `queued`, `running`, `retry_wait`, `completed`, `partially_completed`, `failed`, `cancelled`.
- Run: retain the existing public statuses where possible; add only statuses required by a tested transition design.
- Step: `pending`, `running`, `awaiting_approval`, `completed`, `skipped`, `failed`.
- Every transition is a conditional database update that checks current state, lease token and tenant. Invalid transitions fail closed.

### Claim, lease and recovery

- Claim with a single SQL transaction using row locking (for example `FOR UPDATE SKIP LOCKED`) and a fresh unguessable lease token.
- Set lease expiry and heartbeat; only the current token may renew, checkpoint, complete or release the job.
- If a worker crashes, the lease expires. A recovery sweep returns the job to `queued` or `retry_wait` and re-enqueues it. A stale worker cannot commit after another worker has claimed the job because its lease token no longer matches.
- Keep queue visibility longer than the normal worker batch window, but do not rely on visibility alone for mutual exclusion.
- Bound concurrency, batch size, wall-clock work and per-run tool rounds. Yield and checkpoint before approaching Edge Function execution limits.

### Resumable execution

- Refactor the current synchronous runtime into a deterministic step/checkpoint executor.
- Persist the validated plan and each step's tool key, validated input, risk classification, status, attempt count, output reference and timestamps.
- After each successful step, persist its result before starting the next step.
- On retry, resume from the first incomplete safe checkpoint; never blindly replay a completed step.
- A step that performs a write must use a stable idempotency key derived from run + step + approved payload version, and must verify the resulting state before marking complete.
- If an external provider cannot support idempotency, classify the operation as non-retriable after an ambiguous outcome and require reconciliation or human review.

### Approval and security boundary

- Existing approval checks remain server-enforced immediately before consequential execution.
- Approval binds to the exact step/action, destination, payload version and tenant. Any material edit invalidates approval.
- A queue message never grants permission. The worker re-derives requester, workspace and role from trusted database records.
- No browser role can enqueue, claim, read raw queue messages, or mutate job/lease fields directly.
- Enable RLS on the public job ledger. Authenticated users may read only jobs visible through their run ownership/admin policy; all writes and queue access are service-only.
- Do not expose `pgmq`, queue tables, worker RPCs or service-role credentials to the Data API/browser.
- Do not put sensitive prompt text or model output in queue messages. Keep payloads in tenant-scoped tables with restricted access.

### Retry and dead-letter policy

- Retry only transient infrastructure/provider failures with bounded exponential backoff and jitter, respecting provider Retry-After where safe.
- Do not retry validation errors, permission denials, rejected approvals, malformed plans or deterministic business-rule failures.
- Set a maximum attempt count and maximum job age. Exhausted jobs become `failed` with a redacted diagnostic and an auditable event.
- Keep terminal history in the ledger; archive queue messages after successful terminal handling. Retain enough metadata for support and reconciliation without retaining secrets.

## Implementation progress

- **JD-004A:** Job ledger, pgmq queue creation, restricted queue read/ack RPCs, atomic claim, lease fencing, heartbeat, checkpoint, bounded retry and terminal-state handling are implemented in a separate review branch. Static contract tests are included in CI. SQL execution and concurrency/RLS integration tests remain pending.

## Proposed implementation sequence

1. **JD-004A — Schema and queue primitives:** migration for job ledger, constraints, indexes, RLS, transition/claim/heartbeat/checkpoint/recovery RPCs; pgmq extension + queue creation only in a disposable/local or staging environment first.
2. **JD-004B — Worker:** authenticated worker Edge Function, bounded batch processing, lease validation, checkpoint persistence and safe failure handling.
3. **JD-004C — Runtime refactor:** resumable plan/step executor and idempotency contract for each tool; explicit handling of ambiguous external side effects.
4. **JD-004D — Dispatcher and recovery:** scheduled worker wake-up, expired-lease recovery, retry scheduling and dead-letter handling.
5. **JD-004E — UI and verification:** progress, retry state, cancel where safe, failure diagnostics, cross-tenant tests, crash/replay tests and staging soak.

## Acceptance criteria

- [ ] A queued job is durable across HTTP response completion and worker restart.
- [ ] Two workers cannot hold valid leases for the same job at once.
- [ ] Expired leases are recovered and stale workers cannot commit.
- [ ] A crash after a completed step resumes at the next incomplete checkpoint.
- [ ] Duplicate enqueue requests do not create duplicate active jobs.
- [ ] Retried write steps do not duplicate side effects; ambiguous non-idempotent writes are held for reconciliation.
- [ ] Approval is revalidated immediately before execution and binds to the executed payload version.
- [ ] Tenant A cannot read, claim, enqueue, heartbeat, cancel or inspect Tenant B jobs.
- [ ] Queue contents contain opaque identifiers only.
- [ ] Retry limits, backoff, terminal failure and audit events are tested.
- [ ] Run progress remains available when the browser disconnects.
- [ ] Local and staging tests pass before any production migration or extension activation.

## Risks and open decisions

- Supabase Queue API/extension versions and available functions must be confirmed in the target staging project before writing production migration assumptions.
- pg_cron/pg_net scheduling requires secure secret storage and operational monitoring. Prefer a supported external scheduler if Vault/HTTP invocation cannot be configured safely.
- Edge Function runtime limits require short bounded worker batches; this is not a substitute for a dedicated long-running worker for very long CPU-bound tasks.
- Tool-by-tool idempotency is required. A generic queue alone cannot guarantee exactly-once external effects.
- Cancellation semantics must distinguish safe cancellation before a side effect from cancellation after an irreversible action has begun.

## Validation and deployment

- **Code implementation:** not started.
- **Migrations applied:** no JD migrations verified in the target project.
- **Extensions installed:** pgmq, pg_cron and pg_net are not installed in the target project.
- **Edge Function deployed:** not verified.
- **Production changes:** none.
- **Token usage:** no provider usage metadata was available for this design work; do not estimate.
