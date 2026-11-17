# Versioned agent registry — local implementation evidence

**Outcome: the agreed registry/evaluation-evidence stage is implemented and tested locally. This is not completion of the autonomous employee platform or production acceptance.**

Branch: `arena/f4e67afd-james-denning`

Base: `753971562cab3c0b2d4bff303cc6dca27b88826f` (merged PR #103).

No cloud resource, hosted database mutation, migration application, function deployment, real model/provider request, operational employee evaluation, hiring, charge or production approval occurred. No commit/push/PR was performed in this implementation pass. Existing platform billing and default-off shadow accounting are unchanged.

## Delivered

- Business Builder → **Agent registry**: customise an existing starter specialist, save/read back immutable versions, edit instructions/model/capability requests/limits/cases, inspect exact retained definitions and copy old content into a new draft.
- One adapter derives defaults from the existing 16-template workforce catalogue, including SaaS roles. This avoids a second manually maintained seed catalogue, but does not yet consolidate every SaaS team design into hired employee instances.
- Version/hash-pinned evidence lifecycle: draft, testing, results, independent review, tenant-private publication and suspension. Every new version invalidates previous evaluation/review eligibility; old evidence remains.
- Runnable `contract-v1` checks and immutable reports. These check schema, evaluation-plan coverage and authority boundaries. **They do not run agent tasks or count as operational evaluations.**
- Service-only operational evaluation start/finish infrastructure with an empty-by-default, deployment-managed evaluator allowlist. No browser/model endpoint can register an evaluator or upload a passing report.
- Existing approval/run/audit integration, with independent reviewer enforcement and exact expected evaluation/approval IDs. Same-version evidence replacement cannot be approved from a stale screen.
- Effective `publication_current` checks on read: expired/revoked evidence or revoked reviewer authority stops current publication eligibility without rewriting history.
- Default-off authenticated API, denied direct authenticated/anonymous database access, atomic audit writes, request replay/conflict checks and guarded empty-schema rollback.
- Client acknowledgement/read-back validation, pending-submit locking, role/workspace reset and stale-response suppression.
- Updated CI, backend packaging checks and clearer billing UI text acknowledging the existing shadow ledger without claiming commercial billing.

## Actual validation results

| Command | Result | Evidence |
|---|---:|---|
| `npm run test:registry` | **92 passed** | `test-registry.log` |
| `npm run test:usage` | 104 passed | `test-usage.log` |
| `npm run test:foundation` | 91 passed | `test-foundation.log` |
| `npm run test:agents` | 63 passed | `test-agents.log` |
| `npm run test:settings` | 57 passed | `test-settings.log` |
| `npm run test:capabilities` | 58 passed | `test-capabilities.log` |
| `npm run test:execution` | 276 passed | `test-execution.log` |
| `npm run test:tasks` | 250 passed | `test-tasks.log` |
| `npm run test:navigation` | 106 passed | `test-navigation.log` |
| `npm run test:history` | 23 passed | `test-history.log` |
| `npm run test:backend-release` | 82 passed | `test-backend-release.log` |
| `npm run test:checklist` | 13 passed; no live acceptance advanced | `test-checklist.log` |
| **Node total** | **1,215 passed, 0 failed** | Above logs |
| `npm run test:guards` | 43 checks passed | `test-guards.log` |
| `npm run test:chat-layout` | **22 browser viewport flows passed** | `browser.log` |
| Packaged automation/worker/MCP Deno checks | Passed | `deno-check.log` |
| `npm run verify:web` | Passed | `verify-web.log` |
| `npm run build:mobile` | Passed | `build-mobile.log` |
| `npm run build` | Passed | `build.log` |
| `npm audit --audit-level=high` | 0 vulnerabilities reported | `npm-audit.log` |

Node 22.22.3, Deno 2.9.6 / TypeScript 6.0.3, Chromium 153.0.8010.0. npm dependencies came from the lockfile. Deno checked the actual release collector's staged shared/nested `.ts` and `.mjs` layout with `--no-lock --node-modules-dir=none`; this is not an approved deployment artifact. Existing module-type and large-chunk warnings remain. No new test suite or typecheck failure occurred in the recorded implementation runs.

## Database, service and review evidence

Tests execute the actual candidate SQL in PGlite, the actual authenticated HTTP dispatcher/service and the existing `jd_decide_approval` function (with synthetic identity and an SHA wrapper).

Verified locally:

- Immutable versions/reports, same-request replay, conflicting request reuse, optimistic version denial and tenant/role boundaries.
- Anonymous/authenticated callers cannot spoof actors, run trusted evaluator completions or directly access private tables. The service role cannot directly publish or enable evaluator rows.
- Contract success cannot request operational publication review.
- Operational evaluation start requires an allowlisted runner and proposed provider/model; report case coverage is exact and failure/blocked outcomes are retained.
- Late results for an old version or superseded evaluation never restore current eligibility.
- New instructions, capabilities, model configuration or evaluation criteria invalidate prior review/publication authority.
- Independent reviewer differs from both author and evaluation requester. Missing, rejected, expired, stale or revoked review/evidence cannot publish.
- Exact evaluation/review identity comparisons protect against a newly replaced same-version review. This was explicitly tightened during implementation and given a regression test.
- Generic Review Centre decisions direct registry reviews to the evidence-pinned registry route. Even direct generic self-approval in a fixture cannot advance the registry to reviewed/published.
- Audit failure rolls back saved version/pointer/request changes. Populated rollback refuses evidence loss; empty rollback/reapply preserves the existing control plane.

`synthetic-publication.json` records the full passing publication **state-machine fixture**, including actual approval/audit rows. It deliberately uses a fixture-seeded evaluator and fabricated synthetic case observations to test the authority boundary. **It is not evidence that any employee passed operational evaluation or was published to a live catalogue.**

`reopened-contract-registry.json` records a real on-disk PGlite close/reopen: definition content, contract results and replay receipts survive reopening. Only schema/contract checks ran. This is clean local close/reopen durability, not hosted crash recovery or concurrent locking acceptance.

## Browser evidence

Actual components run in Chromium with synthetic endpoint responses. The registry is opened through the real Business Builder tab at **360, 393, 708 and 1280px**. Each width covers save/read-back, double-submit locking, explicit contract-check confirmation, blocked publication, revised-definition invalidation, old-content copy/new draft, confirmed suspension, workspace reset and role downgrade.

No horizontal overflow or page errors were observed (`browser-results.json`). `registry-393.png` and `registry-1280.png` show synthetic fixture states and synthetic hashes, not hosted customer records. The 393px capture was also visually inspected.

The complete browser command additionally reran six chat, four settings, four SaaS Studio and four Business Foundation viewport flows: **22 total**. Mounted React tests cover late-response suppression, uncertain retry request reuse, role downgrade, invalid secret-like input, failed receipts and explicit confirmations.

## What remains unimplemented/unverified

- A real isolated operational evaluator and genuine model/tool/task-quality evidence. The allowlist is empty in the migration. Its hash is a trusted-runner identifier, not cryptographic proof of execution.
- Evaluated-definition hiring, tenant-specific grants/tool bindings, bounded employee execution and verified employee IDs in metering.
- Activated generated CRUD/navigation/workspaces, the end-to-end SaaS build/preview/deploy pipeline, and commercial invoicing/payments/disputes.
- 400+ evaluated employees. The static seed catalogue remains **16 drafts, 0 operationally evaluated, 0 hireable**.
- Hosted JWT/PostgREST security, concurrency/queue/provider tests, retention/deletion policy, isolated staging, deployment and independent owner acceptance.

Saved step/time limits are requirements, not runner enforcement. Tenant-private publication remains separate from global marketplace publication, hiring, execution, tool grants and spending. All hiring/execution/billing response flags remain false. A human content or publication approval is not a production release approval.

Migration and backend deployment are separate reviewed gates. Keep `JD_AGENT_REGISTRY_ENABLED` off until the exact source/schema release is verified in genuinely isolated staging; do not blindly push divergent history. No production checklist item was advanced.

See [registry implementation, lifecycle, API and release/recovery guide](../../../documentation/JD_AGENT_REGISTRY.md). Source and artifact hash manifests identify these local tested files, not a deployed revision.

## Pre-publication evidence sanitisation

A negative-test title printed a synthetic credential-shaped fixture and triggered push protection. Historical test titles were redacted; test labels now use case numbers rather than input values. Assertions and product behaviour are unchanged. The registry suite was rerun successfully after this label-only change; the reconciliation evidence includes that fresh log. No push-protection bypass was used.
