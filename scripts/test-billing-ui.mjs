import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [app, page, navigation, endpoint, webhook] = await Promise.all([
  readFile(new URL("../src/AppDemo.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/pages/billing.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/config/workspace-navigation.mjs", import.meta.url), "utf8"),
  readFile(new URL("../supabase/functions/jd-billing/index.ts", import.meta.url), "utf8"),
  readFile(new URL("../supabase/functions/jd-paystack-webhook/index.ts", import.meta.url), "utf8"),
]);

test("billing page is lazy-loaded and mounted only through the authorised billing route", () => {
  assert.match(app, /lazyPage\(\(\) => import\("\.\/pages\/billing\.jsx"\), "BillingPage"\)/);
  assert.match(app, /page==="billing" && \(canAccess\("billing"\) \? <BillingPage/);
  assert.match(navigation, /id:"billing",\s+label:"Billing",\s+icon:"wallet",\s+roles:\["owner","admin"\]/);
});

test("billing UI starts trial and checkout only after explicit owner action", () => {
  assert.match(page, /billing\.trial\.start/);
  assert.match(page, /billing\.checkout\.create/);
  assert.match(page, /billing\.checkout\.verify/);
  assert.match(page, /Start 3-day free trial/);
  assert.match(page, /Continue with Paystack/);
  assert.match(page, /No payment has been taken/);
  assert.match(page, /checkoutEnabled/);
  assert.match(page, /checkout\.paystack\.com/);
  assert.doesNotMatch(page, /PAYSTACK_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY/);
});

test("checkout requires an expired trial and server-side Paystack configuration", () => {
  assert.match(endpoint, /PAYSTACK_PLATFORM_PLAN_CODE/);
  assert.match(endpoint, /JD_BILLING_CHECKOUT_ENABLED/);
  assert.match(endpoint, /api\\.paystack\\.co\\/plan\\//);
  assert.match(endpoint, /billing_plan_mismatch/);
  assert.match(endpoint, /PAYSTACK_SECRET_KEY/);
  assert.match(endpoint, /JD_APP_URL/);
  assert.match(endpoint, /Your free trial is still active/);
  assert.match(endpoint, /transaction\\?\.status !== "success"/);
  assert.match(endpoint, /transaction\\?\.reference !== reference/);
});

test("webhook validates signatures and persists replay-safe receipts before processing", () => {
  assert.match(webhook, /verifyPaystackWebhookSignature/);
  assert.match(webhook, /jd_billing_webhook_receipts/);
  assert.match(webhook, /prior\.status !== "failed"/);
  assert.match(webhook, /source_webhook_receipt_id: receiptId/);
  assert.match(webhook, /transaction\/verify/);
});
