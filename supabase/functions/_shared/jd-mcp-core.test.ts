import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { hasMeaningfulMcpResult, isReadOnlyTool, parseMcpPayload, validateMcpEndpoint, validateToolName } from "./jd-mcp-core.ts";
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

Deno.test("MCP tool result must contain meaningful evidence", () => {
  assertEquals(hasMeaningfulMcpResult(null), false);
  assertEquals(hasMeaningfulMcpResult({}), false);
  assertEquals(hasMeaningfulMcpResult({isError:false,content:[]}), false);
  assertEquals(hasMeaningfulMcpResult({content:[{type:"text",text:""}]}), false);
  assertEquals(hasMeaningfulMcpResult({content:[{type:"text",text:"   "}]}), false);
  assertEquals(hasMeaningfulMcpResult({content:[{type:"text",text:"Created repository"}]}), true);
  assertEquals(hasMeaningfulMcpResult({isError:true,content:[{type:"text",text:"Created repository"}]}), false);
  assertEquals(hasMeaningfulMcpResult({ok:false,result:{id:"123"}}), false);
  assertEquals(hasMeaningfulMcpResult({success:false,id:"123"}), false);
  assertEquals(hasMeaningfulMcpResult({status:"failed",id:"123"}), false);
  assertEquals(hasMeaningfulMcpResult({error:"Provider rejected request"}), false);
  assertEquals(hasMeaningfulMcpResult({structuredContent:{id:123}}), true);
  assertEquals(hasMeaningfulMcpResult([{type:"text",text:"ok"}]), true);
  assertEquals(hasMeaningfulMcpResult(false), true);
});
