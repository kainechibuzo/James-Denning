// Commercial billing defaults. These are display/quote defaults only;
// checkout, invoicing and charging remain server-side and explicitly gated.
export const BILLING_CURRENCY = "USD";
export const PLATFORM_PLAN = Object.freeze({
  key: "platform_monthly_v1",
  name: "James-Denning",
  interval: "monthly",
  amountMinor: 1900,
  trialDays: 3,
});
export const EMPLOYEE_USAGE_PRICE = Object.freeze({
  policy: "employee-active-v1",
  currency: BILLING_CURRENCY,
  hourlyMicrodollars: 1_000_000,
  amountMinorPerHour: 100,
  billablePhases: Object.freeze(["active"]),
  excludedPhases: Object.freeze(["queued", "idle", "approval_wait", "external_wait", "paused"]),
});
export const BILLING_RELEASE = Object.freeze({
  checkoutEnabled: false,
  invoiceIssuanceEnabled: false,
  paymentCollectionEnabled: false,
  employeeUsageChargingEnabled: false,
});
