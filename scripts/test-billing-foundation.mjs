import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [migration, rollback, endpoint, config] = await Promise.all([
  readFile(new URL("../supabase/migrations/20261120084500_jd_commercial_billing.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/rollback/20261120084500_jd_commercial_billing.rollback.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/functions/jd-billing/index.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/config/billing.mjs", import.meta.url), "utf8"),
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

test("checkout is explicitly disabled and billing defaults stay centralised", () => {
  assert.match(endpoint, /billing\.checkout\.create/);
  assert.match(endpoint, /billing_checkout_disabled/);
  assert.match(config, /checkoutEnabled: false/);
  assert.match(config, /paymentCollectionEnabled: false/);
  assert.match(config, /employeeUsageChargingEnabled: false/);
});
