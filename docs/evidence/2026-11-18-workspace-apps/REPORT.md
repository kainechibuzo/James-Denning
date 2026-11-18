# JD work apps — implementation and verification

## Result and release boundary

The directory now opens on the **22 agreed priority tools**, with **78 total entries**, **11 native read-only work apps**, **24 documented hosted MCP presets**, and **43 custom MCP setups**. Existing Gmail, Google Calendar, Teams and Google Drive listings are replaced rather than duplicated. The prior endpoint-only snapshot in `../2026-11-16-mcp-endpoints/` describes an earlier state, not the final inventory here.

This is a **locally tested implementation**, not a production acceptance statement. No real mailbox, file, calendar, provider account, OAuth grant or external tool was accessed during these tests. No infrastructure was provisioned and no backend migration or Edge Function was deployed. No connection badge is manufactured by browsing the directory.

### What works in source

| App | Implemented read operation | Important limit |
|---|---|---|
| Gmail | Search/list messages; read subject, sender, date, snippet by returned ID | No full body, attachments, drafts or send |
| Google Drive | Search/list files and folders; inspect file metadata | No content downloads, edits, sharing or delete |
| Google Sheets | Find spreadsheets; read a supplied range | Output capped at 50 rows × 26 columns; no edits |
| Google Docs | Find docs; read document body text | Text capped at 30,000 characters; no edits |
| Google Calendar | Upcoming primary-calendar events | No invitations or changes |
| Outlook | Recent mail and message previews by ID | No send, attachments or mailbox changes |
| OneDrive | File discovery/search and metadata | No downloads, sharing or delete |
| Excel | Discover Excel files and metadata | **Workbook cell reads and editing not implemented** |
| Word | Discover Word files and metadata | **Document body reads and editing not implemented** |
| Outlook Calendar | Upcoming events over 30 days | No invitations or changes |
| Microsoft Teams | List joined teams | **Chat/message reads and posting not implemented** |

JD chat has two actual registered native tools: `list_workspace_apps` and `read_workspace_app`. Provider content is explicitly marked untrusted. The UI does not make content reads just by loading setup or selecting an app.

### MCP tools retained in the useful shortlist

- Airtable, Linear, Resend, Exa, Firecrawl, GitHub, Supabase and Cloudflare use the documented hosted presets and existing Bearer/public transport. They still require allowlisting, explicit connection/discovery and appropriate grants. Published endpoints have **not** been authenticated or runtime-tested here. Linear uses the read-only endpoint. Write-capable MCP tools retain the existing approval path.
- Slack, Notion and the new Vercel preset are present but **OAuth-gated in the remote-MCP gateway**. This change does not implement their MCP browser sign-in. The older business-platform Slack OAuth identity/token flow is not a Slack MCP connection or an implemented chat adapter.
- Vercel source: <https://vercel.com/docs/agent-resources/vercel-mcp>. Official endpoint `https://mcp.vercel.com`; requires OAuth with CIMD or a reviewed client. Do not paste a Vercel API token as a substitute. Production deployment is not authorised by connecting or listing Vercel.

## Consent, isolation and security

- App selection is explicit. Backend code derives fixed read scopes from selected service IDs, rejects unknown/cross-provider service IDs, and stores the selected services in one-time OAuth state. Arbitrary client-supplied scopes are not used.
- Existing identity-only connections receive an empty app selection through the migration. They cannot silently gain mailbox/file access.
- The existing AES-GCM server-side credential encryption and PKCE flow are reused. No credential column is returned by the work-app catalogue.
- JWT and current profile establish the actor and tenant. Only owner/admin/manager roles can use these work-app paths. Owner access does not widen unrelated business-platform APIs.
- Reads require the selected app, all required granted scopes, a valid expiry, active connection, matching tenant and **the same user who authorised the provider**. No account sharing between managers is implied.
- The current schema has one provider account per workspace. A preflight check and database trigger prevent another actor from overwriting an active Google/Microsoft account, including concurrent callback upserts. Callback completion rechecks current workspace membership and role.
- Legacy Google/Microsoft refresh/verify/disconnect paths now enforce account ownership. New local disconnect erases credentials/app selection only for the current actor and tenant; it does **not** claim provider-side revocation. Remove JD from provider account permissions to revoke the underlying grant.
- All app reads use fixed HTTPS endpoints, GET only, no redirects, a 15-second timeout and a 1 MiB response-body limit. Invalid URLs/methods/actions in read arguments fail before credential access. Result JSON is capped at 60,000 characters and per-service projections discard unnecessary fields.
- An audit intent must be written before each external read. It records the service, not email/document content, query terms, record IDs or credentials. This is request evidence, not proof of successful completion.
- Expired/missing expiry, missing scopes, audit failure and provider errors fail closed. Automatic refresh is not implemented in the new app panel: reconnect when requested. The existing owner-restricted refresh API remains separate.
- **No native send/draft/edit/share/delete/publish action is implemented or implicitly approved.** Separate permission and approval designs are still needed for those actions.

## Local verification

- **1,304 Node tests passed**, zero failed: `all-node-tests.log`.
- **67 new work-app contract, actual adapter, actual transformed HTTP-handler and local PostgreSQL migration tests passed**: `work-app-tests.log`.
- **72 composer/connector browser states** across widths 320, 393 and 1280 in light/dark themes passed, including app selection, backend failure, missing configuration, OAuth failure, role restrictions and zero automatic external reads: `browser-tests.log`, `browser-results.json` and screenshots.
- Full `npm run test:chat-layout` suite reached its final successful connector tests: `all-layout-tests.log`. The initial tool wait timed out after 180 seconds while the process continued; the log was subsequently inspected through the final successful test output. No duplicate suite was launched.
- Web build/bundle verification passed: `build.log`. Existing large spreadsheet-vendor chunk warning remains.
- Verification guards passed: `guards.log`. npm audit reported zero vulnerabilities: `audit.log`.
- Deno checked the new service, business platform handler, callback and complete agent runtime: `deno-check.log`. The first check found a TypeScript indexed-provider type error; fixed with a narrowed key and rerun successfully. Initial output retained in `deno-check-before-fix.log`.
- The first local SQL fixture accidentally included unrelated trailing legacy DDL and failed before tests; fixture extraction was corrected. The failure is retained in `database-fixture-failure.log`; actual repository migration then passed all SQL/HTTP tests in `database-http-tests.log`.
- Deno's temporary npm resolution altered the sandbox dependency installation. `npm ci` restored the committed npm lockfile, then all 67 new tests, final web build and npm audit passed again. No dependency/lockfile changes are included.
- New tests are wired into both CI workflows; modified business handlers are added to the Verify workflow's Deno checks.

Tests use synthetic accounts, mocked transports and local PGlite. They do **not** prove provider OAuth approval, real Google/Microsoft permissions, Edge deployment, production RLS or live operational success.

## Operator rollout — separate approval required

1. Review/apply `20261118080000_jd_workspace_read_services.sql` in a genuinely separate approved environment, after existing business-platform migrations. It adds empty selected-service arrays, replaces the one-time state RPC signature and installs the owner-replacement guard. Never copy production data into staging.
2. Deploy the updated `jd-business-platform`, `jd-business-oauth-callback`, and every runtime consumer shipping `_shared/jd-agent-runtime.ts` (including JD automation, execution worker and inbound JD MCP as applicable). Frontend publication alone cannot enable these APIs.
3. Configure existing secret names securely: `JD_OAUTH_GOOGLE_CLIENT_ID`, `JD_OAUTH_GOOGLE_CLIENT_SECRET`, `JD_OAUTH_MICROSOFT_CLIENT_ID`, `JD_OAUTH_MICROSOFT_CLIENT_SECRET`, `JD_OAUTH_CALLBACK_URL`; provide a 32-byte AES key as `JD_OAUTH_ENCRYPTION_KEY` inside `JD_SECRETS_JSON`. Use an HTTPS registered callback and a trusted optional `JD_OAUTH_SUCCESS_REDIRECT`. Do not put secrets in source or browser config.
4. Enable the required Google APIs and configure OAuth consent/verification for selected scopes. Gmail and some other scopes can require provider review/security obligations. For Microsoft, register delegated Graph permissions and obtain tenant admin consent where policy requires. Selecting an app does not bypass provider review, licensing or tenant policy.
5. With expressly authorised test accounts, verify success, declined consent, partial consent, expiry, another user/tenant, callback replay, disconnect, role removal, credential encryption and the exact documented read outputs. Record provider and audit outcomes without retaining private contents or tokens.
6. Review results before any production rollout. Broader native write operations and Slack/Notion/Vercel MCP OAuth remain separate work, not hidden release claims.

### Rollback

Revert frontend/runtime changes and stop starting new app OAuth sessions first. Keep the additive columns and owner guard; they preserve safety and do not grant client access. If reverting the callback/state RPC together, account for the changed RPC return signature. Erase any new app credentials only under an authorised incident/rollback procedure. Do not drop columns containing consent records just to hide the UI.

## Reproduction

```sh
npm ci
npm run test:work-apps
node --experimental-strip-types --test $(find scripts -maxdepth 1 -name 'test-*.mjs' ! -name '*layout*' ! -name 'test-verification-guards.mjs' | sort)
npm run test:chat-layout
npm run verify:web
npm run test:guards
npm audit --audit-level=moderate
deno check --node-modules-dir=auto supabase/functions/_shared/jd-workspace-service.ts supabase/functions/jd-business-platform/index.ts supabase/functions/jd-business-oauth-callback/index.ts supabase/functions/_shared/jd-agent-runtime.ts
```

Browser tests need Chromium (`CHROMIUM_EXECUTABLE_PATH` if not in the standard system location). `JD_CONNECTOR_EVIDENCE_DIR` saves connector screenshots and structured browser results. Local sandbox Chromium needed its packaged library/font environment; these temporary binaries are not shipped.
