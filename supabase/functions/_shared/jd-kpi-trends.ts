// JD KPI trend analysis (JD-UPG-120 / JD-UPG-165).
// Pure, deterministic, read-only. Monthly buckets over the last N months.
// Money is always grouped by currency; no mixed-currency sums are produced.

export type CashRow = { occurred_on: string; direction: string; amount: number | string; currency: string; status?: string | null };
export type ExpenseRow = { incurred_on: string; amount: number | string; currency: string; status?: string | null };
export type OpportunityRow = { created_at?: string | null; stage?: string | null };
export type SupportRow = { created_at?: string | null; resolved_at?: string | null; status?: string | null };
export type CustomerRow = { created_at?: string | null };

const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const monthOf = (iso: string | null | undefined): string | null => {
  if (typeof iso !== "string") return null;
  const m = iso.slice(0, 7);
  return /^\d{4}-\d{2}$/.test(m) ? m : null;
};
const monthKey = (year: number, month0: number) => `${year}-${String(month0 + 1).padStart(2, "0")}`;

export function analyseKpiTrends(
  input: { cash?: CashRow[]; expenses?: ExpenseRow[]; opportunities?: OpportunityRow[]; support?: SupportRow[]; customers?: CustomerRow[] } = {},
  nowInput?: string,
  monthsBack = 12,
) {
  const now = nowInput && /^\d{4}-\d{2}-\d{2}$/.test(nowInput) ? new Date(nowInput + "T00:00:00Z") : new Date();
  const months: string[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push(monthKey(d.getUTCFullYear(), d.getUTCMonth()));
  }
  const inRange = new Set(months);
  const index = new Map(months.map((m, i) => [m, i]));
  const zero = () => months.map(() => 0);
  const zeroByCurrency = (): Record<string, number[]> => ({});

  const cashIn = zeroByCurrency(), cashOut = zeroByCurrency(), expensesByCurrency = zeroByCurrency();
  const newOpportunities = zero(), wonOpportunitiesCreated = zero(), resolvedSupport = zero(), newCustomers = zero();

  for (const row of input.cash ?? []) {
    const m = monthOf(row?.occurred_on); if (!m || !inRange.has(m)) continue;
    const amount = num(row?.amount); if (amount === null) continue;
    const currency = String(row?.currency ?? "NGN").trim().toUpperCase() || "NGN";
    const direction = String(row?.direction ?? "").toLowerCase();
    const cleared = String(row?.status ?? "cleared").toLowerCase() === "cleared";
    if (!cleared) continue; // only cleared cash counts as KPI money
    const target = direction === "inflow" ? cashIn : direction === "outflow" ? cashOut : null;
    if (!target) continue;
    target[currency] ??= zero();
    target[currency][index.get(m)!] += amount;
  }
  for (const row of input.expenses ?? []) {
    const m = monthOf(row?.incurred_on); if (!m || !inRange.has(m)) continue;
    const amount = num(row?.amount); if (amount === null) continue;
    if (!["approved", "paid"].includes(String(row?.status ?? "").toLowerCase())) continue;
    const currency = String(row?.currency ?? "NGN").trim().toUpperCase() || "NGN";
    expensesByCurrency[currency] ??= zero();
    expensesByCurrency[currency][index.get(m)!] += amount;
  }
  for (const row of input.opportunities ?? []) {
    const m = monthOf(row?.created_at); if (!m || !inRange.has(m)) continue;
    newOpportunities[index.get(m)!] += 1;
    if (String(row?.stage ?? "").toLowerCase() === "won") wonOpportunitiesCreated[index.get(m)!] += 1;
  }
  for (const row of input.support ?? []) {
    const m = monthOf(row?.resolved_at); if (!m || !inRange.has(m)) continue;
    resolvedSupport[index.get(m)!] += 1;
  }
  for (const row of input.customers ?? []) {
    const m = monthOf(row?.created_at); if (!m || !inRange.has(m)) continue;
    newCustomers[index.get(m)!] += 1;
  }

  // Trailing 3-month vs prior 3-month movement for headline count metrics.
  const tail3 = (series: number[]) => series.slice(-3).reduce((a, b) => a + b, 0);
  const prior3 = (series: number[]) => series.slice(-6, -3).reduce((a, b) => a + b, 0);
  const movement = (series: number[]) => ({ trailing_3m: tail3(series), prior_3m: prior3(series), delta: tail3(series) - prior3(series) });

  return {
    unchanged: true as const,
    months,
    series: {
      cash_in_by_currency: cashIn,
      cash_out_by_currency: cashOut,
      approved_expenses_by_currency: expensesByCurrency,
      new_opportunities: newOpportunities,
      won_opportunities_created: wonOpportunitiesCreated,
      resolved_support_cases: resolvedSupport,
      new_customers: newCustomers,
    },
    movement: {
      new_opportunities: movement(newOpportunities),
      resolved_support_cases: movement(resolvedSupport),
      new_customers: movement(newCustomers),
    },
    limitations: [
      "Cash KPIs count cleared transactions only; pending inflows are excluded.",
      "Won-opportunity movement is attributed to the creation month of currently-won records (no closed_at timestamp exists); treat it as an approximation, not a win-rate.",
      "Money is grouped by currency; no cross-currency totals are produced.",
      "Counts are bucket-of-record timestamps bucketed in UTC months; no timezone adjustment is applied.",
    ],
  };
}
