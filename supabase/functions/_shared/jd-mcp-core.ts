export type McpTool = { name: string; description?: string; inputSchema?: Record<string, unknown>; annotations?: Record<string, unknown> };
export function validateMcpEndpoint(value: unknown, allowedHosts: string[]): URL {
  if (typeof value !== "string" || value.length > 2048) throw new Error("A valid MCP endpoint URL is required");
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("MCP endpoint must be a valid HTTPS URL"); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || (url.port && url.port !== "443")) throw new Error("MCP endpoints must use HTTPS on port 443 without embedded credentials, query strings or fragments");
  if (!host || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) throw new Error("Private, local and IP-address MCP endpoints are not allowed");
  const allow = new Set(allowedHosts.map(x => x.trim().toLowerCase()).filter(Boolean));
  if (!allow.has(host)) throw new Error("This MCP host is not on the server allowlist");
  return url;
}
const READ_ONLY_HINT_DENYLIST = new Set(["run_secret_scanning"]);
const GITHUB_READ_ONLY_TOOL_ALLOWLIST = new Set([
  "get_commit", "get_file_contents", "get_label", "get_latest_release", "get_me",
  "get_release_by_tag", "get_tag", "get_team_members", "get_teams", "issue_read",
  "list_branches", "list_commits", "list_issue_fields", "list_issue_types", "list_issues",
  "list_pull_requests", "list_releases", "list_repository_collaborators", "list_tags",
  "pull_request_read", "search_code", "search_commits", "search_issues",
  "search_pull_requests", "search_repositories", "search_users", "ui_get",
]);

export function isReadOnlyTool(tool: McpTool, provider?: string): boolean {
  const a = tool.annotations || {};
  const name = typeof tool.name === "string" ? tool.name.toLowerCase() : "";
  if (READ_ONLY_HINT_DENYLIST.has(name)) return false;
  if (a.readOnlyHint !== true || a.destructiveHint === true || a.openWorldHint === true) return false;
  if (provider === "github" || provider === "token:github") return GITHUB_READ_ONLY_TOOL_ALLOWLIST.has(name);
  return true;
}
export function parseMcpPayload(body: string, contentType: string): any {
  if (contentType.includes("text/event-stream")) {
    const events = body.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trim()).filter(Boolean);
    for (let i = events.length - 1; i >= 0; i--) { try { const parsed = JSON.parse(events[i]); if (parsed && typeof parsed === "object" && ("result" in parsed || "error" in parsed)) return parsed; } catch {} }
    throw new Error("MCP server returned no valid JSON-RPC response");
  }
  try { return JSON.parse(body); } catch { throw new Error("MCP server returned an invalid JSON response"); }
}
export function validateToolName(value: unknown): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_.:-]{1,128}$/.test(value)) throw new Error("Invalid MCP tool name");
  return value;
}

/** Reject transport-level "success" responses that contain no actionable result.
 * MCP providers may return content, structuredContent, scalar values or arrays.
 */
export function hasExplicitMcpFailure(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(hasExplicitMcpFailure);
  const record = value as Record<string, unknown>;
  if (record.isError === true || record.ok === false || record.success === false) return true;
  if (typeof record.error === "string" && record.error.trim()) return true;
  if (typeof record.status === "string" && ["failed", "failure", "error", "rejected", "cancelled"].includes(record.status.toLowerCase())) return true;
  return hasExplicitMcpFailure(record.structuredContent);
}

export function hasMeaningfulMcpResult(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.some((item) => hasMeaningfulMcpResult(item));
  if (typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (hasExplicitMcpFailure(record)) return false;
  if (typeof record.status === "string" && ["outcome_unknown", "unknown"].includes(record.status.toLowerCase())) return false;
  if (hasMeaningfulMcpResult(record.structuredContent)) return true;
  if (hasMeaningfulMcpResult(record.content)) return true;
  return Object.entries(record).some(([key, item]) =>
    !["isError", "_meta", "structuredContent", "content", "type"].includes(key) &&
    hasMeaningfulMcpResult(item)
  );
}
