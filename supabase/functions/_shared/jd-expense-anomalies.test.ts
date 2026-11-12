import { analyseExpenseAnomalies } from "./jd-expense-anomalies.ts";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const NOW = "2026-11-12";
const exp = (id: string, category: string, amount: number, currency: string, incurred_on: string, status = "approved") =>
  ({ id, category, amount, currency, incurred_on, status });

Deno.test("approved spend over budget emits a high-severity finding with evidence", () => {
  const out = analyseExpenseAnomalies(
    [exp("e1", "Fuel", 600, "NGN", "2026-11-01"), exp("e2", "Fuel", 500, "NGN", "2026-11-05")],
    [{ category: "Fuel", currency: "NGN", period_start: "2026-11-01", period_end: "2026-11-30", budget_amount: 1000, alert_threshold_pct: 80, status: "active" }],
    NOW,
  );
  const f = out.findings.find((x) => x.id === "budget_exceeded:Fuel:NGN");
  assert(f, "exceeded finding present");
  assert(f!.severity === "high", "severity high");
  assert(f!.evidence.includes("1100.00"), "evidence carries spend");
  assert(out.unchanged === true, "analysis performs no writes");
});

Deno.test("utilisation between threshold and 100 emits a warning, below threshold nothing", () => {
  const mk = (spend: number) => analyseExpenseAnomalies(
    [exp("e1", "Meals", spend, "NGN", "2026-11-03")],
    [{ category: "Meals", currency: "NGN", period_start: "2026-11-01", period_end: "2026-11-30", budget_amount: 1000, alert_threshold_pct: 80, status: "active" }],
    NOW,
  );
  assert(mk(850).findings.some((f) => f.id === "budget_threshold:Meals:NGN" && f.severity === "warning"), "threshold finding");
  assert(!mk(400).findings.some((f) => f.id.startsWith("budget_")), "no budget finding below threshold");
});

Deno.test("currency isolation: NGN spend never consumes a USD budget", () => {
  const out = analyseExpenseAnomalies(
    [exp("e1", "Fuel", 999999, "NGN", "2026-11-01")],
    [{ category: "Fuel", currency: "USD", period_start: "2026-11-01", period_end: "2026-11-30", budget_amount: 100, alert_threshold_pct: 80, status: "active" }],
    NOW,
  );
  assert(out.findings.length === 0, "currencies never mix");
});

Deno.test("submitted expenses are excluded, over-threshold utilisation from submitted data is silent", () => {
  const out = analyseExpenseAnomalies(
    [exp("e1", "Fuel", 5000, "NGN", "2026-11-01", "submitted")],
    [{ category: "Fuel", currency: "NGN", period_start: "2026-11-01", period_end: "2026-11-30", budget_amount: 1000, status: "active" }],
    NOW,
  );
  assert(out.findings.length === 0 && out.summary.approved_records_analysed === 0, "submitted spend excluded");
});

Deno.test("median outlier detection fires at >=3x with five or more samples only", () => {
  const base = [exp("a","Data",100,"NGN","2026-09-01"),exp("b","Data",110,"NGN","2026-09-10"),exp("c","Data",90,"NGN","2026-09-20"),exp("d","Data",105,"NGN","2026-10-01"),exp("e","Data",95,"NGN","2026-10-15")];
  const withOutlier = [...base, exp("f","Data",1000,"NGN","2026-11-01")];
  const out = analyseExpenseAnomalies(withOutlier, [], NOW);
  assert(out.findings.some((f) => f.id.startsWith("outlier:data:NGN")), "outlier flagged");
  const sparse = analyseExpenseAnomalies([exp("a","Data",100,"NGN","2026-11-01"),exp("b","Data",9000,"NGN","2026-11-02")], [], NOW);
  assert(!sparse.findings.some((f) => f.id.startsWith("outlier:")), "no outlier below five samples");
});

Deno.test("period-over-period spike requires prior data and at least three current records", () => {
  const prior = [exp("p1","Airtime",100,"NGN","2026-07-10"),exp("p2","Airtime",120,"NGN","2026-08-10")];
  const current = [exp("c1","Airtime",200,"NGN","2026-09-15"),exp("c2","Airtime",220,"NGN","2026-10-15"),exp("c3","Airtime",210,"NGN","2026-11-05")];
  const out = analyseExpenseAnomalies([...prior, ...current], [], NOW);
  assert(out.findings.some((f) => f.id === "trend_spike:airtime:NGN"), "spike flagged");
  const noPrior = analyseExpenseAnomalies(current, [], NOW);
  assert(!noPrior.findings.some((f) => f.id.startsWith("trend_spike:")), "no spike without prior window");
});

Deno.test("incoherent budgets are ignored rather than throwing", () => {
  const out = analyseExpenseAnomalies([], [{ category: "Fuel", currency: "NGN", period_start: "2026-11-01", period_end: "2026-11-30", budget_amount: 0, status: "active" }, { category: "", currency: "NGN", period_start: "2026-11-01", period_end: "2026-11-30", budget_amount: 100, status: "active" }], NOW);
  assert(out.findings.length === 0 && out.summary.budgets_evaluated === 2, "incoherent budgets skipped safely");
});
