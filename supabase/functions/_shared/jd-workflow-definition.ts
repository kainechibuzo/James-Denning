export type WorkflowNodeType = "trigger" | "action" | "condition" | "delay" | "end";
export type WorkflowNode = { id: string; type: WorkflowNodeType; config?: Record<string, unknown> };
export type WorkflowEdge = { id: string; source: string; target: string; label?: string };
export type WorkflowDefinition = { name: string; description?: string; nodes: WorkflowNode[]; edges: WorkflowEdge[]; version?: number };
export type WorkflowValidation = { valid: boolean; errors: string[]; definition: WorkflowDefinition | null };

const NODE_TYPES = new Set<WorkflowNodeType>(["trigger", "action", "condition", "delay", "end"]);
const TRIGGERS = new Set(["manual", "task.created", "task.overdue", "schedule.due"]);
const ACTIONS = new Set(["create_task", "generate_report", "request_approval"]);
const MAX_NODES = 100;
const MAX_EDGES = 200;
const MAX_CONFIG_BYTES = 8192;
const SAFE_KEY = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function text(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}
function hasUnsafeKeys(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasUnsafeKeys);
  if (!record(value)) return false;
  return Object.entries(value).some(([key, child]) =>
    ["__proto__", "prototype", "constructor"].includes(key) || hasUnsafeKeys(child)
  );
}

/** Validates a workflow draft only. It never executes nodes or performs writes. */
export function validateWorkflowDefinition(input: unknown): WorkflowValidation {
  const errors: string[] = [];
  if (!record(input)) return { valid: false, errors: ["Workflow definition must be an object"], definition: null };
  const name = input.name;
  const description = input.description;
  const nodes = input.nodes;
  const edges = input.edges;
  if (!text(name, 120)) errors.push("Workflow name is required and must be at most 120 characters");
  if (description !== undefined && (typeof description !== "string" || description.length > 2000)) errors.push("Description must be at most 2000 characters");
  if (!Array.isArray(nodes) || nodes.length < 2 || nodes.length > MAX_NODES) errors.push(`Workflow must contain between 2 and ${MAX_NODES} nodes`);
  if (!Array.isArray(edges) || edges.length > MAX_EDGES) errors.push(`Workflow must contain at most ${MAX_EDGES} edges`);
  if (!Array.isArray(nodes) || !Array.isArray(edges)) return { valid: false, errors, definition: null };
  if (hasUnsafeKeys(input)) errors.push("Unsafe object keys are not allowed");
  const ids = new Set<string>();
  const normalNodes: WorkflowNode[] = [];
  for (const [index, raw] of nodes.entries()) {
    if (!record(raw) || !text(raw.id, 80) || !SAFE_KEY.test(raw.id)) {
      errors.push(`Node ${index + 1} has an invalid id`);
      continue;
    }
    if (ids.has(raw.id)) errors.push(`Duplicate node id: ${raw.id}`);
    ids.add(raw.id);
    if (!NODE_TYPES.has(raw.type as WorkflowNodeType)) {
      errors.push(`Node ${raw.id} has an unsupported type`);
      continue;
    }
    const config = raw.config === undefined ? {} : raw.config;
    if (!record(config)) errors.push(`Node ${raw.id} config must be an object`);
    else {
      if (JSON.stringify(config).length > MAX_CONFIG_BYTES) errors.push(`Node ${raw.id} config is too large`);
      if (hasUnsafeKeys(config)) errors.push(`Node ${raw.id} config contains unsafe keys`);
      if (raw.type === "trigger" && !TRIGGERS.has(String(config.event || ""))) errors.push(`Node ${raw.id} uses an unsupported trigger`);
      if (raw.type === "action" && !ACTIONS.has(String(config.action || ""))) errors.push(`Node ${raw.id} uses an unsupported action`);
      if (raw.type === "delay" && (!Number.isInteger(config.seconds) || Number(config.seconds) < 1 || Number(config.seconds) > 2592000)) errors.push(`Node ${raw.id} delay must be between 1 and 2592000 seconds`);
      if (raw.type === "condition" && !text(config.field, 80)) errors.push(`Node ${raw.id} condition requires a field`);
    }
    normalNodes.push({ id: raw.id, type: raw.type as WorkflowNodeType, config: record(config) ? config : {} });
  }
  const triggerNodes = normalNodes.filter((node) => node.type === "trigger");
  const endNodes = normalNodes.filter((node) => node.type === "end");
  if (triggerNodes.length !== 1) errors.push("Workflow must have exactly one trigger");
  if (endNodes.length < 1) errors.push("Workflow must have at least one end node");
  const edgeIds = new Set<string>();
  const adjacency = new Map<string, string[]>();
  const incoming = new Map<string, number>();
  const normalEdges: WorkflowEdge[] = [];
  for (const [index, raw] of edges.entries()) {
    if (!record(raw) || !text(raw.id, 80) || !SAFE_KEY.test(raw.id) || !text(raw.source, 80) || !text(raw.target, 80)) {
      errors.push(`Edge ${index + 1} is invalid`);
      continue;
    }
    if (edgeIds.has(raw.id)) errors.push(`Duplicate edge id: ${raw.id}`);
    edgeIds.add(raw.id);
    if (!ids.has(raw.source) || !ids.has(raw.target)) {
      errors.push(`Edge ${raw.id} references a missing node`);
      continue;
    }
    if (raw.source === raw.target) errors.push(`Edge ${raw.id} cannot loop to itself`);
    adjacency.set(raw.source, [...(adjacency.get(raw.source) || []), raw.target]);
    incoming.set(raw.target, (incoming.get(raw.target) || 0) + 1);
    normalEdges.push({ id: raw.id, source: raw.source, target: raw.target, ...(typeof raw.label === "string" ? { label: raw.label.slice(0, 80) } : {}) });
  }
  if (triggerNodes[0] && (incoming.get(triggerNodes[0].id) || 0) > 0) errors.push("Trigger node cannot have incoming edges");
  for (const node of normalNodes) {
    if (node.type !== "trigger" && (incoming.get(node.id) || 0) === 0) errors.push(`Node ${node.id} is unreachable from the trigger`);
    if (node.type !== "end" && !(adjacency.get(node.id) || []).length) errors.push(`Node ${node.id} has no outgoing edge`);
  }
  // A depth-first colour walk rejects cycles, keeping workflows bounded and predictable.
  const colour = new Map<string, number>();
  const visit = (id: string): boolean => {
    if (colour.get(id) === 1) return false;
    if (colour.get(id) === 2) return true;
    colour.set(id, 1);
    for (const next of adjacency.get(id) || []) if (!visit(next)) return false;
    colour.set(id, 2);
    return true;
  };
  for (const node of normalNodes) if (!visit(node.id)) { errors.push("Workflow contains a cycle"); break; }
  // Every node must be reachable from the sole trigger.
  if (triggerNodes.length === 1) {
    const reached = new Set<string>();
    const queue = [triggerNodes[0].id];
    while (queue.length) {
      const current = queue.shift()!;
      if (reached.has(current)) continue;
      reached.add(current);
      queue.push(...(adjacency.get(current) || []));
    }
    for (const node of normalNodes) if (!reached.has(node.id)) errors.push(`Node ${node.id} is not reachable from the trigger`);
  }
  const definition: WorkflowDefinition = {
    name: typeof name === "string" ? name.trim() : "",
    ...(typeof description === "string" ? { description: description.trim() } : {}),
    nodes: normalNodes,
    edges: normalEdges,
    version: Number.isInteger(input.version) && Number(input.version) > 0 ? Number(input.version) : 1,
  };
  return { valid: errors.length === 0, errors: [...new Set(errors)], definition: errors.length === 0 ? definition : null };
}
