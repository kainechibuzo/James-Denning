const SPECIALISTS = [
  { id: "research_analyst", name: "Research Analyst", terms: [/research/i,/market size/i,/competitor/i,/customer demand/i,/industry trends/i,/million-dollar ideas/i] },
  { id: "finance_analyst", name: "Finance Analyst", terms: [/financial model/i,/cash flow/i,/budget/i,/unit economics/i,/forecast/i,/profitability/i] },
  { id: "software_engineer", name: "Software Engineer", terms: [/debug/i,/implement/i,/codebase/i,/architecture/i,/software build/i,/technical review/i] },
  { id: "security_reviewer", name: "Security Reviewer", terms: [/security audit/i,/vulnerability/i,/threat model/i,/penetration test/i,/rls policy/i] },
  { id: "product_designer", name: "Product Designer", terms: [/user experience/i,/ux review/i,/user journey/i,/interface design/i,/accessibility/i] },
  { id: "operations_planner", name: "Operations Planner", terms: [/operations plan/i,/logistics plan/i,/workflow/i,/operating procedure/i,/process design/i] },
  { id: "business_advisor", name: "Business Advisor", terms: [/business strategy/i,/business ideas/i,/go-to-market/i,/business model/i,/growth strategy/i] },
  { id: "quality_assurance", name: "Quality Assurance Analyst", terms: [/test plan/i,/quality assurance/i,/qa review/i,/acceptance criteria/i,/regression test/i] },
];

export function recommendSpecialist(text) {
  const value = String(text || "").trim();
  if (value.length < 18) return null;
  const scored = SPECIALISTS.map((agent) => ({
    ...agent,
    score: agent.terms.reduce((sum, pattern) => sum + (pattern.test(value) ? 1 : 0), 0),
  })).sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best || best.score === 0) return null;
  return { id: best.id, name: best.name, task: value.slice(0, 1200) };
}

export function extractAgentDeliverables(events = []) {
  const found = [];
  for (const event of Array.isArray(events) ? events : []) {
    if (event?.name !== "delegate_to_specialist_agent" || event?.status !== "completed") continue;
    let payload;
    try { payload = typeof event.toolOutput === "string" ? JSON.parse(event.toolOutput) : event.toolOutput; } catch { continue; }
    const result = payload?.result || payload?.data?.result;
    if (!result || typeof result.report !== "string" || !result.report.trim()) continue;
    found.push({
      id: String(result.agent_id || result.agent_role || "specialist"),
      role: String(result.agent_role || "specialist").replaceAll("_", " "),
      status: String(result.status || "report_returned"),
      scope: String(result.execution_scope || "unknown"),
      report: result.report.trim(),
    });
  }
  return found;
}
