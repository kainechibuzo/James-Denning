# Backend compatibility and scoped release preparation

## Delivery scope

- Branch: `arena/fbef563f-james-denning`.
- Base: `4c2b93b52b371e0df08a9bc31fc6cd28fb62b879` (merged PR #92).
- Delivery owner: Arena coding agent. Independent reviewer: unassigned.
- This slice repairs the known assignment contract mismatch and supplies a narrower release procedure. It does **not** establish that all accumulated backend changes are ready for production.
- No Supabase functions/migrations were deployed; no environment approval variables, credentials, production records or staging infrastructure were changed. No deployment workflow was dispatched.
- Folder date follows the preceding screenshot/release evidence series; provider timestamps and commit identities are retained separately. Source hashes identify the local changes tested before commit.

## Reproduced blocker

The shipping frontend's `TASK_ASSIGNMENT_RELEASE` is `legacy`, so it sends `operations.task.assign`. The prior checked-only handler rejects that request with 409. A new test reproduces the shipping-client failure through the actual HTTP route with the previous checked-only handler injected.

The prior compatible route was inspected from historical commit `15a3d1b0b76edffa0c935e0807e8b554ffe72bbb` without switching branches. Its behaviour was a manager-authorised, tenant-scoped task/member preflight followed by a direct, unaudited assignment update. It did not offer CAS or transactional audit guarantees.

## Implementation

### Explicit backend release choice

`jd-task-assignment-release.mjs` adds a server-owned `BACKEND_TASK_ASSIGNMENT_RELEASE = 'legacy'`, aligned with the shipping frontend. The actual authenticated `jd-automation` route now uses this wrapper.

- Legacy requests preserve the prior role/tenant/assignee eligibility contract and return a confirmed task record with `auditRecorded: false`. UUID validation, generic error handling and missing/malformed acknowledgement failures are explicit.
- Checked assignment is rejected before database access in legacy mode; a caller cannot enable it with JSON fields.
- Explicit checked mode retains the service-only CAS/audit RPC and retires the legacy request. Missing RPC, permission, version-conflict and transport/error results never fall back to an unchecked update.
- Exact task reads retain role/tenant checks without requiring the assignment migration.
- The shipping client and real HTTP handler now pass a synthetic assignment/write/read-back flow. The existing UI/controller still blocks another write after an uncertain acknowledgement and recovers via refresh.

**Limitations retained honestly:** legacy preflight and update are not one transaction; actor/member eligibility can change concurrently; legacy assignment lacks CAS and transactional audit. Bounded list read-back and auto-assignment behaviour are unchanged. This repair prevents a known release incompatibility; it does not turn legacy assignment into the checked contract or authorise its production deployment.

### Release workflow and artifact

The previous manual workflow could deploy every function or blindly push all pending SQL despite known migration-version divergence. It has been replaced with a manual, master-only, exact-SHA workflow that defaults to source-artifact preparation only.

- Only `jd-automation`, `jd-execution-worker` and `jd-mcp` are in the deployment bundle because they consume the changed agent runtime.
- Independent, environment-scoped approved-SHA/evidence-reference variables are required. Production additionally requires an operator-attested isolated-staging acceptance marker for that same SHA. Missing/stale markers fail before deployment credentials are exposed.
- Staging must match an explicit non-production project allowlist; known production/legacy refs are rejected. Production must match this application's known project.
- Packaging carries only the three JWT configurations, entrypoints and shared source helpers, including the worker's nested `.ts`/`.mjs` imports. It excludes SQL, auth configuration, secrets and unrelated function entrypoints.
- Source hashes and an exact file set are checked before deployment. Dirty checkouts, symlinks, unexpected files, early mode switches and JWT-setting drift are refused.
- No database password, `db push`, generic deploy-all, worker dispatch or automatic fallback/rollback remains in this workflow. The dormant obsolete `deploy.yml.` file was removed.
- Deployment requires a separate explicit boolean, defaults false, and invokes the three names sequentially with CLI 3.2.0. Its official GitHub release exists (published 2026-11-16T16:50:26Z). The live CLI deployment path has **not** been run here.

See [the release procedure](../../../documentation/JD_BACKEND_RELEASE.md) for required independent environment protections, staging cases, partial-deployment handling and rollback boundaries. Approval variables are operator attestations, not proof that evidence exists or that environment protection is configured. The URL validator checks shape, not review contents. No approval is self-created by this work.

**Source-artifact limitation:** existing remote npm import ranges are not locked by the manifest. The artifact is not a fully reproducible compiled runtime bundle. Full review from the deployed backend revision, dependency/deployed-code metadata, genuine isolated staging and independent acceptance remain release prerequisites. The three deployments are not atomic; a partial failure needs explicit operator review. The workflow is not a general rollback engine.

## Local validation

| Suite/check | Result | Evidence |
|---|---|---|
| Backend compatibility/release planning | 78 passed | `backend-release.log` |
| Tasks | 250 passed | `tasks.log` |
| Execution | 97 passed | `execution.log` |
| Capability contracts | 58 passed | `capabilities.log` |
| Navigation/identity | 106 passed | `navigation.log` |
| History | 23 passed | `history.log` |
| Checklist | 13 passed; 222 entries, 0 verified | `checklist.log` |
| Verification guards | 43 checks passed | `guards.log` |
| Actual ChatHome Chromium layouts | Six viewports passed | `layout.log` |
| Web verification, mobile and default builds | Passed | `verify-web.log`, `build-mobile.log`, `build.log` |
| npm audit | 0 reported vulnerabilities | `audit.log` |

Total: **625 Node tests, 43 guard checks and six Chromium layout cases passed.** Logs have trailing whitespace normalised; source/module/build warnings are nonblocking. `SOURCE_SHA256SUMS.txt` identifies the working-tree implementation tested before commit. Full remote CI/type checks must also pass before merge.

Backend tests exercise the actual frontend adapter/controller, actual HTTP handler and release handlers with synthetic authenticated clients and an in-memory database adapter. They cover eligible/denied roles, task/member tenant mismatches, spoofed actor/role/release fields, lost acknowledgement recovery, legacy/checked disagreement and no fallback after RPC errors. They do not prove live JWT/PostgREST/RLS, concurrent database locking or real production persistence.

Packaging tests use copies of actual source files, verify both root/nested helper layouts, and reject changed/missing/extra files, target/hash tampering, symlinks, mode/JWT drift, missing approvals and unsafe targets. Positive CLI tests use a clearly synthetic git adapter and synthetic approval inputs inside temporary fixtures; no extra repository/branch or real approval was created. Negative CLI tests reject absent approvals without network. Static workflow assertions cover its restricted triggers, targets, commands and secret placement; these do not prove GitHub environment protections or a successful live deployment.

## PR #92 deployment follow-up (read-only)

Vercel `list_deployments` request `929f3625-6170-4556-a1a6-556d6738bae3`, scoped to this project's production deployments, returned:

- `dpl_98mQSPJcwdCCM3K5y15Hzt8iwdK3`: **READY / PROMOTED**, target production, alias error null.
- Exact commit `4c2b93b52b371e0df08a9bc31fc6cd28fb62b879`.
- URL: `https://james-denning-bv1c12djk-james-projects-57651351.vercel.app`.
- Post-merge Verify application [44042566423](https://github.com/kainechibuzo/James-Denning/actions/runs/44042566423) succeeded for the same commit.

This confirms frontend deployment identity/status only, not authenticated browser acceptance, backend deployment or capability verification. Routine worker workflow success was not treated as proof of business outcomes.

## Remaining gates

1. Independent review and remote CI for this slice.
2. A genuinely isolated staging project, nonempty two-tenant fixtures and staging-only integrations; none established by this turn.
3. Review all accumulated backend changes and resolved dependencies relative to deployed functions, not just the newest PR. Configure independently protected release environments and exact-SHA attestations only after appropriate review.
4. Rehearse the scoped staging release and full authenticated capability/assignment/approval/worker/MCP flows. Retain persisted records, deployed hashes, failures and independent review.
5. Obtain explicit production release approval. Checked assignment and retry-integrity SQL remain separate migrations/releases; the compatibility workflow cannot apply them.

All 222 planning entries and final acceptance **0/9** remain unverified. No NaijaHaul launch, recruitment publication, financial/legal commitment or self-approval is authorised by this work.
