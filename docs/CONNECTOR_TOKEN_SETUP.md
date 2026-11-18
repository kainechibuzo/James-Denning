# User-pasted connector tokens

The owner explicitly replaced the no-PAT requirement with a guided token popup. For supported routes, **Connect** now opens a modal showing the provider's credential page, three instructions, a masked token field and explicit consent. No third-party integration subscription is needed for these direct routes.

## Supported routes

| Provider | Credential page | Documented remote token support |
|---|---|---|
| GitHub | https://github.com/settings/personal-access-tokens/new | https://github.com/github/github-mcp-server#remote-github-mcp-server |
| Linear | https://linear.app/settings/api | https://linear.app/docs/mcp |
| Airtable | https://airtable.com/create/tokens/new | https://airtable.com/developers/agents/mcp/other |
| Resend | https://resend.com/api-keys | https://github.com/resend/resend-mcp |
| Apify | https://console.apify.com/settings/integrations | https://github.com/apify/apify-mcp-server |
| Context7 | https://context7.com/dashboard | https://github.com/upstash/context7 |

The typed/shared policy at `supabase/functions/_shared/jd-connector-token-policy.mjs` (plain ESM) and the database RPC contain the six exact fixed endpoints. Tests check their agreement. No user-supplied endpoint, query token, custom headers or host is accepted by this flow. Existing arbitrary-host/custom setup remains gated. The six reviewed exact endpoints are allowed explicitly in the gateway; no wildcard or global secret allowlist modification is required. OAuth/public routes outside this set retain their existing allowlist rules.

This is not a claim that all 78 catalogue entries support API tokens. Native Google/Microsoft apps and OAuth-only remote services keep account sign-in. Entries without a verified compatible route don't collect credentials. No unverified API-key-to-OAuth substitution is offered. Provider scopes, organisational approval, account limits and charges still apply.

## Backend rollout

Prerequisite: existing connector platform, grants and `jd_connector_oauth` migrations. Apply only `20261118120000_jd_connector_pasted_tokens.sql`, then deploy `jd-connect` with its imported shared modules and existing `verify_jwt=false` (the handler verifies human JWTs). Preserve the current AES key. Do not bulk-push pending migrations or rotate `JD_SECRETS_JSON`.

`servers.token_setup` is a JWT/role-protected readiness check; `servers.token_connect` requires a signed-in owner/admin/manager and `confirm:true`, rejecting service-role starts. Tenant and actor come only from the current profile. The client submits a provider ID, not an endpoint. Validation rejects whitespace/control characters, URLs, empty and oversized values. Provider failures are not reflected into the browser; errors cannot echo submitted tokens.

The service-role-only `jd_save_connector_pasted_token` RPC atomically locks the workspace/endpoint slot, enforces immutable personal ownership, advances its generation, invalidates pending OAuth state/approvals, removes previous grants/tools/credentials and stores an AES-GCM encrypted token bundle. The existing `jd_connector_oauth_tokens` store and CAS discovery/disconnect implementation are reused. `oauth_provider_id = token:<provider>` marks manually rotated tokens. Existing runtime consumers already read these encrypted bundles and enforce personal ownership; the null expiry/refresh token prevents automatic OAuth refresh.

Registration alone remains status `error`/`DISCOVERY_REQUIRED`. Only successful MCP initialize/tools-list/CAS persistence confirms connection. Failed discovery deletes only that generation's credential and records an error, never deleting a newer token. One slot per workspace/endpoint is retained; shared histories or another user's slot cannot be overwritten. Token replacement intentionally invalidates earlier tool trust, grants and pending approvals.

Token-backed connections retain the restrictive OAuth-family approval path: every untrusted or write-capable tool requires a human decision; no broad read-write/full-control grant can be enabled. No token is returned from list responses or written to audit metadata. Provider tokens are sent only in HTTPS Authorization headers with redirects forbidden. Disconnect atomically deletes credentials and invalidates generations, does not attempt OAuth revocation of a PAT, and tells the user to revoke it on the provider's page. Already-in-flight requests cannot be recalled.

## Browser handling

Token values exist transiently in the password input/component/request memory; they are not persisted in localStorage/sessionStorage, URLs, application logs or chat. The input is cleared immediately on submission, on close/unmount and before replacement. Clipboard contents remain under the user's/browser's control; JD does not read the clipboard automatically. Browsers/password managers are outside JD's storage controls.

The modal uses native dialog background isolation plus explicit Tab cycling, Escape/Cancel, focus restoration, scroll containment and mobile-sized input text. Closing is disabled while saving to prevent an ambiguous abandoned request. Readiness failure disables the field. Failed requests offer no false success, clear the token and tell the user to inspect My connections before retrying. Backend responses must contain a connected server and tools array before the UI changes views.

## Verification

Run `npm run test:connector-tokens`, `npm run test:connector-oauth`, `node scripts/test-connector-tokens-layout.mjs`, and the existing connector/mobile suites. Evidence is under `docs/evidence/token-connect/`. All provider calls in local tests use synthetic tokens and mocked transport. No real provider token or paid operation is needed to run tests. Live deployment smoke tests do not establish end-to-end provider acceptance; a user must supply a valid token in the actual secured popup for that final check.
