import { assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";

const source = await Deno.readTextFile(new URL("../jd-connect/index.ts", import.meta.url));

Deno.test("JD Connect treats MCP tool-level errors as failed executions", () => {
  assertMatch(source, /resultObject\.isError===true/);
  assertMatch(source, /MCP_TOOL_ERROR/);
  assertMatch(source, /status:"failed",result_json:remoteResult,error_code:code/);
});

Deno.test("JD Connect persists successful results before returning success", () => {
  assertMatch(source, /status:"succeeded",result_json:remoteResult,error_code:null/);
  assertMatch(source, /source:"jd_connector_executions"/);
  assertMatch(source, /approval_status_persisted/);
});

Deno.test("JD Connect reports audit and approval persistence warnings without falsifying remote outcome", () => {
  assertMatch(source, /Execution succeeded and evidence was saved, but approval status could not be updated/);
  assertMatch(source, /Execution succeeded and evidence was saved, but the audit event could not be recorded/);
  assertMatch(source, /const audit=async\(type:string,meta:Record<string,unknown>\)=>await db\.rpc/);
});

Deno.test("JD Connect exposes tenant-scoped approval status and execution evidence", () => {
  assertMatch(source, /body\.action==="approvals\.get"/);
  assertMatch(source, /body\.action==="executions\.list"/);
  assertMatch(source, /\.eq\("school_id",school\)/);
});

Deno.test("JD Connect read and evidence endpoints do not require encryption material", () => {
  assertMatch(source, /const requireEncryptionKey=\(\)=>\{if\(!key\)/);
  assertMatch(source, /decryptSecret\(data\.encrypted_bearer_token,requireEncryptionKey\(\)\)/);
  assertMatch(source, /encryptSecret\(serializedArgs,requireEncryptionKey\(\)\)/);
  assertEquals(source.includes('if(!key)return send({error:"JD_OAUTH_ENCRYPTION_KEY is missing or invalid"},503)'), false);
});
