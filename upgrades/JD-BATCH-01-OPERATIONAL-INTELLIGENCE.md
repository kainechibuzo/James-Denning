# JD Batch 01 — Operational Intelligence & Organisation Builder

**Status:** foundation implemented; integration and deployment verification pending  
**Batch size:** 20 upgrade tracks  
**Branch:** `feature/jd-batch-01-operational-intelligence`

## Scope and honest status

This batch establishes the backend contracts and tenant-scoped data foundation for the 20 tracks. It does **not** claim every end-user workflow is complete. The execution dispatcher/worker and monitor reuse the earlier JD-004 work and still require end-to-end scheduler, lease-recovery and UI verification. Capability intelligence deliberately reports `unverified` until trusted deployment and smoke-test evidence exists.

| # | Track | Delivered in this branch | Remaining before complete |
|---:|---|---|---|
| 01 | Execution Dispatcher | Existing durable worker path inventoried | Scheduler/dispatcher trigger and queue end-to-end test |
| 02 | Lease Recovery | Existing lease/checkpoint foundation inventoried | Expiry recovery integration and failure-injection |
| 03 | Idempotent Tool Execution | Stable idempotency key helper; task uniqueness constraint | Apply to every write-capable tool |
| 04 | Live Execution Monitor | Existing run monitor retained as dependency | Verify live updates and all states in UI |
| 05 | Execution Controls | Task state machine contract | Job cancellation/retry controls and worker integration |
| 06 | Organisation Scanner | Capability inventory contract | Trusted schema/code/deployment evidence collectors |
| 07 | Capability Intelligence | Evidence-based status classifier and 20-key registry | Populate evidence from deployment pipeline and smoke tests |
| 08 | Business Blueprint Generator | Validated blueprint contract and preview action | Model-driven generation and UI |
| 09 | Division & Department Builder | Bounded department/role/workflow/KPI structure | Approved persistence UI and org chart |
| 10 | Organisation Provisioning | Draft persistence RPC with server-side admin/tenant check | Review Centre approval and idempotent provisioner |
| 11 | People Intelligence | Capability slot registered | Implemented, permission-tested people tools |
| 12 | Operations Intelligence | Tenant-scoped task table, create action and state machine | Assignment, scheduling, audit and task UI |
| 13 | Performance Intelligence | Capability slot registered | Read tools, KPI calculations and evidence |
| 14 | Finance Intelligence | Capability slot registered | Read-only financial aggregation and permission tests |
| 15 | Communications Intelligence | Capability slot registered | Draft/approval/send integration and delivery logs |
| 16 | Workforce Planner | Capability slot registered | Demand analysis and approved staffing plans |
| 17 | Vacancy Generator | Validated vacancy draft action and requisition table | Templates, approval and vacancy UI |
| 18 | Recruitment Pipeline | Candidate table and guarded stage-transition action | Candidate intake, list UI, audit and integration tests |
| 19 | Recruitment Assistant | Stage model and vacancy data contracts | Scheduling, summaries and communication drafts |
| 20 | Hiring Campaign Manager | Capability slot registered | Campaign planner, approval and publishing integrations |

## Data and security

Migration `20261111180000_jd_batch01_organisation_operations_hiring.sql` creates:
- `jd_organisation_blueprints`
- `jd_operational_tasks`
- `jd_hiring_requisitions`
- `jd_hiring_candidates`

All tables are tenant-keyed by `school_id`, enable RLS, and revoke direct browser access. The organisation blueprint RPC derives the tenant from the authenticated actor's admin profile. Vacancy creation and candidate stage transitions are admin-only in the Edge Function and include tenant filters. Operational task creation accepts admin/manager roles and uses a unique tenant-scoped idempotency key.

No organisation is provisioned automatically. Blueprint submission creates a draft only. Vacancy creation creates a draft only. Candidate stage transitions are guarded by an explicit state machine. This batch does not send external communications, publish vacancies, make hiring decisions, or perform financial writes.

## Edge Function actions

- `capabilities.report` — admin-only; reports unknown/unverified status until deployment evidence is available.
- `organisation.blueprint.preview` — admin-only; validates a proposed blueprint without writes.
- `organisation.blueprint.submit` — admin-only; stores a draft via service-role RPC.
- `operations.task.create` — admin/manager; creates an idempotent tenant-scoped task.
- `operations.task.transition` — admin/manager; applies guarded task state transitions with optimistic concurrency checks.
- `hiring.vacancy.draft` — admin-only; creates a draft requisition, not a published vacancy.
- `hiring.candidate.transition` — admin-only; enforces allowed pipeline transitions and tenant scope.
- Existing `settings.proposal.submit/execute` actions remain available.

## Required verification before production

1. Run CI, production web build and Deno checks.
2. Apply the migration to an isolated staging database first; do not apply directly to production.
3. Test cross-tenant reads/writes, non-admin calls, duplicate idempotency keys and candidate transition races.
4. Test organisation blueprint hash and draft persistence.
5. Test task creation retries and task terminal-state transitions.
6. Test hiring draft visibility, candidate stage transitions and concurrent updates.
7. Add UI for blueprint review, operations monitor and hiring pipeline.
8. Verify Edge Function deployment and authenticated smoke tests before marking any capability deployed.

## Acceptance rule

A track is complete only when implementation, tests, tenant/role checks, deployment evidence and relevant authenticated smoke tests are recorded. A registry entry or schema alone is not completion.


## Operational interface and integration completion pass

A dedicated Business Operations workspace is now wired into the application navigation for admins and managers. It provides:
- Overview cards and recent task/blueprint activity.
- Organisation blueprint editor, validation and saved draft list.
- Operational task creation, queue, status transitions and tenant-verified team assignment.
- Vacancy draft creation, explicit internal approval/opening, candidate registration and valid recruitment-stage controls.
- Capability evidence view that does not label capabilities deployed without evidence.

New tenant-scoped Edge Function read actions: `organisation.blueprints.list`, `operations.task.list`, `operations.team.list`, and `hiring.pipeline.list`. New write actions: `operations.task.assign`, `hiring.vacancy.approve`, and `hiring.candidate.create`. Candidate intake is allowed only for an internally opened requisition; opening a vacancy does not publish externally or send messages.

JD's agent now has read-only people, performance and operations intelligence tools. Performance summaries use the active session/term and aggregate scores only; no individual learner results are returned. Existing billing, attendance, announcement, email-delivery and hiring read tools remain available.

Tests cover score aggregation, task aggregation and existing workflow state machines. CI type-checks the secured Edge Functions and builds the web app.

### Still not complete
- The durable execution dispatcher/scheduler and expired-lease recovery need end-to-end live verification.
- Blueprint provisioning still needs a Review Centre approval action and idempotent provisioner; saving a blueprint is not provisioning departments or accounts.
- External hiring publication, email sending, campaign scheduling and social publishing are intentionally not activated by this pass.
- Finance is currently read-only aggregate intelligence; no payments, refunds or ledger writes are automated.
- Performance intelligence is aggregate-only; KPI dashboards and trend history still need UI work.
- Production migration and Edge Function deployment have not been performed.


## Durable execution, monitoring and recovery integration

Routine JD chat requests now create a durable execution job through `jd_enqueue_execution_job` and return immediately with a queued state. The background worker owns model execution, step persistence, checkpoints, lease heartbeats, retry scheduling and terminal state updates. High-impact requests remain paused in Review Centre and are not automatically enqueued.

Added:
- Business Operations execution monitor showing run state, attempts, recent tool steps and safe error summaries.
- Admin cancellation for queued/retry-wait jobs only. Running jobs are deliberately not force-cancelled because a worker may hold a valid lease.
- Admin retry of failed jobs through `jd_requeue_failed_execution_job`, which resets the failed job, emits a fresh queue message, resets the parent run and records an audit event.
- Scheduled GitHub Actions worker poller at `.github/workflows/jd-worker-dispatch.yml`, polling every five minutes and processing one potentially long-running job per invocation.

**Required GitHub repository secrets for the scheduled poller:** `SUPABASE_URL` and `JD_WORKER_SECRET`. The latter must exactly match the Supabase Edge Function secret `JD_WORKER_SECRET`. The worker function must be deployed, and the JD-004A/004B/004C migrations plus this batch's migrations must be applied in staging before live operation.

This source change does not itself deploy functions or apply database migrations. Until those release steps are performed, the queue and monitor cannot be considered live.
