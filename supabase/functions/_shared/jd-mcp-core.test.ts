import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isReadOnlyTool, parseMcpPayload, validateMcpEndpoint, validateToolName } from "./jd-mcp-core.ts";
Deno.test("MCP endpoint requires exact HTTPS host allowlist", () => {
  assertEquals(validateMcpEndpoint("https://mcp.example.com/mcp", ["mcp.example.com"]).hostname, "mcp.example.com");
  assertThrows(() => validateMcpEndpoint("http://mcp.example.com/mcp", ["mcp.example.com"]));
  assertThrows(() => validateMcpEndpoint("https://127.0.0.1/mcp", ["127.0.0.1"]));
  assertThrows(() => validateMcpEndpoint("https://evil.example/mcp", ["mcp.example.com"]));
  assertThrows(() => validateMcpEndpoint("https://user:pass@mcp.example.com/mcp", ["mcp.example.com"]));
});
Deno.test("Only explicitly annotated safe tools are read-only", () => {
  assertEquals(isReadOnlyTool({name:"search",annotations:{readOnlyHint:true}}), true);
  assertEquals(isReadOnlyTool({name:"send",annotations:{readOnlyHint:true,openWorldHint:true}}), false);
  assertEquals(isReadOnlyTool({name:"unknown"}), false);
});
Deno.test("MCP SSE and JSON responses are parsed", () => {
  assertEquals(parseMcpPayload('{"jsonrpc":"2.0","result":{"ok":true}}',"application/json").result.ok, true);
  assertEquals(parseMcpPayload('event: message\ndata: {"jsonrpc":"2.0","result":{"ok":true}}\n\n',"text/event-stream").result.ok, true);
});
Deno.test("Tool names are constrained", () => {
  assertEquals(validateToolName("gmail.search"), "gmail.search");
  assertThrows(() => validateToolName("bad tool"));
});
