// Route <-> URL mapping for the workspace shell.
//
// The workspace is a single SPA entry, but links arrive from outside it: payment
// providers send the browser back after checkout, notification records carry a
// `link_page`, and operators bookmark a page. Those links must land on the page
// they name instead of dropping the visitor on the assistant.
import { WORKSPACE_NAVIGATION } from "./workspace-navigation.mjs";

// Query keys that identify a return trip we must complete before touching the URL.
export const RETURN_QUERY_KEYS = Object.freeze(["billing", "reference", "trxref"]);

const ROUTE_PATHS = Object.freeze({
  "admin-dashboard": "/admin",
});

const PAGE_BY_PATH = Object.freeze({
  "/admin": "admin-dashboard",
  "/billing": "billing",
  "/settings": "settings",
  "/audit-log": "audit-log",
  "/notifications": "notifications",
});

// Pages the shell can render that are not sidebar entries: the audit trail is
// reached from the admin dashboard shortcuts, and the second step of organisation
// registration is reached from the first. Both are still real, addressable pages.
const EXTRA_PAGES = Object.freeze(["audit-log", "org-create-details"]);

const KNOWN_PAGES = new Set([
  ...WORKSPACE_NAVIGATION.map(entry => entry.id),
  ...EXTRA_PAGES,
]);

export const DEFAULT_PAGE = "jd-chat";

export function isWorkspacePage(page) {
  return page === "jd-chat" || KNOWN_PAGES.has(page);
}

export function pathForPage(page) {
  return ROUTE_PATHS[page] || "/";
}

/**
 * Resolve the initial page from a URL.
 * Precedence: explicit `?page=` deep link, payment return, known path, default.
 */
export function pageFromLocation(location) {
  if (!location) return DEFAULT_PAGE;
  const path = location.pathname || "/";
  const params = new URLSearchParams(location.search || "");
  const requested = (params.get("page") || "").trim();
  if (requested && isWorkspacePage(requested)) return requested;
  // Payment providers return to the page that started the checkout. The query
  // string is kept intact: the billing page verifies it and then clears it.
  if (params.get("billing") === "paystack") return "billing";
  if (PAGE_BY_PATH[path]) return PAGE_BY_PATH[path];
  // Any other path is treated as the assistant so a stray link never dead-ends.
  return DEFAULT_PAGE;
}

/**
 * Should the shell rewrite the URL for this page?
 * While a payment verification query is still present, the URL is the input the
 * billing page needs; rewriting it to "/" would discard the reference.
 */
export function shouldSyncUrl(page, location) {
  if (!location) return false;
  const params = new URLSearchParams(location.search || "");
  if (params.get("billing") === "paystack") return false;
  return page !== "billing" || (location.search || "") === "";
}

/**
 * Clear a completed payment return from the address bar.
 * Called when the visitor cannot open billing at all, so the reference cannot be
 * verified by the page that would normally consume it; leaving it in the URL would
 * make it stick around forever, including across a later sign-in.
 */
export function clearPaymentReturn(location, history) {
  if (!location || !history) return false;
  const params = new URLSearchParams(location.search || "");
  if (params.get("billing") !== "paystack") return false;
  params.delete("billing"); params.delete("reference"); params.delete("trxref");
  const search = params.toString();
  history.replaceState({}, "", (location.pathname || "/") + (search ? `?${search}` : ""));
  return true;
}
