import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { bindMobileNavigation } from "../src/components/mobile-navigation.mjs";

let dom, doc, drawer, trigger, dispose, closes;
beforeEach(() => {
  // DOM-only fixtures. No real credentials, requests or production browser session.
  dom = new JSDOM(`<!doctype html><body style="overflow:auto">
    <button id="trigger">Open navigation</button>
    <aside id="drawer" tabindex="-1">
      <input id="search" type="search" aria-label="Search workspace navigation">
      <button id="disabled" disabled>Disabled group</button>
      <div hidden><button id="hidden">Hidden control</button></div>
      <button id="middle">JD Assistant</button>
      <button id="last">Sign out</button>
    </aside>
    <button id="dialog">External dialog control</button>
  </body>`);
  doc = dom.window.document;
  drawer = doc.getElementById("drawer");
  trigger = doc.getElementById("trigger");
  closes = 0;
  trigger.focus();
  dispose = bindMobileNavigation(drawer, { onClose: () => { closes++; }, returnFocus: trigger });
});
afterEach(() => { dispose?.(); dom.window.close(); });
const key = (name, shiftKey = false) => {
  const event = new dom.window.KeyboardEvent("keydown", { key: name, shiftKey, bubbles: true, cancelable: true });
  doc.activeElement.dispatchEvent(event);
  return event;
};

test("opening focuses search and locks body scrolling", () => {
  assert.equal(doc.activeElement.id, "search");
  assert.equal(doc.body.style.overflow, "hidden");
});
test("Tab wraps from last control to search", () => {
  doc.getElementById("last").focus();
  assert.equal(key("Tab").defaultPrevented, true);
  assert.equal(doc.activeElement.id, "search");
});
test("Shift-Tab wraps to the last eligible control", () => {
  assert.equal(key("Tab", true).defaultPrevented, true);
  assert.equal(doc.activeElement.id, "last");
});
test("interior Tab is left to native browser handling", () => {
  doc.getElementById("middle").focus();
  assert.equal(key("Tab").defaultPrevented, false);
});
test("Escape closes and returns focus to the menu trigger", () => {
  assert.equal(key("Escape").defaultPrevented, true);
  assert.equal(closes, 1);
  assert.equal(doc.activeElement, trigger);
});
test("focus boundaries update after search removes or disables controls", () => {
  doc.getElementById("last").remove();
  doc.getElementById("middle").disabled = true;
  doc.getElementById("search").focus();
  key("Tab");
  assert.equal(doc.activeElement.id, "search");
  key("Tab", true);
  assert.equal(doc.activeElement.id, "search");
});
test("no controls still contains focus without throwing", () => {
  drawer.innerHTML = "<p>No matching pages</p>";
  drawer.focus();
  assert.equal(key("Tab").defaultPrevented, true);
  assert.equal(doc.activeElement, drawer);
});
test("cleanup restores prior scroll, focus and removes the event handler", () => {
  dispose(); dispose = null;
  assert.equal(doc.body.style.overflow, "auto");
  assert.equal(doc.activeElement, trigger);
  doc.getElementById("search").focus();
  key("Escape");
  assert.equal(closes, 0);
});
test("cleanup does not steal focus from a dialog opened by navigation", () => {
  const external = doc.getElementById("dialog");
  external.focus();
  dispose(); dispose = null;
  assert.equal(doc.activeElement, external);
  assert.equal(doc.body.style.overflow, "auto");
});
test("repeated bind-cleanup cycles do not accumulate Escape handlers", () => {
  dispose();
  dispose = bindMobileNavigation(drawer, { onClose: () => { closes++; }, returnFocus: trigger });
  key("Escape");
  assert.equal(closes, 1);
});
