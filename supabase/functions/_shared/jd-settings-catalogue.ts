export type SettingRow = { key: string; value: unknown };

type SettingDefinition = {
  key: string;
  label: string;
  category: "workspace" | "identity" | "performance" | "security" | "billing" | "portal";
  description: string;
  displayValue: boolean;
};

export const JD_SETTING_DEFINITIONS: SettingDefinition[] = [
  { key: "workspace_type", label: "Workspace type", category: "workspace", description: "Selects the organisation's operating terminology and industry preset.", displayValue: true },
  { key: "education_module_enabled", label: "Education module", category: "workspace", description: "Controls availability of education-specific navigation and workflows.", displayValue: true },
  { key: "school_name", label: "Organisation name", category: "identity", description: "Official organisation name used across portal surfaces and documents.", displayValue: true },
  { key: "school_address", label: "Organisation address", category: "identity", description: "Physical organisation address used on official documents.", displayValue: true },
  { key: "school_phone", label: "Organisation phone", category: "identity", description: "Main organisation contact number.", displayValue: true },
  { key: "school_motto", label: "Organisation motto", category: "identity", description: "Short organisation motto displayed on supported documents.", displayValue: true },
  { key: "admin_email", label: "Workspace administrator email", category: "identity", description: "Administrative contact configured for workspace notifications. The address is never returned to the model.", displayValue: false },
  { key: "result_ca_max", label: "Continuous assessment maximum", category: "performance", description: "Maximum score allocated to continuous assessment.", displayValue: true },
  { key: "result_exam_max", label: "Examination maximum", category: "performance", description: "Maximum score allocated to the main examination.", displayValue: true },
  { key: "inactivity_timeout_minutes", label: "Inactivity timeout", category: "security", description: "Session inactivity timeout in minutes.", displayValue: true },
  { key: "login_students_disabled", label: "Student login access", category: "security", description: "Whether student login is disabled.", displayValue: true },
  { key: "login_teachers_disabled", label: "Staff login access", category: "security", description: "Whether staff login is disabled.", displayValue: true },
  { key: "block_reports_if_owing", label: "Outstanding balance report restriction", category: "billing", description: "Whether report access is restricted for accounts with outstanding balances.", displayValue: true },
  { key: "name_order", label: "Member name order", category: "portal", description: "Controls the order of member names in portal displays.", displayValue: true },
  { key: "name_case", label: "Member name capitalisation", category: "portal", description: "Controls member name capitalisation in portal displays.", displayValue: true },
  { key: "recycle_bin_retention_days", label: "Recycle bin retention", category: "portal", description: "Number of days deleted items remain in the recycle bin.", displayValue: true },
];

export const SECRET_KEY_PATTERN = /(password|secret|token|api.?key|credential|private|smtp|webhook|service.?role|vapid|oauth)/i;

export function buildSettingsCatalogue(rows: SettingRow[]) {
  const byKey = new Map(rows.map((row) => [row.key, row.value]));
  const educationActive=byKey.get("workspace_type")==="education"&&![false,"false"].includes(byKey.get("education_module_enabled") as any);
  const academicKeys=new Set(["result_ca_max","result_exam_max","block_reports_if_owing","login_students_disabled","login_teachers_disabled"]);
  const knownKeys = new Set(JD_SETTING_DEFINITIONS.map((item) => item.key));
  const settings = JD_SETTING_DEFINITIONS.filter((definition) => !academicKeys.has(definition.key) || educationActive).map((definition) => {
    const value = byKey.get(definition.key);
    const configured = value !== undefined && value !== null && String(value).trim() !== "";
    return {
      key: definition.key,
      label: definition.label,
      category: definition.category,
      description: definition.description,
      status: configured ? "configured" : "missing",
      ...(configured && definition.displayValue ? { value: value === "true" ? true : value === "false" ? false : value } : {}),
      applies_to_current_workspace: !academicKeys.has(definition.key)||educationActive,
      editable_via_jd: false, // This catalogue is read-only.
      review_proposal_supported: ["workspace","identity","security","billing"].includes(definition.category),
      evidence: "school_settings",
    };
  });
  const protectedKeys = rows.filter((row) => SECRET_KEY_PATTERN.test(row.key));
  const unknownKeys = rows.filter((row) => !knownKeys.has(row.key) && !SECRET_KEY_PATTERN.test(row.key));
  const configuredCount = settings.filter((item) => item.status === "configured").length;
  const missingCount = settings.length - configuredCount;
  return {
    settings,
    workspace_context: {workspace_type:byKey.get("workspace_type")||"business",education_surfaces_active:educationActive,note:"Stored academic values are not proof that education surfaces are active. Applicability describes presentation, not security enforcement."},
    summary: {
      known_settings: settings.length,
      configured: configuredCount,
      missing: missingCount,
      protected_settings_excluded: protectedKeys.length,
      unclassified_settings: unknownKeys.length,
      not_applicable_settings_excluded: JD_SETTING_DEFINITIONS.length - settings.length,
    },
    unclassified_keys: unknownKeys.map((row) => row.key).slice(0, 50),
    limitations: [
      "This catalogue covers the settings explicitly registered in JD's current settings UI; it is not yet a complete inventory of every module or database capability.",
      "This catalogue is read-only. Owners/admins can request supported changes with submit_workspace_settings_for_review; human review and explicit application in Review Centre are required. Submission is not execution.",
      "Secret-like setting values are excluded from model context.",
    ],
  };
}

export function filterSettingsCatalogue(
  catalogue: ReturnType<typeof buildSettingsCatalogue>,
  category?: string,
) {
  if (!category) return catalogue;
  const settings = catalogue.settings.filter((item) => item.category === category);
  return {
    ...catalogue,
    settings,
    summary: {
      ...catalogue.summary,
      known_settings: settings.length,
      configured: settings.filter((item) => item.status === "configured").length,
      missing: settings.filter((item) => item.status === "missing").length,
    },
  };
}
