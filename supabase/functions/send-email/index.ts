import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── ZeptoMail sender ──────────────────────────────────────────────────────────
type Attachment = { name: string; content: string; mimeType?: string };

async function sendViaZeptoMail(
  recipients: string[],
  subject: string,
  html: string,
  apiKey: string,
  fromEmail: string,
  fromName: string,
  attachments: Attachment[] = [],
): Promise<{ ok: boolean; error?: string }> {
  const toArray = recipients.map((addr) => ({
    email_address: { address: addr },
  }));

  const payload: Record<string, unknown> = {
    from: { address: fromEmail, name: fromName },
    to: toArray,
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
  const body = JSON.stringify(payload);

  const resp = await fetch("https://api.zeptomail.com/v1.1/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Zoho-enczapikey ${apiKey}`,
    },
    body,
  });

  if (!resp.ok) {
    let errText = "";
    try { errText = await resp.text(); } catch { /* ignore */ }
    return { ok: false, error: `ZeptoMail ${resp.status}: ${errText}` };
  }
  return { ok: true };
}

// ── AWS SES sender (fallback) ─────────────────────────────────────────────────
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
  recipients: string[],
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
    ReplyToAddresses: ["info@renaissancegardenschools.com"],
    Destination: { ToAddresses: recipients },
    Content: {
      Simple: {
        Subject: { Data: subject, Charset: "UTF-8" },
        Body:    { Html:    { Data: html,    Charset: "UTF-8" } },
      },
    },
  });

  // Build SigV4
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
  const signingKey = await hmac(
    await hmac(await hmac(await hmac(`AWS4${secretAccessKey}`, dateStamp), region), "ses"),
    "aws4_request",
  );
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
    return { ok: false, error: `SES ${response.status}: ${String(data.message || data.Message || "Unknown error")}` };
  }
  return { ok: true };
}

// ── Handler ───────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\\s+/i, "");
    if (!token) return new Response(JSON.stringify({ error: "Authentication required" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authClient = createClient(url, anonKey, { auth: { persistSession: false }, global: { headers: { Authorization: authHeader } } });
    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData.user) return new Response(JSON.stringify({ error: "Invalid session" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const adminClient = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: actor } = await adminClient.from("profiles").select("role,school_id").eq("id", authData.user.id).maybeSingle();
    if (!actor || actor.role !== "admin" || !actor.school_id) return new Response(JSON.stringify({ error: "School administrator access required" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { to, subject, html, from, attachments } = await req.json();

    if (!to || !subject || !html) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: to, subject, html" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const recipients: string[] = Array.isArray(to) ? to.filter(Boolean) : [to].filter(Boolean);
    if (!recipients.length || recipients.length > 100 || recipients.some((email) => typeof email !== "string" || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email))) {
      return new Response(
        JSON.stringify({ error: "No valid recipients" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Provider selection: ZeptoMail takes priority if key is configured ──
    const zetpKey  = Deno.env.get("ZEPTO_API_KEY");
    const zetpFrom = Deno.env.get("ZEPTO_FROM_EMAIL") || Deno.env.get("SES_FROM_EMAIL") || from || "noreply@renaissancegardenschools.com";
    const zetpName = Deno.env.get("ZEPTO_FROM_NAME") || "JAMES-DENNING";

    const awsKey    = Deno.env.get("AWS_ACCESS_KEY_ID");
    const awsSecret = Deno.env.get("AWS_SECRET_ACCESS_KEY");
    const awsRegion = Deno.env.get("AWS_REGION") || "eu-north-1";
    const sesFrom   = Deno.env.get("SES_FROM_EMAIL") || from || "noreply@renaissancegardenschools.com";

    let result: { ok: boolean; error?: string };
    let provider: string;

    if (zetpKey) {
      // ZeptoMail — no sandbox restrictions, works immediately
      provider = "ZeptoMail";
      result = await sendViaZeptoMail(recipients, subject, html, zetpKey, zetpFrom, zetpName, attachments || []);
    } else if (awsKey && awsSecret) {
      // AWS SES fallback
      provider = "AWS SES";
      result = await sendViaSES(recipients, subject, html, awsKey, awsSecret, awsRegion, sesFrom);
    } else {
      return new Response(
        JSON.stringify({ error: "No email provider configured. Add ZEPTO_API_KEY or AWS_ACCESS_KEY_ID to Supabase secrets." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!result.ok) {
      console.error(`[send-email] ${provider} error:`, result.error);
      return new Response(
        JSON.stringify({ error: result.error }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`[send-email] Sent via ${provider} to ${recipients.length} recipient(s): ${recipients.join(", ")}`);
    return new Response(
      JSON.stringify({ success: true, provider, recipients: recipients.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (err) {
    console.error("[send-email] Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
