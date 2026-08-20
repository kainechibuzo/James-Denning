/**
 * send-email-batch — background email queue processor
 *
 * Client enqueues emails into `email_queue`, then calls this function once with
 * the batch_id. The function processes emails server-side using EdgeRuntime.waitUntil()
 * so processing continues even after the HTTP response is returned and the browser
 * closes. Progress is tracked in `email_queue` — client can poll for status.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Attachment = { name: string; content: string; mimeType?: string };

async function sendViaZeptoMail(
  recipient: string,
  subject: string,
  html: string,
  apiKey: string,
  fromEmail: string,
  fromName: string,
  attachments: Attachment[] = [],
): Promise<{ ok: boolean; error?: string }> {
  const payload: Record<string, unknown> = {
    from: { address: fromEmail, name: fromName },
    to: [{ email_address: { address: recipient } }],
    subject,
    htmlbody: html,
  };
  if (attachments.length) {
    payload.attachments = attachments.map((a) => ({
      name: a.name,
      content: a.content,
      mime_type: a.mimeType || "application/pdf",
    }));
  }
  const resp = await fetch("https://api.zeptomail.com/v1.1/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Zoho-enczapikey ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    let errText = "";
    try { errText = await resp.text(); } catch { /* ignore */ }
    return { ok: false, error: `ZeptoMail ${resp.status}: ${errText}` };
  }
  return { ok: true };
}

async function sha256(message: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(message));
}
async function hmac(key: ArrayBuffer | string, message: string): Promise<ArrayBuffer> {
  const rawKey = typeof key === "string" ? new TextEncoder().encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey(
    "raw", rawKey, { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
}
function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function sendViaSES(
  recipient: string,
  subject: string,
  html: string,
  accessKeyId: string,
  secretAccessKey: string,
  region: string,
  fromEmail: string,
): Promise<{ ok: boolean; error?: string }> {
  const url = `https://email.${region}.amazonaws.com/v2/email/outbound-emails`;
  const body = JSON.stringify({
    FromEmailAddress: fromEmail,
    Destination: { ToAddresses: [recipient] },
    Content: { Simple: { Subject: { Data: subject, Charset: "UTF-8" }, Body: { Html: { Data: html, Charset: "UTF-8" } } } },
  });
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, "").slice(0, 15) + "Z";
  const dateStamp = amzDate.slice(0, 8);
  const { host, pathname } = new URL(url);
  const bodyHash = toHex(await sha256(body));
  const canonicalHeaders = `content-type:application/json\nhost:${host}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "content-type;host;x-amz-date";
  const canonicalRequest = ["POST", pathname, "", canonicalHeaders, signedHeaders, bodyHash].join("\n");
  const credentialScope = `${dateStamp}/${region}/ses/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, toHex(await sha256(canonicalRequest))].join("\n");
  const signingKey = await hmac(await hmac(await hmac(await hmac(`AWS4${secretAccessKey}`, dateStamp), region), "ses"), "aws4_request");
  const signature = toHex(await hmac(signingKey, stringToSign));
  const headers = {
    "Content-Type": "application/json",
    "X-Amz-Date": amzDate,
    "Authorization": `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
  const response = await fetch(url, { method: "POST", headers, body });
  if (!response.ok) {
    let data: Record<string, unknown> = {};
    try { data = await response.json(); } catch { /* empty */ }
    return { ok: false, error: `SES ${response.status}: ${String(data.message || data.Message || "Unknown")}` };
  }
  return { ok: true };
}

async function processBatch(
  supabaseUrl: string,
  serviceRoleKey: string,
  batchId: string,
  ratePerMin: number,
  zeptoKey: string | undefined,
  zeptoFrom: string,
  zeptoName: string,
  awsKey: string | undefined,
  awsSecret: string | undefined,
  awsRegion: string,
  sesFrom: string,
) {
  const supa = createClient(supabaseUrl, serviceRoleKey);
  const delay = Math.floor(60000 / Math.max(1, ratePerMin));

  while (true) {
    // Atomically claim one pending email
    const { data: rows } = await supa
      .from("email_queue")
      .select("id, to_email, subject, html, attachments, attempts")
      .eq("batch_id", batchId)
      .eq("status", "pending")
      .order("id")
      .limit(1);

    if (!rows || rows.length === 0) break; // All done

    const row = rows[0];

    // Mark as sending to prevent double-processing
    await supa.from("email_queue")
      .update({ status: "sending" })
      .eq("id", row.id)
      .eq("status", "pending"); // guard

    let result: { ok: boolean; error?: string };
    const attachments: Attachment[] = Array.isArray(row.attachments) ? row.attachments : [];

    if (zeptoKey) {
      result = await sendViaZeptoMail(row.to_email, row.subject, row.html, zeptoKey, zeptoFrom, zeptoName, attachments);
    } else if (awsKey && awsSecret) {
      result = await sendViaSES(row.to_email, row.subject, row.html, awsKey, awsSecret, awsRegion, sesFrom);
    } else {
      result = { ok: false, error: "No email provider configured" };
    }

    await supa.from("email_queue").update({
      status: result.ok ? "sent" : "failed",
      processed_at: new Date().toISOString(),
      error_message: result.error || null,
      attempts: (row.attempts || 0) + 1,
    }).eq("id", row.id);

    if (delay > 0) {
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { batch_id, rate_per_min = 10 } = await req.json();
    if (!batch_id) {
      return new Response(
        JSON.stringify({ error: "batch_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const zeptoKey = Deno.env.get("ZEPTO_API_KEY");
    const zeptoFrom = Deno.env.get("ZEPTO_FROM_EMAIL") || Deno.env.get("SES_FROM_EMAIL") || "noreply@renaissancegardenschools.com";
    const zeptoName = Deno.env.get("ZEPTO_FROM_NAME") || "JAMES-DENNING";
    const awsKey = Deno.env.get("AWS_ACCESS_KEY_ID");
    const awsSecret = Deno.env.get("AWS_SECRET_ACCESS_KEY");
    const awsRegion = Deno.env.get("AWS_REGION") || "eu-north-1";
    const sesFrom = Deno.env.get("SES_FROM_EMAIL") || "noreply@renaissancegardenschools.com";

    const task = processBatch(
      supabaseUrl, serviceRoleKey, batch_id, rate_per_min,
      zeptoKey, zeptoFrom, zeptoName, awsKey, awsSecret, awsRegion, sesFrom,
    );

    // Keep processing after response is returned (survives browser close)
    // deno-lint-ignore no-explicit-any
    if (typeof (globalThis as any).EdgeRuntime !== "undefined") {
      // deno-lint-ignore no-explicit-any
      (globalThis as any).EdgeRuntime.waitUntil(task);
    } else {
      await task; // Fallback: process synchronously
    }

    // Count total pending for this batch
    const supa = createClient(supabaseUrl, serviceRoleKey);
    const { count } = await supa
      .from("email_queue")
      .select("*", { count: "exact", head: true })
      .eq("batch_id", batch_id);

    return new Response(
      JSON.stringify({ accepted: true, batch_id, total: count || 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[send-email-batch] error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
