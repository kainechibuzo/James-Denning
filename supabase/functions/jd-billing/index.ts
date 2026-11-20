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
      .select("plan_key,status,currency,amount_minor,trial_started_at,trial_ends_at,current_period_start,current_period_end,cancel_at_period_end,next_payment_at,last_payment_at,provider_subscription_code,created_at")
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
      billing_live: Boolean(Deno.env.get("PAYSTACK_SECRET_KEY") && Deno.env.get("PAYSTACK_PLATFORM_PLAN_CODE")),
      checkout_enabled: Deno.env.get("JD_BILLING_CHECKOUT_ENABLED") === "true" && Deno.env.get("JD_BILLING_CANCEL_FLOW_ENABLED") === "true" && Boolean(Deno.env.get("PAYSTACK_SECRET_KEY") && Deno.env.get("PAYSTACK_PLATFORM_PLAN_CODE") && Deno.env.get("JD_APP_URL")),
      note: "Checkout is available only after the free trial expires and only when the Paystack plan and server secrets are configured.",
    });
  }

  if (body.action === "billing.subscription.cancel") {
    const secret = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!secret) return send({ error: "Paystack subscription management is not configured", code: "billing_provider_not_configured" }, 503);
    const { data: subscription, error: subscriptionError } = await db
      .from("jd_billing_subscriptions")
      .select("status,provider_subscription_code,provider_customer_code,current_period_end")
      .eq("school_id", profile.school_id)
      .maybeSingle();
    if (subscriptionError) return send({ error: "Could not load subscription state" }, 503);
    if (!subscription?.provider_subscription_code) return send({ error: "No Paystack subscription is linked to this workspace", code: "billing_subscription_not_linked" }, 409);
    if (subscription.status === "cancelled") return send({ cancelled: true, reused: true, current_period_end: subscription.current_period_end });
    if (!["active", "past_due"].includes(subscription.status)) {
      return send({ error: "This subscription cannot be cancelled in its current state", code: "billing_cancellation_not_available" }, 409);
    }

    const providerResponse = await fetch(`https://api.paystack.co/subscription/${encodeURIComponent(subscription.provider_subscription_code)}`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const providerResult = await providerResponse.json().catch(() => null);
    const providerSubscription = providerResult?.data;
    if (!providerResponse.ok || providerResult?.status !== true ||
        providerSubscription?.subscription_code !== subscription.provider_subscription_code ||
        typeof providerSubscription?.email_token !== "string" ||
        !["active", "non-renewing"].includes(providerSubscription?.status)) {
      console.error("Paystack subscription could not be verified for cancellation", {
        status: providerResponse.status,
        provider_status: providerSubscription?.status,
      });
      return send({ error: "Paystack could not confirm the linked subscription. No local cancellation was recorded.", code: "billing_provider_subscription_unverified" }, 409);
    }
    const providerCustomerCode = providerSubscription.customer?.customer_code;
    if (subscription.provider_customer_code && providerCustomerCode !== subscription.provider_customer_code) {
      return send({ error: "The provider subscription customer does not match this workspace", code: "billing_subscription_customer_mismatch" }, 403);
    }

    const disableResponse = await fetch("https://api.paystack.co/subscription/disable", {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ code: subscription.provider_subscription_code, token: providerSubscription.email_token }),
    });
    const disableResult = await disableResponse.json().catch(() => null);
    if (!disableResponse.ok || disableResult?.status !== true) {
      console.error("Paystack subscription disable failed", { status: disableResponse.status, message: disableResult?.message });
      return send({ error: "Paystack could not disable future renewals. Your local subscription state was not changed.", code: "billing_provider_cancellation_failed" }, 502);
    }

    const { data: cancellation, error: cancellationError } = await db.rpc("jd_billing_mark_subscription_cancelled", {
      p_school_id: profile.school_id,
      p_actor_id: authData.user.id,
      p_subscription_code: subscription.provider_subscription_code,
    });
    if (cancellationError || !cancellation?.cancelled) {
      return send({ error: "Paystack has stopped future renewals, but JD is still reconciling the local subscription state.", code: "billing_cancellation_reconciliation_pending" }, 503);
    }
    return send({ cancelled: true, reused: Boolean(cancellation.reused), current_period_end: cancellation.current_period_end });
  }

  if (body.action === "billing.checkout.create") {
    if (!isUuid(body.requestId)) return send({ error: "A UUID requestId is required" }, 400);
    const secret = Deno.env.get("PAYSTACK_SECRET_KEY");
    const planCode = Deno.env.get("PAYSTACK_PLATFORM_PLAN_CODE");
    const appUrl = Deno.env.get("JD_APP_URL");
    if (Deno.env.get("JD_BILLING_CHECKOUT_ENABLED") !== "true" || Deno.env.get("JD_BILLING_CANCEL_FLOW_ENABLED") !== "true" || !secret || !planCode || !appUrl || !appUrl.startsWith("https://")) {
      return send({ error: "Paystack checkout is not enabled or configured", code: "billing_provider_not_configured" }, 503);
    }

    const { data: subscription, error: stateError } = await db
      .from("jd_billing_subscriptions")
      .select("status,trial_ends_at,amount_minor,currency")
      .eq("school_id", profile.school_id)
      .maybeSingle();
    if (stateError) return send({ error: "Could not verify subscription state" }, 503);
    if (!subscription) return send({ error: "Start the free trial before checkout", code: "billing_trial_required" }, 409);
    const trialActive = subscription.status === "trialing" && subscription.trial_ends_at &&
      Date.parse(subscription.trial_ends_at) > Date.now();
    if (trialActive) return send({ error: "Your free trial is still active", code: "billing_trial_active", trial_ends_at: subscription.trial_ends_at }, 409);
    if (!["checkout_required", "expired", "past_due", "incomplete"].includes(subscription.status) &&
        !(subscription.status === "trialing" && subscription.trial_ends_at && Date.parse(subscription.trial_ends_at) <= Date.now())) {
      return send({ error: "This subscription is not eligible for checkout", code: "billing_checkout_not_due" }, 409);
    }

    const { data: existing, error: existingError } = await db
      .from("jd_billing_payments")
      .select("provider_reference,status,checkout_url,checkout_expires_at")
      .eq("school_id", profile.school_id)
      .eq("request_id", body.requestId)
      .maybeSingle();
    if (existingError) return send({ error: "Could not load checkout request" }, 503);
    if (existing?.checkout_url && existing.status === "pending") {
      return send({ checkout_url: existing.checkout_url, reference: existing.provider_reference, reused: true });
    }
    if (existing?.status === "pending") {
      return send({ error: "Checkout is still being initialised. Refresh billing before retrying.", code: "billing_checkout_in_progress" }, 409);
    }
    if (existing) return send({ error: "This checkout request has already been used. Start a new request.", code: "billing_request_reused" }, 409);

    // Only one outstanding Paystack checkout is allowed per workspace. This
    // prevents repeated clicks or network retries from creating multiple payable links.
    const { data: pendingCheckout, error: pendingCheckoutError } = await db.from("jd_billing_payments")
      .select("provider_reference,checkout_url,status")
      .eq("school_id", profile.school_id).eq("status", "pending")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (pendingCheckoutError) return send({ error: "Could not inspect an existing checkout", code: "billing_checkout_lookup_failed" }, 503);
    if (pendingCheckout) {
      if (pendingCheckout.checkout_url) {
        return send({ checkout_url: pendingCheckout.checkout_url, reference: pendingCheckout.provider_reference, reused: true });
      }
      return send({ error: "Another checkout is still being initialised. Refresh billing before retrying.", code: "billing_checkout_in_progress" }, 409);
    }

    // A Paystack plan overrides the transaction amount. Verify the provider-side
    // amount, currency and cadence before creating a checkout that can charge a customer.
    const planResponse = await fetch(`https://api.paystack.co/plan/${encodeURIComponent(planCode)}`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const planResult = await planResponse.json().catch(() => null);
    const providerPlan = planResult?.data;
    if (!planResponse.ok || planResult?.status !== true ||
        providerPlan?.plan_code !== planCode ||
        Number(providerPlan?.amount) !== Number(subscription.amount_minor) ||
        providerPlan?.currency !== subscription.currency ||
        providerPlan?.interval !== "monthly") {
      console.error("Paystack plan configuration mismatch", {
        status: planResponse.status,
        currency: providerPlan?.currency,
        interval: providerPlan?.interval,
      });
      return send({ error: "The configured Paystack plan does not match the workspace subscription price. Checkout is blocked.", code: "billing_plan_mismatch" }, 409);
    }
    const { error: planSaveError } = await db.from("jd_billing_subscriptions")
      .update({ provider_plan_code: planCode, updated_at: new Date().toISOString() })
      .eq("school_id", profile.school_id);
    if (planSaveError) return send({ error: "Could not save the verified billing plan", code: "billing_plan_persist_failed" }, 503);

    const reference = `JD${crypto.randomUUID().replaceAll("-", "")}`;
    const { error: insertError } = await db.from("jd_billing_payments").insert({
      school_id: profile.school_id,
      provider: "paystack",
      provider_reference: reference,
      request_id: body.requestId,
      amount_minor: Number(subscription.amount_minor),
      currency: subscription.currency,
      status: "pending",
    });
    if (insertError) {
      if (insertError.code === "23505") return send({ error: "Checkout is already being initialised. Refresh billing and retry shortly.", code: "billing_checkout_in_progress" }, 409);
      return send({ error: "Could not reserve checkout" }, 503);
    }

    const callback = new URL("/", appUrl);
    callback.searchParams.set("billing", "paystack");
    const paystackResponse = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: authData.user.email,
        currency: subscription.currency,
        reference,
        plan: planCode,
        callback_url: callback.toString(),
        metadata: { product: "james-denning", request_id: body.requestId, workspace_id: profile.school_id },
      }),
    });
    const providerResult = await paystackResponse.json().catch(() => null);
    if (!paystackResponse.ok || providerResult?.status !== true ||
        typeof providerResult?.data?.authorization_url !== "string") {
      await db.from("jd_billing_payments").update({ status: "failed" })
        .eq("school_id", profile.school_id).eq("provider_reference", reference);
      console.error("Paystack checkout initialisation failed", { status: paystackResponse.status, message: providerResult?.message });
      return send({ error: "Paystack could not initialise checkout", code: "billing_provider_checkout_failed" }, 502);
    }

    const { error: saveError } = await db.from("jd_billing_payments").update({
      checkout_url: providerResult.data.authorization_url,
      checkout_expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    }).eq("school_id", profile.school_id).eq("provider_reference", reference);
    if (saveError) {
      await db.from("jd_billing_payments").update({ status: "failed" })
        .eq("school_id", profile.school_id).eq("provider_reference", reference).eq("status", "pending");
      console.error("Could not persist Paystack checkout URL", saveError.code);
      return send({ error: "Checkout could not be safely saved. No payment link was returned; start a new checkout request.", code: "billing_checkout_persist_failed" }, 503);
    }
    return send({ checkout_url: providerResult.data.authorization_url, reference, reused: false });
  }

  if (body.action === "billing.checkout.verify") {
    const reference = typeof body.reference === "string" ? body.reference : "";
    if (!/^[A-Za-z0-9.=\-]{8,100}$/.test(reference)) return send({ error: "Invalid payment reference" }, 400);
    const secret = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!secret) return send({ error: "Paystack billing is not configured", code: "billing_provider_not_configured" }, 503);

    const { data: payment, error: paymentError } = await db
      .from("jd_billing_payments")
      .select("id,provider_reference,amount_minor,currency,status")
      .eq("school_id", profile.school_id)
      .eq("provider_reference", reference)
      .maybeSingle();
    if (paymentError || !payment) return send({ error: "Payment reference was not found for this workspace" }, 404);
    if (payment.status === "succeeded") return send({ verified: true, status: "succeeded", reference, reused: true });

    const verifyResponse = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const verifyResult = await verifyResponse.json().catch(() => null);
    const transaction = verifyResult?.data;
    if (!verifyResponse.ok || verifyResult?.status !== true ||
        transaction?.reference !== reference || Number(transaction?.amount) !== Number(payment.amount_minor) ||
        transaction?.currency !== payment.currency) {
      return send({ verified: false, status: "unverified", error: "Payment details could not be verified" }, 409);
    }
    if (transaction.status !== "success") {
      if (["failed", "abandoned"].includes(transaction.status)) {
        const { error: failedUpdateError } = await db.from("jd_billing_payments").update({ status: "failed" })
          .eq("school_id", profile.school_id).eq("provider_reference", reference).eq("status", "pending");
        if (failedUpdateError) return send({ error: "Payment is not successful and its state could not be reconciled" }, 503);
      }
      return send({ verified: false, status: transaction.status || "unverified", error: "Payment has not been verified as successful" }, 409);
    }

    const paidAt = transaction.paid_at || new Date().toISOString();
    const { data: finalised, error: finaliseError } = await db.rpc("jd_billing_finalize_payment", {
      p_school_id: profile.school_id,
      p_reference: reference,
      p_amount_minor: Number(transaction.amount),
      p_currency: transaction.currency,
      p_paid_at: paidAt,
      p_customer_code: transaction.customer?.customer_code || null,
      p_actor_id: authData.user.id,
      p_source_webhook_receipt_id: null,
    });
    if (finaliseError || !finalised?.verified) {
      console.error("Verified payment finalisation failed", finaliseError?.code || "invalid_rpc_result");
      return send({ error: "Payment was verified, but subscription finalisation is pending reconciliation" }, 503);
    }
    return send({ ...finalised, paid_at: paidAt });
  }

  return send({ error: "Unsupported billing action" }, 400);
});
