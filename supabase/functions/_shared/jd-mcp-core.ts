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
export function isReadOnlyTool(tool: McpTool): boolean {
  const a = tool.annotations || {};
  return a.readOnlyHint === true && a.destructiveHint !== true && a.openWorldHint !== true;
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
export function hasMeaningfulMcpResult(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.some((item) => hasMeaningfulMcpResult(item));
  if (typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (record.isError === true) return false;
  if (hasMeaningfulMcpResult(record.structuredContent)) return true;
  if (hasMeaningfulMcpResult(record.content)) return true;
  return Object.entries(record).some(([key, item]) =>
    !["isError", "_meta", "structuredContent", "content", "type"].includes(key) &&
    hasMeaningfulMcpResult(item)
  );
}
