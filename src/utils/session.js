/**
 * Session & school-selection persistence helpers.
 *
 * localStorage  → retains user profile across tab/browser restarts
 * sessionStorage → "alive" flag cleared when the tab/PWA/app closes,
 *                  forcing a fresh login next session
 */

const SESSION_KEY   = "rgs_portal_user";
const SESSION_ALIVE = "rgs_session_active";
const SCHOOL_KEY    = "rgs_selected_school";

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

// ── School selection (multi-tenant) ───────────────────────────────────────
export function saveSelectedSchool(school) {
  try { localStorage.setItem(SCHOOL_KEY, JSON.stringify(school)); } catch {}
}

export function loadSelectedSchool() {
  try {
    const s = localStorage.getItem(SCHOOL_KEY);
    return s ? JSON.parse(s) : null;
  } catch { return null; }
}

export function clearSelectedSchool() {
  try { localStorage.removeItem(SCHOOL_KEY); } catch {}
}
