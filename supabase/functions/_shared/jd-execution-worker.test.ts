import { isQueueMessage, retryDelaySeconds, safeWorkerId, isTerminalProviderRejection, isProviderRateLimit, NonRetryableExecutionEvidenceError, isNonRetryableExecutionEvidenceError } from "./jd-execution-worker-helpers.ts";

function assertEquals(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);
}

Deno.test("accepts only version-one opaque job messages", () => {
  assertEquals(isQueueMessage({ message_id: 12, read_count: 1, message: { job_id: "job-1", schema_version: 1 } }), true, "valid queue message");
  assertEquals(isQueueMessage({ message_id: 12, message: { job_id: "job-1", schema_version: 2 } }), false, "unsupported schema version");
  assertEquals(isQueueMessage({ message_id: 0, message: { job_id: "job-1", schema_version: 1 } }), false, "invalid message id");
  assertEquals(isQueueMessage({ message_id: 12, message: { prompt: "private", schema_version: 1 } }), false, "prompt payload rejected");
});

Deno.test("worker identifiers are bounded and normalised", () => {
  assertEquals(safeWorkerId("worker/eu west"), "worker-eu-west", "worker id normalisation");
  assertEquals(safeWorkerId(""), "jd-edge-worker", "worker id fallback");
  assertEquals(safeWorkerId("x".repeat(150)).length, 120, "worker id length bound");
});

Deno.test("retry delay is exponential and bounded", () => {
  assertEquals(retryDelaySeconds(1), 5, "first retry delay");
  assertEquals(retryDelaySeconds(2), 10, "second retry delay");
  assertEquals(retryDelaySeconds(3), 20, "third retry delay");
  assertEquals(retryDelaySeconds(20), 300, "maximum retry delay");
});

Deno.test("execution evidence persistence failures are terminal and non-retryable", () => {
  const error = new NonRetryableExecutionEvidenceError("evidence write failed");
  assertEquals(isNonRetryableExecutionEvidenceError(error), true, "typed evidence failure recognised");
  assertEquals(isNonRetryableExecutionEvidenceError({ code: "JD_EXECUTION_EVIDENCE_PERSISTENCE_FAILED" }), true, "serialised evidence failure recognised");
  assertEquals(isNonRetryableExecutionEvidenceError(new Error("temporary network error")), false, "ordinary transient error remains retryable");
});

Deno.test("HTTP 429 uses bounded durable retry instead of terminal provider rejection", () => {
  const detail = "Model provider returned HTTP 429 after 3 attempt(s): upstream rate limited";
  assertEquals(isProviderRateLimit(detail), true, "429 is classified as rate limited");
  assertEquals(isTerminalProviderRejection(detail), false, "429 is not terminal");
});

Deno.test("permanent provider 4xx remains terminal", () => {
  const detail = "Model provider returned HTTP 400 after 1 attempt(s): malformed request";
  assertEquals(isProviderRateLimit(detail), false, "400 is not rate limited");
  assertEquals(isTerminalProviderRejection(detail), true, "400 is terminal");
});
