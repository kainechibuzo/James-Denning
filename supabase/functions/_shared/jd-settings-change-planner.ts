import { JD_SETTING_DEFINITIONS } from "./jd-settings-catalogue.ts";

export type ProposedSettingChange = { key: string; value: unknown };

const approvalCategories = new Set(["workspace", "identity", "security", "billing"]);
const allowedWorkspaceTypes = new Set(["business", "professional-services", "retail", "nonprofit", "healthcare", "education", "other"]);

function validateValue(key: string, value: unknown): string | null {
  if (typeof value === "string" && value.length > 500) return "Value exceeds 500 characters";
  if (key === "workspace_type") return typeof value === "string" && allowedWorkspaceTypes.has(value) ? null : "Unsupported workspace type";
  if (["education_module_enabled", "login_students_disabled", "login_teachers_disabled", "block_reports_if_owing"].includes(key)) {
    return typeof value === "boolean" || value === "true" || value === "false" ? null : "Expected a boolean value";
  }
  if (["result_ca_max", "result_exam_max"].includes(key)) {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 && n <= 100 ? null : "Score maximum must be between 0 and 100";
  }
  if (key === "inactivity_timeout_minutes") {
    const n = Number(value);
    return Number.isInteger(n) && n >= 1 && n <= 1440 ? null : "Timeout must be an integer from 1 to 1440 minutes";
  }
  if (key === "recycle_bin_retention_days") {
    const n = Number(value);
    return Number.isInteger(n) && n >= 1 && n <= 365 ? null : "Retention must be an integer from 1 to 365 days";
  }
  if (key === "name_order") return ["FML", "LFM"].includes(String(value)) ? null : "Name order must be FML or LFM";
  if (key === "name_case") return ["title", "upper", "lower"].includes(String(value)) ? null : "Unsupported name capitalisation";
  if (["school_name", "school_address", "school_phone", "school_motto"].includes(key)) {
    return typeof value === "string" && value.trim().length > 0 ? null : "A non-empty text value is required";
  }
  return "This setting has no registered validation rule";
}

export function buildSettingsChangePlan(
  requested: ProposedSettingChange[],
  currentRows: Array<{ key: string; value: unknown }>,
) {
  const current = new Map(currentRows.map((row) => [row.key, row.value]));
  const definitions = new Map(JD_SETTING_DEFINITIONS.map((item) => [item.key, item]));
  const seen = new Set<string>();
  const changes: Array<Record<string, unknown>> = [];
  const rejected: Array<{ key: string; reason: string }> = [];

  for (const item of requested.slice(0, 20)) {
    const key = typeof item?.key === "string" ? item.key : "";
    const definition = definitions.get(key);
    if (!definition) {
      rejected.push({ key: key || "(missing)", reason: "Setting is not in the registered JD catalogue" });
      continue;
    }
    if (seen.has(key)) {
      rejected.push({ key, reason: "Duplicate setting in the same proposal" });
      continue;
    }
    seen.add(key);
    const validationError = validateValue(key, item.value);
    if (validationError) {
      rejected.push({ key, reason: validationError });
      continue;
    }
    const before = current.has(key) ? current.get(key) : null;
    const after = item.value;
    if (String(before ?? "") === String(after ?? "")) {
      changes.push({ key, label: definition.label, category: definition.category, before, after, status: "no_change", approval_required: false });
      continue;
    }
    changes.push({
      key,
      label: definition.label,
      category: definition.category,
      before,
      after,
      status: "proposed",
      approval_required: approvalCategories.has(definition.category),
      confirmation_required: !approvalCategories.has(definition.category),
      impact: definition.description,
    });
  }

  const actionable = changes.filter((item) => item.status === "proposed");
  return {
    status: rejected.length ? (actionable.length ? "partially_valid" : "invalid") : "ready_for_review",
    changes,
    rejected,
    summary: {
      requested: requested.length,
      proposed: actionable.length,
      no_change: changes.filter((item) => item.status === "no_change").length,
      rejected: rejected.length,
      approval_required: actionable.filter((item) => item.approval_required).length,
      confirmation_required: actionable.filter((item) => item.confirmation_required).length,
    },
    execution: {
      performed: false,
      status: "not_executed",
      message: "This is a proposal only. No settings have been changed. A separate approved execution workflow is required.",
    },
  };
}
