// JSDOM interaction suite for StructuredResponse, InlineConnectorCard, and SpecialistSelectorCard.
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

mkdirSync("node_modules/.cache", { recursive: true });
const temp = mkdtempSync(`${process.cwd()}/node_modules/.cache/interactive-chat-ui-`);
after(() => rmSync(temp, { recursive: true, force: true }));

const staged = new Set();
async function stageModule(absPath) {
  if (staged.has(absPath)) return;
  staged.add(absPath);
  const rel = absPath.slice(process.cwd().length + 1);
  const mapExt = (p) => p.endsWith(".json") ? p + ".mjs" : p.replace(/\.jsx$/, ".mjs");
  const outPath = resolve(temp, mapExt(rel));
  mkdirSync(dirname(outPath), { recursive: true });
  if (absPath.endsWith(".json")) {
    writeFileSync(outPath, `export default ${readFileSync(absPath, "utf8")};`);
    return;
  }
  let source = readFileSync(absPath, "utf8");
  // Strip CSS imports and import attributes on converted JSON modules for JSDOM
  source = source.replace(/^\s*import\s+['"][^'"]+\.css['"];?\s*$/gm, "");
  source = source.replace(/\s+with\s*\{\s*type\s*:\s*['"]json['"]\s*\}/g, "");
  // Rewrite relative imports that point to .jsx or .json files
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

const srPath = resolve("src/chat/StructuredResponse.jsx");
const ssPath = resolve("src/chat/SpecialistSelectorCard.jsx");
await stageModule(srPath);
await stageModule(ssPath);

const { StructuredResponse } = await import(pathToFileURL(resolve(temp, "src/chat/StructuredResponse.mjs")).href);
const { SpecialistSelectorCard } = await import(pathToFileURL(resolve(temp, "src/chat/SpecialistSelectorCard.mjs")).href);

function setupDom() {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "https://jd.test/" });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.sessionStorage = dom.window.sessionStorage;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(document.querySelector("#root"));
  return {
    root,
    cleanup: async () => {
      await act(async () => root.unmount());
      dom.window.close();
      delete globalThis.window;
      delete globalThis.document;
      delete globalThis.sessionStorage;
      delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    },
  };
}

test("StructuredResponse renders tactile multi-choice cards, recommended pills, deliverables, and connector prompts", async () => {
  const { root, cleanup } = setupDom();
  const submitted = [];
  const connected = [];
  const response = {
    version: 1,
    blocks: [
      { id: "intro", type: "message", variant: "callout", content: "Welcome to JD planning." },
      {
        id: "team-pick",
        type: "choice",
        variant: "specialist_teams",
        question: "Which build approach fits?",
        subtitle: "Pick one option below.",
        multiple: false,
        options: [
          {
            label: "Full Product Launch",
            value: "full",
            recommended: true,
            subtitle: "4-agent team",
            rateLabel: "$4 / hour",
            highlights: ["Market research", "Architecture & QA"],
            estTime: "1.5–2.5 hrs",
            estCost: "$6–$10",
          },
          {
            label: "Lean MVP",
            value: "mvp",
            subtitle: "3-agent team",
            rateLabel: "$3 / hour",
          },
        ],
      },
      {
        id: "gh-prompt",
        type: "connector_prompt",
        connectorId: "github",
        reason: "Connect GitHub to read repository source.",
        capabilities: ["Read selected files", "Search code"],
      },
    ],
  };

  try {
    await act(async () => {
      root.render(
        React.createElement(StructuredResponse, {
          response,
          messageId: "msg-1",
          scope: "org:user",
          role: "owner",
          answers: [],
          streaming: false,
          disabled: false,
          renderMarkdown: (txt) => React.createElement("p", null, txt),
          onAnswer: async (payload, reqId) => {
            submitted.push({ payload, reqId });
            return true;
          },
          onConnectService: (entry) => connected.push(entry),
        }),
      );
    });

    const text = document.body.textContent;
    assert.match(text, /Welcome to JD planning\./);
    assert.match(text, /Full Product Launch/);
    assert.match(text, /Recommended/);
    assert.match(text, /\$4 \/ hour/);
    assert.match(text, /Market research/);
    assert.match(text, /Est\. time: 1\.5–2\.5 hrs/);
    assert.match(text, /Connect GitHub/);

    // Select option A and submit
    const radios = [...document.querySelectorAll('input[type="radio"]')];
    assert.equal(radios.length, 2);
    await act(async () => {
      Simulate.change(radios[0], { target: { checked: true } });
    });
    const form = document.querySelector("form.jd-response-interaction");
    await act(async () => {
      Simulate.submit(form);
    });
    assert.equal(submitted.length, 1);
    assert.deepEqual(submitted[0].payload, { messageId: "msg-1", blockId: "team-pick", values: ["full"] });
    assert.match(document.body.textContent, /Answer recorded/);

    // Connect GitHub prompt button
    const connectBtn = [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Connect GitHub"));
    assert.ok(connectBtn);
    await act(async () => connectBtn.click());
    assert.equal(connected.length, 1);
    assert.equal(connected[0].id, "github");

    // Not now dismisses connector card cleanly
    const notNowBtn = [...document.querySelectorAll("button")].find((b) => b.textContent === "Not now");
    await act(async () => notNowBtn.click());
    assert.match(document.body.textContent, /Skipped GitHub connection for now/);
  } finally {
    await cleanup();
  }
});

test("SpecialistSelectorCard switches between Recommended Specialist Teams and Single-Agent selector and triggers server quote", async () => {
  const { root, cleanup } = setupDom();
  const quotes = [];
  let duration = 1800;

  try {
    const render = (extra = {}) =>
      act(async () => {
        root.render(
          React.createElement(SpecialistSelectorCard, {
            item: { id: "msg-spec", toolEvents: [] },
            recommendation: {
              id: "software_engineer",
              name: "Software Engineer",
              task: "Build and launch our SaaS dashboard",
            },
            duration,
            onDurationChange: (next) => {
              duration = next;
            },
            onRequestQuote: (target) => quotes.push(target),
            ...extra,
          }),
        );
      });

    await render();
    const text = document.body.textContent;
    assert.match(text, /Recommended Specialist Teams/);
    assert.match(text, /Full Product Launch Team/);
    assert.match(text, /Lean MVP Builder Team/);
    assert.match(text, /Market Research & Strategy Team/);
    assert.match(text, /Or use a single agent/);
    assert.match(text, /Frontend Developer Agent/);

    // Switch to single agent dropdown and request quote
    const agentSelect = document.querySelector('select[aria-label="Choose single specialist agent"]');
    assert.ok(agentSelect);
    await act(async () => {
      Simulate.change(agentSelect, { target: { value: "finance_analyst" } });
    });

    const quoteBtn = [...document.querySelectorAll("button")].find((b) => b.textContent === "Check verified price and request approval");
    assert.ok(quoteBtn);
    await act(async () => quoteBtn.click());
    assert.equal(quotes.length, 1);
    assert.equal(quotes[0].id, "finance_analyst");
  } finally {
    await cleanup();
  }
});
