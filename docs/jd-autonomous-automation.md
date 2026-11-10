# JD autonomous agent runtime

## Product contract

JD is an organisation-wide agent, not a scripted chatbot. It receives an objective, reasons over available workspace context, chooses registered tools, executes bounded steps, inspects results, and returns a verifiable outcome. The workspace is derived server-side from the authenticated user's `profiles.school_id`; client-supplied tenant IDs are never trusted.

## Agent loop

1. Authenticate the Supabase user JWT and resolve their profile/workspace.
2. Load bounded conversation history and create an idempotent automation run.
3. Send the objective and only role-authorised tool definitions to the configured model provider.
4. Validate every returned function name and JSON argument payload against the server-side registry.
5. Execute eligible tools, return structured outputs to the model, and continue for at most eight turns.
6. Persist tool events, assistant response, run result and audit events.
7. Stop safely on timeout, provider error, permission denial, unknown tool, or turn limit.

The Responses API function-calling loop is implemented in `supabase/functions/_shared/jd-agent-runtime.ts`. The provider URL, model and key are configurable using `JD_MODEL_BASE_URL`, `JD_MODEL_NAME`, and `JD_MODEL_API_KEY` (or `OPENAI_API_KEY`). The default endpoint is OpenAI's Responses API. A future provider adapter can implement the same runtime contract without changing the tool registry.

## Available tools in this first runtime slice

- `get_workspace_overview`: aggregate workspace identity and member/hiring counts; admin, manager and bursar roles.
- `get_hiring_pipeline`: role titles and application counts by status, without applicant contact details; admin and manager roles.
- `get_billing_snapshot`: aggregate billing totals and counts, without individual records; admin, manager and bursar roles.

These are read-only tools. The model cannot execute arbitrary SQL, arbitrary HTTP requests, shell commands, or unregistered functions.

## Autonomy and risk

- Low-risk read tools can run autonomously when exposed to the authenticated role.
- Medium-risk writes must be explicitly registered, permission-checked server-side, idempotent, and reversible or have a compensating action.
- High-impact actions (payments, refunds, external communications, permanent deletion, permission changes, legal submissions) remain blocked pending a real approval workflow.
- Critical actions are disabled by default.

Natural-language keyword classification is only an additional conservative pause, not the security boundary. The security boundary is the server-side tool registry and each tool's own authorization checks.

## Persistence and tenant isolation

The control-plane migration creates conversations, messages, runs, steps, approvals and audit events. RLS scopes user access to the workspace derived from `profiles.school_id`. The Edge Function verifies the user JWT before using the service-role client; the service key is never sent to the browser. The function endpoint is configured with `verify_jwt = true`.

## Current limits — do not overclaim

This is the first working agent-runtime slice, not yet full ChatGPT-level parity. The runtime currently supports bounded tool-calling with three read-only tools and a synchronous response. It does not yet support uploaded files, image/PDF understanding, spreadsheet imports, write actions, scheduled/background tasks, web research, streaming, durable retries, or an approval decision UI. Do not tell users these capabilities are live until the relevant tool, UI, policy and integration tests exist.

## Next build milestones

1. File intake: secure upload, content extraction, spreadsheet/PDF parsing, prompt-injection isolation, preview and deduplication.
2. Read tools across all enabled industry modules, using a permission matrix rather than a school-only feature set.
3. Write tools for reversible CRUD operations, each with strict schema, role checks, idempotency, validation and post-write verification.
4. Approval workflow for high-impact actions, including approver role checks, expiry, rejection, and audit.
5. Durable worker queue, resumable run state, bounded retries and compensation.
6. Streaming chat, conversation search, attachments and activity timeline.
7. Evaluation suite for tool correctness, cross-tenant isolation, prompt injection, replay, duplicate imports, partial failures and approval bypass.

## API

`POST /functions/v1/jd-automation`

- `{ action: "submit", message, conversationId?, idempotencyKey?, triggerType? }` creates and runs an agent request.
- `{ action: "history", conversationId }` returns up to 100 messages in that conversation.

A valid Supabase user JWT is required. No service key is exposed to the client.
