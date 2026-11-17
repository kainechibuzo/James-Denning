# Capability meaning and mobile chat readability

## Scope and identity

- Branch: `arena/93cd7fc6-james-denning`.
- Base: `b193215e30c363e6753d8aba069cd61e870b904a` (merged PR #91).
- Delivery owner: Arena coding agent. Independent reviewer: unassigned.
- This engineering slice is not production-deployed or independently accepted. No production database, approval, hiring, financial or queue mutation was performed.
- Evidence directory date follows the supplied screenshot filenames (2026-11-17); remote timestamps below are reported by the providers. The source manifest identifies the locally tested changes.

## Why the screenshots matter

The supplied phone screenshots show a wide capability inventory, repeated `unverified` states, claims that JD cannot dispatch work, and a blanket description of saved work as drafts awaiting approval. They also show floating chat controls covering text. A screenshot cannot establish which backend version or tool result generated a response, whether records really changed, or whether the user was authorised for every described action.

Repository inspection established two distinct inventories:

1. `get_jd_capability_inventory` reports actual registered native tools and their current role availability. Some callable tools read data, some save internal task/memory records, some generate previews, and some request approval. These are not all unsaved previews or pending approvals.
2. `capabilities.report` builds its twenty-capability evidence report from an empty server-owned evidence map. Therefore it reports `unverified` even if an individual read or internal write can execute. It is not an enable/disable switch and does not certify a production outage.

The correct distinctions remain: permission to call is not proof it works; missing independent evidence is not proof it cannot work; saved is not approved; approved is not executed; a completed record is not an independently verified business outcome.

## Repairs

### Capability contracts and reporting

- Add shared interpretation guidance to the actual agent instructions and both inventory contracts. No role, risk or approval gates are loosened.
- Runtime inventory adds explicit availability, effect boundary and `live_verification: not_assessed` for each registered tool. Task/memory persistence, private file drafts, preview-only plans, approval requests and connector-dependent execution are distinguished.
- Capability evidence HTTP response explicitly reports `execution_availability: not_assessed`. Caller-supplied evidence and role fields remain ignored; owner/admin access remains server-enforced.
- Prevent malformed truthy values from satisfying evidence checks. All five explicit positive fields (implementation, migration, deployment, configuration and authenticated smoke test) are now required for the existing `deployed` classification. This is a classification contract, not a new trusted evidence collection system; the actual route still supplies no positive evidence.
- Capability prompts ask for concise grouped explanations instead of a wide table, prohibit demonstration writes, and preserve legal/financial/hiring approval boundaries. Existing saved conversations are not rewritten.
- The Operations evidence panel explains that unverified means missing evidence, not necessarily unavailable or working.

### Mobile chat

- Move chat utility controls into normal layout flow, outside the message scrollport, so they do not cover scrolled messages.
- Keep thread/markdown widths bounded and prevent flex shrink from squeezing long conversations.
- Give tables readable column minimums, explicit scroll guidance, column header semantics, a labelled focusable scroll region and visible keyboard focus. Sideways scrolling remains intentional for wide tables; no columns are deleted.
- Keep the composer separate from the scroll area; verify the final paragraph can be reached above it.

The baseline Chromium run reproduced the toolbar overlay: at a 393px viewport the toolbar ended at y=102 while the scrollport began at y=57. The table wrapper itself was already viewport-bounded in this synthetic fixture; the supplied screenshot's exact horizontal scroll position was not reproduced. The repair improves discoverability/readability rather than claiming every clipping cause has been proven.

## Validation

| Check | Result | Evidence |
|---|---|---|
| Capability/registry/actual HTTP route tests | 58 passed | `capabilities.log` |
| Execution tests | 97 passed | `execution.log` |
| Navigation/identity tests | 106 passed | `navigation.log` |
| Task tests | 250 passed | `tasks.log` |
| History tests | 23 passed | `history.log` |
| Checklist tests | 13 passed; 222 entries, 0 verified | `checklist.log` |
| Staging/verification guards | 43 checks passed | `guards.log` |
| Actual ChatHome in Chromium | Six layouts passed | `layout.log`, `layout-before.json`, `layout-results.json` |
| Web verification, default and mobile builds | Passed | `verify-web.log`, `build.log`, `build-mobile.log` |
| Dependency audit | 0 reported vulnerabilities | `audit.log` |
| Deno check of capability contract/classifier | Passed | `typecheck.log` |

Total: **547 Node tests, 43 guard checks and six Chromium viewport cases passed locally.** Viewports: 320×740, 360×800, 393×852, 708×900, 1280×900 and 393×460. Tests mount the actual ChatHome and children against a synthetic history API in a minimal shell; all browser network requests are blocked. They check document/thread bounds, utility/composer separation, last-paragraph reachability, table horizontal movement, focus and arrow-key scrolling. The 393×460 case simulates a reduced viewport; it is not a physical keyboard/Android test. `chat-phone-initial.png` and `chat-phone-scrolled.png` show synthetic content only.

Capability tests import the real runtime registry and execute real handlers with synthetic clients, test every combination of five boolean evidence fields, reject truthy substitutes, compare reported callable tools against actual definitions for eight roles, and capture the instructions supplied to a stub provider. This does not prove a live model will always follow those instructions. HTTP tests use injected authentication, not deployed JWT/RLS. No production writes or real-world outcomes were tested. Browser accessibility tests do not replace screen-reader/device acceptance.

Reproduce Node checks with `npm ci` and the named `npm run test:*` scripts. Browser checks require `CHROMIUM_EXECUTABLE_PATH` or installed `/usr/bin/google-chrome`/Chromium. The local restricted sandbox used npm-distributed `@sparticuz/chromium` (Chromium 153.0.8010.0) with its bundled libraries; CI uses its installed Chrome. Optional `JD_LAYOUT_EVIDENCE_DIR` saves synthetic screenshots/measurements. Debug-only `JD_LAYOUT_OBSERVE_ONLY=1` records baseline measurements without assertions; it is **not** used in CI or the passing final run. Logs have trailing whitespace normalised. Build/module warnings remain nonblocking. Full remote CI is required before merge.

## PR #91 production metadata follow-up (read-only)

Vercel `list_projects` request `71ee19fe-2579-420d-b1fe-e0ac2afca7cd` returned project `prj_py4KD4LAIbOWVblRuoQNpnHDbIjz` linked to `kainechibuzo/James-Denning`:

- Deployment `dpl_2bdKwsVhJwbpqPQxXyLvjFBtDeyU`: **READY / PROMOTED**, target `production`, alias error null.
- Exact commit: `b193215e30c363e6753d8aba069cd61e870b904a`.
- Assigned aliases include `rgs-portal-master.vercel.app` (the screenshot host) and `james-denning-james-projects-57651351.vercel.app`.
- Post-merge Verify application run [44028020225](https://github.com/kainechibuzo/James-Denning/actions/runs/44028020225) concluded success for that same commit.

These observations establish deployment identity/status, not authenticated application acceptance or a backend release. The connector result also listed other projects; unrelated project information and environment metadata were deliberately not retained here.

## Release and remaining gates

1. Review this branch and require CI. Frontend layout/prompt/help changes can ship separately using existing API contracts.
2. The agent instructions, runtime inventory and evidence HTTP changes require a backend release. A frontend merge alone cannot fix generated answers from an older deployed backend. **Do not blanket-deploy `jd-automation` or shared-module consumers from this branch:** the repository also contains the still-gated checked-assignment backend, which is incompatible with shipping legacy assignment. Prepare a separately reviewed compatible backend artifact or complete the coordinated assignment staging/release first.
3. No Supabase function or migration was deployed here. `TASK_ASSIGNMENT_RELEASE` remains `legacy`; checked assignment and the retry SQL repair remain gated.
4. In genuinely isolated staging, use nonempty multi-tenant fixtures, real JWT/RLS, actual model responses and read/write/approval records to verify the distinctions end-to-end. Retain independent review and evidence for each claimed live capability. Do not turn metadata, an accepted request or a task tick into blanket capability verification.
5. All 222 plan entries and final acceptance **0/9** remain unverified. No NaijaHaul launch or hiring publication is authorised by this work.
