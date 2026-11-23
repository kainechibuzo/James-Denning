# JD Agent Execution Engine (workforce deployment)

## What this release adds

JD can now move beyond recommending AI employees and bounded analysis: it can
**deploy specialist agents to execute assigned work**, propose new specialists
when the workforce lacks a capability, and the workspace can grant and revoke
per-agent **execution authority** through an independent review.

The engine is integrated into the existing architecture — it reuses
`jd-agent-runtime` (tool registry, usage, checkpoints), `jd-execution-worker`
(durable jobs, step journal, cancellation) and the versioned Agent Registry
(definitions, evaluation evidence, publication review). No second agent system
was introduced.

| Capability | State after this release |
|---|---|
| Eight built-in specialist roles (single analysis) | Existing — now silent-streaming |
| Workforce deployment on separate bounded assignments | Implemented (`deploy_specialist_workforce`) |
| Narrowly scoped read-only tool grants per specialist | Implemented (frozen allowlist + runtime recheck) |
| Tenant-published definitions performing assigned work | Implemented after explicit execution authority |
| Agent hiring / lifecycle management | Implemented (`jd_agent_execution` RPC lifecycle) |
| Agent Factory proposals | Implemented (`propose_agent_definition`) |
| Workforce monitoring | Implemented (automation-runs workforce cards, audit event) |
| Verified operational evaluations | Unchanged — still requires a separately reviewed evaluator |

## Deployment flow

1. JD analyses a request and, when several specialists genuinely help, calls
   `deploy_specialist_workforce` with one objective and 1–5 assignments
   (`supabase/functions/_shared/jd-agent-workforce.ts` validates every bound).
2. Available specialists are the eight built-in roles plus tenant-published
   registry definitions whose owners granted execution authority. A published
   or drafted definition without authority is **not** deployable.
3. Each specialist runs through `runAgentAssignment`: its own instructions,
   assignment brief, untrusted context and at most a few **read-only** tools.
   Specialists never receive delegation/proposal tools, so they cannot spawn
   agents or grant themselves permissions.
4. Every deliverable returns marked `verification.required = true`. JD must
   independently verify each deliverable against saved records or registered
   tools before reporting completion; a specialist report is never proof that
   an external action occurred.
5. The deployment writes a bounded `workforce.deployed` audit event (agent
   references, statuses, tool grants — never assignment text or report content)
   and appears as a step in Automation runs with per-agent workforce cards.

## Governance boundaries

- **Tool grants:** a specialist may only receive tools from
  `WORKFORCE_GRANTABLE_TOOLS` (frozen, all classified read/preview-only),
  intersected with its role allowlist and with the deploying user's role-allowed
  tools. Requested-but-denied tools are reported in the result, never silently
  granted. Write-capable, connector-call and document tools are never granted.
- **No recursion:** specialists cannot receive
  `deploy_specialist_workforce`, `delegate_to_specialist_agent` or
  `propose_agent_definition`.
- **No self-authorisation:** execution authority is granted only through the
  registry review lifecycle; the runtime contains no code path that can set
  `execution_authorized`.
- **Tenant isolation:** specialists execute with JD's server-derived tenant
  context; every granted tool filters by the organisation id.
- **Approval separation:** connector writes still create pending approvals;
  specialists cannot approve them. Agent Factory proposals are immutable
  registry drafts for human review — not employees.
- **Usage:** specialist model calls flow through the run's existing checkpointed
  usage accounting (shadow ledger). No new billing path exists and nothing
  becomes billable implicitly.
- **Durability:** sub-agent tool calls are deliberately not journaled as
  top-level steps. Every granted tool is read-only, so a worker crash recovers
  by re-running the whole deployment safely; the deployment step is journaled
  like any other tool call with bounded evidence.
- **Limits:** ≤5 specialists per deployment, ≤6 granted tools each, ≤4 model
  rounds per built-in specialist (registry definitions are capped at 6), bounded
  task/context/objective lengths.

## Execution authority lifecycle (registry)

`20261121180000_jd_agent_execution_engine.sql` adds
`jd_agent_definitions.execution_authorized` / `execution_grant_approval` and the
`jd_agent_execution` RPC (owner/admin, service-role only, replay-safe via
`jd_agent_registry_requests`):

`request_grant` → independent `approve`/`reject` → explicit `grant` → `revoke`.

- Requesting requires **current published operational evidence** (state
  `published`, passing current operational evaluation, evaluator still enabled).
- The approving reviewer must differ from the version author, the evaluation
  requester and the authority requester, and the grant additionally requires an
  independent, current owner/admin decider. Approval expiry and evidence pins
  (`content_hash`, `evaluation_id`, `report_hash`) are enforced at grant time.
- The generic Review Centre decision route refuses these approvals and directs
  the reviewer to Business Builder → Agent registry.
- Appending a new definition version resets execution authority (trigger), so a
  revised definition is undeployable until re-reviewed.
- `revoke` is immediate and needs a bounded note. Registry-level
  `execution_enabled` stays `false`: the registry never executes agents; the
  separately release-gated runtime workforce engine reads this authority at
  deployment time.

## Release gating

| Flag | Effect when off (default) |
|---|---|
| `JD_AGENT_REGISTRY_ENABLED` | Registry service and Agent Factory proposals return explicit gate errors. |
| `JD_AGENT_WORKFORCE_ENABLED` | `deploy_specialist_workforce` returns an explicit gate error; no specialist is deployed. |

Both gates fail closed when the environment variable cannot be read. Apply the
candidate migration in isolated staging with synthetic data first; see
[JD_BACKEND_RELEASE.md](JD_BACKEND_RELEASE.md) for the release procedure. The
rollback script removes only the execution columns, trigger and functions —
definitions and evidence survive.

## Tests

`npm run test:workforce` runs four suites:

- `scripts/test-agent-workforce-engine.mjs` — planning contracts, allowlist
  integrity, denied-tool reporting, verification contract, audit bounds.
- `scripts/test-agent-workforce-runtime.mjs` — runtime integration invariants
  (registration, classification, grant rechecks, silent sub-agent calls).
- `scripts/test-agent-workforce-database.mjs` — real candidate SQL in isolated
  PGlite: full grant lifecycle, independence, expiry, version reset, tenant
  boundaries, rollback rehearsal and the HTTP routing guards.
- `scripts/test-workforce-assignments.mjs` — the assignment persistence
  contract in isolated PGlite: append-only records, idempotent re-deployment,
  administrator-only tenant-scoped read-back, limit clamping and the full
  per-record field contract.
- `scripts/test-agent-workforce-ui.mjs` — execution-authority UI flows in JSDOM.

CI additionally runs the Deno executor tests appended to
`supabase/functions/_shared/jd-agent-runtime.test.ts`.

## Assignment persistence (roadmap sequence 1–2)

Every specialist assignment now leaves an immutable, tenant-scoped record in
`public.jd_workforce_assignments` (migration `20261124090000`): the selected
agent kind/ref/name and registry version (built-ins stay `null`), content hash,
the exact skill name/version/content hash loaded for the task, the task text
and its idempotency hash, the granted tool allowlist, the assignment budget,
status (`report_returned`/`failed`), the bounded outcome and the verification
state. Writes are idempotent on retry (`unique (school_id, run_id, agent_kind,
agent_ref, task_hash)`), a persistence failure is reported and never fatal to
the deployment, and the deployment result reports `persisted` truthfully.
Records are append-only (UPDATE/DELETE raise `55000`), unreadable by clients
directly (RLS, no policies), and readable by owner/admin through
`jd_read_workforce_assignments(actor, limit)`, which reuses the registry
administrator boundary. A stored assignment record is provenance evidence, not
verification: verification still requires independent checks against saved
records or registered tools.

## Remaining limits

- Operational evaluations still require a separately reviewed evaluator; the
  synthetic fixtures in tests are not employee evaluations.
- Registry definitions execute with the conservative context toolset; their
  `capabilities` strings remain descriptive proposals.
- A deployment is bounded but not instant; the worst case is bounded by the
  specialist round limits and the 45-second per-request model timeout.
- No production deployment or migration was performed for this release; staging
  acceptance is a separate, reviewed step.
