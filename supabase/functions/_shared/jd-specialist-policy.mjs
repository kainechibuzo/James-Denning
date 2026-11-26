// Deterministic specialist triage and decision policy baked into JD.
// Shared across the Edge Function runtime (TypeScript/Deno) and the React chat UI.
// Pure module: no Deno APIs, no model calls, no database writes, and no authority grants.
// Approval, pricing, spend caps and execution remain strictly server-enforced.

export const SPECIALIST_ROLES = Object.freeze([
  Object.freeze({
    id: "software_engineer",
    name: "Software Engineer",
    displayLabel: "Frontend Developer Agent",
    shortCode: "</>",
    estMinutes: 30,
    whenToCall: "Software architecture, frontend/backend implementation planning, debugging, repository code review, technical specifications and SaaS/website builds.",
    whenNotToCall: "Simple syntax questions, single-sentence conceptual explanations, or unapproved live code changes.",
    signals: [
      /\b(debug|implement|codebase|architecture|software build|technical review|frontend|backend|website|saas|landing page|api design|database schema|refactor|app)\b/i,
    ],
  }),
  Object.freeze({
    id: "research_analyst",
    name: "Research Analyst",
    displayLabel: "Market Research Analyst",
    shortCode: "RS",
    estMinutes: 30,
    whenToCall: "Market sizing, competitor comparisons, customer demand synthesis, pricing benchmarks, evidence synthesis and structured opportunity assessment.",
    whenNotToCall: "Quick factual definitions, workspace status checks, or claiming unverified live web browsing.",
    signals: [
      /\b(research|market size|competitors?|customer demand|industry trends|million-dollar ideas|benchmark|competitive landscape|demand validation|market analysis)\b/i,
    ],
  }),
  Object.freeze({
    id: "finance_analyst",
    name: "Finance Analyst",
    displayLabel: "Finance & Forecast Analyst",
    shortCode: "FN",
    estMinutes: 30,
    whenToCall: "Financial modelling, cash-flow projections, unit economics, budget reconciliation, pricing margin analysis, runway and expense anomaly review.",
    whenNotToCall: "Reading a single invoice total, regulated investment advice, or initiating payments.",
    signals: [
      /\b(financial model|cash[ -]?flow|budget|unit economics|forecast|profitability|margin|runway|reconcil(?:e|iation)|burn rate|pricing model|cost structure)\b/i,
    ],
  }),
  Object.freeze({
    id: "security_reviewer",
    name: "Security Reviewer",
    displayLabel: "Security Review Agent",
    shortCode: "SC",
    estMinutes: 30,
    whenToCall: "Threat modelling, permission and tenant-isolation audits, RLS policy review, secret handling, OAuth/connector risk boundaries and abuse-case analysis.",
    whenNotToCall: "Routine password-reset questions or claiming a live penetration test was executed.",
    signals: [
      /\b(security audit|security review|vulnerabilit(?:y|ies)|threat model|penetration test|rls policy|tenant isolation|access control audit|compliance risk|auth(?:entication|orization) review)\b/i,
    ],
  }),
  Object.freeze({
    id: "product_designer",
    name: "Product Designer",
    displayLabel: "Product & UX Designer",
    shortCode: "UX",
    estMinutes: 30,
    whenToCall: "User journeys, onboarding flows, interface hierarchy, responsive layout critique, accessibility (WCAG) audits, wireframes and UX acceptance criteria.",
    whenNotToCall: "Trivial label wording tweaks or single CSS property lookups.",
    signals: [
      /\b(user experience|ux review|ux design|user journey|interface design|accessibility|wcag|wireframes?|onboarding flow|design system|usability)\b/i,
    ],
  }),
  Object.freeze({
    id: "operations_planner",
    name: "Operations Planner",
    displayLabel: "Operations Planner Agent",
    shortCode: "OP",
    estMinutes: 30,
    whenToCall: "Multi-step operational rollouts, SOPs, logistics/dispatch workflows, department handoffs, launch readiness sequencing, SLAs and dependency mapping.",
    whenNotToCall: "Checking today's open task count or toggling a single checklist item.",
    signals: [
      /\b(operations plan|logistics plan|workflow|operating procedure|\bsop\b|process design|launch plan|rollout plan|supply chain|fulfilment|dispatch plan|capacity plan)\b/i,
    ],
  }),
  Object.freeze({
    id: "business_advisor",
    name: "Business Advisor",
    displayLabel: "Business Strategy Advisor",
    shortCode: "BA",
    estMinutes: 30,
    whenToCall: "Go-to-market strategy, business model trade-offs, positioning, expansion decisions, board/investor decision briefs and strategic risk registers.",
    whenNotToCall: "Greetings, workspace navigation questions, or irreversible legal/commercial commitments.",
    signals: [
      /\b(business strategy|business ideas|go-to-market|\bgtm\b|business model|growth strategy|strategic plan|market entry|positioning|moneti[sz]ation|value proposition)\b/i,
    ],
  }),
  Object.freeze({
    id: "quality_assurance",
    name: "Quality Assurance Analyst",
    displayLabel: "Quality Assurance Agent",
    shortCode: "QA",
    estMinutes: 30,
    whenToCall: "End-to-end test plans, regression matrices, edge-case discovery, release readiness gates and measurable acceptance criteria.",
    whenNotToCall: "Claiming automated tests were executed when no test runner ran.",
    signals: [
      /\b(test plan|quality assurance|qa review|acceptance criteria|regression test|edge cases|release readiness|verification matrix|test coverage)\b/i,
    ],
  }),
]);

// Direct lookup, greeting, or single-step status checks where JD must answer
// directly with its own read tools rather than proposing paid specialists.
const DIRECT_HANDLING_PATTERNS = [
  /^(hi|hello|hey|good\s+(morning|afternoon|evening)|thanks|thank\s+you|ok|okay|got\s+it)\b[!.,?\s]*$/i,
  /^(what\s+can\s+you\s+do|help|who\s+are\s+you|what\s+tools\s+do\s+you\s+have)\b[?.!\s]*$/i,
  /^(how\s+many|count|show|list|check|what\s+is\s+the\s+status\s+of)\s+(my|our|the|current|open|pending|active)\s+(tasks?|approvals?|departments?|members?|staff|emails?|announcements?|runs?)\b[?.!\s]*$/i,
];

const MULTI_DOMAIN_CUES = /\b(end-to-end|full\s+launch|complete\s+plan|from\s+scratch|build\s+and\s+launch|go-to-market\s+and|architecture\s+and|research\s+and|comprehensive|multi-step|across\s+departments)\b/i;

function countPatternMatches(value, patterns) {
  let hits = 0;
  for (const pattern of patterns) {
    const flags = pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g";
    const matches = value.match(new RegExp(pattern.source, flags));
    if (matches) hits += matches.length;
  }
  return hits;
}

/**
 * Evaluate a user prompt and conversation context to decide whether JD should:
 * 1. Handle directly (`direct`) — greetings, capability checks, single-tool status reads, or short prompts.
 * 2. Recommend a single specialist (`single_specialist`) — deep, bounded work in one specialist domain.
 * 3. Recommend a coordinated specialist team (`specialist_team`) — cross-functional or multi-domain objectives.
 * 4. Execute an already-approved specialist (`execute_approved_specialist`) — when `hasApprovedProposal` is true.
 */
export function assessSpecialistNeed(prompt, options = {}) {
  const value = String(prompt || "").trim();
  const approvedRole = typeof options.approvedSpecialistRole === "string" ? options.approvedSpecialistRole : null;

  if (approvedRole) {
    const spec = SPECIALIST_ROLES.find((role) => role.id === approvedRole) || null;
    if (spec) {
      return {
        decision: "execute_approved_specialist",
        shouldCallSpecialist: true,
        mode: "single",
        primary: { id: spec.id, name: spec.name, displayLabel: spec.displayLabel },
        matchedSpecialists: [{ id: spec.id, name: spec.name, displayLabel: spec.displayLabel, score: 10 }],
        reason: `This run has a linked, user-approved specialist authorisation for ${spec.name}; invoke delegate_to_specialist_agent once within the approved time cap.`,
        task: value.slice(0, 1200),
      };
    }
  }

  if (value.length < 18 || DIRECT_HANDLING_PATTERNS.some((pattern) => pattern.test(value))) {
    return {
      decision: "handle_directly",
      shouldCallSpecialist: false,
      mode: "none",
      primary: null,
      matchedSpecialists: [],
      reason: "Routine conversation, capability lookup or direct workspace status check — JD handles this directly without specialist overhead.",
      task: "",
    };
  }

  const scored = SPECIALIST_ROLES.map((role) => ({
    id: role.id,
    name: role.name,
    displayLabel: role.displayLabel,
    whenToCall: role.whenToCall,
    score: countPatternMatches(value, role.signals),
  }))
    .filter((role) => role.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) {
    return {
      decision: "handle_directly",
      shouldCallSpecialist: false,
      mode: "none",
      primary: null,
      matchedSpecialists: [],
      reason: "No specialist domain depth required — JD can answer or use standard read-only workspace tools directly.",
      task: "",
    };
  }

  const primary = scored[0];
  const needsTeam = scored.length >= 2 || (MULTI_DOMAIN_CUES.test(value) && value.length >= 45);

  return {
    decision: needsTeam ? "recommend_specialist_team" : "recommend_single_specialist",
    shouldCallSpecialist: true,
    mode: needsTeam ? "team" : "single",
    primary: { id: primary.id, name: primary.name, displayLabel: primary.displayLabel },
    matchedSpecialists: scored.slice(0, 4),
    reason: needsTeam
      ? `Cross-functional objective spanning ${scored.slice(0, 3).map((s) => s.name).join(", ")}; JD should frame the plan and recommend a coordinated specialist team or lead specialist for approval before delegating.`
      : `Focused ${primary.name} work (${primary.whenToCall.toLowerCase()}); JD should answer what it can verify directly and offer ${primary.name} for bounded specialist depth upon approval.`,
    task: value.slice(0, 1200),
  };
}

/**
 * Baked-in system doctrine teaching JD exactly when NOT to call specialists,
 * when to call a single specialist vs. a specialist team, how the eight built-in
 * specialists map to domains, and how approval/quote/roster gates govern execution.
 */
export const SPECIALIST_DECISION_POLICY = [
  "Specialist triage and delegation judgment (baked-in operating instinct — apply on every turn):",
  "1. Decide first whether the request needs JD alone, one specialist, or a coordinated specialist team:",
  "   - Handle DIRECTLY yourself (never suggest or call specialists) for greetings, short factual questions, capability questions, single-step workspace status lookups (counts, open tasks, pending approvals, department lists, recent activity), simple edits, or routine administrative turns where your own read-only tools already give the complete answer.",
  "   - Call or recommend ONE specialist when the user asks for deep, domain-specific analysis, design, review or structured deliverables in one discipline:",
  "     * business_advisor (Business Advisor) — go-to-market, business models, positioning, strategic trade-offs and executive decision briefs.",
  "     * research_analyst (Research Analyst) — market sizing, competitor breakdowns, customer demand, pricing benchmarks and evidence synthesis.",
  "     * finance_analyst (Finance Analyst) — financial models, cash-flow forecasts, unit economics, margin/runway analysis and budget reconciliation.",
  "     * operations_planner (Operations Planner) — rollout sequencing, SOPs, logistics/dispatch workflows, SLAs and cross-department dependencies.",
  "     * product_designer (Product Designer) — user journeys, UX flows, wireframes, responsive usability and WCAG accessibility criteria.",
  "     * software_engineer (Software Engineer) — system architecture, frontend/backend implementation plans, debugging and connected repository code review.",
  "     * security_reviewer (Security Reviewer) — threat models, permissions, tenant isolation, RLS boundaries, secrets and abuse cases.",
  "     * quality_assurance (Quality Assurance Analyst) — test plans, regression matrices, edge cases and release acceptance criteria.",
  "   - Recommend a SPECIALIST TEAM (2–4 complementary roles) when an objective is broad, outcome-oriented or spans multiple disciplines (for example launching a SaaS product, validating and pricing a new venture, or designing and auditing an operational rollout).",
  "2. Respect the exact execution gate before invoking a specialist tool:",
  "   - WHEN AN APPROVED PROPOSAL IS LINKED TO THIS RUN: invoke delegate_to_specialist_agent immediately for that exact authorised specialist role, passing the concrete objective and confirmed workspace context, within the approved time allocation and spend cap. Synthesise and verify the returned specialist report into one accountable JD answer.",
  "   - WHEN NO APPROVED PROPOSAL IS LINKED YET and specialist depth would materially improve the outcome: do NOT call delegate_to_specialist_agent unapproved (the runtime will block unapproved spend). Instead, deliver immediate value from what you can check directly, proactively name the specific specialist role(s) JD recommends calling next, state what concrete deliverable each specialist will produce and why it fits, and invite the user to review the time/cost quote and approve before execution.",
  "   - WHEN ASSIGNING TO HIRED AI EMPLOYEES OR TEAMS: inspect get_workforce_roster first so recommendations and assignments reflect real active workspace employees, team memberships and current workload.",
].join("\n");

/**
 * Per-turn triage hint injected into JD's runtime instructions based on the
 * current prompt and whether a linked specialist approval exists on this run.
 */
export function buildTurnSpecialistGuidance(prompt, options = {}) {
  const assessment = assessSpecialistNeed(prompt, options);
  if (assessment.decision === "execute_approved_specialist" && assessment.primary) {
    return `Current turn specialist triage: APPROVED SPECIALIST RUN (${assessment.primary.id} — ${assessment.primary.name}). Invoke delegate_to_specialist_agent for "${assessment.primary.id}" on the resolved user objective, then independently verify and synthesise its report.`;
  }
  if (assessment.decision === "handle_directly") {
    return "Current turn specialist triage: DIRECT JD HANDLING. Complete this turn directly using your own reasoning and relevant read-only workspace tools; do not call delegate_to_specialist_agent or push unnecessary specialist recommendations.";
  }
  const names = assessment.matchedSpecialists.map((s) => `${s.name} (${s.id})`).join(", ");
  return `Current turn specialist triage: ${assessment.mode === "team" ? "MULTI-SPECIALIST OBJECTIVE" : "SINGLE-SPECIALIST DEPTH"} — matched role(s): ${names}. Unless an approved specialist proposal is linked to this run, do NOT invoke delegate_to_specialist_agent yet; provide helpful initial framing/checks and clearly recommend ${assessment.mode === "team" ? "the relevant specialist team" : assessment.primary?.name} with concrete deliverables so the user can approve the quote and run.`;
}
