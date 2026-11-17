# Landing conversion and populated-conversation UX

Branch: `arena/02936541-james-denning`, based on merged `b7d7349`.

## User-reported issues and changes

Three supplied mobile screenshots showed illegible assistant text on dark backgrounds, a dark textarea inset with low-contrast placeholder, and a large always-expanded operational checklist dominating the conversation. The user also requested a more persuasive landing page and restored JD AI tools in the main sidebar.

- **Landing:** retains the supplied JD branding, laptop artwork and monochrome visual language. Adds clearer customer value, interactive owner/operations/founder use cases (explicitly illustrative, not live), a three-step explanation, approval/permission safeguards, FAQs and a closing signup CTA. No fabricated testimonials, metrics, prices or autonomous-completion guarantees. Platform billing and additional employee usage remain distinct.
- **Main sidebar:** New conversation, Conversation history, Review Centre, Departments, AI usage and Automation runs open existing chat capabilities. Shortcuts are derived only when the existing authorised `jd-chat` route is present; this is not a new permission grant. Search includes these destinations, and icon-only navigation retains labels. Backend authorisation is unchanged.
- **Dark conversation:** shared theme colours now cover actual populated reply text, headings, emphasis, links, quotes, tables, task panels and status badges—not just the empty welcome screen. Composer text/placeholder has tested contrast, a transparent inset, 16px text and a focus indication. The existing generic dark-input rule no longer creates a contrasting inner rectangle.
- **Collapsed checklist:** native keyboard-accessible details/summary starts closed for new and historical task cards. Only the summary pill appears after the reply; refresh, records, manual status controls and explanations are inside. Unknown record status is labelled “Status not confirmed”, never assumed complete. Job completion is labelled “Run complete” rather than implying the whole business checklist is done.
- **Actual progress:** saved records are reread every 30 seconds while the conversation is visible, and on return/focus. No task status is changed by the timer, opening details or refreshing. Pending writes and uncertain acknowledgements block background reconciliation; existing explicit refresh remains available. Late reads remain fenced across account/workspace/conversation changes.
- **Actionable work:** an explicit “Ask JD to work on this” button on eligible confirmed open records submits a normal chat request through the existing durable-job API, asking JD to inspect inputs, dependencies and approvals and perform the next supported authorised step. It does not call the manual status-transition endpoint, fabricate results, or bypass approval. “View JD execution runs” exposes the existing run monitor.

## Why checklist progress was not autonomous execution

Repository inspection confirms that `create_operational_setup_tasks` in `supabase/functions/_shared/jd-agent-runtime.ts` explicitly **creates task records only**. Its capability boundary in `jd-capability-contract.ts` likewise says saving a task does not complete the activity. The task-record controller reads statuses and performs explicitly requested manual transitions; it is not a worker that performs forecasts, hiring, purchases or contracts.

This change makes that distinction visible and gives the user a real explicit request path. It does **not** turn every checklist item into an autonomous scheduled job. Completion still requires supported tools, required inputs and approvals, and meaningful execution evidence. No production records in the supplied screenshots were queried or changed, and their reported completion count has not been independently verified.

## Final local verification

| Check | Result | Evidence |
|---|---|---|
| Node suites including dependency security | **1,222 passed, 0 failed** (1,200 application + 22 dependency) | `node-tests.log` |
| Fail-closed verification guards | **43 passed** | `node-tests.log` |
| Existing reference/site/browser chain | **193 passed** | `browser-tests.log` |
| New populated conversation/sidebar/landing cases | **48 passed** | `conversation-results.json`, `browser-tests.log` |
| Web build verification | Passed | `web-build.log` |
| Mobile/default builds | Passed | `mobile-build.log`, `default-build.log` |
| Registry npm audit | 0 findings; existing local security backport caveat still applies | `audit.log` |
| Actual local HTTP preview | Passed | `preview-smoke.log` |
| Whitespace check | Passed | `git-diff-check.log` |

The new Chromium tests cover widths 320, 393, 708 and 1280 with real shell navigation and populated synthetic conversation history. They check all six sidebar shortcuts/icons, light/dark reply contrast (at least 4.5:1 for sampled text and placeholder), transparent composer background, keyboard disclosure, no horizontal document overflow, composer/message separation, read-only timer updates and exactly one explicit synthetic task-work submission without a status transition. Landing use-case selection, FAQ disclosure and signup CTA are exercised. The new suite runs in the existing CI browser chain.

New mounted/controller tests verify default-closed details, no mutation when opening, authorised navigation, unknown-state handling, read-only visible-tab refresh, preservation of last confirmed records during background reads and invalidation after read failure. Existing role, tenant/scope, audit-acknowledgement and retry guards remain passing.

Representative screenshots at 393/1280 are retained here. Visual review found and corrected missing shortcut icons and a remaining low-contrast disclaimer rule caused by CSS specificity; regenerated screenshots and final tests reflect those fixes. A syntax error in a newly added test was also corrected before the full rerun.

## Scope and release boundaries

The preview is synthetic: `/` is the landing page and `/workspace` offers a sample saved conversation through the restored sidebar. No live account, external tool, hiring action or financial operation was executed. The browser's explicit work-request test acknowledges a synthetic submission only; it is not evidence of a successful real job.

No backend deployment, database migration, infrastructure purchase or production approval is included. This work was validated locally; no push, PR or merge was performed for it. Existing nonfatal Vite config-format/large spreadsheet-chunk warnings remain. See the prior security-backport evidence for the distinction between zero registry audit findings and upstream vulnerability remediation.
