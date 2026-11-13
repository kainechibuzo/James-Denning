import { readResponsesStream, responseOutputText, shouldContinueResponse } from "./jd-agent-stream.ts";

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
