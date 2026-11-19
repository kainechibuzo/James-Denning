export type TextDeltaHandler = (delta: string) => void;

export class NonRetryableAgentResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NonRetryableAgentResponseError";
  }
}

const malformedAgentResponse = (message: string) => new NonRetryableAgentResponseError(message);

export function responseOutputText(response: any): string {
  if (typeof response?.output_text === "string" && response.output_text.trim()) return response.output_text.trim();
  const output = Array.isArray(response?.output) ? response.output : [];
  return output
    .filter((item: any) => item?.type === "message" && Array.isArray(item.content))
    .flatMap((item: any) => item.content)
    .filter((part: any) => part?.type === "output_text" || part?.type === "text")
    .map((part: any) => typeof part.text === "string" ? part.text : "")
    .join("\n")
    .trim();
}

export function shouldContinueResponse(response: any, continuationCount: number, maxContinuations = 2): boolean {
  return response?.status === "incomplete" &&
    response?.incomplete_details?.reason === "max_output_tokens" &&
    continuationCount < maxContinuations;
}

/** Consume OpenRouter Responses API SSE, exposing only user-visible text deltas. */
export async function readResponsesStream(
  body: ReadableStream<Uint8Array>,
  onTextDelta?: TextDeltaHandler,
): Promise<any> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResponse: any = null;
  let streamError: Error | null = null;

  const consumeLine = (raw: string) => {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    if (!line.startsWith("data:")) return;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") return;
    let event: any;
    try { event = JSON.parse(payload); } catch { return; }
    if (event?.type === "response.output_text.delta" && typeof event.delta === "string") {
      if (event.delta) onTextDelta?.(event.delta);
      return;
    }
    if (event?.type === "response.completed" || event?.type === "response.incomplete") {
      finalResponse = event.response || null;
      return;
    }
    if (event?.type === "response.failed" || event?.type === "error") {
      streamError = new Error("Model provider reported a streamed response error");
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = -1;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        consumeLine(line);
        if (streamError) throw streamError;
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) consumeLine(buffer);
    if (streamError) throw streamError;
    if (!finalResponse) throw new Error("Model stream ended without a terminal response event");
    return finalResponse;
  } finally {
    reader.releaseLock();
  }
}


export function responsesInputToChatMessages(input: unknown, instructions?: string): any[] {
  const messages: any[] = [];
  if (typeof instructions === "string" && instructions.trim()) messages.push({ role: "system", content: instructions });
  let pendingAssistantText = "";
  let pendingToolCalls: any[] = [];
  const flushAssistant = () => {
    if (!pendingAssistantText && !pendingToolCalls.length) return;
    messages.push({
      role: "assistant",
      content: pendingAssistantText || null,
      ...(pendingToolCalls.length ? { tool_calls: pendingToolCalls } : {}),
    });
    pendingAssistantText = "";
    pendingToolCalls = [];
  };
  for (const item of Array.isArray(input) ? input : []) {
    if (!item || typeof item !== "object") continue;
    const value = item as any;
    if (value.type === "function_call") {
      const id = String(value.call_id || value.id || "");
      const name = String(value.name || "");
      const args = String(value.arguments || "{}");
      if (!id || !name) throw new Error("Gemini tool-call history is missing its call ID or function name");
      let parsed: unknown;
      try { parsed = JSON.parse(args); } catch { throw malformedAgentResponse("Gemini tool-call history contains invalid arguments"); }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw malformedAgentResponse("Gemini tool-call arguments must be a JSON object");
      pendingToolCalls.push({ id, type: "function", function: { name, arguments: args } });
      continue;
    }
    if (value.type === "message" && value.role === "assistant") {
      const text = Array.isArray(value.content)
        ? value.content.map((part: any) => typeof part?.text === "string" ? part.text : "").join("")
        : "";
      pendingAssistantText += text;
      continue;
    }
    if (value.role === "assistant") {
      pendingAssistantText += typeof value.content === "string" ? value.content : JSON.stringify(value.content ?? "");
      continue;
    }
    flushAssistant();
    if (value.type === "function_call_output") {
      const callId = String(value.call_id || "");
      if (!callId) throw new Error("Gemini tool output is missing its call ID");
      messages.push({ role: "tool", tool_call_id: callId, content: typeof value.output === "string" ? value.output : JSON.stringify(value.output ?? "") });
      continue;
    }
    if (value.role === "user" || value.role === "system") {
      const content = typeof value.content === "string" ? value.content : JSON.stringify(value.content ?? "");
      messages.push({ role: value.role, content });
    }
  }
  flushAssistant();
  return messages;
}

export function responsesToolsToChatTools(tools: unknown): any[] {
  return (Array.isArray(tools) ? tools : []).filter((tool: any) => tool?.type === "function").map((tool: any) => ({
    type: "function",
    function: {
      name: String(tool.name || ""),
      description: String(tool.description || ""),
      parameters: tool.parameters && typeof tool.parameters === "object" ? tool.parameters : { type: "object", properties: {} },
    },
  }));
}

/** Read Google Gemini's OpenAI-compatible Chat Completions SSE and normalise it to the Responses shape JD already consumes. */
export async function readChatCompletionsStream(body: ReadableStream<Uint8Array>, onTextDelta?: TextDeltaHandler): Promise<any> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let finishReason: string | null = null;
  let responseId: string | null = null;
  let model: string | null = null;
  const toolCalls = new Map<number, any>();
  const toolCallIds = new Map<string, number>();
  let nextToolIndex = 0;
  let usage: any = undefined;
  const consumeLine = (raw: string) => {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    if (!line.startsWith("data:")) return;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") return;
    let chunk: any;
    try { chunk = JSON.parse(payload); } catch { throw malformedAgentResponse("Gemini returned a malformed streaming event"); }
    if (chunk.error) throw malformedAgentResponse("Gemini streamed response failed");
    responseId ||= chunk.id || null;
    model ||= chunk.model || null;
    if (chunk.usage) usage = chunk.usage;
    const choice = chunk.choices?.[0];
    if (!choice) return;
    if (choice.finish_reason) finishReason = choice.finish_reason;
    const delta = choice.delta || {};
    if (typeof delta.content === "string" && delta.content) {
      content += delta.content;
      onTextDelta?.(delta.content);
    }
    for (const part of delta.tool_calls || []) {
      const rawIndex = part?.index;
      let index: number | null = null;
      if ((typeof rawIndex === "number" || (typeof rawIndex === "string" && rawIndex.trim() !== ""))) {
        const parsedIndex = Number(rawIndex);
        if (Number.isInteger(parsedIndex) && parsedIndex >= 0) index = parsedIndex;
      }
      const callId = typeof part?.id === "string" && part.id.trim() ? part.id.trim() : "";
      if (index === null && callId) {
        const knownIndex = toolCallIds.get(callId);
        if (knownIndex !== undefined) index = knownIndex;
        else {
          while (toolCalls.has(nextToolIndex)) nextToolIndex += 1;
          index = nextToolIndex++;
        }
      }
      if (index === null) {
        if (toolCalls.size === 0) {
          while (toolCalls.has(nextToolIndex)) nextToolIndex += 1;
          index = nextToolIndex++;
        } else {
          throw malformedAgentResponse("Gemini returned a tool-call fragment without an index or call ID; the fragment cannot be correlated safely");
        }
      }
      if (callId) {
        const knownIndex = toolCallIds.get(callId);
        if (knownIndex !== undefined && knownIndex !== index) {
          throw malformedAgentResponse("Gemini returned conflicting tool-call IDs and indexes");
        }
        toolCallIds.set(callId, index);
      }
      const current = toolCalls.get(index) || { id: "", type: "function", function: { name: "", arguments: "" } };
      if (callId && current.id && current.id !== callId) {
        throw malformedAgentResponse("Gemini reused a tool-call index for different call IDs");
      }
      if (callId) current.id = callId;
      if (part.function?.name) current.function.name += part.function.name;
      if (part.function?.arguments) current.function.arguments += part.function.arguments;
      toolCalls.set(index, current);
    }
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        consumeLine(line);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) consumeLine(buffer);
    if (!finishReason) throw malformedAgentResponse("Gemini stream ended without a terminal completion marker");
    if (!["stop", "tool_calls", "length"].includes(finishReason)) throw malformedAgentResponse("Gemini ended with an unsupported finish reason");
    const calls = [...toolCalls.entries()].sort(([a], [b]) => a - b).map(([, call]) => {
      if (finishReason === "length") return call;
      if (!call.id || !call.function.name || !call.function.arguments) throw malformedAgentResponse("Gemini returned an incomplete tool call");
      let args: unknown;
      try { args = JSON.parse(call.function.arguments); } catch { throw malformedAgentResponse("Gemini returned invalid tool-call arguments"); }
      if (!args || typeof args !== "object" || Array.isArray(args)) throw malformedAgentResponse("Gemini tool-call arguments must be a JSON object");
      return call;
    });
    if (!content && !calls.length && finishReason !== "length") throw malformedAgentResponse("Gemini stream ended without a readable response or tool call");
    if (finishReason === "tool_calls" && !calls.length) throw malformedAgentResponse("Gemini reported tool calls but returned none");
    const output: any[] = [];
    if (content) output.push({ type: "message", role: "assistant", content: [{ type: "output_text", text: content }] });
    for (const call of calls) output.push({
      type: "function_call",
      call_id: call.id,
      name: call.function.name,
      arguments: call.function.arguments,
    });
    const status = finishReason === "length" ? "incomplete" : "completed";
    return {
      id: responseId,
      model,
      status,
      ...(status === "incomplete" ? { incomplete_details: { reason: "max_output_tokens" } } : {}),
      output,
      output_text: content,
      usage: usage ? {
        input_tokens: usage.prompt_tokens || 0,
        output_tokens: usage.completion_tokens || 0,
        total_tokens: usage.total_tokens || 0,
      } : undefined,
    };
  } finally {
    reader.releaseLock();
  }
}
