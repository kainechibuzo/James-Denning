/**
 * PDF Capture Service
 *
 * Converts HTML strings to PDF via html2canvas + jsPDF, with full support
 * for mobile (iOS Safari foreignObjectRendering), cross-origin images,
 * A4 sizing, and multi-page output.
 *
 * Exports:
 *   pdfName(…parts)                     → clean filename string
 *   htmlToPdfBase64(html, opts)         → base64 PDF string
 *   openHtmlDoc(html, { title, showPDF }) → open in window / in-app viewer
 *   downloadPDF(html, filename, opts)   → download PDF file
 *   shareFilePDF(blob, filename, …)    → Web Share API overlay
 */

import { loadScript, shareOrDownload, isNative } from "../../utils/platform.js";

// ── Filename builder ─────────────────────────────────────────────────────
/**
 * Build a clean PDF filename.
 * e.g. pdfName("Emeka Okafor","RCPT","00042") → "EMEKA_OKAFOR_RCPT_00042.pdf"
 */
export function pdfName(...parts) {
  return parts
    .filter(Boolean)
    .map(p => String(p).toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, ""))
    .filter(Boolean)
    .join("_") + ".pdf";
}

// ── html2canvas + jsPDF capture ──────────────────────────────────────────
/**
 * Convert an HTML string to a base64-encoded PDF.
 *
 * @param {string} htmlString   Full HTML document string
 * @param {object} opts
 *   scale       {number}  html2canvas DPR (default 3 — high quality)
 *   quality     {number}  unused (reserved)
 *   usePt       {boolean} pt units (legacy; use for point-precise report cards)
 *   waitMs      {number}  settle wait after fonts/images load (default 700ms)
 *   autoHeight  {boolean} capture full scrollHeight (for report cards)
 *   jpeg        {boolean} JPEG output (faster encode; default false = PNG)
 */
export async function htmlToPdfBase64(htmlString, { scale = 3, quality = 1.0, usePt = false, waitMs = 700, autoHeight = false, jpeg = false } = {}) {
  await Promise.all([
    !window.html2canvas && loadScript("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"),
    !window.jspdf       && loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"),
  ].filter(Boolean));

  const PW_PT = 595.28, PH_PT = 841.89;
  const isModernRc = /<body[^>]*\brc-modern\b/i.test(htmlString);
  const ifrW = isModernRc ? 794 : (autoHeight ? 571 : (usePt ? 595 : 794));
  const ifrH = autoHeight ? (isModernRc ? 1123 : 900) : (usePt ? 842 : 1123);

  // ── Pre-process HTML ───────────────────────────────────────────────────
  let captureHtml = htmlString;

  // 0. Inline remote images as base64 (iOS SVG foreignObject blocks cross-origin src)
  try {
    const urlsToInline = new Set();
    const srcRe = /\bsrc=["'](https?:\/\/[^"']+)["']/gi;
    let m;
    while ((m = srcRe.exec(captureHtml)) !== null) urlsToInline.add(m[1]);
    if (urlsToInline.size > 0) {
      const inlineMap = {};
      await Promise.all(Array.from(urlsToInline).map(async url => {
        try {
          const resp = await fetch(url, { mode:"cors", credentials:"omit" });
          if (!resp.ok) return;
          const blob = await resp.blob();
          const dataUrl = await new Promise((res, rej) => {
            const fr = new FileReader();
            fr.onload = () => res(fr.result); fr.onerror = rej;
            fr.readAsDataURL(blob);
          });
          inlineMap[url] = dataUrl;
        } catch (_) {}
      }));
      captureHtml = captureHtml.replace(/\bsrc=["'](https?:\/\/[^"']+)["']/gi, (match, url) => {
        if (inlineMap[url]) { const q = match[4]; return `src=${q}${inlineMap[url]}${q}`; }
        return match;
      });
    }
  } catch (_) {}

  // 1. Fix mobile viewport
  captureHtml = captureHtml.replace(
    /<meta[^>]+name=["']viewport["'][^>]*\/?>/i,
    `<meta name="viewport" content="width=${ifrW},initial-scale=1.0,maximum-scale=1.0"/>`
  );

  // 2. Strip scaleCards() IIFE (reads window.innerWidth; breaks mobile capture)
  captureHtml = captureHtml.replace(/<script\b[^>]*>[\s\S]*?scaleCards[\s\S]*?<\/script>/gi, "");

  // 3. Inject PDF-capture override CSS
  const pdfOverrideCss = `<style id="__pdf_capture__">
    html,body{padding:0!important;margin:0!important;
             width:${ifrW}px!important;min-width:${ifrW}px!important;max-width:${ifrW}px!important;
             overflow:visible!important;}
    .report-card{zoom:1!important;transform:none!important;
                 min-height:0!important;height:auto!important;
                 margin:0!important;border:none!important;
                 border-radius:0!important;box-shadow:none!important;}
    body.rc-modern .report-card{min-height:0!important;height:auto!important;}
    .a4{box-shadow:none!important;margin:0!important;width:100%!important;}
    .no-print{display:none!important;}
  </style>`;
  captureHtml = captureHtml.includes("</head>")
    ? captureHtml.replace("</head>", pdfOverrideCss + "</head>")
    : pdfOverrideCss + captureHtml;

  return new Promise((resolve, reject) => {
    const iframe = document.createElement("iframe");
    iframe.style.cssText = `position:fixed;left:-9999px;top:0;width:${ifrW}px;height:${ifrH}px;border:none;opacity:0;pointer-events:none;z-index:-1;`;
    document.body.appendChild(iframe);
    const cleanup = () => { try { document.body.removeChild(iframe); } catch {} };

    iframe.onload = async () => {
      try {
        const cdoc  = iframe.contentDocument;
        const body  = cdoc?.body;
        const html  = cdoc?.documentElement;
        if (!body || !html) { cleanup(); reject(new Error("iframe body not accessible")); return; }

        html.style.width = html.style.minWidth = html.style.maxWidth = `${ifrW}px`;
        body.style.width = body.style.minWidth = body.style.maxWidth = `${ifrW}px`;

        // Wait for fonts
        try { await cdoc.fonts?.ready; } catch (_) {}

        // Inline images inside iframe (cross-origin safety for html2canvas)
        try {
          const imgs = Array.from(cdoc.images || []);
          await Promise.all(imgs.map(async img => {
            if (!img.complete || img.naturalWidth === 0) {
              await new Promise(res => {
                img.addEventListener("load", res, { once:true });
                img.addEventListener("error", res, { once:true });
                setTimeout(res, 3000);
              });
            }
            const src = img.getAttribute("src") || "";
            if (!src || src.startsWith("data:")) return;
            try {
              const resp = await fetch(src, { mode:"cors", credentials:"omit" });
              if (!resp.ok) return;
              const blob = await resp.blob();
              const dataUrl = await new Promise((res, rej) => {
                const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej;
                fr.readAsDataURL(blob);
              });
              img.src = dataUrl;
              if (!img.complete || img.naturalWidth === 0) {
                await new Promise(res => {
                  img.addEventListener("load", res, { once:true });
                  img.addEventListener("error", res, { once:true });
                  setTimeout(res, 2000);
                });
              }
            } catch (_) {}
          }));
        } catch (_) {}

        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
        const effectiveWait = isIOS ? Math.max(waitMs, 1500) : waitMs;
        await new Promise(r => setTimeout(r, effectiveWait));

        void body.offsetHeight; void html.offsetHeight;

        let scrollH, captureTarget = body, captureW = ifrW;
        if (usePt || autoHeight) {
          const card = cdoc.querySelector(".report-card");
          if (card) {
            if (isModernRc && autoHeight) {
              card.style.transform = "none"; card.style.zoom = "1";
              card.style.minHeight = "0"; card.style.height = "auto";
              card.style.margin = "0"; card.style.width = ifrW + "px"; card.style.maxWidth = ifrW + "px";
              card.style.boxShadow = "none"; card.style.borderRadius = "0"; card.style.border = "none";
              void card.offsetHeight;
            }
            const rect = card.getBoundingClientRect();
            captureTarget = card;
            captureW = Math.ceil(rect.width) || ifrW;
            scrollH = Math.ceil(rect.height);
            if (!scrollH || scrollH < 100) scrollH = card.scrollHeight || ifrH;
          } else {
            scrollH = body.scrollHeight || ifrH;
          }
        } else {
          scrollH = ifrH;
        }

        const canvas = await window.html2canvas(captureTarget, {
          scale: scale,
          useCORS: true, allowTaint: true,
          backgroundColor: "#ffffff",
          width: captureW, height: scrollH,
          windowWidth: captureW, windowHeight: scrollH,
          logging: false,
          foreignObjectRendering: isIOS,
          imageTimeout: 15000,
        });

        const { jsPDF } = window.jspdf;
        const imgType = jpeg ? "JPEG" : "PNG";
        const imgData = jpeg ? canvas.toDataURL("image/jpeg", 0.92) : canvas.toDataURL("image/png");

        if (usePt) {
          const doc = new jsPDF({ orientation:"portrait", unit:"pt", format:[PW_PT, PH_PT], compress:jpeg });
          const ptPerCanvasPx = PW_PT / canvas.width;
          const totalHeightPt = canvas.height * ptPerCanvasPx;
          const totalPages = Math.ceil(totalHeightPt / PH_PT);
          for (let page = 0; page < totalPages; page++) {
            if (page > 0) doc.addPage();
            doc.addImage(imgData, imgType, 0, -(page * PH_PT), PW_PT, totalHeightPt, "", "FAST");
          }
          cleanup();
          resolve(doc.output("datauristring").split(",")[1]);
        } else {
          const doc = new jsPDF({ orientation:"portrait", unit:"mm", format:"a4", compress:jpeg });
          const pdfW = doc.internal.pageSize.getWidth();
          const pdfH = doc.internal.pageSize.getHeight();
          const mmPerCanvasPx = pdfW / canvas.width;
          const totalHeightMm = canvas.height * mmPerCanvasPx;
          const drawW = pdfW;
          const drawH = autoHeight ? pdfH : Math.min(totalHeightMm, pdfH);
          doc.addImage(imgData, imgType, 0, 0, drawW, drawH, "", "FAST");
          cleanup();
          resolve(doc.output("datauristring").split(",")[1]);
        }
      } catch (err) { cleanup(); reject(err); }
    };
    iframe.onerror = e => { cleanup(); reject(e); };
    iframe.srcdoc = captureHtml;
  });
}

// ── Open HTML document as PDF ────────────────────────────────────────────
/**
 * Open an HTML document as a PDF.
 * - Web/desktop : opens in a new window and triggers print dialog
 * - Mobile/native: pushes into the in-app PDFViewer (pass showPDF from ctx)
 */
export function openHtmlDoc(html, { title = "Document", showPDF = null } = {}) {
  const onMobile = /Mobi|Android|iPhone|iPad|webOS/i.test(navigator.userAgent);
  if (showPDF && (isNative() || onMobile)) { showPDF(html, title); return; }
  const w = window.open("", "_blank");
  if (!w) { alert("Please allow pop-ups to generate the PDF."); return; }
  w.document.write(html);
  w.document.close();
  try { w.document.title = title; } catch (_) {}
  try { w.history.replaceState({}, "", "/" + encodeURIComponent(title)); } catch (_) {}
}

// ── Download PDF ─────────────────────────────────────────────────────────
/**
 * Generate a PDF from HTML and download it.
 * `usePtOrOpts`: boolean (usePt) or options object forwarded to htmlToPdfBase64.
 */
export async function downloadPDF(html, filename, usePtOrOpts = false) {
  const opts = typeof usePtOrOpts === "object" ? usePtOrOpts : { usePt: usePtOrOpts };
  try {
    const base64 = await htmlToPdfBase64(html, opts);
    const bytes  = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const blob   = new Blob([bytes], { type: "application/pdf" });
    shareOrDownload(filename.endsWith(".pdf") ? filename : filename + ".pdf", blob, "application/pdf");
  } catch (err) {
    console.error("[downloadPDF]", err);
    alert("PDF generation failed: " + err.message);
  }
}

// ── Share PDF overlay ────────────────────────────────────────────────────
/**
 * Show a bottom-sheet overlay with Share / Download / Cancel buttons.
 * navigator.share() MUST be called from a fresh user gesture — this overlay
 * provides that by attaching the share call directly to the button click.
 */
export function shareFilePDF(blob, filename, title, text) {
  const objectUrl = URL.createObjectURL(blob);
  const cleanup = (overlay) => { document.body.removeChild(overlay); URL.revokeObjectURL(objectUrl); };

  const overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:99999;display:flex;align-items:flex-end;justify-content:center;padding-bottom:32px";

  const sheet = document.createElement("div");
  sheet.style.cssText = "background:#fff;border-radius:16px;padding:24px 20px;width:min(360px,90vw);box-shadow:0 8px 40px rgba(0,0,0,.25);display:flex;flex-direction:column;gap:10px";

  const heading = document.createElement("div");
  heading.style.cssText = "font-weight:800;font-size:15px;color:#1a2b4a;margin-bottom:4px";
  heading.textContent = title || filename;

  const sub = document.createElement("div");
  sub.style.cssText = "font-size:12px;color:#888;margin-bottom:6px;word-break:break-all";
  sub.textContent = filename;

  const mkBtn = (label, bg, fg = "#fff") => {
    const b = document.createElement("button");
    b.textContent = label;
    b.style.cssText = `background:${bg};color:${fg};border:none;border-radius:9px;padding:12px;font-size:14px;font-weight:700;cursor:pointer;width:100%`;
    return b;
  };

  const shareBtn = mkBtn("Share PDF", "#1a56db");
  shareBtn.onclick = async () => {
    const file = new window.File([blob], filename, { type:"application/pdf" });
    if (navigator.canShare && navigator.canShare({ files:[file] })) {
      try { await navigator.share({ files:[file], title, text }); cleanup(overlay); return; }
      catch (e) { if (e.name === "AbortError") { cleanup(overlay); return; } }
    }
    if (navigator.share) {
      try { await navigator.share({ title, text:(text||title)+"\n"+window.location.origin }); cleanup(overlay); return; }
      catch (e) { if (e.name === "AbortError") { cleanup(overlay); return; } }
    }
    const a = document.createElement("a"); a.href = objectUrl; a.download = filename; a.click();
    setTimeout(() => cleanup(overlay), 1000);
  };

  const dlBtn = mkBtn("Download Instead", "#f0f4f8", "#1a2b4a");
  dlBtn.onclick = () => { const a = document.createElement("a"); a.href=objectUrl; a.download=filename; a.click(); setTimeout(() => cleanup(overlay), 1000); };

  const cancelBtn = mkBtn("Cancel", "transparent", "#888");
  cancelBtn.style.cssText += "border:1px solid #ddd";
  cancelBtn.onclick = () => cleanup(overlay);

  overlay.onclick = (e) => { if (e.target === overlay) cleanup(overlay); };
  sheet.append(heading, sub, shareBtn, dlBtn, cancelBtn);
  overlay.appendChild(sheet);
  document.body.appendChild(overlay);
}
