import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join, resolve } from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(join(root, file), "utf8");
const app = read("src/App.jsx");
const landing = read("src/pages/public-landing.jsx");
const auth = read("src/pages/saas-entry.jsx");
const product = read("src/config/product.js");
const grading = read("src/pages/grading.jsx");
const reportCards = read("src/pages/reportcards.jsx");
const tour = read("src/AppDemo.jsx");

assert.match(app, /lazy\(\(\)\s*=>\s*import\(["']\.\/AppDemo\.jsx["']\)\)/, "Workspace must be lazy-loaded");
assert.match(app, /lazy\(\(\)\s*=>\s*import\(["']\.\/pages\/saas-entry\.jsx["']\)/, "Authentication must be lazy-loaded");
assert.match(app, /lazy\(\(\)\s*=>\s*import\(["']\.\/pages\/public-landing\.jsx["']\)/, "Landing page must be lazy-loaded");
assert.match(app, /<Suspense\s+fallback=/, "Lazy routes need a loading state");
assert.match(app, /class LazyRouteBoundary/, "Lazy routes need a recoverable error boundary");

// Multi-industry product identity and mobile regression guards.
assert.match(product, /defaultIndustry:\s*"business"/, "General business is the default workspace type");
assert.match(product, /defaultModule:\s*"core"/, "Education must be enabled by default");
assert.match(landing, /Meet JD, your AI-powered operations assistant/i, "Landing page must position JD as the AI operations assistant");
assert.match(landing, /Revenue/, "Landing preview must show business metrics");
assert.match(grading, /repeat\(auto-fit,minmax\(min\(100%,320px\),1fr\)\)/, "CAE layout must collapse on mobile");
assert.match(reportCards, /jd-report-preview-overlay/, "Report preview needs responsive layout hooks");
assert.match(tour, /if\(isMobile \|\| left < 12\)/, "Tour tooltip must stay inside mobile viewport");
assert.doesNotMatch(auth, /james-denning-james-projects-57651351\.vercel\.app/, "Auth must not redirect to stale deployment URL");

// Verify every marketing-page button has an action and every in-page link resolves.
const buttonTags = [...landing.matchAll(/<button\b[^>]*>/g)].map((m) => m[0]);
assert.ok(buttonTags.length > 0, "Landing page should expose interactive buttons");
for (const tag of buttonTags) assert.match(tag, /\bonClick=/, `Button has no action: ${tag.slice(0, 100)}`);
const linkTags = [...landing.matchAll(/<a\b[^>]*>/g)].map((m) => m[0]);
for (const tag of linkTags) assert.match(tag, /\bhref=/, `Anchor has no destination: ${tag.slice(0, 100)}`);
const ids = new Set([...landing.matchAll(/\bid=["']([^"']+)["']/g)].map((m) => m[1]));
const anchors = [...landing.matchAll(/href=["']#([^"']+)["']/g)].map((m) => m[1]);
for (const anchor of anchors) {
  if (anchor === "signin") {
    assert.match(landing, /preventDefault\(\).*onSignIn/, "Sign-in anchor must invoke the sign-in action");
  } else {
    assert.ok(ids.has(anchor), `Landing link #${anchor} has no matching section`);
  }
}
assert.match(landing, /onGetStarted/, "Get-started actions must be wired");
assert.match(landing, /onSignIn/, "Sign-in action must be wired");

// Guard the auth flows and the app's hand-off into the authenticated workspace.
for (const method of ["signInWithPassword", "createSchoolSignup", "resetPasswordForEmail", "updateUser"]) {
  assert.ok(auth.includes(method), `Missing authentication flow: ${method}`);
}
assert.match(app, /onAuthenticated=\{onAuthenticated\}/, "Successful auth must hand off to the app");
assert.match(app, /authListener\.subscription\.unsubscribe\(\)/, "Auth listener must be cleaned up");

const dist = resolve(root, "dist");
assert.ok(existsSync(join(dist, "index.html")), "Production build must emit dist/index.html");
const html = readFileSync(join(dist, "index.html"), "utf8");
const entryMatch = html.match(/<script[^>]+src=["']([^"']+\.js)["']/);
assert.ok(entryMatch, "Built HTML must reference an entry JavaScript asset");
const entryPath = resolve(dist, entryMatch[1].replace(/^\//, ""));
assert.ok(existsSync(entryPath), "Entry JavaScript asset must exist");
const entry = readFileSync(entryPath);
const entryGzip = gzipSync(entry);
const maxEntryBytes = 900 * 1024;
const maxEntryGzipBytes = 260 * 1024;
assert.ok(entry.length <= maxEntryBytes, `Initial JS entry too large: ${Math.round(entry.length / 1024)} KB (budget 900 KB)`);
assert.ok(entryGzip.length <= maxEntryGzipBytes, `Initial gzipped JS entry too large: ${Math.round(entryGzip.length / 1024)} KB (budget 260 KB)`);

const jsAssets = readdirSync(join(dist, "assets")).filter((name) => name.endsWith(".js"));
assert.ok(jsAssets.length >= 4, `Expected route/vendor splitting; found only ${jsAssets.length} JS asset(s)`);
assert.ok(existsSync(join(dist, "manifest.json")), "PWA manifest must be included in the web build");
console.log(`Web verification passed: ${buttonTags.length} landing buttons, ${linkTags.length} links, ${jsAssets.length} JS chunks, entry ${Math.round(entry.length / 1024)} KB (${Math.round(entryGzip.length / 1024)} KB gzip).`);
