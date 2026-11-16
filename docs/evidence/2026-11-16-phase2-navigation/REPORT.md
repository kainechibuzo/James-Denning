# Phase 2 navigation changes — application evidence

**Date:** 2026-11-16 UTC. **Branch:** `arena/90eb91a3-james-denning`.
**Base:** `e94f58f7bd06f7c4c83b13a5a1b1e7ba693df3ef` (merged foundation PR #86).
**Scope:** Reapply the navigation slice described in the previous session; add DOM-based mobile-focus tests. This is not acceptance of all Phase 2 requirements.

## Applied changes

- Sidebar leads with **James Denning** while retaining the organisation name. JD Assistant was already the default authenticated page and remains so.
- Sidebar search matches permitted page labels and available group labels. It runs after existing role/permission filtering, never against an unrestricted catalogue.
- Search temporarily expands matching groups, preserves collapse preferences and announces result counts. Clear restores focus to the search field; navigating clears the query.
- Desktop icon-rail mode exposes permitted routes even if their group was previously collapsed. Searching cannot change the active-page header.
- Group controls expose expansion state; active routes have `aria-current`; icon-only routes retain accessible names.
- Mobile drawer provides an explicit close action, Escape-to-close, Tab/Shift-Tab boundary handling, focus return, background-scroll locking and a closed-state inert attribute. The page list scrolls separately from the brand/profile/footer.
- Search/collapse state resets on user, role or workspace identity changes. Drawer binding is cleaned up when it closes, the layout becomes desktop, authentication/workspace changes, the platform-admin view appears or the PDF view replaces the shell.
- The legacy demo banner no longer claims the tenant is safe isolated staging. The nearby shared-password comment is removed. This does not rotate credentials or establish staging.

Implementation files:

- `src/AppDemo.jsx` — shell integration and presentation.
- `src/config/navigation-search.mjs` — pure search/collapse helpers, receiving authorised entries only.
- `src/components/mobile-navigation.mjs` — independently tested focus/scroll binding and cleanup.

No routes, database schemas, role grants or education-tenant labels were removed. No backend request, production mutation or external publication is introduced by this change.

## Reproducible validation

Node v22.22.3 / npm 10.9.8. No production or staging credentials supplied.

| Command | Result | Evidence |
|---|---|---|
| `npm ci --no-fund --no-audit` | Pass; dependency deprecation warnings retained | [install.log](install.log) |
| `npm run test:navigation` | **25 passed, 0 failed** | [navigation-tests.log](navigation-tests.log) |
| `npm run test:tasks` | **57 passed, 0 failed** | [task-tests.log](task-tests.log) |
| `npm run test:guards` | **43 PASS assertions**; network stubbed | [guard-tests.log](guard-tests.log) |
| `npm run verify:web` | Pass; 1,825 modules, 47 JS chunks; entry ~9 KB / 4 KB gzip | [web-build.log](web-build.log) |
| `npm run build:mobile` | Pass; native mobile bundle regression build, not proof it uses the web sidebar | [mobile-build.log](mobile-build.log) |
| `npm audit --audit-level=high` | Zero known vulnerabilities reported | [audit.log](audit.log) |
| `git diff --check` | Pass | No whitespace errors |

The 25 navigation tests consist of **11 pure-helper behaviour tests**, **4 shell source-wiring guards**, and **10 DOM-based mobile drawer tests**. The DOM tests execute the real binding against jsdom: focus on open, forward/reverse wrapping, native interior Tab, Escape, dynamic controls, empty result focus fallback, listener cleanup, restoring prior scroll/focus and avoiding focus theft from another dialog. jsdom is a development-only dependency and is not imported by browser code.

Both Web CI and Verify application run the navigation suite. The test evidence here is local; remote CI and deployment status must be read from the corresponding PR/checks rather than inferred from this report.

Known warnings remain: Vite config ESM/CommonJS compatibility and the large spreadsheet-vendor chunk. Builds and dependency auditing do not establish runtime security or performance acceptance.

## Acceptance boundaries

This applies the previously described Phase 2 navigation slice. The broader Phase 2 roadmap still requires departmental regrouping, duplicate-module consolidation, organisation-switcher redesign, the complete human-role access matrix and backend/database enforcement tests.

Not verified by this report:

- Authenticated browser journeys or production deployment of this slice.
- Phone/tablet/desktop visual rendering, real scrolling geometry, screen-reader operation or native mobile accessibility.
- Browser focus interaction across every existing portal/modal and session switch.
- Live tenant isolation, staging infrastructure or the original task-update/timeout incidents.

Manual/browser follow-up: search permitted and forbidden destinations for representative roles; clear and follow results; collapse/expand groups; switch desktop rail/full mode; open/close on a phone; check keyboard boundaries, profile/logout reachability, PDF return, workspace switches and education labels. Capture actual viewport and route results before accepting the related requirements.

**Checklist status:** P2-N02 and P2-N09–12 have implementation/test progress; P2-N01 remains preserved. No full Phase 2 gate or final scorecard criterion is marked verified solely by these tests.
