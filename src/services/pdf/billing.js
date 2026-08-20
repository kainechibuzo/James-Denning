/**
 * Billing PDF Builder — generates fee invoice and receipt HTML documents.
 *
 * Returns a full HTML string that can be:
 *   - Opened in a new window (print/Save as PDF)
 *   - Passed to htmlToPdfBase64() for base64 capture
 *   - Attached to an email
 *
 * No React dependency. No theme (C) dependency — uses hardcoded brand colours.
 */

import { pdfName } from "./capture.js";

/**
 * Build a fee invoice or receipt HTML document.
 *
 * @param {object} params
 *   bill              Billing bill object (with nested fee_payments, fee_discounts, fee_refunds)
 *   items             Array of fee line items { name, amount, is_optional }
 *   billNo            Invoice/receipt reference number
 *   today             Formatted date string
 *   name              Member display name
 *   studentId         Member ID
 *   className         Group name
 *   isPaid            Boolean (will be overridden from live balance)
 *   isReceipt         true = Receipt layout; false = Invoice layout
 *   isNativePlatform  true = hides print bar button
 *   filename          Override output filename (optional)
 *   schoolName        Organization display name
 *   schoolLogo        Base64 logo data URI (optional)
 */
export function buildPDF({
  bill, items, billNo, today, name, studentId, className,
  isPaid, isReceipt, isNativePlatform = false, filename = "",
  schoolName = "Business Portal", schoolLogo = null
}) {
  const discounts        = bill.fee_discounts || [];
  const refundedPmtIds   = new Set((bill.fee_refunds || []).filter(r => r.payment_id).map(r => String(r.payment_id)));
  const activePmts       = (bill.fee_payments || []).filter(p => !p.is_refunded && !refundedPmtIds.has(String(p.id)));
  const showPayments     = activePmts.length > 0;
  const subtotal         = items.reduce((a, i) => a + (+i.amount || 0), 0);
  const totalDiscount    = discounts.reduce((a, d) => a + (+d.amount || 0), 0);
  const totalAfterDiscounts = Math.max(0, subtotal - totalDiscount);
  const amountPaid       = +bill.amount_paid || 0;
  const balanceAmt       = Math.max(0, totalAfterDiscounts - amountPaid);

  // Compute live status — don't trust stale bill.status from DB
  const liveStatus = amountPaid <= 0 ? "unpaid" : balanceAmt <= 0 ? "paid" : "partial";
  isPaid = liveStatus === "paid";

  const _fn = filename || pdfName(name, isReceipt ? "RCPT" : "INV", billNo.replace(/^JD-(BILL|RCPT)-/, ""));

  // ── Status theming ────────────────────────────────────────────────────────
  const scFg   = liveStatus === "paid" ? "#15803d" : liveStatus === "partial" ? "#b45309" : "#b91c1c";
  const scBg   = liveStatus === "paid" ? "#dcfce7" : liveStatus === "partial" ? "#fef3c7" : "#fee2e2";
  const statusLabel  = liveStatus === "paid" ? "FULLY PAID" : liveStatus === "partial" ? "PARTIALLY PAID" : "UNPAID";
  const statusBanner = liveStatus === "paid"
    ? "Payment Complete · Thank You"
    : liveStatus === "partial"
      ? "Partial Payment · Balance Outstanding"
      : "Payment Pending";
  const docTitle   = isPaid ? "Payment Receipt" : "Billing Invoice";
  const statusIcon = isPaid ? "✓" : liveStatus === "partial" ? "◐" : "!";
  const stampText  = isPaid ? "PAID" : liveStatus === "partial" ? "PARTIAL" : "UNPAID";
  const grandLabel = balanceAmt > 0 ? "Balance Due" : "Total Paid";
  const grandValue = balanceAmt > 0 ? balanceAmt : totalAfterDiscounts;
  const grandColor = balanceAmt > 0 ? scFg : "#15803d";
  const ftrNoteTitle = isPaid ? "Thank You" : "A Note for Parents";
  const ftrNote = isPaid
    ? "We gratefully acknowledge your payment in full. This receipt confirms your account’s billing are settled for the period."
    : "Kindly settle the outstanding balance before the due date to avoid disruption to your account’s learning.";

  // ── Logo ──────────────────────────────────────────────────────────────────
  const initials = schoolName.split(" ").map(w => w[0] || "").join("").slice(0, 3).toUpperCase();
  const logoHtml = schoolLogo
    ? `<img src="${schoolLogo}" alt="${initials}" style="width:58px;height:58px;border-radius:12px;object-fit:contain;background:rgba(255,255,255,.95);padding:5px;flex-shrink:0"/>`
    : `<div style="width:58px;height:58px;border-radius:12px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.28);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:15px;letter-spacing:1px;flex-shrink:0">${initials}</div>`;

  // ── QR placeholder ────────────────────────────────────────────────────────
  const qrSvg = _qrSvg(62, "#0a2458");

  // ── Helpers ───────────────────────────────────────────────────────────────
  const fmt    = n => "₦" + Math.round(+n || 0).toLocaleString("en-NG");
  const fmtDue = d => { try { return new Date(d).toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric" }); } catch { return d; } };
  const fmtDT  = d => { try { return new Date(d).toLocaleString("en-NG", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }); } catch { return d; } };

  // ── Row templates ─────────────────────────────────────────────────────────
  const itemRows = items.map((i, k) => `
  <div class="tbl-row${k % 2 ? " even" : ""}">
    <div class="i-name">${i.name}</div>
    <div class="i-type"><span class="i-badge ${i.is_optional ? "b-opt" : "b-req"}">${i.is_optional ? "Optional" : "Required"}</span></div>
    <div class="i-amt">${fmt(+i.amount)}</div>
  </div>`).join("");

  const discountRows = discounts.map(d => `
  <div class="t-row">
    <span class="t-lbl" style="color:#15803d">Discount: ${d.label}${d.discount_type === "percent" ? ` (${d.value}%)` : ""}</span>
    <span class="t-val" style="color:#15803d">− ${fmt(+d.amount)}</span>
  </div>`).join("");

  const totalAfterRow = discounts.length > 0
    ? `<div class="t-row t-sep"><span class="t-lbl" style="font-weight:700">Total After Discounts</span><span class="t-val" style="font-weight:700">${fmt(totalAfterDiscounts)}</span></div>`
    : "";

  const amtPaidRow = amountPaid > 0
    ? `<div class="t-row"><span class="t-lbl">Amount Paid</span><span class="t-val" style="color:#15803d">− ${fmt(amountPaid)}</span></div>`
    : "";

  const pmtRows = activePmts.map((p, k) => {
    const method = p.payment_method === "paystack" ? "Paystack · Online" : "Bank Transfer · UBA";
    const ref    = p.bank_reference || p.paystack_reference || "—";
    const dt     = p.created_at || p.payment_date;
    return `<div class="pmt-row${k ? " pmt-sep" : ""}">
      <div>
        <div class="pmt-method">${method}</div>
        <div class="pmt-ref">Ref ${ref} · ${dt ? fmtDT(dt) : "—"}</div>
      </div>
      <div class="pmt-amt">${fmt(p.amount)}</div>
    </div>`;
  }).join("");

  const billingPeriodSub = balanceAmt > 0
    ? (bill.due_date ? `<div class="ig-due">Due ${fmtDue(bill.due_date)}</div>` : "")
    : `<div class="ig-sub">Settled in full</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${pdfName(name, isReceipt ? "RCPT" : "INV", billNo.replace(/^JD-(BILL|RCPT)-/, ""))}</title>
<script>document.title=${JSON.stringify(_fn)}</script>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  ${isNativePlatform ? ".print-bar{display:none!important}" : ""}
  html,body{font-family:"Segoe UI",system-ui,-apple-system,sans-serif;
            background:#e8edf4;color:#1a202c;font-variant-numeric:tabular-nums}
  .a4{width:210mm;height:297mm;margin:0 auto;background:#fff;
      box-shadow:0 8px 32px rgba(0,0,0,.18);display:flex;flex-direction:column;overflow:hidden}

  /* ── Header ── */
  .hdr{background:linear-gradient(120deg,#0a2458 0%,#1347a0 60%,#1d5fd4 100%);
       padding:26px 44px 22px;display:flex;justify-content:space-between;
       align-items:flex-start;flex-shrink:0}
  .hdr-left{display:flex;gap:16px;align-items:center}
  .school-name{font-size:19px;font-weight:800;color:#fff;letter-spacing:.2px}
  .school-tag{font-size:9.5px;color:rgba(255,255,255,.6);letter-spacing:2px;
              text-transform:uppercase;margin-top:2px}
  .doc-badge{margin-top:9px;display:inline-block;background:#111827;border-radius:5px;
             padding:4px 12px;font-size:12px;font-weight:800;color:#fff;letter-spacing:.4px}
  .hdr-right{text-align:right;padding-top:3px}
  .doc-no-lbl{font-size:9.5px;color:rgba(255,255,255,.55);letter-spacing:1px;text-transform:uppercase}
  .doc-no-val{font-size:14px;font-weight:800;color:#fff;margin-top:2px}
  .doc-date{font-size:10.5px;color:rgba(255,255,255,.6);margin-top:8px}

  /* ── Status band ── */
  .status-band{padding:15px 44px;display:flex;align-items:center;
               justify-content:space-between;flex-shrink:0}
  .status-left{display:flex;align-items:center;gap:14px}
  .status-pill{display:inline-flex;align-items:center;gap:9px;border-radius:999px;
               padding:10px 20px 10px 12px;font-size:15.5px;font-weight:900;
               letter-spacing:.8px;white-space:nowrap;color:#fff}
  .status-icon{width:22px;height:22px;border-radius:50%;background:rgba(255,255,255,.28);
               display:flex;align-items:center;justify-content:center;font-size:13px}
  .status-banner{font-size:12px;font-weight:600}
  .status-right{text-align:right}
  .status-amt-lbl{font-size:9.5px;font-weight:800;letter-spacing:1.2px;
                  text-transform:uppercase;opacity:.85}
  .status-amt-val{font-size:23px;font-weight:900;line-height:1.05;margin-top:1px}

  /* ── Body ── */
  .body{padding:22px 44px 0;flex:1;display:flex;flex-direction:column;gap:16px;min-height:0}
  .lbl{font-size:9px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;
       color:#94a3b8;margin-bottom:4px}

  /* Info grid */
  .info-grid{display:grid;grid-template-columns:1fr 1fr;
             border:1px solid #e2e8f0;border-radius:9px;overflow:hidden;flex-shrink:0}
  .ig-cell{padding:13px 16px;background:#f8fafc}
  .ig-cell+.ig-cell{border-left:1px solid #e2e8f0}
  .ig-name{font-size:15px;font-weight:800;color:#0f172a}
  .ig-sub{font-size:11.5px;color:#64748b;margin-top:2px}
  .ig-due{font-size:11.5px;color:#b91c1c;font-weight:700;margin-top:2px}

  /* Items table */
  .tbl{border:1px solid #e2e8f0;border-radius:9px;overflow:hidden;flex-shrink:0}
  .tbl-head{display:grid;grid-template-columns:1fr 96px 130px;
            background:#f1f5f9;padding:9px 16px}
  .th{font-size:9px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:#94a3b8}
  .th-c{text-align:center}
  .th-r{text-align:right}
  .tbl-row{display:grid;grid-template-columns:1fr 96px 130px;
           padding:11px 16px;border-top:1px solid #f1f5f9;align-items:center}
  .tbl-row.even{background:#fafbfd}
  .i-name{font-size:13px;font-weight:600}
  .i-type{text-align:center}
  .i-badge{font-size:9.5px;font-weight:700;padding:2px 9px;border-radius:20px;display:inline-block}
  .b-req{background:#fff0eb;color:#c2410c}
  .b-opt{background:#f3e8ff;color:#7c3aed}
  .i-amt{font-size:13px;font-weight:700;text-align:right}

  /* Totals */
  .totals{background:#f8fafc;border:1px solid #e2e8f0;border-radius:9px;
          padding:12px 18px;flex-shrink:0}
  .t-row{display:flex;justify-content:space-between;padding:4px 0;
         font-size:12.5px;white-space:nowrap}
  .t-sep{border-top:1px solid #e2e8f0;margin-top:4px;padding-top:6px}
  .t-lbl{color:#64748b}
  .t-val{font-weight:600;color:#1a202c}
  .t-grand{display:flex;justify-content:space-between;align-items:center;
           border-top:2px solid #cbd5e1;margin-top:7px;padding-top:10px}

  /* Payments */
  .pmts{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:9px;
        padding:11px 16px;flex-shrink:0}
  .pmts-title{font-size:9px;font-weight:700;color:#15803d;letter-spacing:1px;
              text-transform:uppercase;margin-bottom:6px}
  .pmt-row{display:flex;justify-content:space-between;align-items:center;
           padding:6px 0;font-size:12px}
  .pmt-sep{border-top:1px solid #d1fae5}
  .pmt-method{font-weight:600}
  .pmt-ref{color:#64748b;font-size:10.5px}
  .pmt-amt{font-weight:800;color:#15803d;white-space:nowrap}

  /* Footer */
  .ftr{padding:16px 44px 18px;display:grid;grid-template-columns:1.2fr 1fr auto;
       gap:14px;align-items:stretch;border-top:1px dashed #e2e8f0;
       margin-top:auto;flex-shrink:0}
  .ftr-bank{background:linear-gradient(135deg,#F3F4F6,#E5E7EB);
            border:1px solid #D1D5DB;border-radius:9px;padding:11px 14px;
            display:flex;gap:12px;align-items:center}
  .ftr-note{background:#f8fafc;border:1px solid #e2e8f0;border-radius:9px;padding:11px 14px}
  .ftr-stamp{width:70px;display:flex;align-items:center;justify-content:center}
  .ftr-bar{background:#0a2458;color:rgba(255,255,255,.7);padding:8px 44px;
           display:flex;justify-content:space-between;font-size:9px;
           letter-spacing:.3px;flex-shrink:0}

  /* Print bar (web only) */
  .print-bar{text-align:center;padding:10px;background:#f1f5f9}
  .print-btn{background:linear-gradient(135deg,#0a2458,#1347a0);color:#fff;border:none;
             padding:9px 24px;border-radius:6px;font-size:14px;font-weight:700;
             cursor:pointer;margin-right:8px}

  @media print{
    @page{margin:0;size:A4 portrait}
    html,body{background:#fff!important;overflow:visible!important;height:auto!important;
              -webkit-print-color-adjust:exact;print-color-adjust:exact}
    .print-bar{display:none!important}
    .a4{width:100%!important;height:297mm!important;overflow:hidden!important;
        margin:0!important;box-shadow:none!important;border-radius:0!important;
        page-break-inside:avoid!important;break-inside:avoid!important}
  }
</style>
</head>
<body>
<div class="a4">

  <div class="hdr">
    <div class="hdr-left">
      ${logoHtml}
      <div>
        <div class="school-name">${schoolName}</div>
        <div class="school-tag">Built for Progress</div>
        <div class="doc-badge">${docTitle}</div>
      </div>
    </div>
    <div class="hdr-right">
      <div class="doc-no-lbl">Document No.</div>
      <div class="doc-no-val">${billNo}</div>
      <div class="doc-date">Issued ${today}</div>
    </div>
  </div>

  <div class="status-band" style="background:${scBg};border-top:1px solid ${scFg}22;border-bottom:2px solid ${scFg}">
    <div class="status-left">
      <div class="status-pill" style="background:${scFg};box-shadow:0 3px 10px ${scFg}55">
        <span class="status-icon">${statusIcon}</span>${statusLabel}
      </div>
      <span class="status-banner" style="color:${scFg}">${statusBanner}</span>
    </div>
    <div class="status-right">
      <div class="status-amt-lbl" style="color:${scFg}">${balanceAmt > 0 ? "Balance Due" : "Total Paid"}</div>
      <div class="status-amt-val" style="color:${scFg}">${fmt(grandValue)}</div>
    </div>
  </div>

  <div class="body">
    <div class="info-grid">
      <div class="ig-cell">
        <div class="lbl">Billed To</div>
        <div class="ig-name">${name}</div>
        <div class="ig-sub">ID: ${studentId}${className ? "  ·  " + className : ""}</div>
      </div>
      <div class="ig-cell">
        <div class="lbl">Billing Period</div>
        <div class="ig-name">${bill.term} · ${bill.academic_year}</div>
        ${billingPeriodSub}
      </div>
    </div>

    <div class="tbl">
      <div class="tbl-head">
        <div class="th">Description</div>
        <div class="th th-c">Type</div>
        <div class="th th-r">Amount</div>
      </div>
      ${itemRows}
    </div>

    <div class="totals">
      <div class="t-row">
        <span class="t-lbl">Subtotal (${items.length} item${items.length !== 1 ? "s" : ""})</span>
        <span class="t-val">${fmt(subtotal)}</span>
      </div>
      ${discountRows}
      ${totalAfterRow}
      ${amtPaidRow}
      <div class="t-grand">
        <span style="font-size:15px;font-weight:900;color:#0a2458">${grandLabel}</span>
        <span style="font-size:22px;font-weight:900;color:${grandColor}">${fmt(grandValue)}</span>
      </div>
    </div>

    ${showPayments ? `<div class="pmts"><div class="pmts-title">✓ Payment History</div>${pmtRows}</div>` : ""}
  </div>

  <div class="ftr">
    <div class="ftr-bank">
      <div style="background:#fff;border-radius:6px;padding:4px;align-self:center;flex-shrink:0">${qrSvg}</div>
      <div>
        <div class="lbl" style="color:#1d4ed8">${isPaid ? "Scan to Verify" : "Scan to Pay"}</div>
        <div style="font-size:11.5px;font-weight:700;color:#1e3a8a">United Bank of Africa</div>
        <div style="font-size:11.5px;color:#1e3a8a">Acct 1021639196</div>
        <div style="font-size:10px;color:#3b82f6;margin-top:2px">Use Member ID as reference</div>
      </div>
    </div>
    <div class="ftr-note">
      <div class="lbl">${ftrNoteTitle}</div>
      <div style="font-size:11px;color:#475569;line-height:1.55">${ftrNote}</div>
    </div>
    <div class="ftr-stamp">
      <div style="width:64px;height:64px;border-radius:50%;border:2.5px solid ${isPaid ? "#15803d" : scFg};color:${isPaid ? "#15803d" : scFg};display:flex;flex-direction:column;align-items:center;justify-content:center;transform:rotate(-9deg)">
        <span style="font-size:18px;line-height:1">${isPaid ? "✓" : "◷"}</span>
        <span style="font-size:8px;font-weight:900;letter-spacing:.5px;margin-top:2px">${stampText}</span>
      </div>
    </div>
  </div>

  <div class="ftr-bar">
    <span>${schoolName}  ·  Finance Office: Mon–Fri, 8am–4pm</span>
    <span>Ref ${billNo} · Generated ${today}</span>
  </div>

</div>
<div class="print-bar">
  <button class="print-btn" onclick="window.print()">🖨️ Print / Save as PDF</button>
  <button onclick="window.close()" style="background:#e2e8f0;border:none;padding:9px 18px;border-radius:6px;cursor:pointer;font-size:13.5px;color:#475569">Close</button>
</div>
<script>
(function(){
  var A4_PX=297*(96/25.4);
  function fit(){
    var el=document.querySelector('.a4');
    if(!el)return;
    el.style.transform='';
    el.style.transformOrigin='';
    var h=el.scrollHeight;
    if(h>A4_PX+2){
      var s=A4_PX/h;
      el.style.transformOrigin='top center';
      el.style.transform='scale('+s.toFixed(6)+')';
      el.style.marginBottom=Math.ceil((s-1)*h)+'px';
    }
  }
  if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',fit);}
  else{fit();}
  window.addEventListener('beforeprint',fit);
  window.addEventListener('afterprint',function(){
    var el=document.querySelector('.a4');
    if(el){el.style.transform='';el.style.transformOrigin='';el.style.marginBottom='';}
  });
})();
</script>
</body></html>`;
}

/** Deterministic QR-like placeholder SVG. Replace with a real QR in future. */
function _qrSvg(size, fg) {
  const N = 21, pad = 1, total = N + pad * 2;
  const on = (r, c) => {
    const finder = (R, C) => (R < 7 && C < 7) || (R < 7 && C >= N - 7) || (R >= N - 7 && C < 7);
    if (finder(r, c)) {
      const lr = r >= N - 7 ? r - (N - 7) : r;
      const lc = c >= N - 7 ? c - (N - 7) : c;
      return lr === 0 || lr === 6 || lc === 0 || lc === 6 || (lr >= 2 && lr <= 4 && lc >= 2 && lc <= 4);
    }
    const v = (r * 73856093) ^ (c * 19349663) ^ ((r + c) * 83492791);
    return (v % 7) < 3;
  };
  const rects = [];
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++)
      if (on(r, c)) rects.push(`<rect x="${c + pad}" y="${r + pad}" width="1" height="1" fill="${fg}"/>`);
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${total} ${total}" style="display:block" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="#fff"/>${rects.join("")}</svg>`;
}
