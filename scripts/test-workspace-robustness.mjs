// Robustness of the workspace shell when the backend is unavailable.
//
// Every check here mounts the real AppDemo tree (via scripts/fixtures/site-ui.jsx)
// with a client whose data calls reject the way a dropped connection, an expired
// token or a 502 from the edge function does. A rejected read must degrade to a
// default/empty state; it must never escape as an unhandled promise rejection,
// and it must never leave a page spinning forever behind a false "loading" state.
import test from "node:test";
import assert from "node:assert/strict";
import {resolve} from "node:path";
import {readFileSync} from "node:fs";
import {build} from "vite";
import {JSDOM} from "jsdom";

let cachedBundle;
async function bundleFor(clientFile) {
  if (cachedBundle?.key === clientFile) return cachedBundle.js;
  const bundle = await build({
    configFile: false,
    logLevel: "error",
    define: {"process.env.NODE_ENV": '"production"'},
    plugins: [{
      name: "robustness-fixture",
      enforce: "pre",
      resolveId(id) { if (id.endsWith("supabaseClient.js")) return resolve(clientFile); },
    }],
    build: {
      write: false,
      minify: false,
      lib: {entry: resolve("scripts/fixtures/site-ui.jsx"), formats: ["es"]},
      rollupOptions: {output: {codeSplitting: false}},
    },
  });
  const js = (Array.isArray(bundle) ? bundle[0] : bundle).output.find(o => o.type === "chunk").code;
  cachedBundle = {key: clientFile, js};
  return js;
}

async function mountWith(clientFile, {settleMs = 2200} = {}) {
  const js = await bundleFor(clientFile);
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: "http://robustness.test/", pretendToBeVisual: true, runScripts: "outside-only",
  });
  const w = dom.window;
  if (!w.structuredClone) w.structuredClone = value => JSON.parse(JSON.stringify(value));

  const rejections = [];
  const onRejection = reason => rejections.push(reason);
  process.on("unhandledRejection", onRejection);

  const consoleErrors = [];
  const originalError = console.error;
  const originalWarn = console.warn;
  console.error = (...args) => consoleErrors.push(args.map(x => String(x?.stack || x)).join(" "));
  console.warn = () => {};
  w.console = console;

  w.eval([
    "localStorage.setItem('jd_session_user',JSON.stringify({id:'robust',_authUserId:'robust',role:'admin',name:'Robustness Check',email:'r@example.test',school_id:'ui-workspace'}))",
    "sessionStorage.setItem('jd_session_active','1')",
    "localStorage.setItem('jd_selected_org',JSON.stringify({id:'ui-workspace',name:'Reference workspace',plan:'free'}))",
    "localStorage.setItem('jd_tour_done_robust','1')",
  ].join(";"));

  let bootError = null;
  try { w.eval(js); } catch (error) { bootError = error; }
  await new Promise(r => setTimeout(r, settleMs));

  const restore = () => {
    console.error = originalError;
    console.warn = originalWarn;
    process.off("unhandledRejection", onRejection);
    try { w.close(); } catch {}
  };
  return {window: w, rejections, consoleErrors, bootError, restore};
}

const text = window => window.document.body.textContent.replace(/\s+/g, " ").trim();

test("a rejected settings read must not escape as an unhandled rejection", async () => {
  const app = await mountWith("scripts/fixtures/failing-client.mjs");
  try {
    assert.equal(app.bootError, null, "the shell must mount even when settings fail");
    assert.deepEqual(
      app.rejections.map(r => String(r?.message || r)),
      [],
      "a failed settings/permissions read must be handled, not left unhandled",
    );
    assert.ok(!text(app.window).includes("Something went wrong"), "the shell must not fall into its error boundary");
  } finally {
    app.restore();
  }
});

test("the shell still renders its workspace chrome when reads fail", async () => {
  const app = await mountWith("scripts/fixtures/failing-client.mjs");
  try {
    assert.ok(app.window.document.querySelector("#workspace-navigation"), "the workspace navigation must still render");
    assert.ok(text(app.window).includes("JD Assistant"), "the primary destination must still be reachable");
  } finally {
    app.restore();
  }
});

test("a failed page load must not leave the content area blank or spinning forever", async () => {
  const app = await mountWith("scripts/fixtures/failing-client.mjs", {settleMs: 3000});
  try {
    const main = app.window.document.querySelector("main");
    assert.ok(main, "a main region must be present");
    const visible = main.textContent.replace(/\s+/g, " ").trim();
    assert.ok(visible.length > 0, "a failed read must surface an empty/error state, not an empty page");
    assert.ok(!/Loading/i.test(visible) || /retry|try again|could not|unavailable/i.test(visible),
      `a page whose read failed must not stay in its loading state (saw: ${visible.slice(0, 120)})`);
  } finally {
    app.restore();
  }
});

test("a delete that the backend rejects must not report success", async () => {
  // email-logs deletes local rows and shows "Log deleted" without checking the
  // result, so a rejected delete silently tells the operator the log is gone.
  const source = readFileSync("src/pages/email-logs.jsx", "utf8");
  assert.match(source, /const \{error\} = await db\.deleteEmailLog\(|const \{ ?error ?\} ?= ?await db\.deleteEmailLog\(/,
    "deleteOne must inspect the delete result before confirming it to the operator");
  assert.match(source, /const \{error: ?bulkError\} = await db\.deleteEmailLogs\(|const \{ ?error ?\} ?= ?await db\.deleteEmailLogs\(/,
    "deleteSelected must inspect the bulk delete result before confirming it");
});

test("reactivity: no uncaught React prop warnings from the shell chrome", async () => {
  const app = await mountWith("scripts/fixtures/ok-client.mjs");
  try {
    const propWarnings = app.consoleErrors.filter(line => line.includes("does not recognize the"));
    assert.deepEqual(propWarnings, [], "the shell must not pass unknown props to DOM elements");
  } finally {
    app.restore();
  }
});

// ── Page-level: a failed read must end the spinner, not hang it ──────────────
async function mountPage(route, {client = "scripts/fixtures/failing-client.mjs", settleMs = 1800} = {}) {
  const js = await bundleFor(client);
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: `http://robustness.test/?page=${route}`, pretendToBeVisual: true, runScripts: "outside-only",
  });
  const w = dom.window;
  if (!w.structuredClone) w.structuredClone = value => JSON.parse(JSON.stringify(value));
  const rejections = [];
  const onRejection = reason => rejections.push(String(reason?.message || reason));
  process.on("unhandledRejection", onRejection);
  const originalError = console.error;
  const originalWarn = console.warn;
  console.error = () => {};
  console.warn = () => {};
  w.console = console;
  w.eval([
    "localStorage.setItem('jd_session_user',JSON.stringify({id:'robust',_authUserId:'robust',role:'admin',name:'Robustness Check',email:'r@example.test',school_id:'ui-workspace'}))",
    "sessionStorage.setItem('jd_session_active','1')",
    "localStorage.setItem('jd_selected_org',JSON.stringify({id:'ui-workspace',name:'Reference workspace',plan:'free'}))",
    "localStorage.setItem('jd_tour_done_robust','1')",
  ].join(";"));
  w.eval(js);
  await new Promise(r => setTimeout(r, settleMs));
  return {
    window: w, rejections,
    restore() {
      console.error = originalError;
      console.warn = originalWarn;
      process.off("unhandledRejection", onRejection);
      try { w.close(); } catch {}
    },
  };
}

for (const route of ["settings", "permissions", "audit-log", "billing"]) {
  test(`the ${route} page ends its loading state when the backend fails`, async () => {
    const page = await mountPage(route);
    try {
      const main = page.window.document.querySelector("main");
      const visible = (main?.textContent || "").replace(/\s+/g, " ").trim();
      assert.ok(visible.length > 0, `${route} must render something after a failed read`);
      assert.ok(!/^Loading/i.test(visible), `${route} must not stop at a bare loading state`);
      assert.deepEqual(page.rejections, [], `${route} must handle its failed reads`);
    } finally {
      page.restore();
    }
  });
}
