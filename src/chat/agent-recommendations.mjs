import { EMPLOYEE_USAGE_PRICE } from "../config/billing.mjs";

const HOURLY_USD = Number(EMPLOYEE_USAGE_PRICE?.amountMinorPerHour ?? 100) / 100;
const formatUsd = (amount) => {
  const rounded = Math.round(amount * 100) / 100;
  return Number.isInteger(rounded) ? `$${rounded}` : `$${rounded.toFixed(2)}`;
};

export const SPECIALISTS = [
  {
    id: "software_engineer",
    name: "Software Engineer",
    displayLabel: "Frontend Developer Agent",
    shortCode: "</>",
    estMinutes: 30,
    terms: [/debug/i, /implement/i, /codebase/i, /architecture/i, /software build/i, /technical review/i, /frontend/i, /website/i, /saas/i, /landing page/i, /app\b/i],
  },
  {
    id: "research_analyst",
    name: "Research Analyst",
    displayLabel: "Market Research Analyst",
    shortCode: "RS",
    estMinutes: 30,
    terms: [/research/i, /market size/i, /competitor/i, /customer demand/i, /industry trends/i, /million-dollar ideas/i],
  },
  {
    id: "finance_analyst",
    name: "Finance Analyst",
    displayLabel: "Finance & Forecast Analyst",
    shortCode: "FN",
    estMinutes: 30,
    terms: [/financial model/i, /cash flow/i, /budget/i, /unit economics/i, /forecast/i, /profitability/i],
  },
  {
    id: "security_reviewer",
    name: "Security Reviewer",
    displayLabel: "Security Review Agent",
    shortCode: "SC",
    estMinutes: 30,
    terms: [/security audit/i, /vulnerability/i, /threat model/i, /penetration test/i, /rls policy/i],
  },
  {
    id: "product_designer",
    name: "Product Designer",
    displayLabel: "Product & UX Designer",
    shortCode: "UX",
    estMinutes: 30,
    terms: [/user experience/i, /ux review/i, /user journey/i, /interface design/i, /accessibility/i, /wireframe/i],
  },
  {
    id: "operations_planner",
    name: "Operations Planner",
    displayLabel: "Operations Planner Agent",
    shortCode: "OP",
    estMinutes: 30,
    terms: [/operations plan/i, /logistics plan/i, /workflow/i, /operating procedure/i, /process design/i, /launch plan/i],
  },
  {
    id: "business_advisor",
    name: "Business Advisor",
    displayLabel: "Business Strategy Advisor",
    shortCode: "BA",
    estMinutes: 30,
    terms: [/business strategy/i, /business ideas/i, /go-to-market/i, /business model/i, /growth strategy/i],
  },
  {
    id: "quality_assurance",
    name: "Quality Assurance Analyst",
    displayLabel: "Quality Assurance Agent",
    shortCode: "QA",
    estMinutes: 30,
    terms: [/test plan/i, /quality assurance/i, /qa review/i, /acceptance criteria/i, /regression test/i],
  },
];

export const SPECIALIST_TEAM_PRESETS = [
  {
    id: "full_product_launch_team",
    letter: "A",
    title: "Full Product Launch Team",
    recommended: true,
    agentCount: 4,
    leadSpecialist: "software_engineer",
    categories: ["software", "strategy", "ux"],
    deliverables: [
      "Market & competitor research",
      "Product positioning & UX plan",
      "Frontend & backend architecture",
      "QA testing & launch readiness",
    ],
    estHoursMin: 1.5,
    estHoursMax: 2.5,
    estTimeLabel: "1.5–2.5 hrs",
  },
  {
    id: "lean_mvp_builder_team",
    letter: "B",
    title: "Lean MVP Builder Team",
    recommended: false,
    agentCount: 3,
    leadSpecialist: "product_designer",
    categories: ["software", "ux"],
    deliverables: [
      "Product & UX design",
      "Core web app development",
      "Basic QA & deployment checklist",
    ],
    estHoursMin: 1,
    estHoursMax: 2,
    estTimeLabel: "1–2 hrs",
  },
  {
    id: "market_research_strategy_team",
    letter: "C",
    title: "Market Research & Strategy Team",
    recommended: false,
    agentCount: 2,
    leadSpecialist: "research_analyst",
    categories: ["research", "strategy", "finance"],
    deliverables: [
      "Market size & competitor analysis",
      "Business model & pricing strategy",
      "Customer persona insights",
    ],
    estHoursMin: 0.75,
    estHoursMax: 1.25,
    estTimeLabel: "45–75 mins",
  },
  {
    id: "operations_setup_team",
    letter: "D",
    title: "Operations & Execution Team",
    recommended: false,
    agentCount: 3,
    leadSpecialist: "operations_planner",
    categories: ["operations", "security", "qa"],
    deliverables: [
      "Sequenced operational workflow",
      "Permissions & risk boundary review",
      "Acceptance & verification register",
    ],
    estHoursMin: 1,
    estHoursMax: 1.75,
    estTimeLabel: "1–1.75 hrs",
  },
];

export function formatTeamEstimate(team) {
  const hourlyRate = team.agentCount * HOURLY_USD;
  const minCost = hourlyRate * team.estHoursMin;
  const maxCost = hourlyRate * team.estHoursMax;
  return {
    hourlyRate,
    rateLabel: `${formatUsd(hourlyRate)} / hour`,
    estTimeLabel: team.estTimeLabel,
    estCostLabel: `${formatUsd(minCost)}–${formatUsd(maxCost)}`,
  };
}

export function formatSingleAgentEstimate(seconds = 1800) {
  const hours = Math.max(0.25, Number(seconds || 1800) / 3600);
  const cost = HOURLY_USD * hours;
  const mins = Math.round(hours * 60);
  return {
    hourlyRate: HOURLY_USD,
    rateLabel: `${formatUsd(HOURLY_USD)} / hour`,
    estTimeLabel: mins >= 60 ? `${hours % 1 === 0 ? hours : hours.toFixed(1)} ${hours === 1 ? "hr" : "hrs"}` : `${mins} mins`,
    estCostLabel: formatUsd(cost),
  };
}

export function recommendSpecialist(text) {
  const value = String(text || "").trim();
  if (value.length < 18) return null;
  const scored = SPECIALISTS.map((agent) => ({
    ...agent,
    score: agent.terms.reduce((sum, pattern) => sum + (pattern.test(value) ? 1 : 0), 0),
  })).sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best || best.score === 0) return null;
  return { id: best.id, name: best.name, displayLabel: best.displayLabel, task: value.slice(0, 1200) };
}

export function recommendSpecialistTeams(text, preferredSpecialistId = null) {
  const lead = preferredSpecialistId || recommendSpecialist(text)?.id || "software_engineer";
  return SPECIALIST_TEAM_PRESETS.map((preset) => {
    const isMatch = preset.leadSpecialist === lead;
    return {
      ...preset,
      recommended: isMatch || (preset.id === "full_product_launch_team" && !SPECIALIST_TEAM_PRESETS.some((p) => p.leadSpecialist === lead)),
      ...formatTeamEstimate(preset),
    };
  });
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
