# OAuth-first connections and real service logos

## Implemented

The normal JD directory now uses **Connect → provider sign-in → consent → MCP discovery** rather than token-entry forms. GitHub is included. An account is not reported as a working MCP connection until discovery succeeds.

- **13 MCP OAuth provider routes**: GitHub, Slack, Notion, Vercel, Asana, ClickUp, Todoist, Pipedrive, Atlassian, Airtable, Supabase, Cloudflare and Linear. Jira/Confluence share the Atlassian route.
- **11 existing Google/Microsoft native app entries** keep explicit selected-app OAuth consent. They now refresh expiring credentials automatically on authorised reads, with an explicit refresh control as well.
- Across the 78-entry directory: **25 sign-in entries**, **2 limited public services** (Exa/Firecrawl), and **51 entries unavailable in the ordinary no-key flow**. The default remains the 22-tool useful shortlist. Resend and other key-only services are not falsely labelled OAuth or secretly funded by JD.
- Token/custom-server entry controls are absent from the ordinary directory and connection manager. Backend registration/reconnection of custom token servers is disabled by default; an explicit operator-only compatibility flag is documented separately.
- **62 sourced service/group logo SVGs**, including all 22 priority services and GitHub's actual mark, replace letter placeholders. They are locally served, not fetched from a tracking/logo service at runtime. Less-common services without sourced artwork use an explicitly labelled generic MCP icon, not invented brand artwork. Provenance/hashes are in `src/connectors/logos.json`; licences/notices are in `public/connectors/`.

## Security and lifecycle

- Registered OAuth clients, PKCE S256, cryptographically random one-time state, a 10-minute state expiry, encrypted verifier/token storage, fixed provider MCP endpoints and operator-reviewed/allowlisted authorization/token URLs.
- Browser responses never include client secrets, access tokens, refresh tokens or PKCE verifiers. Provider token requests reject redirects and have timeouts and bounded JSON responses. Generic error pages do not echo provider errors/codes/tokens.
- GitHub requires its registered confidential client and published authorization/token endpoints. Slack uses its distinct confidential **user-token** endpoints; its documented `token_type: user` response and nested granted-scope field are normalised only for Slack. See `provider-research.json`; documentation is not runtime verification.
- Personal by default. Only owners/admins can explicitly share a connection with authorised workspace managers. The gateway and runtime enforce actor/tenant visibility on discovery, calls, approvals and execution history—not merely hidden menus.
- One workspace/endpoint account slot remains a schema limitation. Another user cannot replace its owner. Sharing cannot be changed on an existing history slot, preventing reconnect from exposing previously private results.
- Reconnect invalidates old state/tokens, clears elevated grants/tool trust and expires pending approvals. SQL generation checks prevent stale callbacks/discovery from restoring a changed or disconnected connection. Claimed approvals cannot dispatch using a newer account generation.
- OAuth read-only hints are not automatically trusted. Human review is required to enable a read-only candidate; other OAuth calls require per-action human approval, even if an old full-control grant exists. Provider sign-in never authorises a production deployment.
- Rotating MCP refresh tokens use a lease and generation-checked save. Native Google/Microsoft refresh uses a personal-account lease and compare-and-swap on the original encrypted credential, with scope rechecks before content reads. Missing offline access or uncertain refresh requires sign-in again—not a user API key.
- Disconnect atomically erases local credentials/tools/grants and invalidates state/pending approvals. Optional configured provider token revocation happens after local deletion and has a separate reported outcome. History retains its access boundary. In-flight provider requests may still finish.

## Verification — local/synthetic, not live accounts

| Check | Result | Evidence |
|---|---|---|
| All Node tests | **1,396 passed, 0 failed** (92 additional tests over base) | `all-node-tests.log` |
| Dedicated connector OAuth suite | **81 passed** | `oauth-tests.log` |
| Work-app/native refresh suite | **78 passed** | `work-app-tests.log` |
| Full chat/site/settings/theme/layout suite | Passed, exit 0 | `all-layout-tests.log` |
| Composer/connector UI | **72 states**, 320/393/1280 widths, light/dark | `browser-results.json`, screenshots |
| Contrast sampling | **2,448 samples, 0 findings** | `browser-results.json` |
| Deno type checks | New OAuth handler, gateway, business platform, full runtime passed | `deno-check.log` |
| Deno execution truthfulness contracts | **10 passed** | `deno-tests.log` |
| Web production build and verification | Passed; existing spreadsheet-vendor size warning retained | `build.log` |
| Verification guards | Passed | `guards.log` |
| npm dependency audit | **0 vulnerabilities** | `audit.log` |

The new tests exercise actual transformed Edge handlers, actual encrypted-token helpers and actual repository migrations/RPCs in local PGlite. They cover denied consent, missing registration, one-time/expired state, actor/tenant boundaries, partial scopes, token refresh/rotation, concurrent leases, late callback/refresh/discovery after disconnect, account-generation changes during approval, history sharing, provider revocation failure, no automatic writes, no-key browser paths and local logo integrity.

Browser tests use synthetic provider configuration, intercepted popups and fixtures. They do not contact providers, register apps, grant access or prove OAuth interoperability.

### Retained failures and fixes

- Initial SQL fixture reused the same synthetic state hash for two independent tenant sessions. The unique state constraint correctly rejected it. The fixture was corrected to generate distinct test states; `oauth-initial-fixture-failure.log` retains the initial failure.
- Initial Deno check found a JavaScript `RequestInit.redirect` inference error. Added a return type annotation; final type checks passed. Initial output: `deno-initial.log`.
- The sandbox could not fetch Deno std from `deno.land` (TLS/network restriction). `deno-network-failure.log` records it. The same official std **0.224.0** release was retrieved from the allowed `denoland/std` GitHub repository into temporary cache and mapped locally without changing the test or its assertions. All ten contracts then passed.
- Deno's temporary automatic npm resolution was followed by `npm ci` to restore the committed dependency lockfile. Final Node/browser/build/audit runs used the restored dependencies. No runtime dependency or lockfile changes are included.

## Deployment and acceptance boundary

**No new backend function, migration, provider app registration, live OAuth consent, live tool call or production acceptance was performed in this task.** No managed provider API subscription, billable infrastructure or JD-funded key was enabled. Any CI/preview receipts added after this report are source/preview evidence only.

This is a registered-client OAuth implementation with explicit operator prerequisites. It does **not** implement automatic dynamic client registration, auto-hosted Vercel CIMD, GitHub App repository installation selection or every provider-specific enterprise mode. Providers requiring a different flow must remain unconfigured. Operator configuration is not proof that the provider will accept that registration.

Existing native functionality limits remain: Excel/Word currently discover files and metadata; Teams lists joined teams; native sending/editing/sharing/deleting is not implemented. OAuth changes authentication, not the set of native app operations.

See **`docs/CONNECTOR_OAUTH_SETUP.md`** for exact deployment dependencies, server-only configuration schema, least-scope review, registered-client requirements, safe rollout, live acceptance checklist and rollback warnings. In particular, **never roll back to a gateway that ignores private connection ownership while private execution history exists**.

## Reproduction

```sh
npm ci
npm run test:connector-oauth
npm run test:work-apps
node --experimental-strip-types --test $(find scripts -maxdepth 1 -name 'test-*.mjs' ! -name '*layout*' ! -name 'test-verification-guards.mjs' | sort)
npm run test:chat-layout
npm run verify:web
npm run test:guards
npm audit --audit-level=moderate
deno check --node-modules-dir=auto supabase/functions/jd-connect-oauth/index.ts supabase/functions/jd-connect/index.ts supabase/functions/jd-business-platform/index.ts supabase/functions/_shared/jd-agent-runtime.ts
deno test --node-modules-dir=auto --allow-read=supabase/functions/jd-connect/index.ts supabase/functions/_shared/jd-connect-execution.test.ts
```

Chromium must be available. Sandbox evidence used a temporary packaged Chromium with `CHROMIUM_EXECUTABLE_PATH`, its library/font paths, and `JD_CONNECTOR_EVIDENCE_DIR`. Binaries/caches are not shipped. Both CI workflows now run the OAuth tests; Verify also type-checks the new callback function. Final source hashes are recorded separately in this folder.
