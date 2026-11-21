# JD conversation response engine — rollout and verification

## Scope

The conversation now renders validated versioned message/choice/form responses, local rich text/code/math, durable answer drafts and submission identifiers, recorded operational results, and review-only approval links. Ordinary replies no longer request unrelated task/department dashboard data. Existing navigation and execution infrastructure remain in use. Model output does not authorize execution or manufacture success cards.

Main changes: `src/chat/{ChatHome,StructuredResponse}.jsx`, `conversation-state.mjs`, `structured-response.css`; shared edge `jd-response.mjs`, `jd-chat-submission.mjs`, `jd-response-results.mjs`, agent instructions; `jd-automation` and `jd-execution-worker`; conversation/mobile styles; protocol, database adapter, provider and browser tests plus CI. Package changes add local deferred KaTeX and highlight.js. Landing illustration alt text aligns with existing verification requirements.

History reads now return latest messages with an explicit earlier-message cursor. This cursor is timestamp/id bounded and tenant/owner checked. Latest-history and interaction tests pass; exhaustive multi-page production history has not been exercised.

## Authorization gate and order

No migration, deployment, production integration action, push or PR was performed for this task. Obtain authorization and a database backup before rollout.

1. Apply `supabase/migrations/20261121100000_jd_conversation_interactions.sql` after existing execution migrations. The new service-only RPC atomically records messages/runs/audits and rejects duplicate answers. Its optional trigger argument preserves upload metadata. No existing conversation tables are replaced.
2. Deploy both edge functions and shared helpers together; deploy web assets after the migration and functions. Keep old clients operational during deployment. Coordinate rollout to avoid mixed worker protocols.
3. Smoke-test authenticated tenant and colleague isolation, real upload metadata, request replay while running, provider streaming, refresh/reopen, earlier history paging, review decisions and worker polling against the authorized environment. Verify actual execution/audit records, not assistant prose.
4. Monitor errors and queue latency. If approval creation was interrupted, replay returns a safe paused error rather than creating duplicate approvals or starting execution; an operator must reconcile that orphaned paused run.

## Rollback

Roll back clients/functions together before applying `supabase/rollback/20261121100000_jd_conversation_interactions.rollback.sql`. It removes the new RPC and indexes, not recorded messages, runs, audit events or interaction answers. Keep the new renderer available when reviewing already-written structured responses, or accept plain-text fallback in older clients. Drain/reconcile in-flight jobs and paused approvals explicitly. The SQL-adapter rollback test verifies message preservation.

## Local verification

- Protocol, SQL-backed adapter, tenant/RLS, upload and rollback: 16 passing tests. These are not tests against a deployed Supabase instance.
- Deno stream/runtime/Gemini/conversation orchestration: 31 passing tests; edge entrypoint type checks pass.
- History 23, execution 276, tasks 257, navigation 93, approvals 3 passing tests.
- Conversation layout 48 and mobile polish 60 states pass. Reference/site layout suites pass.
- Structured conversation Chromium at 320/708/1280 passes: rich text/table/code/math, interaction types/validation, partial streaming suppression, reload/isolation/retry, polling outage, recorded results and review-only approval links; fixtures report no browser errors or unexpected external requests.
- Web verification and mobile build pass; targeted changed-file ESLint and Deno lint pass; diff whitespace check passes; npm audit reports zero vulnerabilities.

## Remaining limits

Browser/provider tests use synthetic transport, not live model credentials or real external execution. No production tenant data or integrations were exercised. The separate visual-workspace Deno suite was blocked by JSR manifest access and is not claimed as passing. The existing deferred spreadsheet chunk size warning remains nonfatal. Targeted lint is not a claim that every historical repository file passes lint. Approval-creation interruption requires operational reconciliation as noted above.
