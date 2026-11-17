/**
 * Email service — portal email sending, batch delivery, and HTML template builders.
 *
 * All sends are fire-and-forget safe: failures are logged but never throw to
 * the caller.  The edge function (Supabase → ZeptoMail + SES fallback) handles
 * delivery retries.
 */

import { db } from "../../supabaseClient.js";









/**
 * Build a business-neutral HTML email (JAMES-DENNING monochrome, no school
 * branding). Used for public-facing mail such as hiring application
 * confirmations — buildEmailHtml above is school-branded and must not be used
 * for arbitrary-org recipients.
 */
export function buildNeutralEmailHtml(subj, bodyText, senderLabel = "Business Portal") {
  const year = new Date().getFullYear();
  const esc = (s = "") => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  const rows = String(bodyText || "").replace(/\r\n/g,"\n").replace(/\r/g,"\n").split("\n").map(l =>
    `<tr><td style="padding:3px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.75;color:#3d3d3d;">${esc(l)||"&nbsp;"}</td></tr>`
  ).join("");
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>${esc(subj)}</title></head>
<body style="margin:0;padding:0;background:#f7f7f5;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f5;padding:28px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.09);">
<tr><td style="background:#111827;padding:20px 40px;"><div style="font-family:Arial,sans-serif;font-size:15px;font-weight:700;color:#fff;letter-spacing:0.5px;">${esc(senderLabel)}</div></td></tr>
<tr><td style="background:#111827;padding:0 40px 16px;"><div style="font-family:Arial,sans-serif;font-size:16px;font-weight:700;color:#fff;opacity:.9;">${esc(subj)}</div></td></tr>
<tr><td style="background:#ffffff;padding:32px 40px;"><table width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr>
<tr><td style="background:#fafaf8;padding:20px 40px;"><div style="font-family:Arial,sans-serif;font-size:11px;color:#777;text-align:center;line-height:1.8;">Sent via JAMES-DENNING &mdash; ${esc(senderLabel)}<br/>&copy; ${year} ${esc(senderLabel)}</div></td></tr>
</table>
</td></tr></table>
</body></html>`;
}

/**
 * Build a compact admin alert email HTML.
 * Used for Tier A immediate alerts (security events, critical actions).
 * @param {string} title      Short title line, e.g. "Role Changed"
 * @param {string[]} rows     Array of "Label: value" strings
 * @param {string} severity   "critical" | "warn" | "info"
 * @param {string} schoolName
 */
export function buildAlertEmail(title, rows, severity = "info", schoolName = "Business Portal") {
  const COLOR = severity === "critical" ? "#b91c1c" : severity === "warn" ? "#d97706" : "#111827";
  const ICON  = severity === "critical" ? "&#x1F534;" : severity === "warn" ? "&#x1F7E1;" : "&#x1F535;";
  const esc = (s = "") => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const dateStr = new Date().toLocaleString("en-NG", { dateStyle:"medium", timeStyle:"short" });
  const rowHtml = rows.map(r => {
    const idx = r.indexOf(":");
    const label = idx > -1 ? r.slice(0, idx) : r;
    const val   = idx > -1 ? r.slice(idx + 1).trim() : "";
    return `<tr>
      <td style="padding:7px 0;font-size:13px;color:#64748b;white-space:nowrap;padding-right:20px;">${esc(label)}</td>
      <td style="padding:7px 0;font-size:13px;font-weight:700;color:#1a202c;">${esc(val)}</td>
    </tr>`;
  }).join("");
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:28px 0;background:#f1f5f9;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.1);">
  <tr><td style="background:${COLOR};padding:18px 28px;display:block;">
    <span style="font-size:18px;font-weight:900;color:#fff;">${ICON} ${esc(title)}</span>
    <span style="float:right;font-size:11px;color:rgba(255,255,255,.75);line-height:28px;">${esc(dateStr)}</span>
  </td></tr>
  <tr><td style="background:#fff;padding:24px 28px;">
    <table width="100%" cellpadding="0" cellspacing="0">${rowHtml}</table>
  </td></tr>
  <tr><td style="background:#f8fafc;padding:14px 28px;font-size:11px;color:#94a3b8;text-align:center;">
    ${esc(schoolName)} &mdash; automated message &middot; Do not reply
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

// ── Email sending ─────────────────────────────────────────────────────────

/**
 * Send a single email via the Supabase edge function.
 * Failures are logged but never throw — email never blocks UX.
 */
export async function sendPortalEmail({ to, subject, html, attachments = [] }) {
  if (!to || !to.includes("@")) return { ok: false };
  try {
    const body = JSON.stringify({ to, subject, html, ...(attachments.length ? { attachments } : {}) });
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body,
      }
    );
    if (!res.ok) {
      let errBody = "";
      try { errBody = await res.text(); } catch {}
      console.error(`[sendPortalEmail] HTTP ${res.status}:`, errBody);
      db.logEmail({ subject, body:"", recipient_count:1, delivered_count:0, failed_count:1,
        failed_recipients:[{ email:to, error:`HTTP ${res.status}: ${errBody}` }],
        status:"failed", error_message:`HTTP ${res.status}: ${errBody}` }).catch(() => {});
      return { ok: false, error: errBody };
    }
    db.logEmail({ subject, body:"", recipient_count:1, delivered_count:1, failed_count:0,
      failed_recipients:[], status:"sent" }).catch(() => {});
    return { ok: true };
  } catch (e) {
    console.warn("[sendPortalEmail] failed (non-blocking):", e);
    db.logEmail({ subject, body:"", recipient_count:1, delivered_count:0, failed_count:1,
      failed_recipients:[{ email:to, error:e.message }],
      status:"failed", error_message:e.message }).catch(() => {});
    return { ok: false };
  }
}




