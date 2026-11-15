import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Pre-authentication lookups only. Password verification is always Supabase Auth.
const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(url, serviceKey, { auth: { persistSession: false } });
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
const validId = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0 && v.trim().length <= 80 && !/[%_]/.test(v);
const validUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
async function rateLimit(req: Request, action: string) {
  const ip = (req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim().slice(0, 80);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip + "|" + action));
  const key = Array.from(new Uint8Array(digest)).map(x => x.toString(16).padStart(2,"0")).join("");
  const { data, error } = await db.rpc("consume_public_endpoint_rate_limit", { p_bucket_key: key, p_limit: 20, p_window_seconds: 300 });
  return !error && data === true;
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply({ error: "invalid_json" }, 400); }
  const action = body.action;
  if (action === "authenticate") return reply({ error: "legacy_login_retired", message: "Password verification must use Supabase Auth." }, 410);
  const allowed = ["schools","access_settings","admin","student","teacher"];
  if (typeof action !== "string" || !allowed.includes(action)) return reply({ error: "invalid_action" }, 400);
  if (!await rateLimit(req, action)) return reply({ error: "rate_limited" }, 429);
  if (action === "schools") {
    const { data, error } = await db.from("schools").select("id,name,logo,address,phone,student_id_prefix").eq("status","active").order("name").limit(200);
    if (error) return reply({ error: "lookup_failed" }, 500);
    return reply({ data: data || [] });
  }
  if (!validUuid(body.school_id)) return reply({ error: "invalid_school" }, 400);
  const schoolId = body.school_id.trim();
  if (action === "access_settings") {
    const { data, error } = await db.from("school_settings").select("key,value").eq("school_id",schoolId).in("key",["login_students_disabled","login_teachers_disabled","login_disabled_message"]);
    if (error) return reply({ error: "lookup_failed" }, 500);
    return reply({ data: data || [] });
  }
  if (action === "admin") {
    const { data, error } = await db.from("schools").select("admin_email,admin_name").eq("id",schoolId).maybeSingle();
    if (error) return reply({ error: "lookup_failed" }, 500);
    return reply({ data: data || null });
  }
  if (!validId(body.identifier)) return reply({ error: "invalid_identifier" }, 400);
  const identifier = body.identifier.trim();
  if (action === "teacher") {
    const { data, error } = await db.from("teachers").select("id,staff_id,full_name,display_name,email,role,status,school_id").eq("school_id",schoolId).eq("staff_id",identifier).limit(1).maybeSingle();
    if (error) return reply({ error: "lookup_failed" }, 500);
    return reply({ data: data || null });
  }
  if (action === "student") {
    const { data, error } = await db.from("students").select("id,name,first_name,middle_name,last_name,display_name,class_id,email,status,school_id").eq("school_id",schoolId).eq("id",identifier).limit(1).maybeSingle();
    if (error) return reply({ error: "lookup_failed" }, 500);
    return reply({ data: data || null });
  }
  return reply({ error: "invalid_action" }, 400);
});
