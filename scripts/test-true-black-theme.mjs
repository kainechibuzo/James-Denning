import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [theme, css, entry] = await Promise.all([
  readFile(new URL("../src/config/theme.js", import.meta.url), "utf8"),
  readFile(new URL("../src/styles/true-black-theme.css", import.meta.url), "utf8"),
  readFile(new URL("../src/main.jsx", import.meta.url), "utf8"),
]);

test("dark palette uses a true-black canvas and distinct near-black surfaces", () => {
  assert.match(theme, /white:"#000000",offWhite:"#000000",card:"#090909"/);
  assert.match(theme, /border:"#262626"/);
  assert.match(css, /--jd-canvas:#000000/);
  assert.match(css, /--jd-card:#090909/);
  assert.match(css, /--jd-input:#050505/);
});

test("true-black layer loads after the base application stylesheet", () => {
  assert.ok(entry.indexOf("./styles/app.css") < entry.indexOf("./styles/true-black-theme.css"));
});

test("dark workspace removes the light reference background artwork", () => {
  assert.match(css, /\.jd-workspace-page\{\s*background-image:none!important;/);
  assert.match(css, /color-scheme:dark/);
});
