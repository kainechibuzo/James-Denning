# JD-004B — Authenticated Background Worker

- **Date:** 2026-11-11
- **Status:** implementation on feature branch; verification and deployment pending
- **Parent:** JD-004 durable background execution

## Worker contract

The worker is a server-only Supabase Edge Function. It accepts POST requests with a dedicated `x-jd-worker-secret` header. Platform JWT verification is disabled for this endpoint because the worker authenticates using a high-entropy secret held only in Edge Function secrets. Requests are not exposed as a browser feature.

Each invocation reads at most one queue message with a bounded visibility timeout. It accepts only schema version 1 messages containing an opaque job UUID. The database remains authoritative: the worker claims the job using the exact queue message ID and a fresh lease token, then re-derives the run, workspace, requester and role from trusted database records.

## Resumable runtime state

The worker loads the latest versioned runtime checkpoint from the private `jd_execution_checkpoints` table. The JD runtime restores the model conversation input, completed tool-call IDs, token counters and model-request telemetry. After each complete parallel tool-call round, the runtime persists the new state through a service-role-only RPC fenced by the current unexpired lease. The raw checkpoint is limited to 512 KiB and is never readable by authenticated browser roles.

A crash during a parallel tool-call round can cause that round to be replayed because its outputs are checkpointed as a batch. This is safe only while the tool registry remains read-only. Any future write-capable tool requires stable idempotency and ambiguous-outcome reconciliation before it can be used by the background worker.

## Execution lifecycle

1. Validate the worker secret and server configuration.
2. Read one message from `jd_execution_jobs`.
3. Validate the opaque message schema.
4. Claim the job with a 90-second lease and worker ID.
5. Verify the job's run, requester and workspace agree.
6. Load bounded conversation history and the existing request.
7. Execute the existing JD low-risk, read-only tool registry.
8. Persist tool-step start/completion/failure records and checkpoint completed steps.
9. Heartbeat the lease every 25 seconds; stop further tool callbacks if the lease is lost.
10. Persist the assistant result and run status, finish using the lease token, and acknowledge the exact terminal queue delivery.
11. On execution failure, call the database retry RPC with a bounded exponential delay. The database enforces maximum attempts and archives replaced deliveries.

## Security boundaries

- The worker uses `SUPABASE_SERVICE_ROLE_KEY` only in the Edge Function runtime.
- `JD_WORKER_SECRET` is mandatory and compared without an early-exit character comparison.
- Queue messages contain no prompt, output, user data, credentials or tool arguments.
- Workspace and requester IDs come from the claimed ledger row and are checked against the run and profile records.
- The existing runtime exposes only low-risk read-only tools. This worker does not enable email sending, publishing, payments, access changes or destructive actions.
- All state-changing worker RPCs are fenced by the current lease token and expiry.

## Boundaries of this phase

This is a bounded queue consumer, not yet the complete durable execution system. The worker is not automatically invoked because the scheduler is JD-004D. Chat submission still uses the existing synchronous path until the enqueue integration and UI transition are completed. Checkpoints currently record completed tool steps, but the runtime does not yet resume model reasoning from a persisted intermediate response; deterministic step-level resume is JD-004C. No migration or function is deployed.

## Configuration required before staging deployment

- Deploy the JD control-plane migrations in their correct order, including the JD-004A migration.
- Install/verify pgmq using the staging project's supported Supabase Queues setup.
- Set `JD_WORKER_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`, and `JD_MODEL_NAME` as server-side Edge Function secrets.
- Deploy `jd-execution-worker` and invoke it only from a trusted scheduler or operator-controlled backend.
- Run queue, concurrency, lease-expiry, retry-exhaustion, cross-tenant and crash/replay tests before production rollout.

## Rollback

Disable the scheduler/invocation source first, then redeploy the previous Edge Function configuration if needed. Do not delete job rows or queue messages during rollback; preserve the ledger for inspection and reconciliation. No production change has been made by this PR.