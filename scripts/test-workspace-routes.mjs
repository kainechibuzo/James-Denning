// URL <-> page resolution for the workspace shell.
//
// Links arrive from outside the SPA: Paystack returns the browser to the page that
// started checkout, notifications store a link_page, and people bookmark pages.
// Each of those must land on the page it names instead of the assistant, and a
// payment return must keep its query string until the billing page has read it.
import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PAGE, clearPaymentReturn, pageFromLocation, pathForPage, shouldSyncUrl, isWorkspacePage,
} from "../src/config/workspace-routes.mjs";

test("defaults to the assistant when nothing in the URL names a page", () => {
  assert.equal(pageFromLocation({pathname: "/", search: ""}), DEFAULT_PAGE);
  assert.equal(pageFromLocation({pathname: "/some/stray/link", search: ""}), DEFAULT_PAGE);
  assert.equal(pageFromLocation(null), DEFAULT_PAGE);
});

test("a payment return opens billing with its query string intact", () => {
  const location = {pathname: "/", search: "?billing=paystack&reference=ref_123&trxref=ref_123"};
  assert.equal(pageFromLocation(location), "billing");
  assert.equal(shouldSyncUrl("billing", location), false,
    "rewriting the URL before verification would discard the reference");
});

test("known paths and ?page= deep links resolve to their page", () => {
  assert.equal(pageFromLocation({pathname: "/billing", search: ""}), "billing");
  assert.equal(pageFromLocation({pathname: "/admin", search: ""}), "admin-dashboard");
  assert.equal(pageFromLocation({pathname: "/notifications", search: ""}), "notifications");
  assert.equal(pageFromLocation({pathname: "/", search: "?page=settings"}), "settings");
  assert.equal(pageFromLocation({pathname: "/", search: "?page=audit-log"}), "audit-log");
});

test("an unknown ?page= value falls back instead of rendering a blank shell", () => {
  assert.equal(pageFromLocation({pathname: "/", search: "?page=does-not-exist"}), DEFAULT_PAGE);
  assert.equal(isWorkspacePage("does-not-exist"), false);
  assert.equal(isWorkspacePage("billing"), true);
});

test("ordinary pages still get a canonical URL", () => {
  assert.equal(shouldSyncUrl("billing", {pathname: "/billing", search: ""}), true);
  assert.equal(shouldSyncUrl("jd-chat", {pathname: "/admin", search: ""}), true);
  assert.equal(pathForPage("admin-dashboard"), "/admin");
  assert.equal(pathForPage("billing"), "/");
});

test("a payment return that cannot be verified is cleared from the URL", () => {
  const calls = [];
  const location = {pathname: "/", search: "?billing=paystack&reference=ref_123&trxref=ref_123"};
  assert.equal(clearPaymentReturn(location, {replaceState: (...args) => calls.push(args)}), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][2], "/", "the reference must not be left in the address bar");
});

test("clearing a payment return leaves unrelated query parameters alone", () => {
  const calls = [];
  clearPaymentReturn({pathname: "/", search: "?billing=paystack&reference=ref_123&utm=x"}, {
    replaceState: (...args) => calls.push(args),
  });
  assert.equal(calls[0][2], "/?utm=x");
});

test("clearing is a no-op when there is no payment return to clear", () => {
  const calls = [];
  assert.equal(clearPaymentReturn({pathname: "/", search: "?page=settings"}, {replaceState: () => calls.push(1)}), false);
  assert.equal(calls.length, 0);
});
