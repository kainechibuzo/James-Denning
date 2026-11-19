/** Conservative success check for agent tool results. Non-empty objects alone do not prove success. */
export function isSuccessfulToolResult(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  if (Object.keys(result).length === 0) return false;
  if (result.ok === false || result.success === false || result.outcome === "unknown") return false;
  if (typeof result.status === "string" && ["outcome_unknown", "unknown"].includes(result.status.toLowerCase())) return false;
  if (typeof result.error === "string" && result.error.trim()) return false;
  if (typeof result.status === "string" && ["failed", "failure", "error", "rejected", "cancelled"].includes(result.status.toLowerCase())) return false;
  return true;
}

/** Identify a tool result that explicitly says its side effect may have happened without verification. */
export function isUnknownToolResult(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  if (result.outcome === "unknown" || result.status === "outcome_unknown" || result.status === "unknown") return true;
  return isUnknownToolResult(result.result) || isUnknownToolResult(result.structuredContent);
}

/** Only explicit provider/tool rejection is a confirmed failure; missing evidence is ambiguous. */
export function isExplicitToolFailure(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  if (result.ok === false || result.success === false) return true;
  if (typeof result.error === "string" && result.error.trim()) return true;
  if (typeof result.status === "string" && ["failed", "failure", "error", "rejected", "cancelled"].includes(result.status.toLowerCase())) return true;
  return isExplicitToolFailure(result.result) || isExplicitToolFailure(result.structuredContent);
}
