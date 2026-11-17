# James-Denning & JD — Upgrade Master Plan

> Product promise: **Run. Monitor. Grow.** JD is the primary operating interface for an organisation. Users describe outcomes; JD inspects available data and capabilities, prepares artefacts, executes authorised workflows, verifies results and reports back.

This is the canonical, human-readable upgrade index. The detailed implementation contract, append-only upgrade history, AI-agent instructions and token-usage ledger live in [`/upgrades/`](./upgrades/README.md).

> **2026-11-12 — Reconciled registry available.** [`upgrades/OUTSTANDING-REGISTRY.md`](./upgrades/OUTSTANDING-REGISTRY.md) is the single reconciled list of everything outstanding, with a unique ID, status, dependencies and the verification required for every item, plus a read-only live audit of production (migrations, Edge Functions, RLS, Vercel state). Check it before claiming any item below is started, finished or deployed.

## Operating principles

1. **Conversation-first:** meaningful work across the product should be possible through JD without opening individual module pages.
2. **Evidence before claims:** distinguish implemented code, deployed capability, configured integration and proposed work. Never claim a feature is live merely because code or a UI label exists.
3. **Read, plan, prepare, review, execute, verify:** private analysis can be returned immediately; external or consequential actions pass through the Review Centre.
4. **Organisation-neutral:** build reusable capabilities for many industries. Industry-specific divisions and workflows are generated from an organisation blueprint, not hard-coded into the product.
5. **Least privilege:** tools enforce authenticated identity, tenant isolation and role permissions on the server. Model instructions are not a security boundary.
6. **Auditable operations:** record who requested, prepared, approved, executed and verified each consequential action.
7. **Provider-neutral AI:** OpenRouter is the initial provider; keep the model/provider adapter replaceable.
8. **Honest token accounting:** record provider-reported usage and cost where returned. Never invent token counts or costs.

## Master upgrade checklist

### 1. JD assistant and agent runtime
- [ ] Chat-first, polished, responsive JD command centre.
- [ ] Natural conversational interaction and persistent conversation history.
- [ ] Multi-step agent planning and execution across enabled organisation modules.
- [ ] Server-side tool registry with schemas, permissions, risk levels and validation.
- [ ] Live progress, tool activity, task status and useful error reporting.
- [ ] Verify changes using read-after-write checks before reporting success.
- [ ] Retries, idempotency, recovery and durable background jobs.
  - [x] Bounded retries for transient provider/network failures.
  - [x] Provider-reported usage retained per successful model request without inventing missing totals.
  - [x] Explicit partial-completion status when the eight-round tool limit is exhausted.
  - [x] Batch independent read-only tool calls, pin the selected free model across tool rounds and record per-request latency (JD-231; CI/staging verification pending).
  - [ ] Durable queue, worker leases, resumability, idempotent recovery and crash handling. (Design: [JD-004](./upgrades/JD-004-DURABLE-EXECUTION.md); JD-004A job ledger/queue primitives implemented in PR #40; database integration verification pending.)
- [ ] Streaming responses and resumable long-running tasks.
- [ ] File attachments and ingestion for CSV, XLSX, PDF and supported documents.
- [ ] Context/memory scoped appropriately to user and organisation.
- [ ] OpenRouter integration with configurable model selection and provider abstraction.

### 1A. Portal usability and settings operations (JD-005)
- [x] JD read-only settings catalogue: configured/missing status, category filters, safe values and protected-key exclusion. (JD-005B.)
- [x] JD validated settings change planner with before/after diffs and approval classification; no writes. (JD-005C.)
- [x] Persist hash-bound settings proposals in Review Centre with server-side revalidation and audit. (JD-005D.)
- [x] Add approval-bound, hash-verified, per-setting idempotent execution with stale-value checks, read-after-write verification and audit events. (JD-005E; live DB verification pending.)
- [ ] Consistent, fully legible light and dark themes across every route and interactive state.
- [x] Mobile-first page layouts: single-column stacking, no clipped controls, readable labels and touch-sized actions. (JD-012; 36 routes verified overflow-free at 360/390/430px.)
- [x] Responsive settings rows, tabs, tables, forms, dialogs and summary panels. (JD-012; header/toolbar/tab rows wrap, tables scroll, modals go full-width.)
- [ ] A searchable organisation settings catalogue grouped by workspace, identity, cycles, performance, security, portal, billing, people, communications and integrations.
- [ ] JD can explain each setting, its current value, dependencies, affected modules, permission boundary and save behaviour.
- [ ] JD can audit configuration completeness and identify missing or contradictory settings without changing them.
- [ ] JD can propose grouped configuration changes as a preview/diff, validate dependencies and request confirmation before saving.
- [ ] JD applies approved changes through existing server-authorised operations, then reads values back to verify.
- [ ] JD can organise modules and workflows into an organisation blueprint, but cannot invent unsupported features or silently change access/security settings.
- [ ] Upgrade registry records coverage, test evidence, deployment state and actual provider token usage.

### 2. Organisation Builder
- [ ] Turn a plain-language business idea into an organisation blueprint.
- [ ] Inspect the codebase, database schema, integrations and registered tools to audit available capabilities.
- [ ] Classify each capability as implemented, deployed, configured, partially available, missing or unverified.
- [ ] Propose industry, business model, divisions, responsibilities, roles and reporting lines.
- [ ] Generate permission matrices, workflows, SOPs, KPIs, dashboards and recurring routines.
- [ ] Identify required integrations, dependencies, regulatory considerations and new development.
- [ ] Present the blueprint and changes in the Review Centre before provisioning.
- [ ] Provision approved configuration safely, with rollback/reconciliation where possible.

### 3. Sidebar/module coverage
JD should be able to perform supported operations across every existing module, not just link users to pages. Audit the actual repository and schema before marking a module complete.
- [ ] Overview, organisation, team, people, groups, categories and divisions.
- [ ] Calendar, schedule and attendance.
- [ ] Performance matrix, assignments, performance records, history and analytics.
- [ ] Reports, report settings, scoring and rubrics.
- [ ] Billing items, billing templates, bill generation, payments and billing analytics.
- [ ] Notices, notifications, email composition and email logs.
- [ ] Hiring, administration, permissions, people approvals and access requests.
- [ ] Industry-specific modules enabled by the organisation's configuration.

### 4. Review Centre and governance
- [ ] Queues for pending, approved, refused, executed and failed items.
- [ ] Preview and edit artefacts before decision.
- [ ] Approve, refuse and request changes, with reviewer notes.
- [ ] Show recipients/audience, target service, source records, generated content and proposed effects.
- [ ] Version history, requester/reviewer identity and timestamps.
- [ ] Server-enforced approval checks immediately before execution.
- [ ] Execute only the approved version and approved scope.
- [ ] Record execution outcome, delivery/publication reference and verification evidence.
- [ ] Refusal and expiry handling; preserve decision history.
- [ ] Private analysis and drafts remain usable without unnecessary approval; external or consequential actions require approval according to policy.

### 5. Artefacts and analysis
- [ ] Draft emails with subject, recipients and complete body.
- [ ] Draft notices and announcements.
- [ ] Generate business, operational, hiring, finance and performance reports.
- [ ] Generate evidence-based analysis, comparisons, trends and clearly labelled forecasts.
- [ ] Create spreadsheets, CSVs, PDFs, presentations, charts and structured datasets.
- [ ] Generate proposals, SOPs, plans, meeting summaries and recruitment materials.
- [ ] Store, preview, export, version and reference generated artefacts.
- [ ] Cite source records or data periods used in analysis; disclose missing or incomplete data.

### 6. Email and communications
- [ ] Draft and refine professional emails in context.
- [ ] Prepare audience/recipient lists and detect duplicates.
- [ ] Support templates and approved personalisation.
- [ ] Submit messages for review and send only after approval.
- [ ] Inspect delivery logs, failures and aggregate delivery outcomes.
- [ ] Draft notices, preview audiences and publish only after approval.

### 7. Hiring and LinkedIn
- [ ] Create and maintain vacancies and job descriptions.
- [ ] Generate recruitment campaigns, post copy, hashtags and supporting creative.
- [ ] Connect LinkedIn using secure OAuth; never collect LinkedIn passwords.
- [ ] Support authorised personal-profile and Company Page publishing where LinkedIn permissions/API access allow.
- [ ] Prepare LinkedIn posts for Review Centre approval before publishing.
- [ ] Publish approved content and store provider post IDs/URLs and status.
- [ ] Analyse applications and pipeline; prepare interview schedules and candidate communications.
- [ ] Keep candidate personal data restricted by role and purpose.

### 8. Logs, monitoring and intelligence
- [ ] Read authorised audit, email, automation, integration and application logs.
- [ ] Investigate failures and explain likely causes with evidence.
- [ ] Detect repeated errors, unusual activity and bottlenecks.
- [ ] Produce operational health and automation performance reports.
- [ ] Track task duration, success/failure rates and pending approvals.
- [ ] Never expose secrets, credentials or unnecessary personal data in model context or logs.

### 9. External integrations and MCP
- [ ] Reusable integration/MCP adapter framework.
- [ ] LinkedIn and additional approved external services.
- [ ] Secure OAuth/token storage, scoped permissions and revocation.
- [ ] Integration health checks, action logs and error handling.
- [ ] Approval policies for external writes and publishing.

### 10. UX and product presentation
- [ ] Minimal, professional, Google-inspired design language.
- [ ] Black/silver neutral visual direction with restrained accent colour.
- [ ] Responsive mobile and desktop command centre.
- [ ] Real product previews rather than generic marketing illustrations.
- [ ] Clear typography, spacing, navigation and accessible controls.
- [ ] Rich chat previews for tables, charts, files and Review Centre items.
- [ ] Consistent module UX and the marketing promise **Run. Monitor. Grow.**

### 11. Platform quality and security
- [ ] Tenant isolation and server-side role/permission enforcement.
- [ ] RLS review for every exposed table and storage bucket.
- [ ] Secrets remain server-side; no service-role keys in frontend code.
- [ ] Input/output validation, prompt-injection resistance and tool allowlists.
- [ ] Approval race-condition protection and immutable audit history.
- [ ] Automated unit, integration, security and end-to-end tests.
- [ ] Web, Android and production deployment verification.
- [ ] Operational monitoring, backups and rollback strategy.

## Delivery status

Do not use this document alone to assert implementation status. The append-only log in `upgrades/CHANGELOG.md` is the record of work performed. Each item must have evidence such as a commit/PR, test result, deployment, migration state or provider integration test. See [agent instructions](./upgrades/AGENT_INSTRUCTIONS.md).

## Current known context

The project has previously started a JD chat foundation, automation control plane, OpenRouter-backed agent runtime and command-centre redesign in stacked pull requests. Treat all such work as **unverified until current GitHub branch, CI, deployment and Supabase state are checked**. Do not assume prior conversational claims mean the code is merged or deployed.


### 2A. Batch 01 — Operational intelligence and organisation builder
Detailed delivery record: [JD Batch 01](./upgrades/JD-BATCH-01-OPERATIONAL-INTELLIGENCE.md).

- [x] Define a 20-capability registry and evidence-based capability status classifier.
- [x] Validate organisation blueprints and provide a no-write preview.
- [x] Persist organisation blueprint drafts through an admin- and tenant-validated service RPC.
- [x] Add tenant-scoped operational task storage and idempotency-key helper.
- [x] Add guarded operational task creation action and task state-machine contract.
- [x] Add vacancy draft validation and admin-only draft creation.
- [x] Add candidate recruitment-stage transition validation and tenant-scoped update.
- [ ] Complete scheduler/dispatcher and expired-lease recovery integration.
- [ ] Complete live execution monitor controls and cancellation/retry UI.
- [ ] Implement actual capability evidence collectors for schema, source, deployment and smoke tests.
- [ ] Complete division/department visual builder and approved provisioning workflow.
- [ ] Complete people, performance, finance and communications module tools.
- [ ] Complete workforce planner, recruitment assistant and hiring campaign integrations.
- [ ] Complete blueprint, operations and hiring UI.
- [ ] Apply migration in staging and pass cross-tenant, concurrency and failure-injection tests.

**Status:** foundations implemented; integration verification pending. The checked items above describe code/contracts added in this branch, not production deployment.


### Batch 01 operational interface and integration follow-through
- [x] Add Business Operations route and admin/manager navigation.
- [x] Add live task queue, task status controls and tenant-validated team assignment.
- [x] Add blueprint editor, validation and saved draft view.
- [x] Add vacancy draft, internal approval/opening and candidate intake UI.
- [x] Restrict candidate stage controls to valid next transitions.
- [x] Add JD aggregate people, performance and operations intelligence tools.
- [x] Add business-intelligence unit tests to CI.
- [ ] Complete dispatcher/scheduler and lease-recovery integration tests.
- [ ] Implement approval-gated, idempotent organisation provisioning.
- [ ] Add complete KPI trend dashboard and workforce planning workflows.
- [ ] Complete authorised communications and external hiring campaign integrations.
- [ ] Run staging migration, cross-tenant tests and authenticated smoke tests before deployment.

**Status:** operational interface and selected integrations implemented; staging and live verification pending.

### Durable execution and recovery
- [x] Route routine JD requests through the durable job ledger and return a queued response.
- [x] Add a five-minute scheduled worker poll workflow.
- [x] Add execution monitor UI for runs, attempts, steps and errors.
- [x] Add safe admin cancellation for queued/retry-wait jobs.
- [x] Add tenant-scoped, audited admin retry for failed jobs.
- [ ] Configure the single GitHub Actions secret `JD_SECRETS_JSON` (the Supabase project URL is now non-secret workflow configuration).
- [ ] Apply JD-004 and Batch 01 migrations in staging and verify queue/worker lifecycle.
- [ ] Deploy `jd-automation` and `jd-execution-worker` only after staging validation.
- [ ] Run failure-injection tests for worker crashes, lease expiry, duplicate deliveries and retry exhaustion.

### Final operational integration verification
- [x] Add live Business Intelligence dashboard and tenant-scoped snapshot API.
- [x] Include workforce aggregates, finance summaries, active-period performance, operations totals and communications delivery metadata.
- [x] Add multi-department blueprint editor.
- [x] Add task department and due-date controls with browser-timezone-safe ISO conversion.
- [x] Route routine JD requests through durable background execution.
- [x] Scope manager execution history to the manager's own runs.
- [x] Verify production web build, Deno tests, Edge Function type-check and application build.
- [ ] Configure GitHub worker secrets and deploy the worker/automation functions after staging validation.
- [ ] Apply migrations in staging and run authenticated tenant-isolation/failure-injection tests.

**Verified source head:** `52a8169b8ff8aa2cd60a9299b471118ba30ad2f7`. CI passed; production deployment remains pending.


### 2B. Batch 02 — Autonomous Business Platform
Detailed delivery contract: [JD Batch 02](./upgrades/JD-BATCH-02-AUTONOMOUS-BUSINESS-PLATFORM.md).

- [ ] Workflow Builder
- [ ] Visual Workflow Editor
- [ ] Recurring Operations Scheduler
- [ ] Automated Task Assignment
- [ ] Department Collaboration
- [ ] Business Intelligence Dashboard
- [ ] Predictive Performance Analysis
- [ ] Revenue Intelligence
- [ ] Expense Monitoring
- [ ] Cash-flow Reporting
- [ ] Document Intelligence
- [ ] Contract and Proposal Management
- [ ] Customer Relationship Management
- [ ] Sales Pipeline Automation
- [ ] Customer Support Workflows
- [ ] Integration Marketplace
- [ ] Secure OAuth Integration Manager
- [ ] External Service Monitoring
- [ ] Business Health Monitoring
- [ ] Executive Intelligence Reports

**Status:** planning baseline committed on `feature/jd-batch-02-autonomous-business-platform`; no Batch 02 feature is marked implemented until code and tests provide evidence. No database migrations or production deployments are included in the planning commit.


### Batch 02 progress — workflow foundation
- [x] Add bounded workflow-definition validator with allowlisted trigger/action types and cycle/reachability validation.
- [x] Expose admin/manager-only workflow draft validation preview (no persistence or execution).
- [x] Add workflow validator tests to CI.
- [ ] Persist versioned workflow drafts and add review/activation governance.
- [ ] Build visual workflow editor.
- [ ] Add durable recurring scheduler and idempotent run enqueue.

**Status:** first workflow foundation implemented; automated verification pending. No migration or deployment performed.


### Batch 02 progress — versioned workflow governance
- [x] Persist tenant-scoped workflow definitions and immutable numbered versions.
- [x] Reject stale draft writes using expected-version checks.
- [x] Bind Review Centre proposals to exact workflow/version IDs, immutable definition hash and proposal hash.
- [x] Cancel superseded pending review requests when a newer draft is saved.
- [x] Require administrator approval and latest-version/hash revalidation before activation.
- [x] Add service-only Edge Function endpoints for draft listing, saving, review submission and activation.
- [x] Add migration contract tests to CI.
- [ ] Run CI on the implementation branch and resolve any failures.
- [ ] Apply migration in an isolated staging environment and run authenticated tenant/role/approval tests.
- [ ] Build the visual workflow editor.
- [ ] Implement scheduler and execution separately; activation does not execute workflow nodes.

**Status:** code and migration authored; verification and deployment remain pending. No migration has been applied and no Edge Function deployed.

## JD-232 — Socrates-inspired response architecture
- [x] Stream Responses API text deltas into the durable assistant message; expose active partial content through the existing job-status poll.
- [x] Continue output-token-truncated answers up to two times and checkpoint continuation state; reject incomplete tool-call arguments.
- [x] Add opt-in fast/balanced/reasoning model routing with the configured default preserved when optional model secrets are absent.
- [x] Add role-scoped private TXT/MD/CSV/JSON/HTML/CSS/JS/TS/PY/SQL/XML/YAML/DOCX/XLSX/PPTX drafts and staged source files using the existing document bucket and document table.
- [x] Record first-token latency and expose average first-token time in the run monitor.
- [ ] CI, staging stream visibility, checkpoint-resume, private file storage/download and tenant-isolation verification.
- [ ] Production deployment after all release gates pass.

### JD-235 — Talent Intelligence, Recruitment and PayrollGuard
Detailed product and engineering specification: [JD-235](./upgrades/JD-235-TALENT-INTELLIGENCE-PAYROLLGUARD.md).

- [ ] Provider-neutral model roles, catalogue validation, intelligent routing, escalation and evaluation benchmark.
- [ ] Dedicated server-side research credentials and public-portfolio talent discovery.
- [ ] Evidence-backed candidate profiles, shortlist, privacy controls and opt-out handling.
- [ ] Direct-email recruitment and AI-discovered candidate outreach with Review Centre approval.
- [ ] Recruitment pipeline, offer governance and appointment verification.
- [ ] PayrollGuard funding arrangement, deterministic calculations, approval-bound payment batches and provider reconciliation.
- [ ] Employee payslips, payment status and outstanding-salary escalation.
- [ ] Recruitment-to-employee-to-payroll lifecycle integration.
- [ ] Multi-agent organisation coordination, connector discovery and evidence-backed completion.

**Status:** specification committed; implementation, provider connections, migrations, tests, staging and production verification are outstanding. Model names/IDs must be validated against live provider catalogues; no proposed model alias is assumed to be available.
