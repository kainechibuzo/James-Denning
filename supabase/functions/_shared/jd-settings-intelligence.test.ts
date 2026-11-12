import { auditConfiguration, explainSaveBehaviour, explainSetting, refusalFor } from "./jd-settings-intelligence.ts";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const sampleRows = [
  { key: "workspace_type", value: "education" },
  { key: "education_module_enabled", value: "true" },
  { key: "school_name", value: "Example Org" },
  { key: "school_address", value: "12 Sample Road" },
  { key: "school_phone", value: "+2348000000000" },
  { key: "result_ca_max", value: "40" },
  { key: "result_exam_max", value: "70" },
  { key: "inactivity_timeout_minutes", value: "30" },
  { key: "recycle_bin_retention_days", value: "30" },
  { key: "name_order", value: "FML" },
  { key: "name_case", value: "title" },
  { key: "smtp_password", value: "super-secret-value" },
];

Deno.test("explainSetting returns evidence-backed detail for a registered key", () => {
  const result = explainSetting("result_ca_max", sampleRows);
  assert(result.status === "ok", "ok status");
  if (result.status !== "ok") return;
  assert(result.value === 40, "numeric display value returned");
  assert(result.dependencies.includes("result_exam_max"), "dependency listed");
  assert(result.affected_modules.includes("grading"), "affected module listed");
  assert(result.requires_approval === true, "approval requirement stated");
  assert(/administrator/i.test(result.permission_boundary), "permission boundary stated");
  assert(/proposal/i.test(result.save_behaviour), "save behaviour mentions proposal executor");
  assert(result.evidence === "school_settings", "evidence recorded");
});

Deno.test("explainSetting refuses unknown, invented and secret-like keys", () => {
  for (const key of ["not_a_real_setting", "result_exam_max_override", "smtp_password", "school_name_secret", ""]) {
    const result = explainSetting(key, sampleRows);
    assert(result.status === "refused", `refused: ${key}`);
    assert(Array.isArray(result.supported_keys) && result.supported_keys.length === 15, "supported keys listed");
    assert(!JSON.stringify(result).includes("super-secret-value"), "secret value never leaked");
  }
});

Deno.test("explainSetting omits the value when the setting is missing", () => {
  const result = explainSetting("school_motto", sampleRows);
  assert(result.status === "ok", "ok status");
  if (result.status !== "ok") return;
  assert(!("value" in result), "no value key when unconfigured");
  assert(result.status_configured === "missing", "missing status reported");
});

Deno.test("auditConfiguration flags contradictory CA/exam maxima above 100", () => {
  const result = auditConfiguration(sampleRows);
  const hit = result.findings.find((finding) => finding.id === "scores_exceed_100");
  assert(hit, "scores_exceed_100 finding present");
  assert(hit?.severity === "high", "high severity");
  assert(hit?.evidence.includes("sum 110"), "evidence cites the sum");
  assert(result.unchanged === true, "audit is read-only");
});

Deno.test("auditConfiguration flags education workspace mismatches", () => {
  const result = auditConfiguration([
    { key: "workspace_type", value: "education" },
    { key: "education_module_enabled", value: "false" },
  ]);
  assert(result.findings.some((finding) => finding.id === "education_type_with_module_disabled" && finding.severity === "high"), "high-severity mismatch reported");
});

Deno.test("auditConfiguration reports missing identity settings and never touches secrets", () => {
  const result = auditConfiguration([
    { key: "smtp_password", value: "super-secret-value" },
    { key: "result_ca_max", value: "40" },
    { key: "result_exam_max", value: "60" },
  ]);
  assert(result.findings.some((finding) => finding.id === "missing_school_name" && finding.severity === "high"), "missing school name reported");
  assert(result.summary.protected_settings_excluded === 1, "secret row counted, not reported");
  assert(!JSON.stringify(result).includes("super-secret-value"), "secret value never leaked");
  assert(result.summary.total === result.findings.length, "summary consistent");
});

Deno.test("auditConfiguration flags invalid timeout, retention, name order and name case", () => {
  const result = auditConfiguration([
    { key: "inactivity_timeout_minutes", value: "5000" },
    { key: "recycle_bin_retention_days", value: "0" },
    { key: "name_order", value: "ZZZ" },
    { key: "name_case", value: "SHOUTING" },
  ]);
  const ids = result.findings.map((finding) => finding.id);
  assert(ids.includes("inactivity_timeout_invalid"), "timeout flagged");
  assert(ids.includes("retention_invalid"), "retention flagged");
  assert(ids.includes("name_order_invalid"), "name order flagged");
  assert(ids.includes("name_case_invalid"), "name case flagged");
});

Deno.test("auditConfiguration passes a coherent configuration cleanly", () => {
  const result = auditConfiguration([
    { key: "workspace_type", value: "education" },
    { key: "education_module_enabled", value: "true" },
    { key: "school_name", value: "Example Org" },
    { key: "school_address", value: "12 Sample Road" },
    { key: "school_phone", value: "+2348000000000" },
    { key: "result_ca_max", value: "40" },
    { key: "result_exam_max", value: "60" },
    { key: "inactivity_timeout_minutes", value: "30" },
    { key: "recycle_bin_retention_days", value: "30" },
    { key: "name_order", value: "FML" },
    { key: "name_case", value: "title" },
  ]);
  assert(result.findings.length === 0, `expected no findings, got ${JSON.stringify(result.findings)}`);
  assert(result.summary.high === 0 && result.summary.warning === 0, "no high/warning findings");
});

Deno.test("explainSaveBehaviour states executor guarantees for registered keys", () => {
  const result = explainSaveBehaviour("workspace_type");
  assert(result.status === "ok", "ok status");
  if (result.status !== "ok") return;
  assert(result.executor === "jd_apply_settings_proposal_step", "executor named");
  assert(result.guarantees.length >= 3, "guarantees listed");
  const refused = explainSaveBehaviour("invented_setting");
  assert(refused.status === "refused", "invented key refused");
});

Deno.test("refusalFor always lists the supported catalogue and leaks nothing", () => {
  const result = refusalFor(42);
  assert(result.status === "refused", "non-string refused");
  assert(result.supported_keys.includes("workspace_type"), "known key listed");
  assert(result.requested_key === null, "non-string key normalised to null");
});
