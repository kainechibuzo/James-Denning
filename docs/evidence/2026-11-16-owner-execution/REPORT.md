# Owner access, verified identity and execution reliability

**2026-11-16 — implementation on `arena/a32a0393-james-denning`, based on `f37ee68e4443cca3e194537c0914f20d73aac688` (merged PR #90). Not deployed; no acceptance gate signed off.**

Delivery owner for this engineering slice: Arena coding agent. Independent reviewer: unassigned. Local environment: Node/PGlite/React-jsdom, synthetic identities and records. No production writes, migration applications, retries, credential retrieval, legal/financial decisions, hiring or publication.

## Demonstrated gaps and repairs

### 1. Owner Operations access (P2-A01/A08/A09)

The backend role matrix and `jd-automation` already recognise owners, but the sidebar, route and Operations page excluded them. This branch adds only two explicit owner navigation destinations: JD Assistant and Tasks & Operations, for business and education layouts. It does **not** alias owner to admin or grant every legacy route.

The page uses the same owner/admin/manager distinction as existing backend actions. Owners/admins see administration tabs; managers do not. The route requires both recognised role and the existing navigation permission decision. A directly mounted forbidden-role page does not load records.

Owner override reads now address the authenticated profile ID, not an undefined staff/student ID. Navigation remains closed until both role and user override reads succeed for the current actor/workspace. Malformed/error responses are not converted to empty permissive data. Cleanup ignores results belonging to an earlier identity. Explicit denies remain effective; the legacy catalogue and existing role route sets are retained.

This is **not** complete owner access to every product module, a new capability architecture or department-scoped manager enforcement. Backend policies, not menus, remain the authority.

### 2. Fail-closed account activation (P1-03/P7-05)

The previous activation code used `profile.role || "admin"`. The new identity helper refuses absent/unsupported roles and mismatched authenticated-user/profile/workspace IDs before cached identity or selected-workspace writes. Valid roles are preserved exactly, not elevated.

Restored sessions now call Supabase `getUser()` and require its user ID to match the session before profile/workspace reads. Teacher/student enrichment reads also explicitly constrain the selected workspace. Mounted bootstrap tests demonstrate valid owner activation and denial before persistence for missing roles, identity mismatches and rejected session verification.

This is not an end-to-end auth audit: expiry, token rotation, cross-tab logout, recovery/invite flows and physical browser/mobile sessions still require isolated live acceptance.

### 3. Trustworthy execution monitor and deliberate controls (P4-L/E)

The older Operations “JD Runs” view displayed raw diagnostics and treated any non-error response as retry/cancel success. It is replaced with a dedicated controller/view using the **existing deployed API contracts**:

- Read-before-write; validated run/job/step identities, allowed states and relationships. Bounded sample limits are explicit; absent history is not proof a run never existed.
- Owner/admin retry/cancel only; manager history remains read-only. Retry is offered only when job and run are failed. Running-job cancellation is not offered.
- Explicit confirmation warns that retry may repeat external effects and cancellation does not undo earlier effects. No write occurs from opening the confirmation.
- Synchronous duplicate-click lock, no optimistic success, no automatic write retry, and explicit refresh after lost/incomplete acknowledgement. Pending locks survive tab switches and header refresh; identity changes ignore late replies.
- Retry validates job/run/queue-message acknowledgement, then observes the persisted job (which may already have advanced). Cancellation requires matching cancelled job and run read-back. Partial cancellation stays unconfirmed.
- Job and run states are displayed separately; discrepancies are not hidden. Neutral tool descriptions, collapsed diagnostic IDs, whitelisted UI state and generic error notices replace raw provider errors and result payloads.
- No audit-verification claim: the existing cancel endpoint does not acknowledge an audit ID and is not fully transactional. That backend limitation remains open.

The execution monitor no longer depends on loading unrelated overview/intelligence data. Existing creation/assignment queue mounting is preserved. **`TASK_ASSIGNMENT_RELEASE` remains `legacy`; audited assignment is not enabled.**

### 4. Reproduced retry SQL defect and staged repair (P3-E08/P4-T06/T07)

A real isolated PostgreSQL regression reproduces error **23502**: the existing `jd_requeue_failed_execution_job` writes `result_json = NULL` while the repository's run table declares that field NOT NULL. This rolls back the retry, including its synthetic queue write. This finding is **not** attributed to the original hiring screenshot incident; that request remains uncorrelated.

Migration `20261116210000_jd_retry_run_integrity.sql`:

- Preserves owner/admin service-only authority, locks the actor profile and existing job/run records, and requires tenant agreement between job and run.
- Requires the run itself to be failed before retry, preventing overwrite of approval/running/completed states when job/run records disagree.
- Resets `result_json` to `{}` instead of NULL, retaining the established response contract.
- Keeps job/run reset, queue send and audit insertion in one transaction. Local tests prove rollback on audit and queue failures and reject lost-response replay after a successful requeue.
- Emergency rollback disables the service RPC without deleting records or restoring the known-broken definition; reviewed reapplication restores its grant.

**This migration has not been applied to Supabase.** The frontend works with existing endpoint contracts and shows honest failure if an old backend rejects a retry. A code merge is not a runtime retry repair. Existing attempt counters/results are reset by this RPC design; complete historical retry-attempt retention and universal external-effect idempotency are still gaps.

## Validation and evidence boundaries

Final local results on 2026-11-16: **489 Node tests passed, zero failed, plus 43 verification-guard checks passed.**

| Command | Result | Evidence |
|---|---|---|
| `npm run test:execution` | 97 passed | `execution.log` |
| `npm run test:navigation` | 106 passed | `navigation.log` |
| `npm run test:tasks` | 250 passed | `tasks.log` |
| `npm run test:history` | 23 passed | `history.log` |
| `npm run test:checklist` | 13 passed; 222 entries consistent, 0 verified | `checklist.log` |
| `npm run test:guards` | 43 checks passed | `guards.log` |
| `npm run verify:web` | Passed; 5 landing buttons, 11 links, 46 JS chunks | `verify-web.log` |
| `npm run build:mobile` | Passed | `build-mobile.log` |
| `npm run build` | Passed | `build.log` |
| `npm audit --audit-level=high` | 0 reported vulnerabilities | `audit.log` |
| `git diff --check` | Passed | `diff-check.log` |

Local logs contain synthetic records or build output; trailing whitespace is normalised for Git hygiene. `SOURCE_SHA256SUMS.txt` identifies changed application, test, migration and CI sources plus the dependency lockfile tested before commit. Older initial-run logs are retained as intermediate evidence, not the final counts. Builds retain nonblocking Vite/module/chunk-size warnings. The dependency audit is not a complete security audit. Deno was not installed locally; the repository's Deno suites must pass in remote CI before merge.

Owner navigation helper and route-source tests are not a fully mounted AppDemo or authenticated browser test. Review also found permissive reconstructed permission-table policies (`000b_permissions_tables_RECONSTRUCTED.sql`, `USING (true)`). This branch does not repair those historical policies or establish what is currently deployed: a live policy inventory and isolated cross-tenant denial tests remain required. Navigation overrides are not an API security boundary.

The endpoint suite executes the actual `jd-automation` request handler with an injected authenticated client and synthetic database adapter, testing direct requests independently of UI menus. It covers actor/body spoofing, manager-own-run and tenant filters, denied roles, retry error mapping, cancellation conflicts and session denial. It does **not** validate deployed JWT, PostgREST or RLS.

The SQL suite executes actual repository table and RPC definitions in migration order in PGlite. `pgmq.send` is represented by a transactional local-table test double, not the real extension. Tests prove the SQL constraint/authority/rollback behaviour in this harness, **not** live queue delivery, full migrations, multi-connection locking or Supabase extension configuration.

## Release gates and remaining work

1. Review and deploy the frontend separately if approved. No new Edge action is required; assignment stays on the prior release's legacy path. Backend deployments are explicitly dispatched, not automatic on merge.
2. Establish genuinely isolated staging before retry migration tests. Never substitute a production tenant or an unrelated project. Reconcile legacy migration-version history rather than blindly pushing all pending migrations.
3. Rehearse this migration with real pgmq, nonempty two-tenant fixtures, owner/admin/denied roles, job/run state disagreements, audit failures, concurrent retries and rollback. Retain record/queue/audit evidence and independent review.
4. Only then approve the targeted production migration. Do not deploy the pending checked-assignment handler unintentionally while the shipping assignment mode remains legacy.
5. Continue department-specific authority, independent outcome verification, safe cancellation transactions, full session lifecycle, recovery rehearsals and business readiness gates. The 222-item plan and all 9 final acceptance criteria remain unverified; this work is not a NaijaHaul launch authorisation.
