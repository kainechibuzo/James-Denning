# JD-235 — Talent Intelligence, Recruitment and PayrollGuard

**Date:** 2026-11-17  
**Status:** Proposed product/engineering specification  
**Scope:** Product architecture, workflows, security, data requirements and phased delivery. This document records intended work; it does not claim that any feature is implemented, connected, deployed or financially operational.

## 1. Product objective

Extend James-Denning (JD) into a business operating system that can coordinate the employee lifecycle: discover potential talent, manage recruitment, onboard approved hires, connect employees to departments and positions, monitor approved compensation obligations, and coordinate verified salary payments.

The system must remain evidence-led, tenant-isolated, permission-controlled and auditable. JD may prepare and coordinate work, but model output is never proof of a hire, payment, bank balance or completed external action.

## 2. Intelligence and model architecture

### 2.1 Provider-neutral model routing

Build on the existing provider abstraction and OpenRouter-first configuration. Do not hard-code model names or assume that a model, alias, price or capability exists. At runtime, validate configured model IDs against the selected provider's current model catalogue and supported API features.

Provide configurable model roles:
- **Primary reasoning:** complex planning, research synthesis and high-consequence analysis.
- **Execution:** routine conversation, drafting and standard tool workflows.
- **Escalation:** difficult tasks, repeated failures or verifier-detected inconsistencies.
- **Lightweight:** classification, extraction and simple notifications.
- **Coding specialist:** repository analysis and software engineering.
- **Vision specialist:** image, screenshot and visual-document interpretation where supported.

Candidate models such as Claude Opus or other frontier models may be evaluated when the provider actually exposes the required model ID. Treat model names discussed in product planning as candidates, not validated production identifiers.

### 2.2 Routing and escalation

Route based on task complexity, context requirements, tool support, latency, cost limits and consequence level. Escalation must preserve task state, conversation context, tool outputs and evidence. Keep deterministic operations—especially money calculations, permission checks and state transitions—outside the language model.

### 2.3 Intelligence control and evaluation

Add configuration for provider/model roles, secure credentials, availability, provider-reported input/output/cached tokens, provider-reported costs, latency, error rates, fallback events, per-task routing and budget limits. Never estimate missing usage or costs.

Create a repeatable JD evaluation suite covering business planning, multi-step tool execution, recruitment, financial reasoning, code changes, security review, failure recovery and evidence-based reporting. Compare models on task success, correctness, tool discipline, latency and actual cost—not reputation or benchmark claims alone.

## 3. JD Talent Intelligence

### 3.1 Separate research credentials

Introduce a dedicated research-provider credential, independent of primary model credentials and email credentials. Store it only in server-side encrypted secrets/configuration. Support rotation, least-privilege scopes, usage limits, health checks and audit events. Never return secrets to the browser, prompts, logs or candidate records.

### 3.2 Public portfolio discovery

For an approved vacancy, JD may search permitted public professional sources, such as:
- Public personal portfolios and professional websites.
- Public GitHub profiles and repositories through the GitHub API.
- Search-engine results through a configured search provider such as SerpAPI.
- Other sources only where access terms and applicable law permit.

Workflow:
1. Read an approved vacancy and its requirements.
2. Search public sources relevant to the vacancy.
3. Collect only information necessary for the recruitment purpose.
4. Link every material claim to its original public source and collection date.
5. Summarise demonstrated projects and skills without inventing qualifications or experience.
6. Produce a shortlist for human review.
7. Record source, freshness, confidence/limitations and opt-out status.

Do not bypass authentication, paywalls, robots/access restrictions or platform controls. Do not infer protected or sensitive characteristics. Do not scrape private contact details or build covert dossiers. Provide candidate correction/deletion and opt-out handling consistent with applicable privacy requirements.

### 3.3 Candidate record

Candidate records should include only necessary fields: candidate identity/contact details supplied or lawfully obtained for recruitment, vacancy, portfolio/source URLs, evidence-backed skills and projects, research date, review notes, recruitment stage, consent/communication preferences and retention/deletion status. Restrict access by role and tenant.

## 4. Talent Acquisition and email hiring

Support two recruitment entry paths:

### 4.1 JD-discovered candidates
JD researches permitted public portfolios against an approved vacancy, prepares evidence-backed candidate summaries and drafts a personalised invitation. HR reviews the candidate and message before outreach.

### 4.2 Direct email invitation
An authorised user may enter a person's email address, choose a department and position, and provide context. JD retrieves the approved job description and approved compensation range/terms, then prepares a personalised recruitment email. The draft must be reviewed and approved before sending through an authorised company email integration.

### 4.3 Recruitment communications
Support:
- Initial expression-of-interest invitations.
- Interview invitations and scheduling follow-ups.
- Requests for application information.
- Application acknowledgements.
- Draft employment offers and offer follow-ups.
- Acceptance, rejection and withdrawal communications.
- Onboarding instructions.

A recruitment invitation is not an offer or employment contract. A draft offer is not an approved offer. An accepted offer is not an active employee record until the organisation completes its appointment checks and authorised confirmation.

### 4.4 Recruitment pipeline
Track: discovered → researched → shortlisted → outreach approval pending → contacted → response received → application received → interview scheduled → interview completed → offer drafted → offer approved → offer sent → accepted/declined → appointment verified → onboarding → active employee. Also support rejected, withdrawn, opted-out and archived states.

Prevent duplicate outreach, respect opt-outs, rate-limit communications and keep a full delivery/reply history. External email sending requires the existing Review Centre/approval policy and provider confirmation.

## 5. PayrollGuard — protected payroll coordination

### 5.1 Financial architecture

Provide a dedicated payroll funding arrangement with a regulated bank or payment provider. Prefer a legally and operationally appropriate segregated payroll account or reserve arrangement. Funds remain with the financial institution; JD is not a custodian, wallet or bank.

Conceptual flow:

Company operating account → designated payroll reserve → approved payroll calculation and review → authorised payment-provider instruction → employee bank account → provider confirmation and reconciliation.

Confirm legal, banking, tax, employment and safeguarding requirements in each operating jurisdiction before enabling live transfers. For Nigeria, validate applicable employment, PAYE, pension, statutory deduction and data-protection obligations with qualified professionals and the selected provider.

### 5.2 Payroll records and calculation

Maintain approved employment terms, salary components, pay frequency, effective dates, allowances, deductions, statutory contributions, bank-payment references and payroll status. Use deterministic, tested payroll code and authoritative statutory configuration—not an LLM—for calculations.

Support payroll previews, approval, payslips, payroll history, funding forecasts, reserve monitoring and reconciliation. Keep currencies separate; never aggregate unlike currencies without an explicit, sourced conversion.

### 5.3 Payment workflow

1. Select eligible active employees for the pay period.
2. Validate approved employment and compensation records.
3. Calculate gross pay, deductions and net pay deterministically.
4. Produce a reviewable payroll register and funding requirement.
5. Check reserve availability through an authorised provider API.
6. Submit the payroll batch for required approval.
7. Create idempotent payment instructions through the provider.
8. Record each provider transaction/reference.
9. Verify final provider status; distinguish pending, processing, paid, failed, reversed and unknown.
10. Reconcile provider settlement against payroll obligations.
11. Issue payslips and notify employees based on verified status.

Never claim payment is complete from an HTTP acceptance alone if the provider reports it as pending. Never mark paid without authoritative confirmation. Handle partial batches and per-employee failures explicitly.

### 5.4 Employee protection controls

- Preserve approved salary agreements and effective-dated change history.
- Require authorised approval for salary changes and payroll batch execution.
- Restrict payroll data and bank details to least-privilege roles.
- Prevent silent deletion or alteration of outstanding salary obligations.
- Maintain a protected payroll allocation ledger and record any authorised release or adjustment.
- Alert management before a funding shortfall or missed pay date.
- Create an escalated outstanding-payroll case when funding or payment fails.
- Give employees secure access to their own payslips and payment status.
- Keep immutable audit events for preparation, approval, execution, provider confirmation and reconciliation.
- Provide correction and dispute workflows.

Payroll reserve restrictions must be enforced by the financial institution/account controls where available, not merely by JD UI or model instructions.

## 6. Workforce lifecycle integration

Connect Talent Acquisition and PayrollGuard to People, Departments, Positions, Attendance, Performance, Schedule, Billing, Email, Reports, Permissions, Review Centre, Logs and Automation Runs.

After offer acceptance:
1. HR verifies the acceptance and required documents.
2. An authorised manager confirms the appointment.
3. Create or activate the employee record.
4. Assign department, position, manager and start date.
5. Register the approved compensation agreement.
6. Update payroll forecasts and funding requirements.
7. Create onboarding, training and access-provisioning tasks.
8. Grant employee portal access according to role.
9. Preserve the evidence and approvals for each transition.

Do not create an active employee or payroll entitlement solely because JD sent an invitation or a candidate replied positively.

## 7. Autonomous organisation management

JD should inspect the organisation's real records and distinguish:
- Department/position created.
- Manager appointed.
- Employee hired and appointment verified.
- Department staffed.
- Workflows configured.
- Department operational.
- Outcomes independently verified.

Identify vacancies, missing managers, incomplete onboarding, missing permissions, unassigned work, expired documents and operational blockers. Generate prioritised activation plans and coordinate approved cross-department workflows.

For a trucking/logistics organisation, example coordination includes HR recruitment, HSE training, Compliance document checks, Operations assignment, Maintenance readiness and Finance/payroll setup. Do not hard-code trucking-specific departments into the general platform.

## 8. Agent runtime and execution integrity

Substantial tasks should have structured objectives, dependencies, plans, assigned agents, tool requirements, approval gates, persistent state, retries, idempotency keys, checkpoints, evidence and explicit completion criteria.

Support specialist agents (Executive, HR, Recruitment, Finance, Payroll, Operations, Compliance, Research, Engineering and Reporting) through a shared permission-enforcing tool registry. Agents inherit tenant and role permissions; model instructions are not a security boundary.

Expose honest states: proposed, planned, drafted, awaiting approval, approved, queued, executing, provider-pending, verified, failed, blocked and cancelled. Verify changes through read-after-write checks and authoritative external evidence.

## 9. MCP and connector ecosystem

Build on the existing connector/MCP adapter architecture. Candidate integrations include GitHub, Lovable, Gmail/Resend, Google Calendar, SerpAPI, Supabase, Vercel, Render and regulated payment/banking providers.

For each connector record provider, available actions, authentication status, granted scopes, tenant binding, health, usage, last successful check and revocation state. Discover and propose connectors when a task requires missing capabilities. Require explicit user/admin connection and approval for external writes. Never expose credentials to the model or browser.

## 10. Business finance and organisational analytics

Connect operational records to traceable financial data: income, expenses, invoices, collections, supplier payments, payroll obligations, budgets, cash flow and outstanding balances. Provide department, recruitment, workforce and payroll analytics from source records with explicit periods, currencies and missing-data disclosures.

## 11. User experience

Keep JD as the unified conversational operating interface. Extend navigation/module coverage with:
- Talent Acquisition.
- PayrollGuard.
- Intelligence Control.
- Connector Management.

Provide candidate research panels, recruitment pipeline, email drafts, approval cards, payroll register, reserve/funding status, payment reconciliation, employee payslips, model routing controls, usage/cost monitoring, execution timelines, evidence panels and persistent checklists. Use the existing product design system and mobile-responsive patterns.

## 12. Security, privacy and governance

- Enforce tenant isolation, server-side role checks and RLS.
- Separate research, email, HR, payroll administration, payment preparation, payment approval and payment execution permissions.
- Keep API keys, OAuth tokens and bank credentials server-side.
- Encrypt sensitive candidate, employee and bank data at rest and in transit.
- Minimise candidate data collection; define retention and deletion policies.
- Require human review for hiring decisions and candidate outreach.
- Require appropriate approval for offers, appointments, salary changes and live payment batches.
- Use idempotency, duplicate-payment prevention, audit logs and provider reconciliation.
- Protect against prompt injection in public portfolio content and external documents; treat retrieved content as untrusted data.
- Never expose secrets or unnecessary personal data in model context, reports or logs.
- Obtain qualified legal, payroll and banking review before production financial activation.

## 13. Phased implementation and acceptance criteria

### Phase 1 — Intelligence foundation
- [ ] Inspect current provider adapter and deployed model IDs.
- [ ] Add configurable model roles and provider-catalogue validation.
- [ ] Add task-based routing, bounded escalation and fallback.
- [ ] Add usage, latency, cost and failure observability.
- [ ] Build repeatable JD model evaluation benchmark.
- [ ] Preserve task context and durable checkpoints during escalation.

**Accept when:** invalid/unavailable model IDs fail safely; routing decisions are observable; usage/cost values are provider-reported; evaluation results are reproducible.

### Phase 2 — Talent Intelligence
- [ ] Add separate encrypted research-provider credentials.
- [ ] Integrate approved public search and GitHub APIs.
- [ ] Build vacancy-based portfolio discovery.
- [ ] Build source-linked candidate profiles and shortlist.
- [ ] Add opt-out, retention and access controls.

**Accept when:** every candidate claim has source evidence; access restrictions are respected; tenant isolation and deletion/opt-out tests pass.

### Phase 3 — Email recruitment
- [ ] Add direct candidate email entry.
- [ ] Build approved vacancy/position selection.
- [ ] Generate personalised recruitment drafts.
- [ ] Add Review Centre approval and email provider integration.
- [ ] Track delivery, replies, duplicates and opt-outs.
- [ ] Build recruitment pipeline and candidate history.

**Accept when:** no unapproved external message is sent; provider delivery state is recorded; invitation, offer and appointment states remain distinct.

### Phase 4 — PayrollGuard
- [ ] Complete legal/provider architecture review.
- [ ] Design payroll schema and immutable audit ledger.
- [ ] Implement deterministic payroll calculation and tests.
- [ ] Add payroll register, funding forecast and reserve monitoring.
- [ ] Integrate payment-provider sandbox.
- [ ] Implement idempotent payment batches and per-employee status.
- [ ] Implement reconciliation, failure escalation and payslips.
- [ ] Build employee self-service payroll view.

**Accept when:** sandbox tests cover successful, pending, failed, duplicate, reversed and partial payments; calculations reconcile to independently verified test cases; no live transfer is enabled by default.

### Phase 5 — Workforce integration
- [ ] Connect verified appointments to employee records.
- [ ] Connect People, Departments and Positions.
- [ ] Connect approved compensation to payroll.
- [ ] Connect onboarding, attendance and performance.
- [ ] Add workforce activation reporting.

**Accept when:** every transition is permission-checked, audited and backed by persisted evidence.

### Phase 6 — Autonomous coordination
- [ ] Improve multi-agent task planning and hand-offs.
- [ ] Add durable task state, retry and recovery.
- [ ] Add connector discovery and health monitoring.
- [ ] Add evidence-backed department dashboards.
- [ ] Add execution verification and honest blocker reporting.

**Accept when:** end-to-end workflows resume safely after interruption and cannot bypass tenant, role or approval checks.

### Phase 7 — Production readiness
- [ ] Security and privacy review.
- [ ] Database migration and rollback review.
- [ ] Cross-tenant and role-permission tests.
- [ ] Staging provider tests.
- [ ] Payroll and recruitment failure-injection tests.
- [ ] Monitoring, alerts and incident procedures.
- [ ] Explicit production approval.
- [ ] Production smoke tests and reconciliation evidence.

## 14. Non-negotiable engineering rules

1. Never fabricate candidates, employees, qualifications, transactions, balances or completed work.
2. Never expose provider, research, email or banking credentials to the browser.
3. Never treat model output as proof of a financial or external action.
4. Never send recruitment outreach or offers without the required approval.
5. Never treat an invitation as an accepted offer or active appointment.
6. Never execute a live payroll batch without appropriate authorisation.
7. Never mark a payment paid without authoritative provider confirmation.
8. Never silently modify or erase approved salary obligations.
9. Never use an LLM as the authority for payroll arithmetic, permission enforcement or payment state.
10. Never mark a department operational merely because it was created.
11. Preserve tenant isolation, idempotency, audit history and rollback paths.
12. Distinguish source implementation, CI verification, staging verification, deployment and production smoke testing.

## 15. Delivery status

This is a planning specification only. No code implementation, provider connection, credential setup, migration, recruitment outreach, payroll transfer, staging verification or production deployment is claimed by this document. Record each implementation slice in the append-only changelog and reconciled outstanding registry with its own evidence.
