# Workforce Control Centre — Product and Execution Contract

Status: implementation specification for the workforce control-centre programme.
Base: PR #151 merge commit `d3b9ed72c434091f39c0db7b08b618f41b6b3274`.
Release policy: code and isolated verification only. Do not deploy Vercel, apply production migrations, enable release flags, or charge customers as part of this work.

## Implementation status — PR #154 follow-on

The approval-to-activation foundation is implemented in the feature branch; it is not deployed.

- **Phase 1 — approval-to-activation:** implemented as a single tenant-scoped database transaction. Employee/team activation requires an approved Review Centre record, an explicit owner/admin activation command, an exact built-in specialist or current tenant-published and execution-authorized registry agent/version, an idempotent activation receipt and an audit event. JD can inspect the published registry catalogue (up to 500 current agents) and select the relevant specialist; users do not manually choose skills. Direct employee/team creation endpoints and service-role helper grants are blocked. Owner approval alone does not activate anything.
- **Phase 2 — employee instances:** identity records retain role title, purpose, responsibilities and requested-access metadata. Multiple employee instances may reference the same specialist definition. Existing pause/resume/retire and budget controls remain available. Separate private specialist threads and append-only messages are implemented with reasoning-only model replies, no tools or connectors, message idempotency and audit receipts. The private-chat release flag is off by default; assignment-linked employee profiles are still pending.
- **Phase 3 — teams:** approved team activation creates the team, its employee identities and memberships atomically; member roles and responsibilities are retained. Team membership can be managed in the control centre. Bounded assignments can now be attributed to an exact active employee and, optionally, an active team membership. Coordinated batch execution, batch pause/cancel acknowledgement and per-member live worker outcomes remain unimplemented.
- **Phase 4 — economics:** versioned shadow budgets and usage evidence are now connected to employee-bound specialist assignments. The worker records observed execution duration at the owner-configured hourly shadow rate, updates accrued shadow usage, and marks over-budget observations as disputed. Receipts are idempotent and auditable. This is not payroll or payable reconciliation: no invoices, transfers or charges are enabled.
- **Phase 5 — workforce manager:** JD can read the tenant's active workforce roster and bind a bounded specialist assignment to a matching employee identity. If a team is specified, the employee must be an active member of that active team. The executor revalidates tenant, employee lifecycle, specialist reference and membership before starting; assignment history and audit evidence retain employee/team IDs. Execution remains behind the existing workforce release flag and uses only the assignment's approved read-only tool allowlist. Automatic workload balancing, live assignment cancellation and multi-employee orchestration remain unimplemented.

No migration has been applied to production, no Edge Function or Vercel production deployment has occurred, and no execution/billing release flag has been enabled.

## Product model

James-Denning has one primary operating surface: the AI conversation. The Workforce Control Centre is an optional owner/administrator management surface for users who want to inspect or directly manage the workforce. It must never become a required step for ordinary work.

The chat coordinator remains accountable for planning, routing, approvals, execution and reporting. Users may also open a private conversation with an individual specialist from the control centre. That specialist conversation is a separate communication channel and must not mutate, replace, pause or cancel the specialist's current assignment.

## Workforce entities — do not conflate them

- **Specialist definition:** one of the eight real built-in specialist roles or a tenant-published, currently execution-authorised registry definition. A definition is not automatically a hired employee.
- **Employee instance:** a tenant-owned, durable workforce identity created only through an explicit owner-approved activation flow. It references an exact specialist definition/version. No illustrative employees or fabricated catalogue counts.
- **Team:** a durable tenant-owned grouping of employee instances with a named purpose, department, lead/coordinator and membership history.
- **Assignment:** one bounded piece of work. Existing `jd_workforce_assignments` is append-only evidence and must remain immutable.
- **Agent conversation:** a private conversation thread associated with an employee instance. It is not the assignment transcript and cannot alter assignment state.
- **Usage record:** measured usage linked to an actual employee instance and assignment. Existing shadow usage is not a payable invoice.

## Control semantics

Controls must be explicit and separately modelled:

| Control | Employee instance | Current assignment | Team |
|---|---|---|---|
| Pause | Stop accepting new assignments | Request cooperative pause at a safe checkpoint | Stop new team assignments and request safe pauses for members |
| Resume | Return to eligible state | Resume only from a verified checkpoint | Resume eligible members and team routing |
| End / terminate | Retire identity; never assign new work | Does not silently erase or rewrite assignment evidence | Retire team routing; members remain individually inspectable |
| Cancel current work | Not implied | Explicitly cancel one assignment with worker acknowledgement/reconciliation | Explicitly cancel selected or all active team assignments, with per-assignment outcomes |

A stop request is not proof of process termination. The UI must distinguish requested, acknowledged, checkpointed, cancelled, completed, failed and outcome-unknown. A worker lease/fencing token and cancellation generation must prevent stale workers from continuing after a confirmed cancellation. If safe cancellation is not possible, show that honestly and retain the assignment for reconciliation.

Team operations are durable batch commands. The response must include each member/assignment outcome; partial success must never be presented as an all-or-nothing success.

## Billing and usage

- Show platform subscription separately from employee/agent usage.
- Show per-employee and per-team active time, rate, accrued estimate, reserved budget, limits, period and reconciliation state.
- Queued, idle, approval-wait, external-wait and paused time are excluded according to the approved policy.
- Every usage line must link to its source assignment and immutable usage events.
- Display shadow estimates as **not payable**. No invoices, payment collection or automatic charging until the owner-approved commercial policy, verified employee identity binding, reconciliation and release gates are complete.
- Require explicit owner cost confirmation before billable work is activated. Enforce tenant budgets and per-assignment ceilings server-side.

## Chat integration

The main chat remains the primary interface. JD can explain workforce composition, create proposed teams, assign existing eligible specialists, show live progress, ask for approvals, surface costs and return deliverables inline. Chat commands must call the same server-side control contracts as the management surface; no separate weaker permission path.

A user can open an individual specialist conversation from its profile. That thread is scoped to the tenant, user and employee instance. It has its own messages and lifecycle. It may provide status/context and accept a new separately tracked assignment, but it cannot silently take over or edit an in-flight assignment.

## Control-centre experience

The optional workforce surface should follow the supplied fourth screenshot's direction while retaining the existing James-Denning ivory/charcoal editorial design:
- Overview: real counts and statuses only.
- Discover: searchable actual specialist definitions and eligible employee instances; distinguish available, assigned, paused, retired, draft, published and execution-authorised.
- Employee profile: role/version, department, skills, tools/permissions, active assignment, private chat, usage/billing and history.
- Teams: membership, lead, shared workload, budgets, team conversation/coordination and batch controls.
- Assignments: queue, progress, safe pause/cancel, evidence, verification and recovery.
- Billing: employee/team breakdown, shadow-vs-payable state, budgets, rate controls and source-linked usage history.
- Diagnostics/audit: immutable control events, approvals, worker acknowledgements and reconciliation.

## Required backend boundaries

1. Tenant-scoped employee, team, membership, agent-thread and control-command records with RLS and service-only write paths.
2. Owner/admin-authorised, idempotent RPC/Edge Function commands; actor and tenant derived from verified auth, never caller-supplied IDs.
3. Append-only workforce control events; never mutate existing assignment evidence.
4. Safe worker pause/cancel integration using checkpoints, leases, fencing and durable command acknowledgements.
5. Team batch operations with bounded concurrency, per-member receipts and retry-safe idempotency.
6. Private specialist conversations with independent message storage, user/tenant scoping and no implicit access to unrelated assignments.
7. Usage ledger binding to verified employee identity and assignment IDs, budget reservations and reconciled measurements.
8. Server-side enforcement for role, state transition, spend ceilings, concurrency, assignment limits and retention.

## Delivery sequence

1. **Inventory and contracts:** map current queue, cancellation/checkpoint, agent registry, shadow usage and chat persistence. Identify reusable paths and gaps before schema changes.
2. **Employee/team identity:** migration + rollback, owner RPCs, audit events, RLS/grants, idempotency and tenant/role tests. Do not seed fictitious employees.
3. **Lifecycle control:** pause/resume/retire/cancel command pipeline integrated with the real worker; race, lease-expiry, crash and unknown-outcome tests.
4. **Private specialist chat:** durable independent threads, message authorization and tests proving the active assignment is unaffected.
5. **Billing controls:** employee/team usage attribution, budgets and read-back. Keep shadow-only until commercial acceptance.
6. **Control-centre UI:** responsive overview, profiles, teams, assignments, billing and audit, all backed by verified APIs.
7. **Chat orchestration:** expose the same operations to JD's coordinator with confirmations for consequential controls and inline progress/results.
8. **Full acceptance:** real end-to-end tests from chat and control centre, multi-tenant and role tests, cancellation races, team partial failures, billing reconciliation, mobile/desktop UI, accessibility, and rollback rehearsal.

## Acceptance criteria

- The eight built-in roles appear as definitions, not eight fictional hired people.
- Every employee/team/assignment count is read from tenant-scoped persisted records.
- Opening or messaging an agent never interrupts its active assignment.
- Pausing/ending an employee does not rewrite or delete assignment history.
- Cancelling work is acknowledged by the worker or shown as unresolved; no false “stopped” success.
- Team stop reports every member's actual state and partial failures.
- A later conversation can retrieve the same assignment, employee, team and usage evidence.
- Every displayed amount traces to source usage events and an approved rate; shadow estimates are never labelled payable.
- Chat and management UI use the same authorization and state-transition rules.
- No Vercel deployment, production migration, release-flag activation or customer charge occurs before explicit owner approval.
