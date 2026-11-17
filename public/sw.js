/**
 * JAMES-DENNING — Service Worker
 *
 * Strategy:
 *  - App shell (HTML): network-first, fallback to cache, fallback to offline page
 *  - Static assets (JS/CSS/images/fonts): cache-first, background revalidate
 *  - Supabase API & external calls: network-only (never cache auth/data)
 *
 * This SW only runs on the web (Vercel). Capacitor Android uses its own
 * asset bundling — the SW is not registered when isNativePlatform() is true.
 */

const CACHE_VERSION = "jd-v5"; // bump to purge stale caches after major releases
const STATIC_CACHE  = `${CACHE_VERSION}-static`;
const SHELL_CACHE   = `${CACHE_VERSION}-shell`;

// App shell URLs to pre-cache on install
const SHELL_URLS = ["/", "/offline.html"];

// Origins / URL patterns to NEVER cache (always hit network)
const BYPASS_PATTERNS = [
  /supabase\.co/,        // Supabase API + Auth
  /paystack\.co/,        // Paystack payment API
  /js\.paystack\.co/,    // Paystack SDK
  /amazonaws\.com/,      // AWS SES
];

// ─── Install: pre-cache the app shell ────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())   // activate immediately
  );
});

// ─── Activate: clean up old caches ───────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== SHELL_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())  // take control of existing tabs
  );
});

// ─── Fetch: tiered strategy ───────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests from our own origin
  if (request.method !== "GET") return;

  // Never cache external APIs / auth endpoints
  if (BYPASS_PATTERNS.some((p) => p.test(request.url))) return;

  // Cross-origin requests (CDNs etc.) — pass through
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    // ── Navigation requests (page loads) — network-first ──────────────────
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache a fresh copy of the root HTML
          if (response.ok) {
            const clone = response.clone();
            caches.open(SHELL_CACHE).then((c) => c.put("/", clone));
          }
          return response;
        })
        .catch(() =>
          // Offline: serve cached index.html or the offline page
          caches.match("/").then((cached) => cached || caches.match("/offline.html"))
        )
    );
  } else {
    // ── Static assets (JS, CSS, images) — cache-first + background update ─
    // Hashed build assets under /assets/* are immutable — go network-first
    // to avoid the "stale HTML references missing hash" trap where the SPA
    // rewrite returns index.html for a JS URL (MIME error).
    const isHashedAsset = url.pathname.startsWith("/assets/");
    const looksLikeModule = /\.(js|mjs|css|map)$/i.test(url.pathname);

    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const tryNet = () => fetch(request).then((response) => {
          // Guard: if we asked for a JS/CSS module and got HTML back
          // (Vercel SPA fallback for a missing hashed file), don't cache it
          // and force the page to reload so the browser fetches fresh HTML.
          const ct = response.headers.get("content-type") || "";
          if (looksLikeModule && ct.includes("text/html")) {
            self.clients.matchAll().then((cs) =>
              cs.forEach((c) => c.postMessage({ type: "RELOAD_FOR_NEW_BUILD" }))
            );
            return response;
          }
          if (response.ok && !isHashedAsset) cache.put(request, response.clone());
          if (response.ok && isHashedAsset) cache.put(request, response.clone());
          return response;
        }).catch(() => null);

        if (isHashedAsset) {
          // Network-first for hashed assets so a stale cache can't pin us
          // to a build whose files no longer exist on the server.
          const net = await tryNet();
          if (net && net.ok) return net;
          const cached = await cache.match(request);
          return cached || net;
        }
        const cached = await cache.match(request);
        return cached || tryNet();
      })
    );
  }
});
