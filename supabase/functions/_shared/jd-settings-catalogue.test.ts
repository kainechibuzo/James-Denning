import { buildSettingsCatalogue, filterSettingsCatalogue } from "./jd-settings-catalogue.ts";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

Deno.test("catalogue reports configured and missing registered settings", () => {
  const result = buildSettingsCatalogue([
    { key: "school_name", value: "Example Org" },
    { key: "result_ca_max", value: "40" },
  ]);
  const name = result.settings.find((item) => item.key === "school_name");
  const address = result.settings.find((item) => item.key === "school_address");
  assert(name?.status === "configured" && name.value === "Example Org", "configured name is reported");
  assert(address?.status === "missing", "missing address is reported");
  assert(result.summary.configured === 2, "configured count is correct");
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
    { key: "school_name", value: "Example Org" },
    { key: "result_ca_max", value: "40" },
  ]), "performance");
  assert(result.settings.length === 2, "performance settings only");
  assert(result.settings.every((item) => item.category === "performance"), "all entries match category");
});
