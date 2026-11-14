import { assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";

const source = await Deno.readTextFile(new URL("../jd-mcp/index.ts", import.meta.url));
const config = await Deno.readTextFile(new URL("../../config.toml", import.meta.url));

Deno.test("JD MCP is protected by OAuth discovery and authenticated Supabase user middleware", () => {
  assertMatch(source, /withOAuthProtectedResource\(\)/);
  assertMatch(source, /withSupabase\(\{ auth: "user" \}\)/);
  assertMatch(config, /\[auth\.oauth_server\]/);
  assertMatch(config, /\[functions\.jd-mcp\][\s\S]*?verify_jwt = false/);
});

Deno.test("JD MCP exposes tenant-scoped read tools and approval-gated connector calls", () => {
  for (const name of [
    "jd_get_workspace_overview",
    "jd_list_operational_tasks",
    "jd_list_execution_activity",
    "jd_list_connected_mcp_tools",
    "jd_call_connected_mcp_tool",
    "jd_get_connector_approval_status",
    "jd_list_connector_execution_evidence",
  ]) assertEquals(source.includes(name), true);
  assertMatch(source, /internalActorId: actorId/);
  assertMatch(source, /callConnect\("approvals\.get"/);
  assertMatch(source, /callConnect\("executions\.list"/);
  assertMatch(source, /Only treat the action as completed when approval\.status is executed/);
  assertMatch(source, /Approval requested\. The external action has NOT executed\./);
  assertMatch(source, /\.eq\("school_id", schoolId\)/);
});
