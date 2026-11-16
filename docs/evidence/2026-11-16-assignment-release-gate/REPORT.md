# PR #90 — safe-merge assignment release gate

2026-11-16. Follow-up to `b50aa51f8740c6dae9ee5b291f174698f2f5cf7b` on `arena/dfc4b866-james-denning`.

## User decision and scope

After the merge request, the dependency risk was disclosed: the ungated frontend would call assignment APIs that were not deployed. The user selected **“Make the merge safe first (recommended)”**: gate the new flow, rerun checks, then merge. This authorises that merge, not production test writes, backend migrations or activation of checked assignment.

This update supersedes the original hold on merging the entire PR. It does **not** supersede staging, independent review or coordinated backend rollout requirements for the new assignment contract.

## Shipping behaviour

- `TASK_ASSIGNMENT_RELEASE = "legacy"` is an explicit, source-controlled release switch, not a permission boundary. No environment-variable change, network probe, error-triggered switch or automatic migration enables it.
- The production queue passes no override and therefore preserves PR #89 behaviour: manual `operations.task.assign`, existing auto-assignment, and authorised bounded-list read-back. Its existing limitations remain: manual assignment does not have atomic audit/CAS, and a record outside the bounded sample cannot be confirmed. UI does not claim audit verification.
- Existing creation recovery, status transitions, synchronous write locks and read reconciliation remain unchanged. The default path never calls `operations.task.assign_checked` or `operations.task.get`.
- Explicit `checked` mode retains all prior audit/version/exact-read checks. Any write error, unsupported action, incomplete acknowledgement or failed read-back remains unconfirmed. **No automatic fallback to legacy after any checked request.**
- Both release modes enforce client role/ID checks; backend authentication, tenant checks and database policies remain the authority. Invalid modes dispatch no request.
- `JDTaskQueue` accepts a mode prop for isolated tests; the actual operations page supplies none. It is not an end-user feature control. Controller lifecycle guards also apply when a test changes its scope.
- Supabase deployment remains explicitly dispatched, not triggered by master pushes. The new RPC migration/edge handler is not deployed by this frontend merge.

## Validation

- `npm run test:tasks`: **250/250 passed**, including 19 additional release-gate tests. Tests cover legacy manual/auto read-back with the default controller and mounted queue; disabled new endpoints; no-capacity; role and invalid-mode denial; uncertain legacy outcomes; explicit checked success; no downgrade or duplicate write after checked failures; and the manual backend-release workflow contract.
- `npm run test:history`: **23/23 passed**; [history.log](history.log).
- `npm run test:navigation`: **73/73 passed**; [navigation.log](navigation.log).
- `npm run test:checklist`: **13/13 passed**; [checklist.log](checklist.log).
- `npm run test:guards`: **43 assertions passed**; [guards.log](guards.log).
- `npm run verify:web`: passed, 47 chunks, 9 KB entry / 4 KB gzip; [web.log](web.log).
- `npm run build:mobile`: passed; [mobile.log](mobile.log).
- `npm audit --audit-level=high`: zero known vulnerabilities at observation; [audit.log](audit.log). Existing Vite configuration/spreadsheet chunk and dependency warnings remain nonblocking.
- Task results: [tasks.log](tasks.log). Source identity: [source-manifest.json](source-manifest.json). Log trailing whitespace was normalised for Git hygiene; results were not changed.
- No authenticated live assignment or new Supabase deployment was performed. Mocked endpoint compatibility and local SQL/UI tests do not establish live acceptance.

## Read-only environment observation

Supabase `list_edge_functions`, request `70622aa0-ec90-419c-b8f6-d419a3e9349f`, reported `jd-automation` ACTIVE, version 11, updated_at `1794751204456`, bundle hash `dce0e03796daf4c4a9a4048ce11fb769036edfc2873247727a9a1f1547d61444`. Its source body was not returned. This records metadata only, not successful live assignment or a source-code verification. No credentials or secrets were fetched.

## Later activation — not part of this merge

1. Establish approved isolated staging and fixtures; review/rehearse the RPC migration, handler, two-client stale-version conflicts, audit rollback and lost-response behaviour.
2. Verify role/tenant denial and cached-client compatibility. The staged backend intentionally retires the legacy endpoint; deploying it while the shipping client stays legacy would break assignment. Coordinate that change explicitly; do not blindly deploy all functions from master.
3. Obtain release approval, deploy the reviewed migration/backend in the approved sequence, and promote a separately reviewed frontend change setting the release switch to `checked`. Account for old cached clients receiving refresh-required responses.
4. Until then, retain the legacy switch and truthful non-audit UI. The new SQL and handler being merged is not deployment or acceptance.

No checklist item is checked by this release gate. Original evidence/source hashes remain historical; the follow-up manifest identifies this update.
