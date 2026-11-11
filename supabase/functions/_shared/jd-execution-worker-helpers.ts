export type QueueMessage = {
  message_id: number;
  read_count: number;
  message: { job_id?: string; schema_version?: number };
};

export function isQueueMessage(value: unknown): value is QueueMessage {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  const message = item.message as Record<string, unknown> | undefined;
  return Number.isSafeInteger(item.message_id) && Number(item.message_id) > 0
    && !!message && typeof message.job_id === "string"
    && message.schema_version === 1;
}

export function safeWorkerId(value: string | undefined): string {
  const candidate = (value || "jd-edge-worker").trim();
  return candidate.replace(/[^a-zA-Z0-9._:-]/g, "-").slice(0, 120) || "jd-edge-worker";
}

export function retryDelaySeconds(attempt: number): number {
  return Math.min(300, Math.max(5, 5 * (2 ** Math.max(0, attempt - 1))));
}
