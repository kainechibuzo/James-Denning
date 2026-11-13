export type TextDeltaHandler = (delta: string) => void;

export function responseOutputText(response: any): string {
  if (typeof response?.output_text === "string" && response.output_text.trim()) return response.output_text.trim();
  const output = Array.isArray(response?.output) ? response.output : [];
  return output
    .filter((item: any) => item?.type === "message" && Array.isArray(item.content))
    .flatMap((item: any) => item.content)
    .filter((part: any) => part?.type === "output_text" || part?.type === "text")
    .map((part: any) => typeof part.text === "string" ? part.text : "")
    .join("\\n")
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
    const line = raw.endsWith("\\r") ? raw.slice(0, -1) : raw;
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
    if (event?.type === "response.failed") {
      streamError = new Error("Model provider reported a failed streamed response");
      return;
    }
    if (event?.type === "error") {
      streamError = new Error("Model provider reported a streamed error");
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = -1;
      while ((newline = buffer.indexOf("\\n")) !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        consumeLine(line);
        if (streamError) throw streamError;
      }
    }
    if (buffer.trim()) consumeLine(buffer);
    if (streamError) throw streamError;
    if (!finalResponse) throw new Error("Model stream ended without a terminal response event");
    return finalResponse;
  } finally {
    reader.releaseLock();
  }
}
