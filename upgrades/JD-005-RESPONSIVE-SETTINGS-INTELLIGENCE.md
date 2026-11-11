# JD-005 — Responsive Portal and Organisation Settings Intelligence

- **Status:** in progress
- **Priority:** high
- **User outcome:** The portal works cleanly on phones and desktop, themes remain readable, and JD becomes the conversational control plane for understanding and safely organising the organisation's settings and functions.
- **Evidence:** User-provided mobile screenshots of Generate Bills, Assignments and Settings (Organization Info, Cycles & Periods, Performance and Portal settings).

## 1. Problems observed
1. Dark mode has inconsistent surface and foreground colours. Selected tabs and action buttons can become pale/white with low-contrast text while the rest of the page remains dark.
2. Several settings layouts retain desktop two-column sizing on narrow screens. Fixed/minimum control widths squeeze labels and create overflow.
3. Configuration is distributed across pages and tabs. Users must understand the portal's internal navigation before they can complete related setup.
4. JD needs an auditable inventory of settings, modules, dependencies and permitted operations before it can safely configure an organisation.

## 2. Scope
### A. Theme correctness
- Publish the active theme as data-theme=light|dark on the document and body.
- Keep persisted jd_dark and legacy rgs_dark preferences in sync.
- Set browser color-scheme to match the selected theme so native inputs and option menus render correctly.
- Ensure hard-coded light surfaces cannot produce white-on-white or unreadable controls in dark mode.
- Preserve semantic status colours and visible keyboard focus.

### B. Responsive portal foundation
- Settings rows stack label/description above the control on narrow screens.
- Form controls use available width and can shrink without forcing page overflow.
- Two-column content grids collapse to one column at phone widths.
- Tables remain usable through horizontal scrolling rather than compressing every column.
- Test at 320, 360, 390, 430, 768 and desktop widths.
- Audit Generate Bills, Assignments, Organization Info, Cycles & Periods, Performance, Security, Portal and Permissions pages individually; CSS foundation alone does not prove every route is fixed.

### C. JD Settings Intelligence
Create a server-derived capability catalogue. Each entry should describe:
- stable setting/module key and human-readable name;
- category and owning page;
- current value and whether it is configured;
- schema/source evidence and last-read timestamp;
- dependencies and downstream affected features;
- permitted read/write operation and required role;
- risk level and whether approval is required;
- validation rules and a read-after-write verification method.

JD workflow:
1. Discover registered modules, settings definitions, database schema, existing tools and permissions.
2. Explain what a setting does, where it appears, what depends on it and what is missing.
3. Audit configured, missing, conflicting, unsupported and unverified items separately.
4. Plan grouped changes by module, showing current and proposed values, dependencies, impact and validation.
5. Review: require explicit user confirmation for ordinary configuration writes; route security, identity, financial, access-control and destructive changes through the Review Centre with server-enforced approval.
6. Apply through narrow, typed, tenant-scoped server operations. No arbitrary SQL, shell or unrestricted table mutation.
7. Verify by reading affected values back and reporting success, partial completion or failure with evidence.

### D. Organisation Builder connection
A plain-language request such as 'organise my school/business portal' should produce a proposed blueprint containing supported divisions, teams, groups, reporting lines, roles, permission proposals, cycles, performance settings, assignments, billing prerequisites, communications, hiring workflows and onboarding tasks.
JD must distinguish existing supported configuration from new development. It must never invent unsupported features, records, roles or integrations.

## 3. Security and data boundaries
- Derive workspace identity from the authenticated server session, never model-supplied tenant IDs.
- Enforce role permissions server-side on every read/write tool.
- Treat settings descriptions and database values as untrusted data.
- Keep secrets and credential values out of model context; return only configured/not configured and safe metadata.
- Use idempotency keys for retriable writes.
- Do not change passwords, roles, permissions, security policies, payment settings or external integrations without appropriate explicit approval.
- Store audit evidence without logging secrets or unnecessary personal information.

## 4. Acceptance criteria
- Dark/light toggle changes the document theme and native controls consistently, persists after reload, and has accessible state labels.
- No horizontal page overflow at 320px on audited settings and billing routes.
- Settings controls fill available mobile width; labels no longer occupy narrow side-by-side columns.
- Two-column panels stack on mobile while desktop retains useful side-by-side layouts.
- JD can list the settings catalogue and identify missing prerequisites using evidence.
- JD can prepare a grouped settings plan with a before/after diff and impact explanation.
- Every write is permission-checked, validated, confirmed/approved as appropriate, idempotent and read-after-write verified.
- Cross-workspace access tests prove no tenant leakage.
- CI includes responsive/theme regression checks and tool permission/validation tests.

## 5. Current implementation in this PR
- Added document-level theme state and matching browser color-scheme.
- Added dark-mode safeguards for hard-coded light input/button surfaces.
- Made shared settings rows stack responsively and controls fill mobile width.
- Added responsive CSS rules for two-column grids, narrow controls and scrollable tables.
- Added this upgrade specification and master checklist entry.

## 6. JD-005C settings change planner
- Added a validated, read-only proposal tool for up to 20 registered settings.
- Shows before/after values, rejects unknown or invalid keys, detects duplicates and no-op changes.
- Marks workspace, identity, security and billing changes as Review Centre approval-required; other registered settings require explicit confirmation.
- No setting is changed by this tool. Proposal persistence, exact-payload approval binding and verified execution remain outstanding.

## 7. Verification and remaining work
- Run production build, lint/type checks and existing tests.
- Add browser visual tests for the screenshot routes at the acceptance widths.
- Audit remaining page-specific inline styles; generic CSS overrides are not a substitute for per-page verification.
- Implement the server-derived settings catalogue and typed JD tools as a follow-on implementation phase before claiming JD can configure all settings.
- No database migration or production secret change is required for the current UI foundation.
- Provider token usage: unknown; no provider usage metadata is available for repository editing.