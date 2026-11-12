#!/usr/bin/env node
/**
 * Migration history reconciliation report (read-only).
 *
 * WHY THIS EXISTS
 * ---------------
 * The production migration history and this repository's `supabase/migrations/`
 * directory do not share version numbers. The same schema changes were recorded
 * in production under `2026...` timestamps while the files here carry different
 * ones (e.g. production `20261111085143` vs repo
 * `20261110090000_jd_autonomous_automation.sql`).
 *
 * Consequences, which this report makes explicit instead of hiding:
 *   • `supabase db push` believes 18 repo migrations are unapplied.
 *   • 14 recorded production versions have no file in this repo.
 *   • Ordering migrations by version number therefore produces a sequence that
 *     was never executed in production. Ordering by MIGRATION NAME is the
 *     correct basis for reasoning about intent.
 *
 * Inputs
 *   REMOTE_MIGRATIONS  JSON array of rows ({ version, name? }) or a text blob
 *                      with one `version[,name]` per line.
 *                      e.g. supabase migration list --output json
 * Output
 *   Machine-readable JSON report + a human summary on stderr.
 *   Exit 0 when histories correlate by name, 1 when they do not (informational;
 *   a non-zero exit here is a prompt to run the repair, not a build failure).
 *
 * Deliberately read-only: it never repairs, pushes or mutates.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = process.cwd();
const dir = resolve(root, "supabase/migrations");

function parseRemote(raw) {
  if (!raw) return [];
  const text = raw.trim();
  try {
    const parsed = JSON.parse(text);
    const rows = Array.isArray(parsed) ? parsed : parsed.migrations ?? [];
    return rows.map((r) => ({
      version: String(r.version ?? r.local ?? r.remote ?? "").trim(),
      name: (r.name ?? r.versionName ?? "").trim(),
    })).filter((r) => r.version);
  } catch {
    // plain text: "version[,name]" per line
    return text.split("\n").map((l) => l.trim()).filter(Boolean)
      .map((l) => {
        const [version, name] = l.split(/[,\s]+/);
        return { version, name: name ?? "" };
      }).filter((r) => r.version);
  }
}

function parseLocal() {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => {
      const base = f.replace(/\.sql$/, "");
      const [version, ...rest] = base.split("_");
      return { version, name: rest.join("_"), file: f };
    });
}

const local = parseLocal();
const remote = parseRemote(process.env.REMOTE_MIGRATIONS);

if (!remote.length) {
  console.error("REMOTE_MIGRATIONS is empty or unset — cannot compare histories.");
  console.error("Provide e.g. `supabase migration list --output json` as JSON.");
  process.exit(2);
}

const localByVersion = new Map(local.map((m) => [m.version, m]));
const remoteByVersion = new Map(remote.map((m) => [m.version, m]));

// Normalise a migration name so that "jd_atomic_approval_decisions" and
// "atomic approval decisions" correlate regardless of separators/case.
const norm = (s) =>
  String(s || "").toLowerCase().replace(/\.sql$/, "").replace(/[^a-z0-9]+/g, "");

const localOnly = local.filter((m) => !remoteByVersion.has(m.version));
const remoteOnly = remote.filter((m) => !localByVersion.has(m.version));

// Correlate the two sets BY NAME to prove they are the same work expressed
// under different version numbers.
const byName = new Map();
for (const m of localOnly) byName.set(norm(m.name), { local: m, remote: null });
for (const m of remoteOnly) {
  const key = norm(m.name);
  if (byName.has(key)) byName.get(key).remote = m;
  else byName.set(key, { local: null, remote: m });
}

const correlated = [...byName.values()].filter((v) => v.local && v.remote);
const unmatchedLocal = [...byName.values()].filter((v) => v.local && !v.remote).map((v) => v.local);
const unmatchedRemote = [...byName.values()].filter((v) => v.remote && !v.local).map((v) => v.remote);

/**
 * Content-name ordering. Production recorded these migrations under
 * timestamps that do not sort the same way as the repo filenames, so the
 * authoritative sequence is the order of the recorded production timestamps.
 */
const intendedOrder = [...remote].sort((a, b) => a.version.localeCompare(b.version));

const report = {
  generatedAt: new Date().toISOString(),
  counts: {
    local: local.length,
    remote: remote.length,
    localOnly: localOnly.length,
    remoteOnly: remoteOnly.length,
    correlatedByName: correlated.length,
    unmatchedLocal: unmatchedLocal.length,
    unmatchedRemote: unmatchedRemote.length,
  },
  verdict:
    localOnly.length === 0 && remoteOnly.length === 0
      ? "aligned"
      : correlated.length > 0
        ? "diverged_version_numbers_same_content"
        : "unreconciled",
  guidance:
    "Do not run `supabase db push` while this reports divergence: it replays the " +
    "local-only set in an order never executed in production. Reconcile with " +
    "`supabase migration repair --status applied <recorded-version>` for each " +
    "correlated pair, then re-run this report.",
  correlated: correlated.map((v) => ({
    repoVersion: v.local.version,
    repoFile: v.local.file,
    productionVersion: v.remote.version,
  })),
  localOnly: localOnly.map((m) => ({ version: m.version, file: m.file })),
  remoteOnly: remoteOnly.map((m) => ({ version: m.version, name: m.name })),
  intendedOrderByRecordedTimestamp: intendedOrder.map((m) => m.version),
};

/**
 * Repair plan.
 *
 * Each correlated pair means production already contains that schema change; it
 * is simply recorded under a different version. The fix is to tell the CLI that
 * the REPO's version is applied, so it stops treating the file as pending.
 *
 * Versions that are not plain digits (000a, 001b, 999b, 999c) are flagged
 * separately: `supabase migration repair` expects numeric versions, so those
 * files are better renamed to a timestamp than repaired. They are also the ones
 * the CLI is least likely to reason about correctly.
 */
const numericVersion = (v) => /^\d+$/.test(v);

const repairCommands = correlated
  .filter((v) => numericVersion(v.local.version))
  .map((v) => `supabase migration repair --status applied ${v.local.version}`);

const nonStandardVersions = localOnly
  .filter((m) => !numericVersion(m.version))
  .map((m) => m.file);

report.repairPlan = {
  note:
    "Run AFTER confirming the content is present in production. Each command " +
    "marks a repo version as applied so `db push` stops treating it as pending.",
  commands: repairCommands,
  renamedInsteadOfRepaired: nonStandardVersions,
  caveat:
    "This report can only prove that the NAMES correlate and that representative " +
    "objects exist. Confirm each migration's objects before repairing; a name " +
    "match is strong evidence, not proof.",
};

if (process.argv.includes("--repair-plan")) {
  console.error("Repair plan (%d command(s)):\n", repairCommands.length);
  for (const c of repairCommands) console.error("  " + c);
  if (nonStandardVersions.length) {
    console.error("\nNon-numeric version filenames (rename to a timestamp, do not repair):");
    for (const f of nonStandardVersions) console.error("  " + f);
  }
  console.error("");
}

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.error("Migration histories %s.", report.verdict);
  console.error("  repo files: %d | production versions: %d", report.counts.local, report.counts.remote);
  console.error("  same work under different versions: %d", report.counts.correlatedByName);
  console.error("  repo-only: %d | production-only: %d", report.counts.localOnly, report.counts.remoteOnly);
  if (correlated.length) {
    console.error("\n  Correlated pairs (repo version ← production version):");
    for (const v of report.correlated) {
      console.error("    %s (%s) ← %s", v.repoVersion, v.repoFile, v.productionVersion);
    }
  }
  if (report.verdict !== "aligned") console.error("\n  %s", report.guidance);
  console.log(JSON.stringify(report, null, 2));
}

process.exit(report.verdict === "aligned" ? 0 : 1);
