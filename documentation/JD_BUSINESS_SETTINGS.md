# JD organisation settings: reviewed changes and business presentation

## What this change enables

When an owner/admin explicitly asks JD to change supported organisation settings, JD can call `submit_workspace_settings_for_review` to read current values and persist an exact before/after proposal. Examples of requests after deployment:

- “Prepare a settings change to use this confirmed organisation name: …”
- “Switch this workspace to business and turn off the education module.”
- “Use this confirmed organisation address and phone number: …”

JD must use supplied/confirmed values, not invent legal identity or contact details. Do not infer that a name mentioned in an old conversation is an approved legal-name change. The tool can request review; it cannot approve itself or execute settings.

The human workflow is:

1. Open **Review Centre** and inspect the exact diff.
2. Accept or reject it. **Accept records approval only.** Settings approval stays visible rather than closing the dialog and creating an unrelated follow-up message.
3. For an approved, supported request, choose **Apply approved settings**, then **Confirm apply settings**.
4. The existing service-only SQL executor checks the approved proposal hash, actor/tenant, current before-value, supported setting keys and value constraints. Each completed step has persisted verification and audit evidence.
5. The HTTP handler validates each step receipt, stops on uncertainty/failure, checks the final execution state and reads the actual setting values back. The browser also rereads the approval before showing success.
6. Reload the workspace to refresh navigation and cached organisation details. A saved setting is not independent verification of invoices, legal documents or other business outcomes.

Supported review changes are organisation name/address/phone/motto, workspace type/education module, inactivity timeout, legacy login controls and balance/report restriction. Ordinary display preferences and retention remain editable directly in Organisation Settings; the new submission tool rejects mixed proposals containing unsupported executable preferences instead of silently applying only part of the requested diff.

## Error and approval boundaries

- Only authenticated owner/admin identities are accepted; request-body actor/school fields are ignored. Submission rechecks the current profile and the database rechecks authority.
- No direct settings-write fallback exists when the proposal/executor RPC is missing or fails.
- Approval does not imply execution. JD has no new approve/execute model tool.
- Steps are transactional **individually**, not as an entire multi-setting batch. A later failure can leave earlier steps applied. The UI reports uncertainty and requires refresh; an explicitly resumed approved running request skips already-completed steps. Conflicted/failed proposals need administrator review rather than blind resubmission.
- Lost acknowledgements do not trigger automatic retries. The Review Centre locks further decisions/writes until refreshed.
- This is not a new permission grant for manual settings forms. Existing browser RLS and backend authority remain in force. Hiding education controls is presentation, not access control.
- Vacancies are not published, people are not hired, contracts are not approved and financial actions are not authorised by this settings workflow.

## School-era presentation corrections

Academic scores/periods, legacy login switches, report-card payment restriction and clear-results control now appear only when the workspace type is **education** and the education flag is not disabled. Explicit education workspaces keep these controls. Business workspaces do not load academic sessions/terms for this page or include hidden education keys in a general preferences save.

Changing presentation does not delete academic data or silently rewrite legacy stored values. Saving the Workspace Profile is an explicit operation; for a business workspace it records the education module as off. Other education modules and legacy database/table names are not renamed or migrated in this slice.

The settings catalogue tells JD whether academic surfaces apply to the current workspace, separately from whether old values are stored. This prevents a stored CA score or legacy flag from being treated as proof that the business UI currently exposes that module.

Mobile setting rows reset the label's flex size when the layout stacks vertically. The old desktop `220px` basis no longer creates a 220px-high label on phones.

“Configured project” is derived from the runtime client's public endpoint instead of hard-coding the old project. Region is explicitly unknown because the client URL does not establish it. A custom endpoint is labelled as such. This display is not a live backend connection/deployment check.

## Release and verification

No new SQL migration is included. The candidate depends on the existing settings proposal, review, owner/admin role and hash-bound step-executor migrations. Verify their actual deployed versions in isolated staging; do not assume source files or a merged PR mean they are installed.

The changed backend runtime/helper is shared by `jd-automation`, `jd-execution-worker` and `jd-mcp`. Use the existing reviewed backend release process with source-pinned staging evidence. Frontend rollout alone does not install the new JD tool. Older/missing backend receipts are treated as uncertain, never as confirmed changes or a reason to bypass approval.

Required live acceptance remains: real owner/admin and denied-role sessions, two-tenant isolation, deployed RPC grants/hash checks, current-value conflicts, partial failure/resume, lost acknowledgement/new-session read-back, business and education UI behaviour on the actual mobile host. The user's local-only restriction remains; no production record or deployment was changed here.

Local commands:

```sh
npm ci
npm run test:settings
npm run test:chat-layout  # requires local Chromium; see CHROMIUM_EXECUTABLE_PATH
```

`test:settings` runs real registry, transformed HTTP and PGlite SQL tests with synthetic sessions. The pgcrypto SHA-256 operation is provided by a small wrapper around PostgreSQL's built-in SHA-256; this is not live extension verification. Browser fixtures render the actual SettingsPage and ReviewCentre without external requests. See the [evidence report](../docs/evidence/2026-11-16-business-settings/REPORT.md).
