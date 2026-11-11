# JD Batch 02 — Remaining upgrade delivery status

This ledger tracks the 18 upgrades remaining after JD-B02-01 (definition validation) and JD-B02-02 (versioned drafts and approval-bound activation).

## Delivery rule

An upgrade is not complete merely because a page or schema exists. Mark it verified only after relevant unit/contract tests and CI pass. Mark it deployed only after the target migration/function/configuration has been deployed and authenticated smoke tests pass. Production database and provider changes remain separate release operations.

## Status

| # | Upgrade | Status | Scope / acceptance |
|---:|---|---|---|
| 03 | Visual Workflow Editor | in_progress | Workflow Studio editor, validation, immutable version saving, history, Review Centre submission, admin activation. Execution remains disabled. |
| 04 | Recurring Operations Scheduler | in_progress | IANA timezone schedules, DST-safe next-run calculation, durable queue dispatch, idempotency and missed-run policy. |
| 05 | Automated Task Assignment | in_progress | Explicit assignment policies, workload limits, role/department matching, deterministic fallback and audit. |
| 06 | Department Collaboration | in_progress | Tenant-scoped department membership, shared task context, mentions/notes and role-safe visibility. |
| 07 | Predictive Performance Analysis | in_progress | Evidence-backed trend and forecast outputs with sample size, confidence caveats and source freshness. |
| 08 | Revenue Intelligence | in_progress | Cleared cash-in by currency/category/month, pending inflows and customer-attributed receipts; invoice/recurring revenue recognition still requires a billing source. |
| 09 | Expense Monitoring | in_progress | Categorised expense intake, admin approvals, period/category/currency budgets, utilisation thresholds and over-budget alerts. |
| 10 | Cash-flow Reporting | in_progress | Manually recorded cash-in/out, pending/cleared/void reconciliation, period totals by currency; receivables/payables automation and scenarios remain open. |
| 11 | Document Intelligence | in_progress | Secure upload metadata, extraction pipeline, untrusted-content handling and source-linked summaries. |
| 12 | Contract and Proposal Management | in_progress | Versioned records, review lifecycle, renewal reminders and no e-signature without a separate provider/approval design. |
| 13 | Customer Relationship Management | in_progress | Tenant-scoped customer records, contacts, activity timeline, consent and access boundaries. |
| 14 | Sales Pipeline Automation | in_progress | Opportunity stages, weighted forecast, next actions and approval-bound external communications. |
| 15 | Customer Support Workflows | in_progress | Case intake, assignment, priority, SLA clocks, internal notes and verified resolution. |
| 16 | Integration Marketplace | in_progress | Provider catalogue, scopes, capabilities and truthful configured/connected/healthy states. |
| 17 | Secure OAuth Integration Manager | in_progress | OAuth state/PKCE, encrypted server-side credentials, scope minimisation, refresh/revoke and audit. |
| 18 | External Service Monitoring | in_progress | 15-minute scheduled fixed-endpoint probes, bounded timeouts, latency/error history and status-transition deduplication; notification delivery remains open. |
| 19 | Business Health Monitoring | in_progress | Explainable scorecards with contributing evidence, freshness and missing-data caveats. |
| 20 | Executive Intelligence Reports | in_progress | Date-scoped evidence-linked reports, source freshness, export and approval-bound sharing. |

## JD-B02-03 — Visual Workflow Editor

### Implemented in this change
- Added Workflow Studio to Business Operations.
- Loads tenant-authorised workflow drafts and immutable version history through the authenticated `jd-automation` function.
- Supports editing workflow name, description, node JSON and edge JSON.
- Calls the server-side workflow definition validator before saving.
- Saves a new immutable version using the existing optimistic version contract.
- Submits the selected latest immutable version to Review Centre.
- Exposes admin activation using an approval ID; the server revalidates the approved exact version.
- Shows definition hashes and version timestamps.
- Explicitly states that activation does not execute nodes.

### Deliberate limitations
- This is a structured editor, not a drag-and-drop canvas.
- It does not execute workflow nodes.
- It does not schedule recurring runs.
- It does not call external services or send messages.
- The activation control requires the approval ID from Review Centre.
- Database migration and Edge Function deployment are not performed by this repository change.

### Verification required
- Production web build and application verification.
- Deno tests and secured Edge Function type-check.
- Authenticated role matrix and cross-tenant integration tests in an isolated Supabase environment.
- Apply the versioning migration and deploy the Edge Function only after staging validation.

## Sequencing

The remaining work is intentionally sequenced by dependency: finish and verify workflow authoring; then scheduler and assignment; then collaboration; then finance and intelligence; then document/CRM/support records; finally provider integrations, monitoring and executive reporting. OAuth token storage and external write operations must not be represented as connected until provider-specific security and live smoke tests pass.

## Token usage

Provider-reported token usage for these repository edits is unavailable. Do not estimate it.


## JD-B02-04 — Recurring Operations Scheduler

### Implemented in this change
- Tenant-scoped recurring task schedules with daily and weekly cadence.
- IANA timezone and local wall-clock time stored per schedule.
- DST handling in the schedule calculator: spring-forward gaps move to the first valid local minute; fall-back overlaps choose the earlier occurrence.
- A bounded scheduler Edge Function, protected by the dedicated worker secret, dispatches due schedules.
- Dispatch RPC locks each schedule, verifies the expected due timestamp, creates one task with a deterministic idempotency key and advances the next occurrence atomically.
- Missed runs are coalesced into one task on the next dispatcher pass.
- Pause/resume and schedule management actions are exposed to workspace managers/admins.
- A GitHub Actions dispatcher runs every five minutes when repository secrets and the Edge Function are configured.

### Not yet verified
- Migration has not been applied.
- Edge Function has not been deployed.
- GitHub repository secrets have not been configured or validated.
- Live duplicate-dispatch, concurrent-worker and tenant-isolation tests remain required.

## JD-B02-05 — Automated Task Assignment

### Implemented in this change
- Explicit department assignment pools map eligible workspace profiles to departments; no assumed profiles.department column is required.
- Each pool member has an active flag and maximum open-task capacity.
- Assignment chooses the least-loaded eligible member in the exact department, then uses last-assigned time and profile ID as deterministic tie-breakers.
- Completed/cancelled tasks cannot be auto-assigned.
- Assignment pool changes and automatic assignments are audited.
- Recurring task creation can optionally use the same capacity-aware department assignment policy.
- Business Operations exposes assignment-pool management and per-task auto-assignment.

### Not yet verified
- Migration has not been applied.
- Live cross-tenant and concurrent assignment tests remain required.
- Existing manual assignment remains available; auto-assignment is an explicit manager action or schedule option.

### Token usage
Provider-reported token usage for this repository work is unavailable and is not estimated.


## JD-B02-06 — Department Collaboration

- **Status:** in_progress; implementation and automated checks pending.
- **Delivered in code:** tenant-scoped task discussion records; manager-only server-side list/create API; append-only comment creation; parent-comment linkage; workspace-validated member mentions; audit events; Business Operations collaboration panel.
- **Not delivered:** mention notifications, realtime updates, attachments, staff self-service access, per-department membership visibility, or production deployment.
- **Verification gate:** GitHub Web CI, Deno type-check for the new Edge Function, migration contract tests, staging migration, manager-role and cross-tenant denial tests.
- **Production state:** migration not applied; Edge Function not deployed.


## JD-B02-07–20 — Multi-industry Business Platform implementation foundation

- **Status:** implementation added; CI and staging verification pending.
- **Data model:** tenant-scoped customer/CRM records, sales opportunities, activity timeline, expenses with admin decision controls, contracts with immutable content versions, secure document metadata, support cases/internal notes, integration catalogue, OAuth connection/state metadata, service-health observations and executive report snapshots.
- **API:** authenticated `jd-business-platform` Edge Function derives workspace and role from the signed-in profile; browser-supplied tenant IDs are ignored; reads/writes are tenant-filtered; expense/contract/report decisions have role checks; record changes emit audit events. OAuth now has PKCE S256 start, one-time expiring state consumption, a public callback with code exchange, and AES-GCM encrypted server-side token bundles.
- **Delivered operational flows:** customer and opportunity CRUD with customer linking; activity timeline API; opportunity stage/weighted pipeline; expense intake and admin approval/rejection; contract draft creation with SHA-256 version 1 and review/activation state controls; support case intake, priority/status/assignment and internal-note API; cash transaction intake and clear/void reconciliation; private PDF/DOCX/TXT uploads through short-lived signed URLs with server-side size/MIME/object verification and signed downloads; generated executive report snapshots saved as drafts with expandable evidence in the workspace.
- **Analytics:** revenue won, pipeline, weighted pipeline and approved expense totals grouped by currency; cash in/out/net split by currency; trailing-three-period performance baseline grouped by currency (only with at least three periods, explicitly low-confidence); explainable business health indicators with no unsupported single score; 30-day executive report generation with source/limitation metadata.
- **Intentional gaps:** secure private document upload/download is implemented with tenant-prefixed paths and short-lived signed URLs; document scanning, extraction, OCR and summaries still require a worker and must remain pending until it runs. OAuth PKCE and encrypted token persistence are implemented but provider secrets and live callback smoke tests remain outstanding; refresh/revoke and Slack/Paystack credential flows remain open; external service monitoring has allowlisted, manager-triggered public endpoint probes and persisted observations, but no scheduled probe worker/alert delivery; report sharing/export and predictive validation are not enabled; cashflow entries must be entered and reconciled manually. Predictive baselines are descriptive, low-confidence, currency-separated, and must not be described as cash forecasts.
- **Production:** no migrations applied and no Edge Function deployed. No outbound sends, payments, refunds, contract signing or OAuth token exchange enabled.
- **Token usage:** provider-reported usage unavailable; not estimated.


## JD-B02-15 — Support SLA and resolution evidence

- Support records now expose their SLA deadline and clearly flag overdue cases while they remain open.
- A resolution summary is required in the workspace before the case can be marked resolved.
- Resolution timestamp and summary are persisted through the existing manager-authorised update action.
- Internal notes remain separate from the customer-facing resolution summary.
- Automated SLA policy calculation, notifications and escalation delivery remain unimplemented; deadlines are explicitly set on case creation.


## JD-B02-13 — Customer consent evidence

- Customer records expose consent status, last recorded timestamp and evidence/source reference.
- A consent grant or withdrawal cannot be saved without a source/evidence reference.
- The server records the authenticated actor and timestamp and the existing audit event records the update.
- Evidence source is a short reference/description; do not store sensitive document contents in this field.
