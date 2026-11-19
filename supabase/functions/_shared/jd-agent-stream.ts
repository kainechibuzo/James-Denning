export type TextDeltaHandler = (delta: string) => void;

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
  for (const item of Array.isArray(input) ? input : []) {
    if (!item || typeof item !== "object") continue;
    const value = item as any;
    if (value.type === "function_call_output") {
      messages.push({ role: "tool", tool_call_id: String(value.call_id || ""), content: String(value.output || "") });
      continue;
    }
    if (value.type === "function_call") {
      messages.push({ role: "assistant", content: null, tool_calls: [{
        id: String(value.call_id || value.id || crypto.randomUUID()),
        type: "function",
        function: { name: String(value.name || ""), arguments: String(value.arguments || "{}") },
      }] });
      continue;
    }
    if (value.type === "message" && value.role === "assistant") {
      const text = Array.isArray(value.content)
        ? value.content.map((part: any) => typeof part?.text === "string" ? part.text : "").join("")
        : "";
      messages.push({ role: "assistant", content: text });
      continue;
    }
    if (value.role === "assistant" || value.role === "user" || value.role === "system") {
      messages.push({ role: value.role, content: typeof value.content === "string" ? value.content : JSON.stringify(value.content ?? "") });
    }
  }
  return messages;
}

export function responsesToolsToChatTools(tools: unknown): any[] {
  return (Array.isArray(tools) ? tools : []).filter((tool: any) => tool?.type === "function").map((tool: any) => ({
    type: "function",
    function: {
      name: String(tool.name || ""),
      description: String(tool.description || ""),
      parameters: tool.parameters && typeof tool.parameters === "object" ? tool.parameters : { type: "object", properties: {} },
      ...(tool.strict === true ? { strict: true } : {}),
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
  let usage: any = undefined;
  const consumeLine = (raw: string) => {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    if (!line.startsWith("data:")) return;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") return;
    let chunk: any;
    try { chunk = JSON.parse(payload); } catch { return; }
    if (chunk.error) throw new Error("Gemini streamed response failed");
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
      const index = Number(part.index || 0);
      const current = toolCalls.get(index) || { id: "", type: "function", function: { name: "", arguments: "" } };
      if (part.id) current.id = part.id;
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
    const calls = [...toolCalls.values()];
    if (!finishReason) throw new Error("Gemini stream ended without a terminal completion marker");
    if (!content && !calls.length) throw new Error("Gemini stream ended without a readable response or tool call");
    const output: any[] = [];
    if (content) output.push({ type: "message", role: "assistant", content: [{ type: "output_text", text: content }] });
    for (const call of calls) output.push({
      type: "function_call",
      call_id: call.id,
      name: call.function.name,
      arguments: call.function.arguments || "{}",
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
