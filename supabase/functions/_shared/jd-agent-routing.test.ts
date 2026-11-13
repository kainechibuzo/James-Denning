import { classifyJdTask, selectJdModel } from "./jd-agent-routing.ts";

function equal(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) throw new Error(label + ": expected " + String(expected) + ", received " + String(actual));
}

Deno.test("JD task routing identifies quick, balanced and deep work", () => {
  equal(classifyJdTask("How many staff are active?"), "fast", "quick question");
  equal(classifyJdTask("Summarise the last month's operational activity and identify trends."), "balanced", "balanced analysis");
  equal(classifyJdTask("Prepare a comprehensive business plan and financial forecast."), "reasoning", "deep planning");
});

Deno.test("JD routing uses configured model rungs and safely preserves the default", () => {
  equal(selectJdModel("How many staff?", "openrouter/free", { fast: "google/gemini-fast" }), "google/gemini-fast", "fast override");
  equal(selectJdModel("Prepare a strategic plan", "openrouter/free", { reasoning: "google/gemini-pro" }), "google/gemini-pro", "reasoning override");
  equal(selectJdModel("Prepare a strategic plan", "openrouter/free", { reasoning: "bad model slug" }), "openrouter/free", "invalid override");
  equal(selectJdModel("A normal update", "fixed/model", { fast: "google/gemini-fast" }), "fixed/model", "balanced keeps configured model");
});
