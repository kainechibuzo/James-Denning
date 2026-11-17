# SaaS Agent Studio — local implementation evidence

**Result:** design-stage foundation implemented and tested locally. **Not deployed. No agents activated. No SaaS built. No production approval recorded.**

- Branch: `arena/89dd4d10-james-denning`
- Base: `539a9f9c818fd2d5fe79699f70140e64ac27e811`
- Scope: first local slice of the November 2026 product feature sheet, specifically agent teams for SaaS-making. The full autonomous platform remains incomplete.
- Source identity: `SOURCE_SHA256SUMS.txt` covers the changed code, tests and guide. These are working-tree hashes, not a deployed revision.
- Environment: Node 22.22.3; locked npm dependencies restored with `npm ci`; Chromium 153.0.8010.0; local synthetic auth/model/database clients only for the new suite.

## What changed

1. Pure shared project validator and tailored agent-team design generator. Website projects without a backend omit backend/database agents; research is optional. No department provisioning or fixed HR/Finance structure in this Studio.
2. Registered proposal-only `preview_saas_agent_team` in the existing JD runtime, with owner/admin role restrictions, a tool schema and truthful capability metadata/history labels. Tested through the real chat dispatcher with a synthetic model response.
3. Authenticated `software.agents.preview` action in `jd-automation`; user/profile/workspace checks and server-side owner/admin enforcement. Payload role/tenant/actor claims cannot grant authority. The action does not create records, access connectors or execute code.
4. **Business operations → SaaS Agents**: explicit requirements, editable agent briefs, instructions, requested permissions, deliverables, handoffs, unevaluated checks, integration needs and human checkpoints. JSON export preserves all safety states.
5. UI requires the expected server preview, fails closed on an old/missing/incompatible backend, clears local design state on requirement/identity/role changes, and prevents duplicate submissions. No local-storage persistence or silent success fallback.
6. New Node/UI/browser checks wired into CI; existing release-package test explicitly requires the shared architect in both normal and nested worker layouts.

## Executed validation

| Command/suite | Actual result | Evidence |
|---|---:|---|
| `npm run test:agents` | **63 passed** | `test-agents.log` |
| `npm run test:settings` | 57 passed | `test-settings.log` |
| `npm run test:capabilities` | 58 passed | `test-capabilities.log` |
| `npm run test:execution` | 276 passed | `test-execution.log` |
| `npm run test:tasks` | 250 passed | `test-tasks.log` |
| `npm run test:navigation` | 106 passed | `test-navigation.log` |
| `npm run test:history` | 23 passed | `test-history.log` |
| `npm run test:backend-release` | 81 passed | `test-backend-release.log` |
| `npm run test:checklist` | 13 passed; no live acceptance advanced | `test-checklist.log` |
| **Node test total** | **927 passed, 0 failed** | Logs above |
| `npm run test:guards` | 43 guard checks passed | `test-guards.log` |
| `npm run test:chat-layout` | Chat 6, settings 4, Studio 4 viewport flows passed | `browser.log` |
| `npm run verify:web` | Passed build and web verification | `verify-web.log` |
| `npm run build:mobile` | Passed | `build-mobile.log` |
| `npm run build` | Passed | `build.log` |
| Deno check of three packaged-source entrypoints | Passed | `deno-check.log` |
| `npm audit --audit-level=high` | 0 vulnerabilities reported | `npm-audit.log` |

### New suite coverage

- Deterministic design and zero execution/storage/grants/budget; requested-only bindings; evaluations not run; no invented provider/MCP connection.
- Invalid/missing/oversized fields, non-boolean flags, architecture contradictions, unsupported fields/agents, credential-like text and excessive notes.
- Website/SaaS variants, optional research/payments, exported brief roundtrip and rejection of altered safety metadata.
- Actual runtime tool availability/execution for owner/admin and denial for manager/staff/viewer/finance/hr/contractor; no database/provider calls in the design tool.
- Actual HTTP handler with synthetic session/profile clients: authentication/workspace/role denial, forged payload authority ignored, only profile lookup, sanitised invalid input, no writes.
- Actual chat dispatcher with a synthetic model: preview payload and preview-only tool evidence returned; normal existing memory read scoped to the authenticated tenant. **Not a live model-selection/effectiveness test.**
- Mounted React: edits (including trailing spaces), invalid architecture/credential-like notes, duplicate submission lock, stale response isolation after scope switch, role downgrade, backend failure, direct role denial and Operations-tab integration while overview data is loading.

### Chromium evidence

`browser-results.json` records 360, 393, 708 and 1280px widths. Each runs preview → edit → actual JSON download → requirement invalidation → backend failure → workspace reset → role denial. No page errors or horizontal overflow observed.

- `studio-{width}.png`: actual Studio component and CSS, synthetic service. Not a screenshot of the deployed application.
- `synthetic-team.design.json`: file content downloaded by Chromium for a synthetic retailer SaaS. Contains `persisted:false`, `agentsCreated:false`, `execution.performed:false`, zero authorised spend/steps, null bindings and not-run evaluations. It is **not a persisted agent record**.
- Existing chat/settings layout suites also reran successfully.

## Failed attempts and corrections

- Initial test run could not import Vite because this sandbox had no `node_modules`. Ran `npm ci`, then reran successfully. No product-code failure inferred from missing dependencies.
- First browser fixture build could not resolve its virtual entry. Corrected the test fixture resolver to handle Vite's absolute entry prefix; all four browser flows then passed, including final rerun.
- During review, controlled brief edits were found to trim trailing whitespace on every keystroke. Kept validated note whitespace, added a mounted regression assertion, and reran successfully.
- Deno `--node-modules-dir=manual` could not find the MCP-only npm dependency (`deno-manual-attempt.log`). Used Deno's separate dependency cache with `--node-modules-dir=none` rather than changing the app dependency manifest.
- Directly checking the unassembled worker failed because its existing `./_shared` imports require the release package's nested layout (`deno-unstaged-worker-attempt.log`). Used **the existing `collectBackendReleaseFiles` helper**, copied its output into `.cache/agent-typecheck`, then checked all three collected entrypoints with `--no-lock --node-modules-dir=none`; passed. This is a local source/type check, **not a release approval, deployable approval manifest or deployment**.
- Builds retain existing large-chunk warnings; Node reports existing module-type warnings. These did not fail checks and are not claimed resolved.

## Not demonstrated / remaining gates

- No cloud connection, billable resource, migration, deployment, public publication, production mutation or owner release approval occurred.
- No authenticated live JWT/RLS tests, real-provider agent selection, live connector inventory, actual isolated execution, real agent evaluations or customer deployment acceptance.
- No persisted/versioned agent registry, reviewer-approved tool bindings or monitored agent jobs. Handoffs are designs, not executable workflows.
- Existing organisation-builder HR/Finance defaults and broader industry-specific workspace generation are **unchanged**, not solved by this Studio.
- Approval checkpoints in exported JSON do not create approval records and cannot authorise work. A saved document is not a registry version. A completed chat tool call is not completed software.
- Checklist acceptance remains unverified. Local tests do not change production readiness, NaijaHaul launch gates, or the separate assignment/cancellation release gates.

See [operator guide and remaining feature map](../../../documentation/JD_SAAS_AGENT_STUDIO.md). Next foundation work: a tenant-isolated agent registry with immutable versions, review/diff/rollback and negative-access tests, followed by explicitly authorised sandbox execution using the existing ledger. Release must remain a separate reviewed decision with genuinely isolated staging and retained failures.
