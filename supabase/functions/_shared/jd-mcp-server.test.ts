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
    "jd_create_operational_task",
    "jd_transition_operational_task",
  ]) assertEquals(source.includes(name), true);
  assertMatch(source, /internalActorId: actorId/);
  assertMatch(source, /callConnect\("approvals\.get"/);
  assertMatch(source, /callConnect\("executions\.list"/);
  assertMatch(source, /Only treat the action as completed when approval\.status is executed/);
  assertMatch(source, /invokeAutomation\("operations\.task\.create"/);
  assertMatch(source, /invokeAutomation\("operations\.task\.transition"/);
  assertMatch(source, /idempotencyId: idempotency_id/);
  assertMatch(source, /status: next_status/);
  assertMatch(source, /Approval requested\. The external action has NOT executed\./);
  assertMatch(source, /\.eq\("school_id", schoolId\)/);
});

Deno.test("jd_get_workspace_overview reads organisation, members, tasks and connector counts", () => {
  const start = source.indexOf('"jd_get_workspace_overview"');
  const end = source.indexOf('"jd_list_operational_tasks"', start);
  const block = source.slice(start, end);
  for (const table of ['from("schools")','from("profiles")','from("jd_operational_tasks")','from("jd_connector_servers")']) {
    assertEquals(block.includes(table), true, `workspace overview missing ${table}`);
  }
  assertMatch(block, /\.eq\("school_id", schoolId\)/);
});

Deno.test("jd_list_operational_tasks returns persisted organisation-scoped tasks", () => {
  const start = source.indexOf('"jd_list_operational_tasks"');
  const end = source.indexOf('"jd_list_execution_activity"', start);
  const block = source.slice(start, end);
  assertMatch(block, /from\("jd_operational_tasks"\)/);
  assertMatch(block, /\.eq\("school_id", schoolId\)/);
  assertMatch(block, /order\("updated_at"/);
});

Deno.test("jd_list_execution_activity returns persisted automation execution evidence", () => {
  const start = source.indexOf('"jd_list_execution_activity"');
  const end = source.indexOf('"jd_list_connected_mcp_tools"', start);
  const block = source.slice(start, end);
  assertMatch(block, /from\("jd_automation_steps"\)/);
  assertMatch(block, /\.eq\("school_id", schoolId\)/);
  assertMatch(block, /error_message: clip\(step\.error_message/);
});

Deno.test("jd_list_connected_mcp_tools returns only connected organisation tools", () => {
  const start = source.indexOf('"jd_list_connected_mcp_tools"');
  const end = source.indexOf('"jd_call_connected_mcp_tool"', start);
  const block = source.slice(start, end);
  assertMatch(block, /from\("jd_connector_tools"\)/);
  assertMatch(block, /\.eq\("school_id", schoolId\)/);
  assertMatch(block, /\.eq\("server\.status", "connected"\)/);
});

Deno.test("jd_call_connected_mcp_tool gates writes and retrieves approval results", () => {
  const start = source.indexOf('"jd_call_connected_mcp_tool"');
  const end = source.indexOf('"jd_get_connector_approval_status"', start);
  const block = source.slice(start, end);
  assertMatch(block, /callConnect\("approvals\.get"/);
  assertMatch(block, /callConnect\("tools\.call"/);
  assertMatch(block, /result\.requiresApproval/);
  assertMatch(block, /The external action has NOT executed/);
});
