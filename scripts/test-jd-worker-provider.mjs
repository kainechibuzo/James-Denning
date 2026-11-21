import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const worker = readFileSync("supabase/functions/jd-execution-worker/index.ts", "utf8");

test("production execution worker routes Gemini through OpenRouter Responses API", () => {
  assert.ok(worker.includes("OPENROUTER_API_KEY"));
  assert.ok(worker.includes("JD_MODEL_NAME"));
  assert.ok(worker.includes("selectJdModel("));
  assert.ok(worker.includes("JD_MODEL_BASE_URL"));
  assert.ok(worker.includes("baseUrl: modelBaseUrl"));
  assert.ok(!worker.includes("GEMINI_API_KEY"));
  assert.ok(!worker.includes("generativelanguage.googleapis.com"));
});

test("worker keeps provider/model selection server-side and supports routing overrides", () => {
  assert.ok(worker.includes("JD_MODEL_FAST_NAME"));
  assert.ok(worker.includes("JD_MODEL_REASONING_NAME"));
  assert.ok(worker.includes("OpenRouter API key is not configured"));
});
