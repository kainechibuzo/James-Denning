/**
 * Session and workspace-selection persistence helpers.
 *
 * localStorage  → retains user profile across tab/browser restarts
 * sessionStorage → "alive" flag cleared when the tab/PWA/app closes,
 *                  forcing a fresh login next session
 */

const SESSION_KEY   = "jd_session_user";
const SESSION_ALIVE = "jd_session_active";
const ORG_KEY    = "jd_selected_org";

// ── User session ──────────────────────────────────────────────────────────
export function saveSession(user) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(user)); } catch {}
  try { sessionStorage.setItem(SESSION_ALIVE, "1"); } catch {}
}

export function loadSession() {
  try {
    if (!sessionStorage.getItem(SESSION_ALIVE)) return null; // tab closed → force re-login
    const s = localStorage.getItem(SESSION_KEY);
    return s ? JSON.parse(s) : null;
  } catch { return null; }
}

export function clearSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch {}
  try { sessionStorage.removeItem(SESSION_ALIVE); } catch {}
}

// ── Organization selection (multi-tenant) ───────────────────────────────────────
export function saveSelectedSchool(school) {
  try { localStorage.setItem(ORG_KEY, JSON.stringify(school)); } catch {}
}

export function loadSelectedSchool() {
  try {
    const s = localStorage.getItem(ORG_KEY);
    return s ? JSON.parse(s) : null;
  } catch { return null; }
}

export function clearSelectedSchool() {
  try { localStorage.removeItem(ORG_KEY); } catch {}
}
