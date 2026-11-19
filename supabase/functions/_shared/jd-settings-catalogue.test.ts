import { buildSettingsCatalogue, filterSettingsCatalogue } from "./jd-settings-catalogue.ts";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

Deno.test("catalogue reports configured and missing registered settings", () => {
  const result = buildSettingsCatalogue([
    { key: "workspace_type", value: "education" },
    { key: "education_module_enabled", value: "true" },
    { key: "school_name", value: "Example Org" },
    { key: "result_ca_max", value: "40" },
  ]);
  const name = result.settings.find((item) => item.key === "school_name");
  const address = result.settings.find((item) => item.key === "school_address");
  assert(name?.status === "configured" && name.value === "Example Org", "configured name is reported");
  assert(address?.status === "missing", "missing address is reported");
  assert(result.summary.configured === 4, "configured count is correct");
});

Deno.test("secret-like and unknown settings values never enter model output", () => {
  const result = buildSettingsCatalogue([
    { key: "smtp_password", value: "do-not-return-this" },
    { key: "unknown_custom_key", value: "private-custom-value" },
  ]);
  const serialized = JSON.stringify(result);
  assert(!serialized.includes("do-not-return-this"), "secret value excluded");
  assert(!serialized.includes("private-custom-value"), "unknown value excluded");
  assert(result.summary.protected_settings_excluded === 1, "protected key counted");
  assert(result.unclassified_keys.includes("unknown_custom_key"), "unknown key name is discoverable");
});

Deno.test("category filter returns only the requested category", () => {
  const result = filterSettingsCatalogue(buildSettingsCatalogue([
    { key: "workspace_type", value: "education" },
    { key: "education_module_enabled", value: "true" },
    { key: "school_name", value: "Example Org" },
    { key: "result_ca_max", value: "40" },
  ]), "performance");
  assert(result.settings.length === 2, "performance settings only");
  assert(result.settings.every((item) => item.category === "performance"), "all entries match category");
});

Deno.test("business workspace hides education-only settings and classifies admin email without exposing it", () => {
  const result = buildSettingsCatalogue([
    { key: "workspace_type", value: "business" },
    { key: "education_module_enabled", value: "false" },
    { key: "result_ca_max", value: "40" },
    { key: "admin_email", value: "private@example.test" },
  ]);
  assert(!result.settings.some((item) => item.key === "result_ca_max"), "academic settings are hidden for business workspaces");
  assert(!result.settings.some((item) => item.key === "login_students_disabled"), "student login setting is hidden for business workspaces");
  const adminEmail = result.settings.find((item) => item.key === "admin_email");
  assert(adminEmail?.status === "configured", "admin email is classified");
  assert(!("value" in (adminEmail || {})), "admin email value is not exposed");
  assert(result.summary.not_applicable_settings_excluded === 5, "five education-only settings are excluded");
  assert(!result.unclassified_keys.includes("admin_email"), "admin email is no longer unclassified");
});
