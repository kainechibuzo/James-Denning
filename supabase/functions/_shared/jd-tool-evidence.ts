/** Conservative success check for agent tool results. Non-empty objects alone do not prove success. */
export function isSuccessfulToolResult(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  if (Object.keys(result).length === 0) return false;
  if (result.ok === false || result.success === false) return false;
  if (typeof result.error === "string" && result.error.trim()) return false;
  if (typeof result.status === "string" && ["failed", "failure", "error", "rejected", "cancelled"].includes(result.status.toLowerCase())) return false;
  return true;
}
