import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join, resolve } from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(join(root, file), "utf8");
const app = read("src/App.jsx");
const landing = read("src/pages/public-landing.jsx");
const auth = read("src/pages/saas-entry.jsx");
const profileMigration = read("supabase/migrations/20261118174815_profiles_authenticated_update_full_name.sql");
const product = read("src/config/product.js");
const tour = read("src/AppDemo.jsx");
const jdChat = read("src/chat/ChatHome.jsx");
const jdVisual = read("src/chat/JDVisualWorkspace.jsx");

assert.match(app, /lazy\(\(\)\s*=>\s*import\(["']\.\/AppDemo\.jsx["']\)\)/, "Workspace must be lazy-loaded");
assert.match(app, /lazy\(\(\)\s*=>\s*import\(["']\.\/pages\/saas-entry\.jsx["']\)/, "Authentication must be lazy-loaded");
assert.match(app, /lazy\(\(\)\s*=>\s*import\(["']\.\/pages\/public-landing\.jsx["']\)/, "Landing page must be lazy-loaded");
assert.match(app, /<Suspense\s+fallback=/, "Lazy routes need a loading state");
assert.match(jdChat, /function loadKatexAssets\(/, "KaTeX must load on demand from the chat math renderer");
assert.match(jdChat, /jd-katex-css[\s\S]*jd-katex-js/, "KaTeX CSS and JavaScript must be loaded only by the math renderer");
assert.match(app, /class LazyRouteBoundary/, "Lazy routes need a recoverable error boundary");

// Multi-industry product identity and mobile regression guards.
assert.match(product, /defaultIndustry:\s*"business"/, "General business is the default workspace type");
assert.match(product, /defaultModule:\s*"core"/, "The core module is the default");
assert.match(landing, /Meet James-Denning, your AI-powered operations assistant/i, "Landing page must use the approved reference identity and positioning");
assert.match(landing, /revenue, expenses and business performance/i, "Landing artwork must describe its business metrics accessibly");
for (const asset of ["dashboard-laptop.webp", "dashboard-laptop-front.webp", "jd-monogram.png", "jd-tile.png"]) {
  assert.ok(existsSync(join(root, "public/design", asset)), `Missing supplied reference artwork: ${asset}`);
  assert.ok(existsSync(join(root, "dist/design", asset)), `Reference artwork missing from build: ${asset}`);
}
assert.match(landing, /sample figures, not live workspace records/, "Illustrative marketing metrics must not claim live records");
assert.match(tour, /if\(isMobile \|\| left < 12\)/, "Tour tooltip must stay inside mobile viewport");
assert.match(auth, /james-denning-james-projects-57651351\.vercel\.app/, "Auth redirects must use the verified production deployment URL");
assert.doesNotMatch(auth, /rgs-portal-master\.vercel\.app/, "Auth must not redirect to the retired school-portal deployment URL");

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
assert.match(auth, /confirmPassword/, "Invitation and recovery password setup must require confirmation");
assert.match(auth, /password.length<10/, "Password setup must enforce the 10-character minimum");
assert.match(auth, /Create password & continue/, "Invitation activation must explicitly create a password before continuing");
assert.ok(tour.includes("supabase.auth.updateUser({password:pw})"), "Profile password changes must use Supabase Auth");
assert.ok(profileMigration.toLowerCase().includes("grant update (full_name) on table public.profiles to authenticated"), "Authenticated profile updates must be narrowly granted to the full_name column");
assert.match(app, /authListener\.subscription\.unsubscribe\(\)/, "Auth listener must be cleaned up");

// ── Responsive layout foundation guard ───────────────────────────────────────
// Regression guard for the "site is broken on mobile" class of bug.
//
// Components declare layout with inline styles (gridTemplateColumns:"1fr 1fr").
// Inline declarations outrank normal CSS, so responsiveness depends on the
// attribute selectors in src/styles/system.css. Those selectors were previously
// written against the AUTHORED value ("repeat(3,1fr)"), but React serialises an
// inline style through the CSSOM, which inserts a space after the colon and
// after each comma ("repeat(3, 1fr)"). The rules therefore never matched and
// every two-column page overflowed on a phone.
//
// These assertions fail the build if that mechanism is broken again.
const systemCss = read("src/styles/system.css");

assert.match(
  systemCss,
  /\[style\*="1fr 1fr"\]/,
  "system.css must collapse inline two-column grids on phones ([style*=\"1fr 1fr\"])",
);
assert.match(
  systemCss,
  /\[style\*="repeat\(3,"\]|[\s\S]*repeat\(3, 1fr\)/,
  "system.css must match React's serialised grid values (repeat(3, 1fr) keeps the space)",
);
assert.match(
  systemCss,
  /@media\(max-width:760px\)/,
  "system.css must define a phone breakpoint for layout collapse",
);
assert.match(
  systemCss,
  /\*\{min-width:0\}|\*\s*\{\s*min-width:\s*0/,
  "system.css must allow flex/grid children to shrink (min-width:0)",
);
// Guard against the specific trap: a selector that only matches the authored,
// space-free form of a repeat() value can never match a React-rendered style.
assert.doesNotMatch(
  systemCss,
  /\[style\*="grid-template-columns:repeat\(\d,1fr\)"\]/,
  'Selector matches only the authored value; React emits "repeat(3, 1fr)" with a space — match a value fragment instead',
);

// No literal JavaScript unicode escapes may survive into rendered JSX text or
// attributes: JSX attribute string literals do not process \uXXXX, so the
// placeholder literally displayed "Search name or email\u2026" on screen.
const jsxFiles = readdirSync(join(root, "src"), { recursive: true })
  .filter((f) => String(f).endsWith(".jsx"))
  .map((f) => join(root, "src", String(f)));
for (const file of jsxFiles) {
  const src = readFileSync(file, "utf8");
  const badAttr = src.match(/\s[a-zA-Z-]+="[^"]*\\u[0-9a-fA-F]{4}[^"]*"/);
  assert.ok(!badAttr, "Literal unicode escape in a JSX attribute will render as visible text: " + file + " -> " + String(badAttr?.[0] || "").slice(0, 80));
}

// JD structured visual workspace contract: all supported block renderers must
// exist and be wired to real assistant-message metadata, not fabricated state.
assert.match(jdChat, /JDVisualWorkspace/, "JD chat must mount the structured visual workspace renderer");
assert.match(jdChat, /content_json\?\.visual_workspace/, "JD chat must read persisted visual workspace metadata");
for (const blockType of ["checklist", "workflow", "question", "timeline", "departments", "evidence"]) {
  assert.ok(jdVisual.includes('"'+blockType+'"'), "Missing JD visual block renderer: " + blockType);
}
assert.match(jdVisual, /setChecked/, "Checklist interactions must be wired");
assert.match(jdVisual, /onAnswer/, "Decision choices must be wired back to JD chat");
assert.match(jdVisual, /list\(ui\?\.blocks,\s*12\)/, "Visual block count must be bounded");
assert.match(jdVisual, /list\(block\.items,\s*40\)/, "Checklist item count must be bounded");
assert.match(jdVisual, /React text|aria-label/, "Visual renderer must use accessible, non-HTML content rendering");

const dist = resolve(root, "dist");
assert.ok(existsSync(join(dist, "index.html")), "Production build must emit dist/index.html");
const html = readFileSync(join(dist, "index.html"), "utf8");
assert.doesNotMatch(html, /cdn\.jsdelivr\.net\/npm\/katex/, "The initial HTML must not load KaTeX for visitors who never open mathematical content");
// Ignore deferred third-party scripts (for example KaTeX). Only the local
// module entry is part of the initial application bundle and its size budget.
const scriptAttributes = [...html.matchAll(/<script\b([^>]*)>/g)].map((match) => match[1]);
const moduleScript = scriptAttributes.find((attributes) =>
  /\btype=["']module["']/.test(attributes) &&
  /\bsrc=["'][^"']+\.js["']/.test(attributes)
);
assert.ok(moduleScript, "Built HTML must reference a module JavaScript entry asset");
const entryMatch = moduleScript.match(/\bsrc=["']([^"']+\.js)["']/);
assert.ok(entryMatch, "Module entry must have a JavaScript source");
const entryPath = resolve(dist, entryMatch[1].replace(/^\//, ""));
assert.ok(existsSync(entryPath), "Entry JavaScript asset must exist");
const entry = readFileSync(entryPath);
const entryGzip = gzipSync(entry);
const maxEntryBytes = 900 * 1024;
const maxEntryGzipBytes = 260 * 1024;
assert.ok(entry.length <= maxEntryBytes, `Initial JS entry too large: ${Math.round(entry.length / 1024)} KB (budget 900 KB)`);
assert.ok(entryGzip.length <= maxEntryGzipBytes, `Initial gzipped JS entry too large: ${Math.round(entryGzip.length / 1024)} KB (budget 260 KB)`);

const jsAssets = readdirSync(join(dist, "assets")).filter((name) => name.endsWith(".js"));
const workspaceAsset = jsAssets.find((name) => name.startsWith("AppDemo-"));
assert.ok(workspaceAsset, "Authenticated workspace must remain a separately loaded route chunk");
const workspaceGzipBytes = gzipSync(readFileSync(join(dist, "assets", workspaceAsset))).length;
assert.ok(workspaceGzipBytes <= 120 * 1024, `Workspace route chunk too large: ${Math.round(workspaceGzipBytes / 1024)} KB gzip (budget 120 KB)`);
const spreadsheetAsset = jsAssets.find((name) => name.startsWith("spreadsheet-vendor-"));
if (spreadsheetAsset) {
  const spreadsheetGzipBytes = gzipSync(readFileSync(join(dist, "assets", spreadsheetAsset))).length;
  assert.ok(spreadsheetGzipBytes <= 300 * 1024, `Deferred spreadsheet importer too large: ${Math.round(spreadsheetGzipBytes / 1024)} KB gzip (budget 300 KB)`);
}
assert.ok(jsAssets.length >= 4, `Expected route/vendor splitting; found only ${jsAssets.length} JS asset(s)`);
assert.ok(existsSync(join(dist, "manifest.json")), "PWA manifest must be included in the web build");
console.log(`Web verification passed: ${buttonTags.length} landing buttons, ${linkTags.length} links, ${jsAssets.length} JS chunks, entry ${Math.round(entry.length / 1024)} KB (${Math.round(entryGzip.length / 1024)} KB gzip).`);
