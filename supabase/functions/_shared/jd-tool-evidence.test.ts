import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isSuccessfulToolResult } from "./jd-tool-evidence.ts";

Deno.test("tool evidence accepts non-empty successful results including negative findings", () => {
  assertEquals(isSuccessfulToolResult({ total_members: 0 }), true);
  assertEquals(isSuccessfulToolResult({ available: false, reason: "No active term" }), true);
  assertEquals(isSuccessfulToolResult({ id: "record-1", persisted: true }), true);
});

Deno.test("tool evidence rejects empty and explicitly failed results", () => {
  assertEquals(isSuccessfulToolResult({}), false);
  assertEquals(isSuccessfulToolResult(null), false);
  assertEquals(isSuccessfulToolResult({ ok: false, error: "write failed" }), false);
  assertEquals(isSuccessfulToolResult({ success: false }), false);
  assertEquals(isSuccessfulToolResult({ status: "failed" }), false);
  assertEquals(isSuccessfulToolResult({ error: "Provider rejected request" }), false);
});
