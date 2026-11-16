# Phase 2 — departmental navigation and account access

**Date:** 2026-11-16 UTC. **Branch:** `arena/e957ec46-james-denning`.
**Base:** `7d38797d3bdf4988ccbb56cae1e5f528be7d200c` (merged PR #87).
**Scope:** A bounded continuation of Phase 2, not completion of the business OS or permission architecture.

## Previous delivery verification

Before this slice, production deployment metadata for PR #87 was checked through the connected Vercel service:

- Deployment `dpl_ASSokBXnp8irZYUnoYDshsaYDQwY`, production, **READY / PROMOTED**.
- Git SHA exactly `7d38797d3bdf4988ccbb56cae1e5f528be7d200c`; no alias error reported.
- Connector request `3ee571ef-2e8f-4c24-ab9a-b4344309c9c0` (read-only).
- GitHub master Verify run [43921348847](https://github.com/kainechibuzo/James-Denning/actions/runs/43921348847) **success** at the same SHA. [Saved metadata](pr87-postmerge-verify.json).

This is deployment metadata, not an authenticated production journey. It verifies the preceding PR, not this branch's new code.

## Applied changes

- Business navigation leads with JD Assistant, Business Overview and Tasks & Operations. The overview remains restricted to its existing roles; no manager/owner grant is invented.
- Existing destinations sit in People & Recruitment, Operations, Finance, Reports & Analytics, Communications, Approvals & Access, and Organisation. Empty groups are omitted. Headers derive from permitted children, fixing the former missing manager/teacher headers.
- Business groups start collapsed except the active route's group. Navigation from another page or tour expands its destination group. Search temporarily expands matching results; the icon rail keeps routes reachable. Education workspaces retain their original labels, route order and expanded defaults.
- The ambiguous Team/People links become **People directory**, **Member records**, and **Staff records**, together with Recruitment. These are distinct existing modules, not aliases to be deleted. `members.jsx` combines both record types and bulk/account actions; `students.jsx` and `teachers.jsx` retain specialist record, allocation and section workflows. This is navigation consolidation, not a completed data/workflow merger.
- Billing destinations are together in Finance. Permissions, Organisation Settings, Admin Tools and Register organisation sit together. Business Settings moves from duplicated device-specific header controls to one searchable sidebar destination; the education shortcuts remain. The settings tour now opens the actual settings route and anchors to the common navigation control.
- Profile and labelled sign-out remain reachable in full, mobile and icon-rail navigation. A Switch organisation control is available above search.

No placeholder Commercial, Fleet, Compliance or Integrations destinations were created. Underlying pages still contain some education terminology; broad module-level copy and workflow changes remain pending.

## Switching is deliberately reauthentication, not arbitrary tenant selection

`App.jsx` currently restores the organisation from `profiles.school_id`; it does not expose an authorised multi-membership chooser. Simply clearing local selected-school storage would restore the same organisation on reload.

The new control opens a labelled, keyboard-contained dialog explaining unsaved-work risk and the need to sign into the account linked to the desired organisation. Cancel does not sign out. Confirmation calls Supabase Auth sign-out with `scope: local`, checks the returned acknowledgement, then clears legacy session/workspace selection, resets the DB context and navigates fully to `/`. Removing legacy `?school=` parameters prevents accidental auto-selection on return. No tenant ID can be supplied to this operation.

Returned/thrown sign-out failures and missing acknowledgements do not clear the selection or navigate. The dialog shows a generic retryable error, blocks duplicate confirmation, and blocks closing while sign-out is pending. Background shell content is inert while the portal dialog is open. Focus returns to the switch button on desktop or navigation toggle on mobile. No membership/RLS changes are made. Seamless multi-organisation switching remains future work.

## Reproducible local results

Node **v22.22.3**, npm **10.9.8**. No production credentials or remote database writes used by these tests.

| Command | Result | Evidence |
|---|---|---|
| `npm ci --no-fund --no-audit` | Pass | [install.log](install.log) |
| `npm run test:navigation` | **73 passed, 0 failed** | [navigation-tests.log](navigation-tests.log) |
| `npm run test:tasks` | **57 passed, 0 failed** | [task-tests.log](task-tests.log) |
| `npm run test:guards` | **43 PASS assertions**, stubbed network | [guard-tests.log](guard-tests.log) |
| `npm run verify:web` | Pass; 1,828 modules, 47 JS chunks; entry ~9 KB / 4 KB gzip | [web-build.log](web-build.log) |
| `npm run build:mobile` | Pass; regression build, not proof native mobile uses this shell | [mobile-build.log](mobile-build.log) |
| `npm audit --audit-level=high` | Zero known vulnerabilities reported | [audit.log](audit.log) |
| `git diff --check` | Pass | No whitespace errors |

The 73 navigation tests include:

- Existing 25 search/source-wiring/mobile-DOM tests.
- 38 catalogue/layout tests: a fixed PR #87 route/role/icon snapshot; all five existing roles × business/education × allow/deny/subset (30 cases); per-route denial and search non-disclosure; missing-header fixes; group/label/default-collapse behaviour; fail-closed unknown roles; shell wiring. The only new sidebar route is the existing admin Settings destination.
- Five sign-out sequencing/failure tests and five **mounted real React dialog** tests using jsdom and Vite's JSX transformer: text escaping, accessible labels, safe initial focus, keyboard boundaries, cancellation, pending state, duplicate clicks, retry and focus/scroll cleanup.

Both existing CI workflows already run `test:navigation`; the script now includes the new tests. Build warnings about Vite config module format and the spreadsheet chunk remain non-blocking. The fixed catalogue snapshot is in `scripts/fixtures/workspace-nav-pr87.json`.

## Acceptance boundaries / next evidence

- The role resolver and legacy admin bypass are preserved, not endorsed as the final owner/admin/HR/finance model. Menu visibility is **not backend security**. No backend enforcement or tenant-isolation claim is made here.
- Browser/device journeys against the deployed new slice remain unverified: phone, tablet, desktop, long organisation names, actual scrolling/inert behaviour, screen-reader output, department search, profile access, education compatibility and switching/relogin after refresh.
- The mounted dialog uses mocked callbacks; live Supabase sign-out failure modes and cross-tab behaviour still require authenticated acceptance.
- No staging infrastructure, original task incident diagnosis, organisation membership model, hiring publication or NaijaHaul launch gate is changed.
- Implementation/test progress for P2-N03–10 and P2-N13 is recorded. Full Phase 2 and the **0/9 verified** mission scorecard remain unchanged. Review, deployment and persisted live evidence are still required before acceptance.
