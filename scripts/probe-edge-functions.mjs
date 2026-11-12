#!/usr/bin/env node
/**
 * Edge Function deployment + fail-closed probe (read-only).
 *
 * WHY THIS EXISTS
 * ---------------
 * "Deployed" and "working" are different claims, and the registry conflated them.
 * The JD workers are deployed with `verify_jwt=false` because they authenticate
 * with a dedicated `x-jd-worker-secret` header instead. That design is only safe
 * if the worker rejects requests when the secret is absent or wrong — which is a
 * property we can test from outside, with no credentials and no writes.
 *
 * This probe asserts, for every function it is given:
 *   1. The function responds at all (present, not 404 / not a boot crash).
 *   2. A completely unauthenticated POST is REJECTED (401/403) — never 200.
 *      A 200 here means the endpoint is open and would be a security incident.
 *   3. A POST with a deliberately wrong worker secret is REJECTED.
 *
 * It never sends a valid secret, never reads data, never writes, and never
 * prints response bodies beyond a short error string. It is safe to run against
 * production on every deploy.
 *
 * Exit codes: 0 = all assertions pass, 1 = a function failed an assertion,
 *             2 = configuration problem (missing SUPABASE_URL).
 */

const url = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const anon = process.env.SUPABASE_ANON_KEY || "";
let secretsBundle = {};
try {
  const raw = process.env.JD_SECRETS_JSON || "";
  if (raw) secretsBundle = JSON.parse(raw);
} catch {
  console.error("JD_SECRETS_JSON is not valid JSON.");
  process.exit(2);
}
const workerSecret = typeof secretsBundle.JD_WORKER_SECRET === "string"
  ? secretsBundle.JD_WORKER_SECRET
  : "";

// Default set: functions that must NOT be publicly callable without auth.
// jd-automation / jd-task-collaboration verify a user JWT (verify_jwt=true).
// the *-worker / scheduler functions verify the dedicated worker secret.
const DEFAULT_FUNCTIONS = [
  "jd-execution-worker",
  "jd-task-scheduler",
  "jd-automation",
  "jd-task-collaboration",
];

const functions = (process.env.JD_PROBE_FUNCTIONS || DEFAULT_FUNCTIONS.join(","))
  .split(",").map((s) => s.trim()).filter(Boolean);

if (!url) {
  console.error("SUPABASE_URL is required.");
  process.exit(2);
}

// In CI the wrong-secret assertion must actually run. If the secret is missing
// from the workflow context we want a red build, not a silently weaker probe.
if (process.env.GITHUB_ACTIONS === "true" && !workerSecret) {
  console.error(
    "JD_SECRETS_JSON.JD_WORKER_SECRET is not available to this job, so the wrong-secret " +
    "assertion would be skipped. Add it under Settings → Secrets and variables " +
    "→ Actions so the probe verifies the full fail-closed contract.",
  );
  process.exit(2);
}

async function post(fn, headers) {
  const res = await fetch(`${url}/functions/v1/${fn}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: "{}",
  });
  const text = await res.text();
  let message = "";
  try {
    const parsed = JSON.parse(text);
    message = String(parsed.error ?? parsed.message ?? "").slice(0, 60);
  } catch {
    message = text.slice(0, 60);
  }
  return { status: res.status, message };
}

const results = [];

for (const fn of functions) {
  const entry = { function: fn, checks: {}, ok: true };

  // 1 + 2: no credentials at all.
  let anon;
  try {
    anon = await post(fn, {});
  } catch (err) {
    entry.checks.reachable = { pass: false, detail: `network error: ${err.message}` };
    entry.ok = false;
    results.push(entry);
    continue;
  }
  entry.checks.reachable = { pass: anon.status !== 404, detail: `HTTP ${anon.status}` };
  if (anon.status === 404) entry.ok = false;

  const anonRejected = anon.status === 401 || anon.status === 403;
  entry.checks.rejectsUnauthenticated = {
    pass: anonRejected,
    detail: `HTTP ${anon.status}${anon.message ? ` "${anon.message}"` : ""}`,
  };
  if (!anonRejected) {
    entry.ok = false;
    if (anon.status >= 200 && anon.status < 300) {
      entry.severity = "CRITICAL — endpoint accepted an unauthenticated request";
    } else if (anon.status >= 500) {
      // Not "rejected" — the function booted and crashed. It fails closed by
      // accident, which is not the same guarantee, and it means the runtime is
      // broken. Never let this read as a pass.
      entry.severity = "BROKEN — function returned a server error (likely boot crash or unhandled exception)";
    } else {
      entry.severity = `UNEXPECTED — expected 401/403 for an unauthenticated request, got HTTP ${anon.status}`;
    }
  }

  // 3: a wrong worker secret must also be rejected.
  if (workerSecret) {
    const wrong = `${workerSecret}-wrong-probe`;
    const bad = await post(fn, { "x-jd-worker-secret": wrong });
    const badRejected = bad.status === 401 || bad.status === 403;
    entry.checks.rejectsWrongWorkerSecret = {
      pass: badRejected,
      detail: `HTTP ${bad.status}${bad.message ? ` "${bad.message}"` : ""}`,
    };
    if (!badRejected) entry.ok = false;
  } else {
    entry.checks.rejectsWrongWorkerSecret = {
      pass: null,
      detail: "skipped — JD_SECRETS_JSON.JD_WORKER_SECRET not set in this context",
    };
  }

  results.push(entry);
}

const report = {
  generatedAt: new Date().toISOString(),
  target: url.replace(/^https?:\/\//, "").split(".")[0],
  functions: results,
  verdict: results.every((r) => r.ok) ? "all_fail_closed" : "ATTENTION",
};

console.log(JSON.stringify(report, null, 2));

const failures = results.filter((r) => !r.ok);
for (const f of failures) {
  console.error(`✗ ${f.function}: ${JSON.stringify(f.checks)}`);
}
if (!failures.length) {
  console.error(`✓ ${results.length} function(s) reachable and fail-closed.`);
}
process.exit(failures.length ? 1 : 0);
