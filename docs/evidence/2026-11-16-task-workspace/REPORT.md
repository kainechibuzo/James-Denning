# Chat task state and read/write reconciliation

**Date:** 2026-11-16 UTC. **Branch:** `arena/e957ec46-james-denning`.
**PR:** [#88](https://github.com/kainechibuzo/James-Denning/pull/88), extended after the user's request to continue.
**Preceding commit:** `303d375b15c35e51bb18843849e4ee92e41a87ee` (departmental navigation/account-switching slice).

## Observed gaps

- `JDVisualWorkspace` previously enabled persistence whenever an item had any string ID and a callback. IDs alone did not establish a saved task.
- Local checkbox ticks and `status: completed` from advisory content contributed to the same completed-task count. Read-only saved cards could fall back to local completion if no mutation callback was provided.
- Conversation snapshots supplied historical statuses. A successful update changed only the mounted message state, so reopening history could show an old status despite a committed task transition.
- The shared transition client already required matching task/status plus an atomic audit acknowledgement, but chat still allowed another click after an uncertain response without actually reconciling the saved record first.

## Applied changes

### Separate local work from persisted records

- Advisory/local checklist ticks are explicitly labelled local-only, with no saved record confirmed. They never call a mutation and never count as saved-record completion, even when the model supplies a UUID or `completed` status.
- A server-origin `persisted_workspace_records` marker plus a UUID identifies a **candidate** saved-task card, not proof of persistence or authorisation. Controls remain disabled until an authenticated task-list read returns that record.
- Malformed saved IDs, missing/out-of-sample records, failed reads and unsupported roles stay non-writable; none falls back to a local saved-task tick.
- Returned records replace historical title/description/status in the card. Cancelled records remain cancelled, not pending/failed/startable. Completion is labelled **Record complete**, with a persistent warning that checklist progress is not approval or verified external execution.
- Evidence references move behind the existing Show details control. This hides reference fields by default, not every possible identifier embedded in arbitrary text.

### Authorised reads and scoped state

- Owner/admin/manager use the existing `operations.task.list` action. Staff/contractor use `operations.task.list_mine`. Viewer uses `operations.task.list_readonly`. Unknown roles issue no read. Contractors/viewers never get a mutation control.
- The server still derives identity, organisation and assignment from authentication. No tenant ID or forged actor is passed to these actions; no API/RLS/role grant is changed.
- Reads validate the response structure, UUIDs, known statuses, titles and duplicate IDs. Errors shown to users do not expose raw server diagnostics.
- One controller serves all repeated cards for the visible task set. It refreshes on initial card loading, conversation/account/role/workspace changes, new task IDs, or the explicit Refresh task records action. It is not a polling/live-monitor claim.
- The chat shell remounts on organisation/account/role changes, clearing old chat/local tick state. Task-controller generations ignore late responses from a previous scope. Latest-read versioning prevents older reads from overwriting a newer refresh.
- New task cards appearing during a write do not reset its synchronous duplicate-click lock. Their automatic read waits until pending writes settle.
- Department summaries and execution evidence remain historical conversation snapshots; the refresh explanation explicitly says that only task records are read back.

### Mutation acknowledgement and reconciliation

- Start/resume/complete is allowed only for a returned task in the legal checklist subset. No optimistic status/count change is made.
- The existing strict transition client still checks task ID, requested status, `auditRecorded: true` and a UUID audit ID. Confirmed updates propagate to repeated cards through shared state and show an audit-evidence acknowledgement.
- Failed/missing/mismatched acknowledgements leave the previous status visible, mark the outcome unconfirmed, and disable another attempt until a successful read reconciles the record. No mutation is automatically retried.
- Refresh is blocked while writes are pending. Independent task writes retain separate guards and merge their acknowledgements without dropping one another's state.
- A full remount/history reopen reads actual task records again instead of trusting status fields saved inside older chat messages. An audit acknowledgement from this session is not fabricated on read-back.

## Validation

Node **v22.22.3**, npm **10.9.8**. Existing dependencies only. No credentials, remote database writes or live external actions used by tests.

| Command | Result | Evidence |
|---|---|---|
| `npm ci --no-fund --no-audit` | Pass; existing dependencies only | [install.log](install.log) |
| `npm run test:tasks` | **104 passed, 0 failed** | [task-tests.log](task-tests.log) |
| `npm run test:navigation` | **73 passed, 0 failed** | [navigation-tests.log](navigation-tests.log) |
| `npm run test:guards` | **43 PASS assertions**, stubbed network | [guard-tests.log](guard-tests.log) |
| `npm run verify:web` | Pass; 1,830 modules, 47 JS chunks; entry ~9 KB / 4 KB gzip | [web-build.log](web-build.log) |
| `npm run build:mobile` | Pass; regression build, not proof native mobile uses this chat shell | [mobile-build.log](mobile-build.log) |
| `npm audit --audit-level=high` | Zero known vulnerabilities reported | [audit.log](audit.log) |
| `git diff --check` | Pass | No whitespace errors |

The task suite consists of the existing **37 client + 20 isolated PostgreSQL tests**, **29 new record-client/controller tests**, and **18 UI/wiring tests** (17 mount the real React card/hook in jsdom; one checks shell integration). The mounted tests compile actual JSX using the installed Vite transformer, not a copied DOM representation. Both CI workflows already invoke the expanded `test:tasks` command.

New scenarios include all supported read roles; malformed responses; no-ID/arbitrary-ID/UUID drafts; denied mutation roles; stale/cancelled snapshots; audit reference visibility; repeated cards/double clicks; unknown write results; simulated committed write with lost response; explicit read reconciliation; independent writes; late responses; new cards during writes; React StrictMode; and a synthetic queued → in-progress → completed → remount/read-back journey.

Known non-blocking build warnings remain: Vite module-format compatibility and the spreadsheet-vendor chunk size.

## Limits and remaining gates

- **Synthetic server/PGlite/jsdom results are not production acceptance.** No authenticated browser/device or live Supabase read/write/refresh journey was executed. Deployment of this new commit must be checked separately.
- Existing list endpoints are bounded (up to 250 manager/viewer records, 100 assigned records). A record outside the returned sample remains unconfirmed/non-writable. A targeted authenticated record endpoint or pagination is future work; the UI does not falsely label an omitted task deleted.
- The source marker is a rendering contract, not a security boundary. Backend policies remain authoritative. Owner availability in the wider shell, the complete role matrix and backend enforcement review are still open.
- Scope changes do not cancel an already-dispatched server mutation. They prevent its response from updating another scope; future reads reconcile its result.
- This slice hardens **chat task cards**, not every create/assign/retry button on `JDOperationsPage`, approvals, hiring or all other workflows. It does not resolve the original production task incident or worker timeout.
- No mutation endpoint, migration, production record, approval or vacancy publication was changed. Genuine staging isolation remains unestablished.
- Implementation/test progress is recorded for the Phase 2/4 task-and-evidence interface. The mission scorecard remains **0/9 verified**. Next acceptance requires an isolated environment, authenticated representative roles, real browser journeys, and independently queried task/audit evidence.
