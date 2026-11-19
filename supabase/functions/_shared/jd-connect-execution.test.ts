import { assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";

const source = await Deno.readTextFile(new URL("../jd-connect/index.ts", import.meta.url));

Deno.test("JD Connect treats MCP tool-level errors as failed executions", () => {
  assertMatch(source, /resultObject\.isError===true/);
  assertMatch(source, /MCP_TOOL_ERROR/);
  assertMatch(source, /status:terminalStatus,result_json:remoteResult,error_code:outcomeUnknown\?"REMOTE_OUTCOME_UNCONFIRMED":code/);
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

Deno.test("JD Connect records an execution before connecting to the remote server", () => {
  const start = source.indexOf("const execute=");
  const insert = source.indexOf('from("jd_connector_executions").insert', start);
  const token = source.indexOf("getToken(server.id,server.oauth_generation)", start);
  assertEquals(start >= 0 && insert > start && token > insert, true);
});

Deno.test("JD Connect supports per-provider read-only, read-write and full-control grants", () => {
  assertMatch(source, /body\.action==="grants\.set"/);
  assertMatch(source, /body\.action==="grants\.revoke"/);
  assertMatch(source, /\["read_only","read_write","full_control"\]/);
  assertMatch(source, /from\("jd_connector_grants"\)/);
});
Deno.test("JD Connect enforces granted write scopes and preserves destructive approval gates", () => {
  assertMatch(source, /const elevated=level==="read_write"\|\|level==="full_control"/);
  assertMatch(source, /const unrestricted=level==="full_control"/);
  assertMatch(source, /const legacyRequiresApproval=!readOnly&&\(!elevated\|\|\(!unrestricted&&\(asObject\(tool\.annotations\)\.destructiveHint===true\|\|asObject\(tool\.annotations\)\.openWorldHint===true\)\)\)/);
  assertMatch(source, /permissionLevel:level/);
});
Deno.test("JD Connect returns to read-only when a provider grant is missing or expired", () => {
  assertMatch(source, /grant&&\(!grant\.expires_at\|\|new Date\(grant\.expires_at\)\.getTime\(\)>Date\.now\(\)\)\?grant:null/);
  assertMatch(source, /activeGrant\?\.access_level\|\|"read_only"/);
});

Deno.test("OAuth never bypasses per-action approval through legacy elevated grants",()=>{assertMatch(source,/const requiresApproval=server\.oauth_provider_id\?\(!readOnly\|\|tool\.read_only!==true\):legacyRequiresApproval/);});

Deno.test("JD Connect never labels an ambiguous remote outcome as a clean failure", () => {
  assertMatch(source, /const outcomeUnknown=remoteRequestDispatched&&!remoteToolRejected/);
  assertMatch(source, /status:terminalStatus/);
  assertMatch(source, /status:outcomeUnknown\?"outcome_unknown":"failed"/);
  assertMatch(source, /Do not retry automatically; inspect the provider and execution history first/);
});

Deno.test("Approval execution revalidates the provider tool after human approval", () => {
  assertMatch(source, /currentToolError\|\|!currentTool/);
  assertMatch(source, /The approved tool is no longer available on this connection/);
});
