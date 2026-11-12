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


### JD-BATCH-01 — Operational intelligence and organisation builder foundations
- **Date:** 2026-11-11
- **Status:** foundation implemented; CI and integration verification pending
- **Scope:** Added a 20-track capability registry, evidence-based capability classification, organisation blueprint validation and preview/submission actions, tenant-scoped organisation blueprint persistence, operational task contracts and idempotency keys, tenant-scoped operational task creation, vacancy draft validation/persistence, and guarded recruitment candidate stage transitions.
- **Migration:** `supabase/migrations/20261111180000_jd_batch01_organisation_operations_hiring.sql` (not applied to production).
- **Edge Function:** `supabase/functions/jd-automation/index.ts` now exposes `capabilities.report`, `organisation.blueprint.preview`, `organisation.blueprint.submit`, `operations.task.create`, `hiring.vacancy.draft`, and `hiring.candidate.transition`.
- **Shared contracts:** `jd-capability-intelligence.ts`, `jd-organisation-blueprint.ts`, `jd-operations.ts`, `jd-hiring.ts`.
- **Tests:** Added `jd-batch01.test.ts` to CI for registry count, evidence classification, blueprint validation, task transitions, idempotency and hiring pipeline validation.
- **Security boundaries:** New tables are tenant-keyed, RLS-enabled and inaccessible to browser roles. Blueprint persistence derives tenant from admin profile. No blueprint is auto-provisioned, vacancy is not published, candidate stages are human-admin controlled, and external messages are not sent.
- **Known gaps:** Dispatcher scheduling and lease recovery still need end-to-end implementation; UI for blueprint review, operations monitor and recruitment pipeline is not included; people, performance, finance, communications and workforce planning integrations remain capability slots rather than complete modules. Capability reporting returns unverified until trusted deployment/smoke-test evidence is supplied.
- **Token usage:** Provider-reported token usage unavailable for repository edits; no estimate recorded.


### JD-BATCH-01 follow-through — operational interfaces and integrations
- **Date:** 2026-11-11
- Added the Business Operations page and navigation for admin/manager roles.
- Connected live tenant-scoped read APIs for task queue, team directory, organisation blueprint drafts and hiring pipeline.
- Added team assignment with same-workspace staff validation; task transitions use optimistic concurrency checks.
- Added vacancy approval/opening and candidate intake, with candidate intake restricted to internally open requisitions; UI exposes only valid next stages.
- Added JD agent tools for aggregate people, active-period performance and operational task intelligence. Existing finance, communications, attendance and hiring read tools are reused.
- Added deterministic aggregation tests and CI coverage.
- **Not deployed:** migration and Edge Function remain pending staging and production release procedures.
- **Token usage:** provider-reported token usage unavailable; no estimate recorded.

### Durable execution and operations monitor follow-through
- Routine JD chat requests now enqueue durable jobs instead of running the model inside the request/response Edge Function.
- Added the scheduled worker poll workflow (five-minute cadence; one job per invocation) using `SUPABASE_URL` and `JD_WORKER_SECRET` repository secrets.
- Added the execution monitor, admin-only safe cancellation for queued/retry-wait jobs, and admin-only retry for failed jobs.
- Added migration `20261111190000_jd_execution_retry_controls.sql` for tenant-verified, audited failed-job retry.
- Added CI contract tests for the retry migration.
- **Release gate:** worker and automation Edge Functions are not deployed; migrations are not applied. Staging validation and secret configuration are required before live operation.
- **Token usage:** provider-reported token usage unavailable; no estimate recorded.

### Final interface and durable execution verification
- Added Business Intelligence dashboard/API for workforce aggregates, finance summary, active-period performance, task metrics, announcements and email delivery metadata.
- Added multi-department blueprint editor, task department/due-date controls, execution monitor and retry/cancel controls.
- Routed routine JD requests through the durable queue; removed synchronous model execution from the chat request path.
- Scoped manager execution history to the manager's own runs.
- **Verified source head:** `52a8169b8ff8aa2cd60a9299b471118ba30ad2f7`.
- **CI:** Web CI passed (production build, Deno helper/migration tests, Edge Function type-check); application verification passed (web navigation/build and default application build).
- **Still not live:** no staging migration, production migration, or Edge Function deployment has been performed.


### JD-BATCH-02 — Autonomous Business Platform
- **Date:** 2026-11-11
- **Status:** in_progress (planning baseline)
- **Priority:** high
- **Branch:** `feature/jd-batch-02-autonomous-business-platform`
- **Base commit:** `81fd482f8e99ffcbd658a0a18133647d270189e1`
- **Scope:** Define 20 upgrade tracks spanning workflow authoring, scheduling, collaboration, business intelligence, forecasting, financial visibility, document and contract handling, CRM, sales, support, integrations, monitoring and executive reporting.
- **Evidence:** `upgrades/JD-BATCH-02-AUTONOMOUS-BUSINESS-PLATFORM.md`
- **Validation:** Planning/acceptance contract only. No feature implementation or runtime tests claimed by this entry.
- **Security:** Draft-first workflow design; tenant isolation, least privilege, exact-payload approval for consequential actions, secure OAuth and server-side secrets are mandatory.
- **Deployment/migrations:** None performed.
- **Token usage:** unknown; provider usage metadata unavailable.
- **Next:** Implement and test the workflow-definition foundation (JD-B02-01), after verifying existing schema and durable execution contracts.


### JD-B02-01 — Workflow definition validation
- **Date:** 2026-11-11
- **Status:** implemented; CI verification pending
- **Branch:** `feature/jd-batch-02-autonomous-business-platform`
- **Scope:** Add a bounded, allowlisted, cycle-free workflow graph validator and an authenticated admin/manager preview action. Validation is non-persistent and non-executable.
- **Files:** `supabase/functions/_shared/jd-workflow-definition.ts`, `supabase/functions/_shared/jd-workflow-definition.test.ts`, `supabase/functions/jd-automation/index.ts`, `.github/workflows/ci.yml`.
- **Tests:** Deno contract tests added to CI; run result pending.
- **Security:** Server-derived profile role gates preview; action types and trigger events are allowlisted; graph and config sizes bounded; arbitrary external HTTP/SQL/shell actions are not supported.
- **Deployment/migrations:** None performed.
- **Limitations:** No persistence, version history, visual editor, schedule, execution or activation. No capability is marked deployed.
- **Token usage:** unknown; provider usage metadata unavailable.


### JD-B02-02 — Versioned workflow drafts and approval-bound activation
- **Date:** 2026-11-11
- **Status:** implemented in source; CI and database verification pending
- **Branch:** `feature/jd-batch-02-workflow-versioning`
- **Scope:** Tenant-scoped workflow registry, immutable version records, optimistic concurrency, exact-version Review Centre proposal and administrator-only activation after approval.
- **Files:** `supabase/migrations/20261111200000_jd_workflow_versioned_drafts.sql`, `supabase/functions/jd-automation/index.ts`, `supabase/functions/_shared/jd-workflow-versioning.test.ts`, `.github/workflows/ci.yml`.
- **Security:** RLS enabled; browser table access revoked; service-only RPCs; server-derived tenant/role; manager authoring; admin activation; stale approval and definition hash checks.
- **Tests:** migration contract tests added to CI; run pending.
- **Not included:** visual editor, scheduler, workflow execution, migration application or Edge Function deployment.
- **Token usage:** unknown; provider usage metadata unavailable.


## 2026-11-11 — JD-B02-06 Department Collaboration foundation

- **Status:** in_progress (implementation branch; CI and staging verification pending).
- **Scope:** tenant-scoped operational task discussions, threaded comment parent references, validated workspace-member mentions, and an internal collaboration panel in Business Operations.
- **Security:** Edge Function authenticates the Supabase user and derives school/role from the server profile; service-only database access; database RPC revalidates manager role, task tenant, mention tenant and parent-task relationship; comment creation emits an audit event.
- **Files:** `supabase/migrations/20261111184500_jd_task_collaboration.sql`, `supabase/functions/jd-task-collaboration/index.ts`, `supabase/functions/_shared/jd-task-collaboration-migration.test.ts`, `src/pages/jd-department-collaboration.jsx`, Business Operations integration, Supabase function config.
- **Limitations:** mentions are stored and displayed but do not send notifications; no realtime subscriptions, file attachments or per-department visibility policy. Comments are append-only in the UI. No production migration or function deployment performed.
- **Token usage:** provider-reported usage unavailable; not estimated.


## 2026-11-11 — JD-B02-06 merge and CI verification

- **Status:** merged; CI verified; staging and deployment pending.
- **PR:** [#51](https://github.com/kainechibuzo/James-Denning/pull/51), squash merge commit `b9286e75fd04d8df16e613b3baa27d0432e851ff`.
- **Verification:** GitHub Web CI passed, including production web build, task-collaboration migration contract test, all existing JD contract/unit tests, and secured Edge Function type-check.
- **Deployment:** Vercel preview status remains blocked by the daily deployment quota. Supabase migration and Edge Function remain undeployed pending staging validation.
- **Token usage:** provider-reported usage unavailable; not estimated.


## JD-B02-07–20 — Multi-industry Business Platform implementation foundation

- **Status:** implementation integrated into master and deployed to the connected Supabase project; authenticated multi-tenant and provider E2E verification remain pending.
- **Data model:** tenant-scoped customer/CRM records, sales opportunities, activity timeline, expenses with admin decision controls, contracts with immutable content versions, secure document metadata, support cases/internal notes, integration catalogue, OAuth connection/state metadata, service-health observations and executive report snapshots.
- **API:** authenticated `jd-business-platform` Edge Function derives workspace and role from the signed-in profile; rejects browser role escalation; reads/writes are tenant-filtered; expense/contract/report decisions have role checks; record changes emit audit events.
- **Analytics:** pipeline weighted value, wins, approved spend, support volume and record coverage derive from saved JD records. Legacy school billing is not presumed corporate revenue. Currency aggregation is labelled and requires currency separation.
- **Intentional gaps:** document extraction worker and private bucket are deployed; scanned OCR still requires approved external processing and an OCR key. OAuth callback and encrypted token storage are deployed but provider credentials and callback round-trips remain unverified. Monitoring/operations workers are deployed but schedules need GitHub/Supabase secrets. Forecast output is descriptive, not a validated cash forecast; report data requires real workspace history.
- **Deployment (2026-11-12):** migration `20261112073746_jd_business_platform` applied to connected project `thklwiybjuhrjqrrxyid`; six Edge Functions deployed at version 2; private document bucket confirmed. No outbound sends, charges, refunds, transfers or contract signing were performed.
- **Token usage:** provider-reported usage unavailable; not estimated.


### JD-B02 deployment verification — 2026-11-12

- Direct master integration commit: `8184cd5afb02586b21690058cf63da9b994eb809`.
- Production web build and default application build passed on master.
- Full Deno contract/unit tests and secured Edge Function type-check passed on the integrated source before the master commit.
- Supabase migration applied; 25 business tables created with RLS enabled and no direct anon/authenticated grants.
- Six Batch 02 Edge Functions active at version 2.
- No business customer/document/report data was inserted. The connected project has one Auth account and three school records.
- Still outstanding: authenticated two-tenant E2E verification, external OAuth provider checks, OCR credentials/approval, Resend/Twilio secrets and delivery tests, Paystack read-only key verification, scheduled worker secret configuration, and resolution of the existing npm dependency vulnerabilities.

### JD-006 — Dependency remediation, document-upload security screening and reconciled outstanding-upgrades registry
- **Date:** 2026-11-12
- **Status:** implemented; CI verification pending (Deno unavailable in the authoring sandbox)
- **Priority:** critical (security), high (registry)
- **Scope:**
  1. **npm audit 29 → 0 vulnerabilities** (was 3 critical / 18 high / 7 moderate / 1 low). `xlsx` removed (unpatched SheetJS advisories, no npm fix available) and replaced with **lazy-loaded ExcelJS** in `src/utils/statementImport.js`; statement import now supports CSV (quoted fields, BOM) and XLSX, normalises day-first dates, and explicitly rejects legacy `.xls`. Statement UI text and `accept` updated. `xlsx-js-style` retained for write-only report cards (not flagged by npm audit) with a tracked follow-up in the registry. `vite` 5 → 8.3.8 (rolldown), `@vitejs/plugin-react` → 6.3.0, `sharp` → 0.35.5, `@capacitor/assets` → 4.0.0, `uuid` pinned ≥11.1.1 via `overrides`. `package.json` now uses 2-space JSON without BOM; `vite.config.js` chunk rule extended to ExcelJS.
  2. **Document-upload malware screening (server-side, fail-closed)** via new `supabase/functions/_shared/jd-document-security.ts`: magic-byte sniffing matched against declared MIME type; rejects executables (PE with PE-header verification, ELF, Mach-O), scripts (`#!`), OLE2 legacy Office containers, ZIP-only archives, macro-enabled OOXML (`vbaProject.bin`), UTF-16/NUL-containing "plain text", empty/oversize files and MIME mismatches; detects embedded PE/ELF payloads after a document header (polyglot). Enforced at `document.upload.confirm` (rejected files are deleted from storage and audited as `business.document.rejected`) and in `jd-business-document-worker` (rejected files fail with `error_code: malware_suspected`) before any extraction. This is a signature gate, **not** a commercial antivirus engine (see registry JD-UPG-152).
  3. **Reconciled Outstanding Upgrades Registry** in `upgrades/OUTSTANDING-REGISTRY.md`: 230 unique IDs across sections A–R covering JD runtime, JD-005 settings intelligence, Organisation Builder, sidebar/module coverage, Review Centre governance, artefacts, email/communications, hiring/LinkedIn, logs/monitoring, integrations/MCP, UX, platform security, Batch 01, durable execution, all 20 Batch 02 tracks, operational release blockers and documentation — each with status, blockers/dependencies and the verification required before it may be called done. Includes a read-only live audit of production (Supabase migrations/functions/RLS on 35 core tables; Vercel READY at `5232af9`) captured 2026-11-12.
- **Validation:** `npm audit` = 0; `npm run verify:web` passed (entry 9 KB gzip 4 KB). Security-screen logic verified by transpiling the module with TypeScript and running 8 assertion groups under Node 22 (Deno unavailable in sandbox; CI runs the authoritative `deno test` step, added to `.github/workflows/ci.yml`). Statement-import parser verified with XLSX round-trip, CSV-with-BOM/quotes, date normalisation, `.xls` rejection and unsupported-format rejection.
- **Known gaps / not done:** commercial AV integration (owner decision); JD runtime still not deployed to production (`jd-automation`, `jd-execution-worker`); Batch 01/settings-executor/workflow/retry migrations still unapplied in production; live provider verification (OAuth/Resend/Twilio/Paystack) still blocked on credentials; two-tenant staging E2E not run (one Auth account only). See `upgrades/OUTSTANDING-REGISTRY.md` for the full list.
- **Token usage:** No provider token usage generated by these edits; none estimated.
- **Files:** `package.json`, `package-lock.json`, `vite.config.js`, `src/utils/statementImport.js` (new), `src/pages/jd-business-platform.jsx`, `supabase/functions/_shared/jd-document-security.ts` (new), `supabase/functions/_shared/jd-document-security.test.ts` (new), `supabase/functions/jd-business-platform/index.ts`, `supabase/functions/jd-business-document-worker/index.ts`, `.github/workflows/ci.yml`, `upgrades/OUTSTANDING-REGISTRY.md` (new), `upgrades/CHANGELOG.md`, `upgrades.md`, `upgrades/README.md`, `NEEDS_YOU.md`.

### JD-007 — Production application of pending migrations and v3 screening deploys
- **Date:** 2026-11-12
- **Status:** applied; runtime verification pending (authoring sandbox has no route to `*.supabase.co`)
- **Priority:** critical (upload gate + settings governance), high (Batch 01/02 activation)
- **Preconditions:** PR #54 merged to master (`be77a55`) with owner authorisation; smoke tests still required.
- **Applied to production `thklwiybjuhrjqrrxyid` (recorded in `supabase_migrations.schema_migrations`):**
  1. `20261112084412 jd_settings_proposal_review` — Review-Centre-persisted, hash-bound settings proposals.
  2. `20261112084459 jd_approved_settings_executor` — approval-bound, idempotent per-setting execution with stale-value checks and read-after-write verification.
  3. `20261112084532 jd_batch01_organisation_operations_hiring` — organisation blueprints, operational tasks, hiring requisitions/candidates (RLS enabled; service-role only).
  4. `20261112084602 jd_task_collaboration` — task comments and mentions with same-workspace membership checks.
  5. `20261112084629 jd_execution_retry_controls` — admin-only requeue of failed execution jobs; pgmq queue `jd_execution_jobs` confirmed present.
  6. `20261112084732 jd_recurring_tasks_and_assignment` — recurring task schedules, department assignment pools, auto-assign RPC.
  7. `20261112084827 jd_workflow_versioned_drafts` — immutable workflow versions with exact-version Review Centre approval.
  All 10 backing tables verified present (`jd_settings_execution_steps`, `jd_organisation_blueprints`, `jd_operational_tasks`, `jd_hiring_requisitions`, `jd_hiring_candidates`, `jd_task_comments`, `jd_task_schedules`, `jd_task_assignment_members`, `jd_workflows`, `jd_workflow_versions`).
- **Deployed Edge Functions (owner-authorised):** `jd-business-document-worker` **v3** (pre-extraction `screenDocument` gate; failures exit with `error_code: malware_suspected`) and `jd-business-platform` **v3** (screen-on-confirm: rejected uploads are removed from storage and audited as `business.document.rejected`). Both report ACTIVE (version 3) on 2026-11-12.
- **NOT verified / not claimed:** live upload/confirm-path rejection behaviour, 401-vs-500 smoke tests, approve→execute→verify settings round-trip, workflow activation round-trip, two-tenant checks (single Auth account only). `signature_screen_passed` is not a commercial AV verdict (JD-UPG-152 owner decision still open). Batch 01/02 direct-to-production application was owner-authorised and documented; staging-first discipline remains required for future batches (JD-UPG-230).
- **No migrations were applied for JD durable execution runtime** (`jd-automation`, `jd-execution-worker`, `jd-task-scheduler`, `jd-task-collaboration` still not deployed; OpenRouter credentials still unset).
- **Token usage:** none generated; none estimated.
- **Files:** `upgrades/OUTSTANDING-REGISTRY.md`, `upgrades/CHANGELOG.md`, `upgrades/JD-BATCH-02-DELIVERY-STATUS.md`.

### JD-008 — JD settings intelligence module + fail-safe scheduled workflows
- **Date:** 2026-11-12
- **Status:** implemented; Web CI green on PR #55 (`c2c4cdc`, build 1m18s — includes the Deno `jd-settings-intelligence.test.ts` step)
- **Priority:** high (JD-005 settings intelligence), medium (CI hygiene)
- **Implemented:**
  1. **`supabase/functions/_shared/jd-settings-intelligence.ts`** — pure, read-only functions for the JD settings intelligence contract: `explainSetting(key, rows)` (value when safe, dependencies, affected modules, permission boundary, save behaviour, evidence; no secret values, ever), `auditConfiguration(rows)` (completeness + contradiction/invalid findings with machine-readable ids, severity, evidence strings, and an explicit `unchanged: true` marker — audits never write), `explainSaveBehaviour(key)` (executor guarantees: approved hash-verified proposal only, stale before-value aborts, read-after-write verification) and a `refusalFor()` taxonomy for unsupported/invented/secret-like keys (structured refusal + 15 supported keys). `jd-settings-catalogue.ts` now exports `SECRET_KEY_PATTERN` (additive export, no behaviour change). 14 assertion groups verified under Node 22 via TypeScript transpile (Deno unavailable in sandbox); `jd-settings-intelligence.test.ts` added and wired into `.github/workflows/ci.yml` for the authoritative Deno run.
  2. **Scheduled workflows fail-safe and consistent:** `jd-worker-dispatch.yml`, `jd-task-scheduler.yml`, `jd-business-ops-worker.yml`, `jd-document-intelligence.yml` previously hard-failed (exit 1, red runs every 5–15 min) whenever their secrets were unset — contradicting the documented "workflows skip safely until set" contract. They now emit `::notice` and exit 0 when secrets are missing (and guard both the validate and the call steps). `jd-business-ops-worker` still exits 1 if the secret is set but shorter than 32 characters (configuration error, not "unset"). `jd-business-monitor.yml` already used the skip pattern.
- **NOT done / not claimed:** the settings-intelligence module is **not wired into the live JD runtime** (`jd-automation` still undeployed; OpenRouter credentials unset); JD-UPG-004 tool wiring, live refusal/answer verification, and Review Centre end-to-end paths remain open. Audit findings are advisory and cover the registered 15-key catalogue only.
- **Token usage:** none generated; none estimated.
- **Files:** `supabase/functions/_shared/jd-settings-intelligence.ts` (new), `supabase/functions/_shared/jd-settings-intelligence.test.ts` (new), `supabase/functions/_shared/jd-settings-catalogue.ts` (export keyword only), `.github/workflows/ci.yml`, `.github/workflows/jd-worker-dispatch.yml`, `.github/workflows/jd-task-scheduler.yml`, `.github/workflows/jd-business-ops-worker.yml`, `.github/workflows/jd-document-intelligence.yml`, `upgrades/OUTSTANDING-REGISTRY.md`, `upgrades/CHANGELOG.md`.

### JD-009 — Expense anomaly detection slice (JD-UPG-121 / JD-UPG-196)
- **Date:** 2026-11-12
- **Status:** code implemented; Deno unit tests pass locally under Node shim; **not deployed** — `jd-business-platform` has not been redeployed after this wiring and no live smoke test exists
- **Priority:** medium (JD-UPG-121 expense monitoring track)
- **Implemented:**
  1. **`supabase/functions/_shared/jd-expense-anomalies.ts`** (new) — pure, deterministic, read-only anomaly analysis over approved/paid expense records: (a) budget utilisation findings (exact category + currency + period match; `budget_exceeded` high severity at ≥100%, `budget_threshold` warning at ≥ configured `alert_threshold_pct`), (b) per category+currency robust median outlier findings (`amount ≥ 3×` category median; requires ≥5 samples), (c) trailing-90d vs prior-90d spend spike (`≥1.5×` increase with ≥3 current records). Currencies are never summed across one another. Output carries `unchanged: true`, machine-readable finding ids, severity, evidence strings, recommendations, and an explicit limitations list. No writes, no external calls.
  2. **`jd-expense-anomalies.test.ts`** (new, 7 assertion groups) wired into `.github/workflows/ci.yml` as "Test JD expense anomaly detection".
  3. **`jd-business-platform` `expense.anomalies` action** — admin/manager only (existing guard), scoped to the caller's `school_id`, reads at most 200 budgets / 200 expenses, returns the analysis JSON. Not invoked by any other action.
  4. **Business Platform → Expense budgets UI** — "Run anomaly review" button + advisory findings panel (severity, evidence, recommendation; explicitly states no records are changed). `npm run verify:web` passes with the new panel.
- **NOT done / not claimed:** the edge function was **not redeployed** with this change (live `expense.anomalies` does not exist in production); no live smoke test, no real anomaly data validated; variance *workflow* (escalate findings into a review queue) is NOT built — findings are advisory only; JD-UPG-196 variance escalation remains open; JD-UPG-121 stays `partially_implemented`.
- **Token usage:** none generated; none estimated.
- **Files:** `supabase/functions/_shared/jd-expense-anomalies.ts` (new), `supabase/functions/_shared/jd-expense-anomalies.test.ts` (new), `supabase/functions/jd-business-platform/index.ts` (import + `expense.anomalies` action), `src/pages/jd-business-platform.jsx` (state/handler/panel), `.github/workflows/ci.yml` (new Deno step), `upgrades/OUTSTANDING-REGISTRY.md` (JD-UPG-121/196 notes), `upgrades/CHANGELOG.md`.

### JD-010 — KPI trend dashboards slice (JD-UPG-120 / JD-UPG-165)
- **Date:** 2026-11-12
- **Status:** deployed as `jd-business-platform` **v4** (owner-authorised 2026-11-12); smoke tests NOT run (sandbox has no route to `*.supabase.co`); Deno unit tests pass locally under Node shim; `npm run verify:web` passes; CI green on PR #55
- **Priority:** medium (Batch 02 analytics track)
- **Implemented:**
  1. **`supabase/functions/_shared/jd-kpi-trends.ts`** (new) — pure, deterministic, read-only 12-month (configurable 1–24) UTC monthly-bucket analysis: cleared cash in/out and approved/paid expenses always grouped per currency; new opportunities + won-by-creation-month (approximation, documented), resolved support cases (by `resolved_at` only), new customers; trailing-3m vs prior-3m movement for count metrics; explicit limitations array; never sums across currencies.
  2. **`jd-kpi-trends.test.ts`** (new, 6 assertion groups) wired into `.github/workflows/ci.yml` as "Test JD KPI trends".
  3. **`jd-business-platform` `kpi.trends` action** — admin/manager only (existing guard), `months_back` clamped to 1–24, workspace-scoped reads capped at 500 rows per table; throws on any table error (fail-closed, no partial mix silently returned).
  4. **Business Platform → KPI trends tab** — trailing 3-month movement cards + full month-by-month table (counts and per-currency money) + method/limitations disclosure. No new dependencies; plain table rendering.
- **Deployed:** `jd-business-platform` v4 ACTIVE (2026-11-12, owner-authorised) carrying the new `expense.anomalies` (JD-009) and `kpi.trends` (JD-010) actions; relative `../_shared/` imports match the v3 deployment pattern. **NOT smoke-tested:** live action invocations, 401-vs-500 behaviour, and `_shared/` resolution in the deployed bundle are unverified from this sandbox; no live smoke; KPI alerting/thresholds NOT built; won-opportunity attribution is a creation-month approximation (no `closed_at` exists); workforce KPIs absent; JD-UPG-120/165 stay `partially_implemented`.
- **Token usage:** none generated; none estimated.
- **Files:** `supabase/functions/_shared/jd-kpi-trends.ts` (new), `supabase/functions/_shared/jd-kpi-trends.test.ts` (new), `supabase/functions/jd-business-platform/index.ts` (import + `kpi.trends` action), `src/pages/jd-business-platform.jsx` (tab, state, load branch, panel), `.github/workflows/ci.yml` (new Deno step), `upgrades/OUTSTANDING-REGISTRY.md` (JD-UPG-120/165), `upgrades/CHANGELOG.md`.

### JD-011 — Production deploy of jd-business-platform v4 (JD-009/JD-010 wiring)
- **Date:** 2026-11-12
- **Status:** deployed; smoke tests NOT run; CI green on PR #55
- **Preconditions:** owner authorisation 2026-11-12 (redeploy yes; merge PR #55 yes); PR #55 head `5f24d50` green (Web CI 1m21s incl. Deno steps; Vercel READY).
- **Deployed:** `jd-business-platform` **v4 ACTIVE** (version 4, updated 2026-11-12) — v3 body plus `expense.anomalies` and `kpi.trends` actions and their `_shared` imports (`jd-expense-anomalies.ts`, `jd-kpi-trends.ts`). `verify_jwt: false`, unchanged. No schema changes in this deploy.
- **NOT verified / not claimed:** no live invocation of the new actions; no 401/403/500 smoke; `_shared` module resolution inside the deployed bundle not directly observed (same relative-import pattern as v3); the UI panel/tab calls have not been exercised against the live backend; deployed ≠ smoke-tested.
- **Token usage:** none generated; none estimated.
- **Files:** `supabase/functions/jd-business-platform/index.ts`, `supabase/functions/_shared/jd-expense-anomalies.ts`, `supabase/functions/_shared/jd-kpi-trends.ts` (deployed as part of v4), `upgrades/CHANGELOG.md`, `upgrades/OUTSTANDING-REGISTRY.md`.
