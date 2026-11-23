import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const runtime = readFileSync("supabase/functions/_shared/jd-agent-runtime.ts", "utf8");
const contract = readFileSync("supabase/functions/_shared/jd-capability-contract.ts", "utf8");
const review = readFileSync("src/chat/ReviewCentre.jsx", "utf8");

test("JD can submit an individual AI employee proposal for owner review", () => {
  assert.match(runtime, /kind: \{ type: "string", enum: \["employee","team"\] \}/);
  assert.match(runtime, /workforce\.employee\.proposal/);
  assert.match(review, /workforce\.employee\.proposal/);
  assert.match(review, /AI employee proposal/);
});

test("JD can submit a drafted team with member roles, responsibilities and access requests", () => {
  assert.match(runtime, /members: \{ type: "array", minItems: 1, maxItems: 20/);
  assert.match(runtime, /workforce\.team\.proposal/);
  assert.match(review, /Drafted AI team/);
  assert.match(review, /proposal\.members/);
});

test("approval never implies employee activation, tool grants or billable work", () => {
  assert.match(runtime, /activated: false, tools_granted: false, billing_enabled: false/);
  assert.match(runtime, /reused_existing_request: true/);
  assert.match(contract, /submit_workforce_proposal_for_review: \{effect:"approval_request"/);
  assert.match(review, /Approval records your decision only/);
  assert.match(review, /Proposal approved\. No employee or team has been activated/);
});
