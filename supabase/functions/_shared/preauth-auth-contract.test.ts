import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";

const read = async (path: string) => await Deno.readTextFile(new URL(path, import.meta.url));
const mobile = await read("../../../src/MobileApp.jsx");
const app = await read("../../../src/App.jsx");
const appDemo = await read("../../../src/AppDemo.jsx");
const authPage = await read("../../../src/pages/saas-entry.jsx");
const client = await read("../../../src/supabaseClient.js");
const preauth = await read("../preauth-lookup/index.ts");
const revokeMigration = await read("../../migrations/20261115164500_revoke_legacy_public_rpcs.sql");

Deno.test("mobile sign-in verifies email credentials only through Supabase Auth", () => {
  assertStringIncludes(mobile, "supabase.auth.signInWithPassword({email:address,password:pw})");
  assertStringIncludes(mobile, "Mobile access is not enabled for this account role");
  assertStringIncludes(mobile, "profile.school_id!==schoolId");
  assertEquals(mobile.includes("db.loginAuthenticate("), false);
  assertEquals(mobile.includes("loadSession()"), false);
});

Deno.test("pre-authentication endpoint exposes bounded lookups but never verifies passwords", () => {
  assertStringIncludes(preauth, 'const allowed = ["schools","access_settings","admin","student","teacher"]');
  assertStringIncludes(preauth, 'if (action === "authenticate") return reply({ error: "legacy_login_retired"');
  assertStringIncludes(preauth, "rateLimit(req, action)");
  assertStringIncludes(preauth, 'if (action === "teacher")');
  assertStringIncludes(preauth, 'if (action === "student")');
  assertStringIncludes(preauth, 'req.headers.get("cf-connecting-ip")');
  assertEquals(preauth.includes("password_hash"), false);
  assertEquals(preauth.includes("admin_password"), false);
});

Deno.test("web workspace cannot restore a local-only session or expose retired legacy login", () => {
  assertEquals(app.includes("const legacy=loadSession()"), false);
  assertEquals(authPage.includes("Legacy portal sign in"), false);
  assertStringIncludes(appDemo, "profile.school_id!==schoolId");
  assertStringIncludes(appDemo, "allowedRoles.includes(profile.role)");
});

Deno.test("legacy public RPC grants are removed after Edge Function replacement", () => {
  for (const rpc of ["login_list_schools", "login_lookup_access_settings", "login_lookup_school_admin", "hiring_get_thread", "hiring_post_message", "hiring_public_role", "hiring_public_submit_application"]) {
    assertStringIncludes(revokeMigration, `revoke all on function public.${rpc}`);
    assertStringIncludes(revokeMigration, `to service_role`);
  }
});

Deno.test("login access settings failures fail closed", () => {
  assertStringIncludes(client, "if(error)return {error}");
  assertStringIncludes(appDemo, "if(access?.error) throw access.error");
  assertStringIncludes(mobile, "if(access?.error)throw access.error");
});
