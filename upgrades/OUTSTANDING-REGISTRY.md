# James-Denning — Outstanding Upgrades Registry

> Reconciled on **2026-11-12** from `upgrades.md`, `upgrades/CHANGELOG.md`, `NEEDS_YOU.md`, `upgrades/JD-BATCH-01*.md`,
> `upgrades/JD-BATCH-02*.md`, the source tree, and a **read-only** live audit of the connected Supabase project
> (`thklwiybjuhrjqrrxyid`) and the Vercel project (`james-denning`, production).
> This registry is the single tracked list of what is unfinished. Every item carries a unique ID, a status,
> its dependencies/blockers and the verification required before it may be called done.
>
> **Evidence rule:** `implemented_unverified` never means "done". Definition of done always includes the tests and
> live checks listed in the row. `deployment_pending` means code may exist but credentials, schedules, migrations or
> deployments are missing. `not_implemented` means the capability is genuinely missing.

## Status legend

| Status | Meaning |
| --- | --- |
| `not_implemented` | No working implementation exists (may have a design note). |
| `partially_implemented` | Some code/UI exists; the user-facing workflow is incomplete. |
| `implemented_unverified` | Code exists and builds; tests/integration evidence insufficient. |
| `deployment_pending` | Code exists; blocked on credentials, migrations, deployments or schedules. |
| `blocked_decision` | Blocked on an explicit owner decision (e.g. enabling external data processing). |
| `resolved` | Completed and verified; kept here for the audit trail. |

## Verified live-state snapshot (read-only, 2026-11-12)

**Verified against production `thklwiybjuhrjqrrxyid` and Vercel `james-denning`:**

- Vercel **production** for master head `d163dcf` (`d163dcffb16af6dc1becb00a0d18ab73605a628a`) is **READY** (`dpl_Hr6VErUgvdgD1NHb5Xb29QMXK5fB`, 2026-11-12). Aliases include `https://rgs-portal-master.vercel.app` and `https://james-denning-james-projects-57651351.vercel.app`. GitHub Actions application build run `43288226728` passed. This verifies build and deployment readiness, not authenticated production smoke or role-isolation tests.
- Applied migrations include `20261111085143 jd_autonomous_automation`, `20261111085145 jd_review_centre_foundation`, `20261111085147 jd_atomic_approval_decisions`, `20261111085148 jd_private_conversation_rls`, `20261111085150 jd_durable_execution_jobs`, `20261111085151 jd_durable_execution_checkpoints`, `20261112073746 jd_business_platform`.
- **Applied 2026-11-12 (direct, owner-authorised):** `20261112084412 jd_settings_proposal_review`, `20261112084459 jd_approved_settings_executor`, `20261112084532 jd_batch01_organisation_operations_hiring`, `20261112084602 jd_task_collaboration`, `20261112084629 jd_execution_retry_controls`, `20261112084732 jd_recurring_tasks_and_assignment`, `20261112084827 jd_workflow_versioned_drafts`. All 10 backing tables verified present in `public`; entries recorded in `supabase_migrations.schema_migrations`. Runtime behaviour remains unverified end-to-end.
- **Deployed 2026-11-12 (owner-authorised):** `jd-business-document-worker` **v3** (adds pre-extraction `screenDocument` gate) and `jd-business-platform` **v3** (adds screen-on-confirm upload gate: rejected uploads are removed from storage and audited as `business.document.rejected`). Both report ACTIVE/version 3. Runtime smoke tests could not be executed from the authoring sandbox (no route to `*.supabase.co`); fail-closed behaviour must be confirmed by an authenticated caller (e.g. unauthenticated POST → 401; end-to-end test upload carrying an executable signature → 400 + object deleted).
- All 35 audited core/`jd_*` public tables have **RLS enabled**; the business platform uses server-side `service_role` only.
- **Deployed Edge Functions:** `manage-account` v6, `scheduled-digest` v2, `send-email` v2, `send-email-batch` v3, `verify-payment` v3, `jd-business-platform` **v3**, `jd-business-document-worker` **v3**, `jd-business-monitor-worker` v2, `jd-business-oauth-callback` v2, `jd-business-ops-worker` v2, `jd-business-report-share` v2.
- **Not deployed:** `jd-automation` (the JD assistant/agent runtime), `jd-execution-worker`, `jd-task-scheduler`, `jd-task-collaboration`. The JD chat is therefore not production-live even though its migrations and source exist.
- Vercel env vars present (values encrypted): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_PAYSTACK_PUBLIC_KEY`.
- npm audit was **29 vulnerabilities (3 critical / 18 high / 7 moderate / 1 low)** at branch base; this branch resolves it to **0** (see §R).

---

## §A. JD assistant and agent runtime

| ID | Item | Status | Blocked by / depends on | Done when |
| --- | --- | --- | --- | --- |
| JD-UPG-001 | Chat-first, polished, responsive JD command centre (desktop + mobile) | partially_implemented | Design pass + browser verification | ChatHome verified at phone/desktop widths; keyboard and screen-reader pass; deployed and smoke-tested |
| JD-UPG-002 | Persistent conversation history and conversational continuity | implemented_unverified | JD-UPG-016 (deploy) | Two-session continuity verified live; history tool output matches stored messages; RLS cross-user test passes |
| JD-UPG-003 | Multi-step agent planning and execution across all enabled modules | partially_implemented | JD-UPG-004, JD-UPG-016 | Agent completes a 3+ step cross-module task in staging with audit trail |
| JD-UPG-004 | Server-side tool registry complete: schemas, permissions, risk levels, validation | partially_implemented | — | All registered tools carry schema/role/risk metadata; write tools require approval; registry documented; unit tests (Deno) for schema validation |
| JD-UPG-005 | Live progress, tool activity and task status in the UI | partially_implemented | JD-UPG-016 | Run monitor shows step transitions live during a real run |
| JD-UPG-006 | Resumable long-running tasks from the UI (resume after refresh/crash) | partially_implemented | JD-004C checkpoints; JD-UPG-160+ | Kill worker mid-run; resume completes idempotently; verified in staging |
| JD-UPG-007 | File attachments and ingestion (CSV, XLSX, PDF, DOCX, TXT) from chat | partially_implemented | JD-UPG-016; document pipeline (done for business documents) | Upload from chat parsed, screened (§L), stored, and referenced in conversation; tests |
| JD-UPG-008 | User- and organisation-scoped context and memory | partially_implemented | Design (retention, consent) | Memory read/write scoped by tenant + user; cross-tenant leak test passes |
| JD-UPG-009 | OpenRouter model selection configurable per workspace; provider abstraction | partially_implemented | JD-UPG-015 env config | Model selectable via workspace setting; provider adapter interface documented; failover behaviour tested |
| JD-UPG-010 | Durable queue recovery, worker leases, resumability, crash handling | partially_implemented | **Migrations applied; worker NOT deployed**; JD_WORKER_SECRET (GitHub + Supabase) | Two-worker lease test, crash/lease-expiry test, retry-exhaustion/dead-letter test, duplicate-delivery idempotency test — all green in staging |
| JD-UPG-011 | pgmq queue compatibility verified in the actual database | implemented_unverified | Live DB access (done read-only); staging for writes | `pgmq.list_queues()` inspection; visibility/archive round-trip test |
| JD-UPG-012 | Streaming responses and resumable long-running tasks (SSE/stream) | not_implemented | JD-UPG-001, JD-UPG-016 | Stream tokens to client; disconnect resumes or reports partial completion |
| JD-UPG-013 | Read-after-write verification before JD reports success | partially_implemented | Executor code exists (JD-005E); migration applied 2026-11-12, end-to-end live verification pending | Every consequential tool read-verifies and reports verification evidence |
| JD-UPG-014 | Bounded provider retries, usage tracking, partial-completion reporting | resolved | — | Verified in JD-003; Deno tests in CI |
| JD-UPG-015 | OpenRouter credentials configured for production/staging (`OPENROUTER_API_KEY`, `JD_MODEL_NAME`) | deployment_pending | Owner secrets (GitHub + Supabase) | Worker completes a real model call; usage rows recorded |
| JD-UPG-016 | Deploy `jd-automation` and `jd-execution-worker` to production | deployment_pending | JD-UPG-015; staging validation; owner approval for prod deploy | Functions deployed; authenticated smoke test passes; runs visible in monitor UI |
| JD-UPG-017 | Durable routing of routine JD requests (queued response) | implemented_unverified | JD-UPG-016 | Routine request returns queued response; worker picks up job; UI shows status |
| JD-UPG-018 | Execution monitor UI for runs, attempts, steps, errors | partially_implemented | JD-UPG-016; live data | Monitor shows a real run end-to-end in staging |
| JD-UPG-019 | Safe admin cancellation (queued/retry-wait) and audited retry | partially_implemented | Retry-controls migration applied 2026-11-12 (`20261112084629`); cancel/retry live test pending | Cancel/retry verified live; audit events recorded |
| JD-UPG-020 | Manager execution history scoped to own runs | implemented_unverified | JD-UPG-016 | Role-scoped query verified live |

## §B. Portal usability and settings intelligence (JD-005)

| ID | Item | Status | Blocked by / depends on | Done when |
| --- | --- | --- | --- | --- |
| JD-UPG-021 | Light/dark theme consistency across every route and state | partially_implemented | Design audit | All routes pass contrast/legibility audit in both themes; automated check |
| JD-UPG-022 | Mobile-first layouts portal-wide | partially_implemented | Design audit | No clipped controls at 360px; touch targets ≥44px; verified phone widths |
| JD-UPG-023 | Responsive settings rows, tabs, tables, forms, dialogs | partially_implemented | Design audit | Settings page verified at 360/768/1440px |
| JD-UPG-024 | Searchable organisation settings catalogue (workspace/identity/cycles/performance/security/portal/billing/people/communications/integrations) | partially_implemented | JD-005B code; settings UI | Catalogue UI searches/filters live; protected keys excluded (tested) |
| JD-UPG-025 | JD explains each setting: value, dependencies, affected modules, permission boundary, save behaviour | partially_implemented | JD-UPG-004 (JD tool wiring); module + tests done 2026-11-12 | Tool answers per-setting; wiring into live JD runtime verified |
| JD-UPG-026 | JD audits configuration completeness; missing/contradictory settings without changing them | partially_implemented | JD-UPG-025 (live wiring); `auditConfiguration()` is read-only and tested (missing/contradiction/invalid-value findings, secrets excluded) | Audit report with evidence; wired into live JD runtime |
| JD-UPG-027 | JD proposes grouped configuration changes (preview/diff, dependency validation, confirmation) | resolved | JD-005C planner code | Planner validated (unit tests); diff semantics verified |
| JD-UPG-028 | Hash-bound settings proposals persisted in Review Centre | implemented_unverified | Migration applied 2026-11-12 (`20261112084412`); proposal round-trip verified live |
| JD-UPG-029 | Approval-bound, hash-verified, idempotent per-setting execution with stale-value checks + read-after-write | implemented_unverified | Migration applied 2026-11-12 (`20261112084459`); approve→execute→verify pending | End-to-end approve→execute→verify against live DB |
| JD-UPG-030 | JD explains save behaviour and refuses unsupported/invented settings | partially_implemented | JD-UPG-025 (live wiring); `explainSaveBehaviour()` + refusal taxonomy implemented and tested (unknown/invented/secret-like keys refused with supported-key list) | Refusal path verified live in JD runtime |
| JD-UPG-031 | Blueprint connection to supported settings and workflows | partially_implemented | Blueprint + settings integration design | Approved blueprint item activates the linked setting path only |
| JD-UPG-032 | Upgrade registry records coverage, test evidence, deployment state, token usage | partially_implemented | This registry; AgentUsage dashboard | Every release links registry items + CI evidence; token dashboard verified live |
| JD-UPG-033 | Settings proposals: refusal/expiry preserved in decision history | partially_implemented | Review Centre §E | Expired proposals stay in history; UI reflects state |
| JD-UPG-034 | Settings changes executed only by exact approved version and scope | implemented_unverified | JD-UPG-028/029 | Tamper test: modified-after-approval proposal is rejected at execution |

## §C. Organisation Builder

| ID | Item | Status | Blocked by / depends on | Done when |
| --- | --- | --- | --- | --- |
| JD-UPG-035 | Plain-language business idea → complete organisation blueprint | partially_implemented | JD-UPG-004 | Blueprint generated from brief; passes server validator |
| JD-UPG-036 | Audit repository, database schema, integrations and registered tools | partially_implemented | Capability collectors (missing) | Audit output cites real files/tables/functions with checksums |
| JD-UPG-037 | Evidence-based capability classifications (implemented/deployed/configured/partial/missing/unverified) | partially_implemented | JD-UPG-036 | Classifier output matches manual audit for a sample of capabilities |
| JD-UPG-038 | Divisions, responsibilities, roles and reporting lines | partially_implemented | JD-UPG-035 | Blueprint contains validated org structure |
| JD-UPG-039 | Permission matrices, workflows, SOPs, KPIs and dashboards | partially_implemented | JD-UPG-035 | Generated matrices pass role-permission linter |
| JD-UPG-040 | Identify integrations, dependencies, regulatory requirements and new development | partially_implemented | JD-UPG-036 | Blueprint lists external dependencies with required credentials |
| JD-UPG-041 | Blueprint presented in Review Centre before provisioning | partially_implemented | Review Centre §E; migration applied 2026-11-12 (`20261112084532`) | Blueprint visible as review item; approve/refuse round-trip works |
| JD-UPG-042 | Provision approved configuration with rollback/reconciliation | not_implemented | Blueprint/executor migrations applied 2026-11-12; provisioning engine missing | Idempotent provision; failure leaves no partial config; rollback restores prior state |
| JD-UPG-043 | Multi-department blueprint editor | resolved | — | Exists in `jd-operations`; saved drafts persist (admin-validated RPC) |
| JD-UPG-044 | Capability evidence collectors for schema, source, deployment and smoke tests | not_implemented | Collector design | Collectors run in CI; classification report attached to releases |
| JD-UPG-045 | Workforce planning tool | not_implemented | JD-UPG-004 | Headcount/role plan tool; exportable; reviewed before action |
| JD-UPG-046 | Recruitment assistant and hiring-campaign integrations | partially_implemented | §H; external integrations §J | Campaign draft + approval + (where authorised) provider publish; analytics |

## §D. Sidebar and module coverage (JD can *operate*, not just open pages)

Capability audit of the live schema must accompany any checked item. Today JD exposes 15 read-only, low-risk tools (people/performance/operations/billing/activity/email logs/attendance/announcements/settings catalogue/overview/hiring pipeline). Write operations outside the settings executor path do not exist.

| ID | Module area | Status | Notes / done when |
| --- | --- | --- | --- |
| JD-UPG-047 | Overview and organisation management | partially_implemented | `get_workspace_overview` (read). No org-structure write tools. |
| JD-UPG-048 | Teams, people, groups, categories and divisions | partially_implemented | Read aggregate only. People/team write tools missing. Done when admin-approved create/update flows exist with RLS tests. |
| JD-UPG-049 | Calendar, scheduling and attendance | partially_implemented | `get_attendance_snapshot` (read). No scheduling write tools. |
| JD-UPG-050 | Performance matrix, assignments, records, history and analytics | partially_implemented | `get_performance_intelligence` (read). No assignment/record tools. |
| JD-UPG-051 | Reports, report settings, scoring and rubrics | not_implemented | No report-config tools. |
| JD-UPG-052 | Billing items, templates, bill generation, payments and analytics | partially_implemented | `get_billing_snapshot` (read). Generation/payment verification tools missing. |
| JD-UPG-053 | Notices, notifications, email composition and email logs | partially_implemented | `get_email_delivery_logs` (read). Composition/publish tools missing. |
| JD-UPG-054 | Hiring, administration, permissions and people approvals | partially_implemented | `get_hiring_pipeline` (read); vacancy drafts in Batch 01 code; migration applied 2026-11-12. |
| JD-UPG-055 | Access requests | not_implemented | No JD tools. |
| JD-UPG-056 | Industry-specific modules from organisation blueprint | not_implemented | Depends on Organisation Builder §C provisioning. |
| JD-UPG-057 | Every listed module reachable and operable through JD tools (not just routes) | not_implemented | Requires JD-UPG-004 expansion + review-gated write tools + tests per module. |
| JD-UPG-058 | Finance-module tools (expenses, budgets, cash-flow, reconciliation) | partially_implemented | Business-platform tools exist server-side (read + approved-match writes) but **not wired into JD agent tools**. |
| JD-UPG-059 | Communications-module tools (notices, campaigns, logs, alerts) | partially_implemented | Same split: UI/backend exist; JD tool surface missing. |
| JD-UPG-060 | People-management tools with admin gating | partially_implemented | Backend/UI exist; JD tool surface missing. |

## §E. Review Centre and governance

| ID | Item | Status | Blocked by / depends on | Done when |
| --- | --- | --- | --- | --- |
| JD-UPG-061 | Pending, approved, refused, executed and failed queues | partially_implemented | Review Centre UI + `jd_approvals` (migration applied) | All five queues live; counts match DB in staging |
| JD-UPG-062 | Preview and edit artefacts before decision | partially_implemented | Editor design | Proposal artefact editable with version bump; approval binds new hash |
| JD-UPG-063 | Approve / refuse / request-changes with reviewer notes | partially_implemented | `jd_decide_approval` RPC (applied) | UI supports notes on all three paths; notes persist |
| JD-UPG-064 | Show recipients/audience, target service, source records, generated content and proposed effects | partially_implemented | Renderer per action_key | Each approval shows service, audience, sources and effects |
| JD-UPG-065 | Version history, requester/reviewer identity and timestamps | partially_implemented | Version tables deployed (workflow versions + settings executor applied 2026-11-12) | History panel complete for workflow + settings + artefact types |
| JD-UPG-066 | Server-side approval checks immediately before execution | partially_implemented | Settings executor applied 2026-11-12 (`20261112084459`) | Execution re-checks approval state atomically (race-injection test) |
| JD-UPG-067 | Only the exact approved version and scope executes (hash-bound) | partially_implemented | Same as above | Tamper/replay tests rejected |
| JD-UPG-068 | Execution results, delivery references and verification evidence stored | partially_implemented | Executor + audit events | `execution_result_json` populated; delivery IDs recorded where external |
| JD-UPG-069 | Refusal and expiry handling; decision history preserved | partially_implemented | `expires_at` honoured in decide path (410) | Expiry sweep + UI state; history immutable after decision |
| JD-UPG-070 | Private analysis and drafts usable without unnecessary approval | partially_implemented | Policy definition | Low-risk analysis never routes to Review Centre; policy tested |
| JD-UPG-071 | Approval race-condition protection (single decision wins) | resolved | `jd_atomic_approval_decisions` migration applied | Concurrent decide → exactly one wins (serialisable RPC) |
| JD-UPG-072 | Immutable audit history of approvals and executions | resolved | `jd_audit_events`; append-only design | Update/delete attempts on audit table fail by policy |
| JD-UPG-073 | Refusal/expiry UX end-to-end in the Review Centre | not_implemented | UI work | Rejected/expired items visible with notes and timestamps |

## §F. Artefacts and analysis

| ID | Item | Status | Notes / done when |
| --- | --- | --- | --- |
| JD-UPG-074 | Draft complete emails (subject, recipients, body) in context | partially_implemented | Compose UI exists; JD drafting tool not wired. |
| JD-UPG-075 | Draft notices and announcements | partially_implemented | Announcements read tool exists; drafting tool missing. |
| JD-UPG-076 | Business / operational / hiring / finance / performance reports | partially_implemented | Executive report generation exists in business platform (draft status, JSON export); not JD-agent-invoked. |
| JD-UPG-077 | Evidence-based analysis, comparisons and trends | partially_implemented | Business intelligence aggregations + snapshot API exist with tests; JD narration missing. |
| JD-UPG-078 | Clearly labelled and validated forecasts | partially_implemented | Trailing-mean baseline with rolling-origin backtest + MAE/MAPE recorded; still not a validated cash forecast; insufficient-history labelling implemented. |
| JD-UPG-079 | Spreadsheets, CSVs, PDFs, presentations, charts, datasets | not_implemented | XLSX export via xlsx-js-style in legacy pages; no chat-generated artefacts. |
| JD-UPG-080 | Store, preview, export, version and reference artefacts | partially_implemented | Reports stored; versioning exists for contracts/workflows; no unified artefact store. |
| JD-UPG-081 | Cite source records and data periods in generated analysis | partially_implemented | Business platform outputs list `sources`; not enforced for JD answers. |
| JD-UPG-082 | Disclose missing or incomplete data explicitly | partially_implemented | Partial: performance.predict and scorecard notes; not a platform-wide contract. |
| JD-UPG-083 | Proposals, SOPs, plans, meeting summaries, recruitment materials | not_implemented | — |
| JD-UPG-084 | PDF generation and download for reports | not_implemented | JSON/CSV export exists; no PDF pipeline. |
| JD-UPG-085 | Artefact provenance end-to-end (who/what/when/sources) | not_implemented | Requires unified store + audit linkage. |

## §G. Email and communications

| ID | Item | Status | Notes / done when |
| --- | --- | --- | --- |
| JD-UPG-086 | Contextual email drafting and refinement | not_implemented | JD tool missing. |
| JD-UPG-087 | Recipient lists; duplicate detection | not_implemented | — |
| JD-UPG-088 | Reusable templates and approved personalisation | not_implemented | — |
| JD-UPG-089 | Messages submitted for review; sent only after approval | not_implemented | `send-email` v2 is deployed and callable by the frontend; **not wired through Review Centre approval**. |
| JD-UPG-090 | Delivery-log inspection and failure reporting | partially_implemented | `get_email_delivery_logs` tool + logs page; failure drill-down missing. |
| JD-UPG-091 | Notice drafting, audience previews, approval-gated publishing | not_implemented | — |
| JD-UPG-092 | Resend integration configured and verified | deployment_pending | `RESEND_API_KEY`, `JD_ALERT_EMAIL_FROM` (ops worker) + send-email provider config; real delivery test pending. |
| JD-UPG-093 | Twilio SMS integration configured and verified | deployment_pending | `JD_TWILIO_ACCOUNT_SID`, `JD_TWILIO_AUTH_TOKEN`, `JD_TWILIO_FROM_NUMBER`; real SMS test pending. |
| JD-UPG-094 | Scheduled SLA/integration-incident notifications (ops worker) | implemented_unverified | Deployed (v2); messages queued; delivery unverified until §G-092/093. |
| JD-UPG-095 | Provider-reported delivery/bounce tracking | not_implemented | — |
| JD-UPG-096 | Email-send approval flow wired end-to-end | not_implemented | Depends on JD-UPG-089. |
| JD-UPG-097 | Communication preferences/consent respected in sends | partially_implemented | Customer consent fields exist; not enforced at send time. |

## §H. Hiring and LinkedIn

| ID | Item | Status | Notes / done when |
| --- | --- | --- | --- |
| JD-UPG-098 | Vacancy and job-description management | partially_implemented | Batch 01 vacancy drafts + UI (admin-gated); migration applied 2026-11-12. |
| JD-UPG-099 | Recruitment campaigns, post copy, hashtags, creative | not_implemented | — |
| JD-UPG-100 | LinkedIn secure OAuth (never collect passwords) | partially_implemented | OAuth callback deployed; **provider credentials missing**; round-trip unverified. |
| JD-UPG-101 | Personal-profile and Company Page publishing where permissions allow | not_implemented | Requires LinkedIn app review + publish tools. |
| JD-UPG-102 | Review Centre approval for LinkedIn posts | not_implemented | Depends on JD-UPG-089 pattern. |
| JD-UPG-103 | Publish approved content; store provider post IDs/URLs/status | not_implemented | — |
| JD-UPG-104 | Analyse applications and recruitment pipelines | partially_implemented | `get_hiring_pipeline` (read). Analysis/scoring tools missing. |
| JD-UPG-105 | Interview schedules and candidate communications | not_implemented | — |
| JD-UPG-106 | Candidate personal data restricted by role and purpose | partially_implemented | Tenant RLS applied to hiring tables; role/purpose scoping beyond admin unverified. |
| JD-UPG-107 | Candidate-stage transitions validated server-side | implemented_unverified | Batch 01 transition validator + UI; migration applied 2026-11-12. |
| JD-UPG-108 | Hiring UI (vacancies, intake, stages, approvals) | partially_implemented | UI exists on branch; migration/deploy pending. |
| JD-UPG-109 | LinkedIn provider verification (state, refresh, revoke behaviour) | deployment_pending | Needs `JD_OAUTH_LINKEDIN_CLIENT_ID/SECRET`; revoke unsupported → manual app-grant revocation documented. |
| JD-UPG-110 | Recruitment performance reporting | not_implemented | — |

## §I. Logs, monitoring and intelligence

| ID | Item | Status | Notes / done when |
| --- | --- | --- | --- |
| JD-UPG-111 | Authorised audit, email, automation, integration and application log access | partially_implemented | Admin-only `get_recent_activity_logs` + `get_email_delivery_logs`; automation step reads exist. No integration/application log tool. |
| JD-UPG-112 | Investigate repeated failures; explain likely causes with evidence | not_implemented | — |
| JD-UPG-113 | Detect repeated errors, unusual activity, bottlenecks | partially_implemented | Business platform records service check history/alerts; detection heuristics minimal. |
| JD-UPG-114 | Operational health and automation performance reports | partially_implemented | `health.scorecard`, execution monitor; no JD-narrated health report. |
| JD-UPG-115 | Track task duration, success/failure rates, pending approvals | partially_implemented | Monitor surfaces steps; SLAs tracked for support cases; not unified. |
| JD-UPG-116 | Secrets/credentials never enter model context or logs | partially_implemented | Service-role keys server-side; prompt-injection and output-redaction tests missing. |
| JD-UPG-117 | Scheduled monitoring and alert delivery | deployment_pending | GitHub secrets `JD_MONITOR_FUNCTION_URL`, `JD_BUSINESS_MONITOR_WORKER_SECRET`; worker deployed but unverified live. |
| JD-UPG-118 | End-to-end verification of monitoring and operations workers | deployment_pending | Requires secrets + seeded failure; alert email/SMS receipt proof. |
| JD-UPG-119 | Business intelligence snapshot dashboard (workforce/finance/performance/operations/comms) | partially_implemented | Tenant-scoped snapshot API + dashboard exist; source verification incomplete. |
| JD-UPG-120 | KPI trend dashboards | partially_implemented | `_shared/jd-kpi-trends.ts` (12-month UTC buckets: cleared cash in/out, approved expenses — always per currency; new/won opportunities, resolved support cases, new customers; trailing-3m vs prior-3m movement) + `kpi.trends` action in `jd-business-platform` + Business Platform → KPI trends tab (table view, no chart lib). Unit-tested (6 Deno tests, CI step added). Deployed in `jd-business-platform` v4 (2026-11-12, owner-authorised); live smoke NOT run; no trend thresholds/alerting. |
| JD-UPG-121 | Anomaly detection for expenses (thresholds/variance workflows) | partially_implemented | `_shared/jd-expense-anomalies.ts` (deterministic, currency-isolated, approved/paid only, robust median outlier ≥3× with n≥5, trailing-90d trend spike ≥1.5×, budget utilisation/threshold findings) + `expense.anomalies` action in `jd-business-platform` + Business Platform → Expense budgets UI (advisory, no writes). Pure module unit-tested (7 Deno tests, CI step added). Deployed in `jd-business-platform` v4 (2026-11-12, owner-authorised); live smoke NOT run — actions unverified against live backend. |

## §J. External integrations and MCP

| ID | Item | Status | Notes / done when |
| --- | --- | --- | --- |
| JD-UPG-122 | Reusable integration/MCP adapter framework | not_implemented | OAuth infra is provider-specific, not an adapter framework. |
| JD-UPG-123 | LinkedIn and additional approved services (Google, Microsoft, Slack) | partially_implemented | OAuth flows implemented for all four; **none verified against real providers**. |
| JD-UPG-124 | Secure OAuth token storage, scopes, refresh, revocation | implemented_unverified | AES-GCM bundles + PKCE + one-time state implemented; refresh implemented for Google/Microsoft/Slack; Google+Slack remote revoke implemented; Microsoft needs `User.RevokeSessions.All`; LinkedIn revoke unsupported (manual by design). Live round-trip unverified. |
| JD-UPG-125 | Integration health checks and action logs | partially_implemented | Monitor worker + service_checks tables; action logs via audit; unverified live. |
| JD-UPG-126 | Approval policies for external writes and publishing | partially_implemented | Review Centre pattern exists; no external-write coverage wired. |
| JD-UPG-127 | Integration marketplace (discovery, setup, health) | not_implemented | Catalog table + integrations UI exist; marketplace UX/health flow incomplete. |
| JD-UPG-128 | Paystack read-only integration verified against real API | deployment_pending | Key entry + verify + transaction sync implemented; restricted key + real verification pending. |
| JD-UPG-129 | Provider callback round-trips and remote revocation verified | deployment_pending | Requires real client credentials per provider + smoke tests. |
| JD-UPG-130 | OAuth encryption key configured (`JD_OAUTH_ENCRYPTION_KEY`) in target environments | deployment_pending | Owner action per NEEDS_YOU.md; callback URL registered per provider. |
| JD-UPG-131 | MCP server/registry for JD tool exposure | not_implemented | — |

## §K. UX and product presentation

| ID | Item | Status | Notes / done when |
| --- | --- | --- | --- |
| JD-UPG-132 | Minimal, professional, Google-inspired design language | partially_implemented | Tokens/components in place; consistency unproven across routes. |
| JD-UPG-133 | Black/silver neutral visual direction | partially_implemented | Present in shell; per-route drift likely. |
| JD-UPG-134 | Responsive mobile and desktop command centre | partially_implemented | Depends on JD-UPG-001/022. |
| JD-UPG-135 | Real product previews rather than generic illustrations | partially_implemented | Landing uses real screenshots; verify currency. |
| JD-UPG-136 | Typography, spacing, navigation and accessible controls | partially_implemented | Accessibility audit not run. |
| JD-UPG-137 | Rich chat previews (tables, charts, files, Review Centre items) | partially_implemented | AgentUsage/RunMonitor/ReviewCentre panels exist; tables/charts/files in-chat not built. |
| JD-UPG-138 | Consistent module UX and the Run. Monitor. Grow. promise | partially_implemented | — |
| JD-UPG-139 | Accessibility pass (WCAG AA) across command centre | not_implemented | — |
| JD-UPG-140 | Dark/light theme visual regression suite | not_implemented | — |

## §L. Platform quality and security

| ID | Item | Status | Notes / done when |
| --- | --- | --- | --- |
| JD-UPG-141 | Tenant isolation tests (two disposable tenants, authenticated) | deployment_pending | `scripts/verify-jd-business-staging.mjs` + manual workflow exist; needs staging project + 2 test tenants. |
| JD-UPG-142 | Server-side role and permission tests across tools/modules | partially_implemented | Validators unit-tested (Deno); live role-matrix tests missing. |
| JD-UPG-143 | RLS audit for every exposed table and storage bucket | partially_implemented | All 69 public base tables report RLS enabled; all 35 audited core tables verified 2026-11-12; storage bucket policies not re-audited this pass. |
| JD-UPG-144 | Secrets server-side; no service-role keys in frontend | resolved | Frontend uses anon key + functions; verified by source scan (this pass). |
| JD-UPG-145 | Input/output validation, prompt-injection resistance, tool allowlists | partially_implemented | Allowlist + schemas exist; injection red-team tests missing. |
| JD-UPG-146 | Approval race-condition and immutable audit-history testing | resolved | Atomic decide RPC applied in prod; audit append-only. |
| JD-UPG-147 | Automated unit, integration, security and end-to-end tests | partially_implemented | Deno helper tests + CI build gate; no browser/E2E suite; no security suite. |
| JD-UPG-148 | Web, Android and production deployment verification | partially_implemented | Web production READY (2026-11-12). Android build/deploy unverified this cycle. |
| JD-UPG-149 | Operational monitoring, backups and rollback strategy | not_implemented | Supabase PITR/backup policy undocumented; rollback runbook missing. |
| JD-UPG-150 | Dependency vulnerabilities resolved | resolved | **29 (3 critical/18 high/7 moderate/1 low) → 0** on this branch: `xlsx` removed (SheetJS advisories, no fix available) and replaced with lazy-loaded `exceljs`; `vite` 5→8.3.8; `@vitejs/plugin-react` 4→6.3.0; `sharp`→0.35.5; `@capacitor/assets`→4.0.0; `uuid` forced ≥11.1.1 via overrides; `npm audit` = 0; `verify:web` passes. Residual note: `xlsx-js-style` (write-only report cards) shares the SheetJS lineage and is not flagged by npm audit; migrate to ExcelJS styling in a follow-up. |
| JD-UPG-151 | Malware scanning for document uploads | partially_implemented | **Server-side signature screen implemented** (magic-byte match to declared type, PE/ELF/script/OLE rejection, embedded-PE/ELF polyglot detection, macro `vbaProject.bin` rejection) at upload-confirm and in the extraction worker; upload is blocked client-side by accept list and server-side by screening. **Not a commercial AV engine** — see JD-UPG-152. |
| JD-UPG-152 | Antivirus engine integration (ClamAV/VirusTotal/etc.) before enabling uploads | not_implemented | Owner must choose engine + hosting; until then documents remain gated by JD-UPG-151 only. |
| JD-UPG-153 | Dependency/CI supply-chain verification (lockfile, audit gate in CI) | partially_implemented | CI runs `npm ci` with lockfile; add `npm audit --audit-level=high` gate. |

## §M. Batch 01 — Operational intelligence and Organisation Builder (remaining)

| ID | Item | Status | Notes / done when |
| --- | --- | --- | --- |
| JD-UPG-154 | Scheduler/dispatcher integration and expired-worker-lease recovery | implemented_unverified | Lease recovery code applied 2026-11-12 (`20261112084629`); scheduler function `jd-task-scheduler` still undeployed; recurring-tasks migration applied (`20261112084732`). |
| JD-UPG-155 | Trusted capability evidence collectors (schema/source/deployment/smoke) | not_implemented | As JD-UPG-044. |
| JD-UPG-156 | Live execution-monitor controls: safe cancellation and retry verification | partially_implemented | Cancel/retry implemented; retry migration applied 2026-11-12; live tests pending. |
| JD-UPG-157 | Approval-gated, idempotent organisation provisioning | not_implemented | As JD-UPG-042. |
| JD-UPG-158 | Division/department provisioning workflows | not_implemented | — |
| JD-UPG-159 | People-management tools | partially_implemented | Tools surface missing (§D). |
| JD-UPG-160 | Performance-management tools | partially_implemented | Tools surface missing (§D). |
| JD-UPG-161 | Finance-module tools | partially_implemented | Server-side business API exists; JD tools missing. |
| JD-UPG-162 | Communications-module tools | partially_implemented | Server-side exists; JD tools missing. |
| JD-UPG-163 | Recruitment assistant and hiring-campaign integrations | partially_implemented | See §H. |
| JD-UPG-164 | Blueprint, operations and hiring interfaces | partially_implemented | Implemented; migrations applied 2026-11-12; runtime verification pending. |
| JD-UPG-165 | Complete KPI trend dashboards | partially_implemented | Slice shipped as code: trends API + tab (see JD-UPG-120). Not complete: no alerting/thresholds, no historical backfill validation, no workforce KPIs; deployed in v4 but unverified (no smoke). |
| JD-UPG-166 | Apply Batch 01 migration in staging; authenticated cross-tenant tests | deployment_pending | Batch 01 applied **directly in production** 2026-11-12 (owner-authorised); staging project + CI run still missing. |
| JD-UPG-167 | Concurrency and failure-injection tests | not_implemented | — |
| JD-UPG-168 | Vacancy drafts and candidate-stage transitions | implemented_unverified | Code + UI; migration applied 2026-11-12. |
| JD-UPG-169 | Business Operations route and live queue UI | partially_implemented | Route `src/pages/jd-operations.jsx`; unverified in production. |
| JD-UPG-170 | Business intelligence unit tests in CI | resolved | CI runs `jd-business-intelligence.test.ts`. |
| JD-UPG-171 | Blueprint validation, draft persistence and previews | resolved | Code + tests; admin RPC path. |
| JD-UPG-172 | Operational task storage and idempotency helper | implemented_unverified | Migration applied 2026-11-12 (`20261112084532`). |
| JD-UPG-173 | Operational task creation action and state machine | implemented_unverified | Code + tests; migration applied 2026-11-12. |

## §N. Durable execution and recovery

| ID | Item | Status | Notes / done when |
| --- | --- | --- | --- |
| JD-UPG-174 | Configure `SUPABASE_URL` and `JD_WORKER_SECRET` in GitHub Actions and Supabase | partially_implemented | **`SUPABASE_ACCESS_TOKEN` is rejected by the Supabase API** — run 43259978805 failed at the preflight (`GET /v1/projects` non-200), so the secret is present but invalid/expired/scoped elsewhere, or is not a personal access token. Regenerate at https://supabase.com/dashboard/account/tokens. | `JD_WORKER_SECRET` **now set** in Supabase (2026-11-12, generated, value never handled outside the platform). Still missing: the same secret plus `SUPABASE_URL` as GitHub Actions repository secrets, and `OPENROUTER_API_KEY`/`JD_MODEL_NAME` for the agent runtime. Scheduled workflows skip safely until set. |
| JD-UPG-175 | Verify durable execution migrations against the actual database | partially_implemented | Migrations applied (jobs + checkpoints + retry `20261112084629`). pgmq functions exist; round-trip unverified. History divergence now **diagnosed and verified** — see `upgrades/MIGRATION-RECONCILIATION.md`: all 70 tables and 32 functions declared by the 19 "unapplied" repo migrations exist in production; repair commands prepared but not run. |
| JD-UPG-176 | Verify pgmq queue compatibility and operation | implemented_unverified | Extension present per migration; live round-trip pending. |
| JD-UPG-177 | Deploy and verify `jd-automation` and `jd-execution-worker` | deployment_pending | Deployment is now **automated**: `.github/workflows/deploy.yml` ships all functions on push to `master` and then runs `scripts/probe-edge-functions.mjs` to assert each one is reachable and rejects unauthenticated/wrong-secret calls. Blocked on `OPENROUTER_API_KEY` (+ `JD_MODEL_NAME`) — without them the worker fails closed per job (`"JD model provider is not configured"`) and the runtime is configured but non-functional. |
| JD-UPG-178 | Scheduled dispatcher execution | partially_implemented | `jd-task-scheduler` + `.github/workflows/jd-task-scheduler.yml` and `jd-worker-dispatch.yml` exist; secrets unset; unverified. |
| JD-UPG-179 | Expired-lease recovery | implemented_unverified | Code in retry migration (applied 2026-11-12) + worker claim logic; live recovery test pending. |
| JD-UPG-180 | Deterministic per-tool resume and recovery | partially_implemented | Checkpoint model exists; per-tool resume semantics unverified. |
| JD-UPG-181 | Duplicate-delivery and idempotency tests | not_implemented | — |
| JD-UPG-182 | Worker-crash and lease-expiry tests | not_implemented | — |
| JD-UPG-183 | Retry-exhaustion and dead-letter handling | implemented_unverified | `max_attempts` + archive path in code; retry migration applied 2026-11-12; untested live. |
| JD-UPG-184 | Two workers cannot execute the same job under valid leases | not_implemented | Lease-claim race test required. |
| JD-UPG-185 | Authenticated tenant-isolation tests for jobs, checkpoints, execution history | not_implemented | — |
| JD-UPG-186 | Batch 02 business-platform workers must not be confused with JD runtime | resolved | Documented in changelog/NEEDS_YOU; registry §P. |
| JD-UPG-187 | JD runtime must not be routed before migrations/verification | deployment_pending | Gate on JD-UPG-174/175/177. |

## §O. Batch 02 — Autonomous Business Platform (20 tracks)

Substantial code foundations exist for all tracks (platform API, document/monitor/ops workers, OAuth callback, report share; migration applied 2026-11-12; 25 `jd_business_*` tables RLS-enabled). Nothing in this table may be called complete without the verification listed.

| ID | Track | Status | Outstanding work |
| --- | --- | --- | --- |
| JD-UPG-188 | 01 Workflow Builder | partially_implemented | Validator + draft endpoints exist; activation path unwired to execution. |
| JD-UPG-189 | 02 Visual Workflow Editor | partially_implemented | JSON-editor UI exists (`jd-workflow-studio`); **not a visual canvas**. Done when canvas authoring + validation + activation lifecycle works. |
| JD-UPG-190 | 03 Recurring Operations Scheduler | partially_implemented | Code + UI (`jd-recurring-schedules`) + workflow; migration applied 2026-11-12 (`20261112084732`); dispatcher undeployed/unverified. |
| JD-UPG-191 | 04 Automated Task Assignment | partially_implemented | Pool/auto-assign code exists; migration applied 2026-11-12; unverified. |
| JD-UPG-192 | 05 Department Collaboration | partially_implemented | Implementation merged; notifications/realtime/attachments/visibility unfinished; migration applied 2026-11-12. |
| JD-UPG-193 | 06 Business Intelligence Dashboard | partially_implemented | Snapshot API + dashboard exist; predictive/historical analysis, source verification, drill-down/export incomplete. |
| JD-UPG-194 | 07 Predictive Performance Analysis | partially_implemented | Backtest + MAE/MAPE recorded; forecast validation and confidence reporting open. |
| JD-UPG-195 | 08 Revenue Intelligence | partially_implemented | Paystack read-only sync exists; verification against real source records pending credentials. |
| JD-UPG-196 | 09 Expense Monitoring | partially_implemented | Budgets + thresholds + anomaly review (see JD-UPG-121) exist as code; variance workflow escalation to a review queue is NOT built; deployed in v4; variance escalation queue still NOT built; smoke NOT run. |
| JD-UPG-197 | 10 Cash-flow Reporting | partially_implemented | Statement import (this branch migrates it off `xlsx` to ExcelJS) + reconciliation function; reconciliation and validated projections incomplete. |
| JD-UPG-198 | 11 Document Intelligence | partially_implemented | Embedded-text extraction works; malware screening added (§L); scanned OCR is opt-in and unapproved; end-to-end ingestion unverified. |
| JD-UPG-199 | 12 Contract and Proposal Management | partially_implemented | Versioning + expiry fields exist; review lifecycle/reminders/execution handoff incomplete. |
| JD-UPG-200 | 13 Customer Relationship Management | partially_implemented | Consent fields + ownership exist; full customer workflows incomplete. |
| JD-UPG-201 | 14 Sales Pipeline Automation | partially_implemented | Stages/probability tracked; configurable stages, forecasting, next actions, automation incomplete. |
| JD-UPG-202 | 15 Customer Support Workflows | partially_implemented | SLA policies + due computation + notifications queued; SLA timers/escalation/resolution verification incomplete. |
| JD-UPG-203 | 16 Integration Marketplace | partially_implemented | Catalog + integrations panel exist; discovery/setup/health workflows incomplete. |
| JD-UPG-204 | 17 Secure OAuth Integration Manager | deployment_pending | Credentials missing; real provider OAuth/refresh/revocation unverified. |
| JD-UPG-205 | 18 External Service Monitoring | deployment_pending | Schedule + worker deployed; GitHub/Supabase secrets missing; real health checks unverified. |
| JD-UPG-206 | 19 Business Health Monitoring | partially_implemented | Scorecard indicators exist; evidence-backed scoring incomplete; no single grade issued by design. |
| JD-UPG-207 | 20 Executive Intelligence Reports | partially_implemented | Generation + JSON/CSV export exist; scheduled evidence-linked reports and export/sharing governance incomplete. |

## §P. Operational configuration and release blockers

Each item is an owner action on external systems. None can be completed from this repository.

| ID | Item | Status | Required action |
| --- | --- | --- | --- |
| JD-UPG-208 | `SUPABASE_ACCESS_TOKEN` for Auth-config workflow | deployment_pending | Replace rejected token with project-scoped PAT containing `auth_config_write` + `project_admin_write`; run **Configure production Supabase Auth** workflow; verify Site URL/redirect allowlist/leaked-password protection. |
| JD-UPG-209 | `SUPABASE_URL`, `JD_WORKER_SECRET` (GitHub + Supabase) for durable execution | deployment_pending | Generate ≥32-char random secret; set in both places; run worker smoke test. |
| JD-UPG-210 | `JD_OAUTH_ENCRYPTION_KEY` + callback URL + per-provider client credentials (Google, Microsoft, LinkedIn, Slack) | deployment_pending | `openssl rand -base64 32`; register callback URL in each provider console; set Edge Function secrets. |
| JD-UPG-211 | Register provider callback URLs | deployment_pending | Each provider console: exact `https://thklwiybjuhrjqrrxyid.supabase.co/functions/v1/jd-business-oauth-callback`. |
| JD-UPG-212 | Monitor worker secrets (`JD_MONITOR_FUNCTION_URL`, `JD_BUSINESS_MONITOR_WORKER_SECRET`) | deployment_pending | GitHub secrets + matching Supabase secret; then verify a real check cycle. |
| JD-UPG-213 | Document worker secrets (`JD_DOCUMENT_FUNCTION_URL`, `JD_DOCUMENT_WORKER_SECRET`) | deployment_pending | As above; then verify extraction of a real PDF. |
| JD-UPG-214 | OCR credentials + explicit external-processing approval (`JD_OCR_SPACE_API_KEY`, `JD_OCR_ALLOW_EXTERNAL_PROCESSING=true`) | blocked_decision | Owner decision on third-party processing; keep disabled until approved. |
| JD-UPG-215 | Malware scanning before enabling uploads | partially_implemented | JD-UPG-151 in place; enable commercial scanning only after JD-UPG-152 decision. |
| JD-UPG-216 | Resend email delivery verified (`RESEND_API_KEY`, `JD_ALERT_EMAIL_FROM`, send-email provider) | deployment_pending | Send real test mail; inspect delivery log; confirm bounces recorded. |
| JD-UPG-217 | Twilio SMS delivery verified | deployment_pending | Send real test SMS from ops worker path. |
| JD-UPG-218 | Paystack restricted read-only key verified | deployment_pending | Enter restricted key in integrations UI; verify; run transaction sync on a test key. |
| JD-UPG-219 | Authenticated two-tenant staging tests (disposable accounts) | deployment_pending | Create staging project or use Vercel preview + test tenants; run `verify-jd-business-staging.yml`. |
| JD-UPG-220 | Real provider integration tests (OAuth round-trip, revoke, refresh) | deployment_pending | After JD-UPG-210/211; record results here. |
| JD-UPG-221 | Resolve existing npm dependency vulnerabilities | resolved | JD-UPG-150. |
| JD-UPG-222 | Full post-deployment test suite against deployed environment | deployment_pending | Gate on JD-UPG-208…218; run CI + staging verify + smoke tests; record here. |
| JD-UPG-223 | `SUPABASE_ACCESS_TOKEN` scopes for Auth hardening actually grant access | deployment_pending | Same as JD-UPG-208. |
| JD-UPG-224 | Monitoring worker verified against at least one connected provider | deployment_pending | After JD-UPG-212; confirm latency row + transition alert email. |
| JD-UPG-225 | Document worker extraction verified in staging | deployment_pending | After JD-UPG-213; confirm `completed` status and summary for a real PDF. |
| JD-UPG-226 | Business-platform OAuth round-trip verified end-to-end | deployment_pending | After JD-UPG-210/211; connect Google account; verify identity call; revoke. |

## §Q. Documentation and process

| ID | Item | Status | Notes / done when |
| --- | --- | --- | --- |
| JD-UPG-227 | `upgrades.md` reconciled with implementation records | partially_implemented | This registry is now the canonical reconciled list; `upgrades.md` checkboxes updated to reference it. |
| JD-UPG-228 | Append-only changelog integrity (no status claims without evidence) | resolved | This change appends JD-006. |
| JD-UPG-229 | Token-usage ledger honesty (REPORT-ONLY from provider) | resolved | JD-003; AgentUsage UI; no invented totals. |
| JD-UPG-230 | Staging-first migration discipline (no direct prod application without verification) | deployment_pending | Batch 02 direct-apply documented 2026-11-12; codify staging gate. |

## §R. Resolved in this change (2026-11-12, branch `arena/e6cc942c-james-denning`)

| ID | Item | Evidence |
| --- | --- | --- |
| JD-UPG-150 / 221 | Dependency vulnerabilities 29 → 0; `xlsx` eliminated; statement import migrated to lazy-loaded ExcelJS with CSV/XLSX support, day-first date normalisation and explicit legacy `.xls` rejection | `npm audit` = 0 vulnerabilities; `npm run verify:web` passes; `src/utils/statementImport.js` (unit-verified under Node 22) |
| JD-UPG-151 | Malware screening gate for uploads (server-side, fail-closed, no schema change) | `supabase/functions/_shared/jd-document-security.ts` (+ test); wired into `jd-business-platform` upload-confirm (reject ⇒ object deleted, audit `business.document.rejected`) and `jd-business-document-worker` (reject ⇒ `error_code: malware_suspected`); 8/8 checks pass under Node-transpiled equivalent; CI step added |
| JD-UPG-227 | Reconciled outstanding-upgrades registry | This document |
| Build | Vite 5 → 8.3.8 (rolldown) + `@vitejs/plugin-react` 6.3.0; production build verified (`verify:web` passes) | Local build log 2026-11-12; spreadsheet-vendor chunk unchanged in role, entry chunk 9 KB |
| Live audit | Read-only production state captured (migrations, Edge Functions, RLS on 35 core tables, Vercel READY at `5232af9`) | Supabase/Vercel connector results 2026-11-12 (quoted in snapshot above) |

**Verification caveat:** Deno is not available in the authoring sandbox (proxy TLS blocks binary download), so the new Deno test was validated by transpiling the module with TypeScript and running equivalent assertions under Node 22. CI runs the authoritative `deno test` step added to `.github/workflows/ci.yml`; CI must be green before merge.

---

## Suggested execution order (unchanged in substance from the master plan)

1. **Security:** JD-UPG-152 (AV decision) and keep JD-UPG-151 enforced; disable uploads entirely if rejected.
2. **Durable JD runtime:** JD-UPG-174/175/177/178/181…185/187 (secrets → staging verification → deploy → failure-injection tests).
3. ~~**Migrations in staging first:**~~ **Done directly in production 2026-11-12 (owner-authorised)** — Batch 01, collaboration, retry, recurring, workflow versioning, settings proposals/executor all applied and recorded; runtime verification pending. Staging-first discipline for future batches remains required (JD-UPG-230).
4. **Organisation Builder provisioning:** JD-UPG-042/157/158 + JD-UPG-155 evidence collectors.
5. **Workflow Builder to parity:** JD-UPG-188…191 (execution engine, scheduler, assignment).
6. **Integrations:** JD-UPG-210/211/216/217/218/224/225/226 (real provider verification), then JD-UPG-204…205.
7. **Business intelligence validation:** JD-UPG-193/194/197/198 and report governance JD-UPG-207.
8. **Module coverage through JD tools:** JD-UPG-047…060 with per-module approval policies and tests.
9. **Quality:** JD-UPG-141/142/145/147/149/153 + E2E suite; Android verification JD-UPG-148.
10. **Documentation:** keep this registry + `upgrades.md` + CHANGELOG in sync per release (JD-UPG-227/228).

## Open decisions required from the owner

1. Enable external OCR processing (`JD_OCR_ALLOW_EXTERNAL_PROCESSING=true`) — yes/no (privacy).
2. Choose antivirus integration for uploads (ClamAV sidecar / scanning service / accept signature screening only).
3. Staging environment for verification (separate Supabase project, or isolated branch) — required for nearly every `deployment_pending` JD item.
4. Production deployment of `jd-automation`/`jd-execution-worker` — approve only after staging gates pass.
5. Microsoft Graph `User.RevokeSessions.All` consent — broad-scope permission; grant only after admin review.
6. Whether to keep `xlsx-js-style` (write-only) during the ExcelJS migration of report cards.


## §S. JD response latency

| ID | Item | Status | Notes / done when |
| --- | --- | --- | --- |
| JD-UPG-231 | Reduce JD model round trips and instrument latency | in_progress | Independent read-only tools are requested together; free-router follow-up rounds are pinned to the first selected model; per-request latency is recorded. CI, staging checkpoint-resume verification and a five-run latency comparison remain outstanding. Production worker has not been redeployed. |


## §T. Socrates-inspired JD response architecture

| ID | Item | Status | Notes / done when |
| --- | --- | --- | --- |
| JD-UPG-232 | Streamed responses, bounded continuation, task-based model routing and private document drafts | implemented_unverified | Source implementation added on `perf/jd-model-latency`. SSE deltas persist into the tenant-scoped assistant message and are returned by the existing job-status poll; long outputs continue at most twice with checkpointed state; model rungs are opt-in secrets; admins/managers/bursars can save private TXT/MD/CSV/JSON/HTML/CSS/JS/TS/PY/SQL/XML/YAML/DOCX/XLSX/PPTX drafts and staged source files, one per tool round. CI, staging stream visibility, continuation/resume, private storage/download, tenant isolation and production deployment remain outstanding. |