/**
 * Authenticated cross-tenant isolation check (staging).
 *
 * Run by .github/workflows/jd-business-staging-verify.yml, which was previously
 * manual-dispatch only and had NEVER run. A tenant-isolation test that never
 * executes is indistinguishable from no test at all, so this file is now also
 * invoked on a schedule and its result is reported.
 *
 * Requires (staging project, never production):
 *   SUPABASE_URL, SUPABASE_ANON_KEY
 *   JD_E2E_TENANT_A_EMAIL / _PASSWORD
 *   JD_E2E_TENANT_B_EMAIL / _PASSWORD
 *   JD_E2E_CROSS_TENANT_CUSTOMER_ID  — a customer owned by tenant A
 *
 * Assertions
 *   1. Both tenants authenticate.
 *   2. Tenant A can read the business platform surface it owns.
 *   3. Tenant B cannot SEE tenant A's fixture customer in a list.
 *   4. Tenant B cannot UPDATE tenant A's fixture customer (404, not 200).
 *   5. NEW — the fixtures are real: tenant A must be able to see its own
 *      fixture. Without this, assertion 3 passes vacuously when the tables are
 *      empty, which is exactly the state production is in today. A vacuous pass
 *      is reported as a failure, not a success.
 */

const required = [
  "SUPABASE_URL", "SUPABASE_ANON_KEY",
  "JD_E2E_TENANT_A_EMAIL", "JD_E2E_TENANT_A_PASSWORD",
  "JD_E2E_TENANT_B_EMAIL", "JD_E2E_TENANT_B_PASSWORD",
  "JD_E2E_CROSS_TENANT_CUSTOMER_ID",
];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  // Fail loudly rather than skipping: a silently skipped isolation test is a
  // false assurance. The workflow decides whether to treat this as blocking.
  console.error("Missing required staging secret(s): " + missing.join(", "));
  process.exit(2);
}

const base = process.env.SUPABASE_URL.replace(/\/$/, "");
const anon = process.env.SUPABASE_ANON_KEY;
const fixtureId = process.env.JD_E2E_CROSS_TENANT_CUSTOMER_ID;

const fail = (msg) => { throw new Error(msg); };

async function signIn(email, password) {
  const r = await fetch(base + "/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!r.ok) fail("Staging authentication failed (" + r.status + ")");
  const d = await r.json();
  if (!d.access_token) fail("Staging authentication returned no access token");
  return d.access_token;
}

async function invoke(token, body) {
  const r = await fetch(base + "/functions/v1/jd-business-platform", {
    method: "POST",
    headers: { apikey: anon, Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let d; try { d = JSON.parse(text); } catch { d = { raw: text }; }
  return { status: r.status, data: d };
}

const idsOf = (res) => (res.data.items || []).map((x) => String(x.id));

const a = await signIn(process.env.JD_E2E_TENANT_A_EMAIL, process.env.JD_E2E_TENANT_A_PASSWORD);
const b = await signIn(process.env.JD_E2E_TENANT_B_EMAIL, process.env.JD_E2E_TENANT_B_PASSWORD);

// 2. Tenant A's own surface works.
for (const action of ["overview", "cashflow.analytics", "performance.predict", "sla.policy.list", "integration.catalog"]) {
  const r = await invoke(a, { action });
  if (r.status !== 200) fail(`Tenant A "${action}" failed: ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
}

// 5. Non-vacuous precondition: the fixture must be visible to its owner.
const listA = await invoke(a, { action: "list", kind: "customers" });
if (listA.status !== 200) fail("Tenant A customer list failed: " + listA.status);
if (!idsOf(listA).includes(String(fixtureId))) {
  fail(
    "VACUOUS TEST — tenant A cannot see its own fixture customer (" + fixtureId + "). " +
    "The isolation assertions below would pass simply because the table is empty. " +
    "Seed the staging fixture before trusting this result."
  );
}

// 3. Tenant B must not see it.
const listB = await invoke(b, { action: "list", kind: "customers" });
if (listB.status !== 200) fail("Tenant B customer list failed: " + listB.status);
// NOTE: this list succeeding is what makes the read assertion meaningful. If
// tenant B could not list at all, "fixture not present" would be trivially true.
if (idsOf(listB).includes(String(fixtureId))) fail("Tenant isolation failure: tenant B can read tenant A fixture");

// 4. Tenant B must not be able to write it.
//
// A cross-tenant write MUST NOT SUCCEED. Anything other than 2xx satisfies the
// isolation property; pinning the exact code would make this test brittle for
// the wrong reason. But 401/403 is NOT accepted here: those mean tenant B's
// session is broken, so the test would pass without ever exercising the
// school-scoped predicate this file exists to verify. We require a scope-
// filtered "not found" (404) or an explicit permission refusal that is not a
// session failure.
const writeB = await invoke(b, { action: "update", kind: "customers", id: fixtureId, changes: { notes: "cross-tenant-staging-test" } });
if (writeB.status >= 200 && writeB.status < 300) {
  fail("Tenant isolation failure: tenant B was able to UPDATE tenant A's customer (HTTP " + writeB.status + ")");
}
if (writeB.status === 401 || writeB.status === 403) {
  fail(
    "INCONCLUSIVE — cross-tenant update returned " + writeB.status +
    ", which means tenant B's request was rejected before reaching the school-scoped " +
    "filter. Tenant isolation on this path is unproven; check the staging session."
  );
}
if (writeB.status !== 404) {
  fail("Unexpected response to cross-tenant update: " + writeB.status + " " + JSON.stringify(writeB.data).slice(0, 200));
}

console.log(JSON.stringify({
  ok: true,
  tenantA: "authenticated",
  tenantB: "authenticated",
  fixtureVisibleToOwner: true,
  checkedActions: ["overview", "cashflow.analytics", "performance.predict", "sla.policy.list", "integration.catalog"],
  tenantIsolation: "read and write denied to the other tenant",
}));
