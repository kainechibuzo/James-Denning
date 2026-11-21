import { addUsage, emptyUsage, isRetryableStatus, normaliseUsage, retryDelayMs, resolveFollowupModel, JD_AGENT_TOOL_NAMES, buildLaunchChecklistBatchKey, isTrustedGithubReadTool, runJdMcpToolWithAudit, summariseToolEvidence, runAgentAssignment, proposeAgentDefinition } from "./jd-agent-runtime.ts";
import { builtinSpecialist, WORKFORCE_GRANTABLE_TOOLS } from "./jd-agent-workforce.ts";

function assistantMessage(text: string) {
  return { output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text }] }], status: "completed" };
}

function functionCalls(calls: Array<{ callId: string; name: string; arguments?: string }>) {
  return { output: calls.map((call) => ({ type: "function_call", call_id: call.callId, name: call.name, arguments: call.arguments ?? "{}" })), status: "completed" };
}

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
    capability: "call_connected_mcp_tool",
    result: { requiresApproval: true, approval: { id: "approval-1" } },
  }));
  assertEqual((result as any).result.requiresApproval, true, "tool result preserved");
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

Deno.test("tool evidence records approval requests without claiming provider execution", () => {
  const evidence = summariseToolEvidence({
    requiresApproval: true,
    approval: { id: "approval-reference" },
  });
  assertEqual(evidence.approval_requested, true, "approval request recorded");
  assertEqual(evidence.external_action_executed, false, "provider action explicitly not executed");
  assertEqual(evidence.execution_state, "approval_requested", "execution state is explicit");
  assertEqual(evidence.approval_id, "approval-reference", "approval reference linked");
});


Deno.test("Claude MCP exposes first-class GitHub repository search and file-reading capabilities", () => {
  assertEqual(JD_AGENT_TOOL_NAMES.includes("search_connected_repository_code"), true, "repository code search registered");
  assertEqual(JD_AGENT_TOOL_NAMES.includes("read_connected_repository_file"), true, "repository file read registered");
});

Deno.test("GitHub repository access trusts only explicitly annotated persisted read-only tools", () => {
  assertEqual(isTrustedGithubReadTool({ read_only: true, annotations: { readOnlyHint: true } }), true, "explicit read-only tool accepted");
  assertEqual(isTrustedGithubReadTool({ read_only: false, annotations: { readOnlyHint: true } }), false, "persisted approval gate respected");
  assertEqual(isTrustedGithubReadTool({ read_only: true, annotations: { readOnlyHint: true, destructiveHint: true } }), false, "destructive tool rejected");
  assertEqual(isTrustedGithubReadTool({ read_only: true, annotations: { readOnlyHint: true, openWorldHint: true } }), false, "open-world tool rejected");
  assertEqual(isTrustedGithubReadTool({ read_only: true, annotations: { readOnlyHint: "true" } }), false, "string annotation rejected");
});

Deno.test("workforce assignments run a bounded read-only tool loop and reject ungranted tools", async () => {
  const role = builtinSpecialist({ kind: "builtin", id: "finance_analyst" })!;
  const resolved = {
    ref: { kind: "builtin", id: "finance_analyst" },
    name: role.name,
    instructions: [role.charter],
    allowedTools: role.allowedTools,
    maxModelRounds: role.maxModelRounds,
    maxOutputTokens: role.maxOutputTokens,
    source: "builtin" as const,
  };
  const assignment = {
    agent: { kind: "builtin" as const, id: "finance_analyst" },
    task: "Analyse the supplied expense summary and flag budget risks.",
    context: "",
    requestedTools: ["get_billing_snapshot"],
  };
  const executed: string[] = [];
  const requests: Array<any> = [];
  const result = await runAgentAssignment({
    resolved,
    assignment,
    toolSpecs: [{ type: "function", name: "get_billing_snapshot", description: "Read a bounded billing snapshot", parameters: { type: "object", properties: {}, additionalProperties: false } }],
    requestModel: async (payload) => {
      requests.push(payload);
      if (requests.length === 1) {
        return functionCalls([
          { callId: "c1", name: "get_billing_snapshot" },
          { callId: "c2", name: "deploy_specialist_workforce" },
          { callId: "c3", name: "get_billing_snapshot", arguments: "not-json" },
        ]);
      }
      return assistantMessage("Findings: two budget risks. JD must independently verify both.");
    },
    executeTool: async (name) => {
      executed.push(name);
      return { bill_count: 2, total_billed: 100 };
    },
  });
  assertEqual(executed.length, 1, "only granted tools execute");
  assertEqual(executed[0], "get_billing_snapshot", "granted tool ran once");
  assertEqual(result.rounds, 2, "two model requests");
  assertEqual(result.report.includes("independently verify"), true, "report returned");
  assertEqual(result.toolEvents.length, 3, "one event per attempted call");
  assertEqual(result.toolEvents[0].status, "completed", "granted call completed");
  assertEqual(result.toolEvents[1].name, "deploy_specialist_workforce", "forbidden tool recorded");
  assertEqual(result.toolEvents[1].status, "failed", "forbidden tool never executes");
  assertEqual(result.toolEvents[2].status, "failed", "malformed arguments fail closed");
  assertEqual((requests[0].input[0] as any).content.includes("finance_analyst"), true, "assignment brief includes the role");
  assertEqual(JSON.stringify(requests[1].input).includes("This tool was not granted with the assignment"), true, "ungranted tool output tells the specialist");
});

Deno.test("assignments that never produce a report fail their round limit", async () => {
  const role = builtinSpecialist({ kind: "builtin", id: "research_analyst" })!;
  const resolved = {
    ref: { kind: "builtin", id: "research_analyst" },
    name: role.name,
    instructions: [role.charter],
    allowedTools: role.allowedTools,
    maxModelRounds: 2,
    maxOutputTokens: 2000,
    source: "builtin" as const,
  };
  let requests = 0;
  let message = "";
  try {
    await runAgentAssignment({
      resolved,
      assignment: { agent: { kind: "builtin", id: "research_analyst" }, task: "Review the supplied repository context for research sources.", context: "", requestedTools: [] },
      toolSpecs: [],
      requestModel: async () => {
        requests += 1;
        return functionCalls([{ callId: `c${requests}`, name: "search_connected_repository_code" }]);
      },
      executeTool: async () => ({}),
    });
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  assertEqual(message.includes("tool-round limit"), true, "round limit is explicit");
  assertEqual(requests, 2, "no request beyond the limit");
});

Deno.test("workforce tool grants never include delegation or write-capable tools", () => {
  for (const tool of ["deploy_specialist_workforce", "delegate_to_specialist_agent", "propose_agent_definition", "create_business_document_draft", "call_connected_mcp_tool"]) {
    assertEqual(WORKFORCE_GRANTABLE_TOOLS.includes(tool), false, `${tool} is never grantable to specialists`);
  }
});

Deno.test("the agent factory fails closed before any database write when release-gated", async () => {
  let rpcCalls = 0;
  const result = await proposeAgentDefinition({}, {
    admin: { rpc: async () => { rpcCalls += 1; return { data: null, error: null }; } },
    schoolId: "workspace",
    userId: "actor",
    role: "admin",
  } as any);
  assertEqual((result as any).persisted, false, "nothing persisted");
  assertEqual((result as any).error.includes("release-gated"), true, "gate error surfaced");
  assertEqual(rpcCalls, 0, "no registry RPC invoked");
});
