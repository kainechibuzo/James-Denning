import { assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";
const worker = await Deno.readTextFile(new URL("../jd-execution-worker/index.ts", import.meta.url));
const runtime = await Deno.readTextFile(new URL("./jd-agent-runtime.ts", import.meta.url));

Deno.test("worker restores durable tool results after a crash before the runtime checkpoint", () => {
  assertMatch(worker, /step\.status === "completed" && typeof \(step\.output_json as any\)\?\.tool_output === "string"/);
  assertMatch(worker, /recoveredState\.conversationInput\.push\(\{ type: "function_call_output", call_id: callId, output \}\)/);
  assertMatch(worker, /recoveredState\.completedCalls\.push\(callId\)/);
});

Deno.test("worker blocks automatic retries when a tool was started but its outcome was not saved", () => {
  assertMatch(worker, /outcome: "unknown"/);
  assertMatch(worker, /JD will not repeat it automatically/);
  assertMatch(worker, /recovery_blocked_duplicate/);
  assertMatch(worker, /recoveredIncomplete/);
});

Deno.test("runtime checkpoints tool-call requests before executing side effects", () => {
  const checkpoint = runtime.indexOf("conversationInput.push(...output);");
  const execute = runtime.indexOf("const outputs = await Promise.all(calls.map");
  assertMatch(runtime, /Persist the assistant's tool-call request before any side effect begins/);
  if (checkpoint < 0 || execute < 0 || checkpoint > execute) throw new Error("Tool-call checkpoint must precede execution");
});

Deno.test("runtime journals the tool response before its final conversation checkpoint", () => {
  assertMatch(runtime, /toolOutput: toolOutput\.slice\(0, 80000\)/);
  assertMatch(worker, /tool_output: typeof event\.toolOutput === "string"/);
});
