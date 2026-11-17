# Supplied-reference landing and workspace UI

## Scope

Implemented on `arena/fafb4b55-james-denning`, based on `a8f8c9ab30a381a9185d28419428066ec68d6eb5`.

The user's three images are the visual specification. This change replaces the previous landing design and restyles the existing chat welcome/composer and its shell header. It does not change authentication, tenant access, approvals, backend APIs, registry publication, employee execution or billing.

### Implemented

- Landing: supplied JD mark, divided brand, black Get started controls, outlined menu, single-line Run. Monitor. Grow. heading, supplied wording, Explore link, shield caption and exactly two feature cards.
- Uses the supplied front-on laptop crop on phones and supplied angled laptop artwork on larger screens, rather than inventing a replacement dashboard. Image alternatives explicitly distinguish sample metrics from live records.
- Removes the prior extra marketing/demo sections and initial chat shortcut cards absent from the reference. Chat shortcuts remain available in the history/tools panel.
- Workspace: existing shell navigation, theme, help, notifications and profile handlers retained; monochrome controls and real user initials replace the prior page-title/gradient treatment on the chat route only.
- Chat: supplied logo tile, dynamic time/name greeting in script, divider, reference copy, pale background curves, rounded composer with paper-plane send icon, submission count and background-job note.
- The Workspace Active pill opens the existing history/tools panel on an empty conversation. Message threads retain their dedicated history trigger. A displayed active label is not operational verification of an employee or backend release.
- Existing submit, Shift+Enter, queue pause/resume, persisted-history and approval logic preserved. No screenshot is used as a substitute for interactive application UI.
- Fonts and artwork are local assets; no external CDN. Asset provenance and font licenses accompany the files. Exact original fonts were not supplied: Inter, Pinyon Script and Libre Caslon Text are the selected matches, and background curves are reconstructed vectors. This is not a certified pixel-identical comparison.

## Validation

| Check | Result |
|---|---|
| Node suites (navigation, tasks, execution, history, registry, usage, foundation, agents, settings, capabilities, backend release, checklist) | **1,182 passed, 0 failed** |
| Fail-closed verification guards | **43 passed** |
| Existing chat/settings/agents/foundation/registry Chromium flows | **22 passed** |
| New reference layout flows, two screens × six viewport sizes | **12 passed** |
| Web build and verification | Passed |
| Mobile build | Passed |
| Default build | Passed |
| Whitespace check | Passed |
| Local synthetic preview landing → workspace | Passed, no page errors |
| npm dependency audit | **5 high-severity findings; not passed** |

The browser sizes are 320×740, 360×800, 393×780, 708×900, 1280×900 and 393×460. Screenshots and `reference-layout-results.json` are retained alongside the logs. Each reference flow verifies no horizontal page overflow, successful local image/font loading and no page errors. Landing flows exercise signup/signin callbacks, menu Escape and the Explore anchor. Workspace flows exercise the real header JSX with synthetic side effects, theme toggle, menu state, profile/help/notification dispatch, saved history and exactly one synthetic submit after Shift+Enter/Enter. The composer must remain visible and not cover the message scroll area.

The existing long-message/table Chromium test now includes the component's emitted stylesheet and matches the actual 49 px header; its table keyboard-scroll and last-message visibility assertions remain intact. `test:reference-layout` is included in `test:chat-layout`, already run by both existing CI workflows. Web verification now checks the approved wording, image alternatives and shipped reference assets rather than the retired generated dashboard markup.

### Audit limitation

`npm-audit.json` records five high findings in the existing Vite toolchain (`vite`, `@vitejs/plugin-react`, `fdir`, `picomatch`, `tinyglobby`). No application dependency versions or lockfile entries were changed in this UI task. npm proposes major-version changes for some findings; no blind audit fix or security-check bypass was applied. The audit CI gate requires separate resolution before claiming a clean release. Existing Vite config-format and large spreadsheet-chunk warnings are also retained in build logs.

## Evidence boundaries

This is local rendering and fixture-based behavioural evidence, not hosted authentication, real notification delivery, tenant data or production acceptance. The local preview is explicitly a **synthetic UI preview** because application backend environment variables are not configured here. Its Get started button opens the workspace fixture; the production landing retains the actual auth callbacks. No mock service or preview route was added to the production application.

No push, PR, deployment, database migration, live service write or production approval was performed. Visual review by the user remains the acceptance step for this reference implementation.
