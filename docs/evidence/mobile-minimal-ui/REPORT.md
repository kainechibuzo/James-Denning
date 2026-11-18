# Minimal JD chat and mobile UI corrections

## Changes

- Removed the central JD logo tile and the star/divider below the greeting. Kept the JD brand in the workspace header and the existing greeting typography. The chat now has a plain background rather than decorative curves, in both themes.
- Removed decorative dark-mode borders from workspace cards, headers, navigation, controls, connector setup panels, dialogs and table surfaces. Tonal fills, spacing and selected states distinguish surfaces. Keyboard focus rings, native selection controls and the tour's functional spotlight are not removed. Light-mode surfaces and the deliberately light marketing landing page keep their existing borders.
- Fixed the off-screen onboarding tour: its `tourFadeIn` animation used to override the `translate(-50%,-50%)` centering transform. The animation now changes opacity only. Phone steps use viewport-centered cards with constrained width/height and scrollable content. Tour dots have usable hit areas rather than stretching into tall bars. Added dialog semantics, labelled close/step controls, Escape dismissal, keyboard focus containment and restoration.
- Department workload descriptions now use full-width cards on phones and a wider responsive grid on larger displays, instead of three cramped columns. An empty execution timeline explicitly says no activity details were included in the snapshot; it does not claim no activity ever occurred.
- Mobile connector filters now give business area its own row and place setup/sort in two columns. The sign-in panel header can wrap rather than squeezing its title and close button together.
- OAuth setup transport failures now have an actionable unavailable state and a **Retry setup check** button. That retry only reads provider setup; it never starts consent or sends a tool action. HTTP authentication, permission, missing-function and service errors have separate explanations. Transport failures are not misrepresented as a confirmed missing deployment.

## GitHub connection issue: live read-only diagnosis

The Supabase connector was used only for `list_projects` and `list_edge_functions`. The James-Denning production project was reported `ACTIVE_HEALTHY`, but **`jd-connect-oauth` was absent from the list of 20 deployed functions**. The existing `jd-connect` was version 9 and `jd-business-platform` version 10. A minimal metadata receipt and request ID are saved in `backend-observation.json`.

This establishes a missing backend prerequisite, not a working sign-in. Browser fetch errors alone cannot distinguish network/CORS problems from an absent endpoint. The UI therefore describes the uncertainty and tells the operator what to check instead of displaying only “Failed to send a request to the Edge Function.”

**No backend deployment, SQL change, secret retrieval, provider registration, real consent or provider action was performed.** GitHub OAuth remains blocked until the previously documented backend/migration/provider rollout is separately approved and completed. See `docs/CONNECTOR_OAUTH_SETUP.md`.

## Verification

| Check | Result | Evidence |
|---|---|---|
| Full non-layout Node regression | **1,405 passed, 0 failed** | `node.log` |
| New error classification cases | 9 passed, included above | `scripts/test-connector-oauth-errors.mjs` |
| Full chat/site/settings/layout suite | Passed | `layout.log` |
| New screenshot-specific browser tests | **60 states** across 320×740, 393×860, 708×900, 1280×900 and short 393×460; both themes | `mobile-polish-results.json`, `mobile-polish.log` |
| Tour navigation | All 7 steps across all 10 viewport/theme combinations; visible Next/Finish, Escape, focus wrap/restoration | New browser suite |
| Site-wide theme audit | **384 states, 16,620 contrast samples, 0 findings**; dark decorative-border assertions also passed | `site/contrast-results.json`, `theme.log`, final `layout.log` |
| Connector browser regression | **72 states, 2,454 contrast samples, 0 findings**; consent, error, role, navigation and no-write checks | `connectors/browser-results.json`, `layout.log` |
| Production web build/verification | Passed | `build.log` |
| Verification guards | Passed | `guards.log` |
| npm audit | **0 vulnerabilities** | `audit.log` |
| Whitespace/diff validation | Passed | `git diff --check` |

The added browser test is included in `npm run test:chat-layout`, which both CI workflows run. The error classifier tests are included in the existing OAuth suite. No dependencies or lockfiles were changed.

### Failures retained and corrected

The first full browser pass found that the selected sidebar pill's higher-specificity legacy selector still drew a border. Its failure is retained in `initial-border-regression.log`. Added an explicit dark selected-pill override; the standalone theme suite and subsequent full layout suite passed. Visual inspection also caught the dark chat background rule overriding the plain-background rule; the override was corrected and an explicit computed-background assertion was added before the final full run.

The sandbox initially lacked Chromium's shared libraries. A temporary packaged Chromium 131 and its supplied libraries were extracted into cache and `/tmp`; no browser binary, test dependency or system library was added to the application. Browser commands used `CHROMIUM_EXECUTABLE_PATH=/tmp/chromium`, `LD_LIBRARY_PATH=/tmp/lib` and `FONTCONFIG_PATH=/tmp/fonts`.

## Screenshots

All screenshots are real Chromium renderings of production components with **synthetic fixture records**, not live production accounts:

- `minimal-greeting-light.png`, `minimal-greeting-dark.png`
- `tour-welcome-light.png`, `tour-welcome-dark.png`
- `department-cards-light.png`, `department-cards-dark.png`
- `connector-directory-light.png`, `connector-directory-dark.png`
- `oauth-unavailable-light.png`, `oauth-unavailable-dark.png`

Additional whole-site and connector screenshots/measurements are under `site/` and `connectors/`. GitHub CI/preview status and merge receipts, when available, are distinct from backend deployment or live OAuth verification.
