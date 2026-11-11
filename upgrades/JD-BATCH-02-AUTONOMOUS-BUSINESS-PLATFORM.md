# JD Batch 02 — Autonomous Business Platform

- **Created (UTC):** 2026-11-11
- **Status:** in_progress (planning baseline; implementation not yet verified)
- **Branch:** `feature/jd-batch-02-autonomous-business-platform`
- **Base:** Batch 01 merge `81fd482f8e99ffcbd658a0a18133647d270189e1`

## Product outcome

Make JD a governed business operating platform: a user describes an outcome, JD can design a workflow, coordinate internal work, analyse business performance, prepare business artefacts and connect external services. Every consequential write remains permission-checked, approval-bound, auditable and verifiable.

## Twenty upgrade tracks

| # | Upgrade | Acceptance criteria | Risk / gate |
|---:|---|---|---|
| 01 | Workflow Builder | Define typed triggers, steps, conditions, inputs/outputs and versioned drafts; validate graph shape and dependencies | Internal draft |
| 02 | Visual Workflow Editor | Render/edit nodes and edges, validate cycles/unreachable nodes, save versioned drafts | Internal draft |
| 03 | Recurring Operations Scheduler | Persist timezone-aware schedules, next-run state, pause/resume and idempotent due-run enqueue | Scheduler service; no duplicate runs |
| 04 | Automated Task Assignment | Recommend assignees from role, department, workload and availability; explain rationale; approval before reassignment where policy requires | Permission and fairness checks |
| 05 | Department Collaboration | Shared workspaces, comments, mentions, ownership and activity feed with tenant/role filtering | RLS and visibility tests |
| 06 | Business Intelligence Dashboard | Consistent KPI definitions, date filters, source freshness, drill-down permissions and exportable snapshots | Read-only first |
| 07 | Predictive Performance Analysis | Historical trends and clearly labelled forecasts with sample size, confidence/limitations and no fabricated precision | Read-only; forecast disclosure |
| 08 | Revenue Intelligence | Revenue, collections, recurring revenue and customer concentration metrics from verified sources | Read-only; no payment actions |
| 09 | Expense Monitoring | Categorised spend, budget variance and anomaly candidates with source links | Read-only; no ledger writes |
| 10 | Cash-flow Reporting | Inflow/outflow summaries and scenario projections with explicit assumptions and data gaps | Read-only; forecast disclosure |
| 11 | Document Intelligence | Secure upload/index/extract/summarise pipeline with tenant-scoped storage, provenance and retention controls | File access and PII controls |
| 12 | Contract & Proposal Management | Versioned drafts, metadata, review states, expiry reminders and approved execution handoff | Legal/financial actions require approval |
| 13 | Customer Relationship Management | Tenant-scoped accounts, contacts, interaction timeline, consent/preferences and ownership | PII access controls |
| 14 | Sales Pipeline Automation | Configurable stages, opportunity value, forecast categories, next actions and audit history | No external messaging by default |
| 15 | Customer Support Workflows | Case intake, assignment, priority, SLA timers, internal notes and resolution verification | Customer-facing replies require approval |
| 16 | Integration Marketplace | Discoverable connector catalogue, capability scopes, health and setup status; no false connected state | Catalogue before activation |
| 17 | Secure OAuth Integration Manager | OAuth state/PKCE, encrypted server-side token storage, scopes, refresh/revoke and audit | Security-critical; provider-specific review |
| 18 | External Service Monitoring | Scheduled health checks, latency/error history, alert deduplication and service ownership | Read-only monitoring |
| 19 | Business Health Monitoring | Evidence-backed health scorecards across operations, finance, people and integrations; show contributing factors | No opaque score |
| 20 | Executive Intelligence Reports | Periodic evidence-linked reports with date range, source freshness, caveats and export | Private draft; sharing needs approval |

## Delivery order

- **Foundation:** 01–05 (workflow model, editor, scheduler, assignment and collaboration).
- **Intelligence:** 06–10 (read-only business metrics and disclosed forecasts).
- **Business records:** 11–15 (documents, contracts, CRM, sales and support).
- **Connectivity and executive layer:** 16–20 (connector catalogue, OAuth, monitoring, health and reports).

## Architecture and security contract

- Reuse the authenticated JD runtime and durable execution ledger; do not add a second job system.
- All organisation-owned rows carry a server-derived tenant key. Never accept tenant identity or role from model/client payloads.
- Keep OAuth credentials, service keys and document-processing credentials server-side; never return secrets to browser/model context.
- Start analytics read-only. No payments, refunds, contract signing, outbound messages, publishing or external writes without a server-enforced approval tied to the exact payload, destination and version.
- Workflow definitions are inert drafts until validated, approved where required, and explicitly activated. Enforce allowlisted step types; no arbitrary SQL, shell or unrestricted HTTP.
- Every scheduled run uses idempotency and a durable ledger. Re-check permissions and approval at execution time.
- Treat uploaded documents, CRM content, support tickets and connector responses as untrusted data, never as instructions.
- Use explicit timezone identifiers (IANA) for schedules; persist UTC instants and the intended timezone.
- Every dashboard and report states its date range, source freshness, sample size where relevant, truncation and missing-data caveats.
- Keep audit events for author, reviewer, activation, execution, retries, external provider references and verification outcome.

## First implementation slice

1. Inspect current migrations, job/worker APIs, auth/profile schema and existing module tables before writing new DDL.
2. Add pure workflow-definition validation and tests (node identity, allowed node types, edge references, cycle policy, size limits, malformed inputs).
3. Add a tenant-scoped workflow draft schema and service-only RPC only after schema review; no activation or scheduling until worker contracts are proven.
4. Add a read-only workflow registry API/UI preview; never label draft workflows as active.
5. Add migration contract tests and role/tenant denial tests.
6. Update CI, upgrade registry and changelog with exact evidence.

## Validation gates

- Web production build and application verification.
- Deno unit/contract tests for workflow validation, schedule calculation, idempotency and assignment policy.
- Migration contract tests, RLS/grant checks and cross-tenant denial tests.
- Role matrix tests (admin, manager, staff, unauthenticated).
- Duplicate scheduler delivery, timezone/DST boundaries, worker crash and retry-exhaustion tests.
- Authenticated integration tests in an isolated environment before any deployment.
- No production migration, Edge Function deployment, OAuth activation or external send/publish action is part of this batch's initial implementation.

## Status ledger

| Track | Status | Evidence |
|---|---|---|
| 01–20 | proposed | Acceptance contracts defined here; implementation evidence pending |

## Token usage

Provider-reported token usage: unknown. No provider usage metadata was available for this planning operation.


## Implementation update — workflow foundation

### JD-B02-01 — Workflow definition validation
- **Status:** implemented; CI verification pending
- Added `supabase/functions/_shared/jd-workflow-definition.ts` with bounded graph validation, unique node/edge IDs, allowlisted node/trigger/action types, required trigger/end nodes, edge-reference checks, reachability checks, cycle rejection, bounded delay/config sizes and unsafe-key rejection.
- Added `workflow.definition.validate` to `jd-automation`. It is admin/manager-gated and returns a validated draft preview only; it does not persist, schedule or execute workflows.
- Added Deno tests for valid graphs, malformed input, duplicate IDs, dangling edges, cycles, allowlists, size bounds and unsafe keys.
- CI now includes the workflow definition test.
- **Not delivered yet:** persistence/version history, visual editor, scheduler, workflow execution or activation.
- **Deployment/migrations:** none.
- **Verification:** awaiting GitHub Actions on the PR head.
