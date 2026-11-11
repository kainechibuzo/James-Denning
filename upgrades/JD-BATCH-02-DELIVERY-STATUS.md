# JD Batch 02 — Remaining upgrade delivery status

This ledger tracks the 18 upgrades remaining after JD-B02-01 (definition validation) and JD-B02-02 (versioned drafts and approval-bound activation).

## Delivery rule

An upgrade is not complete merely because a page or schema exists. Mark it verified only after relevant unit/contract tests and CI pass. Mark it deployed only after the target migration/function/configuration has been deployed and authenticated smoke tests pass. Production database and provider changes remain separate release operations.

## Status

| # | Upgrade | Status | Scope / acceptance |
|---:|---|---|---|
| 03 | Visual Workflow Editor | in_progress | Workflow Studio editor, validation, immutable version saving, history, Review Centre submission, admin activation. Execution remains disabled. |
| 04 | Recurring Operations Scheduler | proposed | IANA timezone schedules, DST-safe next-run calculation, durable queue dispatch, idempotency and missed-run policy. |
| 05 | Automated Task Assignment | proposed | Explicit assignment policies, workload limits, role/department matching, deterministic fallback and audit. |
| 06 | Department Collaboration | proposed | Tenant-scoped department membership, shared task context, mentions/notes and role-safe visibility. |
| 07 | Predictive Performance Analysis | proposed | Evidence-backed trend and forecast outputs with sample size, confidence caveats and source freshness. |
| 08 | Revenue Intelligence | proposed | Revenue ledger aggregation, period comparisons, concentration and forecast caveats. |
| 09 | Expense Monitoring | proposed | Categorised expenses, budget thresholds, variance evidence and approval-bound edits. |
| 10 | Cash-flow Reporting | proposed | Cash-in/out timeline, receivables/payables, scenario assumptions and reconciliation warnings. |
| 11 | Document Intelligence | proposed | Secure upload metadata, extraction pipeline, untrusted-content handling and source-linked summaries. |
| 12 | Contract and Proposal Management | proposed | Versioned records, review lifecycle, renewal reminders and no e-signature without a separate provider/approval design. |
| 13 | Customer Relationship Management | proposed | Tenant-scoped customer records, contacts, activity timeline, consent and access boundaries. |
| 14 | Sales Pipeline Automation | proposed | Opportunity stages, weighted forecast, next actions and approval-bound external communications. |
| 15 | Customer Support Workflows | proposed | Case intake, assignment, priority, SLA clocks, internal notes and verified resolution. |
| 16 | Integration Marketplace | proposed | Provider catalogue, scopes, capabilities and truthful configured/connected/healthy states. |
| 17 | Secure OAuth Integration Manager | proposed | OAuth state/PKCE, encrypted server-side credentials, scope minimisation, refresh/revoke and audit. |
| 18 | External Service Monitoring | proposed | Scheduled health checks, bounded timeouts, latency/error history and alert deduplication. |
| 19 | Business Health Monitoring | proposed | Explainable scorecards with contributing evidence, freshness and missing-data caveats. |
| 20 | Executive Intelligence Reports | proposed | Date-scoped evidence-linked reports, source freshness, export and approval-bound sharing. |

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
