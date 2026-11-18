# JD Autonomous AI Workforce & Agent Economy

**Status:** Product and engineering specification  
**Product:** James-Denning (JD)  
**Target:** Autonomous business operating platform

## 1. Product vision

JD is the central intelligence, planner and accountable execution layer of James-Denning. It should do more than answer questions or recommend tools. It should understand a customer's desired outcome, break work into verifiable tasks, select specialist agents, connect authorised tools, coordinate execution, review evidence and report what was actually completed.

A customer should be able to say:

> I want to start a B2B SaaS company. I have no product idea yet, and I want to build a serious business.

JD should assess the ambition honestly, identify missing information and constraints, research viable opportunities, propose a plan, recommend a specialist workforce and explain expected costs. With customer approval, it should coordinate research, product definition, software development, testing, customer discovery, sales preparation and operational setup.

JD must never guarantee revenue targets or imply that a difficult commercial outcome is assured. It should convert ambition into measurable hypotheses, milestones, experiments and evidence.

**Product principle: Don't merely tell customers what they could do. Assemble the capability, execute permitted work, verify the result, show the evidence and explain the cost.**

## 2. Core operating model

The platform has four distinct layers:

1. **JD Orchestrator:** Understands the goal, plans work, selects agents, coordinates dependencies, handles approvals and consolidates results.
2. **AI Workforce:** Specialist agents with explicit responsibilities, capabilities, instructions, limitations, tools, permissions, evaluations and pricing.
3. **MCP and Integration Layer:** Connects customer-authorised external services and exposes only tools permitted for a particular task and agent.
4. **Evidence, Governance and Billing Layer:** Records execution, verifies deliverables, enforces budgets and approvals, and accounts for actual usage.

JD remains accountable for the overall workflow. Specialist agents do not become independent authorities over the customer's organisation.

## 3. Workforce catalogue and agent identity

Build toward a catalogue of 400+ genuinely distinct specialist definitions across business and technical functions. Do not inflate the count with duplicate names or cosmetic variations. A catalogue entry is not automatically a tested, available, hireable or production-ready employee.

Every agent must have a durable profile containing:

- Stable agent ID and display name.
- Unique avatar/profile image reference.
- Category, role and concise description.
- Responsibilities and supported tasks.
- Required inputs and expected deliverables.
- Explicit capabilities and capability identifiers.
- Limitations, known failure modes and escalation conditions.
- System prompt and version history.
- Approved model/provider routing and fallback policy.
- Permitted MCP tools and tool scopes.
- Risk classification and permission requirements.
- Pricing configuration and billable-time policy.
- Availability and lifecycle state.
- Evaluation suite, results, evaluation date and quality indicators.
- Performance history, task outcomes and customer feedback.

Suggested categories include executive support, business strategy, market research, product management, software engineering, frontend/backend development, QA, security, DevOps, design, finance operations, sales, lead research, marketing, SEO, customer support, HR administration, procurement, logistics, data analysis and industry-specific specialists.

Agents should be visually identifiable in the product. Use original or properly licensed avatars; do not use generated identities to imply real human employees.

## 4. Agent lifecycle and availability

Support explicit states:

- **Draft:** Definition is being prepared.
- **Testing:** Evaluation is in progress.
- **Available:** Passed required checks and can be recommended.
- **Recommended:** JD suggested the agent; no hire or assignment has occurred.
- **Awaiting approval:** Customer authorisation is required.
- **Hired:** Customer authorised the agent for the organisation.
- **Assigned:** Linked to a specific task, project or workflow.
- **Running:** Executing authorised work.
- **Paused:** Not accepting new work.
- **Blocked:** Waiting for input, access, dependency or approval.
- **Degraded:** Available with a known operational issue.
- **Failed:** Execution or validation failed.
- **Retired:** Cannot receive new assignments.

Availability must come from actual runtime and health state, not a hard-coded status. If an agent is unavailable, JD should search for a suitable alternative. If no suitable agent exists, JD may propose creating a new specialist.

## 5. Intelligent workforce recommendation

JD should recommend agents based on the customer's goal, business model, industry, geography, stage, constraints, active projects, workload, dependencies, required deliverables, connected integrations, actual tool availability and budget.

Each recommendation should explain why the agent is relevant, what it is expected to deliver, which tools it needs, what permissions it requires, the pricing basis and the estimated cost assumptions.

Customers must be able to hire one agent, select several, accept a proposed team, ask JD to revise it, decline recommendations, and set a task or project budget.

A recommendation is not a hire. A hire is not an assignment. An assignment is not proof that work ran or completed.

Avoid redundant agents where an existing specialist can safely perform the task. Do not recommend a large team merely to increase usage.

## 6. On-demand Agent Factory

When JD cannot find a suitable available specialist, it should propose a new one rather than immediately abandoning the task.

The Agent Factory creates a **versioned agent definition**, not a new foundation model or an unrestricted executable program.

A generated specialist definition must include:

1. Name, purpose and category.
2. Responsibility and scope boundaries.
3. System prompt and operating instructions.
4. Capability identifiers.
5. Required input and output schemas.
6. Permitted tools and narrowly scoped permissions.
7. Risk classification and approval requirements.
8. Evaluation cases and expected behaviours.
9. Model routing and execution limits.
10. Pricing metadata and budget policy.
11. Avatar reference and profile metadata.
12. Version, provenance and creator information.

### Factory workflow

1. Search the registry for an existing equivalent.
2. Explain why existing agents are insufficient.
3. Draft the new specialist definition.
4. Validate schemas, capabilities, tool references and permission boundaries.
5. Run static and adversarial checks, including prompt-injection and tenant-isolation cases.
6. Run bounded evaluation tasks in a sandbox with mock or explicitly authorised tools.
7. Record immutable evaluation evidence against the exact definition version/hash.
8. Require review/approval according to risk and publication policy.
9. Publish only if all required checks pass.
10. Make the agent available for recommendation; do not automatically hire it or start billable work.

A generated prompt must never grant itself tools or permissions. Tool access is determined by server-side policy and authorised connection records, not by text in the generated prompt. Generated agents must not create further agents without explicit orchestration limits and policy approval. Prevent recursive spawning, circular delegation, runaway retries and uncontrolled resource use.

If validation fails, JD must report that the specialist could not be safely created. It must not present a draft as a working employee.

## 7. Agent teams and multi-agent orchestration

JD should assemble temporary or persistent teams for projects and ongoing business operations.

Example B2B SaaS team:
- Business Strategist: opportunity framing and business model.
- Market Researcher: customer, competitor and market evidence.
- Product Manager: requirements, scope and roadmap.
- Software Architect: architecture and technical decisions.
- Software Engineers: implementation.
- QA Engineer: tests and acceptance evidence.
- Security Analyst: security review.
- Sales Researcher: prospect research and qualification.
- Sales Agent: outreach preparation and approved follow-up.
- Financial Analyst: assumptions, costs and scenario modelling.

The composition must be dynamic. Use only agents required for the actual task.

Orchestration requirements:
- Break objectives into bounded, assignable tasks.
- Track task owners, dependencies, deadlines and status.
- Give each agent only the context needed for its assignment.
- Share project artefacts through scoped, auditable records.
- Preserve provenance for agent outputs and tool results.
- Allow agents to return findings, files, structured results and blockers.
- Validate outputs before downstream agents rely on them.
- Detect conflicting conclusions and request review.
- Support retries with idempotency and bounded retry policies.
- Prevent circular delegation and runaway task creation.
- Enforce per-agent, per-task, per-team and organisation budgets.
- Support cancellation and propagate cancellation to child tasks.
- Escalate ambiguous, risky or consequential decisions to JD and the customer.
- Produce one consolidated response distinguishing verified deliverables from recommendations and unfinished work.

Agents may call other agents only through the orchestrator's delegation interface. They must not bypass the registry, permission service, budget service or audit trail.

## 8. MCP and connector ecosystem

MCP should be a first-class integration mechanism in JD. JD must distinguish clearly between:
- A connector listed in the catalogue.
- An MCP server configured by the customer.
- A connection successfully authorised by the customer.
- Tools actually discovered from that server.
- Tools verified and permitted for a specific agent/task.
- A tool invocation that succeeded.
- A real-world outcome that has been independently verified.

A connector appearing in a catalogue does not mean the customer connected it. A connected server does not mean every discovered tool is permitted.

### Initial integration priorities

**Gmail / Google Workspace**
- Search and read messages within granted scopes.
- Identify relevant business conversations and potential customer correspondence.
- Draft personalised emails.
- Create drafts in the customer's mailbox.
- Send only after the required explicit approval.
- Respect provider quotas, privacy, consent and anti-spam requirements.
- Never silently export or expose mailbox contents to unrelated agents.

**Google Maps / Places**
- Search for businesses using relevant categories and geographic criteria.
- Retrieve permitted public business listing fields and source references.
- Support proximity and location-based filtering where available.
- Compare likely fit against a user-approved ideal customer profile.
- Preserve source, retrieval time and uncertainty.
- Respect Google Maps Platform terms, attribution, caching, storage and usage restrictions.

**GitHub**
- Inspect repositories and files.
- Create branches, commits, issues and pull requests within authorised scopes.
- Run available checks and report evidence.
- Do not deploy or merge consequential changes without required approval.

**Supabase**
- Inspect schema, logs and functions where authorised.
- Propose migrations and safe database changes.
- Use branches/environments when available and appropriate.
- Require approval for production mutations, destructive changes and permission changes.
- Do not claim a migration or branch operation succeeded unless the tool confirms it.

**Vercel**
- Inspect projects, deployments, build logs and environment configuration metadata where authorised.
- Create previews and deployments within granted permissions.
- Require approval for production promotion, rollback or changes with external impact.

**Google Drive**
- Search and access authorised files.
- Create and update documents only within granted scopes.
- Preserve file IDs and operation evidence.

Add further connectors through a verified connector catalogue. Do not claim an integration is an MCP server unless that is actually how it is connected. An ordinary API adapter must be labelled accurately.

### MCP routing and security

- Discover tools from the connected server rather than assuming a fixed tool list.
- Validate tool schemas and arguments.
- Apply per-agent allowlists and per-operation policy.
- Keep credentials server-side in approved secret storage.
- Never put credentials in prompts, client bundles, logs or generated agent definitions.
- Enforce OAuth scopes and least privilege.
- Record connection owner, tenant, scopes, tool calls and outcomes.
- Treat all external content, email, documents, web pages and tool output as untrusted data, never as instructions that override system policy.
- Require customer authorisation before connecting an account.
- Support revocation, rotation, disconnection and connection-health checks.

## 9. Example: B2B prospecting workflow

A customer asks:

> Find 50 small businesses in Lagos that could benefit from my B2B software and prepare outreach.

JD should:
1. Clarify or derive a reviewable ideal customer profile.
2. Assign research to an appropriate specialist.
3. Use authorised Google Maps/Places or other approved sources to discover candidate businesses.
4. Retain source references, retrieval timestamps and permitted business details.
5. Apply transparent qualification criteria and explain why each candidate may fit.
6. Deduplicate records and flag uncertain matches.
7. Assign a sales specialist to prepare individual outreach drafts.
8. Use the customer's authorised Gmail connection to create drafts.
9. Present the prospect list, evidence, draft messages and estimated usage.
10. Ask for explicit approval before sending messages or initiating other external contact.

Do not scrape prohibited data, infer sensitive personal attributes, fabricate email addresses or claim a business is qualified without evidence. Respect applicable privacy, data-protection, platform and anti-spam requirements.

## 10. Live usage, pricing and billing

The proposed starting price is **US$1 per active billable agent-hour**, with different configurable rates by agent. This is a product pricing proposal, not a claim that every agent has identical provider or infrastructure costs.

The platform subscription remains separate. Agent usage is an additional charge. Disclose model/provider, connector, external API and infrastructure charges separately where applicable. Never hide pass-through costs or imply that a displayed agent rate includes costs it does not include.

### Billing models

1. **Individual agent:** Customer hires and pays for a particular specialist.
2. **Managed workforce:** Customer authorises JD to assemble a team within a stated budget and pricing policy.
3. **Task/project quote:** JD presents a defined deliverable, estimated usage and maximum authorised spend; reconcile actual usage transparently against the quote.

### Metering policy

- Meter actual active execution using trusted server-side timestamps and durable execution events.
- Define minimum increments and rounding transparently.
- Do not charge for queued, idle, approval-wait or paused time under the standard active-time policy.
- Define retry, cancellation, failed-task and partial-delivery treatment before charging.
- Separate agent execution time from model tokens, external API calls, storage and other provider costs.
- Use idempotent usage events and immutable ledger entries to prevent duplicate charges.
- Reconcile estimates against actual usage.
- Do not start billable work without customer authorisation and sufficient budget.
- Never let an agent set, edit or erase its own rate or ledger entries.

### Live workforce usage interface

During execution, show every active agent and avatar, current task and status, start time and measured active duration, configured rate, accumulated agent cost, external/provider costs where measurable, total session spend, approved budget, remaining budget, and paused/blocked/failed/completed agents.

Provide controls to pause/cancel an agent or the whole workflow.

All values must come from real runtime and billing records. Never fabricate live status, timers, usage, costs or availability for visual effect. Clearly label estimates versus posted charges.

### Budget controls

- Per-agent, per-task, per-team and organisation spending caps.
- Customer-configurable alerts and approval thresholds.
- Automatic pause when the authorised limit is reached.
- No silent budget increases.
- Clear estimate before work begins.
- Durable usage ledger and downloadable itemisation.
- Dispute and adjustment workflow with audit history.

## 11. JD response and user experience

JD should explain its plan before launching a complex workforce.

A suitable interaction:
1. Acknowledge the requested outcome and state material difficulty or uncertainty honestly.
2. Ask only for missing information that materially changes the plan.
3. Present a concise execution strategy.
4. Recommend the smallest effective team, showing each specialist's purpose.
5. Show required integrations and whether each is connected, missing or awaiting authorisation.
6. Show estimated costs, assumptions, budget ceiling and expected deliverables.
7. Let the customer select agents or approve JD's proposed team.
8. Start only the approved work.
9. Show live activity and itemised usage.
10. Deliver a consolidated result with evidence, blockers, costs and next steps.

The customer must be able to pay for an individual specialist or approve a complete team. A recommendation is not a charge; approval is required before billable execution.

Each agent card/profile should display a unique avatar, name, specialisation, description, capabilities, deliverables, limitations, required tools and permissions, runtime-based availability, evaluation status/date, pricing and billable-time policy, evidence-backed performance indicators, and a hire/assign action with approval and cost preview.

## 12. Evidence and truthful execution

JD must distinguish these states in UI, API responses and reports:
- Proposed plan.
- Draft agent definition.
- Agent passed static validation.
- Agent passed sandbox evaluation.
- Agent approved/published.
- Agent recommended.
- Agent hired.
- Task assigned.
- Tool call attempted.
- Tool call succeeded or failed.
- External change saved.
- Deliverable independently verified.
- Real-world activity completed.

A successful tool call is not necessarily proof of the requested business outcome. Creating an email draft does not mean an email was sent; sending an email does not prove it was received or acted upon. Creating a deployment does not prove the application works correctly in production.

Every meaningful task should retain the request and approved scope, agent definition version/hash, assigned task and dependencies, tool calls and result references, start/end/pause/cancel events, output artefacts, validation and evaluation evidence, approvals and actor identities, usage events and ledger references, final status and unresolved blockers.

## 13. Security, privacy and governance

Required controls:
- Authentication and organisation/tenant isolation.
- Row Level Security and server-side authorisation.
- Least-privilege tool access.
- Encrypted server-side credential storage.
- Explicit connector authorisation and revocation.
- Per-agent and per-task tool allowlists.
- Input validation and output schema validation.
- Prompt-injection defences for external content.
- Human approval for consequential actions.
- Spending caps and execution limits.
- Immutable or tamper-evident audit records.
- Secret and personal-data redaction in logs.
- Sandbox evaluation for newly generated agents.
- Version pinning and rollback.
- Incident suspension and agent retirement.
- Retention and deletion policies for customer data.
- Safe cancellation and recovery.
- No cross-tenant context or credential leakage.

An agent's prompt is not a security boundary. Enforce all permissions in trusted server-side services.

## 14. Suggested service boundaries

Inspect the repository's actual architecture before implementing or creating new modules. Reuse existing systems where they already provide the required capability. These are conceptual responsibilities, not instructions to create duplicate services blindly.

| Service | Responsibility |
|---|---|
| JD Orchestrator | Goal decomposition, planning and coordination |
| Agent Registry | Agent definitions, profiles, versions and lifecycle |
| Agent Factory | Drafting, validating and evaluating new specialists |
| Agent Runtime | Bounded execution, cancellation and checkpoints |
| MCP Router | Connection discovery, tool routing and policy enforcement |
| Workforce Scheduler | Assignment, concurrency, queues and dependencies |
| Agent Evaluator | Quality, safety and release gates |
| Usage Meter | Trusted runtime metering |
| Billing Ledger | Idempotent charges, reconciliation and adjustments |
| Budget Manager | Spend caps, approvals, alerts and pause controls |
| Evidence Store | Provenance, artefacts and execution records |
| Workforce UI | Profiles, recommendations, team view and live usage |

Potential data entities, to reconcile with existing schema before adding migrations:
- agents
- agent_versions
- agent_capabilities
- agent_tool_permissions
- agent_evaluations
- agent_teams
- agent_team_members
- agent_sessions
- agent_tasks
- agent_task_dependencies
- agent_events
- agent_usage_events
- agent_rates
- agent_budgets
- agent_ledger
- mcp_connections
- mcp_discovered_tools
- mcp_permission_grants
- agent_evidence

Do not create duplicate tables or parallel registries if the repository already has equivalents. Inspect current schema, migrations, policies, runtime, registry, business foundation, execution ledger, approvals and MCP implementation first.

## 15. Implementation phases

Deliver incrementally. Each phase must be independently testable and preserve existing working product behaviour.

### Phase 0 — Repository and capability audit
- Inspect existing agent registry, workforce catalogue, runtime, SaaS Agent Studio, MCP server, discovered tools, approval system, usage ledger and billing policy.
- Map existing capabilities to this specification.
- Identify implemented, partial, missing and blocked capabilities.
- Produce a gap matrix with exact file/schema references.
- Do not duplicate existing systems or claim planned capabilities are already live.

### Phase 1 — Reliable workforce foundation
- Complete agent identity/profile and version model.
- Establish lifecycle and availability from real runtime state.
- Connect recommendations to actual capabilities and permission metadata.
- Add robust task assignment and status reporting.
- Validate tenant isolation and role enforcement.

### Phase 2 — Orchestration and evidence
- Implement bounded multi-agent planning and delegation.
- Track dependencies, checkpoints, cancellation and retries.
- Add evidence-backed result aggregation.
- Test failures, timeouts, conflicting results and blocked tasks.

### Phase 3 — Usage and customer controls
- Implement trusted active-time metering and immutable usage events.
- Add rates, estimates, budgets, caps, alerts and reconciliation.
- Add individual-agent and managed-workforce approval flows.
- Verify idle/queued/approval-wait time is not billed under standard policy.
- Test duplicate events, cancellation, partial failures and budget exhaustion.

### Phase 4 — MCP capability routing
- Reconcile existing connectors and connected MCP servers.
- Add/verify Gmail, Google Maps/Places, GitHub, Supabase, Vercel and Drive according to actual supported integrations.
- Discover tools dynamically and enforce scoped permissions.
- Add connector health, audit and revocation.
- Test with mock accounts and sandbox resources before real customer actions.

### Phase 5 — On-demand Agent Factory
- Generate versioned definitions.
- Validate schemas, tool references and permissions.
- Run sandbox and adversarial evaluations.
- Require risk-based review and publication gates.
- Prove invalid or unsafe agents cannot become available.

### Phase 6 — Workforce experience
- Agent catalogue and profile pages.
- Recommendation and hiring flows.
- Team composition and task views.
- Live agent activity and truthful usage meters.
- Individual agent and team billing views.
- Pause, cancel and budget controls.

### Phase 7 — Marketplace and scale
- Third-party agent publishing and review.
- Performance and quality rankings based on evidence.
- Version governance, incident suspension and retirement.
- Scale the catalogue toward 400+ genuinely distinct, evaluated specialists.
- Load-test orchestration, usage accounting and tenant boundaries.

## 16. Required verification and acceptance criteria

The feature is not complete because a UI, prompt or database table exists. Demonstrate end-to-end behaviour.

### Workforce
1. JD can find an existing specialist by capability and explain its match.
2. Recommendations do not automatically hire agents or start billable work.
3. Profiles show real capability, permissions, limitations, pricing and evaluation status.
4. Availability reflects actual runtime health.
5. Agents can be individually assigned, paused, resumed and retired under policy.

### Factory
6. JD detects an existing equivalent before proposing a new specialist.
7. A new agent definition is versioned and schema-validated.
8. Generated definitions cannot grant themselves tools or permissions.
9. Sandbox tests cover task quality, tool security, tenant isolation, budgets and cancellation.
10. Failed validation prevents publication.
11. Published status is tied to the exact evaluated version/hash.

### Orchestration
12. JD decomposes a request into bounded tasks and selects appropriate agents.
13. Agents receive only scoped context and permitted tools.
14. Dependencies, failures, retries, cancellation and escalation work.
15. Consolidated results distinguish evidence, assumptions, recommendations and incomplete work.
16. Runaway delegation and resource use are prevented.

### MCP
17. Catalogue, connected server, discovered tool and permitted tool are distinct states.
18. Agents cannot use unapproved tools or scopes.
19. Gmail can search and draft only within authorised scopes; sending requires approval.
20. Maps/Places results preserve provenance and follow platform restrictions.
21. GitHub, Supabase, Vercel and Drive operations are verified against actual connector capabilities.
22. Tool failures and revoked connections are reported honestly.

### Billing
23. Live usage is sourced from trusted server-side events.
24. Per-agent and team costs reconcile to an auditable ledger.
25. Idle, queued and approval-wait time are excluded under the standard policy.
26. Budgets stop execution before unauthorised overspend.
27. Duplicate events do not create duplicate charges.
28. External provider costs are separately disclosed where applicable.
29. No charge occurs without customer-authorised work.

### Governance and delivery
30. Tenant isolation, RLS and role enforcement pass automated tests.
31. Consequential actions are approval-gated.
32. Secrets never appear in prompts, browser bundles, logs or repository files.
33. UI status labels match backend evidence.
34. Tests, migrations, deployment and production verification are reported separately.
35. Final reporting identifies exactly what shipped, what passed, what failed and what remains.

## 17. Instructions to the implementing agent

When asked to implement this specification:
1. Read this prompt and current product authority documents.
2. Inspect the current master branch and working tree before editing.
3. Audit existing code, migrations, policies, tests and deployment configuration.
4. Produce a concise implementation plan and identify risks.
5. Implement the smallest complete vertical slice rather than a superficial all-at-once scaffold.
6. Preserve existing architecture and reuse existing services.
7. Add migrations with safe rollback plans where needed.
8. Add automated tests for success, failure, permissions, tenant isolation, budgets and cancellation.
9. Run relevant test, lint, typecheck and build commands.
10. Inspect the final diff for regressions, secrets and unrelated changes.
11. Do not bypass approvals, weaken security or mutate production data without explicit authorisation.
12. Do not claim tests, deployments, integrations, agents or billing are live unless verified.
13. Report commit/PR links, files changed, test outcomes, evidence, blockers and remaining work.

**Definition of done:** A customer can request a meaningful business outcome; JD can propose and assemble a suitable workforce; authorised agents can use scoped integrations to execute bounded work; customers can observe real progress and cost; and JD can deliver verified evidence while preserving customer control.

---

**JAMES-DENNING — RUN. MONITOR. BUILD. GROW.**
