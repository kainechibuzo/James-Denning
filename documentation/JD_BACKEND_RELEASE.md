# Reviewed JD backend compatibility release

This is a release procedure, **not authorisation to deploy**. No environment, credential, approval variable or staging fixture is provisioned by merging the code. The intended first release carries the capability fixes while preserving the shipping legacy assignment contract. It does not enable checked assignment or checked cancellation, or apply the retry/cancellation migrations. Both cancellation source gates must also remain `legacy`; the planner rejects early switches. The [atomic cancellation candidate procedure](JD_CANCELLATION_RELEASE.md) describes the separate staging evidence and reviewed release-plan change required before activation.

## 1. Why this exists

The frontend currently sends `operations.task.assign`. The checked-only backend added earlier rejects that action with 409, so deploying it unchanged would break the shipping UI. `jd-task-assignment-release.mjs` now makes the server's release choice explicit:

| Backend mode | Legacy request | Checked request | Exact task read |
|---|---|---|---|
| `legacy` (shipping) | Existing scoped, nontransactional update | Rejected before database access | Role/tenant-scoped read |
| `checked` (testable, not enabled) | Rejected; never upgraded with a freshly read version | Existing service-only CAS/audit RPC | Role/tenant-scoped read |
| invalid | Denied | Denied | Denied |

The choice is a reviewed source constant, not an HTTP field, environment guess or error-triggered fallback. Both shipping constants must remain `legacy` for this release path. The compatibility handler retains owner/admin/manager authority, task and assignee tenant filters and the existing eligible assignee roles. It reports `auditRecorded: false`; **legacy assignment still lacks transactional eligibility checks, compare-and-swap and a transactional audit record.** Cross-request races remain a reason to finish the separately staged checked-assignment release. Task auto-assignment is unchanged.

## 2. What the workflow can and cannot do

`.github/workflows/deploy.yml` is manual-only, master-only, source-SHA pinned and serialized without cancellation. Its default is **prepare an artifact, do not deploy**. It has no `db push --include-all`, no `--no-verify-jwt`, no `JD_SECRETS_JSON`, no generic deploy-all command and no post-deploy worker invocation. The dormant obsolete `deploy.yml.` duplicate was removed to avoid accidental activation.

Migrations are an explicit per-dispatch opt-in: behind all of the reviewed-SHA gates above, `apply_migrations: true` runs a `supabase db push --dry-run` preview and then applies the reviewed `supabase/migrations` manifest with `--skip-vault`, against the same project ref. It requires `SUPABASE_DB_PASSWORD` (and the existing `SUPABASE_ACCESS_TOKEN`) in the release environment; the merge-to-master auto release passes `apply_migrations=true` so a merged master is a current master. A failed push must never be auto-retried: review the partial state in `supabase_migrations.schema_migrations` first.

The database-side dispatch heartbeat (migration `20261125120000_jd_dispatch_tick`) keeps retries dispatching from inside Postgres when GitHub's scheduler cron skips ticks. It reads the worker secret from Supabase Vault (`jd_worker_secret`) and stays a documented no-op until that secret is inserted; the GitHub dispatcher cron remains enabled as defence in depth.

Only these three functions are in the source bundle, because they import the updated agent runtime:

- `jd-automation` — user JWT required at the gateway; internal actor/profile checks remain.
- `jd-execution-worker` — its dedicated server-side secret validation remains; no dispatcher invocation is performed by this workflow.
- `jd-mcp` — its existing OAuth/user authentication remains.

Shared `.ts` and `.mjs` helpers are copied, excluding test files; the worker's nested `./_shared` layout is staged explicitly. The generated config carries only these functions' unchanged JWT settings and a local project label. It has no production project binding, migrations or auth configuration. Every source file is hashed. Source/manifest mismatch, unexpected files, symlinks, early mode switches and JWT-setting drift stop packaging/verification.

**This is a source artifact, not a fully reproducible compiled bundle.** Existing remote npm imports include ranges, and dependency resolution is not locked by the manifest. Review dependency changes and capture deployed function metadata/code hashes during staging and release. The pinned deployment CLI is 3.2.0; its official release was checked on GitHub. Revalidate the artifact and dependency assumptions before deployment. Do not treat a source SHA as proof of identical resolved runtime dependencies.

## 3. Independent approvals and environment setup

A maintainer must create and review the GitHub environments `supabase-staging` and `supabase-production`. Configure required independent reviewers, prevent self-review where supported, restrict deployments to `master`, and limit who can edit environment variables/secrets. An environment name alone does not prove protections exist. Missing approval variables fail closed even if GitHub creates an unprotected empty environment automatically.

Set environment-scoped variables through an authorised maintainer, **not through the agent's test run**:

| Variable | Requirement |
|---|---|
| `JD_BACKEND_PROJECT_REF` | The actual target project ref. Production must be `thklwiybjuhrjqrrxyid`. |
| `JD_STAGING_PROJECT_REF` | Independently verified genuinely isolated staging ref. Required to match the target for staging; known production/legacy refs are forbidden. An unrelated project is not staging. |
| `JD_BACKEND_RELEASE_APPROVED_SHA` | Full lowercase 40-character commit SHA approved for this environment. Must equal the checked-out dispatch commit. |
| `JD_BACKEND_APPROVAL_REFERENCE` | HTTPS issue/PR/review comment URL in `kainechibuzo/James-Denning`, containing the independent review and evidence. The script validates URL shape only, not its contents or the reviewer's independence. |
| `JD_BACKEND_STAGING_VERIFIED_SHA` | Production only: same exact SHA independently accepted in isolated staging. No automatic setter exists. |

Supply `SUPABASE_ACCESS_TOKEN` only as an environment secret with appropriate project permissions. Never put credentials in chat, Git, workflow inputs or evidence. The preparation script does not read this secret; the workflow exposes it only to the optional deploy step. No database password is used.

The variables are operator attestations, not cryptographic proof or live acceptance. Anyone who can change both source and approvals could undermine them; repository/environment governance and independent review are required. No workflow run here establishes those external protections.

## 4. Staging procedure

1. Review the exact source commit and require its PR/post-merge CI, including `test:backend-release`, task, execution, capability and browser tests. Inspect the full diff from the currently deployed functions, not just the newest PR: earlier merged backend changes may also be undeployed.
2. Establish a separate Supabase staging project, synthetic two-tenant accounts/records and staging-only integrations. Do not repurpose a production tenant or an unrelated project. Reconcile schema history deliberately; this workflow never pushes SQL.
3. Approve that exact master commit for staging and set the variables above. Dispatch **Supabase Deploy** on master with matching `release_sha`, `release_stage=staging`, confirmation `deploy-reviewed-jd-backend`, and `deploy_functions=false`.
4. Review the uploaded source manifest/artifact. Ensure the database contains the existing RPC/schema dependencies. The artifact includes the gated checked handler, but must not invoke the undeployed checked RPC in legacy mode.
5. After independent approval, dispatch the same commit with `deploy_functions=true`. If master has changed, the expected-SHA check refuses an old SHA against a newer checkout; review the new commit instead. This workflow does not silently deploy a moving branch or check out an arbitrary input revision.
6. Verify in staging with actual authenticated users: legacy manual/auto assignment; list read-back; denied roles; cross-tenant task/member attempts; malformed/spoofed inputs; uncertain responses; capability inventory and actual safe reads; requested internal task/memory persistence; preview-only outputs; approval requests versus execution; and consistent chat/worker/MCP behaviour. Do not use a real hire, publication, payment or legal commitment as a test.
7. Retain expected/actual results, source and deployed hashes/versions, JWT/RLS checks, record IDs, audit limitations, browser evidence, dependency resolution, reviewer and timestamps in restricted evidence where appropriate. A successful CLI deploy or synthetic test is not this acceptance.

For production, independently approve the same exact tested SHA in the production environment and set `JD_BACKEND_STAGING_VERIFIED_SHA` only after step 7. Repeat artifact review and explicitly select deployment. No production release is authorised by this document.

## 5. Partial deployment, rollback and checked-mode transition

The three CLI deploys are sequential, **not atomic**. On failure, the workflow stops; it does not retry in a weaker mode or automatically roll back. Record exactly which functions changed, avoid further unrelated changes, and have the release owner assess in-flight workers and client compatibility. Retain the prior known-good function source/dependency artifact and deployed metadata *before* releasing. Artifacts expire after 30 days in the default workflow; archive approved recovery evidence in the organisation's protected release storage.

This workflow is not a general rollback engine: it requires the exact current master SHA and legacy mode. A rollback requires a separately reviewed procedure/artifact and explicit authorisation; never change JWT settings, run broad migrations or invoke workers as a workaround. Restoring legacy behaviour after a future checked-mode rollout would reduce guarantees and must not be an automatic fallback.

The atomic assignment migration and retry-integrity migration remain separate staging/release gates. Enabling checked assignment requires schema validation, multi-session concurrency/audit testing, coordinated server/frontend activation and old-client handling. The legacy-only release planner intentionally refuses that mode until its own contract is deliberately updated and reviewed.
