import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};
const send = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });
const isUuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return send({ error: "Method not allowed" }, 405);

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return send({ error: "Authentication required" }, 401);

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return send({ error: "Billing service not configured" }, 503);

  const auth = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await auth.auth.getUser(token);
  if (authError || !authData.user) return send({ error: "Invalid session" }, 401);

  const db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: profile, error: profileError } = await db
    .from("profiles")
    .select("id,school_id,role")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (profileError || !profile?.school_id) return send({ error: "Workspace required" }, 403);
  if (!["owner", "admin"].includes(profile.role)) return send({ error: "Workspace owner permission required" }, 403);

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return send({ error: "Invalid request" }, 400);
    body = parsed as Record<string, unknown>;
  } catch {
    return send({ error: "Invalid JSON" }, 400);
  }

  if (body.action === "billing.trial.start") {
    if (!isUuid(body.requestId)) return send({ error: "A UUID requestId is required" }, 400);
    const { data, error } = await db.rpc("jd_billing_start_trial", {
      p_actor_id: authData.user.id,
      p_request_id: body.requestId,
    });
    if (error) {
      const denied = error.code === "42501";
      return send({ error: denied ? "Workspace owner permission required" : "Could not start the trial", code: error.code || "billing_trial_failed" }, denied ? 403 : 409);
    }
    return send({ trial: data });
  }

  if (body.action === "billing.snapshot") {
    const { data: subscription, error: subscriptionError } = await db
      .from("jd_billing_subscriptions")
      .select("plan_key,status,currency,amount_minor,trial_started_at,trial_ends_at,current_period_start,current_period_end,cancel_at_period_end,next_payment_at,last_payment_at,created_at")
      .eq("school_id", profile.school_id)
      .maybeSingle();
    if (subscriptionError) return send({ error: "Could not load billing status" }, 503);

    const { data: invoices, error: invoiceError } = await db
      .from("jd_billing_invoices")
      .select("id,invoice_number,status,currency,subtotal_minor,tax_minor,total_minor,paid_minor,issued_at,due_at,period_start,period_end")
      .eq("school_id", profile.school_id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (invoiceError) return send({ error: "Could not load invoices" }, 503);

    const expiredTrial = subscription?.status === "trialing" &&
      subscription.trial_ends_at && Date.parse(subscription.trial_ends_at) <= Date.now();
    return send({
      subscription: subscription ? { ...subscription, effective_status: expiredTrial ? "checkout_required" : subscription.status } : null,
      invoices: invoices || [],
      billing_live: false,
      note: "Billing records are read-only here. Checkout, invoice issuance and collection are not enabled.",
    });
  }

  if (body.action === "billing.checkout.create") {
    return send({ error: "Checkout is not enabled yet", code: "billing_checkout_disabled" }, 409);
  }

  return send({ error: "Unsupported billing action" }, 400);
});
