import test from "node:test";
import assert from "node:assert/strict";
import { BILLING_CURRENCY, PLATFORM_PLAN, EMPLOYEE_USAGE_PRICE, BILLING_RELEASE } from "../src/config/billing.mjs";

test("platform subscription defaults are USD 19 monthly with a 3-day trial", () => {
  assert.equal(BILLING_CURRENCY, "USD");
  assert.equal(PLATFORM_PLAN.key, "platform_monthly_v1");
  assert.equal(PLATFORM_PLAN.amountMinor, 1900);
  assert.equal(PLATFORM_PLAN.interval, "monthly");
  assert.equal(PLATFORM_PLAN.trialDays, 3);
});

test("employee usage is additive at USD 1 per active hour only", () => {
  assert.equal(EMPLOYEE_USAGE_PRICE.hourlyMicrodollars, 1_000_000);
  assert.equal(EMPLOYEE_USAGE_PRICE.amountMinorPerHour, 100);
  assert.deepEqual(EMPLOYEE_USAGE_PRICE.billablePhases, ["active"]);
  assert.ok(EMPLOYEE_USAGE_PRICE.excludedPhases.includes("approval_wait"));
  assert.ok(EMPLOYEE_USAGE_PRICE.excludedPhases.includes("external_wait"));
});

test("all live billing operations remain disabled until provider and end-to-end gates pass", () => {
  assert.deepEqual(BILLING_RELEASE, {
    checkoutEnabled: false,
    invoiceIssuanceEnabled: false,
    paymentCollectionEnabled: false,
    employeeUsageChargingEnabled: false,
  });
});
