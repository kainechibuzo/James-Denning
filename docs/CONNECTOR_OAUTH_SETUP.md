# JD OAuth-first connectors — operator setup

## User contract

Users choose a service, review permissions and personal/organisation sharing, then sign in with the provider. The ordinary directory and connection manager do not ask for a PAT or API key. Credentials are encrypted on the backend, not returned to the browser. A saved token is not a connected MCP server: discovery must succeed first.

Implemented MCP OAuth routes: **GitHub, Notion, Slack, Vercel, Asana, ClickUp, Todoist, Pipedrive, Atlassian (Jira + Confluence), Airtable, Supabase, Cloudflare and Linear**. Jira and Confluence use one account/endpoint slot. This is a registered-client OAuth implementation, not automatic dynamic client registration or a claim of tested provider interoperability.

Google Workspace and Microsoft 365 keep their native selected-app OAuth flows. Their read adapters now refresh expiring credentials automatically when offline access is available, with a rotating-token lease and compare-and-swap persistence. The Work apps panel also provides explicit refresh. Neither refresh nor sign-in enables native send/edit/delete actions.

Exa and Firecrawl offer explicit limited anonymous connection attempts, with no JD-funded key. Other key-only/custom services are **unavailable in the no-key flow**. No managed provider account, new usage billing or API subscription has been created.

## Deployment prerequisites

1. Apply existing business/connector migrations, then:
   - `20261118100000_jd_connector_oauth.sql`
   - `20261118100001_jd_workspace_refresh_leases.sql`
2. Deploy `jd-connect-oauth`, `jd-connect`, `jd-business-platform` and runtime consumers shipping `_shared/jd-agent-runtime.ts` / workspace readers. Examples include `jd-automation`, `jd-execution-worker` and `jd-mcp`; inspect the release dependency graph rather than deploying only the frontend.
3. Configure the registered HTTPS callback as `JD_MCP_OAUTH_CALLBACK_URL`. It points to the public GET callback of `jd-connect-oauth`. POST on that function requires an authenticated human JWT. It deliberately rejects service-role starts.
4. Configure the existing 32-byte base64 AES encryption key using `JD_OAUTH_ENCRYPTION_KEY`, or the matching field in `JD_SECRETS_JSON`. Keep the same key used for the corresponding stored credentials. Native workspace OAuth continues to use its existing secret bundle and client environment variables.
5. Put the exact MCP, authorization-server, token-server and optional revocation hostnames into `JD_MCP_ALLOWED_HOSTS`. HTTPS only, no IP literals, local/internal hosts, URL credentials, nonstandard ports or redirects. Do not add broad untrusted hosts just to make an error disappear.
6. Register JD as a client with each provider, obtain its approvals as required, and set **server-only** `JD_MCP_OAUTH_CLIENTS_JSON`. This is operator configuration, not a browser form or an end-user task.

Missing registration, secrets, callback or allowlist produces **Operator setup required**, not a token field or a false connected state. Backend deployment and real provider tests were not performed by the code-change task.

## Registered client configuration

`JD_MCP_OAUTH_CLIENTS_JSON` maps provider IDs above to these fields:

| Field | Meaning |
|---|---|
| `client_id` | The actual provider-registered client ID, or an accepted CIMD identifier where applicable |
| `client_secret` | Required only for confidential clients; stored exclusively as an Edge secret |
| `authorization_endpoint` | Exact provider-published authorization URL, without query parameters |
| `token_endpoint` | Exact provider-published token exchange URL, without query parameters |
| `token_endpoint_auth_method` | `none`, `client_secret_post` or `client_secret_basic` |
| `scopes` | Reviewed array of minimum provider scopes for the enabled feature set |
| `scope_separator` | Optional space (default) or comma, according to the provider |
| `resource` | Optional RFC 8707 resource; must exactly match the fixed MCP endpoint in `jd-connector-oauth-policy.mjs` |
| `authorization_parameters` | Optional reviewed `prompt`, `access_type` and/or `audience` strings; no arbitrary redirect/state/client overrides |
| `revocation_endpoint` | Optional provider-published token revocation endpoint; exact HTTPS allowlisted URL |

Obtain endpoints/scopes/client requirements from the current provider documentation and registration outcome. Do not copy speculative issuer URLs or assume a provider supports public clients, refresh, CIMD or a particular token authentication method. The adapter always uses authorization code + PKCE S256, one-time state and the registered callback. Providers requiring a different flow must stay unconfigured until supported and tested.

GitHub uses a registered confidential OAuth client against its MCP service, using `https://github.com/login/oauth/authorize` and `https://github.com/login/oauth/access_token` (see <https://github.com/github/github-mcp-server/blob/main/docs/host-integration.md>); this implementation is **not** a GitHub App installation/repository-picker flow. Review the scopes and organisation policies carefully. A broader GitHub OAuth scope is not equivalent to selecting individual repositories in a GitHub App installation. Use the narrowest scope supported by the intended MCP operations, and retain human approvals for writes/deployments.

Slack specifically uses `https://slack.com/oauth/v2_user/authorize` and `https://slack.com/api/oauth.v2.user.access`, not the older bot-token endpoints. Its documented `token_type: user` response is normalised to Bearer transport only for Slack; the granted scopes may be in `authed_user.scope`. The configuration rejects the legacy bot-token endpoints and public-client mode. See <https://docs.slack.dev/ai/slack-mcp-server/> and <https://docs.slack.dev/reference/methods/oauth.v2.user.access/>.

Vercel's provider guide describes CIMD or reviewed-client requirements. An OAuth client ID is not interchangeable with a Vercel API token. JD does not automatically host or register a CIMD document in this release. Slack and other restricted providers may require operator-side app review/registration. These requirements must not be shifted to ordinary users.

## Consent and account boundaries

- The backend derives tenant and actor from a verified JWT/current profile. User-submitted actor/tenant IDs do not establish authority.
- Default: personal account, usable only by its authorising user within that workspace. Only owners/admins may choose explicit organisation sharing with authorised workspace managers.
- The current registry has one connection slot per workspace/endpoint. It is **not** multi-account per user/provider. Another user's slot cannot be overwritten.
- Sharing scope is immutable for an existing slot/history. Reconnecting cannot turn prior private execution results into organisation-visible history. Keep the same sharing choice. An operator-reviewed account/history migration would be separate work.
- Beginning reconnect disables the old connection, invalidates prior state, erases old credentials, clears elevated grants/tool trust and expires pending approvals. Abandoning or declining the new provider consent does not restore the old connection automatically.
- The callback checks membership again. SQL completion also rechecks actor, role, generation, tenant and pending state. Disconnect/reconnect invalidates old callbacks and stale discovery.
- OAuth tool discovery does not trust provider read-only hints automatically. A human must review and trust a read-only candidate. All other OAuth calls require per-action human approval regardless of legacy `full_control` grants. Production deployment is never authorised merely by signing in.
- Every private gateway list/get/call path and runtime tool discovery enforces visibility. Refresh/discovery/approval execution checks connection generations. A claimed approval cannot silently switch to a newer account connection.
- OAuth token refresh uses a 45-second lease and conditional persistence; disconnect or a newer generation cannot be overwritten by a late refresh. Native Google/Microsoft refresh uses the original encrypted credentials as its additional compare-and-swap condition and rechecks the returned scopes before reading app content.
- Provider responses are untrusted. Authentication errors, missing offline access and unconfirmed rotation require sign-in again, never a request for a user API key.

## Disconnect and revocation

Disconnect erases JD credentials, tools and grants and invalidates pending state/approvals atomically. History is retained with its original access boundary. If a registered revocation endpoint is configured, JD attempts token revocation **after local deletion**. The response distinguishes a provider-accepted request from unconfirmed/unavailable revocation. Users should review the provider's authorised-apps page for remaining grants. Local deletion does not prove that all upstream grants were revoked, and already in-flight provider requests may still finish.

## Custom/operator compatibility

Legacy encrypted Bearer connections remain readable through the gateway. Ordinary users are not sent to their token setup forms. New custom token registration/reconnection is blocked server-side by default. The explicit operator escape hatch `JD_MCP_ALLOW_CUSTOM_SETUP=true` permits only human owners/admins to use the custom API; it does not enable an ordinary directory fallback or permit agent/runtime callers. Leave it off for an OAuth-only product.

## Live acceptance checklist

Use expressly authorised test accounts in an approved isolated environment; do not clone production data or create billable infrastructure without approval.

For **each provider**, record app registration/review status, actual callback URL, endpoint/resource/client-auth compatibility, scope consent, discovery result, a harmless read, a denied write approval, expiry/rotation, declined consent, callback replay, another actor/tenant, disconnect and revocation outcome. Test generation races and partial/missing consent. Do not retain tokens or private provider content in evidence.

Configuration is not deployment, deployment is not sign-in success, and successful sign-in is not a successful business action. Providers may have plan, tenant-admin or app-review restrictions. No provider in this change has been certified live by synthetic tests.

## Rollback

Apply additive migrations before code deployment. To roll back, disable new sign-in starts, retain private-connection visibility checks, and disable/revoke new OAuth connections under an approved procedure. **Do not deploy an old gateway that ignores `access_owner_user_id` while private connection history exists**: merely hiding the frontend or deleting tokens would not protect stored execution results. Keep additive consent/history columns and review any data migration separately. Native refresh leases can remain unused safely if its reader changes are reverted.

## Recorded direct test-DB rollout

The owner subsequently confirmed `thklwiybjuhrjqrrxyid` is the intended test database and explicitly requested deployment without separate staging. The application source from `19ce0114653f01e5e356c77f6ff1c1eba7ee5f10` was deployed through the scoped CLI release in GitHub Actions run **44290386627**. This exception does not amend the separate staged production-release procedure.

Seven functions were compiled/uploaded: `jd-connect-oauth`, `jd-connect`, `jd-business-platform`, `jd-business-oauth-callback`, `jd-automation`, `jd-execution-worker`, `jd-mcp`. Existing JWT settings were retained. The MCP callback URL was configured; existing encryption/worker credentials were preserved. Provider clients and MCP host allowlisting remain unverified (separate configuration variables were absent; existing bundled secret contents were not read), so this is **not** live OAuth acceptance.

The management API recorded migration timestamps different from the repository filenames. Their trimmed SQL hashes were checked against the repository and matched exactly:

| Repository migration | Applied history version |
|---|---|
| `20261118080000_jd_workspace_read_services.sql` | `20261118105244` |
| `20261118100000_jd_connector_oauth.sql` | `20261118105306` |
| `20261118100001_jd_workspace_refresh_leases.sql` | `20261118105315` |

Do not blindly reapply these migrations based on differing timestamps. Reconcile this mapping before any future migration automation. No unrelated pending migrations were applied.

See `docs/evidence/oauth-direct-deployment/` for source hashes, deployed versions/code hashes, schema/privilege observations, failed attempts, successful release and HTTP smoke receipts. The current OAuth test-DB workflow is **verification-only**; the one-shot deployment trigger was removed after recovery. A metadata status of ACTIVE is insufficient: the initial connector upload failed at startup and was superseded by the successful compiled CLI deployment.
