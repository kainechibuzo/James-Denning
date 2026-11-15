import { createClient } from "npm:@supabase/supabase-js@2";
import { runAgent } from "../_shared/jd-agent-runtime.ts";
import { buildJdVisualWorkspace } from "../_shared/jd-visual-workspace.ts";
import { selectJdModel } from "../_shared/jd-agent-routing.ts";
import { getJdSecret } from "../_shared/jd-secrets.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

import { isQueueMessage, retryDelaySeconds, safeWorkerId, type QueueMessage } from "../_shared/jd-execution-worker-helpers.ts";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

const LEASE_SECONDS = 90;
const HEARTBEAT_INTERVAL_MS = 25_000;
const QUEUE_VISIBILITY_SECONDS = 120;
const MAX_ERROR_LENGTH = 240;
const MAX_JOBS_PER_INVOCATION = 4;
const MAX_INVOCATION_WORK_MS = 105_000;
const MAX_DISPATCH_HANDOFF_DEPTH = 8;

function secretMatches(provided: string, expected: string): boolean {
  if (!provided || !expected || provided.length !== expected.length) return false;
  let difference = 0;
  for (let i = 0; i < expected.length; i += 1) {
    difference |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return difference === 0;
}

async function processMessage(admin: any, message: QueueMessage, workerId: string) {
  const jobId = message.message.job_id!;
  const { data: claim, error: claimError } = await admin.rpc("jd_claim_execution_job", {
    p_job_id: jobId,
    p_queue_message_id: message.message_id,
    p_worker_id: workerId,
    p_lease_seconds: LEASE_SECONDS,
  });
  if (claimError) throw new Error("Could not claim queued execution job");
  if (!claim?.claimed) {
    // A message can be redelivered after its job became terminal. The RPC
    // acknowledges only when this exact delivery belongs to a terminal job.
    await admin.rpc("jd_ack_execution_message", {
      p_job_id: jobId,
      p_queue_message_id: message.message_id,
    });
    return { job_id: jobId, status: "not_claimed" };
  }

  const leaseToken = String(claim.lease_token || "");
  const runId = String(claim.run_id || "");
  const schoolId = String(claim.school_id || "");
  const requestedBy = String(claim.requested_by || "");
  if (!leaseToken || !runId || !schoolId || !requestedBy) {
    throw new Error("Claim response was incomplete");
  }

  let leaseLost = false;
  let heartbeatBusy = false;
  let streamMessageId: string | null = null;
  let streamConversationId: string | null = null;
  let partialText = "";
  let lastPartialWriteAt = 0;
  let partialWriteChain: Promise<void> = Promise.resolve();
  const persistPartial = (force = false) => {
    if (!partialText || !streamConversationId) return;
    const now = Date.now();
    if (!force && now - lastPartialWriteAt < 800) return;
    lastPartialWriteAt = now;
    const snapshot = partialText;
    partialWriteChain = partialWriteChain.then(async () => {
      if (!streamMessageId) {
        const { data: existing, error: lookupError } = await admin.from("jd_messages").select("id")
          .eq("school_id", schoolId).eq("conversation_id", streamConversationId)
          .contains("content_json", { job_id: jobId }).limit(1).maybeSingle();
        if (lookupError) throw lookupError;
        if (existing?.id) streamMessageId = String(existing.id);
        else {
          const { data: created, error } = await admin.from("jd_messages").insert({ school_id: schoolId, conversation_id: streamConversationId, role: "assistant", content: snapshot, content_json: { job_id: jobId, streaming: true, stream_protocol: "responses_sse" }, created_by_agent: true }).select("id").single();
          if (error || !created) throw error || new Error("Could not create streamed assistant message");
          streamMessageId = String(created.id);
          return;
        }
      }
      const { error } = await admin.from("jd_messages").update({ content: snapshot, content_json: { job_id: jobId, streaming: true, stream_protocol: "responses_sse", updated_at: new Date().toISOString() } }).eq("id", streamMessageId).eq("school_id", schoolId);
      if (error) throw error;
    }).catch((error) => { console.error("JD partial response persistence failed", String(error).slice(0, 160)); });
  };
  const heartbeat = setInterval(async () => {
    if (heartbeatBusy || leaseLost) return;
    heartbeatBusy = true;
    try {
      const { data, error } = await admin.rpc("jd_heartbeat_execution_job", {
        p_job_id: jobId,
        p_lease_token: leaseToken,
        p_lease_seconds: LEASE_SECONDS,
      });
      if (error || data !== true) leaseLost = true;
    } catch {
      leaseLost = true;
    } finally {
      heartbeatBusy = false;
    }
  }, HEARTBEAT_INTERVAL_MS);

  try {
    const [{ data: run, error: runError }, { data: profile, error: profileError }] = await Promise.all([
      admin.from("jd_automation_runs")
        .select("id,school_id,conversation_id,requested_by,request_text,status,created_at")
        .eq("id", runId).eq("school_id", schoolId).maybeSingle(),
      admin.from("profiles")
        .select("id,school_id,role")
        .eq("id", requestedBy).eq("school_id", schoolId).maybeSingle(),
    ]);
    if (runError || !run || run.requested_by !== requestedBy || run.school_id !== schoolId) {
      throw new Error("Queued run could not be verified against its tenant and requester");
    }
    if (profileError || !profile) throw new Error("Run requester workspace profile could not be verified");
    if (!run.conversation_id || typeof run.request_text !== "string" || !run.request_text.trim()) {
      throw new Error("Queued run is missing its conversation or request");
    }
    streamConversationId = String(run.conversation_id);
    if (run.status === "awaiting_approval" || run.status === "cancelled") {
      const { data: finished } = await admin.rpc("jd_finish_execution_job", {
        p_job_id: jobId, p_lease_token: leaseToken, p_terminal_status: "cancelled",
      });
      if (finished) await admin.rpc("jd_ack_execution_message", { p_job_id: jobId, p_queue_message_id: message.message_id });
      return { job_id: jobId, status: "cancelled" };
    }

    const { data: rows, error: historyError } = await admin.from("jd_messages")
      .select("role,content,created_at")
      .eq("school_id", schoolId).eq("conversation_id", run.conversation_id)
      .order("created_at", { ascending: true }).limit(100);
    if (historyError) throw new Error("Conversation history could not be loaded");

    const historyRows = rows || [];
    let currentMessageIndex = -1;
    for (let i = historyRows.length - 1; i >= 0; i -= 1) {
      if (historyRows[i].role === "user" && historyRows[i].content === run.request_text) {
        currentMessageIndex = i;
        break;
      }
    }
    const history = (currentMessageIndex >= 0 ? historyRows.slice(0, currentMessageIndex) : historyRows)
      .slice(-20)
      .filter((item: any) => item.role === "assistant" || item.role === "user")
      .map((item: any) => ({ role: item.role, content: String(item.content || "").slice(0, 12000) }));

    const apiKey = Deno.env.get("OPENROUTER_API_KEY");
    // Default to OpenRouter's free-only router, which selects an available
    // free model compatible with the request's tool-calling requirements.
    const configuredModel = Deno.env.get("JD_MODEL_NAME") || "openrouter/free";
    const model = selectJdModel(run.request_text, configuredModel, { fast: Deno.env.get("JD_MODEL_FAST_NAME"), reasoning: Deno.env.get("JD_MODEL_REASONING_NAME") });
    if (!apiKey) throw new Error("OpenRouter API key is not configured");

    const { data: checkpointRow, error: checkpointReadError } = await admin
      .from("jd_execution_checkpoints")
      .select("runtime_state_json,state_version")
      .eq("job_id", jobId).eq("school_id", schoolId).maybeSingle();
    if (checkpointReadError) throw new Error("Could not load the saved runtime checkpoint");
    const resumeState = checkpointRow?.state_version === 1
      ? checkpointRow.runtime_state_json
      : null;

    const { data: lastStep, error: stepLookupError } = await admin.from("jd_automation_steps")
      .select("step_index").eq("school_id", schoolId).eq("run_id", runId)
      .order("step_index", { ascending: false }).limit(1).maybeSingle();
    if (stepLookupError) throw new Error("Could not inspect existing execution steps");
    let stepIndex = Number(lastStep?.step_index ?? 0);
    const stepIds = new Map<string, string>();
    const events: Record<string, unknown>[] = [];

    const result = await runAgent({
      message: run.request_text,
      history,
      context: { admin, schoolId, userId: requestedBy, role: String(profile.role || "member"), conversationId: run.conversation_id || undefined, runId },
      apiKey,
      model,
      baseUrl: Deno.env.get("JD_MODEL_BASE_URL") || "https://openrouter.ai/api/v1",
      resumeState,
      onCheckpoint: async (state) => {
        if (leaseLost) throw new Error("Execution lease was lost");
        const { data, error } = await admin.rpc("jd_save_execution_checkpoint", {
          p_job_id: jobId,
          p_lease_token: leaseToken,
          p_runtime_state_json: state,
        });
        if (error || data !== true) {
          leaseLost = true;
          throw new Error("Runtime checkpoint could not be saved under the current lease");
        }
      },
      onTextDelta: (delta) => { partialText += delta; persistPartial(false); },
      onToolEvent: async (event) => {
        if (leaseLost) throw new Error("Execution lease was lost");
        events.push(event);
        const callId = String(event.callId || "");
        if (event.status === "started") {
          const { data, error } = await admin.from("jd_automation_steps").insert({
            school_id: schoolId, run_id: runId, step_index: ++stepIndex,
            tool_key: String(event.name || "unknown"),
            risk_level: String(event.risk || "low"), status: "running",
            input_json: { call_id: callId }, started_at: new Date().toISOString(), created_by_agent: true,
          }).select("id").single();
          if (error || !data) throw new Error("Could not persist execution step");
          if (callId) stepIds.set(callId, data.id);
          return;
        }

        const stepId = stepIds.get(callId);
        if (stepId) {
          const { data, error } = await admin.from("jd_automation_steps").update({
            status: event.status === "completed" ? "completed" : "failed",
            output_json: { event: event.status, evidence: event.evidence && typeof event.evidence === "object" ? event.evidence : null },
            error_message: event.status === "failed" ? "Read-only tool execution failed" : null,
            completed_at: new Date().toISOString(),
          }).eq("id", stepId).eq("school_id", schoolId).eq("run_id", runId)
            .select("id").maybeSingle();
          if (error || !data) throw new Error("Could not persist execution step result");
        }
        if (event.status === "completed") {
          const { data, error } = await admin.rpc("jd_checkpoint_execution_job", {
            p_job_id: jobId, p_lease_token: leaseToken, p_step_index: stepIndex,
          });
          if (error || data !== true) {
            leaseLost = true;
            throw new Error("Execution checkpoint was rejected because the lease is no longer valid");
          }
        }
      },
    });

    persistPartial(true);
    await partialWriteChain;
    if (leaseLost) throw new Error("Execution lease was lost before completion");
    const finalStatus = result.status === "partially_completed" ? "partially_completed" : "completed";
    // Visual workspace is derived from persisted tenant-scoped records only.
    const canViewOperationalTasks = ["owner", "admin", "manager"].includes(String(profile.role || ""));
    const visualTasksQuery = canViewOperationalTasks
      ? admin.from("jd_operational_tasks").select("id,title,description,department,priority,status,due_at,updated_at,metadata", { count: "exact" }).eq("school_id", schoolId).order("updated_at", { ascending: false }).limit(5000)
      : Promise.resolve({ data: [] as any[], error: null, count: 0 });
    const visualBlueprintQuery = canViewOperationalTasks
      ? admin.from("jd_organisation_blueprints").select("blueprint_json,status,updated_at").eq("school_id", schoolId).in("status", ["approved", "provisioned"]).order("updated_at", { ascending: false }).limit(1).maybeSingle()
      : Promise.resolve({ data: null, error: null });
    const [{ data: visualTasks, error: visualTasksError, count: visualTasksCount }, { data: visualBlueprint, error: visualBlueprintError }, { data: visualAudit, error: visualAuditError }, { data: visualSteps, error: visualStepsError }] = await Promise.all([
      visualTasksQuery,
      visualBlueprintQuery,
      admin.from("jd_audit_events").select("id,event_type,created_at,event_json").eq("school_id", schoolId).eq("actor_id", requestedBy).order("created_at", { ascending: false }).limit(20),
      admin.from("jd_automation_steps").select("id,tool_key,status,error_message,output_json,started_at,completed_at").eq("school_id", schoolId).eq("run_id", runId).order("step_index", { ascending: true }).limit(30),
    ]);
    const blueprintDepartments = Array.isArray(visualBlueprint?.blueprint_json?.departments)
      ? visualBlueprint.blueprint_json.departments.filter((item: any) => item && typeof item.name === "string").map((item: any) => ({ name: item.name, purpose: typeof item.purpose === "string" ? item.purpose : null }))
      : [];
    const visualWorkspace = buildJdVisualWorkspace({
      tasks: canViewOperationalTasks ? (visualTasks || []) : [],
      tasksAvailable: canViewOperationalTasks && !visualTasksError,
      departments: blueprintDepartments,
      departmentDefinitionsAvailable: !visualBlueprintError && blueprintDepartments.length > 0,
      tasksTotal: visualTasksCount ?? (visualTasks || []).length,
      audit: visualAudit || [], steps: visualSteps || [],
      evidenceAvailable: !visualAuditError && !visualStepsError,
    });

    const { data: existingReply, error: replyLookupError } = await admin.from("jd_messages")
      .select("id").eq("school_id", schoolId).eq("conversation_id", run.conversation_id)
      .contains("content_json", { job_id: jobId }).limit(1).maybeSingle();
    if (replyLookupError) throw new Error("Could not verify whether the job response was already saved");
    const finalMessage = { content: result.text, content_json: { job_id: jobId, streaming: false, toolEvents: events.map((event: any) => ({ name: event.name, status: event.status })), tokenUsage: result.tokenUsage, truncated: result.truncated === true, visual_workspace: visualWorkspace } };
    if (existingReply?.id) {
      const { error: replyError } = await admin.from("jd_messages").update(finalMessage).eq("id", existingReply.id).eq("school_id", schoolId).eq("conversation_id", run.conversation_id);
      if (replyError) throw new Error("Agent response could not be finalised");
    } else {
      const { error: replyError } = await admin.from("jd_messages").insert({ school_id: schoolId, conversation_id: run.conversation_id, role: "assistant", ...finalMessage, created_by_agent: true });
      if (replyError) throw new Error("Agent response could not be saved");
    }

    const { data: runUpdated, error: runUpdateError } = await admin.from("jd_automation_runs").update({
      status: finalStatus,
      result_json: {
        toolEvents: events, responseId: result.responseId, tokenUsage: result.tokenUsage,
        modelRequests: result.modelRequests, model: result.model, provider: result.provider,
        truncated: result.truncated === true, execution_job_id: jobId,
      },
      completed_at: new Date().toISOString(),
    }).eq("id", runId).eq("school_id", schoolId).select("id").maybeSingle();
    if (runUpdateError || !runUpdated) throw new Error("Could not persist final automation run state");

    const { data: finished, error: finishError } = await admin.rpc("jd_finish_execution_job", {
      p_job_id: jobId, p_lease_token: leaseToken, p_terminal_status: finalStatus,
    });
    if (finishError || finished !== true) throw new Error("Execution lease expired before the job could be finalized");

    await admin.from("jd_audit_events").insert({
      school_id: schoolId, actor_id: requestedBy, run_id: runId,
      event_type: finalStatus === "completed" ? "automation.completed" : "automation.partially_completed",
      event_json: { job_id: jobId, tool_count: events.filter((event: any) => event.status === "completed").length },
    });
    const { data: acknowledged, error: ackError } = await admin.rpc("jd_ack_execution_message", {
      p_job_id: jobId, p_queue_message_id: message.message_id,
    });
    if (ackError || acknowledged !== true) throw new Error("Terminal job was saved but queue acknowledgement failed");
    await admin.from("jd_execution_checkpoints").delete().eq("job_id", jobId).eq("school_id", schoolId);
    return { job_id: jobId, status: finalStatus };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Execution failed";
    if (leaseLost) return { job_id: jobId, status: "lease_lost" };
    const { data: retryResult, error: retryError } = await admin.rpc("jd_retry_execution_job", {
      p_job_id: jobId,
      p_lease_token: leaseToken,
      p_queue_message_id: message.message_id,
      p_delay_seconds: retryDelaySeconds(Number(claim.attempt_count || 1)),
      p_error_code: "worker_execution_failed",
      p_safe_error_message: detail.slice(0, MAX_ERROR_LENGTH),
    });
    if (retryError) throw new Error("Execution failed and retry could not be scheduled");
    const { data: pendingMessage } = await admin.from("jd_messages").select("id")
      .eq("school_id", schoolId).contains("content_json", { job_id: jobId }).limit(1).maybeSingle();
    if (retryResult?.status === "failed") {
      const failureMessage = "JD could not complete this background task after the permitted attempts. The run is marked failed; review its execution history before retrying.";
      if (pendingMessage?.id) {
        await admin.from("jd_messages").update({ content: failureMessage, content_json: { job_id: jobId, status: "failed", streaming: false } })
          .eq("id", pendingMessage.id).eq("school_id", schoolId);
      } else {
        await admin.from("jd_messages").insert({ school_id: schoolId, conversation_id: streamConversationId, role: "assistant", content: failureMessage, content_json: { job_id: jobId, status: "failed", streaming: false }, created_by_agent: true });
      }
      await admin.rpc("jd_ack_execution_message", { p_job_id: jobId, p_queue_message_id: message.message_id });
      return { job_id: jobId, status: "failed" };
    }
    if (pendingMessage?.id) {
      await admin.from("jd_messages").update({ content_json: { job_id: jobId, streaming: false, retrying: true } })
        .eq("id", pendingMessage.id).eq("school_id", schoolId);
    }
    return { job_id: jobId, status: retryResult?.status || "retry_scheduled" };
  } finally {
    clearInterval(heartbeat);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const expectedSecret = getJdSecret("JD_WORKER_SECRET");
  const providedSecret = (req.headers.get("x-jd-worker-secret") || "").trim();
  if (!secretMatches(providedSecret, expectedSecret)) return json({ error: "Unauthorized" }, 401);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) return json({ error: "Worker is not configured" }, 503);

  let payload: Record<string, unknown> = {};
  try {
    const parsed = await req.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) payload = parsed;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const admin = createClient<any>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const workerId = safeWorkerId(Deno.env.get("JD_WORKER_ID"));
  const startedAt = Date.now();
  const outcomes: Record<string, unknown>[] = [];

  // Repair old deliveries before reading. Recovery is lease-fenced in SQL:
  // an expired worker loses its token before a replacement message is issued.
  const { data: recovery, error: recoveryError } = await admin.rpc("jd_recover_stale_execution_jobs", {
    p_stale_after_seconds: 60,
    p_batch_size: 25,
  });
  if (recoveryError) return json({ error: "Could not recover stale execution jobs" }, 503);

  for (let index = 0; index < MAX_JOBS_PER_INVOCATION; index += 1) {
    if (Date.now() - startedAt >= MAX_INVOCATION_WORK_MS) break;

    const { data: messages, error } = await admin.rpc("jd_read_execution_messages", {
      p_visibility_seconds: QUEUE_VISIBILITY_SECONDS,
      p_batch_size: 1,
    });
    if (error) return json({ error: "Could not read the execution queue", outcomes, recovery }, 503);

    const candidate = Array.isArray(messages) ? messages[0] : null;
    if (!candidate) break;
    if (!isQueueMessage(candidate)) {
      outcomes.push({ status: "invalid_message" });
      continue;
    }

    try {
      outcomes.push(await processMessage(admin, candidate, workerId));
    } catch {
      // Do not leak provider, database, or tenant data into public responses.
      outcomes.push({ job_id: candidate.message.job_id, status: "worker_error" });
    }
  }

  const [{ count: pendingCount, error: pendingError }, { data: queueHealth }] = await Promise.all([
    admin.from("jd_execution_jobs").select("id", { count: "exact", head: true })
      .in("status", ["queued", "retry_wait"]).lte("available_at", new Date().toISOString()),
    admin.rpc("jd_execution_queue_health"),
  ]);
  if (pendingError) console.error("JD queue pending count could not be read");

  const dispatchDepth = Math.max(0, Math.min(
    MAX_DISPATCH_HANDOFF_DEPTH,
    Number.parseInt(String(req.headers.get("x-jd-dispatch-depth") || "0"), 10) || 0,
  ));
  const hasMore = Number(pendingCount || 0) > 0;
  let continuationDispatched = false;
  if (hasMore && dispatchDepth < MAX_DISPATCH_HANDOFF_DEPTH) {
    continuationDispatched = true;
    EdgeRuntime.waitUntil((async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      const response = await fetch(`${url.replace(/\/$/, "")}/functions/v1/jd-execution-worker`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-jd-worker-secret": expectedSecret,
          "x-jd-dispatch-depth": String(dispatchDepth + 1),
        },
        body: "{}",
      });
      if (!response.ok) console.error("JD continuation dispatch returned", response.status);
      await response.text();
    })().catch((error) => console.error("JD continuation dispatch failed", String(error).slice(0, 160))));
  }

  return json({
    worker_id: workerId,
    processed: outcomes.length,
    outcomes,
    recovery,
    queue: queueHealth || null,
    pending_count: Number(pendingCount || 0),
    continuation_dispatched: continuationDispatched,
    handoff_depth: dispatchDepth,
    elapsed_ms: Date.now() - startedAt,
    work_budget_ms: MAX_INVOCATION_WORK_MS,
  });
});
