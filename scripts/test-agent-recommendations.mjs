import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  recommendSpecialist,
  recommendSpecialistTeams,
  formatSingleAgentEstimate,
  extractAgentDeliverables,
  assessSpecialistNeed,
  buildTurnSpecialistGuidance,
  SPECIALIST_DECISION_POLICY,
} from "../src/chat/agent-recommendations.mjs";

test("recommends a research analyst for explicit market research requests",()=>{
  const result=recommendSpecialist("Research market size, competitors and customer demand for a new logistics SaaS");
  assert.equal(result?.id,"research_analyst");
  assert.equal(result?.name,"Research Analyst");
});

test("bakes in deterministic specialist triage across direct handling, single-domain, multi-domain and approved runs",()=>{
  const directStatus=assessSpecialistNeed("Show my current pending approvals");
  assert.equal(directStatus.shouldCallSpecialist,false);
  assert.equal(directStatus.decision,"handle_directly");
  assert.match(buildTurnSpecialistGuidance("Show my current pending approvals"),/DIRECT JD HANDLING/);

  const singleFinance=assessSpecialistNeed("Build a 12-month cash-flow forecast and unit economics sensitivity model for our subscription tiers");
  assert.equal(singleFinance.shouldCallSpecialist,true);
  assert.equal(singleFinance.decision,"recommend_single_specialist");
  assert.equal(singleFinance.mode,"single");
  assert.equal(singleFinance.primary?.id,"finance_analyst");
  assert.match(buildTurnSpecialistGuidance("Build a 12-month cash-flow forecast and unit economics sensitivity model"),/SINGLE-SPECIALIST DEPTH.*Finance Analyst \(finance_analyst\)/);

  const singleSecurity=assessSpecialistNeed("Run a threat model and tenant isolation RLS policy review for our multi-tenant API");
  assert.equal(singleSecurity.decision,"recommend_single_specialist");
  assert.equal(singleSecurity.primary?.id,"security_reviewer");

  const multiDomain=assessSpecialistNeed("Build and launch our SaaS website with market research, UX onboarding flow, backend architecture and QA test plan");
  assert.equal(multiDomain.shouldCallSpecialist,true);
  assert.equal(multiDomain.decision,"recommend_specialist_team");
  assert.equal(multiDomain.mode,"team");
  assert.ok(multiDomain.matchedSpecialists.length>=3);
  assert.match(buildTurnSpecialistGuidance("Build and launch our SaaS website with market research, UX onboarding flow and QA test plan"),/MULTI-SPECIALIST OBJECTIVE/);

  const approvedRun=assessSpecialistNeed("Analyse market demand and competitor pricing",{approvedSpecialistRole:"research_analyst"});
  assert.equal(approvedRun.decision,"execute_approved_specialist");
  assert.equal(approvedRun.primary?.id,"research_analyst");
  assert.match(buildTurnSpecialistGuidance("Analyse market demand",{approvedSpecialistRole:"research_analyst"}),/APPROVED SPECIALIST RUN \(research_analyst — Research Analyst\)/);

  for(const role of ["business_advisor","research_analyst","finance_analyst","operations_planner","product_designer","software_engineer","security_reviewer","quality_assurance"]){
    assert.ok(SPECIALIST_DECISION_POLICY.includes(role),`policy includes ${role}`);
  }
});

test("builds recommended specialist teams and transparent single-agent quotes from active-hour billing config",()=>{
  const teams=recommendSpecialistTeams("Implement frontend and backend architecture for our SaaS website");
  assert.equal(teams.length,4);
  assert.equal(teams[0].title,"Full Product Launch Team");
  assert.equal(teams[0].rateLabel,"$4 / hour");
  assert.equal(teams[0].estCostLabel,"$6–$10");
  assert.equal(teams[0].recommended,true);
  const single=formatSingleAgentEstimate(1800);
  assert.equal(single.rateLabel,"$1 / hour");
  assert.equal(single.estTimeLabel,"30 mins");
  assert.equal(single.estCostLabel,"$0.50");
});

test("does not recommend an agent for short or generic messages",()=>{
  assert.equal(recommendSpecialist("Thanks"),null);
  assert.equal(recommendSpecialist("Can you help me?"),null);
});

test("attributes only completed specialist reports with readable report content",()=>{
  const events=[
    {name:"delegate_to_specialist_agent",status:"started"},
    {name:"delegate_to_specialist_agent",status:"completed",toolOutput:JSON.stringify({ok:true,result:{agent_id:"jd-specialist-research_analyst",agent_role:"research_analyst",status:"report_returned",execution_scope:"reasoning_only_no_tools",report:"Findings and assumptions."}})},
    {name:"delegate_to_specialist_agent",status:"completed",toolOutput:"not-json"},
  ];
  const reports=extractAgentDeliverables(events);
  assert.equal(reports.length,1);
  assert.equal(reports[0].role,"research analyst");
  assert.equal(reports[0].report,"Findings and assumptions.");
  assert.equal(reports[0].scope,"reasoning_only_no_tools");
});

test("does not mislabel empty or malformed tool results as agent deliverables",()=>{
  assert.deepEqual(extractAgentDeliverables([{name:"delegate_to_specialist_agent",status:"completed",toolOutput:JSON.stringify({ok:true,result:{agent_role:"research_analyst"}})}]),[]);
});

test("specialist execution is approval-gated, time-bounded and settled server-side",()=>{
  const runtime=readFileSync(new URL("../supabase/functions/_shared/jd-agent-runtime.ts",import.meta.url),"utf8");
  const submission=readFileSync(new URL("../supabase/functions/_shared/jd-chat-submission.mjs",import.meta.url),"utf8");
  const migration=readFileSync(new URL("../supabase/migrations/20261124135136_jd_specialist_run_approval_billing.sql",import.meta.url),"utf8");
  const chat=readFileSync(new URL("../src/chat/ChatHome.jsx",import.meta.url),"utf8");
  assert.match(runtime,/jd_specialist_run_start/);
  assert.match(runtime,/tool.name !== "deploy_specialist_workforce"/);
  assert.match(runtime,/Multi-agent workforce deployment is blocked/);
  assert.match(runtime,/jd_specialist_run_settle/);
  assert.match(runtime,/specialistAbort\.abort/);
  assert.match(runtime,/No valid, approved, priced specialist authorisation/);
  assert.match(submission,/jd_specialist_proposal_link_run/);
  assert.match(migration,/jd_billing_subscriptions/);
  assert.match(migration,/Workspace agent-time ceiling reached before execution/);
  assert.match(migration,/jd_specialist_run_status/);
  assert.match(chat,/agent\.proposal\.create/);
  assert.match(chat,/agent\.proposal\.approve/);
  assert.match(chat,/value=\{900\}/);
  assert.match(chat,/specialistUsage/);
  assert.doesNotMatch(chat,/!item\.toolEvents\?\.some\(event=>event\.name==="delegate_to_specialist_agent"\)/);
});
