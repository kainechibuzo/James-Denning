import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface DigestConfig {
  enabled: boolean;
  recipient: string;
  utc_hour: number;
  frequency: "daily" | "weekly";
  day_of_week: number;
  events: Record<string, boolean> | null;
  last_sent_at: string | null;
}

// Unified event row after merging both tables
interface EventRow {
  action: string;
  entity_type: string;
  entity_name: string;
  performed_by: string;
  amount: number | null;
  performed_at: string;
  category: string;
}

// ── Supabase REST helpers ─────────────────────────────────────────────────────
async function pgGet(
  sbUrl: string, svcKey: string, table: string, params: Record<string, string>,
): Promise<{ data: Record<string, unknown> | null }> {
  const qs = new URLSearchParams({ ...params, limit: "1" }).toString();
  const resp = await fetch(`${sbUrl}/rest/v1/${table}?${qs}`, {
    headers: { "apikey": svcKey, "Authorization": `Bearer ${svcKey}`, "Accept": "application/json" },
  });
  if (!resp.ok) return { data: null };
  const rows = await resp.json() as Record<string, unknown>[];
  return { data: rows[0] ?? null };
}

async function pgQuery(
  sbUrl: string, svcKey: string, table: string, params: Record<string, string>,
): Promise<{ data: Record<string, unknown>[]; error: string | null }> {
  const qs = new URLSearchParams(params).toString();
  const resp = await fetch(`${sbUrl}/rest/v1/${table}?${qs}`, {
    headers: { "apikey": svcKey, "Authorization": `Bearer ${svcKey}`, "Accept": "application/json" },
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    return { data: [], error: `${resp.status}: ${t}` };
  }
  const rows = await resp.json() as Record<string, unknown>[];
  return { data: rows, error: null };
}

async function pgUpsert(
  sbUrl: string, svcKey: string, table: string, row: Record<string, unknown>,
): Promise<void> {
  await fetch(`${sbUrl}/rest/v1/${table}`, {
    method: "POST",
    headers: { "apikey": svcKey, "Authorization": `Bearer ${svcKey}`, "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(row),
  });
}

// ── Categorisation ────────────────────────────────────────────────────────────
// Based on actual DB values from admin_audit_log + fee_audit_log
function categorise(action: string, entity_type: string): string {
  if (["login_success","login_failed","logout_kicked","logout_idle","logout"].includes(action)) return "logins";
  if (entity_type === "student") return "students";
  if (["teacher","educator"].includes(entity_type)) return "staff";
  if (entity_type === "member" && action !== "page_view") return "staff";
  if (["report_card","broadsheet"].includes(entity_type) ||
      action.startsWith("report_card") || action === "broadsheet_export") return "results";
  if (entity_type === "setting" || action === "setting_change") return "settings";
  if (entity_type === "fee" || ["bill_generated","bill_deleted","payment_recorded",
      "refund_processed","discount_applied","item_added","item_removed","discount_removed"].includes(action)) return "fees";
  if (action === "page_view") return "logins"; // group page_view under logins
  if (["data_export","broadsheet_export","role_change"].includes(action)) return "settings";
  return "settings";
}

const CATEGORY_FILTER_KEYS = ["logins","students","staff","results","fees","settings","access"];

function rowMatchesFilter(cat: string, events: Record<string, boolean> | null): boolean {
  if (!events) return true;
  // "access" filter maps to page_view — included under logins category
  return !!events[cat] || (cat === "logins" && !!events["access"]);
}

// ── HTML digest builder ───────────────────────────────────────────────────────
function escHtml(s: string): string {
  return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

const CC: Record<string, string> = {
  logins:"#1A4FA0", students:"#1A8C3C", staff:"#E8560A",
  results:"#7C3AED", fees:"#0891B2", settings:"#64748B", access:"#B45309",
};

function badge(cat: string): string {
  const c = CC[cat] ?? "#64748B";
  return `<span style="display:inline-block;padding:2px 8px;border-radius:999px;background:${c}20;color:${c};font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px">${cat}</span>`;
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit", timeZone:"Africa/Lagos",
    }) + " WAT";
  } catch { return iso; }
}

function fmtAmount(n: number | null): string {
  if (!n) return "";
  return ` · ₦${n.toLocaleString("en-NG")}`;
}

function buildDigestHtml(rows: EventRow[], windowLabel: string, schoolName: string, generatedAt: string): string {
  const counts: Record<string, number> = {};
  for (const r of rows) { counts[r.category] = (counts[r.category] || 0) + 1; }

  const summaryCards = Object.entries(counts).map(([cat, n]) => {
    const c = CC[cat] ?? "#64748B";
    return `<div style="display:inline-block;margin:4px;padding:8px 16px;border-radius:8px;background:${c}15;border:1px solid ${c}30;text-align:center;min-width:80px"><div style="font-size:22px;font-weight:700;color:${c}">${n}</div><div style="font-size:11px;color:${c};font-weight:500;text-transform:uppercase">${cat}</div></div>`;
  }).join("");

  const tableRows = rows.map((r) =>
    `<tr style="border-bottom:1px solid #f1f5f9">
      <td style="padding:8px 12px;font-size:12px;color:#64748b;white-space:nowrap">${fmtDate(r.performed_at)}</td>
      <td style="padding:8px 12px">${badge(r.category)}</td>
      <td style="padding:8px 12px;font-size:13px;color:#1e293b;font-weight:500">${escHtml(r.action)}</td>
      <td style="padding:8px 12px;font-size:13px;color:#475569">${escHtml(r.performed_by || "—")}${fmtAmount(r.amount)}</td>
      <td style="padding:8px 12px;font-size:12px;color:#64748b">${escHtml(r.entity_name || "")}</td>
    </tr>`
  ).join("");

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Activity Digest</title></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:'Segoe UI',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:24px 0"><tr><td align="center">
<table width="640" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);max-width:100%">
  <tr><td style="background:linear-gradient(135deg,#1A4FA0,#1565C0);padding:28px 32px">
    <div style="color:#fff;font-size:20px;font-weight:700">Activity Digest</div>
    <div style="color:#93C5FD;font-size:13px;margin-top:4px">${escHtml(schoolName)} &middot; ${escHtml(windowLabel)}</div>
  </td></tr>
  <tr><td style="padding:20px 32px 8px">
    <div style="font-size:13px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">Summary</div>
    <div>${summaryCards || '<span style="color:#94a3b8;font-size:13px">No activity recorded in this period.</span>'}</div>
    <div style="margin-top:12px;font-size:12px;color:#94a3b8">Total events: <strong style="color:#1e293b">${rows.length}</strong></div>
  </td></tr>
  ${rows.length ? `<tr><td style="padding:16px 32px 0"><div style="overflow-x:auto">
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px">
      <thead><tr style="background:#f8fafc">
        <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;border-bottom:2px solid #e2e8f0">Time (WAT)</th>
        <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;border-bottom:2px solid #e2e8f0">Category</th>
        <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;border-bottom:2px solid #e2e8f0">Action</th>
        <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;border-bottom:2px solid #e2e8f0">Actor / Amount</th>
        <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;border-bottom:2px solid #e2e8f0">Target</th>
      </tr></thead>
      <tbody>${tableRows}</tbody>
    </table></div></td></tr>` : ""}
  <tr><td style="padding:20px 32px 28px">
    <div style="border-top:1px solid #e2e8f0;padding-top:16px;font-size:11px;color:#94a3b8;text-align:center">
      Generated ${escHtml(generatedAt)} &middot; JAMES-DENNING &middot; This is an automated digest. Do not reply.
    </div>
  </td></tr>
</table></td></tr></table></body></html>`;
}

// ── ZeptoMail ─────────────────────────────────────────────────────────────────
async function sendZepto(to: string, subject: string, html: string, apiKey: string, fromEmail: string, fromName: string): Promise<{ ok: boolean; error?: string }> {
  const resp = await fetch("https://api.zeptomail.com/v1.1/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Zoho-enczapikey ${apiKey}` },
    body: JSON.stringify({ from: { address: fromEmail, name: fromName }, to: [{ email_address: { address: to } }], subject, htmlbody: html }),
  });
  if (!resp.ok) { const t = await resp.text().catch(() => ""); return { ok: false, error: `ZeptoMail ${resp.status}: ${t}` }; }
  return { ok: true };
}

// ── SES ───────────────────────────────────────────────────────────────────────
async function sha256(msg: string): Promise<ArrayBuffer> { return crypto.subtle.digest("SHA-256", new TextEncoder().encode(msg)); }
async function hmac(key: ArrayBuffer | string, msg: string): Promise<ArrayBuffer> {
  const raw = typeof key === "string" ? new TextEncoder().encode(key) : key;
  const ck = await crypto.subtle.importKey("raw", raw, { name:"HMAC", hash:"SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", ck, new TextEncoder().encode(msg));
}
function toHex(buf: ArrayBuffer): string { return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,"0")).join(""); }

async function sendSES(to: string, subject: string, html: string, keyId: string, secret: string, region: string, from: string): Promise<{ ok: boolean; error?: string }> {
  const url = `https://email.${region}.amazonaws.com/v2/email/outbound-emails`;
  const body = JSON.stringify({ FromEmailAddress: from, Destination: { ToAddresses: [to] }, Content: { Simple: { Subject:{ Data:subject, Charset:"UTF-8" }, Body:{ Html:{ Data:html, Charset:"UTF-8" } } } } });
  const now = new Date(); const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g,"").slice(0,15)+"Z"; const dateStamp = amzDate.slice(0,8);
  const { host, pathname } = new URL(url); const bodyHash = toHex(await sha256(body));
  const canonHdr = `content-type:application/json\nhost:${host}\nx-amz-date:${amzDate}\n`; const signedHdr = "content-type;host;x-amz-date";
  const canonReq = ["POST", pathname, "", canonHdr, signedHdr, bodyHash].join("\n"); const credScope = `${dateStamp}/${region}/ses/aws4_request`;
  const sts = ["AWS4-HMAC-SHA256", amzDate, credScope, toHex(await sha256(canonReq))].join("\n");
  const sigKey = await hmac(await hmac(await hmac(await hmac(`AWS4${secret}`,dateStamp),region),"ses"),"aws4_request");
  const sig = toHex(await hmac(sigKey, sts));
  const r = await fetch(url, { method:"POST", headers:{ "Content-Type":"application/json", "X-Amz-Date":amzDate, "Authorization":`AWS4-HMAC-SHA256 Credential=${keyId}/${credScope}, SignedHeaders=${signedHdr}, Signature=${sig}` }, body });
  if (!r.ok) { let d: Record<string,unknown>={}; try { d = await r.json(); } catch { /**/ } return { ok:false, error:`SES ${r.status}: ${String(d.message||d.Message||"error")}` }; }
  return { ok: true };
}

// ── Main handler ──────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const reqBody = await req.json().catch(() => ({}));
    const { school_id, force = false } = reqBody as { school_id?: string; force?: boolean };
    if (!school_id) return new Response(JSON.stringify({ error: "school_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return new Response(JSON.stringify({ error: "Authentication required" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
    if (!ANON_KEY) throw new Error("Supabase anon/publishable key missing");
    const authClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: authHeader } } });
    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData.user) return new Response(JSON.stringify({ error: "Invalid session" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: actor } = await adminClient.from("profiles").select("role,school_id").eq("id", authData.user.id).maybeSingle();
    if (!actor || actor.role !== "admin" || actor.school_id !== school_id) return new Response(JSON.stringify({ error: "Administrator access to this school is required" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // ── Load digest config ──
    const { data: dcRow } = await pgGet(SUPABASE_URL, SERVICE_KEY, "school_settings", { select: "value", key: "eq.notif_digest_config", school_id: `eq.${school_id}` });
    let cfg: DigestConfig | null = null;
    try { cfg = dcRow ? JSON.parse(dcRow.value as string) : null; } catch { /**/ }
    if (!cfg?.enabled) return new Response(JSON.stringify({ skipped: true, reason: "digest not enabled" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // ── Time gate ──
    const nowUtc = new Date();
    if (!force) {
      if (nowUtc.getUTCHours() !== cfg.utc_hour)
        return new Response(JSON.stringify({ skipped: true, reason: "not the configured hour" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (cfg.frequency === "weekly") {
        const isoDay = nowUtc.getUTCDay() === 0 ? 7 : nowUtc.getUTCDay();
        if (isoDay !== cfg.day_of_week)
          return new Response(JSON.stringify({ skipped: true, reason: "not the configured day" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (cfg.last_sent_at) {
        const ls = new Date(cfg.last_sent_at);
        if (ls.getUTCFullYear()===nowUtc.getUTCFullYear()&&ls.getUTCMonth()===nowUtc.getUTCMonth()&&ls.getUTCDate()===nowUtc.getUTCDate()&&ls.getUTCHours()===nowUtc.getUTCHours())
          return new Response(JSON.stringify({ skipped: true, reason: "already sent this hour" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    const windowMs = cfg.frequency === "weekly" ? 7*24*60*60*1000 : 24*60*60*1000;
    const since = new Date(nowUtc.getTime() - windowMs).toISOString();

    // ── Query admin_audit_log ──
    const { data: auditRows, error: auditErr } = await pgQuery(SUPABASE_URL, SERVICE_KEY, "admin_audit_log", {
      select: "action,entity_type,entity_name,performed_by,performed_at",
      school_id: `eq.${school_id}`, performed_at: `gte.${since}`,
      order: "performed_at.desc", limit: "400",
    });
    if (auditErr) throw new Error(`audit query: ${auditErr}`);

    // ── Query fee_audit_log ──
    const { data: feeRows, error: feeErr } = await pgQuery(SUPABASE_URL, SERVICE_KEY, "fee_audit_log", {
      select: "action,performed_by,amount,student_id,created_at",
      school_id: `eq.${school_id}`, created_at: `gte.${since}`,
      order: "created_at.desc", limit: "200",
    });
    if (feeErr) console.warn("[scheduled-digest] fee_audit_log query failed:", feeErr);

    // ── Normalise into unified EventRow list ──
    const events: EventRow[] = [];

    for (const r of auditRows) {
      const action = String(r.action ?? "");
      const entity_type = String(r.entity_type ?? "");
      const cat = categorise(action, entity_type);
      if (!rowMatchesFilter(cat, cfg.events)) continue;
      events.push({
        action,
        entity_type,
        entity_name: String(r.entity_name ?? ""),
        performed_by: String(r.performed_by ?? ""),
        amount: null,
        performed_at: String(r.performed_at ?? ""),
        category: cat,
      });
    }

    for (const r of (feeRows || [])) {
      const action = String(r.action ?? "");
      const cat = "fees";
      if (!rowMatchesFilter(cat, cfg.events)) continue;
      events.push({
        action,
        entity_type: "fee",
        entity_name: r.student_id ? `Student ${r.student_id}` : "",
        performed_by: String(r.performed_by ?? ""),
        amount: r.amount ? Number(r.amount) : null,
        performed_at: String(r.created_at ?? ""),
        category: cat,
      });
    }

    // Sort merged list by time descending
    events.sort((a, b) => b.performed_at.localeCompare(a.performed_at));

    // ── School name + recipient ──
    const { data: schoolRow } = await pgGet(SUPABASE_URL, SERVICE_KEY, "schools", { select: "name", id: `eq.${school_id}` });
    const schoolName = (schoolRow?.name as string) || "JAMES-DENNING";

    const { data: ncRow } = await pgGet(SUPABASE_URL, SERVICE_KEY, "school_settings", { select: "value", key: "eq.notif_config", school_id: `eq.${school_id}` });
    let alertEmail = ""; try { alertEmail = ncRow ? JSON.parse(ncRow.value as string).alert_email || "" : ""; } catch { /**/ }

    const recipient = cfg.recipient || alertEmail;
    if (!recipient) return new Response(JSON.stringify({ error: "No recipient configured" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // ── Build + send ──
    const watNow = new Date(nowUtc.getTime() + 3600000);
    const generatedAt = watNow.toLocaleString("en-GB", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" }) + " WAT";
    const windowLabel = cfg.frequency === "weekly" ? `Last 7 days up to ${generatedAt}` : `Last 24 hours up to ${generatedAt}`;
    const html = buildDigestHtml(events, windowLabel, schoolName, generatedAt);
    const n = events.length;
    const subject = `[${schoolName}] Activity Digest — ${cfg.frequency === "weekly" ? "Weekly" : "Daily"} (${n} event${n !== 1 ? "s" : ""})`;

    const zetpKey = Deno.env.get("ZEPTO_API_KEY"); const zetpFrom = Deno.env.get("ZEPTO_FROM_EMAIL") || ""; const zetpName = Deno.env.get("ZEPTO_FROM_NAME") || "JAMES-DENNING";
    const awsKey = Deno.env.get("AWS_ACCESS_KEY_ID"); const awsSecret = Deno.env.get("AWS_SECRET_ACCESS_KEY"); const awsRegion = Deno.env.get("AWS_REGION") || "eu-north-1"; const sesFrom = Deno.env.get("SES_FROM_EMAIL") || zetpFrom;

    let result: { ok: boolean; error?: string }; let provider: string;
    if (zetpKey) { provider = "ZeptoMail"; result = await sendZepto(recipient, subject, html, zetpKey, zetpFrom, zetpName); }
    else if (awsKey && awsSecret) { provider = "AWS SES"; result = await sendSES(recipient, subject, html, awsKey, awsSecret, awsRegion, sesFrom); }
    else return new Response(JSON.stringify({ error: "No email provider configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    if (!result.ok) {
      console.error(`[scheduled-digest] ${provider} error:`, result.error);
      return new Response(JSON.stringify({ error: result.error }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    await pgUpsert(SUPABASE_URL, SERVICE_KEY, "school_settings", { school_id, key: "notif_digest_config", value: JSON.stringify({ ...cfg, last_sent_at: nowUtc.toISOString() }) });
    console.log(`[scheduled-digest] Sent via ${provider} to ${recipient} — ${n} events`);
    return new Response(JSON.stringify({ success: true, provider, recipient, events: n }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("[scheduled-digest] error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
