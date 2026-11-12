// JD settings intelligence: explanation, completeness audit and refusal semantics.
// Pure functions over raw `school_settings` rows. No writes, no side effects, no secret values.
//   JD-UPG-025 explainSetting     — value, dependencies, affected modules, permission boundary, save behaviour
//   JD-UPG-026 auditConfiguration — missing/contradictory settings, evidence-backed, read-only
//   JD-UPG-030 refusal semantics  — unsupported, invented or secret-like keys are refused with a supported-key list
// Wiring into the live JD runtime (jd-automation) is tracked separately; this module is verified by unit tests.

import { JD_SETTING_DEFINITIONS, SECRET_KEY_PATTERN } from "./jd-settings-catalogue.ts";

export type SettingRow = { key: string; value: unknown };

type SettingIntelligence = {
  dependencies: string[];
  affectedModules: string[];
  permissionBoundary: string;
  saveBehaviour: string;
  requiresApproval: boolean;
};

// One entry per registered setting. Text is deliberately conservative: it states only what the
// current executor (`jd_apply_settings_proposal_step`) and the settings UI actually enforce.
const INTELLIGENCE: Record<string, SettingIntelligence> = {
  workspace_type: {
    dependencies: [],
    affectedModules: ["navigation terminology", "workspace presets", "onboarding defaults"],
    permissionBoundary: "Workspace administrator only; executed exclusively through an approved settings proposal.",
    saveBehaviour: "Validated against the registered set (business, professional-services, retail, nonprofit, healthcare, education, other). Stale before-value aborts the step; effect is read-after-write verified.",
    requiresApproval: true,
  },
  education_module_enabled: {
    dependencies: ["workspace_type"],
    affectedModules: ["education navigation", "grading", "report cards", "student portal"],
    permissionBoundary: "Workspace administrator only; executed exclusively through an approved settings proposal.",
    saveBehaviour: "Boolean validated as 'true'/'false'. Toggling availability is reversible; no tenant data is deleted when disabled.",
    requiresApproval: true,
  },
  school_name: {
    dependencies: [],
    affectedModules: ["portal header", "official documents", "report cards", "communications sign-off"],
    permissionBoundary: "Workspace administrator only; executed exclusively through an approved settings proposal.",
    saveBehaviour: "Non-empty string enforced. Value is echoed on official documents from the moment the approved step commits.",
    requiresApproval: true,
  },
  school_address: {
    dependencies: [],
    affectedModules: ["official documents", "report cards"],
    permissionBoundary: "Workspace administrator only; executed exclusively through an approved settings proposal.",
    saveBehaviour: "Non-empty string enforced at execution time.",
    requiresApproval: true,
  },
  school_phone: {
    dependencies: [],
    affectedModules: ["portal contact surface", "official documents"],
    permissionBoundary: "Workspace administrator only; executed exclusively through an approved settings proposal.",
    saveBehaviour: "Non-empty string enforced at execution time.",
    requiresApproval: true,
  },
  school_motto: {
    dependencies: [],
    affectedModules: ["official documents", "report cards"],
    permissionBoundary: "Workspace administrator only; executed exclusively through an approved settings proposal.",
    saveBehaviour: "Non-empty string enforced at execution time.",
    requiresApproval: true,
  },
  result_ca_max: {
    dependencies: ["result_exam_max"],
    affectedModules: ["grading", "report cards", "broadsheets"],
    permissionBoundary: "Workspace administrator only; executed exclusively through an approved settings proposal.",
    saveBehaviour: "Numeric 0–100 enforced. The completeness audit flags ca + exam totals above 100; existing scored records are not re-scaled.",
    requiresApproval: true,
  },
  result_exam_max: {
    dependencies: ["result_ca_max"],
    affectedModules: ["grading", "report cards", "broadsheets"],
    permissionBoundary: "Workspace administrator only; executed exclusively through an approved settings proposal.",
    saveBehaviour: "Numeric 0–100 enforced. The completeness audit flags ca + exam totals above 100; existing scored records are not re-scaled.",
    requiresApproval: true,
  },
  inactivity_timeout_minutes: {
    dependencies: [],
    affectedModules: ["portal sessions", "idle logout"],
    permissionBoundary: "Workspace administrator only; executed exclusively through an approved settings proposal.",
    saveBehaviour: "Integer 1–1440 enforced. Applies to newly evaluated session activity; already-active sessions honour the timeout on their next check.",
    requiresApproval: true,
  },
  login_students_disabled: {
    dependencies: ["education_module_enabled"],
    affectedModules: ["student portal access"],
    permissionBoundary: "Workspace administrator only; executed exclusively through an approved settings proposal.",
    saveBehaviour: "Boolean validated as 'true'/'false'. Disabling blocks new student sign-ins; it does not revoke existing server-side records.",
    requiresApproval: true,
  },
  login_teachers_disabled: {
    dependencies: [],
    affectedModules: ["staff portal access"],
    permissionBoundary: "Workspace administrator only; executed exclusively through an approved settings proposal.",
    saveBehaviour: "Boolean validated as 'true'/'false'. Disabling blocks new staff sign-ins workspace-wide; use with care.",
    requiresApproval: true,
  },
  block_reports_if_owing: {
    dependencies: [],
    affectedModules: ["report cards", "fees"],
    permissionBoundary: "Workspace administrator only; executed exclusively through an approved settings proposal.",
    saveBehaviour: "Boolean validated as 'true'/'false'. When enabled, report access checks the outstanding-balance ledger at view time.",
    requiresApproval: true,
  },
  name_order: {
    dependencies: ["name_case"],
    affectedModules: ["member directory", "portal displays", "documents"],
    permissionBoundary: "Workspace administrator only; executed exclusively through an approved settings proposal.",
    saveBehaviour: "Validated against ('FML','LFM'). Affects display ordering only; stored name components are unchanged.",
    requiresApproval: true,
  },
  name_case: {
    dependencies: ["name_order"],
    affectedModules: ["member directory", "portal displays", "documents"],
    permissionBoundary: "Workspace administrator only; executed exclusively through an approved settings proposal.",
    saveBehaviour: "Validated against ('title','upper','lower'). Display transformation only; stored values are unchanged.",
    requiresApproval: true,
  },
  recycle_bin_retention_days: {
    dependencies: [],
    affectedModules: ["recycle bin", "data retention"],
    permissionBoundary: "Workspace administrator only; executed exclusively through an approved settings proposal.",
    saveBehaviour: "Integer 1–365 enforced. Retention sweeps apply on the configured schedule; already-expired items are not restored.",
    requiresApproval: true,
  },
};

const SUPPORTED_KEYS = JD_SETTING_DEFINITIONS.map((definition) => definition.key);
const DEFINITION_BY_KEY = new Map(JD_SETTING_DEFINITIONS.map((definition) => [definition.key, definition]));

const coerceBool = (value: unknown): boolean | null => {
  if (value === true) return true;
  if (value === false) return false;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v === "true") return true;
    if (v === "false") return false;
  }
  return null;
};

const coerceNum = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const rowValue = (rows: SettingRow[], key: string) => rows.find((row) => row.key === key)?.value;

export function refusalFor(key: unknown) {
  const requested = typeof key === "string" ? key.trim().slice(0, 120) : "";
  return {
    status: "refused" as const,
    requested_key: requested || null,
    reason: requested && SECRET_KEY_PATTERN.test(requested)
      ? "Secret-like settings are never readable or changeable through JD."
      : "This setting is not registered in JD's settings intelligence catalogue, so JD cannot explain, audit or change it.",
    supported_keys: SUPPORTED_KEYS,
    message: "JD only answers for the supported settings listed here. Anything else is refused rather than guessed.",
  };
}

export function explainSetting(key: unknown, rows: SettingRow[] = []) {
  if (typeof key !== "string") return refusalFor(key);
  const normalized = key.trim();
  const definition = DEFINITION_BY_KEY.get(normalized);
  if (!definition || SECRET_KEY_PATTERN.test(normalized)) return refusalFor(normalized);
  const intelligence = INTELLIGENCE[normalized];
  const raw = rowValue(rows, normalized);
  const configured = raw !== undefined && raw !== null && String(raw).trim() !== "";
  const showValue = configured && definition.displayValue;
  const displayValue = showValue
    ? raw === "true" ? true : raw === "false" ? false : (coerceNum(raw) ?? String(raw).trim())
    : undefined;
  return {
    status: "ok" as const,
    key: definition.key,
    label: definition.label,
    category: definition.category,
    description: definition.description,
    status_configured: configured ? "configured" : "missing",
    ...(showValue ? { value: displayValue } : {}),
    dependencies: intelligence.dependencies,
    affected_modules: intelligence.affectedModules,
    permission_boundary: intelligence.permissionBoundary,
    save_behaviour: intelligence.saveBehaviour,
    requires_approval: intelligence.requiresApproval,
    evidence: "school_settings",
    limitations: [
      "JD explains settings; it cannot change them through this path. Changes go through a hash-bound Review Centre proposal and the approved executor.",
      "Dependency lists describe enforcement and audit relationships, not a complete module map.",
    ],
  };
}

export type AuditFinding = {
  id: string;
  severity: "high" | "warning" | "info";
  keys: string[];
  title: string;
  evidence: string;
  recommendation: string;
};

export function auditConfiguration(rows: SettingRow[] = []) {
  const findings: AuditFinding[] = [];
  const add = (finding: AuditFinding) => findings.push(finding);
  const configured = new Set(rows.filter((row) => row.value !== undefined && row.value !== null && String(row.value).trim() !== "").map((row) => row.key));
  const val = (key: string) => rowValue(rows, key);

  // --- Completeness ---
  for (const key of ["school_name", "school_address", "school_phone"]) {
    if (!configured.has(key)) {
      add({ id: `missing_${key}`, severity: key === "school_name" ? "high" : "warning", keys: [key],
        title: `${key.replace(/_/g, " ")} is not configured`,
        evidence: "school_settings: key absent or blank",
        recommendation: "Set the value through a reviewed settings proposal; this audit never writes settings itself." });
    }
  }
  for (const key of ["result_ca_max", "result_exam_max"]) {
    if (!configured.has(key)) {
      add({ id: `missing_${key}`, severity: "info", keys: [key],
        title: `${key.replace(/_/g, " ")} is not configured`,
        evidence: "school_settings: key absent or blank",
        recommendation: "Configure both score maxima so graders and report cards render complete totals." });
    }
  }

  // --- Contradictions and invalid values ---
  const workspaceType = typeof val("workspace_type") === "string" ? String(val("workspace_type")).trim().toLowerCase() : null;
  const education = coerceBool(val("education_module_enabled"));
  const loginStudents = coerceBool(val("login_students_disabled"));
  if (workspaceType === "education" && education === false) {
    add({ id: "education_type_with_module_disabled", severity: "high", keys: ["workspace_type", "education_module_enabled"],
      title: "Workspace type is 'education' but the education module is disabled",
      evidence: `school_settings: workspace_type=education, education_module_enabled=${String(val("education_module_enabled"))}`,
      recommendation: "Either enable the education module or change the workspace type through an approved proposal." });
  }
  if (education === true && workspaceType && workspaceType !== "education" && workspaceType !== "other") {
    add({ id: "education_module_without_education_type", severity: "warning", keys: ["workspace_type", "education_module_enabled"],
      title: "Education module is enabled for a non-education workspace type",
      evidence: `school_settings: workspace_type=${workspaceType}, education_module_enabled=true`,
      recommendation: "Confirm the workspace type or disable the education module; mixed signals confuse navigation and presets." });
  }
  if (loginStudents === true && education === false) {
    add({ id: "student_login_with_education_disabled", severity: "info", keys: ["login_students_disabled", "education_module_enabled"],
      title: "Student login is disabled while the education module is also disabled",
      evidence: "school_settings: login_students_disabled=true, education_module_enabled=false",
      recommendation: "Redundant as configured; no action required unless student access is re-enabled later." });
  }

  const ca = coerceNum(val("result_ca_max"));
  const exam = coerceNum(val("result_exam_max"));
  if (ca !== null && (ca < 0 || ca > 100)) {
    add({ id: "result_ca_max_out_of_range", severity: "high", keys: ["result_ca_max"],
      title: "Continuous assessment maximum is outside 0–100",
      evidence: `school_settings: result_ca_max=${String(val("result_ca_max"))}`,
      recommendation: "Correct to a value between 0 and 100 through an approved proposal." });
  }
  if (exam !== null && (exam < 0 || exam > 100)) {
    add({ id: "result_exam_max_out_of_range", severity: "high", keys: ["result_exam_max"],
      title: "Examination maximum is outside 0–100",
      evidence: `school_settings: result_exam_max=${String(val("result_exam_max"))}`,
      recommendation: "Correct to a value between 0 and 100 through an approved proposal." });
  }
  if (ca !== null && exam !== null && ca >= 0 && exam >= 0 && ca + exam > 100) {
    add({ id: "scores_exceed_100", severity: "high", keys: ["result_ca_max", "result_exam_max"],
      title: "CA + exam maxima exceed 100",
      evidence: `school_settings: result_ca_max=${ca}, result_exam_max=${exam} (sum ${ca + exam})`,
      recommendation: "Adjust the split so the total is 100; existing scores are not re-scaled automatically." });
  } else if (ca !== null && exam !== null && ca >= 0 && exam >= 0 && ca + exam < 100) {
    add({ id: "scores_below_100", severity: "warning", keys: ["result_ca_max", "result_exam_max"],
      title: "CA + exam maxima sum to less than 100",
      evidence: `school_settings: result_ca_max=${ca}, result_exam_max=${exam} (sum ${ca + exam})`,
      recommendation: "Confirm the intended total; graders will not auto-scale missing marks." });
  }

  const timeout = coerceNum(val("inactivity_timeout_minutes"));
  if (timeout !== null && (!Number.isInteger(timeout) || timeout < 1 || timeout > 1440)) {
    add({ id: "inactivity_timeout_invalid", severity: "high", keys: ["inactivity_timeout_minutes"],
      title: "Inactivity timeout is not a whole number between 1 and 1440",
      evidence: `school_settings: inactivity_timeout_minutes=${String(val("inactivity_timeout_minutes"))}`,
      recommendation: "Set a whole number between 1 and 1440 through an approved proposal." });
  }

  const retention = coerceNum(val("recycle_bin_retention_days"));
  if (retention !== null && (!Number.isInteger(retention) || retention < 1 || retention > 365)) {
    add({ id: "retention_invalid", severity: "high", keys: ["recycle_bin_retention_days"],
      title: "Recycle bin retention is not a whole number between 1 and 365",
      evidence: `school_settings: recycle_bin_retention_days=${String(val("recycle_bin_retention_days"))}`,
      recommendation: "Set a whole number between 1 and 365 through an approved proposal." });
  }

  const nameOrder = typeof val("name_order") === "string" ? String(val("name_order")).trim() : null;
  if (nameOrder !== null && !["FML", "LFM"].includes(nameOrder)) {
    add({ id: "name_order_invalid", severity: "warning", keys: ["name_order"],
      title: "Member name order is not a recognised value",
      evidence: `school_settings: name_order=${nameOrder}`,
      recommendation: "Use FML (first-middle-last) or LFM (last-first-middle)." });
  }
  const nameCase = typeof val("name_case") === "string" ? String(val("name_case")).trim() : null;
  if (nameCase !== null && !["title", "upper", "lower"].includes(nameCase)) {
    add({ id: "name_case_invalid", severity: "warning", keys: ["name_case"],
      title: "Member name capitalisation is not a recognised value",
      evidence: `school_settings: name_case=${nameCase}`,
      recommendation: "Use title, upper or lower." });
  }

  // --- Secret-like rows are acknowledged but never reported on ---
  const protectedCount = rows.filter((row) => SECRET_KEY_PATTERN.test(row.key)).length;

  const high = findings.filter((f) => f.severity === "high").length;
  const warning = findings.filter((f) => f.severity === "warning").length;
  const info = findings.filter((f) => f.severity === "info").length;
  return {
    unchanged: true as const,
    findings,
    summary: { high, warning, info, total: findings.length, protected_settings_excluded: protectedCount, registered_keys_checked: SUPPORTED_KEYS.length },
    evidence: "school_settings",
    limitations: [
      "The audit reads only the registered settings catalogue; it is not a full module or schema review.",
      "Findings are advisory. JD never changes a setting as part of an audit.",
      "Secret-like settings are counted but never inspected or reported on.",
    ],
  };
}

export function explainSaveBehaviour(key: unknown) {
  if (typeof key !== "string") return refusalFor(key);
  const normalized = key.trim();
  const definition = DEFINITION_BY_KEY.get(normalized);
  if (!definition || SECRET_KEY_PATTERN.test(normalized)) return refusalFor(normalized);
  const intelligence = INTELLIGENCE[normalized];
  return {
    status: "ok" as const,
    key: definition.key,
    requires_approval: intelligence.requiresApproval,
    permission_boundary: intelligence.permissionBoundary,
    save_behaviour: intelligence.saveBehaviour,
    executor: "jd_apply_settings_proposal_step",
    guarantees: [
      "Only an approved, hash-verified proposal can reach the executor.",
      "A stale before-value aborts the step with a conflict, not an overwrite.",
      "Each committed step is read-after-write verified and audited.",
    ],
    evidence: "school_settings",
  };
}
