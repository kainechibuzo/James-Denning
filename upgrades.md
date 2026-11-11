# James-Denning & JD — Upgrade Master Plan

> Product promise: **Run. Monitor. Grow.** JD is the primary operating interface for an organisation. Users describe outcomes; JD inspects available data and capabilities, prepares artefacts, executes authorised workflows, verifies results and reports back.

This is the canonical, human-readable upgrade index. The detailed implementation contract, append-only upgrade history, AI-agent instructions and token-usage ledger live in [`/upgrades/`](./upgrades/README.md).

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
  - [ ] Durable queue, worker leases, resumability, idempotent recovery and crash handling. (Design: [JD-004](./upgrades/JD-004-DURABLE-EXECUTION.md); implementation not started.)
- [ ] Streaming responses and resumable long-running tasks.
- [ ] File attachments and ingestion for CSV, XLSX, PDF and supported documents.
- [ ] Context/memory scoped appropriately to user and organisation.
- [ ] OpenRouter integration with configurable model selection and provider abstraction.

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
