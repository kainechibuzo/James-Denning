import { buildOrganisationBlueprintDraft, validateOrganisationBlueprint } from "./jd-organisation-blueprint.ts";

Deno.test("clothing store idea generates departments, roles, workflows and KPIs", () => {
  const draft = buildOrganisationBlueprintDraft({ businessIdea: "I want to start a clothing store" });
  const result = validateOrganisationBlueprint(draft);
  if (!result.ok) throw new Error(result.errors.join(", "));
  if (result.blueprint.industry !== "Clothing retail") throw new Error("Expected clothing retail industry");
  if (result.blueprint.departments.length < 5) throw new Error("Expected a useful clothing-store department structure");
  if (!result.blueprint.departments.some((department) => department.name === "Merchandising & Inventory")) throw new Error("Missing merchandising department");
  if (!result.blueprint.departments.every((department) => department.roles.length && department.workflows.length && department.kpis.length)) throw new Error("Every department must include roles, workflows and KPIs");
});

Deno.test("trucking company idea generates fleet and dispatch departments", () => {
  const draft = buildOrganisationBlueprintDraft({ businessIdea: "I want to start a trucking company" });
  const result = validateOrganisationBlueprint(draft);
  if (!result.ok) throw new Error(result.errors.join(", "));
  if (result.blueprint.industry !== "Trucking and logistics") throw new Error("Expected trucking industry");
  if (!result.blueprint.departments.some((department) => department.name === "Fleet Operations")) throw new Error("Missing fleet operations department");
  if (!result.blueprint.departments.some((department) => department.name === "Dispatch & Logistics")) throw new Error("Missing dispatch department");
});

Deno.test("unknown business ideas receive a complete general starter structure", () => {
  const draft = buildOrganisationBlueprintDraft({ businessIdea: "I want to start a creative agency" });
  const result = validateOrganisationBlueprint(draft);
  if (!result.ok) throw new Error(result.errors.join(", "));
  if (result.blueprint.departments.length < 4) throw new Error("Expected general starter departments");
});
