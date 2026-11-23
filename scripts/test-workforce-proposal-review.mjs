import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const runtime = readFileSync("supabase/functions/_shared/jd-agent-runtime.ts", "utf8");
const contract = readFileSync("supabase/functions/_shared/jd-capability-contract.ts", "utf8");
const review = readFileSync("src/chat/ReviewCentre.jsx", "utf8");
const workforceService = readFileSync("supabase/functions/_shared/jd-workforce-control-service.ts", "utf8");
const workforceMigration = readFileSync("supabase/migrations/20261124170000_jd_approved_workforce_activation.sql", "utf8");
const workforceRollback = readFileSync("supabase/migrations/20261124170000_jd_approved_workforce_activation.rollback.sql", "utf8");
const workforceUi = readFileSync("src/chat/WorkforceControlCentre.jsx", "utf8");
const privateChatMigration = readFileSync("supabase/migrations/20261124180000_jd_workforce_private_chat.sql", "utf8");
const assignmentAttribution = readFileSync("supabase/migrations/20261124190000_jd_employee_assignment_attribution.sql", "utf8");
const registryCatalogueMigration = readFileSync("supabase/migrations/20261124195000_jd_workforce_specialist_catalogue.sql", "utf8");

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

test("employee and team activation is bound to an approved Review Centre proposal", () => {
  assert.match(runtime, /specialist_kind: \{ type: "string", enum: \["builtin","registry"\] \}/);
  assert.match(runtime, /specialist_ref: \{ type: "string", minLength: 1, maxLength: 120 \}/);
  assert.match(runtime, /specialist_version: \{ type: "integer", minimum: 1 \}/);
  assert.match(runtime, /name:"get_published_workforce_specialists"/);
  assert.match(runtime, /jd_list_workforce_specialists/);
  assert.match(workforceMigration, /specialist_kind='registry'/);
  assert.match(workforceMigration, /execution_authorized is true/);
  assert.match(registryCatalogueMigration, /limit 500/);
  assert.match(runtime, /required: \["kind","specialist_kind","specialist_ref","name","department","purpose","responsibilities","requested_access"\]/);
  assert.match(runtime, /member\.specialist_ref/);
  assert.match(review, /workforce\.proposal\.activate/);
  assert.match(review, /Activate approved/);
  assert.match(review, /proposal\.specialist_name/);
  assert.match(review, /member\.specialist_name/);
  assert.match(workforceService, /jd_workforce_activate_approved_proposal/);
  assert.match(workforceService, /can only be created by activating an explicitly approved Review Centre proposal/);
  assert.match(workforceMigration, /Only an explicitly approved proposal can be activated/);
  assert.match(workforceMigration, /v_approval\.status is distinct from 'approved'/);
  assert.match(workforceMigration, /workforce\.employee\.proposal/);
  assert.match(workforceMigration, /workforce\.team\.proposal/);
  assert.match(workforceMigration, /jd_workforce_proposal_activations/);
  assert.match(workforceMigration, /workforce\.proposal\.activated/);
  assert.match(workforceMigration, /The approval ID is the durable idempotency key/);
  assert.match(workforceMigration, /v_existing\.receipt\|\|jsonb_build_object\('replayed',true/);
});

test("identity creation cannot bypass owner approval and does not grant execution or billing", () => {
  assert.match(workforceService, /workforce\.employee\.create.*workforce\.team\.create/);
  assert.match(workforceService, /can only be created by activating an explicitly approved Review Centre proposal/);
  assert.match(workforceMigration, /revoke execute on function public\.jd_workforce_create_employee[\s\S]*from service_role/);
  assert.match(workforceMigration, /revoke execute on function public\.jd_workforce_create_team[\s\S]*from service_role/);
  assert.match(workforceMigration, /'tools_granted',\s*false/);
  assert.match(workforceMigration, /'connectors_authorised',\s*false/);
  assert.match(workforceMigration, /'assignment_started',\s*false/);
  assert.match(workforceMigration, /'billing_enabled',\s*false/);
  assert.match(workforceMigration, /add column role_title text/);
  assert.match(workforceMigration, /add column requested_access jsonb/);
  assert.doesNotMatch(workforceUi, /workforce\.employee\.create|workforce\.team\.create/);
});

test("approval decisions support both owner and admin roles", () => {
  assert.match(workforceMigration, /role in \('owner','admin'\)/);
  assert.match(workforceMigration, /create or replace function public\.jd_decide_approval/);
});

test("private specialist conversations are separate, append-only and have no tool authority", () => {
  assert.match(privateChatMigration, /jd_workforce_agent_threads/);
  assert.match(privateChatMigration, /jd_workforce_agent_messages/);
  assert.match(privateChatMigration, /add column request_id uuid/);
  assert.match(privateChatMigration, /add column reply_to_message_id uuid/);
  assert.match(privateChatMigration, /jd_workforce_agent_messages_immutable/);
  assert.match(privateChatMigration, /usage_json jsonb not null/);
  assert.match(runtime, /runPrivateSpecialistReply/);
  assert.match(runtime, /tools: \[\]/);
  assert.match(runtime, /tool_choice: "none"/);
  assert.match(workforceService, /JD_WORKFORCE_PRIVATE_CHAT_ENABLED/);
  assert.match(workforceService, /jd_agent_definition_versions/);
  assert.match(workforceService, /specialistInstructions/);
  assert.match(runtime, /Pinned specialist reference instructions/);
  assert.match(runtime, /untrusted descriptive content/);
  assert.doesNotMatch(workforceService, /Private chat is currently available for built-in specialist employees only/);
  assert.match(workforceService, /workforce\.agent\.message\.send/);
  assert.match(workforceService, /workforce\.agent\.message\.replied/);
});

test("employee-bound assignments verify active employee and team membership", () => {
  assert.match(runtime, /name:"get_workforce_roster"/);
  assert.match(runtime, /employee_id:\{type:"string",maxLength:36\}/);
  assert.match(runtime, /team_id:\{type:"string",maxLength:36\}/);
  assert.match(runtime, /employee\.lifecycle_state !== "active"/);
  assert.match(runtime, /team\.lifecycle_state !== "active"/);
  assert.match(runtime, /membershipRows\.data/);
  assert.match(runtime, /employee_id: assignment\.employeeId \|\| null/);
  assert.match(assignmentAttribution, /add column employee_id uuid/);
  assert.match(assignmentAttribution, /add column team_id uuid/);
});

test("workforce activation rollback restores valid pre-feature SQL contracts", () => {
  assert.equal(workforceRollback.split("create or replace function public.jd_workforce_create_employee").length-1,1);
  assert.equal(workforceRollback.split("create or replace function public.jd_decide_approval").length-1,1);
  assert.ok(workforceRollback.includes("grant execute on function public.jd_workforce_create_employee(uuid,uuid,text,text,integer,text,text) to service_role"));
  assert.ok(workforceRollback.includes("grant execute on function public.jd_workforce_create_team(uuid,uuid,text,text) to service_role"));
  assert.ok(workforceRollback.includes("Cannot restore unique employee-specialist constraint while duplicate employee instances exist"));
  assert.ok(!/p_ref !~\\* '[^']*\\n grant/.test(workforceRollback));
});
