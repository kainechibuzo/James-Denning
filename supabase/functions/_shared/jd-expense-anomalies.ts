// JD expense anomaly detection (JD-UPG-121 / JD-UPG-196).
// Pure, deterministic, read-only. Currency is always kept separate; approved/paid records only.
// Produces advisory findings with machine-readable ids and evidence strings. Never writes.

export type ExpenseRow = {
  id?: string;
  category: string;
  amount: number | string;
  currency: string;
  incurred_on: string; // YYYY-MM-DD
  status: string;
};

export type BudgetRow = {
  category: string;
  currency: string;
  period_start: string; // YYYY-MM-DD
  period_end: string;   // YYYY-MM-DD
  budget_amount: number | string;
  alert_threshold_pct?: number | string | null;
  status?: string | null;
};

export type ExpenseFinding = {
  id: string;
  severity: "high" | "warning" | "info";
  keys: string[];
  title: string;
  evidence: string;
  recommendation: string;
};

const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const dayMs = 86400000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

export function analyseExpenseAnomalies(expenses: ExpenseRow[] = [], budgets: BudgetRow[] = [], nowInput?: string) {
  const now = DATE_RE.test(nowInput ?? "") ? new Date((nowInput as string) + "T00:00:00Z") : new Date();
  const findings: ExpenseFinding[] = [];
  const approved = expenses.filter(
    (row) => ["approved", "paid"].includes(String(row?.status ?? "").toLowerCase()) && (num(row?.amount) ?? 0) > 0 && DATE_RE.test(String(row?.incurred_on ?? ""))
  );

  // --- 1) Budget utilisation breaches (exact category + currency + period, like budget.analytics) ---
  for (const budget of budgets) {
    if (String(budget?.status ?? "active").toLowerCase() !== "active") continue;
    const category = String(budget?.category ?? "").trim();
    const currency = String(budget?.currency ?? "").trim().toUpperCase();
    const budgetAmount = num(budget?.budget_amount);
    if (!category || !DATE_RE.test(String(budget?.period_start ?? "")) || !DATE_RE.test(String(budget?.period_end ?? "")) || budgetAmount === null || budgetAmount <= 0) continue;
    const threshold = Math.min(Math.max(num(budget?.alert_threshold_pct) ?? 80, 1), 100);
    const spend = approved
      .filter((row) => String(row.category ?? "").trim() === category
        && String(row.currency ?? "").trim().toUpperCase() === currency
        && String(row.incurred_on) >= budget.period_start
        && String(row.incurred_on) <= budget.period_end)
      .reduce((sum, row) => sum + (num(row.amount) ?? 0), 0);
    const utilisation = (spend / budgetAmount) * 100;
    if (utilisation >= 100) {
      findings.push({ id: `budget_exceeded:${category}:${currency}`, severity: "high", keys: ["jd_business_expenses", "jd_business_budgets"],
        title: `Approved spend in '${category}' has exceeded the ${currency} budget for the period`,
        evidence: `approved_spend=${spend.toFixed(2)} ${currency} vs budget_amount=${budgetAmount.toFixed(2)} ${currency} (utilisation ${utilisation.toFixed(1)}%)`,
        recommendation: "Review the overage in the expense approval queue; adjust the budget or escalate per workspace policy. JD never modifies budgets or expenses." });
    } else if (utilisation >= threshold) {
      findings.push({ id: `budget_threshold:${category}:${currency}`, severity: "warning", keys: ["jd_business_expenses", "jd_business_budgets"],
        title: `Approved spend in '${category}' reached ${utilisation.toFixed(1)}% of the ${currency} budget`,
        evidence: `approved_spend=${spend.toFixed(2)} ${currency} vs budget_amount=${budgetAmount.toFixed(2)} ${currency} (alert threshold ${threshold}%)`,
        recommendation: "Flag to the workspace administrator before the period closes; no writes are performed by this analysis." });
    }
  }

  // --- 2) Per-category outliers (robust median-based; requires >=5 samples) ---
  const byGroup = new Map<string, ExpenseRow[]>();
  for (const row of approved) {
    const groupKey = `${String(row.category ?? "").trim().toLowerCase()}|${String(row.currency ?? "").trim().toUpperCase()}`;
    const list = byGroup.get(groupKey) ?? [];
    list.push(row);
    byGroup.set(groupKey, list);
  }
  for (const [groupKey, rows] of byGroup) {
    if (rows.length < 5) continue;
    const amounts = rows.map((row) => num(row.amount) ?? 0);
    const med = median(amounts);
    if (med <= 0) continue;
    for (const row of rows) {
      const amount = num(row.amount) ?? 0;
      if (amount >= 3 * med) {
        const [category, currency] = groupKey.split("|");
        findings.push({ id: `outlier:${category}:${currency}:${String(row.incurred_on)}:${amount.toFixed(2)}`, severity: "warning", keys: ["jd_business_expenses"],
          title: `Single ${currency} expense in '${row.category}' is at least 3x the category median`,
          evidence: `amount=${amount.toFixed(2)} ${currency} vs category median=${med.toFixed(2)} ${currency} (samples=${rows.length}, date=${row.incurred_on})`,
          recommendation: "Verify the receipt and approval chain for this expense; repeated outliers may indicate duplicate or miscoded entries. JD does not void or refund expenses." });
      }
    }
  }

  // --- 3) Period-over-period spike (trailing 90d vs prior 90d, per category + currency) ---
  const nowMs = now.getTime();
  const windowStart = new Date(nowMs - 90 * dayMs).toISOString().slice(0, 10);
  const priorStart = new Date(nowMs - 180 * dayMs).toISOString().slice(0, 10);
  const end = now.toISOString().slice(0, 10);
  const trend = new Map<string, { current: number; prior: number; currentCount: number; category: string; currency: string }>();
  for (const row of approved) {
    const groupKey = `${String(row.category ?? "").trim().toLowerCase()}|${String(row.currency ?? "").trim().toUpperCase()}`;
    const entry = trend.get(groupKey) ?? { current: 0, prior: 0, currentCount: 0, category: String(row.category ?? "").trim(), currency: String(row.currency ?? "").trim().toUpperCase() };
    const on = String(row.incurred_on);
    const amount = num(row.amount) ?? 0;
    if (on >= windowStart && on <= end) { entry.current += amount; entry.currentCount += 1; }
    else if (on >= priorStart && on < windowStart) { entry.prior += amount; }
    trend.set(groupKey, entry);
  }
  for (const entry of trend.values()) {
    if (entry.prior > 0 && entry.current >= 1.5 * entry.prior && entry.currentCount >= 3) {
      const increase = ((entry.current - entry.prior) / entry.prior) * 100;
      findings.push({ id: `trend_spike:${entry.category.toLowerCase()}:${entry.currency}`, severity: "warning", keys: ["jd_business_expenses"],
        title: `Approved spend in '${entry.category}' rose ${increase.toFixed(0)}% versus the prior 90 days`,
        evidence: `trailing_90d=${entry.current.toFixed(2)} ${entry.currency} (n=${entry.currentCount}) vs prior_90d=${entry.prior.toFixed(2)} ${entry.currency}`,
        recommendation: `Investigate drivers before approving further ${entry.currency} spend in this category; report-only, no records are changed.` });
    }
  }

  const high = findings.filter((f) => f.severity === "high").length;
  const warning = findings.filter((f) => f.severity === "warning").length;
  const info = findings.filter((f) => f.severity === "info").length;
  return {
    unchanged: true as const,
    findings,
    summary: { high, warning, info, total: findings.length, approved_records_analysed: approved.length, budgets_evaluated: budgets.length },
    evidence: "jd_business_expenses",
    generated_at: now.toISOString(),
    limitations: [
      "Only approved/paid expenses are analysed; submitted-but-unreviewed spend is out of scope by design.",
      "Currencies are never summed across one another; comparisons stay within a single currency.",
      "Statistical outliers require at least five samples per category+currency; below that, no outlier findings are emitted.",
      "Findings are advisory; JD performs no writes, voids, refunds or budget changes from this analysis.",
    ],
  };
}
