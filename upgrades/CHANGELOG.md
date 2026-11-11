# Upgrade Changelog

Append-only record of work on JD and James-Denning upgrades. Newest entries go at the bottom. Use `UPGRADE_TEMPLATE.md` for full records.

## Status definitions

- `proposed` — captured, not implemented.
- `in_progress` — implementation has started.
- `blocked` — blocked by dependency, access, decision or failure.
- `implemented` — code/configuration exists; verification may remain.
- `verified` — required tests and relevant integration checks passed.
- `deployed` — verified change is confirmed in the target environment.

## Historical baseline

### JD-BASE-001 — Chat-first JD foundation
- **Status:** unverified historical baseline
- **Context:** Prior work described a chat-first interface and authenticated JD Edge Function integration.
- **Evidence:** Historical reference to PR #20: https://github.com/kainechibuzo/James-Denning/pull/20
- **Caution:** Re-check current PR state, merge commit, branch contents, CI and deployment before treating this as merged or deployed.

### JD-BASE-002 — Autonomous automation control plane
- **Status:** unverified historical baseline
- **Context:** Prior work described conversation, message, run, step, approval and audit tables with tenant-scoped RLS.
- **Evidence:** Historical reference to PR #21: https://github.com/kainechibuzo/James-Denning/pull/21
- **Caution:** Verify migration state and policies in the target Supabase project before use.

### JD-BASE-003 — OpenRouter agent runtime
- **Status:** unverified historical baseline
- **Context:** Prior work described an OpenRouter-backed Responses API function-calling runtime with a limited read-only tool registry.
- **Evidence:** Historical reference to PR #22: https://github.com/kainechibuzo/James-Denning/pull/22
- **Caution:** Verify current code, selected model compatibility, provider usage metadata, CI and deployment.

### JD-BASE-004 — JD command-centre UI and read tools
- **Status:** unverified historical baseline
- **Context:** Prior work described a JD command-centre redesign and additional read tools for activity, email logs, attendance and announcements.
- **Evidence:** Historical reference to PR #24: https://github.com/kainechibuzo/James-Denning/pull/24
- **Caution:** Verify PR state, actual schema columns, role access, tenant isolation and deployment.

## Upgrade records

No new upgrade implementation is recorded by this registry initialisation commit. Append new entries below using the template. Historical baselines above are explicitly unverified and must not be counted as completed work.


### JD-001 — Reconcile JD runtime, command centre and upgrade registry into master
- **Date:** 2026-11-11
- **Status:** implemented; deployment prerequisites remain
- **Priority:** high
- **Evidence:** PR #34 merged: https://github.com/kainechibuzo/James-Denning/pull/34
- **Merge commit:** `0a7c6d8d77d0d70c48370f56cd3c13e7e5c03104`
- **Scope:** Integrated the OpenRouter-backed JD runtime, chat-first command centre, organisation-scoped read tools, Review Centre foundation, automation run monitor, token-usage dashboard, approval decision RPC, additive migrations and the `upgrades.md` / `upgrades/` registry.
- **Validation:** Web CI passed, application verification passed, secured Edge Function Deno checks passed, and Vercel reported a successful deployment for the PR head.
- **Not yet deployed:** JD SQL migrations and the `jd-automation` Edge Function are absent from the configured Supabase project. Do not claim JD is live until schema migration, function deployment, secrets/configuration and authenticated smoke tests are completed.

### JD-002 — Restrict JD conversation and operational-record access
- **Date:** 2026-11-11
- **Status:** implemented; database verification pending
- **Priority:** critical
- **Evidence:** PR #35 merged: https://github.com/kainechibuzo/James-Denning/pull/35
- **Merge commit:** `f2b7ede738c8540eec85b5f82ec2820a6e997c43`
- **Scope:** Restricts conversation/message reads to the creator or workspace admin; run/step reads to requester or admin; approvals to requester or admin; audit events to admins. Authenticated browser clients no longer write JD control-plane records directly. Edge Function history and submit paths enforce conversation ownership.
- **Validation:** Web CI passed, application verification passed, secured Edge Function Deno checks passed, and Vercel reported a successful deployment.
- **Not yet verified:** The RLS migration has not been applied to Supabase and no staging cross-user/cross-tenant RLS test has run. Keep production migration and live JD activation blocked until these checks pass.


### JD-003 — Reliable agent execution and provider telemetry
- **Date:** 2026-11-11
- **Status:** verified for synchronous execution reliability; durable execution remains open
- **Priority:** high
- **Scope:** Add bounded retries for transient OpenRouter/network failures; retain provider-reported usage per successful model request; stop inferring total tokens from input plus output; return an explicit `partially_completed` result when the eight-round tool limit is reached; persist partial/completion status and retry telemetry; surface incomplete totals honestly in usage and run-monitor screens.
- **Tests added:** Deno unit tests for usage normalization, non-inferred totals, retryable HTTP status classification and bounded Retry-After/backoff.
- **Files:** `supabase/functions/_shared/jd-agent-runtime.ts`, `supabase/functions/_shared/jd-agent-runtime.test.ts`, `supabase/functions/jd-automation/index.ts`, `src/chat/RunMonitor.jsx`, `src/chat/AgentUsage.jsx`, `.github/workflows/ci.yml`.
- **Token usage:** No OpenRouter provider usage was generated by these repository edits; development-model token usage is unavailable and is not estimated.
- **Evidence:** PR #37 merged: https://github.com/kainechibuzo/James-Denning/pull/37
- **Merge commit:** `b2ccfb8ed4065ac2418a8f198e9b5732b655c544`
- **Validation:** Production web build, application verification, Deno unit tests and secured Edge Function type-check all passed on the PR head. Vercel preview deployment completed successfully; the post-merge master deployment was still pending at the last check.
- **Remaining:** Merge and production deployment verification. Durable background jobs, leases, resumability and crash recovery remain a separate follow-up; this synchronous handler is not a durable queue.


### JD-004 — Durable background execution design
- **Date:** 2026-11-11
- **Status:** proposed; design documented, implementation not started
- **Priority:** critical
- **Scope:** Define Postgres-backed job ledger, Supabase Queues/pgmq delivery, atomic claims and leases, checkpointed resumability, retry scheduling, crash recovery, idempotent side effects, progress reporting and tenant-safe worker execution.
- **Evidence:** `upgrades/JD-004-DURABLE-EXECUTION.md` on branch `feature/jd-004-durable-execution-design`.
- **Repository inspection:** Existing JD migrations and synchronous runtime are present in GitHub. The configured Supabase project has no JD tables and its migration history does not include the JD migration versions. The extension catalogue lists pgmq, pg_cron and pg_net as available, but none is installed.
- **Validation:** Design review only. No code, migration, extension, schedule, secret or Edge Function was deployed or applied.
- **Token usage:** No provider usage metadata available; usage and cost are unknown and not estimated.
- **Next:** Implement JD-004A as a separately reviewable schema/queue-primitives change, validate locally and in staging, then proceed to worker/runtime phases.


### JD-004A — Durable execution job ledger and queue primitives
- **Date:** 2026-11-11
- **Status:** implemented; SQL integration verification pending
- **Priority:** critical
- **Scope:** Add a tenant-scoped durable job ledger; enforce one job per run and workspace idempotency; create a durable pgmq queue; add server-only enqueue, bounded queue-read, atomic claim, lease heartbeat, checkpoint, terminal completion, retry scheduling and message acknowledgement RPCs.
- **Security:** Authenticated users have read-only job visibility through requester/admin and workspace checks. Queue reads and all mutation RPCs are service-role-only. Queue messages contain opaque job IDs and schema version only. Claims, retries and acknowledgements are fenced by queue message ID; worker mutations are fenced by lease token and lease expiry.
- **Files:** `supabase/migrations/20261111130000_jd_durable_execution_jobs.sql`, `supabase/functions/_shared/jd-execution-migration.test.ts`, `.github/workflows/ci.yml`.
- **Validation:** Static migration-contract tests added to CI. Live PostgreSQL migration execution, pgmq API compatibility, concurrent worker tests, RLS integration tests and crash/recovery tests have not yet run. No JD migration or extension was applied to the configured Supabase project.
- **Deployment:** Not deployed. This branch is for review and CI only.
- **Token usage:** Provider usage metadata unavailable; token counts and cost unknown, not estimated.
- **Next:** Pass CI and SQL review, then validate against a disposable/local or staging Supabase database before implementing the worker.


### JD-004B — Authenticated durable execution worker
- **Date:** 2026-11-11
- **Status:** implemented; CI and database integration verification pending
- **Priority:** critical
- **Scope:** Add a dedicated internal Edge Function that reads one opaque queue message per invocation, validates its schema, atomically claims the job, verifies run/requester/workspace consistency, executes the existing low-risk JD tool registry, persists tool-step transitions, heartbeats and checkpoints the lease, records the final response, retries bounded failures, and acknowledges only terminal deliveries.
- **Security:** Worker endpoint disables platform JWT verification only because it uses a dedicated JD_WORKER_SECRET header with constant-time comparison. Supabase service-role credentials remain server-side. Queue payloads are restricted to job ID and schema version. Worker re-derives tenant and requester from the claimed job and database records. Existing JD runtime remains read-only; consequential actions are not introduced.
- **Files:** supabase/functions/jd-execution-worker/index.ts, supabase/functions/_shared/jd-execution-worker-helpers.ts, supabase/functions/_shared/jd-execution-worker.test.ts, supabase/config.toml, .github/workflows/ci.yml.
- **Validation:** Helper unit tests and Edge Function type-check added to CI. GitHub Actions results pending. Live queue/lease/pgmq execution, concurrent-worker tests, crash recovery and tenant-isolation integration tests remain pending because the JD migrations are not applied to the configured Supabase project.
- **Limitations:** This phase does not add the scheduler/dispatcher, expired-lease recovery sweep, chat-submit enqueue integration, UI progress polling or deterministic per-tool resume. Those remain JD-004C/004D/004E work. The worker is not deployed and cannot process production jobs yet.
- **Deployment:** No Supabase migration, secret, extension, schedule or Edge Function deployed. Production unchanged.
- **Token usage:** Provider/model and all token/cost fields unknown; no provider usage metadata was available and no estimate is recorded.
- **Next:** Pass CI, validate against a disposable/staging database with the full JD migration chain, then implement JD-004C resumable execution and JD-004D dispatch/recovery.


### JD-004C — Persisted runtime checkpoints and resume
- **Date:** 2026-11-11
- **Status:** implemented on the JD-004B review branch; CI and database integration verification pending
- **Priority:** critical
- **Scope:** Extend the JD runtime with a versioned resume-state contract. After each completed tool-call round, persist the Responses API conversation input, completed call IDs, provider usage counters and model-request telemetry. On worker restart, restore that state and continue from the next model request instead of restarting the conversation from its original prompt.
- **Data protection:** Runtime checkpoints are stored in a separate RLS-enabled table with no browser-role policies or grants. Only the service role can access the raw state. The checkpoint writer is a security-definer RPC fenced by the current unexpired job lease token. Checkpoint payloads are limited to 512 KiB.
- **Files:** supabase/functions/_shared/jd-agent-runtime.ts, supabase/functions/jd-execution-worker/index.ts, supabase/migrations/20261111140000_jd_durable_execution_checkpoints.sql, supabase/functions/_shared/jd-execution-checkpoint-migration.test.ts, .github/workflows/ci.yml.
- **Resume boundary:** A checkpoint is saved after an entire parallel tool-call round has completed and its outputs have been appended to the model conversation. If a worker crashes mid-round, that round may be replayed. This is currently safe because the exposed JD tool registry is read-only. Before introducing write-capable tools, each tool must implement a stable idempotency key and reconciliation contract; this checkpoint mechanism alone does not provide exactly-once side effects.
- **Validation:** Static migration contract test and Deno type-check added to CI. Live PostgreSQL execution, checkpoint permission tests, crash/replay integration and tenant-isolation tests remain pending. No migration or function deployed.
- **Token usage:** Provider/model and token/cost values unknown; no provider usage metadata available for this implementation session.
- **Next:** Verify migrations and queue behaviour in staging, add integration tests for lease replacement and checkpoint resume, then build dispatcher/recovery and progress UI.


### JD-005 — Responsive portal and organisation settings intelligence
- **Date:** 2026-11-11
- **Status:** implemented UI foundation; JD settings catalogue and browser verification pending
- **Priority:** high
- **Scope:** Fix document theme synchronisation and native browser colour scheme; add dark-mode safeguards for hard-coded light controls; make shared settings rows stack on mobile; add responsive grid, form and table safeguards; document the JD Settings Intelligence and Organisation Builder workflow.
- **Files:** src/styles/system.css, src/AppDemo.jsx, src/pages/settings.jsx, upgrades.md, upgrades/JD-005-RESPONSIVE-SETTINGS-INTELLIGENCE.md.
- **Validation:** Static review of screenshots and source implementation. Production build, automated browser visual tests, and full route-by-route mobile verification remain pending.
- **Database:** No migration required for this UI/specification phase.
- **Token usage:** Unknown; provider usage metadata unavailable.
- **Next:** Add visual regression coverage for Generate Bills, Assignments and every Settings tab; implement the server-derived settings catalogue and typed, permission-scoped JD configuration tools.


### JD-005B — Read-only organisation settings intelligence
- **Date:** 2026-11-11
- **Status:** implemented; CI verification pending
- **Priority:** high
- **Scope:** Added a server-derived, read-only settings catalogue tool for JD admins. It reads settings only for the authenticated workspace, classifies registered settings by category, reports configured/missing values, counts unknown settings without exposing their values, and excludes secret-like settings entirely. Added pure helper tests for completeness, privacy and category filtering.
- **Files:** supabase/functions/_shared/jd-settings-catalogue.ts, supabase/functions/_shared/jd-settings-catalogue.test.ts, supabase/functions/_shared/jd-agent-runtime.ts, .github/workflows/ci.yml.
- **Security:** Low-risk read-only tool; role restricted to admin; tenant scope comes from server-derived context; no write operation or arbitrary key lookup; secret-like values never enter model context.
- **Validation:** Deno helper tests and secured Edge Function type-check added to CI; results pending.
- **Database:** No migration required; reads existing school_settings key/value rows.
- **Deployment:** Edge Function not deployed by this PR.
- **Token usage:** Unknown; no provider usage metadata available.
- **Limitations:** Catalogue is intentionally limited to settings explicitly registered from the current settings UI; it does not claim complete coverage of all modules or settings. JD cannot change settings in this phase.
- **Next:** Add full settings inventory and a typed, approval-gated configuration proposal/apply workflow with read-after-write verification.


### JD-005C — Validated settings change planning
- **Date:** 2026-11-11
- **Status:** implemented; CI verification pending
- **Scope:** JD can prepare a read-only before/after plan for up to 20 registered settings. The planner validates supported keys and values, detects duplicates/no-op changes, identifies invalid entries, and classifies identity/workspace/security/billing changes as requiring Review Centre approval. Other supported settings require explicit confirmation.
- **Files:** supabase/functions/_shared/jd-settings-change-planner.ts, supabase/functions/_shared/jd-settings-change-planner.test.ts, supabase/functions/_shared/jd-agent-runtime.ts, .github/workflows/ci.yml.
- **Security:** Admin-only tool; workspace ID comes from server context; only registered setting keys; current values are read tenant-scoped; no write path; no arbitrary SQL or table mutation.
- **Validation:** Deno tests cover diffs, approval classification, invalid values, unknown keys, duplicates and no-op values. CI type-checks the secured automation Edge Function.
- **Database:** No migration required.
- **Deployment:** Not deployed. No settings were changed.
- **Token usage:** Unknown; provider usage metadata unavailable.
- **Limitations:** The tool prepares a plan only. It does not persist a proposal in the Review Centre or execute changes. Review Centre approval binding to an exact settings proposal and verified execution remain future work.
- **Next:** Persist the exact proposed diff as a Review Centre item, bind approval to the proposal hash, implement narrow idempotent writes and verify each changed value after execution.


### JD-005D — Persist hash-bound settings proposals in Review Centre
- **Date:** 2026-11-11
- **Status:** implemented; CI verification pending
- **Scope:** Added a service-role-only database RPC that verifies admin workspace membership, computes a SHA-256 hash from the exact JSONB proposal in the database, persists a Review Centre approval and automation run, and writes an audit event. The Edge Function re-derives the settings diff from current tenant-scoped values before calling the RPC. Duplicate proposal hashes return the existing review item.
- **Files:** supabase/migrations/20261111150000_jd_settings_proposal_review.sql, supabase/functions/_shared/jd-settings-proposal-migration.test.ts, supabase/functions/jd-automation/index.ts, .github/workflows/ci.yml.
- **Security:** Admin check inside security-definer RPC; server-derived tenant; service-role-only execution; exact proposal JSONB hash stored with the approval; no browser write grants; settings remain unchanged.
- **Validation:** Static migration contract test added; secured Edge Function type-check remains in CI. Live migration/RPC and concurrent duplicate-submission tests still required.
- **Database:** New migration 20261111150000; not yet applied to any Supabase project.
- **Deployment:** Edge Function not deployed.
- **Execution:** Approval does not execute settings changes. Approved proposals remain not_executed until a separately secured, hash-verifying executor is implemented.
- **Token usage:** Unknown; provider usage metadata unavailable.
- **Next:** Implement the approval-bound executor with atomic decision/hash checks, narrow typed writes, idempotency and read-after-write verification.


### JD-005E — Approval-bound settings executor
- **Date:** 2026-11-11
- **Status:** implemented; CI and live database verification pending
- **Scope:** Added a service-role-only per-step database executor and an admin-only Edge Function action. Every step locks and verifies the approved Review Centre item, recomputes the exact stored JSONB SHA-256 hash, checks the proposal's before-value against the current workspace setting, revalidates the registered key/value, applies one setting, reads it back, and records a unique execution-step result plus audit event.
- **Recovery:** Each step is its own transaction with a unique (approval_id, step_index) record. Completed steps return already_completed on retry. Stale values become explicit conflicts and halt later steps. An RPC failure halts the batch; retries re-enter the same executor and skip recorded successes.
- **Files:** supabase/migrations/20261111160000_jd_approved_settings_executor.sql, supabase/functions/jd-automation/index.ts, supabase/functions/_shared/jd-settings-executor-migration.test.ts, .github/workflows/ci.yml.
- **Security:** Admin role checked server-side; workspace derived from profile; approval row locked; approved action_key and exact proposal hash enforced in SQL; only a fixed allowlist of registered keys; browser execution revoked; service role only.
- **Validation:** Static migration contract tests and secured Edge Function type-check added to CI. Live SQL, concurrency, actual school_settings type compatibility, RLS and end-to-end partial-failure tests remain required.
- **Database:** New migration 20261111160000; not applied to production.
- **Deployment:** Edge Function not deployed.
- **Token usage:** Unknown; provider usage metadata unavailable.
- **Limitations:** Execution is one step per transaction. A setting changed after approval is never overwritten; that step is marked conflict and the remaining batch stops. A retry resumes only steps not already recorded as completed.
