import { runAgent } from "./jd-agent-runtime.ts";
import { readChatCompletionsStream, NonRetryableAgentResponseError } from "./jd-agent-stream.ts";

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) throw new Error(label + ": expected " + String(expected) + ", received " + String(actual));
}

function sseResponse(chunks: string[]) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

Deno.test("OpenRouter Gemini preserves provider tool metadata across a multi-round tool cycle", async () => {
  const originalFetch = globalThis.fetch;
  const requests: any[] = [];
  const urls: string[] = [];
  let requestNumber = 0;
  globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    urls.push(String(_input));
    requests.push(JSON.parse(String(init?.body || "{}")));
    requestNumber += 1;
    if (requestNumber === 1) {
      return sseResponse([
        'data: {"id":"gemini-cycle-1","model":"gemini-3.1-flash-lite","choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_people","type":"function","extra_content":{"google":{"thought_signature":"opaque-test-signature"}},"function":{"name":"get_people_intelligence","arguments":"{}"}},{"index":1,"id":"call_ops","type":"function","function":{"name":"get_operations_intelligence","arguments":"{}"}}]},"finish_reason":null}]}\n',
        'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n',
        'data: {"choices":[],"usage":{"prompt_tokens":40,"completion_tokens":12,"total_tokens":52}}\n',
        "data: [DONE]\n",
      ]);
    }
    return sseResponse([
      'data: {"id":"gemini-cycle-2","model":"gemini-3.1-flash-lite","choices":[{"delta":{"content":"There are 2 members and 1 open task."},"finish_reason":null}]}\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n',
      "data: [DONE]\n",
    ]);
  };

  const admin = {
    from(table: string) {
      const query: any = {
        select() { return this; },
        eq() { return this; },
        order() { return this; },
        limit() {
          if (table === "jd_business_memory") return Promise.resolve({ data: [], error: null });
          if (table === "profiles") return Promise.resolve({ data: [{ role: "owner" }, { role: "manager" }], count: 2, error: null });
          if (table === "jd_operational_tasks") return Promise.resolve({ data: [{ status: "queued", priority: "high" }, { status: "completed", priority: "normal" }], error: null });
          throw new Error("Unexpected table: " + table);
        },
      };
      return query;
    },
  };

  const events: any[] = [];
  const checkpoints: any[] = [];
  try {
    const result = await runAgent({
      message: "Summarise our people and operational tasks.",
      history: [],
      context: { admin, schoolId: "school-test", userId: "user-test", role: "owner" },
      apiKey: "test-key",
      model: "gemini-3.1-flash-lite",
      baseUrl: "https://openrouter.ai/api/v1",
      onToolEvent: async (event) => { events.push(event); },
      onCheckpoint: async (state) => { checkpoints.push(structuredClone(state)); },
    });

    assertEqual(result.status, "completed", "run completion");
    assertEqual(result.provider, "google", "provider identity");
    assertEqual(requests.length, 2, "Gemini request rounds");
    assertEqual(urls[0], "https://openrouter.ai/api/v1/chat/completions", "OpenRouter Gemini uses chat completions");
    const secondMessages = requests[1].messages;
    const assistantToolMessage = secondMessages.find((message: any) => message.role === "assistant" && Array.isArray(message.tool_calls));
    assertEqual(assistantToolMessage.tool_calls.length, 2, "parallel tool call count");
    assertEqual(assistantToolMessage.tool_calls[0].extra_content.google.thought_signature, "opaque-test-signature", "Gemini thought signature replayed verbatim");
    assertEqual(secondMessages.filter((message: any) => message.role === "tool").length, 2, "tool result count");
    assertEqual(secondMessages.find((message: any) => message.tool_call_id === "call_people").content.includes('"total_members":2'), true, "people result correlated");
    assertEqual(secondMessages.find((message: any) => message.tool_call_id === "call_ops").content.includes('"total":2'), true, "operations result correlated");
    assertEqual(events.filter((event) => event.status === "started").length, 2, "started events");
    assertEqual(events.filter((event) => event.status === "completed").length, 2, "completed events");
    assertEqual(checkpoints.length, 2, "pre-execution and post-execution checkpoints");
    assertEqual(checkpoints[0].conversationInput.some((item: any) => item.type === "function_call"), true, "tool call checkpointed before execution");
    assertEqual(checkpoints[1].conversationInput.filter((item: any) => item.type === "function_call_output").length, 2, "tool outputs checkpointed");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("Gemini stream correlates tool calls by stable ID when the provider omits indexes", async () => {
  const response = await readChatCompletionsStream(sseResponse([
    'data: {"choices":[{"delta":{"tool_calls":[{"id":"call_stable","type":"function","function":{"name":"lookup","arguments":"{"}}]},"finish_reason":null}]}\n',
    'data: {"choices":[{"delta":{"tool_calls":[{"id":"call_stable","function":{"arguments":"}"}}]},"finish_reason":null}]}\n',
    'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n',
    "data: [DONE]\n",
  ]).body!);
  assertEqual(response.output.length, 1, "one correlated function call");
  assertEqual(response.output[0].call_id, "call_stable", "stable call ID retained");
  assertEqual(response.output[0].arguments, "{}", "fragmented arguments combined");
});

Deno.test("Gemini stream rejects uncorrelatable tool fragments as non-retryable", async () => {
  let caught: unknown = null;
  try {
    await readChatCompletionsStream(sseResponse([
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_one","type":"function","function":{"name":"lookup","arguments":"{}"}},{"index":1,"id":"call_two","type":"function","function":{"name":"lookup_other","arguments":"{}"}}]},"finish_reason":null}]}\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"function":{"arguments":"{}"}}]},"finish_reason":null}]}\n',
      'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n',
      "data: [DONE]\n",
    ]).body!);
  } catch (error) {
    caught = error;
  }
  assertEqual(caught instanceof NonRetryableAgentResponseError, true, "malformed provider response is non-retryable");
});

Deno.test("Gemini stream rejects multiple unindexed calls in the same delta", async () => {
  let caught: unknown = null;
  try {
    await readChatCompletionsStream(sseResponse([
      'data: {"choices":[{"delta":{"tool_calls":[{"type":"function","function":{"name":"lookup","arguments":"{}"}},{"type":"function","function":{"name":"lookup_other","arguments":"{}"}}]},"finish_reason":null}]}\n',
      'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n',
      "data: [DONE]\n",
    ]).body!);
  } catch (error) {
    caught = error;
  }
  assertEqual(caught instanceof NonRetryableAgentResponseError, true, "parallel calls without correlation metadata are non-retryable");
});
