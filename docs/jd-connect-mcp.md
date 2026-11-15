# JD Connect — MCP gateway

JD Connect is a tenant-scoped remote MCP client and tool gateway for JD chat.

## Implemented

- Remote MCP Streamable HTTP over HTTPS using JSON-RPC 2.0.
- Exact hostname allowlisting through the server-side `JD_MCP_ALLOWED_HOSTS` secret.
- Optional bearer-token authentication, encrypted at rest with the existing `JD_OAUTH_ENCRYPTION_KEY`.
- MCP initialize, initialized notification, tools/list and tools/call.
- Tool schema discovery and persistence.
- JD chat discovery through `list_connected_mcp_tools`.
- JD chat invocation through `call_connected_mcp_tool`.
- Per-provider permission grants: `read_only`, `read_write` and `full_control`, with optional expiry and immediate revocation.
- `read_only` is the default when no active grant exists. `read_write` permits ordinary write-capable tools while destructive/open-world tools still require approval. `full_control` permits all discovered tools to execute directly under the workspace owner's explicit grant.
- Grant changes and revocations are audited; an expired grant automatically falls back to read-only.
- Every other tool call is saved as an approval request with encrypted arguments.
- Admin/manager approval queue, exact argument preview, approve-and-execute or decline.
- Tenant-scoped execution history and audit events.
- Tool results are marked and instructed as untrusted external content.
- The existing JD execution worker, queue, lease and retry pipeline are not modified.

## Supported transport and authentication

This implementation supports **remote Streamable HTTP MCP endpoints**. It does not spawn local STDIO processes. It currently supports bearer-token authentication supplied when registering a server. It does not yet implement an interactive OAuth authorization flow for arbitrary third-party MCP servers. Provider-specific OAuth already present in the business integration module is not automatically interchangeable with an MCP server's OAuth grant.

MCP protocol version sent by the client: `2025-06-18`. The gateway accepts JSON or SSE JSON-RPC responses. MCP server-specific authentication extensions and non-standard transports are not supported.

## Required server configuration

Set these Edge Function secrets before enabling connections:

- `JD_MCP_ALLOWED_HOSTS`: comma-separated exact hostnames, no wildcards. Only HTTPS endpoints on port 443 whose hostname exactly matches this allowlist can be registered.
- `JD_OAUTH_ENCRYPTION_KEY`: existing 32-byte base64 AES-GCM key used by JD's OAuth credential vault.

Do not put tokens or secrets in source control. Do not use wildcard host allowlists. The gateway rejects IP literals, localhost, local/internal hostnames, URL credentials, query strings and fragments. Network-level egress restrictions should additionally block private and link-local address ranges to mitigate DNS rebinding and infrastructure SSRF risks.

## Database

Migration: `supabase/migrations/20261114091134_jd_connect_mcp_platform.sql`.

The migration creates service-role-only tables for servers, encrypted credentials, discovered tools, approval requests and execution history. RLS is enabled and client roles receive no direct table grants. The authenticated Edge Function performs tenant and role checks before using the service role.

## Deploy and configure

1. Review the migration and apply it through the normal reviewed Supabase migration workflow.
2. Set the two secrets above in the Supabase project.
3. Deploy `jd-connect` with gateway JWT verification disabled only because the function validates the bearer token itself and accepts the service-role internal call only with a verified workspace actor id.
4. Deploy the updated `jd-mcp` and `jd-connect` functions together. The inbound MCP runtime forwards user-authenticated operational actions to the existing `jd-automation` task engine; it does not bypass its role checks or atomic audit RPC.
5. Open Settings → JD Connect, register an allowlisted HTTPS MCP endpoint and optionally provide its bearer token.
6. Refresh tools and verify the discovered schemas.
7. Ask JD to list connected MCP tools, then test a read-only tool.
8. Test a write-capable tool and verify that it creates an approval request and does not execute before approval.
9. Verify cross-tenant denial, disconnected-server denial, token secrecy, approval expiry, audit events and execution history before production use.

## Important rollout boundary

A code merge alone does not create provider credentials, enable third-party OAuth, add hosts to the allowlist, apply the database migration or deploy the Edge Function. These are explicit deployment and provider-configuration steps. Do not claim an integration is live until its endpoint, credentials, permissions and end-to-end operation have been verified.

## Security model

- Only workspace admins and managers can manage or invoke connectors.
- Connector records are isolated by `school_id`.
- Credentials and pending tool arguments are encrypted with AES-GCM.
- Each provider has an independent access grant: read-only, read/write or full control. No grant means read-only. Read/write permits ordinary writes; destructive and open-world tools remain approval-gated. Full control permits all discovered tools to execute directly. Grants can be revoked and optionally expire.
- Approval requests expire after 15 minutes.
- Disconnect revokes the stored bearer token, removes the tool catalogue, expires pending approvals and preserves execution history. Reconnect requires a new token for protected servers.
- Tool results are not trusted as instructions.
- The browser never receives stored bearer tokens.
- The service-role key is used only by the server-side agent runtime to call the authenticated JD Connect Edge Function; never expose it in frontend code.


## Inbound MCP — ChatGPT and coding agents

JD now also exposes an authenticated MCP server at:

`https://thklwiybjuhrjqrrxyid.supabase.co/functions/v1/jd-mcp`

The endpoint uses Supabase OAuth 2.1 discovery and user-bound tokens. Users authenticate with their existing JD account and approve the OAuth request on the first connection. The consent screen is hosted at `/oauth/consent`.

Core read/connector tools:
- `jd_get_workspace_overview`: privacy-conscious organisation and operational aggregates.
- `jd_list_operational_tasks`: tenant-scoped operational task records.
- `jd_list_execution_activity`: persisted execution-step evidence.
- `jd_list_connected_mcp_tools`: connected provider tools and their approval policy.
- `jd_call_connected_mcp_tool`: invokes a JD Connect tool; untrusted/write-capable actions create a manager approval request and do not run before approval. Pass the returned `approval_id` back to this same tool to retrieve its current approval state and persisted execution result after a manager approves it.

Additional action/evidence tools:
- `jd_get_connector_approval_status`: retrieves approval state and the persisted execution result after approval; it never approves or executes an action.
- `jd_list_connector_execution_evidence`: lists persisted external connector execution outcomes, including failures and error codes.
- `jd_create_operational_task`: creates a real task in `jd_operational_tasks` through the existing idempotent `jd-automation` action. Invoke only after the user explicitly confirms the task details.
- `jd_transition_operational_task`: moves a real task through the existing state machine and atomic task/audit RPC. Invoke only after the user explicitly confirms the requested transition.

All MCP calls require an authenticated workspace admin or manager. Queries are tenant-scoped using the signed-in user's profile. The endpoint never exposes service-role credentials to the client. External MCP descriptions/results are untrusted data. Successful connector calls return the persisted execution id, result and evidence flags; failed calls return a non-success MCP error and persist failure evidence when the database permits it. A pending approval is explicitly not an executed action.

### OAuth rollout requirements

- Enable Supabase Auth OAuth 2.1 on the existing main project and configure the asymmetric JWT signing key required by Supabase's MCP server middleware.
- Deploy the `jd-mcp` Edge Function with JWT gateway verification disabled; the function's OAuth middleware validates user tokens and publishes protected-resource metadata.
- Deploy the web build containing `/oauth/consent`.
- Verify OAuth discovery, sign-in, consent approval/denial, token refresh, role denial and cross-tenant isolation before treating the endpoint as production-ready.

### Lovable and other app-building MCP providers

Lovable's official MCP endpoint is `https://mcp.lovable.dev` and it requires OAuth 2.1; it does not accept a personal API key. JD Connect's current outbound gateway stores optional bearer tokens but does not yet perform the OAuth authorization-code/PKCE flow. Therefore Lovable is **not connected by this change**. The next outbound-connector slice must add OAuth discovery, PKCE login/callback, encrypted refresh-token storage and refresh handling before the Lovable endpoint can be registered. Do not paste an OAuth token into the bearer-token field as a substitute for that flow.

Lovable actions that create projects, send build prompts or deploy consume the connected workspace's credits or publish changes. JD must retain approval gates for those operations. Other vibe-coding clients can be added through the same standards-based outbound OAuth/MCP adapter once their OAuth requirements are verified.


## Per-provider permission grants

The JD Connect settings panel exposes three independently managed permission levels for each connected MCP server:

| Grant | Runtime behaviour |
| --- | --- |
| `read_only` | Default. Read-only tools may run only when the provider marks them read-only; writes require approval. |
| `read_write` | Read and ordinary write tools may execute. Destructive or open-world tools still require an explicit approval. |
| `full_control` | All discovered tools may execute under the explicit provider grant, including destructive/open-world tools. |

Managers can revoke elevated access at any time. Grants may have an expiry timestamp; expired or missing grants are treated as read-only. The grant table is service-role-only and tenant-scoped. The MCP tool caller delegates to JD Connect, so the same server-side grant enforcement applies to both the settings UI and inbound MCP clients.
