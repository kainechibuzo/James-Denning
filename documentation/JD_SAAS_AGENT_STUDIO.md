# SaaS Agent Studio — design-stage foundation

## Scope and current truth

This is the first local slice of the November 2026 **Run. Monitor. Build. Grow.** product direction, specifically the request to make agents for building SaaS. It is **not the completed autonomous platform** and **does not run software-building agents**.

Owners/admins can design a tailored team for a SaaS, website or internal tool, edit each agent’s project-specific brief, and download an honest JSON design. No agent registry, agent version, connector binding, running workflow, deployed software or evaluation result is created by this action. The generator is deterministic; it does not call an LLM or perform market research. Chat can invoke it through JD’s existing model/tool loop.

## How to use after a separately reviewed release

1. Open **Business operations → SaaS Agents** as owner/admin.
2. Enter the project name and brief, explicit architecture requirements, and preferred development route. Do not include credentials, production data or private customer data.
3. Generate a team preview. The browser requires confirmation from the authenticated `jd-automation` endpoint; an old/unavailable backend fails closed, with no silent local-success fallback.
4. Inspect responsibilities, instructions, requested capabilities, deliverables, proposed handoffs and evaluation criteria. Expand an agent card and edit its project-specific brief if needed.
5. Review integration requirements and human checkpoints. These are **requirements**, not a catalogue, connection inventory or official-MCP assertion. No connected tools were inspected by this action.
6. **Export design JSON** to retain a file. Editing requirements discards the previous preview and per-agent edits. Leaving the tab, reloading, changing identity/workspace or losing the admin role clears local design state. Export before leaving.

Chat example:

> Design a team for an inventory SaaS for independent retailers. It needs a backend, user authentication and separate customer organisations. No payments or live research yet. Prefer native isolated development. Preview the agent definitions only; do not execute, connect services or deploy.

JD's `preview_saas_agent_team` tool requires explicit requirements and tells the model to ask about unresolved needs. Generated briefs are untrusted task data, not authority. If explicitly requested, the existing `create_business_document_draft` tool can save a confirmed JSON **document**; that does not activate the design or provide a versioned agent registry. This slice does not test or change document storage.

## Design contract

- `schemaVersion: 1` describes the export schema, **not a persisted agent version**.
- `status: preview_generated`, `persisted: false`, `agentsCreated: false`.
- Execution is `not_started` / `performed: false`; authorised spend and steps are zero.
- Each capability is `requested_only`, with `binding: null`.
- Evaluations are `not_run`, with empty evidence arrays. These are proposed checks, not executed tests of an agent.
- Native/repository/scaffolder is a **preference**, not proof of an available integration or authorised runner.
- Connector needs have no catalogue entry, official-integration verification, inspected connection or discovered tools.
- Coordinator, design, frontend, QA, security and release planning are the base roles. Backend/database roles depend on backend need; research is optional. This surface creates no HR/Finance departments.
- Starter dependencies are explicit: authentication, multitenancy or payments require a backend; multitenancy requires authentication. SaaS does not automatically force multitenancy.
- Unknown fields, unsupported enums, invalid booleans, excessive text, unknown/inapplicable agent notes and some common credential patterns are rejected. **This is not a comprehensive secret scanner**; users must not paste secrets.

## Existing architecture extended

| Area | Change |
|---|---|
| Shared design contract | `supabase/functions/_shared/jd-agent-architect.mjs`; pure validation/generation, no I/O |
| Shared JD runtime | `preview_saas_agent_team`, low-risk, owner/admin, proposal only; reused by JD chat and MCP |
| Capability inventory | Classifies the tool as `preview_only`, not executed or live-verified |
| Authenticated HTTP | `software.agents.preview` in `jd-automation`; authenticated user/profile/workspace and server role checks before design generation |
| Frontend | `src/software-factory/`, new Operations tab; canonical response validation, local edit/export and identity-keyed state |
| History | Neutral tool labels; preview evidence remains separate from completed tool-call records |
| CI | `test:agents`; Studio Chromium checks appended to existing layout suite |

HTTP authority comes from the verified session and database profile, never caller-supplied role/tenant/actor fields. The action reads only that profile and creates no records. The runtime tool relies on its server-provided `AgentContext` and role filter, like existing low-risk tools; it does not create a new authentication path. No design cache or browser storage is used. No database migration is introduced.

## Local validation and limitations

See [local evidence](../docs/evidence/2026-11-16-saas-agent-studio/REPORT.md). Tests exercise the actual pure module, actual runtime tool/dispatcher, transformed actual HTTP handler with synthetic auth clients, mounted React components, and Chromium export/layout flows. Synthetic auth tests are **not live JWT/RLS or cross-tenant database acceptance**. A synthetic model call is not a real-provider acceptance test.

Reproduce:

```sh
npm ci
npm run test:agents
npm run test:capabilities
npm run test:execution
npm run test:history
CHROMIUM_EXECUTABLE_PATH=/path/to/chromium npm run test:chat-layout
npm run verify:web
npm run build:mobile
```

## Release and rollback boundaries

Nothing has been deployed by this change. No paid infrastructure, provider connection, production mutation or owner acceptance is authorised.

The UI needs the corresponding reviewed `jd-automation` release. JD chat/MCP consumers need the updated shared runtime in **jd-automation, jd-execution-worker and jd-mcp** as applicable. A frontend merge does not deploy those functions. A frontend-only release shows a safe error when an older backend cannot confirm a design. Use genuinely separate staging; never treat production as a test sandbox.

Before live acceptance: verify authenticated role denial, stale sessions, two isolated tenants, current deployed source/version, actual model tool selection, truthful preview results and downloads, existing chat/history behaviours, and absence of unauthorised side effects. Record failures. Obtain explicit owner approval for the tested release. Rollback is reverting the reviewed frontend/functions to their previous versions; this slice has no agent records/migrations to undo. Existing exported files are not revoked by rollback and grant no permissions.

## Remaining product work — not claimed complete

| Feature-sheet area | This slice | Still needed |
|---|---|---|
| Agent architect | Tailored definitions, bounded requested capabilities, briefs, handoffs, evaluation criteria | Tenant-isolated persisted registry, immutable versions/diffs, human approval records, rollback, actual evaluation harness |
| Software factory | Proposed team, development-route preference, integration needs and release checkpoints | Authorised tool binding, isolated code runner, budgets/limits, repo artifacts, actual builds/tests/security, preview deployment, customer release approval and live verification |
| Agent monitoring | Existing tool-call evidence distinguishes design from execution | Per-agent runs, durable steps, retries, failure recovery, cancellations and verified artifact provenance |
| Workspace architect | No unnecessary departments in this Studio | Replace fixed organisation-builder defaults with industry-appropriate modules; optional/no departments; approved/versioned/reversible navigation and dashboards. Existing HR/Finance defaults elsewhere are unchanged |
| Connector catalogue | Honest capability requirements only | Verified providers/methods/scopes/maintenance/testing; catalogue separate from tenant connections and discovered tools; authorised connection/health UX |
| Workflow architect | Proposed sequential handoffs only | Executable branches/events/schedules, assignment/approvals, recovery and versions |
| Business DNA/research/memory | Brief and optional research-agent definition | Discovery/evidence-backed research, approved isolated memory evolution and provenance |
| Customer deployment | Human checkpoints in design | Source-identified approval, authorised execution, environment verification, recovery and handover |

Next foundation slice: versioned, tenant-isolated agent definitions and approval records with negative-access tests. Only then connect a bounded isolated runner to explicitly authorised tools and the existing execution ledger. Do not interpret design JSON, a completed chat turn or a merged PR as an activated team or finished SaaS.
