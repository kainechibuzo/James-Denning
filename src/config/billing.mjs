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

// Agentic-time pricing for workforce runs (phase 7). Display/quote defaults
// only: the server computes amounts from jd_agent_time_ledger actual seconds
// at the workspace's recorded rate, and charging stays behind the release
// flag until the owner enables it. Only actual agent work time is billable —
// queued, waiting and paused time is excluded by construction because the
// ledger records measured wall-clock work, not elapsed time.
export const AGENTIC_TIME_PRICE = Object.freeze({
  policy: "agentic-seconds-v1",
  currency: BILLING_CURRENCY,
  defaultRateMinorPerHour: 10_000,
  billableBasis: "actual_agent_work_seconds",
  excludedBasis: Object.freeze(["queued", "approval_wait", "external_wait", "paused"]),
});
export const BILLING_RELEASE = Object.freeze({
  checkoutEnabled: false,
  invoiceIssuanceEnabled: false,
  paymentCollectionEnabled: false,
  employeeUsageChargingEnabled: false,
  agenticTimeChargingEnabled: false,
});
