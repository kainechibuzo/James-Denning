/**
 * Platform utilities — Capacitor detection, file sharing, script loading,
 * safe async wrappers.  No React or theme dependencies.
 */

/** Returns true when running inside the Capacitor Android/iOS native app. */
export const isNative = () => !!(window.Capacitor?.isNativePlatform?.());

/**
 * Download a file on web, or invoke the native share sheet on mobile.
 * @param {string}       filename  e.g. "report.csv"
 * @param {string|Blob}  content
 * @param {string}       mimeType  e.g. "text/csv"
 */
export async function shareOrDownload(filename, content, mimeType = "text/plain") {
  if (isNative()) {
    try {
      const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
      const file = new File([blob], filename, { type: mimeType });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: filename });
        return;
      }
    } catch (e) {
      if (e.name === "AbortError") return; // user cancelled
      console.warn("[JD] share failed, falling back to download", e);
    }
  }
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); document.body.removeChild(a); }, 10000);
}

/** Dynamically load a remote script once (idempotent). */
export function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement("script");
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

/**
 * Safe async wrapper — always returns { data, error } shape.
 * Prevents uncaught promise rejections from propagating.
 */
export async function safe(fn) {
  try {
    const result = await fn();
    if (result && typeof result === "object" && "error" in result) return result;
    return { data: result, error: null };
  } catch (err) {
    console.warn("[JD safe]", err?.message || err);
    return { data: null, error: err };
  }
}

/**
 * Retry a Supabase query once on network failure.
 * Returns { data, error } — same shape as `safe()`.
 */
export async function safeRetry(fn, retries = 1) {
  let last;
  for (let i = 0; i <= retries; i++) {
    last = await safe(fn);
    if (!last.error) return last;
    if (i < retries) await new Promise(r => setTimeout(r, 800));
  }
  return last;
}

/** Auto-incrementing unique ID (for React list keys, etc.) */
let _id = 1000;
export const uid = () => ++_id;

/**
 * Generate a random single-device session token.
 * Stored in DB and localStorage; mismatch → auto-logout on next poll.
 */
export const genSessionToken = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
