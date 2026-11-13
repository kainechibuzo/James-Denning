export type JdTaskClass = "fast" | "balanced" | "reasoning";

export function classifyJdTask(prompt: string): JdTaskClass {
  const text = String(prompt || "").trim();
  if (/\b(strategy|strategic plan|business plan|forecast|scenario analysis|policy|standard operating procedure|sop|proposal|evaluate options|root cause|deep analysis|comprehensive report)\b/i.test(text)) {
    return "reasoning";
  }
  if (text.length <= 40 || /\b(quick|briefly|status|count|how many|what time|simple summary)\b/i.test(text)) {
    return "fast";
  }
  return "balanced";
}

function validModel(value: unknown): value is string {
  return typeof value === "string" &&
    value.trim().length > 1 &&
    value.trim().length <= 180 &&
    /^[a-z0-9][a-z0-9._:/-]*$/i.test(value.trim());
}

/**
 * Selects a task-appropriate model only when an operator has explicitly
 * configured that rung. Missing/invalid overrides always preserve the
 * configured default, so deployment behaviour does not silently change.
 */
export function selectJdModel(
  prompt: string,
  configuredModel: string,
  models: { fast?: string | null; reasoning?: string | null } = {},
): string {
  const task = classifyJdTask(prompt);
  const candidate = task === "fast" ? models.fast : task === "reasoning" ? models.reasoning : null;
  return validModel(candidate) ? candidate.trim() : configuredModel;
}
