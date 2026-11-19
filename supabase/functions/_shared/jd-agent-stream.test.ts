import { readResponsesStream, readChatCompletionsStream, responsesInputToChatMessages, responsesToolsToChatTools, responseOutputText, shouldContinueResponse } from "./jd-agent-stream.ts";

function equal(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) throw new Error(label + ": expected " + String(expected) + ", received " + String(actual));
}

Deno.test("Responses stream forwards text deltas and returns the completed response", async () => {
  const encoder = new TextEncoder();
  const chunks = [
    'data: {"type":"response.output_text.delta","delta":"Hello "}\n\n',
    'data: {"type":"response.output_text.delta","delta":"world"}\n\n',
    'data: {"type":"response.completed","response":{"status":"completed","output_text":"Hello world","usage":{"output_tokens":2}}}\n\n',
    "data: [DONE]\n\n",
  ];
  const body = new ReadableStream<Uint8Array>({
    start(controller) { for (const chunk of chunks) controller.enqueue(encoder.encode(chunk)); controller.close(); },
  });
  const deltas: string[] = [];
  const result = await readResponsesStream(body, (delta) => deltas.push(delta));
  equal(deltas.join(""), "Hello world", "streamed text");
  equal(result.status, "completed", "terminal status");
  equal(responseOutputText(result), "Hello world", "final text");
});

Deno.test("Responses stream handles chunk boundaries and incomplete output", async () => {
  const encoder = new TextEncoder();
  const first = 'data: {"type":"response.output_text.delta","delta":"Partial"}\n';
  const second = 'data: {"type":"response.incomplete","response":{"status":"incomplete","incomplete_details":{"reason":"max_output_tokens"},"output":[]}}\n';
  const body = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(encoder.encode(first.slice(0, 17))); controller.enqueue(encoder.encode(first.slice(17) + second)); controller.close(); },
  });
  const deltas: string[] = [];
  const result = await readResponsesStream(body, (delta) => deltas.push(delta));
  equal(deltas.join(""), "Partial", "split text delta");
  equal(shouldContinueResponse(result, 0), true, "continue after output token limit");
  equal(shouldContinueResponse(result, 2), false, "continuation cap");
});

Deno.test("Responses stream fails closed when no terminal event arrives", async () => {
  const body = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new TextEncoder().encode('data: {"type":"response.output_text.delta","delta":"partial"}\n')); controller.close(); },
  });
  let failed = false;
  try { await readResponsesStream(body); } catch { failed = true; }
  equal(failed, true, "missing terminal event rejected");
});


Deno.test("Gemini-compatible stream returns assistant text and complete tool calls", async () => {
  const encoder = new TextEncoder();
  const chunks = [
    'data: {"id":"chatcmpl-1","model":"gemini-3.1-flash-lite","choices":[{"delta":{"content":"Checking "},"finish_reason":null}]}\n\n',
    'data: {"choices":[{"delta":{"content":"now"},"finish_reason":null}]}\n\n',
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"get_people_intelligence","arguments":"{}"}}]},"finish_reason":null}]}\n\n',
    'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
    'data: [DONE]\n\n',
  ];
  const body = new ReadableStream<Uint8Array>({
    start(controller) { for (const chunk of chunks) controller.enqueue(encoder.encode(chunk)); controller.close(); },
  });
  const deltas: string[] = [];
  const result = await readChatCompletionsStream(body, (delta) => deltas.push(delta));
  equal(deltas.join(""), "Checking now", "Gemini streamed text");
  equal(result.status, "completed", "Gemini terminal status");
  equal(responseOutputText(result), "Checking now", "Gemini final text");
  equal(result.output.filter((item: any) => item.type === "function_call").length, 1, "tool call count");
  equal(result.output.find((item: any) => item.type === "function_call").name, "get_people_intelligence", "tool name");
});

Deno.test("Gemini request adapter preserves instructions, tool outputs and function schemas", () => {
  const messages = responsesInputToChatMessages([
    { role: "user", content: "Check staff" },
    { type: "function_call", call_id: "call_1", name: "get_people_intelligence", arguments: "{}" },
    { type: "function_call_output", call_id: "call_1", output: JSON.stringify({ ok: true }) },
  ], "You are JD");
  equal(messages[0].role, "system", "system instructions");
  equal(messages[1].role, "user", "user message");
  equal(messages[2].tool_calls[0].id, "call_1", "assistant tool call id");
  equal(messages[3].tool_call_id, "call_1", "tool output correlation");
  const tools = responsesToolsToChatTools([{ type: "function", name: "lookup", description: "Read data", parameters: { type: "object", properties: {} }, strict: true }]);
  equal(tools[0].function.name, "lookup", "converted tool schema");
});

Deno.test("Gemini stream rejects missing terminal completion marker", async () => {
  const body = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"partial"},"finish_reason":null}]}\n')); controller.close(); },
  });
  let failed = false;
  try { await readChatCompletionsStream(body); } catch { failed = true; }
  equal(failed, true, "incomplete Gemini stream rejected");
});

Deno.test("Gemini adapter groups parallel function calls into one assistant message", () => {
  const messages = responsesInputToChatMessages([
    { role: "user", content: "Check staff and operations" },
    { type: "message", role: "assistant", content: [{ type: "output_text", text: "Checking both now." }] },
    { type: "function_call", call_id: "call_people", name: "get_people_intelligence", arguments: "{}" },
    { type: "function_call", call_id: "call_ops", name: "get_operations_intelligence", arguments: "{}" },
    { type: "function_call_output", call_id: "call_people", output: '{"ok":true}' },
    { type: "function_call_output", call_id: "call_ops", output: '{"ok":true}' },
  ]);
  equal(messages[1].role, "assistant", "parallel assistant role");
  equal(messages[1].content, "Checking both now.", "assistant text retained with calls");
  equal(messages[1].tool_calls.length, 2, "parallel tool calls grouped");
  equal(messages[2].tool_call_id, "call_people", "first parallel result correlation");
  equal(messages[3].tool_call_id, "call_ops", "second parallel result correlation");
});

Deno.test("Gemini adapter rejects malformed or uncorrelated tool history", () => {
  let invalidArguments = false;
  try { responsesInputToChatMessages([{ type: "function_call", call_id: "c1", name: "lookup", arguments: "[]" }]); } catch { invalidArguments = true; }
  equal(invalidArguments, true, "array arguments rejected");
  let missingCallId = false;
  try { responsesInputToChatMessages([{ type: "function_call_output", output: "{}" }]); } catch { missingCallId = true; }
  equal(missingCallId, true, "missing call ID rejected");
});

Deno.test("Gemini stream rejects malformed tool-call arguments", async () => {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_bad","function":{"name":"lookup","arguments":"not-json"}}]},"finish_reason":null}]}\n' +
        'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n'
      ));
      controller.close();
    },
  });
  let failed = false;
  try { await readChatCompletionsStream(body); } catch { failed = true; }
  equal(failed, true, "malformed function arguments rejected");
});
