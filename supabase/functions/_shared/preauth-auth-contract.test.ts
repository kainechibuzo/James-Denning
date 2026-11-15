import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";

const read = async (path: string) => await Deno.readTextFile(new URL(path, import.meta.url));
const mobile = await read("../../../src/MobileApp.jsx");
const app = await read("../../../src/App.jsx");
const appDemo = await read("../../../src/AppDemo.jsx");
const authPage = await read("../../../src/pages/saas-entry.jsx");
const client = await read("../../../src/supabaseClient.js");
const preauth = await read("../preauth-lookup/index.ts");

Deno.test("mobile ID sign-in verifies credentials only through Supabase Auth", () => {
  assertStringIncludes(mobile, "supabase.auth.signInWithPassword({email:authEmail,password:pw})");
  assertStringIncludes(mobile, "staff-${clean}--${schoolId}@login.internal");
  assertStringIncludes(mobile, "student-${clean}--${schoolId}@login.internal");
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

Deno.test("login access settings failures fail closed", () => {
  assertStringIncludes(client, "if(error)return {error}");
  assertStringIncludes(appDemo, "if(access?.error) throw access.error");
  assertStringIncludes(mobile, "if(access?.error)throw access.error");
});
