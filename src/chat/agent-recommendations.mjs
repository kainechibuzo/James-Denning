import { AGENTIC_TIME_PRICE } from "../config/billing.mjs";
import {
  SPECIALIST_ROLES,
  SPECIALIST_DECISION_POLICY,
  assessSpecialistNeed,
  buildTurnSpecialistGuidance,
} from "../../supabase/functions/_shared/jd-specialist-policy.mjs";

const DEFAULT_AGENTIC_HOURLY_USD = Number(AGENTIC_TIME_PRICE?.defaultRateMinorPerHour ?? 10_000) / 100;
const formatUsd = (amount) => {
  const rounded = Math.round(amount * 100) / 100;
  return Number.isInteger(rounded) ? `$${rounded}` : `$${rounded.toFixed(2)}`;
};

export { SPECIALIST_DECISION_POLICY, assessSpecialistNeed, buildTurnSpecialistGuidance };

export const SPECIALISTS = SPECIALIST_ROLES.map((role) => ({
  id: role.id,
  name: role.name,
  displayLabel: role.displayLabel,
  shortCode: role.shortCode,
  estMinutes: role.estMinutes,
  whenToCall: role.whenToCall,
  whenNotToCall: role.whenNotToCall,
  terms: role.signals,
}));

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
  return {
    rateLabel: "Individual quotes required",
    estTimeLabel: team.estTimeLabel,
    estCostLabel: "Not yet quoted",
    executionAvailable: false,
  };
}

export function formatSingleAgentEstimate(seconds = 1800) {
  const hours = Math.max(0.25, Number(seconds || 1800) / 3600);
  const cost = DEFAULT_AGENTIC_HOURLY_USD * hours;
  const mins = Math.round(hours * 60);
  return {
    hourlyRate: DEFAULT_AGENTIC_HOURLY_USD,
    rateLabel: `${formatUsd(DEFAULT_AGENTIC_HOURLY_USD)} / hour (indicative default)`,
    estTimeLabel: mins >= 60 ? `${hours % 1 === 0 ? hours : hours.toFixed(1)} ${hours === 1 ? "hr" : "hrs"}` : `${mins} mins`,
    estCostLabel: `${formatUsd(cost)} (indicative only)`,
  };
}

export function recommendSpecialist(text) {
  const assessment = assessSpecialistNeed(text);
  if (!assessment.shouldCallSpecialist || !assessment.primary) return null;
  return {
    id: assessment.primary.id,
    name: assessment.primary.name,
    displayLabel: assessment.primary.displayLabel,
    mode: assessment.mode,
    decision: assessment.decision,
    matchedSpecialists: assessment.matchedSpecialists,
    reason: assessment.reason,
    task: assessment.task,
  };
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
