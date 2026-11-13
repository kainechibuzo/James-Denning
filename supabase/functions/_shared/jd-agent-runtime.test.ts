import { addUsage, emptyUsage, isRetryableStatus, normaliseUsage, retryDelayMs, resolveFollowupModel } from "./jd-agent-runtime.ts";

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

Deno.test("usage normalisation never invents total tokens", () => {
  const usage = normaliseUsage({ input_tokens: 12, output_tokens: 7 });
  assertEqual(usage?.input_tokens, 12, "input tokens");
  assertEqual(usage?.output_tokens, 7, "output tokens");
  assertEqual(usage?.total_tokens, null, "unreported total tokens");
});

Deno.test("usage aggregation counts model requests and preserves missing totals", () => {
  const total = emptyUsage();
  addUsage(total, { input_tokens: 10, output_tokens: 4 });
  addUsage(total, { input_tokens: 8, output_tokens: 3, total_tokens: 11 });
  assertEqual(total.model_requests, 2, "model request count");
  assertEqual(total.usage_reported_requests, 2, "usage-reported request count");
  assertEqual(total.input_tokens, 18, "aggregated input tokens");
  assertEqual(total.output_tokens, 7, "aggregated output tokens");
  assertEqual(total.total_tokens, 11, "provider-reported total only");
  assertEqual(total.total_tokens_reported_requests, 1, "total-reporting request count");
});

Deno.test("only transient provider statuses are retried", () => {
  assertEqual(isRetryableStatus(429), true, "rate limit retry");
  assertEqual(isRetryableStatus(503), true, "service unavailable retry");
  assertEqual(isRetryableStatus(401), false, "authentication error is not retried");
  assertEqual(isRetryableStatus(400), false, "bad request is not retried");
});

Deno.test("retry delay is bounded and respects Retry-After seconds", () => {
  assertEqual(retryDelayMs(null, 1), 500, "first backoff");
  assertEqual(retryDelayMs(null, 2), 1000, "second backoff");
  assertEqual(retryDelayMs("1.5", 1), 1500, "Retry-After");
  assertEqual(retryDelayMs("99", 1), 8000, "maximum delay");
});

Deno.test("free router follow-up requests stay on the first selected model", () => {
  assertEqual(
    resolveFollowupModel("openrouter/free", "openrouter/free", "particle-ai/particle-1:free"),
    "particle-ai/particle-1:free",
    "pin selected free model",
  );
  assertEqual(
    resolveFollowupModel("openrouter/free", "particle-ai/particle-1:free", null),
    "particle-ai/particle-1:free",
    "retain pinned model when response omits model",
  );
});

Deno.test("configured model choices are never replaced by provider response metadata", () => {
  assertEqual(
    resolveFollowupModel("vendor/model:free", "vendor/model:free", "other/model:free"),
    "vendor/model:free",
    "preserve configured model",
  );
  assertEqual(
    resolveFollowupModel("openrouter/free", "openrouter/free", "invalid model slug"),
    "openrouter/free",
    "reject malformed selected model",
  );
});
