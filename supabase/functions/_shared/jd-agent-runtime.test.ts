import { addUsage, emptyUsage, isRetryableStatus, normaliseUsage, retryDelayMs, resolveFollowupModel, JD_AGENT_TOOL_NAMES, buildLaunchChecklistBatchKey, runJdMcpToolWithAudit } from "./jd-agent-runtime.ts";

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

Deno.test("usage normalisation never invents total tokens", () => {
  const usage = normaliseUsage({ input_tokens: 12, output_tokens: 7 });
  assertEqual(usage?.input_tokens, 12, "input tokens");
  assertEqual(usage?.output_tokens, 7, "output tokens");
  assertEqual(usage?.total_tokens, null, "unreported total tokens");
});

Deno.test("usage aggregation counts model requests and preserves missing totals", () => {
  const total = emptyUsage();
  addUsage(total, { input_tokens: 10, output_tokens: 4 });
  addUsage(total, { input_tokens: 8, output_tokens: 3, total_tokens: 11 });
  assertEqual(total.model_requests, 2, "model request count");
  assertEqual(total.usage_reported_requests, 2, "usage-reported request count");
  assertEqual(total.input_tokens, 18, "aggregated input tokens");
  assertEqual(total.output_tokens, 7, "aggregated output tokens");
  assertEqual(total.total_tokens, 11, "provider-reported total only");
  assertEqual(total.total_tokens_reported_requests, 1, "total-reporting request count");
});

Deno.test("only transient provider statuses are retried", () => {
  assertEqual(isRetryableStatus(429), true, "rate limit retry");
  assertEqual(isRetryableStatus(503), true, "service unavailable retry");
  assertEqual(isRetryableStatus(401), false, "authentication error is not retried");
  assertEqual(isRetryableStatus(400), false, "bad request is not retried");
});

Deno.test("retry delay is bounded and respects Retry-After seconds", () => {
  assertEqual(retryDelayMs(null, 1), 500, "first backoff");
  assertEqual(retryDelayMs(null, 2), 1000, "second backoff");
  assertEqual(retryDelayMs("1.5", 1), 1500, "Retry-After");
  assertEqual(retryDelayMs("99", 1), 8000, "maximum delay");
});

Deno.test("free router follow-up requests stay on the first selected model", () => {
  assertEqual(
    resolveFollowupModel("openrouter/free", "openrouter/free", "particle-ai/particle-1:free"),
    "particle-ai/particle-1:free",
    "pin selected free model",
  );
  assertEqual(
    resolveFollowupModel("openrouter/free", "particle-ai/particle-1:free", null),
    "particle-ai/particle-1:free",
    "retain pinned model when response omits model",
  );
});

Deno.test("configured model choices are never replaced by provider response metadata", () => {
  assertEqual(
    resolveFollowupModel("vendor/model:free", "vendor/model:free", "other/model:free"),
    "vendor/model:free",
    "preserve configured model",
  );
  assertEqual(
    resolveFollowupModel("openrouter/free", "openrouter/free", "invalid model slug"),
    "openrouter/free",
    "reject malformed selected model",
  );
});

Deno.test("launch checklist batch keys are stable but separate distinct checklists", async () => {
  const first = [{ title: "Recruit drivers", department: "Fleet", description: "Prepare a driver recruitment plan", priority: "high" }];
  const same = [{ title: "Recruit drivers", department: "Fleet", description: "Prepare a driver recruitment plan", priority: "high" }];
  const different = [{ title: "Recruit drivers", department: "Fleet", description: "Prepare a recruitment plan for another operation", priority: "high" }];
  assertEqual(await buildLaunchChecklistBatchKey(first), await buildLaunchChecklistBatchKey(same), "stable batch fingerprint");
  assertEqual(await buildLaunchChecklistBatchKey(first) === await buildLaunchChecklistBatchKey(different), false, "different checklists do not collide");
  assertEqual(await buildLaunchChecklistBatchKey(first, "fleet-launch-2026") === await buildLaunchChecklistBatchKey(first, "fleet-launch-2027"), false, "explicit checklist keys separate projects");
});

Deno.test("business finance intelligence tools are registered in JD", () => {
  assertEqual(JD_AGENT_TOOL_NAMES.includes("get_business_expense_anomalies"), true, "expense anomaly tool registered");
  assertEqual(JD_AGENT_TOOL_NAMES.includes("get_business_kpi_trends"), true, "business KPI trends tool registered");
});


Deno.test("native MCP calls are audited before and after execution without recording argument values", async () => {
  const events: any[] = [];
  const context: any = {
    schoolId: "workspace",
    userId: "actor",
    role: "admin",
    admin: { from: (table: string) => ({ insert: async (row: any) => { events.push({ table, row }); return { error: null }; } }) },
  };
  const result = await runJdMcpToolWithAudit(context, "call_connected_mcp_tool", { tool_id: "tool-1", token: "never-log-this" }, async () => ({
    requiresApproval: true,
    approval: { id: "approval-1" },
  }));
  assertEqual((result as any).requiresApproval, true, "tool result preserved");
  assertEqual(events.length, 2, "start and completion events written");
  assertEqual(events[0].row.event_type, "mcp.tool.started", "start event");
  assertEqual(events[1].row.event_type, "mcp.tool.completed", "completion event");
  assertEqual(events[0].row.event_json.tool_name, "call_connected_mcp_tool", "tool name recorded");
  assertEqual(events[0].row.event_json.argument_keys.includes("token"), true, "argument key recorded");
  assertEqual(JSON.stringify(events).includes("never-log-this"), false, "argument values never recorded");
  assertEqual(events[1].row.event_json.result_status, "approval_requested", "approval state recorded distinctly");
  assertEqual(events[1].row.event_json.approval_id, "approval-1", "approval ID linked");
});

Deno.test("native MCP tool is not invoked when its audit start cannot be persisted", async () => {
  let invoked = false;
  const context: any = {
    schoolId: "workspace",
    userId: "actor",
    role: "admin",
    admin: { from: () => ({ insert: async () => ({ error: new Error("audit unavailable") }) }) },
  };
  let message = "";
  try {
    await runJdMcpToolWithAudit(context, "read_tool", {}, async () => { invoked = true; return {}; });
  } catch (error) { message = error instanceof Error ? error.message : String(error); }
  assertEqual(invoked, false, "handler blocked before execution");
  assertEqual(message.includes("audit start could not be persisted"), true, "fail-closed audit error");
});

Deno.test("pending approvals inventory is registered as a read-only native capability", () => {
  assertEqual(JD_AGENT_TOOL_NAMES.includes("list_pending_approvals"), true, "pending approvals tool registered");
});
