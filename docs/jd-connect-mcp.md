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
- Read-only tools default to approval-required. A manager must explicitly trust a candidate that advertises `readOnlyHint: true`; destructive/open-world candidates cannot be trusted for automatic execution.
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

Migration: `supabase/migrations/20261113190000_jd_connect_mcp_platform.sql`.

The migration creates service-role-only tables for servers, encrypted credentials, discovered tools, approval requests and execution history. RLS is enabled and client roles receive no direct table grants. The authenticated Edge Function performs tenant and role checks before using the service role.

## Deploy and configure

1. Review the migration and apply it through the normal reviewed Supabase migration workflow.
2. Set the two secrets above in the Supabase project.
3. Deploy `jd-connect` with JWT verification enabled.
4. Deploy the updated `jd-execution-worker` and shared runtime code together so JD chat can discover and call connected tools.
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
- All tools require approval by default. A manager may explicitly trust a tool for automatic execution only when its server annotation marks it read-only and does not mark it destructive or open-world.
- Approval requests expire after 15 minutes.
- Tool results are not trusted as instructions.
- The browser never receives stored bearer tokens.
- The service-role key is used only by the server-side agent runtime to call the authenticated JD Connect Edge Function; never expose it in frontend code.
