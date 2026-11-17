# Theme pairing and conversation navigation repair

Branch: `arena/a4e23fb9-james-denning`, base `a122197ee7444bc9d27058bf52dc36de47d7f3d9`.

## Reported regression and cause

The supplied screenshot showed a dark Departments page with white cards, nearly white headings/purpose text and dark position lists. The earlier browser suite used empty tool responses, so it did not exercise those populated cards. Passing that suite was insufficient evidence for the affected state.

Component styles still declared light surfaces while a shared dark override recoloured selected descendants. This repair removes that patchwork override and pairs component surfaces, text, muted text and borders with shared theme tokens. Populated fixtures now reproduce the structure of the reported failure without using production records.

## Changes

- Departments, AI usage, Review Centre, runs, execution/task panels, business/operations pages, settings, forms, dialogs, auth/application screens and connector panels use theme-aware colour pairs instead of hard-coded light cards. The static sweep also covered shared UI primitives, App/AppDemo, the theme/configuration palettes and stylesheet cascade.
- Shared button foregrounds now invert with the theme rather than remaining white on dark-mode pale action colours. Badge surfaces no longer assume a hex colour that can safely be suffixed with an alpha value. Subdued light-theme text and placeholders were darkened. The product-tour surface, public application text and version marker received follow-up repairs found during audit.
- The reference landing deliberately remains light, with its own local tokens/brand treatment, even after using a dark workspace. Print canvas/text remain explicitly white/dark.
- Main sidebar destinations are soft rounded pills with fading backgrounds, subtle borders and a visible active state. Existing navigation permissions remain unchanged.
- Conversation history opens a separate main-content view, not a nested chat rail. It includes search, refresh, loading/error/empty states, saved-chat selection, New conversation and Back to JD. Selecting JD Assistant in the main navigation also returns to the main conversation. Failed reads are reported; late conversation reads cannot overwrite the view after navigating away. Opening a saved chat preserves the existing persisted-message/task rendering.
- The settings icon sits immediately before the profile icon. Admins open the existing organisation-settings route. Non-admins open their own profile. No admin route grant, backend API permission or database policy was changed.
- Existing collapsed task checklists and explicit work-request semantics remain unchanged. No timer, history action or navigation action performs operational writes.

## Final local verification

| Check | Result | Evidence |
|---|---|---|
| Node application/security suites | **1,222 passed; 0 failed** | `node-tests.log` |
| Fail-closed verification guards | **43 passed** | `guards.log` |
| Full existing browser chain | **193 legacy + 48 conversation checks passed** | `browser-tests.log` |
| Extended route/populated navigation checks | **192 states: 64 views × 3 widths** | `browser-tests.log`, `site-layout-results.json` |
| Light/dark text-contrast audit | **384 view/theme samples; 15,300 text/control checks; 0 findings** | `contrast-results.json` |
| Web verification and mobile/default builds | Passed | `web-build.log`, `mobile-build.log`, `default-build.log` |
| npm audit | 0 registry findings | `audit.log` |
| Actual local HTTP preview smoke | Passed | `preview-smoke.log` |
| Whitespace check | Passed | `git-diff-check.log` |

The extended browser suite runs through `npm run test:theme-layout`, now included in the existing `test:chat-layout` CI chain. It uses production components and a fail-closed synthetic client. It covers 320, 393 and 1280 widths; existing chat/reference tests additionally cover intermediate widths and short screens. Populated fixtures cover departments/positions/workflows/KPIs, usage metrics/model/day rows, a pending review with nested departments and decision controls, completed/failed runs and an expanded step, saved chat content and business overview counts. Many other operational destinations still use empty data; they are route/layout/contrast checks, not exhaustive populated-state acceptance.

History checks include search with no matches, list failure and retry, individual conversation failure, a deliberately held response released after Back to JD, saved-message reopening, main-sidebar return and starting a new chat. Admin settings navigation is tested in the full shell. The extracted real-header fixture uses an owner role and verifies that Account settings opens profile rather than the admin settings route. Unknown fixture calls fail the suite; review decisions and other business writes are not executed.

The contrast helper checks rendered text and input placeholders against composited ancestor backgrounds (including RGB/sRGB colours and directly applied gradient stops), with normal-text 4.5:1 and large-text 3:1 thresholds. Disabled/inert/hidden elements and closed disclosure content are excluded. This is **not** a complete accessibility certification: artwork, inherited complex gradients, icon contrast, every role/data/error state and assistive-technology behaviour require separate coverage. Representative screenshots were visually reviewed, including both themes of the populated Departments page, the sidebar and the dedicated history view.

Early audit runs caught placeholder contrast, the version marker, the public application text and the JD mini-mark. Those failures were repaired before the final full run. Two test-driver issues (an ambiguous message locator and trying to click a header behind the mobile drawer) were corrected without weakening assertions. The final `browser-tests.log` is the authoritative complete successful run.

## Maintenance rules

1. Pair surfaces and foregrounds: `--jd-canvas` / `--jd-card` / `--jd-soft` with `--jd-text` / `--jd-text-soft` / `--jd-muted`. Use the action/on-action pair for new primary controls.
2. Do not fix dark mode by recolouring only descendants while leaving their card backgrounds hard-coded.
3. CSS tokens are not hex strings: do not append hex alpha suffixes to token values. Use a semantic surface or `color-mix`.
4. New tool views need populated fixtures in both themes, not only empty-state screenshots.
5. Remaining hex literals include the theme definitions, explicit public-reference branding/print styles and fallback values inside CSS variables. Raw hex counts are audit leads, not correctness proof. `source-colours-before.json` / `source-colours-after.json` record the initial targeted component sweep, not an exhaustive runtime claim.

## Release boundary

All evidence here is local and synthetic. The HTTP preview serves the reference landing at `/` and a populated sample workspace at `/workspace`, without credentials or production APIs. No live user/organisation data, real approval, job execution, hiring action or financial operation was exercised. No backend deployment, migration, infrastructure purchase, push, PR, merge or production approval is included. Existing nonfatal Vite configuration-format/large-chunk warnings remain. Zero npm audit findings does not supersede the existing local security-backport provenance and limitations.
