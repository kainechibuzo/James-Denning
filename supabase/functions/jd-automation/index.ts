import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });

const highImpact = [
  /\b(pay|payment|transfer|refund|purchase|withdraw|charge)\b/i,
  /\b(send|email|message|notify|publish|announce)\b/i,
  /\b(delete|remove|erase|purge|terminate)\b/i,
  /\b(permission|role|access|invite|disable account)\b/i,
  /\b(sign|submit|file|approve contract|legal)\b/i,
];

function classifyRisk(text: string) {
  return highImpact.some((pattern) => pattern.test(text)) ? "approval_required" : "routine";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authorization = req.headers.get("Authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Authentication required" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json({ error: "Automation service is not configured" }, 503);
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) return json({ error: "Invalid session" }, 401);

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, school_id, role, full_name")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (profileError || !profile?.school_id) {
    return json({ error: "Your account is not linked to an organisation workspace" }, 403);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Request body must be valid JSON" }, 400);
  }

  const action = payload.action;
  if (action === "submit") {
    const requestText = typeof payload.message === "string" ? payload.message.trim() : "";
    if (!requestText || requestText.length > 12000) {
      return json({ error: "Message is required and must be under 12,000 characters" }, 400);
    }

    let conversationId = typeof payload.conversationId === "string" ? payload.conversationId : null;
    if (conversationId) {
      const { data: existing } = await admin
        .from("jd_conversations")
        .select("id")
        .eq("id", conversationId)
        .eq("school_id", profile.school_id)
        .maybeSingle();
      if (!existing) return json({ error: "Conversation not found in this workspace" }, 404);
    } else {
      const title = requestText.replace(/\s+/g, " ").slice(0, 72);
      const { data: conversation, error } = await admin
        .from("jd_conversations")
        .insert({ school_id: profile.school_id, created_by: authData.user.id, title })
        .select("id")
        .single();
      if (error || !conversation) return json({ error: "Could not create conversation" }, 500);
      conversationId = conversation.id;
    }

    const { error: messageError } = await admin.from("jd_messages").insert({
      school_id: profile.school_id,
      conversation_id: conversationId,
      sender_id: authData.user.id,
      role: "user",
      content: requestText,
    });
    if (messageError) return json({ error: "Could not save message" }, 500);

    const risk = classifyRisk(requestText);
    const status = risk === "approval_required" ? "awaiting_approval" : "planning";
    const idempotencyKey = typeof payload.idempotencyKey === "string"
      ? payload.idempotencyKey.slice(0, 120)
      : crypto.randomUUID();

    const { data: run, error: runError } = await admin
      .from("jd_automation_runs")
      .insert({
        school_id: profile.school_id,
        conversation_id: conversationId,
        requested_by: authData.user.id,
        trigger_type: payload.triggerType === "upload" ? "upload" : "chat",
        status,
        autonomy_mode: "autonomous",
        scope: "organisation",
        request_text: requestText,
        plan_json: [{
          step: 1,
          tool: "jd.plan_request",
          risk,
          status: "not_executed",
          note: "Planning/execution adapter is not enabled in this deployment.",
        }],
        idempotency_key: idempotencyKey,
      })
      .select("id,status,created_at")
      .single();

    if (runError || !run) {
      if (runError?.code === "23505") return json({ error: "This request was already submitted", duplicate: true }, 409);
      return json({ error: "Could not queue automation request" }, 500);
    }

    await admin.from("jd_audit_events").insert({
      school_id: profile.school_id,
      actor_id: authData.user.id,
      run_id: run.id,
      event_type: "automation.requested",
      event_json: { risk, status, trigger_type: payload.triggerType === "upload" ? "upload" : "chat" },
    });

    return json({
      conversationId,
      run,
      autonomy: "autonomous",
      scope: "organisation",
      risk,
      message: risk === "approval_required"
        ? "This request touches a high-impact action. It has been recorded and must be reviewed before execution."
        : "Your request has been securely recorded. The automation planner and tool executor are not yet enabled, so no organisation records have been changed.",
    }, 202);
  }

  if (action === "history") {
    const conversationId = typeof payload.conversationId === "string" ? payload.conversationId : "";
    if (!conversationId) return json({ error: "conversationId is required" }, 400);
    const { data, error } = await admin
      .from("jd_messages")
      .select("id,role,content,content_json,created_at")
      .eq("school_id", profile.school_id)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(100);
    if (error) return json({ error: "Could not load conversation" }, 500);
    return json({ messages: data || [] });
  }

  return json({ error: "Unsupported action" }, 400);
});
