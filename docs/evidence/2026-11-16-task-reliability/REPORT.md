# Task reliability and staging-safety slice

**Date:** 2026-11-16 UTC · **Status:** implemented and locally tested; live staging/production acceptance pending.

**Branch:** `arena/e599cc4e-james-denning`.
**Base:** `9895abf0e4f7d6bfd871249ea125065e92f767b0` plus the working-tree changes fingerprinted in [tested-files.sha256](tested-files.sha256).

Related checklist items: P1-04, P1-11, P1-15; P3-E11–12; P4-T02, P4-T04–08; P7-10. None is marked fully accepted by this narrow slice.

## Findings and changes

### 1. Staff chat task updates used the manager-only action

At the base commit, `ChatHome.updateOperationalTask` always sent `operations.task.transition`. The endpoint explicitly reserves that action for owner/admin/manager. Assigned staff have a separate `operations.task.transition_own` action. This is a demonstrated source-contract mismatch, **not proof that it caused the owner's reported screenshot failure**.

The new shared task client selects the own-task action for staff and the manager action for owner/admin/manager. Other roles are refused locally for useful UX; the endpoint and database remain the security authority. Assignment and tenant scope are not trusted from the browser.

Both chat and the Operations task-transition button now use the same response-validation contract. Existing Supabase client session handling is retained; no privileged key or manual bearer-token override was added.

### 2. Incomplete acknowledgement could appear successful

The old chat callback accepted a task-shaped response, fell back to the requested status when the returned status was missing, and still updated the checklist after `auditRecorded: false`. The Operations page also lacked transition-specific evidence validation.

The shared client now requires all of:

- Returned task ID equals the requested task ID.
- Returned status equals the requested transition.
- `auditRecorded` is exactly `true`.
- `auditId` is a UUID-shaped reference.

Missing or mismatched evidence never produces a confirmed-success update. This checks the server acknowledgement; it is **not independent verification of an external business outcome**. A live record/audit read-back is still required for acceptance.

HTTP authentication, permission, conflict, throttling and service-unavailability failures receive distinct, sanitised guidance. Thrown transport failures are caught. Unknown outcomes explicitly warn that a save may already have happened and require refresh before retry. No automatic mutation retry was added: replay after a lost acknowledgement can be unsafe without reconciliation.

Chat also blocks duplicate in-flight updates for the same task synchronously and marks matching task controls busy/disabled, including repeated cards. Browser interaction testing of those controls is still pending; the current tests exercise the client request/response contract, not a mounted React application.

### 3. The later SQL definition already supports owner and assigned staff

Read-only production schema inspection used:

```sql
select pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'jd_transition_operational_task';
```

Supabase connector response reference: `fd8ebe77-a0a2-4345-b3e8-d83ad8085035`.

The returned function includes owner/admin/manager/staff, tenant-filtered row locking, assigned-staff restrictions, expected-status conflict detection and atomic task/audit writes. The corresponding later repository definition is in `20261114213713_jd_authorization_role_matrix.sql`. Therefore the earlier admin/manager-only migration was **not** treated as the current production implementation. No database migration or production function update was made.

The new PostgreSQL harness discovers and applies the transition function definitions in migration order, including the role-matrix replacement and grants, rather than testing only the older definition.

### 4. A staging-named environment did not prevent production writes

`verify-jd-business-staging.mjs` attempts a cross-tenant update. Previously it trusted `SUPABASE_URL` after checking credentials were present. Misconfigured staging secrets could therefore direct an attempted write at production.

The new preflight requires an explicit staging project reference and `JD_STAGING_ALLOW_WRITES=true`; it rejects known production/legacy refs and any noncanonical/mismatched URL **before authentication or any network request**. Fetch refuses redirects. The workflow passes the two new repository variables and remains fail-closed until configured.

This is accident prevention, not proof of isolation: an operator must independently verify a new staging target and staging-only integrations. The production denylist must be reviewed if project identities change.

## Reproducible local results

All commands below exited zero on Node v22.22.3 / npm 10.9.8. No real frontend or staging credentials were supplied.

| Command | Result | Artifact |
|---|---|---|
| `npm ci --no-fund --no-audit` | Lockfile install passes; dependency deprecation warnings retained | [install.log](install.log) |
| `npm run test:tasks` | **57 passed, 0 failed, 0 skipped**: 37 client tests + 20 PostgreSQL tests | [task-tests.log](task-tests.log) |
| `npm run test:guards` | **43 PASS assertions**; network is stubbed throughout | [guard-tests.log](guard-tests.log) |
| `npm run verify:web` | Pass: 1,823 transformed modules, 47 JS chunks, entry ~9 KB / 4 KB gzip | [web-build.log](web-build.log) |
| `npm run build:mobile` | Pass: 1,762 transformed modules | [mobile-build.log](mobile-build.log) |
| `npm audit --audit-level=high` | Zero known vulnerabilities reported | [audit.log](audit.log) |
| `git diff --check` | Pass | No whitespace errors |

Known build warnings remain: Vite config module format compatibility and the oversized spreadsheet vendor chunk. No performance or security acceptance is inferred from successful builds or dependency auditing.

### Client test coverage

- Correct action for owner/admin/manager/staff; no manager action issued for unsupported roles.
- Staff may not request cancellation/requeue through the own-task client path.
- Invalid task IDs/statuses rejected before requests.
- HTTP 400/401/403/404/409/429/500/503 handled without leaking raw diagnostics or retrying.
- Eleven missing/mismatched task/audit acknowledgement cases rejected.
- Body-level errors and thrown network failures never reported as success.

### PostgreSQL test coverage and limits

A dev-only PGlite instance runs PostgreSQL SQL locally with synthetic actors in two organisations. The task and audit table definitions and transition functions/grants come from repository migrations. Auth users, profiles, organisations and automation-run dependencies are minimal test fixtures.

Tests verify:

- Owner/admin/manager and assigned staff can start/complete tasks, with independently queried local task/audit rows and completion timestamp.
- Other/unassigned staff, unauthorised roles, unknown actors and cross-tenant managers cannot mutate the task.
- Staff cannot cancel or requeue, but can block/resume assigned work.
- Stale expected status/replayed transitions do not add duplicate audits.
- Invalid/terminal transitions fail without state changes.
- Anon/authenticated database roles cannot invoke the service-only SECURITY DEFINER RPC with a forged actor.
- A forced audit-insert constraint failure rolls back the task status and timestamp update.
- Function grants and empty search path survive the later migration replacement.

**Not covered:** full migration replay, Supabase Auth/JWT gateway, production RLS/storage, real concurrent PostgreSQL connections/lock contention, Edge Function deployment, browser login/refresh/session changes or external integrations. PGlite is not a deployed Supabase staging environment. The stale/replay test is not a claim of full concurrent-worker safety.

### CI wiring

Both Web CI and the master Verify application workflow now run `npm run test:tasks`. The master workflow also runs `test:guards`, so these protections are not limited to the broader PR-only suite. These are workflow code changes; no new remote CI run is claimed in this report.

## Safety and acceptance status

- No production data writes, retries, deployments, migrations or environment changes.
- No new hosted infrastructure was provisioned; no service secret was retrieved.
- No new GitHub PR was opened or merged by this slice.
- No vacancy was published or hiring approval issued.
- The original screenshot incident and five-attempt timeout remain uncorrelated and unresolved.
- Staging isolation remains unestablished. A new guard does not create a staging environment.
- Final acceptance remains **0/9 verified**.

## Next gated work

1. Confirm an existing isolated Supabase project/branch, or obtain owner approval to provision one, including plan/region and any cost.
2. Configure preview-only public credentials and staging-only server secrets/integrations; verify actual browser/backend identity, not just environment-variable names.
3. Supply the incident time, endpoint/action and sanitised task/request correlation reference privately; do not supply tokens/passwords.
4. Exercise the changed client through the live staging endpoint as owner/manager, assigned staff, other staff and another tenant. Verify task and audit read-back after browser refresh/new login.
5. Test duplicate clicks, repeated task cards, response loss, simultaneous requests and workspace/session changes in a browser. Reconcile unknown outcomes before retrying.
6. Inspect incident-window runtime logs/checkpoints and diagnose the timeout separately. Only then mark relevant checklist requirements accepted with independent review.
