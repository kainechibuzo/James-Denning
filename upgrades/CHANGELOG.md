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
- **Validation:** Production web build, application verification, Deno unit tests and secured Edge Function type-check all passed on the PR head. Vercel preview deployment completed successfully.
- **Remaining:** Merge and production deployment verification. Durable background jobs, leases, resumability and crash recovery remain a separate follow-up; this synchronous handler is not a durable queue.
