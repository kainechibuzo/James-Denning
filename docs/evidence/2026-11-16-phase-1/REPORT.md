# Phase 1 — Initial verification baseline

**Observed:** 2026-11-16 UTC. **Status:** partial; Phase 1 is NOT accepted.

**Source commit tested locally:** `9895abf0e4f7d6bfd871249ea125065e92f767b0`.
**Working branch:** `arena/e599cc4e-james-denning`.
**Scope:** local build/guard/audit checks, GitHub metadata, Vercel production metadata/build events, Supabase service health and bounded read-only execution-ledger queries. No production writes, deployments, migrations, retries, vacancy publication or configuration changes were performed.

[Master execution checklist](../../JD_MASTER_EXECUTION_CHECKLIST.md)

## Evidence inventory

| Evidence | Source / artifact | Result and limits |
|---|---|---|
| Latest master | `gh api repos/kainechibuzo/James-Denning/commits/master`; [master.json](master.json) | Matches tested commit at observation time |
| Five merged changes | `gh pr view <number> --json number,title,state,mergedAt,mergeCommit,url` for 80, 81, 82, 83, 85 | All returned MERGED; details in master checklist. Merges are not runtime acceptance |
| Main verification workflow | [Run 43852103514](https://github.com/kainechibuzo/James-Denning/actions/runs/43852103514); [github-verification.json](github-verification.json) | Success at tested commit; completed 10:48:49 UTC. Step metadata, not downloaded test logs |
| Worker workflow | [Run 43853711994](https://github.com/kainechibuzo/James-Denning/actions/runs/43853711994) | GitHub reports success at same commit. Does not establish that any specific job succeeded |
| Local checks | [local-checks.log](local-checks.log) | `test:guards`, `verify:web`, `npm audit --audit-level=high` all exit 0 |
| Vercel metadata | Connector `list_projects`, project `prj_py4KD4LAIbOWVblRuoQNpnHDbIjz`, request `051b5052-7500-46ea-a9cd-37231b3b5591` | Visible JD project metadata reports production READY/PROMOTED at tested commit. Unrelated projects omitted from this report |
| Vercel build | Connector `get_deployment_events`, deployment `dpl_76pNBtuB1TLJkqPjpo2erFfsp4Lx`; requests `e765af4d-060e-470b-bb5c-ca9682199a3e` and `9887f291-7879-4ff4-83c1-233cbcbd2588` | First response truncated; later time-window request returned completion events. Relevant excerpts below |
| Supabase inventory | Connector `list_projects`, request `c12824cb-0cef-45ff-90cf-784d6c7782b2` | JD project `thklwiybjuhrjqrrxyid` ACTIVE_HEALTHY; no separately named JD staging project in returned inventory. Not proof that none exists elsewhere |
| Supabase health | Connector `get_project_health`, request `2c05031f-78f8-4195-a934-fdcf13d3801c` | Auth, DB, REST and storage each healthy. Not runtime-log or RLS verification |
| Supabase branches | Connector `list_branches`, request `8acafd38-54c6-440b-870d-edae79af178d` | Empty items list for JD project; no isolated branch established by this check |
| Persisted job summary | Read-only connector SQL, request `27048ae4-0a4f-4407-be70-d9de39f60043` | 30 jobs in returned aggregate: 29 completed, 1 failed. Completion labels do not independently verify outcomes |
| Persisted failure | Read-only connector SQL, request `59c689a6-a4f2-411d-ac4e-af2ad4c045f7` | Failed job exhausted 5/5 attempts; `worker_execution_failed`; error `Signal timed out.`. Not yet correlated to the reported hiring request |

Connector observations here are manually transcribed, sanitised summaries, not raw exports. Request references identify the tool responses in the originating session; repeat the read-only checks to independently verify them. No personal records, tokens or raw conversation payloads are included.

## Local test scope

- Node `v22.22.3`, npm `10.9.8`; `npm ci --no-fund --no-audit` succeeded.
- `npm run test:guards`: all 15 reported assertions passed. These tests stub fetch and prove the verification scripts fail closed; they **do not test live tenant isolation or live Edge Functions**.
- `npm run verify:web`: 1,822 modules transformed; 5 landing-button checks, 11 link checks, 47 JS chunks; module entry approximately 9 KB / 4 KB gzip. These are build/static assertions, not browser journeys.
- `npm audit --audit-level=high`: reported zero known vulnerabilities at observation time. Not a security audit or guarantee of no vulnerabilities.
- Build warnings remain: CommonJS/ESM Vite config compatibility warning and a spreadsheet vendor chunk of approximately 1,792.75 kB / 574.22 kB gzip. Install also emitted dependency deprecation warnings.
- No real frontend environment credentials were supplied for the local build. It is not a credentialed runtime test or an inspection of production bundle contents.
- Deno is not installed locally. The main GitHub workflow reports success for arithmetic tests, Connect execution evidence tests, MCP security-contract tests and MCP type checks. The full Deno suite was not rerun locally.

## Production deployment evidence

Vercel metadata identifies production deployment:

- ID: `dpl_76pNBtuB1TLJkqPjpo2erFfsp4Lx`
- Commit: `9895abf0e4f7d6bfd871249ea125065e92f767b0`
- State: `READY`, substate `PROMOTED`, target `production`
- Deployment URL: `https://james-denning-n62ff0pp3-james-projects-57651351.vercel.app`
- Production alias in returned metadata: `https://james-denning-james-projects-57651351.vercel.app`

Selected build event excerpts (timestamps are provider Unix milliseconds):

```text
1794826100418  Cloning github.com/kainechibuzo/James-Denning (Branch: master, Commit: 9895abf)
1794826105234  > james-denning@1.0.0 build:web
1794826106744  1822 modules transformed.
1794826107418  built in 1.83s
1794826107621  Build Completed in /vercel/output [4s]
1794826108953  Deployment completed
```

Vercel runs `build:web`, not the entire verification suite. Build completion and promotion do not prove login, served CSP, live task updates or absence of privileged secrets in deployed assets.

## Findings requiring action

### F1 — Staging isolation is not established (blocks write-based tests)

Visible Vercel project metadata contains the same Supabase URL and anon-key environment entries targeted to both `production` and `preview`. Values were not decrypted. This is a shared-environment configuration risk; this inspection did not prove what backend every deployed preview actually contacts or whether another override exists.

No JD database branches were returned, and the accessible project inventory did not identify a separate JD staging project. Therefore no preview is approved as a safe test sandbox based on these observations.

**Next:** Confirm or provision an owner-approved isolated staging project/branch, configure preview-only public credentials, deploy reviewed functions/migrations with staging-only server secrets, and verify the actual browser/backend project identity before any mutations. Do not automatically provision paid infrastructure or change production settings. Follow [STAGING_SETUP.md](../../../documentation/STAGING_SETUP.md).

### F2 — Persisted execution timeout exhausted retries

The bounded failed-job query returned one failure:

```text
status: failed
attempt_count: 5
max_attempts: 5
last_error_code: worker_execution_failed
last_error_message: Signal timed out.
created_at: 2026-11-15 17:39:19.190674+00
updated_at: 2026-11-15 21:24:58.932726+00
```

The aggregate also includes one completed job retaining `worker_execution_failed` with a highest attempt count of two, and 28 completed jobs without an error code. These are stored states, not independent outcome validation.

**Not established:** whether the failed job is the hiring request, which step timed out, which partial side effects occurred, or whether a retry is safe. No job was retried or altered.

**Next:** Correlate the authorised task/run/request reference and time window; inspect bounded attempt, checkpoint and audit records plus runtime logs; reproduce the timeout in staging; verify compensation/idempotency before considering retry.

### F3 — Authenticated task-update failure is not reproduced

The supplied message describes a screenshot failure but contains no actual task-error screenshot, request time or correlation ID. No root cause can be concluded from that description.

Source inspection found existing infrastructure that must be evaluated before replacement:

- `supabase/functions/jd-automation/index.ts`: `operations.task.transition` validates role, tenant-scoped lookup and transition, invokes `jd_transition_operational_task`, and requires persisted task/audit evidence before returning success.
- `supabase/migrations/20261113200345_jd_atomic_operational_task_transition.sql`: existing atomic transition/audit contract.
- `supabase/migrations/20261111085150_jd_durable_execution_jobs.sql`: existing queue/ledger, idempotency, worker leases and attempt limits.

These are code observations, not proof of deployment, correct permissions or a successful authenticated request. Inspect the client request path, session JWT, endpoint deployment, profile/tenant mapping, action-specific role policy, database grants/constraints and response handling. Test manager and assigned-employee paths separately. Do not attribute the failure to the public pre-auth request helper merely because it uses an anon token.

### F4 — CI coverage is split; logs are not fully inspected

`.github/workflows/verify.yml` runs on master and contains the narrower checks shown in the saved run metadata. `.github/workflows/ci.yml` has a broader suite but excludes master pushes (it runs for applicable PRs/other branch pushes). The successful master workflow is therefore not evidence that every test in the repository ran on that exact merged commit.

Attempts to fetch the two GitHub run logs failed with EOF at the Actions log-download host, outside this sandbox's allowed outbound hosts. Run/step metadata was retrieved successfully. Do not treat unavailable log content as inspected or infer test counts from it.

### F5 — Documentation contains stale security guidance

The README previously claimed a browser `supabaseSrv` service-role client should be used for RLS bypass. Current `src/supabaseClient.js` instead uses the public client and contains a runtime guard against a frontend service-role environment variable. The README instruction is corrected in this documentation change.

A runtime throw does **not** prove a secret cannot enter a compiled bundle: browser safety still requires build-time environment controls and inspection of actual deployment artifacts. P1-14 remains open. No claim is made here that secrets were exposed or that production bundles are clean.

## Phase 1 coverage and remaining gates

| Checklist ID | Status in this pass | Required remaining evidence |
|---|---|---|
| P1-01 | Partial: master and selected Actions metadata verified | Review relevant broader-suite results and available logs; reconcile required checks |
| P1-02 | Partial: production commit/state and build completion confirmed | Live browser smoke, served headers and routes |
| P1-03–04 | Not exercised live | Login/logout/refresh/expiry and role/tenant positive/negative tests |
| P1-05–06 | Not exercised live | Launch-checklist duplicate/concurrent replay; non-empty batch/tenant isolation fixtures |
| P1-07 | CI step success only | Browser formula tests under deployed-equivalent CSP |
| P1-08–09 | Not exercised | Promotion/broadsheet malicious-value fixtures and browser print assertions |
| P1-10–12 | Partial ledger inspection; failure exists | Correlate hiring/task-update incidents, attempts, checkpoints and actual persisted effects |
| P1-13 | Blocked by available tooling | Supabase runtime logs: current connector exposes no runtime-log retrieval tool; obtain a sanitised authorised export for the incident window |
| P1-14 | Unverified | Scan actual served bundles, sourcemaps/public assets and build environment controls without disclosing secrets |
| P1-15 | Blocked: isolation not established | Verify preview/staging backend and all integrations use isolated non-production resources |

The sandbox's outbound host restrictions prevent direct production-browser/backend testing here. No credentials were requested or retrieved to work around that limitation. Health APIs and SQL management access do not substitute for an authenticated browser journey.

## Reproduction queries (read-only)

Run only with authorised access to the intended project. These queries inspect persisted status and bounded error text; they do not establish that every recorded completed job produced a verified outcome. Redact any sensitive text before sharing results.

```sql
select status, last_error_code, count(*) as job_count,
       max(attempt_count) as highest_attempt_count,
       max(updated_at) as latest_update
from public.jd_execution_jobs
 group by status, last_error_code
 order by latest_update desc
 limit 30;

select status, attempt_count, max_attempts, last_error_code,
       left(last_error_message, 800) as error_excerpt, created_at, updated_at
from public.jd_execution_jobs
where status = 'failed'
order by updated_at desc
limit 5;
```

## Handoff / next acceptance evidence

1. Owner + engineering: confirm isolated staging before any write-based test.
2. Owner/support: supply the incident timestamp, endpoint/action and sanitised request/task correlation reference through an appropriate private channel; never supply passwords or tokens.
3. Engineering: correlate timeout and task-update reports separately, establish a failing regression test, then implement the smallest demonstrated fix.
4. QA/security: verify persisted state + audit, refresh, forbidden roles/tenants, concurrent updates, timeout/recovery and duplicate suppression.
5. Independent reviewer: review the evidence and update only the specific accepted checklist items. **No final scorecard item is accepted by this baseline.**
