import test, { after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { transformWithOxc } from "vite";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import { PGlite } from "@electric-sql/pglite";

import {
  EXECUTION_MODES,
  PROJECT_FILTERS,
  CHAT_FILTERS,
  filterProjects,
  filterConversations,
  buildProjectInspectorGroups,
} from "../src/shell/shell-state.mjs";
import { recordChatSubmission } from "../supabase/functions/_shared/jd-chat-submission.mjs";

mkdirSync("node_modules/.cache", { recursive: true });
const temp = mkdtempSync(`${process.cwd()}/node_modules/.cache/lovable-shell-`);
after(() => rmSync(temp, { recursive: true, force: true }));

const staged = new Set();
async function stageModule(absPath) {
  if (staged.has(absPath)) return;
  staged.add(absPath);
  const rel = absPath.slice(process.cwd().length + 1);
  const mapExt = (p) => (p.endsWith(".json") ? p + ".mjs" : p.replace(/\.jsx$/, ".mjs"));
  const outPath = resolve(temp, mapExt(rel));
  mkdirSync(dirname(outPath), { recursive: true });
  if (absPath.endsWith("supabaseClient.js")) {
    writeFileSync(
      outPath,
      "export const supabase = { functions: { invoke: async () => ({ data: {}, error: null }) } };\n"
    );
    return;
  }
  if (absPath.endsWith(".json")) {
    writeFileSync(outPath, `export default ${readFileSync(absPath, "utf8")};`);
    return;
  }
  let source = readFileSync(absPath, "utf8");
  source = source.replace(/^\s*import\s+['"][^'"]+\.css['"];?\s*$/gm, "");
  source = source.replace(/\s+with\s*\{\s*type\s*:\s*['"]json['"]\s*\}/g, "");
  const matches = [...source.matchAll(/from\s+['"](\.[^'"]+)['"]/g)];
  for (const [, spec] of matches) {
    let target = resolve(dirname(absPath), spec);
    if (!existsSync(target) && existsSync(target + ".jsx")) target += ".jsx";
    if (!existsSync(target) && existsSync(target + ".mjs")) target += ".mjs";
    if (!existsSync(target) && existsSync(target + ".js")) target += ".js";
    if (!existsSync(target) && existsSync(target + ".json")) target += ".json";
    if (existsSync(target) && target.startsWith(process.cwd())) {
      await stageModule(target);
      const targetRel = mapExt(target.slice(process.cwd().length + 1));
      const targetOut = resolve(temp, targetRel);
      source = source.replaceAll(`'${spec}'`, `'${pathToFileURL(targetOut).href}'`);
      source = source.replaceAll(`"${spec}"`, `"${pathToFileURL(targetOut).href}"`);
    }
  }
  if (absPath.endsWith(".jsx")) {
    const transformed = await transformWithOxc(source, absPath, { jsx: { runtime: "classic" } });
    writeFileSync(outPath, transformed.code);
  } else {
    writeFileSync(outPath, source);
  }
}

// 1. Pure state & RBAC tests
test("shell-state filters projects by category, pinned/archived status, and search query", () => {
  assert.deepEqual(EXECUTION_MODES.map((m) => m.id), ["ask", "plan", "execute"]);
  assert.ok(PROJECT_FILTERS.length >= 5);
  assert.ok(CHAT_FILTERS.length >= 4);

  const sample = [
    { id: "p1", name: "Campus Portal", description: "Student build", kind: "software", status: "active", pinned: true },
    { id: "p2", name: "Q3 Hiring Drive", description: "Ops launch", kind: "initiative", status: "published", pinned: false },
    { id: "p3", name: "Legacy Migration", description: "Old project", kind: "software", status: "archived", pinned: true },
  ];

  assert.deepEqual(filterProjects(sample, { filter: "all", query: "" }).map((p) => p.id), ["p1", "p2"]);
  assert.deepEqual(filterProjects(sample, { filter: "pinned", query: "" }).map((p) => p.id), ["p1"]);
  assert.deepEqual(filterProjects(sample, { filter: "initiative", query: "" }).map((p) => p.id), ["p2"]);
  assert.deepEqual(filterProjects(sample, { filter: "software", query: "" }).map((p) => p.id), ["p1"]);
  assert.deepEqual(filterProjects(sample, { filter: "archived", query: "" }).map((p) => p.id), ["p3"]);
  assert.deepEqual(filterProjects(sample, { filter: "all", query: "hiring" }).map((p) => p.id), ["p2"]);
});

test("shell-state filters conversations across all, active, scheduled, and archived", () => {
  const chats = [
    { id: "c1", title: "Draft policy", status: "active", kind: "chat", project_id: "p1" },
    { id: "c2", title: "Weekly sync", status: "scheduled", kind: "scheduled", schedule: "Mondays" },
    { id: "c3", title: "Old thread", status: "archived", kind: "chat" },
  ];

  assert.deepEqual(filterConversations(chats, { filter: "all", query: "" }).map((c) => c.id), ["c1", "c2", "c3"]);
  assert.deepEqual(filterConversations(chats, { filter: "active", query: "" }).map((c) => c.id), ["c1", "c2"]);
  assert.deepEqual(filterConversations(chats, { filter: "archived", query: "" }).map((c) => c.id), ["c3"]);
  assert.deepEqual(filterConversations(chats, { filter: "all", query: "policy" }).map((c) => c.id), ["c1"]);
});

test("buildProjectInspectorGroups enforces RBAC across roles and owner overrides", () => {
  const viewerGroups = buildProjectInspectorGroups({ role: "viewer", canAccess: () => false });
  const viewerIds = viewerGroups.flatMap((g) => g.items.map((i) => i.id));
  assert.ok(viewerIds.includes("preview"));
  assert.ok(!viewerIds.includes("admin-dashboard"));
  assert.ok(!viewerIds.includes("jd-operations"));
  assert.ok(!viewerIds.includes("billing"));
  assert.ok(!viewerIds.includes("settings"));
  assert.ok(!viewerIds.includes("audit-log"));

  const ownerBlocked = buildProjectInspectorGroups({ role: "owner", canAccess: () => false });
  assert.deepEqual(ownerBlocked.flatMap((g) => g.items.map((i) => i.id)), ["preview"]);

  const adminGroups = buildProjectInspectorGroups({
    role: "admin",
    canAccess: () => true,
    canOpenOperations: () => true,
  });
  const adminIds = adminGroups.flatMap((g) => g.items.map((i) => i.id));
  for (const required of ["preview", "admin-dashboard", "jd-operations", "connectors", "billing", "settings", "audit-log"]) {
    assert.ok(adminIds.includes(required), `Admin missing ${required}`);
  }

  const ownerWithChat = buildProjectInspectorGroups({
    role: "owner",
    canAccess: (id) => id === "jd-chat",
    canOpenOperations: () => false,
  });
  const ownerIds = ownerWithChat.flatMap((g) => g.items.map((i) => i.id));
  assert.ok(ownerIds.includes("runs"));
  assert.ok(!ownerIds.includes("admin-dashboard"));
  assert.ok(!ownerIds.includes("jd-operations"));
});

// 2. PGlite database migration, rollback, and submission tests
test("jd_projects migration enforces constraints, tenant isolation, execution modes, and clean rollback", async () => {
  const db = new PGlite();
  try {
    const baseSql = readFileSync("supabase/migrations/20261111085143_jd_autonomous_automation.sql", "utf8");
    const ddl = (name) => {
      const match = baseSql.match(new RegExp(`create table if not exists public\\.${name} \\([\\s\\S]*?\\n\\);`, "i"));
      assert.ok(match, `Missing DDL for ${name}`);
      return match[0];
    };
    const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    const orgA = uuid(1);
    const orgB = uuid(2);
    const adminA = uuid(10);
    const adminB = uuid(20);

    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create table public.schools(id uuid primary key);
      create table public.profiles(id uuid primary key, school_id uuid, role text);
      create table public.jd_operational_tasks(
        id uuid primary key default gen_random_uuid(),
        school_id uuid not null references public.schools(id) on delete cascade,
        title text not null,
        status text not null default 'open',
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      create table public.saas_projects(
        id uuid primary key default gen_random_uuid(),
        school_id uuid not null references public.schools(id) on delete cascade,
        name text not null
      );
    `);
    for (const table of ["jd_conversations", "jd_messages", "jd_automation_runs", "jd_audit_events"]) {
      await db.exec(ddl(table));
    }
    await db.exec("alter table public.jd_messages add column created_by_agent boolean default false; alter table public.jd_automation_runs add column created_by_agent boolean default false;");
    await db.exec(readFileSync("supabase/migrations/20261121084947_jd_conversation_interactions.sql", "utf8"));
    await db.exec(readFileSync("supabase/migrations/20261128120000_jd_projects_and_modes.sql", "utf8"));

    await db.query("insert into schools values ($1), ($2)", [orgA, orgB]);
    await db.query("insert into auth.users values ($1), ($2)", [adminA, adminB]);
    await db.query("insert into profiles values ($1, $2, 'admin'), ($3, $4, 'admin')", [adminA, orgA, adminB, orgB]);

    const projA = (await db.query(
      "insert into jd_projects (school_id, name, kind, created_by) values ($1, 'Onboarding Ops', 'initiative', $2) returning *",
      [orgA, adminA]
    )).rows[0];
    const projB = (await db.query(
      "insert into jd_projects (school_id, name, kind, created_by) values ($1, 'Other Org App', 'software', $2) returning *",
      [orgB, adminB]
    )).rows[0];

    await assert.rejects(
      db.query("insert into jd_projects (school_id, name, kind, created_by) values ($1, 'Bad', 'unknown', $2)", [orgA, adminA])
    );

    // Service-only RPC grants check
    for (const role of ["anon", "authenticated"]) {
      assert.equal(
        (await db.query("select has_function_privilege($1, 'public.jd_set_chat_execution_mode(uuid,uuid,text)', 'EXECUTE') ok", [role])).rows[0].ok,
        false
      );
      assert.equal(
        (await db.query("select has_function_privilege($1, 'public.jd_link_conversation_project(uuid,uuid,uuid)', 'EXECUTE') ok", [role])).rows[0].ok,
        false
      );
    }

    // Exercise recordChatSubmission with executionMode="ask" and projectId
    const submitted = await recordChatSubmission({
      payload: {
        message: "Audit this initiative",
        idempotencyKey: "proj-chat-1",
        executionMode: "ask",
        projectId: projA.id,
      },
      profile: { school_id: orgA, role: "admin" },
      actorId: adminA,
      needsApproval: () => false,
      admin: {
        from() { throw new Error("unexpected table read"); },
        async rpc(name, p) {
          if (name === "jd_submit_chat_request") {
            const r = (await db.query(
              "select public.jd_submit_chat_request($1,$2,$3,$4,$5,$6,$7,$8) result",
              [p.p_school_id, p.p_actor_id, p.p_conversation_id, p.p_request_id, p.p_message, p.p_risk, p.p_interaction, p.p_expected_response]
            )).rows[0].result;
            return { data: r };
          }
          if (name === "jd_set_chat_execution_mode") {
            const r = (await db.query(
              "select public.jd_set_chat_execution_mode($1,$2,$3) result",
              [p.p_run_id, p.p_actor_id, p.p_mode]
            )).rows[0].result;
            return { data: r };
          }
          if (name === "jd_link_conversation_project") {
            const r = (await db.query(
              "select public.jd_link_conversation_project($1,$2,$3) result",
              [p.p_conversation_id, p.p_project_id, p.p_actor_id]
            )).rows[0].result;
            return { data: r };
          }
          throw new Error(`Unexpected RPC ${name}`);
        },
      },
    });

    assert.ok(submitted.conversationId);
    assert.equal(submitted.executionMode, "ask");
    assert.equal(submitted.projectId, projA.id);

    const convRow = (await db.query("select project_id from jd_conversations where id = $1", [submitted.conversationId])).rows[0];
    const runRow = (await db.query("select result_json->>'execution_mode' as execution_mode from jd_automation_runs where id = $1", [submitted.run.id])).rows[0];
    assert.equal(runRow.execution_mode, "ask");
    assert.equal(convRow.project_id, projA.id);

    // Cross-tenant project link & invalid mode rejected
    await assert.rejects(
      db.query("select public.jd_link_conversation_project($1,$2,$3)", [submitted.conversationId, projB.id, adminA]),
      /Project not found/
    );
    await assert.rejects(
      db.query("select public.jd_set_chat_execution_mode($1,$2,$3)", [submitted.run.id, adminA, "admin_override"]),
      /Invalid execution mode/
    );

    // Rollback cleanly removes added schema without errors
    await db.exec(readFileSync("supabase/rollback/20261128120000_jd_projects_and_modes.rollback.sql", "utf8"));
    const tableCheck = (await db.query("select to_regclass('public.jd_projects') t")).rows[0].t;
    assert.equal(tableCheck, null);
  } finally {
    await db.close();
  }
});

// 3. Mounted React UI tests in JSDOM
await stageModule(resolve("src/shell/ProjectsHub.jsx"));
await stageModule(resolve("src/shell/ChatsHub.jsx"));
await stageModule(resolve("src/shell/WorkspaceSwitcherSheet.jsx"));
await stageModule(resolve("src/shell/AccountProfileSheet.jsx"));
await stageModule(resolve("src/shell/ProjectWorkspace.jsx"));

const { ProjectsHub, NewProjectModal } = await import(pathToFileURL(resolve(temp, "src/shell/ProjectsHub.mjs")).href);
const { ChatsHub } = await import(pathToFileURL(resolve(temp, "src/shell/ChatsHub.mjs")).href);
const { WorkspaceSwitcherSheet } = await import(pathToFileURL(resolve(temp, "src/shell/WorkspaceSwitcherSheet.mjs")).href);
const { AccountProfileSheet } = await import(pathToFileURL(resolve(temp, "src/shell/AccountProfileSheet.mjs")).href);
const { ProjectInspectorSheet, ProjectPreviewPane, ProjectBottomBar } = await import(pathToFileURL(resolve(temp, "src/shell/ProjectWorkspace.mjs")).href);

function setupDom() {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "https://james-denning.test/" });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Node = dom.window.Node;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const container = dom.window.document.getElementById("root");
  const root = createRoot(container);
  return {
    dom,
    container,
    root,
    cleanup() {
      act(() => root.unmount());
      dom.window.close();
    },
  };
}

test("ProjectsHub and NewProjectModal render dual project types and trigger creation", async () => {
  const env = setupDom();
  try {
    let opened = null;
    let created = null;
    const projects = [
      { id: "p1", name: "Vendor Onboarding", kind: "initiative", status: "active", pinned: true, description: "Ops rollout" },
      { id: "p2", name: "Portal v2", kind: "software", status: "published", pinned: false, description: "Customer app" },
    ];
    await act(async () => {
      env.root.render(
        React.createElement(
          React.Fragment,
          null,
          React.createElement(ProjectsHub, {
            projects,
            canCreate: true,
            onOpenProject: (p) => { opened = p.id; },
            onNewProject: () => {},
          }),
          React.createElement(NewProjectModal, {
            open: true,
            onClose: () => {},
            onCreate: (payload) => { created = payload; },
          })
        )
      );
    });

    assert.match(env.container.textContent, /Vendor Onboarding/);
    assert.match(env.container.textContent, /Portal v2/);
    const cardBtn = [...env.container.querySelectorAll(".jd-project-main")].find((el) => el.textContent.includes("Portal v2"));
    await act(async () => { Simulate.click(cardBtn); });
    assert.equal(opened, "p2");

    const swBtn = [...env.container.querySelectorAll("button")].find((el) => el.textContent.includes("Software Build"));
    await act(async () => { Simulate.click(swBtn); });
    const nameInput = env.container.querySelector("form input[required]");
    await act(async () => {
      nameInput.value = "Partner Portal";
      Simulate.change(nameInput);
    });
    const form = env.container.querySelector("form");
    await act(async () => { Simulate.submit(form); });
    assert.equal(created?.name, "Partner Portal");
    assert.equal(created?.kind, "software");
  } finally {
    env.cleanup();
  }
});

test("ChatsHub, WorkspaceSwitcherSheet, and AccountProfileSheet expose Lovable shell controls", async () => {
  const env = setupDom();
  try {
    let switchedOrg = false;
    let openedConnectors = false;
    let selectedChat = null;
    await act(async () => {
      env.root.render(
        React.createElement(
          React.Fragment,
          null,
          React.createElement(ChatsHub, {
            conversations: [{ id: "c1", title: "Q4 Budget Review", status: "active", project_id: "p1" }],
            scheduled: [],
            projects: [{ id: "p1", name: "Finance Ops" }],
            filter: "all",
            onFilterChange: () => {},
            onRefresh: () => {},
            onOpenChat: (c) => { selectedChat = c.id; },
            onNewChat: () => {},
          }),
          React.createElement(WorkspaceSwitcherSheet, {
            open: true,
            organisation: "Acme Holdings",
            role: "admin",
            usageSummary: { total_runs: 12, total_amount_minor: 450, currency: "USD" },
            onClose: () => {},
            onSwitchOrganisation: () => { switchedOrg = true; },
          }),
          React.createElement(AccountProfileSheet, {
            open: true,
            user: { name: "Ada Lovelace", email: "ada@acme.test" },
            role: "admin",
            dark: false,
            canOpenConnectors: true,
            canOpenBilling: true,
            canOpenSettings: true,
            onOpenConnectors: () => { openedConnectors = true; },
            onClose: () => {},
          })
        )
      );
    });

    assert.match(env.container.textContent, /Q4 Budget Review/);
    assert.match(env.container.textContent, /Finance Ops/);
    assert.match(env.container.textContent, /Acme Holdings/);
    assert.match(env.container.textContent, /Ada Lovelace/);

    const chatBtn = [...env.container.querySelectorAll(".jd-project-main")].find((el) => el.textContent.includes("Q4 Budget Review"));
    await act(async () => { Simulate.click(chatBtn); });
    assert.equal(selectedChat, "c1");

    const switchBtn = [...env.container.querySelectorAll("button")].find((el) => el.textContent.includes("Switch organisation"));
    await act(async () => { Simulate.click(switchBtn); });
    assert.equal(switchedOrg, true);

    const connBtn = [...env.container.querySelectorAll("button")].find((el) => el.textContent.includes("Connectors"));
    await act(async () => { Simulate.click(connBtn); });
    assert.equal(openedConnectors, true);
  } finally {
    env.cleanup();
  }
});

test("ProjectWorkspace renders dual Preview modes, Inspector Sheet, and Chat/Preview bottom bar", async () => {
  const env = setupDom();
  try {
    let switchedPane = null;
    const initiativeProject = { id: "p1", name: "Ops Launch", kind: "initiative", status: "active", description: "Launch plan" };
    await act(async () => {
      env.root.render(
        React.createElement(
          React.Fragment,
          null,
          React.createElement(ProjectPreviewPane, {
            project: initiativeProject,
            detail: {
              project: initiativeProject,
              tasks: [{ id: "t1", title: "Approve budget", status: "completed" }, { id: "t2", title: "Notify teams", status: "open" }],
              conversations: [{ id: "c1", title: "Kickoff", execution_mode: "plan" }],
              runs: [],
            },
            role: "admin",
            organizationName: "Acme",
            onAskInChat: () => {},
          }),
          React.createElement(ProjectInspectorSheet, {
            open: true,
            project: initiativeProject,
            role: "admin",
            canAccess: () => true,
            onClose: () => {},
            onSelectDestination: () => {},
          }),
          React.createElement(ProjectBottomBar, {
            activePane: "split",
            project: initiativeProject,
            canSplit: true,
            onChangePane: (pane) => { switchedPane = pane; },
            onPublish: () => {},
          })
        )
      );
    });

    assert.match(env.container.textContent, /Business Initiative/);
    assert.match(env.container.textContent, /Approve budget/);
    assert.match(env.container.textContent, /Operational Tasks \(1\/2 complete\)/);
    assert.match(env.container.textContent, /Live Preview &amp; Brief|Live Preview & Brief/);

    const splitBtn = [...env.container.querySelectorAll(".jd-pane-switch button")].find((el) => el.textContent.includes("Split"));
    assert.ok(splitBtn, "Desktop split tab renders when canSplit is true");
    const previewBtn = [...env.container.querySelectorAll(".jd-pane-switch button")].find((el) => el.textContent.includes("Preview"));
    await act(async () => { Simulate.click(previewBtn); });
    assert.equal(switchedPane, "preview");
  } finally {
    env.cleanup();
  }
});
