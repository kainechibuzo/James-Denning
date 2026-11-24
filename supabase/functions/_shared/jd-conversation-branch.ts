// Conversation branch copy: builds the jd_messages rows for a branched
// conversation. Copied rows must be inert — request-idempotency keys
// (jd_messages_client_request unique index on school_id+sender_id+client id),
// interaction answers and job/run bookkeeping belong to the source
// conversation only. Replaying a user message that still carries its
// client_request_id collides with that unique index whenever the actor
// branches a conversation they authored, which made every self-branch fail
// with a 500. Stripping these keys keeps the copied history readable while
// making each row branch-local.
export const BRANCH_METADATA_STRIP_KEYS = [
  "job_id",
  "run_id",
  "status",
  "job_status",
  "job",
  "streaming",
  "retrying",
  "error_code",
  "client_request_id",
  "interaction",
] as const;

export function buildConversationBranchMessages(input: {
  schoolId: string;
  branchConversationId: string;
  actorId: string;
  sourceConversationId: string;
  messages: Array<{ role?: unknown; content?: unknown; content_json?: unknown } | null | undefined>;
}): Array<Record<string, unknown>> {
  return (Array.isArray(input.messages) ? input.messages : [])
    .filter((item): item is { role: unknown; content: unknown; content_json?: unknown } =>
      Boolean(item) && (item!.role === "user" || item!.role === "assistant"))
    .map((item) => {
      const source = item.content_json;
      const meta: Record<string, unknown> = source && typeof source === "object" && !Array.isArray(source)
        ? { ...(source as Record<string, unknown>) }
        : {};
      for (const key of BRANCH_METADATA_STRIP_KEYS) delete meta[key];
      return {
        school_id: input.schoolId,
        conversation_id: input.branchConversationId,
        sender_id: item.role === "user" ? input.actorId : null,
        role: item.role,
        content: String(item.content || "").slice(0, 12000),
        content_json: { ...meta, branched_from: input.sourceConversationId },
        created_by_agent: item.role === "assistant",
      };
    });
}
