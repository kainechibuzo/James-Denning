import { validateWorkflowDefinition } from "./jd-workflow-definition.ts";

function assert(value: unknown, message: string) { if (!value) throw new Error(message); }
function base(): any {
  return {
    name: "Daily operations",
    nodes: [
      { id: "start", type: "trigger", config: { event: "manual" } },
      { id: "create", type: "action", config: { action: "create_task" } },
      { id: "finish", type: "end" },
    ],
    edges: [
      { id: "e1", source: "start", target: "create" },
      { id: "e2", source: "create", target: "finish" },
    ],
  };
}

Deno.test("accepts a bounded workflow draft with allowlisted nodes", () => {
  const result = validateWorkflowDefinition(base());
  assert(result.valid, result.errors.join("; "));
  assert(result.definition?.version === 1, "defaults workflow version");
});

Deno.test("rejects malformed names, oversized graphs and unsupported node types", () => {
  const invalid = { ...base(), name: "", nodes: [...base().nodes, { id: "bad", type: "http" }] };
  const result = validateWorkflowDefinition(invalid);
  assert(!result.valid, "invalid definition rejected");
  assert(result.errors.some((error) => error.includes("name")), "name error returned");
  assert(result.errors.some((error) => error.includes("unsupported type")), "node allowlist enforced");
});

Deno.test("rejects duplicate ids, dangling edges and disconnected nodes", () => {
  const input = base();
  input.nodes.push({ id: "finish", type: "end" });
  input.edges.push({ id: "e3", source: "missing", target: "finish" });
  const result = validateWorkflowDefinition(input);
  assert(!result.valid, "invalid graph rejected");
  assert(result.errors.some((error) => error.includes("Duplicate node")), "duplicate node detected");
  assert(result.errors.some((error) => error.includes("missing node")), "dangling edge detected");
});

Deno.test("rejects cycles and nodes unreachable from trigger", () => {
  const input = base();
  input.edges[1] = { id: "e2", source: "create", target: "start" };
  const result = validateWorkflowDefinition(input);
  assert(!result.valid, "cyclic graph rejected");
  assert(result.errors.some((error) => error.includes("cycle")), "cycle detected");
});

Deno.test("rejects arbitrary action and trigger names", () => {
  const input = base();
  input.nodes[0] = { id: "start", type: "trigger", config: { event: "webhook.anywhere" } };
  input.nodes[1] = { id: "create", type: "action", config: { action: "fetch_url" } };
  const result = validateWorkflowDefinition(input);
  assert(!result.valid, "arbitrary external capabilities rejected");
  assert(result.errors.some((error) => error.includes("unsupported trigger")), "trigger allowlist enforced");
  assert(result.errors.some((error) => error.includes("unsupported action")), "action allowlist enforced");
});

Deno.test("bounds delay duration and config size", () => {
  const input = base();
  input.nodes[1] = { id: "create", type: "delay", config: { seconds: 99999999, padding: "x".repeat(9000) } };
  const result = validateWorkflowDefinition(input);
  assert(!result.valid, "unsafe delay rejected");
  assert(result.errors.some((error) => error.includes("delay")), "delay bound enforced");
  assert(result.errors.some((error) => error.includes("too large")), "config bound enforced");
});

Deno.test("rejects prototype-pollution keys", () => {
  const input = base();
  input.nodes[1] = { id: "create", type: "action", config: JSON.parse('{"action":"create_task","__proto__":{"admin":true}}') };
  const result = validateWorkflowDefinition(input);
  assert(!result.valid, "unsafe object rejected");
  assert(result.errors.some((error) => error.includes("unsafe")), "unsafe key identified");
});

Deno.test("never executes actions; validation returns normalized draft only", () => {
  const result = validateWorkflowDefinition(base());
  assert(result.valid, "draft validates");
  assert(!("execute" in (result.definition || {})), "no executable callback in definition");
});
