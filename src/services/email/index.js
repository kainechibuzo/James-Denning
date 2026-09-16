/**
 * Email service — portal email sending, batch delivery, and HTML template builders.
 *
 * All sends are fire-and-forget safe: failures are logged but never throw to
 * the caller.  The edge function (Supabase → ZeptoMail + SES fallback) handles
 * delivery retries.
 */

import { db } from "../../supabaseClient.js";

// ── Shared card CSS (used by student + teacher welcome emails) ────────────
export const EMAIL_CARD_CSS = `<style>
body{font-family:'Segoe UI',Arial,sans-serif;background:#f0f4f8;padding:32px 16px;margin:0}
.card{max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.1)}
.header{background:linear-gradient(135deg,#0d2d6e,#1A4FA0);padding:32px;text-align:center}
.school{color:#fff;font-size:20px;font-weight:900;margin-bottom:4px}
.tagline{color:rgba(255,255,255,.7);font-size:12px;letter-spacing:1px;text-transform:uppercase}
.body{padding:28px 32px}
.greeting{font-size:16px;color:#1a202c;margin-bottom:16px}
.details-box{background:#f8fafc;border-radius:8px;padding:16px 20px;border-left:4px solid #1A4FA0;margin:20px 0}
.detail-row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e2e8f0;font-size:14px}
.detail-row:last-child{border-bottom:none}
.label{color:#64748b}.value{font-weight:700;color:#1a202c}.value.id{color:#1A4FA0;font-size:15px;letter-spacing:.5px}
.login-box{background:linear-gradient(135deg,#eff6ff,#dbeafe);border-radius:8px;padding:16px 20px;margin:20px 0;text-align:center}
.login-url{color:#1A4FA0;font-weight:700;font-size:15px;text-decoration:none}
.note{font-size:12px;color:#64748b;margin-top:6px}
.footer{background:#f8fafc;padding:16px 32px;text-align:center;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0}
</style>`;

// ── Welcome email HTML builders ───────────────────────────────────────────

export function buildStudentEmail({ studentName, studentId, className, schoolName = "School Portal" }) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/>${EMAIL_CARD_CSS}</head><body>
<div class="card">
  <div class="header">
    <div class="school">${schoolName}</div>
    <div class="tagline">School Portal</div>
  </div>
  <div class="body">
    <div style="font-size:11px;color:#64748b;background:#f8fafc;padding:6px 12px;border-radius:6px;margin-bottom:16px;border-left:3px solid #1A4FA0">This communication is regarding: <strong>${studentName}</strong> · Student ID: <strong>${studentId}</strong> · Class: <strong>${className || "—"}</strong></div>
    <div class="greeting">Dear <strong>${studentName}</strong>,<br/><br/>
    Welcome to ${schoolName}! Your student portal account has been created. Here are your login details:</div>
    <div class="details-box">
      <div class="detail-row"><span class="label">Student Name</span><span class="value">${studentName}</span></div>
      <div class="detail-row"><span class="label">Student ID</span><span class="value id">${studentId}</span></div>
      <div class="detail-row"><span class="label">Class</span><span class="value">${className || "—"}</span></div>
      <div class="detail-row"><span class="label">Password</span><span class="value">${studentId}</span></div>
    </div>
    <div class="login-box">
      <div style="font-size:13px;color:#374151;margin-bottom:8px">Login at:</div>
      <a class="login-url" href="${window.location.origin}">${window.location.host}</a>
      <div class="note">Use your Student ID as both your username and password.<br/>Please keep your login details safe and confidential.</div>
    </div>
    <p style="font-size:13px;color:#64748b;line-height:1.6">If you have any questions, please contact the school administration office.</p>
  </div>
  <div class="footer">${schoolName}<br/>This is an automated message. Please do not reply.</div>
</div></body></html>`;
}

export function buildTeacherEmail({ teacherName, teacherEmail, schoolName = "School Portal" }) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/>${EMAIL_CARD_CSS}</head><body>
<div class="card">
  <div class="header">
    <div class="school">${schoolName}</div>
    <div class="tagline">School Portal</div>
  </div>
  <div class="body">
    <div class="greeting">Dear <strong>${teacherName}</strong>,<br/><br/>
    Welcome to ${schoolName}! Your staff portal account has been created. Here are your login details:</div>
    <div class="details-box">
      <div class="detail-row"><span class="label">Full Name</span><span class="value">${teacherName}</span></div>
      <div class="detail-row"><span class="label">Login Email</span><span class="value">${teacherEmail}</span></div>
      <div class="detail-row"><span class="label">Password</span><span class="value">${teacherEmail}</span></div>
      <div class="detail-row"><span class="label">Role</span><span class="value">Teacher</span></div>
    </div>
    <div class="login-box">
      <div style="font-size:13px;color:#374151;margin-bottom:8px">Login at:</div>
      <a class="login-url" href="${window.location.origin}">${window.location.host}</a>
      <div class="note">Use your email address as both username and password.<br/>Please change your password after your first login.</div>
    </div>
    <p style="font-size:13px;color:#64748b;line-height:1.6">If you have any questions, please contact the school administration office.</p>
  </div>
  <div class="footer">${schoolName}<br/>This is an automated message. Please do not reply.</div>
</div></body></html>`;
}

/**
 * Build a branded HTML email body.
 * @param {string} subj      Email subject (used in header + title)
 * @param {string} bodyText  Plain text body with \n line breaks
 * @param {string} schoolName
 */
export function buildEmailHtml(subj, bodyText, schoolName = "School Portal") {
  const year    = new Date().getFullYear();
  const dateStr = new Date().toLocaleDateString("en-NG", { weekday:"long", year:"numeric", month:"long", day:"numeric" });
  const esc = (s = "") => s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  const BG="#f7f7f5",WHITE="#ffffff",ORANGE="#E8490F",GREEN="#1B7A2F",PURPLE="#4B3B8C",BORDER="#e0ddd7",TEXTMID="#3d3d3d",TEXTLIGHT="#777";
  const rows = bodyText.replace(/\r\n/g,"\n").replace(/\r/g,"\n").split("\n").map(l =>
    `<tr><td style="padding:3px 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.75;color:${TEXTMID};">${esc(l)||"&nbsp;"}</td></tr>`
  ).join("");
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>${esc(subj)}</title></head>
<body style="margin:0;padding:0;background:${BG};">
<table width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:28px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.09);">
<tr><td style="background:${ORANGE};height:6px;font-size:0;line-height:0;">&nbsp;</td><td style="background:${GREEN};height:6px;font-size:0;line-height:0;width:60%;">&nbsp;</td><td style="background:${PURPLE};height:6px;font-size:0;line-height:0;width:20%;">&nbsp;</td></tr>
<tr><td colspan="3" style="background:${WHITE};padding:32px 40px 24px;">
  <table width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="vertical-align:middle;"><div style="line-height:1.15;margin-bottom:6px;"><span style="font-family:Georgia,serif;font-size:26px;font-weight:900;color:${ORANGE};letter-spacing:0.5px;">RENAISSANCE</span><br/><span style="font-family:Georgia,serif;font-size:26px;font-weight:900;color:${GREEN};">GARDEN SCHOOLS</span></div><div style="font-family:Arial,sans-serif;font-size:12px;font-style:italic;color:${PURPLE};font-weight:600;">Our God, Our Vision, Our Strength</div></td>
    <td style="vertical-align:top;text-align:right;white-space:nowrap;"><div style="font-family:Arial,sans-serif;font-size:11px;color:${TEXTLIGHT};">${dateStr}</div></td>
  </tr></table>
</td></tr>
<tr><td colspan="3" style="background:${GREEN};padding:14px 40px;"><div style="font-family:Arial,sans-serif;font-size:16px;font-weight:700;color:${WHITE};">${esc(subj)}</div></td></tr>
<tr><td colspan="3" style="background:${WHITE};padding:36px 40px 28px;"><table width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr>
<tr><td colspan="3" style="background:${WHITE};padding:0 40px;"><div style="border-top:2px solid ${BORDER};"></div></td></tr>
<tr><td colspan="3" style="background:#fafaf8;padding:24px 40px 20px;">
  <table width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="vertical-align:top;"><div style="font-family:Georgia,serif;font-size:13px;font-weight:700;color:${GREEN};margin-bottom:8px;">${esc(schoolName)}</div></td>
    <td style="vertical-align:top;text-align:right;"><div style="font-family:Arial,sans-serif;font-size:11px;color:${TEXTLIGHT};line-height:1.9;">Sent via School Portal<br/>&copy; ${year} ${esc(schoolName)}<br/>All rights reserved.</div></td>
  </tr></table>
</td></tr>
<tr><td colspan="3" style="background:#f0ede8;padding:14px 40px;"><div style="font-family:Arial,sans-serif;font-size:11px;color:${TEXTLIGHT};text-align:center;line-height:1.7;">This is a computer-generated email. Please do not reply directly to this message.<br/>For enquiries, contact the school administration office.</div></td></tr>
<tr><td style="background:${PURPLE};height:5px;font-size:0;line-height:0;width:20%;">&nbsp;</td><td style="background:${GREEN};height:5px;font-size:0;line-height:0;width:60%;">&nbsp;</td><td style="background:${ORANGE};height:5px;font-size:0;line-height:0;">&nbsp;</td></tr>
</table></td></tr></table>
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
export function buildAlertEmail(title, rows, severity = "info", schoolName = "School Portal") {
  const COLOR = severity === "critical" ? "#b91c1c" : severity === "warn" ? "#d97706" : "#1A4FA0";
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

/**
 * Rate-limited sequential batch sender.
 * @param {Array}    emails       Array of { to, subject, html, attachments? }
 * @param {Function} onProgress   Called with { sent, failed, total, current, done }
 * @param {number}   ratePerMin   Default 10 (safe); 20 is faster but risks throttling
 */
export async function sendBatchEmails(emails, onProgress, ratePerMin = 10) {
  const delay = Math.floor(60000 / ratePerMin);
  let sent = 0, failed = 0;
  for (let i = 0; i < emails.length; i++) {
    const result = await sendPortalEmail(emails[i]);
    if (result.ok) sent++; else failed++;
    onProgress?.({ sent, failed, total: emails.length, current: emails[i].to, done: i === emails.length - 1 });
    if (i < emails.length - 1) await new Promise(r => setTimeout(r, delay));
  }
  return { sent, failed, total: emails.length };
}

/**
 * Queue a batch for background processing via edge function.
 * Returns { batchId } — caller polls db.getEmailQueueStatus(batchId).
 */
export async function sendEmailBatchBackground(emails, schoolId, ratePerMin = 10) {
  const batchId = crypto.randomUUID();
  const { error } = await db.queueEmailBatch(batchId, emails, schoolId);
  if (error) { console.error("[sendEmailBatchBackground] queue error:", error); return { batchId, error }; }
  try {
    await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email-batch`, {
      method: "POST",
      headers: { "Content-Type":"application/json", "Authorization":`Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ batch_id: batchId, rate_per_min: ratePerMin }),
    });
  } catch (e) { console.warn("[sendEmailBatchBackground] trigger error:", e); }
  return { batchId, error: null };
}
