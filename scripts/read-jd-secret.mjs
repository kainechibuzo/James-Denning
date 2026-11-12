#!/usr/bin/env node
// Print one named secret from the JD_SECRETS_JSON environment variable.
// The value is intended for assignment to a shell variable; never log it.
const allowed = new Set([
  "JD_WORKER_SECRET",
  "JD_BUSINESS_MONITOR_WORKER_SECRET",
  "JD_DOCUMENT_WORKER_SECRET",
  "JD_BUSINESS_OPS_WORKER_SECRET",
  "JD_OAUTH_ENCRYPTION_KEY",
]);
const name = process.argv[2] || "";
if (!allowed.has(name)) {
  console.error("Unknown JD secret name.");
  process.exit(2);
}
let bundle;
try {
  bundle = JSON.parse(process.env.JD_SECRETS_JSON || "");
} catch {
  console.error("JD_SECRETS_JSON is missing or invalid JSON.");
  process.exit(2);
}
const value = bundle && typeof bundle === "object" && !Array.isArray(bundle)
  ? bundle[name]
  : undefined;
if (typeof value !== "string" || value.trim().length < 32) {
  console.error(`JD_SECRETS_JSON is missing a valid ${name} value.`);
  process.exit(2);
}
process.stdout.write(value.trim());
