import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const worker = readFileSync("supabase/functions/jd-execution-worker/index.ts", "utf8");

test("production execution worker routes Gemini through OpenRouter Responses API", () => {
  assert.match(worker, /OPENROUTER_API_KEY/);
  assert.match(worker, /JD_MODEL_NAME/);
  assert.match(worker, /selectJdModel\\(/);
  assert.match(worker, /JD_MODEL_BASE_URL.*https:\\/\\/openrouter\\.ai\\/api\\/v1/);
  assert.match(worker, /baseUrl: modelBaseUrl/);
  assert.doesNotMatch(worker, /GEMINI_API_KEY/);
  assert.doesNotMatch(worker, /generativelanguage\\.googleapis\\.com/);
});

test("worker keeps provider/model selection server-side and supports routing overrides", () => {
  assert.match(worker, /JD_MODEL_FAST_NAME/);
  assert.match(worker, /JD_MODEL_REASONING_NAME/);
  assert.match(worker, /OpenRouter API key is not configured/);
});
