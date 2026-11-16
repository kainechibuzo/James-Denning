# James Denning — Master Execution Checklist

**Mission:** Build an autonomous business operating system.

> JD is the product. The organisation's departments, records, workflows and dashboards are the systems JD operates and the humans use to supervise it.

JD must understand business objectives, coordinate departments, execute permitted work, track real progress, verify outcomes and request human approval when necessary.

**Baseline:** 2026-11-16 · **8 phases** · **5 confirmed merged changes** · **0/9 final acceptance criteria verified**.

This is the master planning checklist, not an application task ledger. Checking a box does not execute work, approve an action or verify the application. Existing code is a starting point to inspect and reuse, not proof that a requirement passes. Unchecked means **not accepted**, not necessarily **not implemented**.

## Evidence and completion rules

- Use stable IDs below in issues, PRs, test reports and acceptance records.
- Track each work item as `not assessed`, `in progress`, `blocked`, `implemented — unverified`, `failed` or `verified`. Only `verified` earns a checked box.
- Before starting an item, assign a named delivery owner and an independent reviewer. Roles below are proposed responsibilities, not assigned people.
- Every verification record needs: item ID, tested commit, environment/deployment, timestamp, test procedure and expected result, actual result, sanitised logs/artifact links, persisted record references where applicable, reviewer and remaining limitations.
- Code, a merged PR, an HTTP 200, an assistant statement or a green worker invocation alone cannot establish a business outcome.
- Distinguish **draft → saved → approved → executed → independently verified**. Do not collapse these states.
- Use synthetic data in a genuinely isolated staging environment. Do not reset, reseed or use a production tenant as a test sandbox. Production inspection is read-only unless a specific operational action is approved.
- Never put tokens, private documents, applicant data, raw conversations or privileged secrets in Git evidence. Keep restricted evidence in access-controlled storage and link it by reference.
- JD must not approve its own restricted actions. Consequential financial/legal commitments and recruitment publication need appropriate human authorisation.
- Reopen a verified item when new evidence invalidates it. Preserve the previous result and reason; do not erase the audit trail.

**Evidence:**
- [Phase 1 baseline, findings and blockers](evidence/2026-11-16-phase-1/REPORT.md).
- [Task reliability and staging-safety slice](evidence/2026-11-16-task-reliability/REPORT.md): staff action routing, strict task/audit acknowledgements and staging target guards implemented; 57 task tests and 43 guard assertions pass locally. Live endpoint/browser acceptance and incident correlation remain pending. No requirement is marked accepted from local evidence alone.
- [Phase 2 navigation application](evidence/2026-11-16-phase2-navigation/REPORT.md): JD branding, permission-filtered sidebar search, expansion/active-page accessibility and mobile focus/scroll handling applied on the branch based on merged PR #86. All 25 navigation tests pass locally; complete departmental consolidation and live/browser acceptance remain open.
- [Phase 2 departments and account access](evidence/2026-11-16-phase2-departments/REPORT.md): existing routes grouped into business departments, distinct People modules clarified, compact defaults and explicit sign-out-to-switch flow implemented. 73 navigation tests pass, including role compatibility and mounted-dialog checks. PR #87 production deployment metadata and post-merge CI verified; this newer slice still needs its own review/deployment and authenticated browser acceptance. No scorecard gate is checked from local tests alone.

- [Chat task-state and reconciliation slice](evidence/2026-11-16-task-workspace/REPORT.md): separates local ticks, unverified snapshots and refreshed saved records; enforces read-before-write and refresh after uncertain acknowledgement. The expanded task suite has 104 passing tests, including mounted React task cards and synthetic read-back/remount. Live authenticated persistence and the complete role architecture remain unverified.

## Execution order and phase gates

Phases 1–4 form one foundation programme, delivered sequentially in small, testable slices rather than as four simultaneous rewrites. Security and isolation are prerequisites throughout; Phase 7 is not permission to defer them.

| Order | Delivery slice | Primary phases | Proposed accountable roles | Exit evidence |
|---|---|---|---|---|
| 1 | Existing platform verification | 1; isolation prerequisites from 7 | Engineering + QA/security | Baseline report, isolated staging and reproducible critical-path tests |
| 2 | Task-update and execution reliability | 1, 3, 4 | Backend engineering + QA | Reproduced failure, regression test, persisted transition/audit and refresh/recovery proof |
| 3 | JD-centred interface and sidebar | 2 | Product/frontend + accessibility QA | Role-aware navigation and phone/tablet/desktop journey evidence |
| 4 | Central permission and execution architecture | 3 | Backend/security + department owners | Tenant/role/approval denial tests and safe concurrency/recovery evidence |
| 5 | Evidence, verification and approvals | 4 | Backend/frontend + independent reviewer | Event-to-record trace and restricted-action approval demonstration |
| 6 | Department integrations | 5 | Department managers + engineering | Human and JD end-to-end workflow evidence for every department |
| 7 | NaijaHaul operational completion | 6 | Owner + operations, finance, HR and professional advisers | Verified documents, authorised hiring and signed launch gates |
| 8 | Production readiness and final acceptance | 7, 8 | Engineering/security + owner | Recovery rehearsal, performance/accessibility results and 9/9 reviewed scorecard |

Do not start a replacement queue, permission system or approval system until existing implementations have been mapped and their gaps demonstrated. Preserve useful modules and education-tenant compatibility while removing irrelevant school terminology from general business workspaces.

## Confirmed merged changes — not production acceptance

| PR | Change | Merge commit |
|---|---|---|
| [#80](https://github.com/kainechibuzo/James-Denning/pull/80) | Launch checklist idempotency and batch isolation | `3e74bdf4807ade67647ef8a1f61dd8b9168961fe` |
| [#81](https://github.com/kainechibuzo/James-Denning/pull/81) | CSP-safe CAE formula evaluation | `608202d23b2d1db5c19881281b69ee394c96b6f0` |
| [#82](https://github.com/kainechibuzo/James-Denning/pull/82) | Promotion print escaping | `a7947d7ee7c8b08733df8f87164b6633e2d51d17` |
| [#83](https://github.com/kainechibuzo/James-Denning/pull/83) | Broadsheet HTML escaping | `1f8e3a72477c19794fb7f24e2aa75bd26ed7a98d` |
| [#85](https://github.com/kainechibuzo/James-Denning/pull/85) | Replacement isolated-staging/security guidance | `9895abf0e4f7d6bfd871249ea125065e92f767b0` |

## Phase 1 — Stabilise the existing platform

**Start here.** Initial inspection is partial; the phase is not complete.

- [ ] P1-01 Verify latest `master`, relevant GitHub Actions and their actual coverage.
- [ ] P1-02 Verify Vercel production deployment, commit identity and live application behaviour.
- [ ] P1-03 Test authentication, login, logout and session persistence.
- [ ] P1-04 Test role and permission enforcement, including denied operations.
- [ ] P1-05 Test launch-checklist idempotency, including repeated and concurrent requests.
- [ ] P1-06 Test batch isolation and cross-tenant denial using non-empty fixtures.
- [ ] P1-07 Test CAE formula evaluation in a browser under production-equivalent CSP.
- [ ] P1-08 Test promotion print HTML escaping with malicious and ordinary fixture values.
- [ ] P1-09 Test broadsheet HTML escaping with malicious and ordinary fixture values.
- [ ] P1-10 Review and correlate the background-task failure from the hiring request.
- [ ] P1-11 Reproduce and investigate the authenticated task-update failure (shared with P4-T01).
- [ ] P1-12 Inspect persisted execution history, failed attempts and recovery outcomes.
- [ ] P1-13 Check Supabase runtime logs for errors in an explicitly recorded time window.
- [ ] P1-14 Verify actual frontend deployment bundles contain no privileged secrets.
- [ ] P1-15 Verify no production data or infrastructure is being used as a staging sandbox.

**Gate:** Actual test results, deployment evidence, persisted-record checks and runtime logs; no unresolved critical security or data-integrity failures. Local builds and service health alone do not pass this gate.

## Phase 2 — Rebuild the interface around JD

### Navigation and mobile experience

- [ ] P2-N01 Make JD Assistant the default authenticated landing page.
- [ ] P2-N02 Make JD the primary product identity.
- [ ] P2-N03 Replace the giant unstructured sidebar with coherent groups.
- [ ] P2-N04 Consolidate duplicate Team and People entries.
- [ ] P2-N05 Group pages into logical business departments.
- [ ] P2-N06 Consolidate duplicate billing and administration links.
- [ ] P2-N07 Remove irrelevant school-management terminology from business workspaces.
- [ ] P2-N08 Preserve useful existing modules and tenant compatibility.
- [ ] P2-N09 Add sidebar search, limited to authorised navigation.
- [ ] P2-N10 Add collapsible navigation groups.
- [ ] P2-N11 Improve mobile navigation and scrolling.
- [ ] P2-N12 Make the active page clearly identifiable.
- [ ] P2-N13 Keep owner profile and organisation switcher accessible.
- [ ] P2-N14 Verify responsive phone, tablet and desktop layouts.

**Proposed navigation:** JD Assistant; Business Overview; Live Operations; Tasks & Execution; Approvals; Evidence & Activity; Departments; People & Recruitment; Finance; Commercial; Compliance; Operations & Fleet; Reports & Analytics; Integrations; Permissions; Organisation Settings.

Use the supplied visual references for inspiration, not as evidence of working functionality. Map every destination to a real authorised route; avoid empty dashboards or duplicate systems.

### Human access control

- [ ] P2-A01 Owner: full organisational visibility and management within their tenant.
- [ ] P2-A02 Administrator: only explicitly granted administrative capabilities.
- [ ] P2-A03 Department manager: department-specific management.
- [ ] P2-A04 Employee: assigned work and permitted records.
- [ ] P2-A05 HR officer: authorised recruitment and people management.
- [ ] P2-A06 Finance officer: authorised finance and billing.
- [ ] P2-A07 Public visitor: only intentionally public information.
- [ ] P2-A08 Enforce the matrix in backend APIs and database policies.
- [ ] P2-A09 Prove menu hiding cannot substitute for backend security through direct-request tests.
- [ ] P2-A10 Add an access audit trail with actor, scope, action and outcome.

**Gate:** Owner, admin, department manager, employee, HR, finance and public journeys tested; direct forbidden requests denied; keyboard/mobile navigation and organisation switching verified without cross-tenant state leakage.

## Phase 3 — Give JD genuine organisational control

**Core product:** Broad authorised operational reach, not unrestricted access to secrets, transfers or human approvals.

### Central intelligence

- [ ] P3-C01 Build a unified organisational context layer.
- [ ] P3-C02 Inspect authorised business records.
- [ ] P3-C03 Understand departments, employees and responsibilities.
- [ ] P3-C04 Understand company objectives and operating policies.
- [ ] P3-C05 Retrieve previous execution history.
- [ ] P3-C06 Identify incomplete and blocked work.
- [ ] P3-C07 Distinguish assumptions from verified facts and retain sources.
- [ ] P3-C08 Maintain persistent, tenant-scoped organisational context.
- [ ] P3-C09 Identify dependencies between tasks.
- [ ] P3-C10 Break objectives into executable work.

### Agent execution

- [ ] P3-E01 Build or complete a reliable task planner.
- [ ] P3-E02 Verify a persistent execution queue.
- [ ] P3-E03 Implement task prioritisation.
- [ ] P3-E04 Implement task dependencies and dependency-failure handling.
- [ ] P3-E05 Implement department assignment.
- [ ] P3-E06 Implement agent-to-agent coordination.
- [ ] P3-E07 Support multiple concurrent tasks safely.
- [ ] P3-E08 Add retries with sensible limits and transient/permanent error classification.
- [ ] P3-E09 Add timeout and cancellation handling.
- [ ] P3-E10 Recover from interrupted execution without repeating external side effects.
- [ ] P3-E11 Prevent duplicate execution with persisted idempotency and safe worker claims.
- [ ] P3-E12 Make task updates persistent.
- [ ] P3-E13 Make task ownership explicit.
- [ ] P3-E14 Track progress using real execution events.

### JD's authority

- [ ] P3-A01 Give JD authorised read access across departments.
- [ ] P3-A02 Give JD authorised write access to relevant records.
- [ ] P3-A03 Execute approved operational actions within explicit policy limits.
- [ ] P3-A04 Prepare approval requests.
- [ ] P3-A05 Request human authorisation when required.
- [ ] P3-A06 Require approval for consequential financial and legal commitments.
- [ ] P3-A07 Prevent JD from approving its own restricted actions.
- [ ] P3-A08 Record the human or agent that initiated each action.
- [ ] P3-A09 Maintain a complete, access-controlled audit history.
- [ ] P3-A10 Support rollback or compensation where technically possible; disclose irreversible effects.

**Gate:** An authorised multi-department objective survives interruption, retry and concurrent delivery with correct permissions, bounded attempts, no duplicate side effects and an auditable approval boundary. A denied objective cannot bypass that boundary through another tool or agent.

## Phase 4 — Make execution visible and trustworthy

### Live execution interface

- [ ] P4-L01 Display queued tasks.
- [ ] P4-L02 Display running tasks.
- [ ] P4-L03 Display completed tasks.
- [ ] P4-L04 Display failed tasks.
- [ ] P4-L05 Display blocked tasks.
- [ ] P4-L06 Show the current execution stage.
- [ ] P4-L07 Show the responsible department.
- [ ] P4-L08 Show the responsible agent or worker.
- [ ] P4-L09 Show timestamps.
- [ ] P4-L10 Show retry counts and retry eligibility.
- [ ] P4-L11 Show useful, sanitised execution errors.
- [ ] P4-L12 Provide a task detail view.
- [ ] P4-L13 Provide retry actions only for eligible failures and authorised actors.
- [ ] P4-L14 Provide cancellation for supported operations, with honest partial-effect reporting.
- [ ] P4-L15 Show actual execution progress, not simulated percentages.

### Evidence and verification

- [ ] P4-E01 Persist execution events.
- [ ] P4-E02 Translate internal tool events into understandable descriptions.
- [ ] P4-E03 Hide UUIDs by default while retaining diagnostic access.
- [ ] P4-E04 Link actions to their evidence.
- [ ] P4-E05 Record created and updated records.
- [ ] P4-E06 Record sanitised external integration responses.
- [ ] P4-E07 Distinguish drafts from saved records.
- [ ] P4-E08 Distinguish approved actions from executed actions.
- [ ] P4-E09 Distinguish completed internal work from real-world outcomes.
- [ ] P4-E10 Add independent verification records.
- [ ] P4-E11 Never mark work complete solely because an AI claims completion.

### Task endpoint reliability — priority before the interface redesign

- [ ] P4-T01 Correlate the reported screenshot failure to a request and persisted execution (same investigation as P1-11).
- [ ] P4-T02 Verify authenticated endpoint configuration and token/session handling.
- [ ] P4-T03 Verify user and organisation identifiers.
- [ ] P4-T04 Verify task ownership and permissions.
- [ ] P4-T05 Check request validation and response handling.
- [ ] P4-T06 Check database constraints and deployed migration/function versions.
- [ ] P4-T07 Determine whether updates are rejected, rolled back or silently lost.
- [ ] P4-T08 Add reliable, sanitised error reporting and correlation references.
- [ ] P4-T09 Add bounded retry handling for transient failures; do not retry permission/validation errors blindly.
- [ ] P4-T10 Test creation, assignment, progress updates and completion end to end.
- [ ] P4-T11 Verify changes and audit evidence survive browser refresh and a new session.

**Gate:** A supervisor can trace a task from request to persisted effects and independent verification, distinguish failure/partial completion, and retry/cancel only when supported. An agent's unsubstantiated success statement never produces verified status.

## Phase 5 — Connect and consolidate all departments

Each department must be an operational system, not just a named dashboard.

| Department | Required operational scope | Acceptance record |
|---|---|---|
| Operations & Fleet | Dispatch, trips, carriers, vehicle records, delivery evidence | P5-OPS — pending |
| Commercial | Customer acquisition, leads, quotations, contracts | P5-COM — pending |
| Finance | Billing, receivables, payables, financial reporting | P5-FIN — pending |
| Compliance | Licences, permits, insurance, regulatory evidence | P5-CMP — pending |
| Human Resources | Recruitment, onboarding, staff records | P5-HR — pending |
| HSE | Safety, incident reporting, training | P5-HSE — pending |
| Maintenance | Inspections, defects, maintenance records | P5-MNT — pending |
| Warehousing | Storage, inventory, distribution | P5-WHS — pending |
| Engineering | Product infrastructure, integrations, technical operations | P5-ENG — pending |

Apply **every** requirement below to **each** department. Use IDs such as `P5-FIN-04` in its evidence record. A shared box can be checked only when all nine department records pass it.

- [ ] P5-01 Establish actual responsibilities.
- [ ] P5-02 Define authoritative data and its source systems.
- [ ] P5-03 Define manager and reporting structure.
- [ ] P5-04 Define task workflows.
- [ ] P5-05 Connect authorised records to JD.
- [ ] P5-06 Connect tasks to the shared execution engine.
- [ ] P5-07 Connect approvals to the central approval system.
- [ ] P5-08 Connect reporting to verified operational data.
- [ ] P5-09 Remove disconnected or duplicated functionality without losing records.
- [ ] P5-10 Test workflows as both a human and JD, including denied operations and failures.

**Gate:** Nine department acceptance records, each covering all ten requirements and at least one real integration path tested safely with synthetic fixtures.

## Phase 6 — Complete NaijaHaul as the operating proof

Business facts require evidence. Do not infer legal identity, ownership, insurance or launch readiness from generated documents.

### Business identity

- [ ] P6-I01 Verify the registered legal entity.
- [ ] P6-I02 Confirm the exact legal name.
- [ ] P6-I03 Confirm directors and ownership using appropriate evidence.
- [ ] P6-I04 Confirm the trading name.
- [ ] P6-I05 Verify business address and contact information.
- [ ] P6-I06 Complete the organisational workspace identity.
- [ ] P6-I07 Ensure customer documents use verified details.

### Operations and fleet

- [ ] P6-O01 Finalise launch services and operating lanes.
- [ ] P6-O02 Finalise fleet capacity requirements.
- [ ] P6-O03 Build the partner-carrier pipeline.
- [ ] P6-O04 Define owner-driver acceptance criteria.
- [ ] P6-O05 Create vehicle and driver document controls.
- [ ] P6-O06 Prepare vehicle inspection procedures.
- [ ] P6-O07 Complete driver onboarding materials.
- [ ] P6-O08 Complete the dispatch procedure.
- [ ] P6-O09 Establish trip records.
- [ ] P6-O10 Establish proof-of-delivery evidence.
- [ ] P6-O11 Complete breakdown and replacement-carrier procedures.
- [ ] P6-O12 Draft the owner-driver trip agreement for legal review.
- [ ] P6-O13 Establish incident reporting.

### Commercial

- [ ] P6-C01 Build the sales pipeline.
- [ ] P6-C02 Define target customers.
- [ ] P6-C03 Prepare a verified company profile.
- [ ] P6-C04 Prepare sales materials.
- [ ] P6-C05 Define customer onboarding.
- [ ] P6-C06 Define credit controls.
- [ ] P6-C07 Prepare the rate card.
- [ ] P6-C08 Prepare quotation templates.
- [ ] P6-C09 Draft customer haulage terms for legal review.
- [ ] P6-C10 Build customer follow-up workflows.

### Finance

- [ ] P6-F01 Complete the verified cost-per-trip model with sourced assumptions.
- [ ] P6-F02 Build the working-capital forecast.
- [ ] P6-F03 Define expense approval limits.
- [ ] P6-F04 Define carrier payment controls.
- [ ] P6-F05 Define customer invoicing procedures.
- [ ] P6-F06 Establish receivables tracking.
- [ ] P6-F07 Establish monthly management reporting.
- [ ] P6-F08 Test trip-level profitability reporting against known inputs.

### Compliance and launch readiness

- [ ] P6-L01 Obtain professional Nigerian transport compliance advice.
- [ ] P6-L02 Build the compliance register.
- [ ] P6-L03 Verify applicable registrations and permits.
- [ ] P6-L04 Verify relevant insurance requirements and coverage evidence.
- [ ] P6-L05 Establish HSE procedures.
- [ ] P6-L06 Have legal advisers review agreements.
- [ ] P6-L07 Verify partner-carrier evidence.
- [ ] P6-L08 Complete the pre-launch go/no-go review with authorised sign-off.
- [ ] P6-L09 Record failed readiness gates and remediation owners.
- [ ] P6-L10 Block launch until all critical requirements are satisfied.

### Recruitment

**The Dispatch Coordinator and Billing & Collections Officer vacancies remain drafts under this plan. They are not published jobs.** No publication or hiring is authorised by this checklist.

- [ ] P6-R01 Review the Dispatch Coordinator vacancy.
- [ ] P6-R02 Review the Billing & Collections Officer vacancy.
- [ ] P6-R03 Confirm actual hiring requirements.
- [ ] P6-R04 Establish an approved compensation budget.
- [ ] P6-R05 Define job responsibilities.
- [ ] P6-R06 Confirm employer identity and employment terms.
- [ ] P6-R07 Obtain owner approval before publication.
- [ ] P6-R08 Publish through an approved channel and retain publication evidence.
- [ ] P6-R09 Track applications securely.
- [ ] P6-R10 Conduct authorised screening and interviews.
- [ ] P6-R11 Record hiring decisions.
- [ ] P6-R12 Complete onboarding only after appropriate approval.

**Gate:** Independently evidenced identity, compliance and critical operational readiness; approved financial controls; authorised recruitment stages; owner-signed go/no-go decision. Drafting documents is not launching a business.

## Phase 7 — Security, integrations and production readiness

- [ ] P7-01 Review Supabase RLS policies with positive and negative tests.
- [ ] P7-02 Review SECURITY DEFINER functions, grants, scope checks and search paths.
- [ ] P7-03 Enable and verify leaked-password protection where supported; record any plan blocker.
- [ ] P7-04 Review service-role secret storage and rotate any exposed credentials.
- [ ] P7-05 Review authentication and session management.
- [ ] P7-06 Review public endpoints and abuse protection.
- [ ] P7-07 Verify server-side access controls.
- [ ] P7-08 Review file-storage access, signed URLs and tenant boundaries.
- [ ] P7-09 Verify tenant isolation with populated two-tenant fixtures.
- [ ] P7-10 Establish a genuinely separate staging environment before write-based tests.
- [ ] P7-11 Test migrations in staging.
- [ ] P7-12 Test Edge Functions in staging.
- [ ] P7-13 Establish production backup/recovery procedures and rehearse a safe restore.
- [ ] P7-14 Establish deployment rollback procedures and rehearse them in staging.
- [ ] P7-15 Verify integrations individually with scope-limited credentials and approved effects.
- [ ] P7-16 Add integration health monitoring.
- [ ] P7-17 Add error alerts with an accountable responder.
- [ ] P7-18 Add operational audit logs with retention and access controls.

**Gate:** Reviewed security evidence, independently isolated staging, tested backup/restore and rollback, integration health signals and actionable alerts. See [safe staging instructions](../documentation/STAGING_SETUP.md).

## Phase 8 — Final product experience

- [ ] P8-01 Make JD fast and responsive; agree and measure performance budgets.
- [ ] P8-02 Improve streaming responses and interruption/reconnect behaviour.
- [ ] P8-03 Use one consistent Markdown renderer for every assistant response.
- [ ] P8-04 Support headings, tables, lists, safe links and mathematical expressions.
- [ ] P8-05 Render structured task payloads as interactive checklists backed by real task state where appropriate.
- [ ] P8-06 Render workflows as understandable, event-derived visual progress.
- [ ] P8-07 Render approval requests with real, permission-checked approval actions.
- [ ] P8-08 Add evidence panels.
- [ ] P8-09 Add department dashboards backed by verified operational data.
- [ ] P8-10 Add notifications for important operational events.
- [ ] P8-11 Add search across authorised organisational records without cross-tenant leakage.
- [ ] P8-12 Add accessible mobile layouts and test keyboard/screen-reader operation.
- [ ] P8-13 Test long conversations.
- [ ] P8-14 Test multiple concurrent requests.
- [ ] P8-15 Test failures and interrupted sessions.

**Gate:** Measured performance, safe/consistent rendering, accessibility and concurrency/recovery results on representative devices and conversation sizes, with no fabricated operational state.

## Final acceptance scorecard — 0/9 verified

These are release acceptance criteria, not a confidence estimate or feature count. All nine are currently unverified. An independent reviewer and owner must accept the evidence before changing the score.

- [ ] A1 **JD understands the organisation:** retrieves and explains accurate organisational information with sources and appropriate access controls.
- [ ] A2 **JD can execute work:** performs authorised actions through real backend integrations, with persisted effects.
- [ ] A3 **JD can coordinate departments:** assigns and tracks dependent work across teams, including blocks and hand-offs.
- [ ] A4 **JD can demonstrate progress:** shows persisted execution events, not invented status.
- [ ] A5 **JD can verify outcomes:** provides evidence and independent verification, distinguishing internal completion from real-world outcomes.
- [ ] A6 **JD respects authority:** requests human approval for restricted actions and cannot self-approve or bypass policy.
- [ ] A7 **Humans can supervise:** owners and staff have secure, role-appropriate workspaces and actionable oversight.
- [ ] A8 **NaijaHaul can operate:** critical business, compliance and operational launch gates pass with authorised go/no-go sign-off.
- [ ] A9 **Production is reliable:** staging, deployment, security, monitoring and recovery checks pass.

**Reset rule:** Resetting a planning score must never delete execution evidence or alter actual task, approval or launch states.

## Next bounded engineering slice

1. Resolve the staging isolation blocker identified in the baseline report; agree named owners and reviewers.
2. Obtain the failed request's time, endpoint/action and sanitised correlation reference (not credentials), and correlate it with authorised persisted history.
3. Reproduce task updates in isolated staging as manager, assigned employee, unassigned employee and another tenant; preserve failing test evidence.
4. Repair only the demonstrated failure; prove state plus audit persistence, refresh, conflict handling and safe retry.
5. Then implement the JD-first navigation slice against the existing permission and execution architecture.

**One rule for every future implementation:** do not accept a task as complete just because code was written or an assistant reported success. Require tests, persisted records and evidence of the actual result.
