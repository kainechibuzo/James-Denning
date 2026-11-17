# Whole-site supplied-reference design — local evidence

Date: 2026-11-16. Branch: `arena/fafb4b55-james-denning`.
Extends the reference landing/workspace implementation in local commit `4303416`.

## Implementation

The supplied reference remains the visual specification: supplied JD artwork, local reference typography, pale curved backgrounds, neutral surfaces, thin borders, black primary actions and rounded controls. No replacement visual concept or generated artwork was introduced.

- Shared stylesheet entry for the web/mobile app and all browser fixtures; reference header on every workspace route, with existing navigation, theme, profile, help and notification handlers.
- Shared cards, buttons, badges, form controls, tables, page headers, modals and confirmation dialogs use the same design.
- Authentication, OAuth consent, recruitment/public application, settings, integrations, permissions, administrative tools, operations, business platform, workflow/assignment/collaboration and agent tooling share the reference palette and typography.
- Light/dark theme tokens and local font coverage; SVG navigation/close icons avoid missing platform glyphs. Status labels, approval messaging and operational controls remain; colours are not used as the sole status indicator.
- Mobile two-pane operations/workflow layouts collapse instead of clipping. Settings Back returns to the existing JD chat route rather than the retired dashboard.
- Offline page, app metadata, favicons and installed-app icons use the same supplied branding.

No backend service, database policy, deployment, billing price or approval rule was changed. Exact original fonts were not supplied; existing selected font matches and reconstructed curves remain, not a certified pixel-identical result.

## Final verification

| Check | Result | Evidence |
|---|---|---|
| Node regression suites | **1,182 passed, 0 failed** | `node-tests.log` |
| Fail-closed verification guards | **43 passed** | `guards.log` |
| Existing browser/layout chain | **34 passed** | `browser-tests.log` |
| New real-shell presentation cases | **159 passed: 53 states × 3 widths** | `site-layout-results.json`, `browser-tests.log` |
| Web build and verification | Passed | `web-build.log` |
| Mobile build | Passed | `mobile-build.log` |
| Default build | Passed | `default-build.log` |
| Actual HTTP local preview smoke | Passed | `preview-smoke.log` |
| Git whitespace check | Passed | `git-diff-check.log` |
| npm audit | **5 high; unresolved** | `npm-audit.json` |

The Node command runs `test:navigation`, `tasks`, `execution`, `history`, `registry`, `usage`, `foundation`, `agents`, `settings`, `capabilities`, `backend-release` and `checklist`. `test:chat-layout` now includes `test:site-layout`, so existing CI layout jobs also run the new coverage.

### Browser scope

The new runner compiles the real AppDemo shell and actual public/auth components against an explicit synthetic read-only client. At 320, 393 and 1280 pixels wide (860 pixels high), it navigates the real role-filtered sidebar, settings tabs, every operations tab and business-platform subsection. It also covers profile/workspace-switch dialogs, dark settings/operations, five auth modes, OAuth consent, public application and offline rendering. Representative 393/1280 screenshots are retained here.

Assertions cover page/runtime errors, application error boundaries, unexpected service calls/writes, document/main horizontal overflow and saturated legacy colours on sampled controls/headings/sections. It waits for fonts and finite animations before screenshots. Existing layout suites separately exercise long chat messages/tables, reference landing/workspace controls and agent/foundation/settings layouts. This is not an exhaustive contrast audit or coverage of every populated, error and permission state.

The local HTTP smoke verifies workspace → settings through navigation and landing → signup with no page errors. Preview paths: `/` workspace, `/?screen=landing` landing, `/?screen=signin` sign-in. Preview forms intentionally cannot write to a real backend.

### Failures found and resolved

- The initial fixture missed a workflow read and the KPI series shape; corrected explicit read contracts. Unknown calls still fail closed.
- Lazy routes needed a fixture Suspense boundary; production routing already has its own route boundary. The runner additionally checks the application error boundary.
- Mobile organisation/hiring two-pane grids overflowed at 320 pixels; fixed responsive grid collapse.
- Screenshot timing caught an unfinished navigation transition; runner now waits for finite animations.
- Navigation text glyphs and settings/consent/dark-tab icons/text had rendering or contrast problems; replaced key glyph controls with SVGs and corrected reference colours, then reran browser coverage and visually reviewed regenerated settings/operations screenshots.
- One source-wiring test still required the retired dynamic page-title header (`NAV.find`). Updated it to assert the new permanent branded header remains independent of sidebar search; authorisation and active-navigation assertions remain. Full Node rerun passed.

### Remaining gates and limitations

The dependency audit still reports five high findings in the Vite toolchain (`vite`, `@vitejs/plugin-react`, `fdir`, `picomatch`, `tinyglobby`). Dependency versions and lockfile were not changed. Vite config-format and large spreadsheet-chunk warnings remain in logs. This is not a clean security-release claim.

All rendering evidence is local with synthetic, mostly empty read data. No live authentication, external integrations, actual employee execution, financial operation or real tenant write was tested. No push, pull request, hosted deployment, migration or production approval was performed. Owner visual review and separately authorised live validation remain outstanding.
