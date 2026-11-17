import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { searchNavigation, isNavGroupCollapsed } from "../src/config/navigation-search.mjs";

const nav = Object.freeze([
  { id: "jd-chat", label: "JD Assistant" },
  { id: "g-people", group: "People & Recruitment" },
  { id: "members", label: "Team directory", gid: "g-people" },
  { id: "hiring", label: "Vacancies", gid: "g-people" },
  { id: "g-finance", group: "Finance" },
  { id: "payment-tracker", label: "Payment Tracker", gid: "g-finance" },
  { id: "g-empty", group: "Empty group" },
].map(Object.freeze));
const ids = (entries) => entries.map((entry) => entry.id);

test("blank query preserves existing order and identity", () => {
  assert.equal(searchNavigation(nav), nav);
  assert.equal(searchNavigation(nav, "   "), nav);
});
test("case-insensitive label search preserves the matching group", () => {
  assert.deepEqual(ids(searchNavigation(nav, "  PAYment  ")), ["g-finance", "payment-tracker"]);
});
test("department search finds only its supplied children", () => {
  assert.deepEqual(ids(searchNavigation(nav, "recruitment")), ["g-people", "members", "hiring"]);
});
test("all search words must match label plus department", () => {
  assert.deepEqual(ids(searchNavigation(nav, "finance tracker")), ["g-finance", "payment-tracker"]);
  assert.deepEqual(searchNavigation(nav, "finance vacancies"), []);
});
test("ungrouped JD Assistant remains searchable", () => {
  assert.deepEqual(ids(searchNavigation(nav, "assistant")), ["jd-chat"]);
});
test("search never restores routes excluded by permission filtering", () => {
  const allowed = nav.filter((entry) => !["hiring", "g-finance", "payment-tracker"].includes(entry.id));
  assert.deepEqual(searchNavigation(allowed, "payment"), []);
  assert.deepEqual(ids(searchNavigation(allowed, "recruitment")), ["g-people", "members"]);
});
test("role-visible children can be searched when their group header is absent", () => {
  assert.deepEqual(ids(searchNavigation([{ id: "members", label: "Team", gid: "hidden-group" }], "team")), ["members"]);
});
test("empty group headers are not search results", () => {
  assert.deepEqual(searchNavigation(nav, "empty"), []);
});
test("custom labels are searched as presented without rewriting routes", () => {
  const custom = [{ id: "g-people", group: "Talent" }, { id: "hiring", label: "Candidates", gid: "g-people" }];
  assert.deepEqual(ids(searchNavigation(custom, "candidates")), ["g-people", "hiring"]);
  assert.deepEqual(searchNavigation(custom, "team"), []);
});
test("search treats punctuation literally rather than as a regex", () => {
  assert.deepEqual(searchNavigation(nav, ".*"), []);
});
test("search and icon-rail expand groups without mutating collapse preferences", () => {
  const collapsed = new Set(["g-people"]);
  assert.equal(isNavGroupCollapsed("g-people", collapsed, "", true), true);
  assert.equal(isNavGroupCollapsed("g-people", collapsed, "team", true), false);
  assert.equal(isNavGroupCollapsed("g-people", collapsed, "", false), false);
  assert.equal(isNavGroupCollapsed("g-finance", collapsed, "", true), false);
  assert.deepEqual([...collapsed], ["g-people"]);
});

// Wiring guards are distinct from mounted React/browser acceptance tests.
const shell = readFileSync(new URL("../src/AppDemo.jsx", import.meta.url), "utf8");
test("shell searches authorised NAV, not the raw catalogue; header is independent", () => {
  assert.match(shell, /visibleNavigation = searchNavigation\(NAV,navigationQuery\)/);
  assert.doesNotMatch(shell, /searchNavigation\(ALL_NAV/);
  assert.match(shell, /\{visibleNavigation\.map/);
  assert.match(shell, /NAV\.find\(n=>n\.id===page\)/);
});
test("navigation retains accessible search, active page and expansion hooks", () => {
  assert.match(shell, /aria-label="Search workspace navigation"/);
  assert.match(shell, /aria-current=\{active\?"page":undefined\}/);
  assert.match(shell, /aria-expanded=\{!collapsed\}/);
  assert.match(shell, /aria-controls="workspace-navigation"/);
});
test("mobile closed drawer is inert, scroll is bounded, binding has lifecycle cleanup", () => {
  assert.match(shell, /inert=\{isMobile&&!sideOpen \? "" : undefined\}/);
  assert.match(shell, /minHeight:0,padding:"8px 6px",overflowY:"auto"/);
  assert.match(shell, /return bindMobileNavigation\(sidebarRef\.current/);
  assert.match(shell, /\[isMobile,sideOpen,user\?\.id,user\?\.role,selectedSchool\?\.id\]/);
  assert.match(shell, /useState\("jd-chat"\)/);
});
test("shell has no legacy demo tenant, sandbox banner or shared credentials", () => {
  assert.doesNotMatch(shell, /STAGING SANDBOX|safe to break|admin password: "sandbox"|DEMO WORKSPACE|SCHOOL_SLUGS|\?school=/);
});
