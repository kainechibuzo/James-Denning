# Task creation recovery and assignment confirmation

**Date:** 2026-11-16 UTC. **Branch:** `arena/0d992dc9-james-denning`.
**Base:** `45e01d48edd06a3fbf258094067bdcd560939a6d` (merged PR #88).
**Scope:** Harden the Operations task queue outside chat. No backend migration or endpoint deployment is included.

## Findings

- The creation RPC already enforces `(school_id, idempotency_key)` uniqueness, compares the submitted fields on replay and returns the original creation audit. The form discarded that protection by generating a new ID on every Add click and accepting any non-error response.
- Manual assignment returns `{task: {id, assigned_to, status}}` after a tenant-filtered update. It does **not** insert an atomic assignment audit or return an audit acknowledgement. This slice cannot truthfully claim audited manual assignment.
- The Operations tab's Auto assign button referred to an undefined `autoAssignTask` function. The existing auto-assignment endpoint/RPC returns an assignment result or a no-capacity result.
- Generic action state relied on asynchronous React `busy` updates, and the assignment select was not disabled during requests. Unknown outcomes were not reconciled before another write.

## Implemented

### Task creation

`src/chat/operational-task-writes.mjs` normalises and validates task fields before dispatch, rejecting overlength/invalid content rather than silently truncating it. A creation attempt consists of an immutable normalised payload and one UUID.

The attempt is written and read-verified in **sessionStorage before the first network mutation**, under an organisation/authenticated-actor key. The UI discloses this per-tab retention. Reload/remount in the same browser session restores an unresolved attempt. The recovery action resubmits that same payload and ID explicitly; there is no automatic mutation retry and no fresh key for an unresolved attempt.

A success requires a valid task UUID, matching organisation, creator, server idempotency key, all submitted fields (including due-date instant), legal status, explicit reuse flag, `auditRecorded: true` and a UUID audit ID. A reused task may already have progressed; a newly created one must be queued. Missing/mismatched evidence leaves recovery intact. A legacy reused record without a creation audit is **not** promoted to confirmed success.

The form clears only after confirmed evidence and successful recovery-record cleanup. Storage denial, corruption, changed/deleted unresolved recovery data or failed cleanup do not silently rotate the identity. A synchronous lock prevents repeated submits. The request payload shown during recovery cannot be edited into a different request.

### Assignment and queue actions

Manual assignment validates the returned task ID, assignee and status, then independently reads the authorised task list and requires the same saved assignee. Auto assign now calls its real endpoint, validates the result and also reads back successful assignments. No capacity is explicitly **No assignment made**, not success. Raw backend failure reasons are not displayed.

A failed or uncertain assignment/transition blocks further changes to that task until an explicit successful read refresh. There is no optimistic assignee/status change and no automatic write replay. Assignment success says **record read-back confirmed**, not audit verified. Existing strict transition acknowledgements are preserved for Start, Requeue and Complete record, with a warning that checklist completion is not proof of external execution.

### UI integration

- `src/pages/jd-task-queue.jsx` provides the real creation/recovery form and queue. The component is tested mounted in React/jsdom, not as a DOM replica.
- It owns authenticated task/team reads, so unrelated intelligence/hiring read failures do not govern its save acknowledgements.
- Confirmed task-list changes update the parent overview. The panel stays mounted after first use to preserve unsubmitted drafts and in-flight locks when switching tabs; reopening refreshes the queue without recreating tasks. Header refresh does not unmount it.
- The Operations page remounts on organisation/account/role changes. Controller generations ignore late responses from a previous scope. An in-flight server request is not cancelled; an unresolved create retains its recovery record for later replay.
- Existing route visibility is unchanged. The wider owner-role navigation gap, role model and backend authorisation review are not silently widened by this work.

## Validation

Node **v22.22.3**, npm **10.9.8**. Existing dependencies only. Test data and responses are synthetic; no production credentials or data mutations were used.

| Command | Result | Evidence |
|---|---|---|
| `npm ci --no-fund --no-audit` | Pass | [install.log](install.log) |
| `npm run test:tasks` | **167 passed, 0 failed** | [task-tests.log](task-tests.log) |
| `npm run test:navigation` | **73 passed, 0 failed** | [navigation-tests.log](navigation-tests.log) |
| `npm run test:guards` | **43 PASS assertions**, stubbed network | [guard-tests.log](guard-tests.log) |
| `npm run verify:web` | Pass; 1,832 modules, 47 JS chunks; entry ~9 KB / 4 KB gzip | [web-build.log](web-build.log) |
| `npm run build:mobile` | Pass; regression build, not proof the native shell uses this panel | [mobile-build.log](mobile-build.log) |
| `npm audit --audit-level=high` | Zero known vulnerabilities reported | [audit.log](audit.log) |
| `git diff --check` | Pass | No whitespace errors |

The 167 task tests retain the preceding 104 tests and add:

- **12 isolated PostgreSQL creation tests**, applying actual repository RPC definitions/grants in migration order: owner/admin/manager replay creates one task and one original audit; payload conflicts reject without writes; keys are tenant-isolated; staff/finance/viewer and direct anon/authenticated execution are denied; failed audit insertion rolls back creation; legacy replay without audit does not invent evidence.
- **38 client/controller tests**: exact acknowledgement matching, role/input guards, sanitised errors, persist-before-send, double-click protection, same-request remount/retry, storage failure/corruption/cleanup, scope isolation, missing/overwritten read-back, auto-assignment outcomes and reconciliation.
- **13 UI/wiring tests**, including 12 real mounted queue tests: create/reset, pending locks, recovery after remount, persistent storage-error explanation, manual/auto assignment, Start/transition audit checks, account switch, parent overview updates and unsubmitted-draft preservation across tab changes.

One mounted regression initially exposed a recovery-storage error being cleared by the queue refresh. Recovery errors now have independent persistent state; the final suite passes. Both CI workflows already run the expanded `test:tasks` script. Build warnings remain for Vite config module format and the spreadsheet-vendor chunk.

## Boundaries and next gates

- **Not live acceptance:** no authenticated browser/device, live Supabase creation/assignment, deployed RPC inspection or production task/audit read-back occurred in this slice. PGlite is isolated PostgreSQL, not a full Supabase migration/RLS rehearsal or concurrent-connection test.
- **Manual assignment remains a backend audit gap.** It is a last-writer update without an expected-assignee compare-and-swap or atomic audit insert. Read-back confirms one observed saved state; another actor can change it later. Add an audited transactional assignment RPC and concurrency tests in a separately reviewed slice.
- **Recovery is per tab/session**, not a cross-device durable job. Closing the tab, clearing browser storage or starting a new independent tab may lose or bypass its recovery record. The UI warns not to create a replacement while uncertain. Corrupt or irreconcilable requests require administrator review before clearing recovery data; no unsafe discard-and-recreate shortcut is supplied.
- The recovery record contains submitted task details and an idempotency ID, **not tokens**. It is same-origin browser storage, not encrypted storage or a security boundary. It is removed on confirmed creation; access to the real task remains backend-enforced.
- Existing task/team list endpoints are bounded. Out-of-sample read-back cannot confirm an assignment. Targeted record reads/pagination remain future work.
- No automatic mutation retries, request cancellation or new timeout policy is introduced. Delayed requests keep actions pending rather than pretend failure/success. Other workflow/hiring/recurring-schedule actions remain outside this slice.
- No backend grants, migrations, approvals, hiring publication, production data or NaijaHaul launch gates were changed. Genuine staging isolation and original worker incidents remain open. Mission acceptance stays **0/9 verified**.
