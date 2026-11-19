import { runWithShadowUsage } from "./_shared/jd-usage-observer.mjs";
import { NonRetryableAgentResponseError } from "../_shared/jd-agent-stream.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { runAgent } from "./_shared/jd-agent-runtime.ts";
import { buildJdVisualWorkspace } from "./_shared/jd-visual-workspace.ts";
import { getJdSecret } from "./_shared/jd-secrets.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

import { isQueueMessage, retryDelaySeconds, safeWorkerId, type QueueMessage } from "./_shared/jd-execution-worker-helpers.ts";

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

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    // Keep one predictable Gemini model across all tool rounds and retries.
    // Provider/model changes are code-controlled, not operator env overrides.
    const model = "gemini-3.1-flash-lite";
    if (!apiKey) throw new Error("Gemini API key is not configured");

    const { data: checkpointRow, error: checkpointReadError } = await admin
      .from("jd_execution_checkpoints")
      .select("runtime_state_json,state_version")
      .eq("job_id", jobId).eq("school_id", schoolId).maybeSingle();
    if (checkpointReadError) throw new Error("Could not load the saved runtime checkpoint");
    const { data: existingSteps, error: stepLookupError } = await admin.from("jd_automation_steps")
      .select("id,step_index,tool_key,status,input_json,output_json,error_message")
      .eq("school_id", schoolId).eq("run_id", runId)
      .order("step_index", { ascending: true }).limit(200);
    if (stepLookupError) throw new Error("Could not inspect existing execution steps");
    const stepRows = existingSteps || [];
    let stepIndex = stepRows.reduce((max: number, step: any) => Math.max(max, Number(step.step_index || 0)), 0);
    const stepIds = new Map<string, string>();
    const events: Record<string, unknown>[] = [];
    const recoveredState: any = checkpointRow?.state_version === 1 && checkpointRow.runtime_state_json
      ? structuredClone(checkpointRow.runtime_state_json)
      : { version: 1, conversationInput: [...history.map((item: any) => ({ role: item.role, content: item.content })), { role: "user", content: run.request_text }], completedCalls: [] };
    recoveredState.conversationInput = Array.isArray(recoveredState.conversationInput) ? recoveredState.conversationInput : [];
    recoveredState.completedCalls = Array.isArray(recoveredState.completedCalls) ? recoveredState.completedCalls : [];
    const recoveredCallIds = new Set<string>(recoveredState.completedCalls.map(String));
    const recoveredOutputIds = new Set<string>(
      recoveredState.conversationInput.filter((item: any) => item?.type === "function_call_output").map((item: any) => String(item.call_id || ""))
    );
    let recoveredIncomplete = false;
    const journalCallIds = new Set<string>(stepRows.map((step: any) => String((step.input_json as any)?.call_id || "")).filter(Boolean));
    // A checkpoint may exist for a model tool request even if the worker stopped
    // before it could persist the "started" journal row. That call is safe to
    // reconsider because tool execution had not begun.
    for (const pendingCall of recoveredState.conversationInput.filter((item: any) => item?.type === "function_call")) {
      const callId = String(pendingCall.call_id || pendingCall.id || "");
      if (!callId || recoveredOutputIds.has(callId) || journalCallIds.has(callId)) continue;
      recoveredState.conversationInput.push({
        type: "function_call_output",
        call_id: callId,
        output: JSON.stringify({ ok: false, outcome: "not_started", error: "The worker stopped before this action began. No action was executed; JD can reconsider it safely." }),
      });
      recoveredOutputIds.add(callId);
      recoveredState.completedCalls.push(callId);
      recoveredCallIds.add(callId);
    }
    for (const step of stepRows) {
      const callId = String((step.input_json as any)?.call_id || "");
      if (!callId || recoveredCallIds.has(callId)) continue;
      let output: string;
      if (step.status === "completed" && typeof (step.output_json as any)?.tool_output === "string") {
        output = String((step.output_json as any).tool_output).slice(0, 80000);
      } else if (step.status === "failed" && typeof (step.output_json as any)?.tool_output === "string") {
        output = String((step.output_json as any).tool_output).slice(0, 80000);
        recoveredIncomplete = true;
      } else {
        output = JSON.stringify({ ok: false, outcome: "unknown", error: "This action started before the worker stopped, but its result was not durably recorded. JD will not repeat it automatically. Check the connected service before retrying." });
        recoveredIncomplete = true;
        if (step.status === "running") {
          await admin.from("jd_automation_steps").update({
            status: "failed",
            error_message: "Worker stopped before the action result was durably recorded; outcome unknown and automatic retry blocked",
            output_json: { event: "outcome_unknown", verification: "recovery_blocked_duplicate" },
            completed_at: new Date().toISOString(),
          }).eq("id", step.id).eq("school_id", schoolId).eq("run_id", runId).eq("status", "running");
        }
      }
      if (!recoveredOutputIds.has(callId)) {
        recoveredState.conversationInput.push({ type: "function_call_output", call_id: callId, output });
        recoveredOutputIds.add(callId);
      }
      recoveredState.completedCalls.push(callId);
      recoveredCallIds.add(callId);
    }
    const resumeState = recoveredState;

    const result = await runWithShadowUsage({
      admin, jobId, schoolId, leaseToken,
      enabled: Deno.env.get("JD_USAGE_SHADOW_ENABLED") === "true",
      run: (onUsagePhase: ((phase: "active" | "external_wait") => Promise<void>) | undefined) => runAgent({
      onUsagePhase,
      message: run.request_text,
      history,
      context: { admin, schoolId, userId: requestedBy, role: String(profile.role || "member"), conversationId: run.conversation_id || undefined, runId },
      apiKey,
      model,
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
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
        const evidence = event.evidence && typeof event.evidence === "object" && !Array.isArray(event.evidence)
          ? event.evidence as Record<string, unknown>
          : null;
        const verifiedResult = event.status === "completed" && evidence?.result_nonempty === true && typeof evidence.result_keys === "string" && evidence.result_keys.length > 0;
        if (stepId) {
          const { data, error } = await admin.from("jd_automation_steps").update({
            status: verifiedResult ? "completed" : "failed",
            output_json: { event: event.status, evidence, tool_output: typeof event.toolOutput === "string" ? event.toolOutput.slice(0, 80000) : null, verification: verifiedResult ? "semantic_tool_result" : "missing_result_evidence" },
            error_message: verifiedResult ? null : String(event.error || (event.status === "outcome_unknown" ? "Action outcome could not be verified" : "Tool returned no verifiable result evidence")).slice(0, 240),
            completed_at: new Date().toISOString(),
          }).eq("id", stepId).eq("school_id", schoolId).eq("run_id", runId)
            .select("id").maybeSingle();
          if (error || !data) throw new Error("Could not persist execution step result");
        }
        if (verifiedResult) {
          const { data, error } = await admin.rpc("jd_checkpoint_execution_job", {
            p_job_id: jobId, p_lease_token: leaseToken, p_step_index: stepIndex,
          });
          if (error || data !== true) {
            leaseLost = true;
            throw new Error("Execution checkpoint was rejected because the lease is no longer valid");
          }
        }
      },
      }),
    });

    persistPartial(true);
    await partialWriteChain;
    if (leaseLost) throw new Error("Execution lease was lost before completion");
    const hadToolFailure = events.some((event: any) => event.status === "failed" || event.status === "outcome_unknown");
    const finalStatus = result.status === "partially_completed" || hadToolFailure || recoveredIncomplete ? "partially_completed" : "completed";
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
    if (error instanceof NonRetryableAgentResponseError) {
      const completedAt = new Date().toISOString();
      const safeMessage = "The model provider returned a malformed response. JD stopped this run without retrying it; review the provider response and start a new request if needed.";
      const { data: failedRun, error: failedRunError } = await admin.from("jd_automation_runs").update({
        status: "failed",
        result_json: { error_code: "invalid_model_response", message: detail.slice(0, MAX_ERROR_LENGTH), retryable: false },
        completed_at: completedAt,
      }).eq("id", runId).eq("school_id", schoolId).select("id").maybeSingle();
      if (failedRunError || !failedRun) throw new Error("Malformed model response was detected, but the run could not be marked failed");
      const { data: finished, error: finishError } = await admin.rpc("jd_finish_execution_job", {
        p_job_id: jobId, p_lease_token: leaseToken, p_terminal_status: "failed",
      });
      if (finishError || finished !== true) throw new Error("Malformed model response was detected, but the job could not be finalised");
      const { data: pendingMessage } = await admin.from("jd_messages").select("id")
        .eq("school_id", schoolId).contains("content_json", { job_id: jobId }).limit(1).maybeSingle();
      if (pendingMessage?.id) {
        await admin.from("jd_messages").update({ content: safeMessage, content_json: { job_id: jobId, status: "failed", streaming: false, error_code: "invalid_model_response" } })
          .eq("id", pendingMessage.id).eq("school_id", schoolId);
      } else if (streamConversationId) {
        await admin.from("jd_messages").insert({ school_id: schoolId, conversation_id: streamConversationId, role: "assistant", content: safeMessage, content_json: { job_id: jobId, status: "failed", streaming: false, error_code: "invalid_model_response" }, created_by_agent: true });
      }
      await admin.from("jd_audit_events").insert({
        school_id: schoolId, actor_id: requestedBy, run_id: runId,
        event_type: "automation.failed",
        event_json: { job_id: jobId, error_code: "invalid_model_response", retryable: false },
      });
      await admin.rpc("jd_ack_execution_message", { p_job_id: jobId, p_queue_message_id: message.message_id });
      return { job_id: jobId, status: "failed", error_code: "invalid_model_response" };
    }
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
