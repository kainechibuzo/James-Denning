import {assertEquals} from "https://deno.land/std@0.224.0/assert/mod.ts";
const sql=await Deno.readTextFile(new URL("../../migrations/20261114091134_jd_connect_mcp_platform.sql",import.meta.url));
Deno.test("JD Connect persists isolated server, credential, tool, approval and execution records",()=>{
 for(const table of ["jd_connector_servers","jd_connector_credentials","jd_connector_tools","jd_connector_approvals","jd_connector_executions"])
  assertEquals(sql.includes(`create table if not exists public.${table}`),true);
});
Deno.test("all connector tables are RLS enabled and unavailable to browser roles",()=>{
 assertEquals(sql.includes("alter table public.%I enable row level security"),true);
 assertEquals(sql.includes("revoke all on public.%I from anon,authenticated"),true);
 assertEquals(sql.includes("grant select,insert,update,delete on public.%I to service_role"),true);
});
Deno.test("approval arguments and credentials have bounded encrypted storage",()=>{
 assertEquals(sql.includes("encrypted_bearer_token text"),true);
 assertEquals(sql.includes("arguments_ciphertext text not null"),true);
 assertEquals(sql.includes("length(arguments_ciphertext)<=65536"),true);
});
Deno.test("approval states are explicit and expire",()=>{
 assertEquals(sql.includes("pending','approved','denied','executed','failed','expired"),true);
 assertEquals(sql.includes("now()+interval '15 minutes'"),true);
});
