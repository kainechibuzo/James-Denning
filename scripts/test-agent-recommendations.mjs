import test from "node:test";
import assert from "node:assert/strict";
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
