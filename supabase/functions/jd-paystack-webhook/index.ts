import { createClient } from "npm:@supabase/supabase-js@2";
import { verifyPaystackWebhookSignature } from "../_shared/jd-paystack-webhook-crypto.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const signingSecret = Deno.env.get("PAYSTACK_WEBHOOK_SECRET");
  const legacySecret = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (!url || !service) return json({ error: "Webhook service unavailable" }, 503);

  const rawBody = new Uint8Array(await req.arrayBuffer());
  if (rawBody.length === 0 || rawBody.length > 256_000) return json({ error: "Invalid webhook body" }, 400);
  const signature = await verifyPaystackWebhookSignature(
    rawBody,
    req.headers.get("Paystack-Signature"),
    req.headers.get("x-paystack-signature"),
    signingSecret,
    legacySecret,
  );
  if (!signature.valid) return json({ error: "Invalid webhook signature" }, 401);

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    return json({ error: "Invalid webhook JSON" }, 400);
  }
  const event = typeof payload.event === "string" ? payload.event : "";
  const data = payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)
    ? payload.data as Record<string, unknown> : {};
  if (!event) return json({ error: "Missing event type" }, 400);

  const db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const payloadHash = await sha256Hex(rawBody);
  const providerReference = typeof data.reference === "string" ? data.reference : null;
  const providerId = data.id == null ? null : String(data.id);
  const eventKey = `${event}:${providerReference || providerId || payloadHash}`;
  let receiptId: string;
  const { data: insertedReceipt, error: receiptError } = await db.from("jd_billing_webhook_receipts").insert({
    provider: "paystack",
    event_key: eventKey,
    event_type: event,
    provider_reference: providerReference,
    payload_sha256: payloadHash,
    status: "received",
  }).select("id").single();
  if (receiptError?.code === "23505") {
    const { data: prior, error: priorError } = await db.from("jd_billing_webhook_receipts")
      .select("id,status").eq("provider", "paystack").eq("event_key", eventKey).maybeSingle();
    if (priorError || !prior) return json({ error: "Could not inspect duplicate webhook receipt" }, 503);
    if (prior.status !== "failed") return json({ received: true, duplicate: true, status: prior.status });
    const { error: reclaimError } = await db.from("jd_billing_webhook_receipts")
      .update({ status: "received", error_code: null, processed_at: null })
      .eq("id", prior.id).eq("status", "failed");
    if (reclaimError) return json({ error: "Could not reclaim failed webhook receipt" }, 503);
    receiptId = prior.id;
  } else if (receiptError || !insertedReceipt) {
    console.error("Paystack webhook receipt could not be persisted", receiptError?.code);
    return json({ error: "Could not persist webhook receipt" }, 503);
  } else {
    receiptId = insertedReceipt.id;
  }

  const mark = async (status: "processed" | "ignored" | "failed", errorCode?: string) => {
    const { error } = await db.from("jd_billing_webhook_receipts").update({
      status, processed_at: new Date().toISOString(), error_code: errorCode || null,
    }).eq("provider", "paystack").eq("event_key", eventKey);
    if (error) throw error;
  };

  try {
    if (event === "ping") {
      await mark("processed");
      return json({ received: true, event, mode: signature.mode });
    }

    if (event === "charge.success") {
      if (!providerReference) throw new Error("charge_success_missing_reference");
      const secret = legacySecret;
      if (!secret) throw new Error("paystack_secret_missing");
      const verifyResponse = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(providerReference)}`, {
        headers: { Authorization: `Bearer ${secret}` },
      });
      const verifyResult = await verifyResponse.json().catch(() => null);
      const transaction = verifyResult?.data;
      if (!verifyResponse.ok || verifyResult?.status !== true || transaction?.status !== "success" ||
          transaction?.reference !== providerReference) {
        throw new Error("paystack_transaction_verification_failed");
      }

      const { data: payment, error: paymentLookupError } = await db
        .from("jd_billing_payments")
        .select("id,school_id,amount_minor,currency,status")
        .eq("provider", "paystack")
        .eq("provider_reference", providerReference)
        .maybeSingle();
      if (paymentLookupError) throw new Error("billing_payment_lookup_failed");
      if (!payment) {
        // Recurring charge: resolve tenant only through an already-linked Paystack subscription/customer.
        const customerCode = transaction.customer?.customer_code;
        const subscriptionCode = data.subscription_code ||
          (data.subscription && typeof data.subscription === "object"
            ? (data.subscription as Record<string, unknown>).subscription_code : null);
        let query = db.from("jd_billing_subscriptions").select("school_id,version,amount_minor,currency");
        if (typeof subscriptionCode === "string") query = query.eq("provider_subscription_code", subscriptionCode);
        else if (typeof customerCode === "string") query = query.eq("provider_customer_code", customerCode);
        else {
          await mark("ignored");
          return json({ received: true, ignored: true });
        }
        const { data: subscription, error: subscriptionLookupError } = await query.maybeSingle();
        if (subscriptionLookupError) throw new Error("billing_subscription_lookup_failed");
        if (!subscription) {
          await mark("ignored");
          return json({ received: true, ignored: true });
        }
        if (Number(transaction.amount) !== Number(subscription.amount_minor) ||
            transaction.currency !== subscription.currency || transaction.currency !== "USD") {
          throw new Error("recurring_payment_amount_currency_mismatch");
        }
        const paidAt = transaction.paid_at || new Date().toISOString();
        const { error: recurringInsertError } = await db.from("jd_billing_payments").insert({
          school_id: subscription.school_id,
          provider: "paystack",
          provider_reference: providerReference,
          request_id: crypto.randomUUID(),
          amount_minor: Number(transaction.amount),
          currency: transaction.currency,
          status: "pending",
        });
        if (recurringInsertError && recurringInsertError.code !== "23505") throw new Error("recurring_payment_record_failed");
        const { data: recurringPayment, error: recurringLookupError } = await db.from("jd_billing_payments")
          .select("school_id,amount_minor,currency,status")
          .eq("provider", "paystack").eq("provider_reference", providerReference).maybeSingle();
        if (recurringLookupError || !recurringPayment ||
            recurringPayment.school_id !== subscription.school_id ||
            Number(recurringPayment.amount_minor) !== Number(transaction.amount) ||
            recurringPayment.currency !== transaction.currency) {
          throw new Error("recurring_payment_record_mismatch");
        }
        const { data: finalised, error: finaliseError } = await db.rpc("jd_billing_finalize_payment", {
          p_school_id: subscription.school_id,
          p_reference: providerReference,
          p_amount_minor: Number(transaction.amount),
          p_currency: transaction.currency,
          p_paid_at: paidAt,
          p_customer_code: customerCode || null,
          p_actor_id: null,
          p_source_webhook_receipt_id: receiptId,
        });
        if (finaliseError || !finalised?.verified) throw new Error("recurring_payment_finalisation_failed");
        await mark("processed");
        return json({ received: true, processed: true });
      }

      if (Number(transaction.amount) !== Number(payment.amount_minor) || transaction.currency !== payment.currency) {
        throw new Error("paystack_amount_currency_mismatch");
      }
      const paidAt = transaction.paid_at || new Date().toISOString();
      const { data: finalised, error: finaliseError } = await db.rpc("jd_billing_finalize_payment", {
        p_school_id: payment.school_id,
        p_reference: providerReference,
        p_amount_minor: Number(transaction.amount),
        p_currency: transaction.currency,
        p_paid_at: paidAt,
        p_customer_code: transaction.customer?.customer_code || null,
        p_actor_id: null,
        p_source_webhook_receipt_id: receiptId,
      });
      if (finaliseError || !finalised?.verified) throw new Error("billing_payment_finalisation_failed");
      await mark("processed");
      return json({ received: true, processed: true });
    }

    const subscriptionCode = typeof data.subscription_code === "string"
      ? data.subscription_code
      : (data.subscription && typeof data.subscription === "object"
        ? (data.subscription as Record<string, unknown>).subscription_code : null);
    const customerCode = data.customer && typeof data.customer === "object"
      ? (data.customer as Record<string, unknown>).customer_code : null;
    const metadata = data.metadata && typeof data.metadata === "object"
      ? data.metadata as Record<string, unknown>
      : (data.subscription && typeof data.subscription === "object" &&
          (data.subscription as Record<string, unknown>).metadata &&
          typeof (data.subscription as Record<string, unknown>).metadata === "object"
        ? (data.subscription as Record<string, unknown>).metadata as Record<string, unknown> : {});
    let lookup = db.from("jd_billing_subscriptions").select("school_id,version,amount_minor,currency");
    if (typeof subscriptionCode === "string") lookup = lookup.eq("provider_subscription_code", subscriptionCode);
    else if (typeof customerCode === "string") lookup = lookup.eq("provider_customer_code", customerCode);
    else if (typeof metadata.workspace_id === "string" && /^[0-9a-f-]{36}$/i.test(metadata.workspace_id)) lookup = lookup.eq("school_id", metadata.workspace_id);
    else {
      await mark("ignored");
      return json({ received: true, ignored: true });
    }
    const { data: subscription, error: lookupError } = await lookup.maybeSingle();
    if (lookupError) throw new Error("billing_subscription_lookup_failed");
    if (!subscription) {
      await mark("ignored");
      return json({ received: true, ignored: true });
    }

    const changes: Record<string, unknown> = { updated_at: new Date().toISOString(), version: (subscription.version || 1) + 1 };
    if (event === "subscription.create") {
      // Subscription metadata alone is not payment proof. Only a verified
      // charge.success event may activate the workspace subscription.
      if (typeof subscriptionCode === "string") changes.provider_subscription_code = subscriptionCode;
      if (typeof customerCode === "string") changes.provider_customer_code = customerCode;
      if (data.next_payment_date) changes.next_payment_at = data.next_payment_date;
    } else if (event === "subscription.not_renew") {
      changes.cancel_at_period_end = true;
      if (data.next_payment_date) changes.next_payment_at = data.next_payment_date;
    } else if (event === "subscription.disable") {
      changes.status = "cancelled";
      changes.cancel_at_period_end = false;
    } else if (event === "invoice.payment_failed") {
      changes.status = "past_due";
    } else {
      await mark("ignored");
      return json({ received: true, ignored: true });
    }
    const { error: updateError } = await db.from("jd_billing_subscriptions").update(changes)
      .eq("school_id", subscription.school_id);
    if (updateError) throw new Error("billing_subscription_event_update_failed");
    await db.from("jd_billing_events").insert({
      school_id: subscription.school_id, event_type: `paystack.${event}`,
      source_webhook_receipt_id: receiptId,
      event_json: { provider: "paystack", subscription_code: subscriptionCode || null, customer_code: customerCode || null },
    });
    await mark("processed");
    return json({ received: true, processed: true });
  } catch (error) {
    console.error("Paystack webhook processing failed", error instanceof Error ? error.message : "unknown");
    try { await mark("failed", error instanceof Error ? error.message.slice(0, 120) : "unknown"); } catch {}
    return json({ error: "Webhook processing failed" }, 500);
  }
});
