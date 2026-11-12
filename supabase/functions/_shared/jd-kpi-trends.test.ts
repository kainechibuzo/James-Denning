import { analyseKpiTrends } from "./jd-kpi-trends.ts";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const NOW = "2026-11-12";
// months: 2025-12 .. 2026-11

Deno.test("cleared cash is bucketed by month, currency and direction; pending is excluded", () => {
  const out = analyseKpiTrends({ cash: [
    { occurred_on: "2026-11-03", direction: "inflow", amount: 100, currency: "NGN", status: "cleared" },
    { occurred_on: "2026-11-09", direction: "inflow", amount: 50, currency: "NGN", status: "pending" },
    { occurred_on: "2026-10-15", direction: "inflow", amount: 200, currency: "NGN", status: "cleared" },
    { occurred_on: "2026-11-02", direction: "outflow", amount: 70, currency: "USD", status: "cleared" },
    { occurred_on: "2020-01-01", direction: "inflow", amount: 9999, currency: "NGN", status: "cleared" },
  ] }, NOW);
  assert(out.months[out.months.length - 1] === "2026-11", "last month is current");
  const nov = out.months.indexOf("2026-11"), oct = out.months.indexOf("2026-10");
  assert(out.series.cash_in_by_currency.NGN[nov] === 100, "cleared inflow counted, pending excluded");
  assert(out.series.cash_in_by_currency.NGN[oct] === 200, "october bucket populated");
  assert(out.series.cash_out_by_currency.USD[nov] === 70, "outflow currency isolated");
  assert(out.series.cash_in_by_currency.NGN.reduce((a, b) => a + b, 0) === 300, "out-of-range excluded");
});

Deno.test("approved expenses bucket by currency; submitted expenses are excluded", () => {
  const out = analyseKpiTrends({ expenses: [
    { incurred_on: "2026-11-01", amount: 400, currency: "NGN", status: "approved" },
    { incurred_on: "2026-11-02", amount: 600, currency: "NGN", status: "submitted" },
    { incurred_on: "2026-09-05", amount: 10, currency: "USD", status: "paid" },
  ] }, NOW);
  const nov = out.months.indexOf("2026-11"), sep = out.months.indexOf("2026-09");
  assert(out.series.approved_expenses_by_currency.NGN[nov] === 400, "approved counted");
  assert(out.series.approved_expenses_by_currency.NGN[nov] !== 1000, "submitted excluded");
  assert(out.series.approved_expenses_by_currency.USD[sep] === 10, "paid counts, currency isolated");
});

Deno.test("opportunities and customers bucket by creation month", () => {
  const out = analyseKpiTrends({ opportunities: [
    { created_at: "2026-11-01T10:00:00Z", stage: "lead" },
    { created_at: "2026-11-05T10:00:00Z", stage: "won" },
    { created_at: "2026-08-05T10:00:00Z", stage: "won" },
  ], customers: [{ created_at: "2026-11-02T00:00:00Z" }, { created_at: "2026-11-20T00:00:00Z" }] }, NOW);
  const nov = out.months.indexOf("2026-11"), aug = out.months.indexOf("2026-08");
  assert(out.series.new_opportunities[nov] === 2, "two new opportunities in November");
  assert(out.series.won_opportunities_created[nov] === 1 && out.series.won_opportunities_created[aug] === 1, "won attributed to creation month");
  assert(out.series.new_customers[nov] === 2, "customers bucketed");
  assert(out.movement.new_opportunities.trailing_3m === 2, "trailing 3m movement computed");
});

Deno.test("resolved support cases bucket by resolution month only when resolved", () => {
  const out = analyseKpiTrends({ support: [
    { created_at: "2026-10-01T00:00:00Z", resolved_at: "2026-11-10T00:00:00Z", status: "resolved" },
    { created_at: "2026-11-01T00:00:00Z", resolved_at: null, status: "open" },
  ] }, NOW);
  const nov = out.months.indexOf("2026-11");
  assert(out.series.resolved_support_cases[nov] === 1, "only resolved cases counted");
});

Deno.test("empty input produces zeroed series and unchanged marker", () => {
  const out = analyseKpiTrends({}, NOW);
  assert(out.unchanged === true && out.months.length === 12, "12 month axis, unchanged");
  assert(out.series.new_opportunities.every((n) => n === 0), "zeroed counts");
  assert(Object.keys(out.series.cash_in_by_currency).length === 0, "no currency buckets invented");
});

Deno.test("malformed rows are ignored, never throw", () => {
  const out = analyseKpiTrends({ cash: [
    { occurred_on: "not-a-date", direction: "inflow", amount: 100, currency: "NGN", status: "cleared" },
    { occurred_on: "2026-11-01", direction: "sideways", amount: 100, currency: "NGN", status: "cleared" },
    { occurred_on: "2026-11-01", direction: "inflow", amount: "abc", currency: "NGN", status: "cleared" },
  ] as any[] }, NOW);
  const nov = out.months.indexOf("2026-11");
  assert((out.series.cash_in_by_currency.NGN?.[nov] ?? 0) === 0, "malformed rows dropped safely");
});
