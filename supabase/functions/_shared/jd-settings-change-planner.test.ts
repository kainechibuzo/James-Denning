import { buildSettingsChangePlan } from "./jd-settings-change-planner.ts";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

Deno.test("planner creates before-and-after proposals without applying them", () => {
  const plan = buildSettingsChangePlan([{ key: "school_name", value: "New Name" }], [{ key: "school_name", value: "Old Name" }]);
  assert(plan.status === "ready_for_review", "proposal is reviewable");
  assert(plan.changes[0].before === "Old Name" && plan.changes[0].after === "New Name", "diff is included");
  assert(plan.execution.performed === false, "planner does not execute");
});

Deno.test("security and identity changes are marked for Review Centre approval", () => {
  const plan = buildSettingsChangePlan([
    { key: "school_name", value: "Updated Org" },
    { key: "inactivity_timeout_minutes", value: 15 },
    { key: "name_case", value: "upper" },
  ], []);
  assert(plan.summary.approval_required === 2, "identity and security need approval");
  assert(plan.summary.confirmation_required === 1, "ordinary portal preference needs confirmation");
});

Deno.test("unknown keys, invalid values and duplicate keys are rejected", () => {
  const plan = buildSettingsChangePlan([
    { key: "admin_password", value: "secret" },
    { key: "result_ca_max", value: 500 },
    { key: "name_case", value: "upper" },
    { key: "name_case", value: "lower" },
  ], []);
  assert(plan.rejected.length === 3, "three invalid entries rejected");
  assert(plan.execution.performed === false, "rejected plan still never executes");
});

Deno.test("unchanged values are identified as no-op entries", () => {
  const plan = buildSettingsChangePlan([{ key: "name_case", value: "title" }], [{ key: "name_case", value: "title" }]);
  assert(plan.changes[0].status === "no_change", "no-op detected");
  assert(plan.summary.proposed === 0, "no proposed writes remain");
});
