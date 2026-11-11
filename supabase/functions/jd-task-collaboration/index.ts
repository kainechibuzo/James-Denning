import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });
const uuid = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Authentication required" }, 401);
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !serviceKey) return json({ error: "Collaboration service is not configured" }, 503);

  const auth = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await auth.auth.getUser(token);
  if (authError || !authData.user) return json({ error: "Invalid session" }, 401);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: profile, error: profileError } = await admin.from("profiles")
    .select("id,school_id,role")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (profileError || !profile?.school_id) return json({ error: "Workspace membership required" }, 403);
  if (!["admin", "manager"].includes(String(profile.role))) return json({ error: "Manager permission required" }, 403);

  let payload: Record<string, unknown>;
  try { payload = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const taskId = payload.taskId;
  if (!uuid(taskId)) return json({ error: "A valid taskId is required" }, 400);

  if (payload.action === "comments.list") {
    const { data: task, error: taskError } = await admin.from("jd_operational_tasks")
      .select("id").eq("id", taskId).eq("school_id", profile.school_id).maybeSingle();
    if (taskError || !task) return json({ error: "Operational task not found" }, 404);

    const { data: rows, error } = await admin.from("jd_task_comments")
      .select("id,task_id,parent_comment_id,author_id,body,mentions,created_at")
      .eq("school_id", profile.school_id).eq("task_id", taskId)
      .order("created_at", { ascending: true }).limit(200);
    if (error) return json({ error: "Could not load task discussion" }, 500);

    const ids = [...new Set((rows || []).flatMap((row) => [row.author_id, ...(Array.isArray(row.mentions) ? row.mentions : [])]))];
    const { data: people, error: peopleError } = ids.length
      ? await admin.from("profiles").select("id,full_name").eq("school_id", profile.school_id).in("id", ids)
      : { data: [], error: null };
    if (peopleError) return json({ error: "Could not resolve discussion members" }, 500);
    const names = new Map((people || []).map((person) => [person.id, person.full_name || "Workspace member"]));
    return json({
      comments: (rows || []).map((row) => ({
        ...row,
        author_name: names.get(row.author_id) || "Workspace member",
        mention_names: (Array.isArray(row.mentions) ? row.mentions : []).map((id: string) => names.get(id) || "Workspace member"),
      })),
      truncated: (rows || []).length === 200,
    });
  }

  if (payload.action === "comments.create") {
    const body = typeof payload.body === "string" ? payload.body.trim() : "";
    const mentions = Array.isArray(payload.mentions) ? [...new Set(payload.mentions.filter(uuid))] : [];
    const parentCommentId = payload.parentCommentId == null ? null : payload.parentCommentId;
    if (!body || body.length > 2000) return json({ error: "Comment must contain 1–2,000 characters" }, 400);
    if (mentions.length > 10 || (Array.isArray(payload.mentions) && mentions.length !== payload.mentions.length)) {
      return json({ error: "Choose up to 10 valid workspace members to mention" }, 400);
    }
    if (parentCommentId !== null && !uuid(parentCommentId)) return json({ error: "Invalid parent comment" }, 400);

    const { data: comment, error } = await admin.rpc("jd_add_task_comment", {
      p_actor_id: authData.user.id,
      p_task_id: taskId,
      p_body: body,
      p_mentions: mentions,
      p_parent_comment_id: parentCommentId,
    });
    if (error) {
      const status = error.code === "42501" ? 403 : error.code === "P0002" ? 404 : 400;
      return json({ error: "Could not add task comment", reason: error.message }, status);
    }
    return json({ comment }, 201);
  }

  return json({ error: "Unsupported collaboration action" }, 400);
});
