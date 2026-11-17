import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";

const read = async (path: string) => await Deno.readTextFile(new URL(path, import.meta.url));
const mobile = await read("../../../src/mobile-main.jsx");
const app = await read("../../../src/App.jsx");
const appDemo = await read("../../../src/AppDemo.jsx");
const authPage = await read("../../../src/pages/saas-entry.jsx");
const client = await read("../../../src/supabaseClient.js");
const careers = await read("../public-careers/index.ts");
const revokeMigration = await read("../../migrations/20261115164436_jd_revoke_legacy_public_rpcs.sql");
const revokeRollback = await read("../../rollback/20261115164436_jd_revoke_legacy_public_rpcs.rollback.sql");

Deno.test("mobile entry reuses the web app and its Supabase Auth flow", () => {
  assertStringIncludes(mobile, "import './main.jsx'");
  assertStringIncludes(authPage, "signInWithPassword");
  assertEquals(client.includes("loginAuthenticate("), false);
});

Deno.test("legacy pre-authentication lookups are retired", async () => {
  let exists = true;
  try { await Deno.stat(new URL("../preauth-lookup/index.ts", import.meta.url)); } catch { exists = false; }
  assertEquals(exists, false);
  assertEquals(client.includes('"preauth-lookup"'), false);
});

Deno.test("web workspace cannot restore a local-only session or expose retired legacy login", () => {
  assertEquals(app.includes("const legacy=loadSession()"), false);
  assertEquals(authPage.includes("Legacy portal sign in"), false);
  assertStringIncludes(app, "const user=workspaceIdentity(");
  assertEquals(appDemo.includes("SchoolSelectPage"), false);
  assertEquals(appDemo.includes("authLogin"), false);
});

Deno.test("public careers endpoint replaces legacy hiring RPCs with bounded token access", () => {
  assertStringIncludes(careers, '["role","submit","thread","message"]');
  assertStringIncludes(careers, "limit(req,String(action)");
  assertStringIncludes(careers, 'req.headers.get("cf-connecting-ip")');
  assertStringIncludes(careers, "new Uint8Array(24)");
  assertStringIncludes(careers, 'sender:"applicant"');
  assertEquals(careers.includes("hiring_get_thread"), false);
});

Deno.test("legacy public RPC grants are removed after Edge Function replacement", () => {
  for (const rpc of ["login_list_schools", "login_lookup_access_settings", "login_lookup_school_admin", "hiring_get_thread", "hiring_post_message", "hiring_public_role", "hiring_public_submit_application"]) {
    assertStringIncludes(revokeMigration, `revoke all on function public.${rpc}`);
    assertStringIncludes(revokeMigration, `to service_role`);
  }
  assertStringIncludes(revokeRollback, "login_list_schools() to anon;");
  assertEquals(revokeRollback.includes("login_list_schools() to anon, authenticated"), false);
});
