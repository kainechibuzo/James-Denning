#!/usr/bin/env node
/**
 * Behavioural tests for the read-only verification scripts (no network).
 *
 * WHY THIS EXISTS
 * ---------------
 * `probe-edge-functions.mjs` and `verify-jd-business-staging.mjs` are the only
 * things standing between us and a green build that verified nothing. Both are
 * written to fail closed, but "it is written to fail closed" is a claim, not
 * evidence — and a guard that silently passes when its inputs are missing is
 * exactly the bug the audit found in the old staging workflow (manual-dispatch
 * only, zero runs, reported as fine).
 *
 * So this test drives both scripts through their interesting response classes
 * with `fetch` stubbed, and asserts each one produces the intended exit code.
 * Every case here is a scenario that MUST NOT read as success:
 *
 *   probe-edge-functions
 *     • an endpoint that accepts an unauthenticated request (200) → fail
 *     • an endpoint that crashes (5xx) rather than rejecting    → fail
 *     • a function that is not deployed (404)                   → fail
 *     • no JD_WORKER_SECRET in CI (assertion would be skipped)   → fail
 *     • no SUPABASE_URL                                          → fail
 *     • the healthy case                                         → pass
 *
 *   verify-jd-business-staging
 *     • empty tables making the isolation check vacuously true   → fail
 *     • tenant B able to read tenant A's fixture                 → fail
 *     • tenant B able to write tenant A's fixture                → fail
 *     • tenant B rejected by session auth, not by school scope   → fail (inconclusive)
 *     • missing credentials                                      → fail
 *     • the healthy case                                         → pass
 *
 * Run: node scripts/test-verification-guards.mjs
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), "jd-guards-"));

/** Strip the shebang so the script can be embedded in a generated module. */
const load = (name) =>
  readFileSync(join(here, name), "utf8").replace(/^#!.*\n/, "");

let failures = 0;
const check = (ok, label, detail) => {
  if (ok) {
    console.log(`  PASS  ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label}`);
    if (detail) console.log(`        ${String(detail).split("\n").filter(Boolean).slice(-3).join(" | ").slice(0, 300)}`);
  }
};

/**
 * Run a script body with fetch stubbed.
 * Returns { code, out } where code is the process exit status.
 */
function runStubbed({ source, stub, env, name }) {
  const file = join(tmp, `${name}.mjs`);
  writeFileSync(file, `${stub}\n${source}\n`);
  try {
    const out = execFileSync("node", [file], {
      env: { PATH: process.env.PATH, ...env },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, out };
  } catch (err) {
    return { code: err.status ?? 1, out: String((err.stdout || "") + (err.stderr || "")) };
  }
}

// ── probe-edge-functions.mjs ─────────────────────────────────────────────────

console.log("\nprobe-edge-functions.mjs");

const probeStub = `
const SCEN = JSON.parse(process.env.SCEN || "{}");
globalThis.fetch = async (url) => {
  const fn = String(url).split("/").pop();
  const s = SCEN[fn] || "closed";
  const table = {
    closed: [401, { error: "Unauthorized" }],
    open:   [200, { ok: true }],
    crash:  [500, { error: "boom" }],
    missing:[404, { message: "not found" }],
  };
  const [status, body] = table[s] || table.closed;
  return { status, text: async () => JSON.stringify(body) };
};
`;

const probeEnv = {
  SUPABASE_URL: "https://probe.test",
  JD_WORKER_SECRET: "secret123",
};

const probeCase = (name, scen, env, want) => {
  const r = runStubbed({
    source: load("probe-edge-functions.mjs"),
    stub: probeStub,
    env: { ...probeEnv, SCEN: JSON.stringify(scen), ...env },
    name: `probe-${name.replace(/\W+/g, "-")}`,
  });
  check(r.code === want, `${name} → exit ${want}`, r.out);
  return r;
};

probeCase("all functions fail closed (healthy)", {}, {}, 0);
probeCase("endpoint open to unauthenticated calls", { "jd-automation": "open" }, {}, 1);
probeCase("endpoint crashes instead of rejecting", { "jd-execution-worker": "crash" }, {}, 1);
probeCase("function not deployed", { "jd-task-scheduler": "missing" }, {}, 1);
probeCase(
  "CI without JD_WORKER_SECRET (assertion would be skipped)",
  {},
  { GITHUB_ACTIONS: "true", JD_WORKER_SECRET: "" },
  2,
);
probeCase("no SUPABASE_URL", {}, { SUPABASE_URL: "" }, 2);

// ── verify-jd-business-staging.mjs ───────────────────────────────────────────

console.log("\nverify-jd-business-staging.mjs");

const stagingStub = `
const SCEN = JSON.parse(process.env.SCEN || "{}");
const reply = (o, status = 200) => ({
  ok: status < 400,
  status,
  text: async () => JSON.stringify(o),
  json: async () => o,
});
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const body = opts.body ? JSON.parse(opts.body) : {};
  const token = String((opts.headers && opts.headers.Authorization) || "").replace("Bearer ", "");
  const asTenantA = token === "token-A";

  if (u.includes("/auth/v1/token")) {
    return reply({ access_token: body.email === "tenant-a@test" ? "token-A" : "token-B" });
  }
  if (u.includes("/functions/v1/jd-business-platform")) {
    if (body.action === "list" && body.kind === "customers") {
      if (asTenantA) return reply({ items: SCEN.tenantASeesFixture ? [{ id: "fixture-1" }] : [] });
      return reply({ items: SCEN.tenantBSeesFixture ? [{ id: "fixture-1" }] : [{ id: "tenant-b-own" }] });
    }
    if (body.action === "update") {
      if (!asTenantA) return reply({ error: "denied" }, SCEN.tenantBUpdateStatus ?? 404);
      return reply({ item: {} });
    }
    return reply({ ok: true });
  }
  return reply({ error: "unexpected route" }, 404);
};
`;

const stagingEnv = {
  SUPABASE_URL: "https://staging.test",
  SUPABASE_ANON_KEY: "anon",
  JD_E2E_TENANT_A_EMAIL: "tenant-a@test",
  JD_E2E_TENANT_A_PASSWORD: "pw",
  JD_E2E_TENANT_B_EMAIL: "tenant-b@test",
  JD_E2E_TENANT_B_PASSWORD: "pw",
  JD_E2E_CROSS_TENANT_CUSTOMER_ID: "fixture-1",
};

const stagingCase = (name, scen, env, want) => {
  const r = runStubbed({
    source: load("verify-jd-business-staging.mjs"),
    stub: stagingStub,
    env: { ...stagingEnv, SCEN: JSON.stringify(scen), ...env },
    name: `staging-${name.replace(/\W+/g, "-")}`,
  });
  check(r.code === want, `${name} → exit ${want}`, r.out);
  return r;
};

stagingCase(
  "isolation holds (healthy)",
  { tenantASeesFixture: true, tenantBSeesFixture: false, tenantBUpdateStatus: 404 },
  {},
  0,
);

const vacuous = stagingCase(
  "empty tables (isolation would pass vacuously)",
  { tenantASeesFixture: false, tenantBSeesFixture: false, tenantBUpdateStatus: 404 },
  {},
  1,
);
check(
  vacuous.out.includes("VACUOUS TEST"),
  "vacuity is reported by name, not as a generic error",
  vacuous.out,
);

stagingCase(
  "tenant B can read tenant A's fixture",
  { tenantASeesFixture: true, tenantBSeesFixture: true, tenantBUpdateStatus: 404 },
  {},
  1,
);

const writeSucceeded = stagingCase(
  "tenant B can write tenant A's fixture",
  { tenantASeesFixture: true, tenantBSeesFixture: false, tenantBUpdateStatus: 200 },
  {},
  1,
);
check(
  writeSucceeded.out.includes("unable to UPDATE") || writeSucceeded.out.includes("was able to UPDATE"),
  "cross-tenant write is called out as an isolation failure",
  writeSucceeded.out,
);

const inconclusive = stagingCase(
  "tenant B blocked by session auth, not school scope",
  { tenantASeesFixture: true, tenantBSeesFixture: false, tenantBUpdateStatus: 403 },
  {},
  1,
);
check(
  inconclusive.out.includes("INCONCLUSIVE"),
  "a 403 is reported as inconclusive rather than as passing isolation",
  inconclusive.out,
);

stagingCase("missing credentials", {}, { JD_E2E_TENANT_A_EMAIL: "" }, 2);

// ── result ───────────────────────────────────────────────────────────────────

if (failures) {
  console.error(`\n${failures} guard check(s) FAILED — a verification script would report success when it should not.`);
  process.exit(1);
}
console.log("\nAll verification guards behave as intended.");
