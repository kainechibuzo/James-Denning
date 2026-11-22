# Change log

## 2026-11-22 — JD Skills phase 6: autonomous acquisition + per-run agentic-time metering (jd-autonomous-v1)

- **Ask, don't upload**: JD searches a curated, code-reviewed allowlist of `anthropics/skills` (18 capabilities, offline deterministic matching), pins the upstream commit, fetches only the skill's instruction/reference text, repackages it through the same quarantine inspector and publishes validated versions automatically — no upload form, no review queue. Provenance (repo/ref/commit/path/package hash/policy) is recorded immutably in `jd_skill_acquisitions`; no human review row is fabricated, and anything that is not fully clean stays on the human path.
- **Pay per agentic time, with the human checkpoint at spend**: loading an acquired skill for a run requires `jd_confirm_run_skill_cost` — an explicit recorded confirmation with a bounded estimate — enforced inside `jd_skills_load`; actual wall-clock agentic seconds are written to `jd_agent_time_ledger` by a trigger when the run completes. Pricing recorded as not-yet-computed; metering first.
- **Hard allowlists**: hosts (`api.github.com`, `codeload.github.com`), source repo/ref/policy, pinned 40-hex commit, upstream path shape, text-only file selection (`bin`/`scripts`/`hooks`/`install` and all binaries never selected), size bounds everywhere. Nothing is ever executed.
- **Live bug fixed**: clean packages inspecting as `validated` were rejected by the importer (its tests only covered `needs_review`) — starter imports could never complete. Importer now records `validated` as `needs_review` with the true status preserved; service maps identically.
- New/changed: `_shared/jd-skills-source-index.mjs`, `_shared/jd-skills-zip.mjs`, `_shared/jd-skills-acquire.ts`, `jd-skills-service.ts` (`skills.search`, `skills.acquire`), `jd-automation` flag `JD_SKILLS_AUTONOMOUS`, migration `20261122210000_jd_skills_autonomous.sql` (+ rollback), skills-client + dashboard "Ask JD to find a skill" panel, `scripts/test-skills-autonomous.mjs` (11 PGlite/unit tests). Gates: skills 61/61, usage 104, registry 92, agents 63, execution 276+2, backend-release 82, history 25, navigation 93, workforce 36, deno check clean, runtime tests 20, verify:web + build green.

## 2026-11-22 — JD Skills phase 5: catalog schema live and release flag set (function release pending)

- **Database:** migration `jd_skills_catalog` applied to the live James-Denning project (`thklwiybjuhrjqrrxyid`) via the Supabase Management API with automatic rollback-on-failure. Verified live: 7 `jd_skill_*` tables with RLS enabled, 10 catalog functions, 3 immutability triggers, service-role-only execute grants, private `jd-skill-packages` bucket (ZIP only, 20 MiB cap).
- **Smoke test:** with a real admin profile, `jd_read_skills_catalog` returned the correct empty tenant catalog and `jd_create_skill_import` issued a genuine quarantine target; the smoke import was then marked `rejected` with an explanatory note (audit trail untouched).
- **Release flag:** `JD_SKILLS_ENABLED=true` set as a project Edge secret alongside the existing release gates.
- **Pending:** the deployed `jd-automation` (v24) predates the skills service, so the code path stays dark until a reviewed `deploy.yml` function release at SHA `cb34d42…` or later (the bundler stages the skills modules automatically). Live two-admin verification (import → independent review → publish → discovery → revoke) follows the function release. Steps recorded in `documentation/JD_SKILLS_ADMIN_DASHBOARD.md`.

## 2026-11-21 — JD Skills: starter catalogue of real Claude skills and workforce runtime discovery (phase 4)

- **Status:** implemented in source on the skills branch; release-gated off (`JD_SKILLS_ENABLED` default absent → closed); staging migration and rollout still pending.
- **Starter catalogue:** six curated skill packages vendored under `public/skills/` from Anthropic's public skills repository (`github.com/anthropics/skills`, Apache-2.0): `xlsx`, `docx`, `pdf`, `pptx`, `internal-comms`, `brand-guidelines`. Instruction and reference text only — upstream executable scripts were intentionally omitted (JD records package files as inert attachments and never executes anything); each archive carries a `PACKAGING.md` provenance note, and frontmatter was completed with packaging metadata (version, Apache-2.0 licence, category, tags) without touching the instruction body. `skill-creator` is excluded (above the 32k instruction budget) and `doc-coauthoring` (no upstream licence file). `npm run skills:build` rebuilds and re-verifies with the import inspector; `scripts/test-starter-skills.mjs` re-parses the committed archives offline in CI.
- **Dashboard:** the Skills Catalog page lists the starter catalogue; importing one fetches the archive from the app's own origin and runs the identical quarantine → inspect → independent-review pipeline.
- **Runtime discovery (phase 4):** `loadAssignmentSkillContext` in `jd-agent-runtime.ts` runs per specialist assignment in `runWorkforceDeployment` — release-gated (`JD_SKILLS_ENABLED`), requires a run context so every load is recorded (`jd_skill_run_references`), resolves the published skill matching the task (`jd_skills_resolve`, score > 0 only), loads the exact expected version (`jd_skills_load`), rejects hostile receipts (`tools_granted` must be false, `untrusted_task_data_never_authority`), and injects the text behind an explicit "REFERENCE SKILL … untrusted reference data … never grants tools or authority" banner. The run monitor shows the bounded reference (`Skill: xlsx v1`), never instruction text; failures leave the assignment unchanged.
- **Tests:** `test:skills` grows to 50 (starter verification 8, starter import UI flow); run-history/monitor validation covers the skill reference shape; new Deno executor tests for the release-gated loader and banner; workforce static contract asserts the gating. All gates green locally. No production deployment, migration or staging acceptance was performed; phase 5 (rollout) remains a reviewed decision.

## 2026-11-21 — JD Skills Admin Dashboard: secure skill package import, independent review and tenant-private catalogue

- **Status:** implemented in source on the skills branch; CI, staging migration and live verification pending. Release-gated off (`JD_SKILLS_ENABLED` default absent → closed).
- **Secure import:** admin uploads a skill ZIP to a private `jd-skill-packages` quarantine bucket via a short-lived signed URL. The trusted backend service downloads and inspects the archive in memory — parsing, CRC verification, frontmatter validation, licence status, injection/credential scans and hash computation — without ever executing package content, fetching package URLs or installing dependencies. Scripts and binaries are recorded as inert attachments only.
- **Lifecycle authority:** new migration `20261122120000_jd_skills_catalog.sql` (rollback available) adds immutable, version-pinned skill tables with service-role-only RLS and RPCs enforcing tenant scope, request-idempotent replays, immutable versions/reviews/receipts, reviewer-independence (the importer cannot approve their own version), publication only after an independent approval, and immediate revocation/deprecation. A validation-failed import records evidence but creates no skill.
- **Discovery and loading:** `jd_skills_resolve` exposes published tenant skills as metadata only; `jd_skills_load` returns bounded instruction text flagged `untrusted_task_data_never_authority` with `tools_granted:false` and records the exact skill version on the run. Loading never grants tools, execution authority, hiring or billing.
- **Dashboard:** admin-only `jd-skills` nav entry (icon `package`), `page:jd-skills` permission and `src/pages/jd-skills.jsx` page with inspection reports, note-gated approve/reject/publish/revoke/deprecate confirmations and a metadata-only discovery preview; `skills-client.mjs` validates every read-back.
- **Tests:** new `test:skills` suite (package inspection 10, PGlite SQL 13, UI 9, service contracts 9 — all green) wired into Web CI, verify and deploy workflows; `deno check` passes for both endpoints. No production deployment, migration or staging acceptance was performed. Phases 4–5 (workforce discovery wiring, rollout) are documented but intentionally not enabled.

## 2026-11-21 — JD Agent Execution Engine: workforce deployment, execution authority and Agent Factory

- **Status:** implemented in source on `arena/b529496d-james-denning`; CI, staging migration and live verification pending.
- **Deployment:** `deploy_specialist_workforce` deploys 1–5 specialists (eight built-in roles plus tenant-published execution-authorised registry definitions) on separate bounded assignments through a new isolated executor (`runAgentAssignment`) in the existing `jd-agent-runtime`. Single-specialist delegation now streams silently instead of polluting the visible response.
- **Tool access:** specialists receive only frozen read-only allowlisted tools, intersected with the deploying user's role-allowed tools; denied tools are reported, never granted. Specialists cannot approve, hire, spend, deploy, write records or create further agents, and every deliverable requires independent JD verification before completion.
- **Execution authority:** new migration `20261121180000_jd_agent_execution_engine.sql` adds per-agent `execution_authorized`/`execution_grant_approval`, the `jd_agent_execution` RPC lifecycle (request → independent review → grant → revoke), reviewer-independence, evidence pinning, expiry enforcement, version-change authority reset, and read-service execution fields. The generic Review Centre route refuses to decide these reviews.
- **Agent Factory:** `propose_agent_definition` saves validated specialist proposals as immutable registry drafts for human review; proposals are never executable, hireable or billable.
- **Monitoring:** bounded `workforce.deployed` audit events and per-agent workforce cards in Automation runs (agent reference, source, status, granted read tools, verification state — never report content).
- **Governance:** both new surfaces are release-gated (`JD_AGENT_WORKFORCE_ENABLED`, existing `JD_AGENT_REGISTRY_ENABLED`) and fail closed; usage flows through the run's existing shadow ledger with no new billing path.
- **Tests:** new `test:workforce` suite (engine contracts, runtime invariants, real candidate SQL in PGlite, UI flows) plus Deno executor tests; capability contract now classifies specialist delegation (pre-existing gap fixed). No production deployment, migration or staging acceptance was performed.

## 2026-11-15 — Claude MCP native JD capability parity

- **Status:** implemented in source on `feat/claude-mcp-native-capability-parity`; CI and live OAuth/runtime verification pending.
- **Scope:** expose the same role-filtered, low-risk native tool registry used by JD chat through the authenticated inbound MCP server.
- **Shared execution:** MCP tool discovery and invocation now use `getJdMcpToolDefinitions` and `executeJdMcpTool` from the existing JD runtime. No second business-logic implementation is introduced.
- **Coverage:** organisation, department, workforce, performance, hiring, billing, expense/KPI intelligence, operational setup, shared memory, settings, audit/activity, email delivery, document drafts and connected MCP operations.
- **Security:** the authenticated user's workspace and role are server-derived; runtime role checks are repeated at execution; medium/high/critical-risk tools are not exposed for automatic MCP execution. Blueprint submissions create a conversation/run context and remain pending administrator review.
- **Schemas:** JSON Schema tool parameters are converted into Zod schemas and covered by unit tests.
- **Verification:** CI checks/tests were updated. Actual CI results, OAuth login/consent, live Claude tool discovery, role-by-role access, cross-tenant denial and deployed endpoint verification remain pending. No production deployment or migration was performed.

## 2026-11-15 — JD assistant-first workspace and runtime capability awareness

- **Status:** implemented in source on `feat/jd-assistant-first-workspace`; CI and live deployment verification pending.
- **Assistant experience:** keep the JD Assistant conversation mounted as the primary workspace while opening Departments, AI Usage and Automation Runs as contextual overlays instead of replacing the assistant page. Add a one-tap capability overview prompt.
- **Capability awareness:** make `get_jd_capability_inventory` enumerate the actual runtime tool registry, including descriptions, risk levels, role availability and whether each tool is exposed for assistant execution.
- **Model behaviour:** instruct JD to consult its live registered capability inventory before answering capability questions; distinguish source registration from deployment, configuration, migrations and authenticated smoke-test evidence; do not promise unsupported actions.
- **Scope and safety:** no production deployment, migration, external action or approval bypass. High-risk tools remain unavailable for automatic model execution; role checks and existing server-side execution policies remain authoritative.
- **Validation:** source-level structural checks completed. Full web build, Deno type-check/tests, authenticated runtime tests and deployment verification remain pending.

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

### JD-012 — Portal-wide responsive layout repair (mobile overflow)
- **Date:** 2026-11-12
- **Status:** implemented and verified locally (36 routes at 360/390/430px and desktop 1440px); not deployed
- **Priority:** high (user-reported: "the UI across the whole site is severely broken")
- **Evidence:** User screenshot of Generate Bills at 393px showing the two-column `1fr 1fr` layout clipped at the right edge — the Generation Summary panel and its "Generate Bills" action were cut off, and the Cycle/Period selects truncated their labels.
- **Root cause (single, systemic):**
  Components declare layout with inline styles, e.g. `style={{display:"grid", gridTemplateColumns:"1fr 1fr"}}`. Inline declarations outrank normal stylesheet rules, so the only way to make them responsive is an attribute selector on the serialised style attribute. React writes inline styles through the CSSOM, which normalises the value: `repeat(3,1fr)` becomes `repeat(3, 1fr)` and the declaration reads `grid-template-columns: 1fr 1fr` (space after the colon). The existing phone rules were written against the *authored* value (`[style*="grid-template-columns:repeat(3,1fr)"]`), so they never matched. Consequently no inline multi-column grid ever collapsed, and every two-column page overflowed its viewport on a phone. The same page-scoped `<style>` block also carried a blanket `table{min-width:520px}` that pushed empty-state rows wider than the screen.
- **Secondary defects found while verifying:**
  1. Literal `\u2026` escape sequences in JSX attribute literals. JSX string attributes do not process JavaScript escapes, so placeholders on Send Email and Announcements displayed "Search name or email\u2026" verbatim, and several JSX text nodes showed "\u2022" / "\u2014".
  2. `overflow-wrap:anywhere` on all text broke labels mid-word ("OUTSTANDI NG") in narrow stat cards.
  3. Flex control clusters were squeezed by default `flex-shrink:1` until button labels were clipped ("Send Test" → "Send", "Save" → "Sav") and severity chips wrapped "CRITICAL" onto two lines.
  4. The phone header carried five controls plus the page title, truncating every title to "Generate B..."; Settings, Profile and Sign Out were all duplicated elsewhere.
- **Implemented:**
  - `src/styles/system.css`: new documented layout-foundation layer — fluid containers (`*{min-width:0}`), intrinsic `minmax(0,1fr)` floors for every inline multi-column grid, phone collapse at 760px matching the *serialised* style attribute (value fragments such as `"1fr 1fr"` and `"repeat(3,"` rather than the normalised declaration prefix), 2-up rhythm for stat rows with the trailing odd `StatCard` spanning full width, wrapping for `main` header/toolbar/tab rows, and shared `.jd-table-wrap` / `.jd-modal-card` / `.jd-stat-grid` hooks.
  - `src/AppDemo.jsx`: content-aware `table{min-width:100%}` replacing the blanket 520px floor (deliberately wide tables keep their own floor and still scroll); phone header decluttered to menu + title + theme/help/notifications; compact icon theme toggle; Settings/Profile header duplicates hidden on phones (both remain in the sidebar, sign-out already lived there).
  - `src/components/ui.jsx`: `StatCard` and `EmptyState` made shrink-safe; `EmptyState` no longer centres off-screen inside a horizontally scrollable table.
  - `src/pages/fees.jsx`, `src/pages/students.jsx`: empty states moved out of the scrolling table so the message is visible without horizontal scrolling.
  - `src/pages/comms.jsx`, `src/pages/access.jsx`: literal `\uXXXX` escapes decoded in JSX text nodes and attribute literals.
  - `vite.mobile.config.js`: `manualChunks` converted from object to function form (Vite 8 / rolldown rejects the object form, so `npm run build:mobile` failed before any of this work).
  - `scripts/verify-web-build.mjs`: CI guard asserting the responsive rules exist, that selectors match the serialised (`repeat(3, 1fr)`) form, and that no literal `\uXXXX` escape survives in a JSX attribute.
- **Verification:** Puppeteer + Chromium at 360, 390 and 430px: 25 routes swept per width, **0 pages with horizontal overflow** (previously Assignment, Generate Bills, Billing Analytics, Send Email, People Approvals, Settings, My Profile, Payment Tracker, Billing Items, Notices, Hiring and the Access Requests family). Desktop 1440px re-checked: no overflow, two-column layouts retained. Dark mode confirmed. Capacitor mobile entry builds and renders. `npm run verify:web` passes.
- **NOT done / not claimed:** no live smoke test against production; the Vercel deployment is unchanged; `MobileApp.jsx` (the separate Capacitor screen set) was not audited page by page for inline-grid overflow; toolbars that are genuinely tabular still scroll horizontally by design.
- **Token usage:** none generated; none estimated.
- **Files:** `src/styles/system.css`, `src/AppDemo.jsx`, `src/components/ui.jsx`, `src/pages/fees.jsx`, `src/pages/students.jsx`, `src/pages/comms.jsx`, `src/pages/access.jsx`, `vite.mobile.config.js`, `scripts/verify-web-build.mjs`, `upgrades/CHANGELOG.md`.

### Release record — master `d163dcf` (2026-11-12)
- **Source:** master commit `d163dcffb16af6dc1becb00a0d18ab73605a628a`.
- **Application build:** GitHub Actions run `43288226728` passed.
- **Vercel production:** deployment `dpl_Hr6VErUgvdgD1NHb5Xb29QMXK5fB` reached **READY** for this exact SHA; aliases include `rgs-portal-master.vercel.app` and `james-denning-james-projects-57651351.vercel.app`.
- **Scope of verification:** deployment readiness and application build only. This does not claim authenticated production smoke tests, full role-isolation tests, or browser E2E against production data.


### JD-231 — Reduce JD model round trips and instrument latency
- **Date:** 2026-11-13
- **Status:** implemented on `perf/jd-model-latency`; CI and application verification passed; staging verification pending; not deployed.
- **Changes:** JD now instructs the model to batch independent read-only tools into one parallel round and avoid redundant calls. When configured for `openrouter/free`, the runtime pins follow-up tool rounds to the actual model returned by the first successful response; explicit fixed model configuration remains unchanged. Each model request records `latency_ms` alongside model identity and provider usage. The selected model is included in the durable checkpoint so retries/resumes retain the same model.
- **Safety:** No queue, lease, retry, tenant-scope, approval or persistence semantics were removed. No database migration or production secret change.
- **Tests:** Added Deno unit coverage for free-router model pinning, malformed model metadata and preservation of explicit model configuration. PR #70 Web CI and application verification passed.
- **Deployment:** Production remains on the existing deployed worker version; no production redeploy was performed.
- **Token usage:** No OpenRouter usage generated by these repository edits; none estimated.
- **Files:** `supabase/functions/_shared/jd-agent-runtime.ts`, `supabase/functions/_shared/jd-agent-runtime.test.ts`, `upgrades/JD-231-MODEL-LATENCY.md`, `upgrades/OUTSTANDING-REGISTRY.md`, `upgrades/CHANGELOG.md`.


### JD-232 — Socrates-inspired streamed responses, long-output handling and document drafts
- **Date:** 2026-11-13
- **Status:** implemented in source; CI and application verification passed; staging verification pending; not deployed.
- **Scope:** Switch JD's OpenRouter Responses API requests to SSE; parse text-delta and terminal events; persist partial assistant output in the existing tenant-scoped message row; return active partial messages from the authenticated job-status action; refresh partial content in ChatHome; render HTTPS file links; continue max-output-token responses up to two times with checkpointed continuation text/count; never execute incomplete function-call arguments; route quick and deep tasks to optional configured model rungs; record per-request first-token latency; add private TXT/MD/CSV/JSON/HTML/CSS/JS/TS/PY/SQL/XML/YAML/DOCX/XLSX/PPTX document and source-file creation backed by the existing document bucket and `jd_business_documents` table, with one generated file per tool round.
- **Socrates comparison:** Adopted task routing, streaming, bounded continuation and staged document output. Kept JD's existing parallel tool-call execution because it is already more concurrent than Socrates' single-call-per-round loop.
- **Safety:** The new file capability creates only a private draft for admin/manager/bursar roles. It does not publish, email, or modify existing records. File size is capped at 95 KB; storage paths are generated server-side; tenant scope and creator identity come from the worker context. No schema migration was added.
- **Validation:** Added Deno tests for SSE framing, terminal events, chunk boundaries, incomplete-output continuation and model routing. CI workflow now runs those tests. Added a Deno binary-output smoke test for DOCX, XLSX and PPTX generation; source-format and path-traversal tests are also included. CI and application verification passed in PR #70. Actual staging storage, signed download, checkpoint-resume and tenant-isolation checks are still pending; no staging Supabase project or development branch is currently available.
- **Deployment:** No production Edge Function deployment or secret changes were made. Optional `JD_MODEL_FAST_NAME` and `JD_MODEL_REASONING_NAME` secrets are documented but not configured.
- **Token usage:** No OpenRouter calls were generated by repository edits; no token/cost estimate recorded.
- **Files:** `supabase/functions/_shared/jd-agent-stream.ts`, `supabase/functions/_shared/jd-agent-stream.test.ts`, `supabase/functions/_shared/jd-agent-routing.ts`, `supabase/functions/_shared/jd-agent-routing.test.ts`, `supabase/functions/_shared/jd-agent-runtime.ts`, `supabase/functions/jd-execution-worker/index.ts`, `supabase/functions/jd-automation/index.ts`, `src/chat/ChatHome.jsx`, `src/chat/RunMonitor.jsx`, `docs/jd-autonomous-automation.md`.

### JD-233 — Wire business finance intelligence into JD chat
- **Date:** 2026-11-13
- **Status:** implemented in source; CI and application verification pending; not deployed.
- **Scope:** Add two read-only JD tools: `get_business_expense_anomalies` reads workspace-scoped approved/paid expense records and active budgets, then invokes the existing deterministic anomaly analyser; `get_business_kpi_trends` reads workspace-scoped cash transactions, expenses, opportunities, support cases and customers, then invokes the existing monthly KPI analyser.
- **Safety and data quality:** Both tools are admin/manager-only and derive `school_id` from the authenticated agent context. No writes, payments, approvals or external calls. Currency groups remain isolated. Queries use bounded result sets and exact counts; outputs expose sample truncation, source counts and date windows. Any source query error fails the entire report rather than silently returning a partial analysis. The KPI window is clamped to 3–24 months, with a safe 12-month fallback for invalid input.
- **Tests:** Added runtime registry assertions for both tools. Existing `jd-expense-anomalies.test.ts` and `jd-kpi-trends.test.ts` cover the underlying deterministic analysis helpers and are already wired into CI. GitHub Actions for this PR are the authoritative runtime/type/build verification.
- **Not done / not claimed:** No production Edge Function redeploy, migration, credentials change or live data smoke test. This wires existing business analytics into JD's agent tool registry; it does not add finance write tools, cash reconciliation or alert escalation.
- **Related registry items:** JD-UPG-058 and JD-UPG-077 remain partially implemented pending deployment and authenticated smoke verification.
- **Token usage:** No model-provider calls generated by these repository edits; none estimated.
- **Files:** `supabase/functions/_shared/jd-agent-runtime.ts`, `supabase/functions/_shared/jd-agent-runtime.test.ts`, `upgrades/OUTSTANDING-REGISTRY.md`, `upgrades/CHANGELOG.md`.


### JD-234 — Structured visual workspace for JD chat
- **Date:** 2026-11-13
- **Status:** implementation committed on `feature/jd-visual-workspace-v2`; CI/build and staging verification pending; not deployed.
- **Scope:** Add a bounded React renderer for structured assistant UI blocks: checklists, workflow stage maps, decision questions, execution timelines, department workload panels and evidence summaries. The execution worker assembles `content_json.visual_workspace` after a background run from tenant-filtered persisted `jd_operational_tasks`, `jd_automation_steps` and recent actor `jd_audit_events`; ChatHome renders it below the assistant response. Department workload starts from the latest approved/provisioned `jd_organisation_blueprints.blueprint_json.departments`, including departments with zero tasks, then joins actual task records; when no approved blueprint exists, it clearly falls back to task department labels. Task checkboxes invoke the authenticated `operations.task.transition` action: queued → in_progress → completed, with manager/admin role checks, tenant scoping, transition validation, optimistic concurrency and audit events.
- **Safety and integrity:** Operational task and department data are suppressed for non-manager roles. Evidence contains persisted step/audit IDs plus privacy-safe numeric/boolean tool-result summaries; raw tool outputs and personal records are not copied. Empty evidence remains pending. Task samples disclose truncation.
- **Verification:** Added web-build guards and Deno tests for persisted workspace assembly, approved-blueprint department aggregation, evidence summaries and empty-source behavior. GitHub CI remains authoritative; no passing run is claimed yet.
- **Not done / not claimed:** No staging environment has been created; no authenticated staging test, production Edge Function deployment, production smoke test or latest-head preview deployment is claimed.
- **Files:** `src/chat/JDVisualWorkspace.jsx`, `src/chat/ChatHome.jsx`, `supabase/functions/_shared/jd-agent-runtime.ts`, `supabase/functions/_shared/jd-visual-workspace.ts`, `supabase/functions/_shared/jd-visual-workspace.test.ts`, `supabase/functions/jd-execution-worker/index.ts`, `supabase/functions/jd-automation/index.ts`, `.github/workflows/ci.yml`, `docs/jd-visual-workspace.md`, `scripts/verify-web-build.mjs`.


### JD-235 — Talent Intelligence, Recruitment and PayrollGuard specification
- **Date:** 2026-11-17
- **Status:** planning specification committed; no implementation claimed.
- **Scope:** Provider-neutral model routing and evaluation; separate research credentials; permitted public-portfolio discovery; evidence-backed candidate profiles; direct-email and AI-discovered recruitment with approval; recruitment pipeline and offer/appointment distinctions; PayrollGuard payroll funding architecture, deterministic calculations, provider-confirmed payments, reconciliation, employee payslips and salary-protection controls; workforce lifecycle integration; multi-agent coordination and connector discovery.
- **Safety and governance:** Research and email credentials remain server-side and separate from banking credentials. Public-source research must respect access restrictions, privacy, retention and opt-out requirements. Recruitment outreach, offers, appointments, salary changes and live payment batches require appropriate authorisation. Payroll arithmetic and payment status are determined by deterministic software and authoritative provider evidence, never by an LLM. Regulated financial institutions retain custody of funds.
- **Model note:** Proposed model roles are provider-neutral. Model names and IDs discussed during product planning are not treated as verified or available until checked against live provider catalogues and evaluated.
- **Not done / not claimed:** No application code, database migration, API credential, provider connection, email outreach, candidate collection, employee appointment, payroll calculation, live payment, staging test or production deployment was performed by this documentation change.
- **Token usage:** No model-provider usage generated by repository documentation edits; none estimated.
- **Files:** `upgrades/JD-235-TALENT-INTELLIGENCE-PAYROLLGUARD.md` (new), `upgrades.md`, `upgrades/README.md`, `upgrades/OUTSTANDING-REGISTRY.md`, `upgrades/CHANGELOG.md`.
