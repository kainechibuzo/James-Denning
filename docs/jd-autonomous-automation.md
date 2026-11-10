# JD autonomous automation engine

## Product contract

JD runs in autonomous mode across the active organisation workspace. The workspace is resolved from the authenticated user's `profiles.school_id`; a client-supplied tenant identifier is never accepted as authority.

The engine lifecycle is:

1. Capture a chat or file-triggered request.
2. Resolve the authenticated actor and workspace.
3. Create an idempotent automation run.
4. Classify impact and prepare a plan.
5. Execute only registered tools whose permissions and risk policy allow execution.
6. Verify each result, persist outcomes, and append audit events.
7. Summarise completed, blocked, or failed work in the conversation.

## Risk policy

- **Routine / low impact:** may execute autonomously after the tool registry and permission checks are enabled.
- **Medium impact:** execute only when the action is reversible, within the actor's role, and covered by an organisation policy.
- **High impact:** require an approval record from an authorised approver before execution. Examples: sending external messages, payment/refund/transfer, permanent deletion, changing access, and legally binding submissions.
- **Critical:** blocked by default until a separate, explicit capability is enabled.

Autonomy never overrides tenant isolation, role permissions, or the approval policy.

## Data model

The migration creates tenant-scoped conversations, messages, automation runs, steps, approvals, and append-only audit events. RLS derives tenant scope from the authenticated profile. Server-side service-role access is restricted to the Edge Function, which revalidates the JWT and resolves the profile before using the service client.

## Current implementation boundary

This branch introduces the tenant-scoped control-plane schema and an authenticated request/history gateway. The gateway currently records requests and classifies obvious high-impact language. It deliberately does **not** execute organisation mutations or claim that a task is complete. The model planner, file parsing, domain-specific tool adapters, approval decision endpoint, and result verifier must be added and tested before autonomous execution is enabled in production.

Required next slices:
- provider adapter + structured planner (strict JSON schema, bounded context, prompt-injection isolation)
- file ingestion and preview/deduplication (CSV/XLSX/PDF; no write before preview)
- read-only organisation tools for each enabled industry/module
- write tools with server-side permission checks, idempotency, and compensating actions
- approval create/decide endpoints and expiry handling
- integration tests for cross-workspace isolation, forged tenant IDs, replay, duplicate uploads, and approval bypass

## API

`POST /functions/v1/jd-automation`

- `{ action: "submit", message, conversationId?, idempotencyKey?, triggerType? }` records a request and returns a run ID.
- `{ action: "history", conversationId }` returns the latest 100 messages in a conversation.

The function requires a valid Supabase user JWT (`verify_jwt = true`). No service key is exposed to the browser.
