import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isQueueMessage, retryDelaySeconds, safeWorkerId } from "./jd-execution-worker-helpers.ts";

Deno.test("accepts only version-one opaque job messages", () => {
  assertEquals(isQueueMessage({ message_id: 12, read_count: 1, message: { job_id: "job-1", schema_version: 1 } }), true);
  assertEquals(isQueueMessage({ message_id: 12, message: { job_id: "job-1", schema_version: 2 } }), false);
  assertEquals(isQueueMessage({ message_id: 0, message: { job_id: "job-1", schema_version: 1 } }), false);
  assertEquals(isQueueMessage({ message_id: 12, message: { prompt: "private", schema_version: 1 } }), false);
});

Deno.test("worker identifiers are bounded and normalised", () => {
  assertEquals(safeWorkerId("worker/eu west"), "worker-eu-west");
  assertEquals(safeWorkerId(""), "jd-edge-worker");
  assertEquals(safeWorkerId("x".repeat(150)).length, 120);
});

Deno.test("retry delay is exponential and bounded", () => {
  assertEquals(retryDelaySeconds(1), 5);
  assertEquals(retryDelaySeconds(2), 10);
  assertEquals(retryDelaySeconds(3), 20);
  assertEquals(retryDelaySeconds(20), 300);
});
