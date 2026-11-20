import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [migration, rollback, endpoint, config, finalisation] = await Promise.all([
  readFile(new URL("../supabase/migrations/20261120084500_jd_commercial_billing.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/rollback/20261120084500_jd_commercial_billing.rollback.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/functions/jd-billing/index.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/config/billing.mjs", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20261120130000_jd_billing_payment_finalization.sql", import.meta.url), "utf8"),
]);

test("commercial billing tables are tenant-scoped and unavailable to browser roles", () => {
  for (const table of ["jd_billing_subscriptions", "jd_billing_invoices", "jd_billing_invoice_lines", "jd_billing_payments", "jd_billing_webhook_receipts", "jd_billing_events"]) {
    assert.match(migration, new RegExp(`create table public\\.${table}\\b`));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(migration, /from public, anon, authenticated/);
  assert.match(migration, /grant select, insert, update, delete[\s\S]*to service_role/);
});

test("trial start is owner/admin-only, one-time per tenant, and request-idempotent", () => {
  assert.match(migration, /jd_billing_start_trial\(p_actor_id uuid, p_request_id uuid\)/);
  assert.match(migration, /security invoker/);
  assert.doesNotMatch(migration, /security definer/i);
  assert.match(migration, /unique\(school_id, request_id\)/);
  assert.match(migration, /source_webhook_receipt_id uuid references public\.jd_billing_webhook_receipts/);
  assert.match(migration, /role in \('owner','admin'\)/);
  assert.match(migration, /on conflict \(school_id\) do nothing/);
  assert.match(migration, /unique index jd_billing_events_request/);
  assert.match(migration, /interval '3 days'/);
  assert.match(migration, /grant execute on function public\.jd_billing_start_trial\(uuid,uuid\) to service_role/);
  assert.match(rollback, /drop function public\.jd_billing_start_trial\(uuid,uuid\)/);
});

test("billing endpoint derives identity from verified JWT and never trusts browser tenant IDs", () => {
  assert.match(endpoint, /auth\.auth\.getUser\(token\)/);
  assert.match(endpoint, /\.eq\("id", authData\.user\.id\)/);
  assert.match(endpoint, /\["owner", "admin"\]\.includes\(profile\.role\)/);
  assert.match(endpoint, /\.eq\("school_id", profile\.school_id\)/);
  assert.doesNotMatch(endpoint, /body\.school_id|body\.tenant_id|body\.actor_id/);
});

test("Paystack checkout is server-initialised and transaction verification is strict", () => {
  assert.match(endpoint, /PAYSTACK_SECRET_KEY/);
  assert.match(endpoint, /PAYSTACK_PLATFORM_PLAN_CODE/);
  assert.match(endpoint, /api\.paystack\.co\/transaction\/initialize/);
  assert.match(endpoint, /api\.paystack\.co\/transaction\/verify/);
  assert.match(endpoint, /transaction\?\.status !== "success"/);
  assert.match(endpoint, /transaction\?\.reference !== reference/);
  assert.match(endpoint, /Number\(transaction\?\.amount\) !== Number\(payment\.amount_minor\)/);
  assert.match(endpoint, /transaction\?\.currency !== payment\.currency/);
  assert.match(endpoint, /billing_trial_active/);
  assert.match(endpoint, /billing_checkout_in_progress/);
  assert.match(config, /checkoutEnabled: false/);
  assert.match(config, /paymentCollectionEnabled: false/);
  assert.match(config, /employeeUsageChargingEnabled: false/);
});

test("Paystack plan is checked against the exact subscription amount, currency and monthly interval", () => {
  assert.match(endpoint, /api\.paystack\.co\/plan\//);
  assert.match(endpoint, /Number\(providerPlan\?\.amount\) !== Number\(subscription\.amount_minor\)/);
  assert.match(endpoint, /providerPlan\?\.currency !== subscription\.currency/);
  assert.match(endpoint, /providerPlan\?\.interval !== "monthly"/);
  assert.match(endpoint, /JD_BILLING_CHECKOUT_ENABLED/);
  assert.match(endpoint, /JD_BILLING_CANCEL_FLOW_ENABLED/);
  assert.match(endpoint, /billing_plan_mismatch/);
  assert.match(endpoint, /\.eq\("school_id", profile\.school_id\)\.eq\("status", "pending"\)/);
  assert.match(endpoint, /billing_checkout_in_progress/);
  assert.match(endpoint, /\["failed", "abandoned"\]\.includes\(transaction\.status\)/);
});

test("payment and subscription state are finalised atomically with an append-only audit event", () => {
  assert.match(finalisation, /jd_billing_finalize_payment/);
  assert.match(finalisation, /for update/);
  assert.match(finalisation, /payment\.amount_minor<>p_amount_minor/);
  assert.match(finalisation, /update public\.jd_billing_payments/);
  assert.match(finalisation, /update public\.jd_billing_subscriptions/);
  assert.match(finalisation, /insert into public\.jd_billing_events/);
  assert.match(finalisation, /to service_role/);
  assert.match(finalisation, /jd_billing_finalize_payment\(uuid,text,bigint,text,timestamptz,text,uuid,uuid\)/);
  assert.match(finalisation, /school_id,actor_id,source_webhook_receipt_id/);
  assert.match(endpoint, /rpc\("jd_billing_finalize_payment"/);
});
