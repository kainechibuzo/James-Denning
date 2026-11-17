# Business settings and JD-reviewed changes — local evidence

## Outcome

Implemented the screenshot-driven settings cleanup and connected JD's settings proposal to the human review/apply workflow. **Not deployed, not production-verified.** No organisation name, address, phone, hiring status or production configuration was changed by this work.

- Branch: `arena/ea8f1137-james-denning`.
- Base: `a5e01ef8dfd2b1985092b5c1aa3fdfff1778e5f6` (merged PR #95).
- The screenshots informed the investigation but were not treated as proof of current backend project configuration. Original user screenshots are not copied into the repository; captured screenshots below use synthetic local fixtures.
- No cloud provisioning, remote database write, migration or function deployment was performed. Existing cancellation and assignment release gates remain unchanged. Overall final acceptance remains 0/9.

## Reproduced issues

1. **Phone spacing:** `SettingRow` used `flex: 1 1 220px` on its label. At mobile widths the parent switches to a column, making that basis a vertical height. Running the actual pre-change SettingsPage and CSS from HEAD reproduced 220px label heights at 360, 393 and 708px widths. The control started 226/228px below the label's top.
2. **School-era settings in business:** academic periods/CA/exam maxima, report-card billing restrictions and legacy login controls were always rendered. Some hidden/default fields were included in the general preferences write, and academic periods were loaded regardless of workspace type.
3. **Misleading diagnostics:** Portal Info hard-coded the old project ID and `eu-west-1`; it did not establish the active client configuration.
4. **Incomplete settings workflow:** the model could prepare an unsaved plan but had no settings proposal submission tool. Review Centre did not display settings diffs or expose the existing approved execution endpoint. Approval alone did not apply settings.

## Changes

### Settings page

- Business workspaces no longer show academic score/period tabs, legacy login controls, report-card balance restriction or clear-results control. Explicit education workspaces retain them. This is presentation, not a new access policy.
- No automatic deletion or migration of academic records. Hidden education keys are excluded from a business preference save. Academic settings reads are not made for business presentation.
- Label flex sizing resets on stacked layouts. At 393px the retention label now occupies **69.5px instead of 220px**, with a **6px gap** before its controls. No horizontal overflow in tested viewports.
- Organisation wording replaces the transcript-specific motto hint and example address. Session security no longer calls user sessions “cycles”.
- Configured project is derived from the public client endpoint; region is labelled unknown instead of guessed.
- Ordinary and workspace saves read persisted values back before reporting success. Initial read failure does not substitute editable defaults. Fixed the missing `setNameSettings` import on the preferences save path.

### JD and Review Centre

- Added owner/admin-only `submit_workspace_settings_for_review`: rechecks profile authority, validates exact requested values, reads current tenant settings and invokes the existing submission RPC. No direct settings write or self-approval/execution tool was added.
- The tool explicitly requires supplied/confirmed identity values. Its metadata reports an approval request, not successful execution. Unsupported preference-only or mixed executable proposals fail rather than silently applying a subset.
- Catalogue distinguishes stored academic values from applicability in the current workspace.
- Review Centre shows before/after values, preserves the approval/apply distinction and requires an explicit Apply confirmation. Settings approvals stay open for that next step; rejected requests can still return feedback to JD.
- The existing HTTP executor now validates step identities/verification, stops on malformed receipts, and reads final settings values back. The client rereads the approval and requires matching receipt/records before success.
- Double clicks are guarded; uncertain/lost responses block further actions until refresh. Completed settings are described as saved records, not independent business verification.

## Validation

| Check | Result | Artifact |
|---|---|---|
| New settings registry/client + actual HTTP/SQL | **57 passed** (44 registry/client + 13 SQL/HTTP) | `settings.log` |
| Backend release | 81 passed | `backend-release.log` |
| Operational tasks | 250 passed | `tasks.log` |
| Execution / evidence harness | 276 passed | `execution.log` |
| Capabilities | 58 passed | `capabilities.log` |
| Navigation | 106 passed | `navigation.log` |
| History | 23 passed | `history.log` |
| Checklist | 13 passed; 222 entries, 0 verified | `checklist.log` |
| Verification guards | 43 passed | `guards.log` |
| Existing Deno settings suites | 25 passed | `deno-settings.log` |
| Changed automation entrypoint Deno check | Passed | `deno-check.log` |
| Existing ChatHome browser layouts | Six viewports passed | `browser.log` |
| Actual SettingsPage + ReviewCentre browser flows | Four widths passed: 360, 393, 708, 1280 | `browser.log`, `settings-layout.json` |
| Web verification, mobile/default builds | Passed | `verify-web.log`, `build-mobile.log`, `build.log` |
| npm audit | 0 reported vulnerabilities | `audit.log` |

Total: **864 Node tests**, **25 Deno tests**, **43 guard checks**, six existing chat layout cases and four settings/review browser viewport flows passed. Browser tests include approve-without-execution, explicit Apply, double-click protection, lost acknowledgement/refresh, business/education presentation, hidden-key preservation, load failure and unsuccessful save read-back.

Tests and final builds were run with dependencies restored by `npm ci` after Deno's auto-install tooling. Source hashes identify this working-tree candidate. No new remote CI or deployed test result is claimed. Build chunk-size/deprecation warnings remain nonblocking; npm audit is not a complete security audit.

### SQL evidence and limitations

`settings-sql-records.json` contains synthetic before/after records from the actual repository proposal, approval-decision and settings-step RPCs. The exercised chain is JD submission → PostgreSQL pending approval → human HTTP approval → unchanged settings → actual HTTP executor → client/persisted read-back. The other tenant remains unchanged.

Tests reject unauthenticated/staff/outsider execution, tampered proposal hashes and stale approved values. Forced audit failure rolls back its setting step. A second-step fault preserves the first step, reports partial execution, and an explicit resume skips the completed step without duplicate step audit events. Replaying completed execution is idempotent.

PGlite uses the actual repository control-plane/settings/step DDL and latest role/hash RPC definitions, with synthetic auth/profiles, service-role grants and a PostgreSQL SHA-256 wrapper for `extensions.digest`. This is not live Supabase JWT/RLS/pgcrypto verification or multi-connection race evidence. **Each step is transactional; the entire multi-setting batch is not atomic.**

### Screenshots

- `baseline-393.png` — previous source reproducing the large label gap and school-era controls.
- `settings-393.png` — compact business preferences using the actual updated component.
- `review-393.png` — confirmed synthetic settings execution and persisted read-back.
- Equivalent captures exist at 360, 708 and 1280 widths. `baseline-layout.json` and `settings-layout.json` retain the measurements.

## Remaining work / release boundaries

- This does not remove every legacy school database name, route or permission elsewhere in the product. Existing education tenants and academic data are deliberately preserved.
- Browser form writes still rely on existing RLS; hiding a control is not security. No access policy was widened.
- Backend/tool deployment is separate from frontend deployment. The new submission tool and stricter acknowledgement contract require the reviewed backend release; missing/older backend support must not be treated as successful execution.
- No connected-host identity or currently deployed schema was verified here. A screenshot of a hard-coded project label cannot identify the database actually in use.
- Genuine isolated staging, real roles/tenants/new-session persistence, provider tool selection and mobile-device acceptance remain required before release approval.
- No actual NaijaHaul identity or contact data was invented, and no vacancies were published. These remain explicit owner decisions.

See [the operator/release notes](../../../documentation/JD_BUSINESS_SETTINGS.md). The changes are ready for review, not a claim that the live screenshots are already fixed.
