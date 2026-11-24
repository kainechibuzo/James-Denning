import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {recommendSpecialist,extractAgentDeliverables} from "../src/chat/agent-recommendations.mjs";

test("recommends a research analyst for explicit market research requests",()=>{
  const result=recommendSpecialist("Research market size, competitors and customer demand for a new logistics SaaS");
  assert.equal(result?.id,"research_analyst");
  assert.equal(result?.name,"Research Analyst");
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
  const migration=readFileSync(new URL("../supabase/migrations/20261124130000_jd_specialist_run_approval_billing.sql",import.meta.url),"utf8");
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
