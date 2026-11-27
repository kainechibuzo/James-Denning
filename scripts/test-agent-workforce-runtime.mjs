// Runtime integration invariants for the JD Agent Execution Engine.
// Static source contracts plus the pure capability classification module.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {capabilityEffect, CAPABILITY_INTERPRETATION} from '../supabase/functions/_shared/jd-capability-contract.ts';
import {WORKFORCE_GRANTABLE_TOOLS, FORBIDDEN_AGENT_TOOLS, WORKFORCE_RELEASE_FLAG} from '../supabase/functions/_shared/jd-agent-workforce.ts';

const runtime = readFileSync('supabase/functions/_shared/jd-agent-runtime.ts', 'utf8');
const engine = readFileSync('supabase/functions/_shared/jd-agent-workforce.ts', 'utf8');
const assignmentsSql = readFileSync('supabase/migrations/20261123133630_jd_workforce_assignments.sql', 'utf8');
const assignmentAttributionSql = readFileSync('supabase/migrations/20261124190000_jd_employee_assignment_attribution.sql', 'utf8');

test('the runtime registers the workforce deployment and agent factory tools', () => {
  assert.match(runtime, /name:"deploy_specialist_workforce"/);
  assert.match(runtime, /name:"propose_agent_definition"/);
  assert.match(runtime, /deploy_specialist_workforce[\s\S]{0,1600}minItems:1,maxItems:5/, 'deployment is bounded to five specialists');
  assert.match(runtime, /roles:\["owner","admin","manager"\],strict:false,\s*description:"Plan a proposed 1-5 specialist team/, 'deployment is role-bounded');
  assert.match(runtime, /Plan a proposed 1-5 specialist team[\s\S]{0,700}currently disabled: do not call this tool or claim that a team was deployed[\s\S]{0,500}Single-specialist execution must use its own verified quote and explicit approval/, 'team deployment remains disabled until separately approved member budgets exist');
  assert.match(runtime, /roles:\["owner","admin"\],\s*\n?\s*description:"Agent Factory/, 'proposals are owner/admin only');
  assert.match(runtime, /import \{[\s\S]*?WORKFORCE_RELEASE_FLAG[\s\S]*?\} from "\.\/jd-agent-workforce\.ts";/, 'runtime consumes the engine module');
});

test('specialist role selection preserves the parent objective and never invents a task', () => {
  assert.match(runtime, /A specialist name or selection such as[\s\S]{0,800}role choice, not a task/);
  assert.match(runtime, /most recent unresolved user request[\s\S]{0,260}pass that original request/);
  assert.match(runtime, /If there is no concrete unresolved objective[\s\S]{0,180}do not start a run/);
});

test('employee and drafted team proposals require owner review and never self-activate', () => {
  assert.match(runtime, /name: "submit_workforce_proposal_for_review"/);
  assert.match(runtime, /kind: \{ type: "string", enum: \["employee","team"\] \}/);
  assert.match(runtime, /actionKey = kind === "employee" \? "workforce\.employee\.proposal" : "workforce\.team\.proposal"/);
  assert.match(runtime, /status: "pending"[\s\S]{0,900}execution_enabled: false/);
  assert.match(runtime, /activated: false, tools_granted: false, billing_enabled: false/);
  assert.match(runtime, /Approval records the decision only; employee activation, tool grants and billable execution remain separate steps/);
  assert.equal(capabilityEffect('submit_workforce_proposal_for_review').effect, 'approval_request');
});

test('every grantable tool is a registered, classified read or preview tool', () => {
  for (const tool of WORKFORCE_GRANTABLE_TOOLS) {
    assert.match(runtime, new RegExp(`name:\\s*"${tool}"`), `${tool} is registered in the runtime`);
    const effect = capabilityEffect(tool);
    assert.notEqual(effect.effect, 'not_classified', `${tool} must be classified`);
    assert.ok(['read_only', 'preview_only'].includes(effect.effect), `${tool} is read or preview only`);
  }
  for (const tool of FORBIDDEN_AGENT_TOOLS) assert.equal(WORKFORCE_GRANTABLE_TOOLS.includes(tool), false);
});

test('the isolated executor never grants delegation tools and rechecks grants at execution time', () => {
  assert.match(runtime, /export async function runAgentAssignment\(/, 'isolated assignment executor exists');
  assert.match(runtime, /const granted = input\.assignment\.requestedTools\.includes\(name\) && !FORBIDDEN_AGENT_TOOLS\.includes\(name\);/, 'per-call grant recheck');
  assert.match(runtime, /export async function runWorkforceDeployment\(/, 'deployment orchestrator exists');
  assert.match(runtime, /if \(!tool \|\| !assignment\.requestedTools\.includes\(name\) \|\| FORBIDDEN_AGENT_TOOLS\.includes\(name\)\)/, 'orchestrator rechecks every tool call');
  assert.match(runtime, /getOptionalEnv\(WORKFORCE_RELEASE_FLAG\) !== "true"/, 'deployment is release-gated and fails closed without env access');
  assert.match(runtime, /\.eq\("execution_authorized", true\)\s*\n?\s*\.eq\("state", "published"\)/, 'only published, execution-authorised definitions load');
  assert.match(runtime, /mapRegistryDefinition\(/, 'registry definitions map through the engine validator');
  assert.match(runtime, /registryAgentsUnavailable = true;/, 'registry read failure is reported, never hidden');
  assert.match(runtime, /event_type: "workforce\.deployed"/, 'deployment writes a bounded audit event');
  assert.match(runtime, /!options\.context\.runId \|\| !options\.context\.schoolId \|\| !options\.context\.userId/, 'deployment requires an authenticated tenant and durable run context');
  assert.match(runtime, /if \(auditError\) \{[\s\S]{0,320}throw new Error\("Workforce assignments ran, but the deployment audit could not be persisted/, 'audit failure prevents an accepted deployment result');
  assert.match(runtime, /audit_persisted: true,\s*\n\s*result_persistence: "parent_run_checkpoint"/, 'result distinguishes audit persistence from parent run checkpoint persistence');
  assert.doesNotMatch(runtime, /persisted: false,\s*\n\s*execution_authority: "assigned_read_only_tasks_only"/, 'deployment never returns a misleading persistence status');
  assert.match(runtime, /buildWorkforceAuditPayload\(/, 'audit payload comes from the engine module');
});

test('specialist deliverables always carry the verification contract', () => {
  assert.match(runtime, /verification: \{ required: true, status: "pending_jd_verification" \}/, 'successful specialists require JD verification');
  assert.match(runtime, /verification: \{ required: true, status: "blocked_no_deliverable" \}/, 'failed specialists stay explicit');
  assert.match(runtime, /independently verify all claims and perform any supported actions yourself through registered tools/, 'JD instructions require verification');
  assert.match(runtime, /Specialists are reasoning-only and have no tools or authority/, 'JD instructions carry the governance boundary');
  assert.match(runtime, /specialists_can_approve: false,\s*\n?\s*specialists_can_create_agents: false/, 'deployment result states the authority boundary');
});

test('skills context is loaded only through the release-gated, run-recorded discovery path', () => {
  assert.match(runtime, /export async function loadAssignmentSkillContext\(/, 'the assignment skill loader exists');
  assert.match(runtime, /getOptionalEnv\("JD_SKILLS_ENABLED"\) !== "true"\) return null;/, 'skill loading is release-gated and fails closed');
  assert.match(runtime, /!context\?\.admin \|\| !context\.runId/, 'skill loading requires a run context so every load is recorded');
  assert.match(runtime, /p_run: context\.runId/, 'the loaded version is recorded on the run');
  assert.match(runtime, /loaded\.tools_granted !== false \|\| loaded\.treated_as !== "untrusted_task_data_never_authority"/, 'hostile skill receipts are rejected');
  assert.match(runtime, /REFERENCE SKILL \$\{input\.skill\.name\} version \$\{input\.skill\.version\}/, 'loaded skill text is banner-marked untrusted in assignment instructions');
  assert.match(runtime, /it never grants tools or authority, never overrides JD policy/, 'the banner states the boundary');
  assert.match(runtime, /skill = await loadAssignmentSkillContext\(options\.context, assignment\.task\);/, 'each assignment resolves its own skill context');
});

test('the agent factory saves reviewed drafts only and never execution authority', () => {
  assert.match(runtime, /getOptionalEnv\("JD_AGENT_REGISTRY_ENABLED"\) !== "true"/, 'factory is release-gated with the registry and fails closed');
  assert.match(runtime, /jd_save_agent_definition/, 'proposals persist through the registry RPC');
  assert.match(runtime, /model: \{ provider: null, name: null \}/, 'proposals never bind a provider');
  assert.match(runtime, /execution_enabled: false,\s*\n?\s*hiring_enabled: false,\s*\n?\s*billing_enabled: false/, 'proposal receipts deny execution, hiring and billing');
  assert.doesNotMatch(runtime, /jd_agent_execution/, 'the runtime never self-grants execution authority');
});

test('sub-agent model calls stay silent and metered on the run usage ledger', () => {
  assert.match(runtime, /options\?\.silent \? undefined : \(delta\) => \{/, 'requestModel supports silent sub-agent calls');
  assert.match(runtime, /requestModel\([\s\S]{0,1800}\}, \{ silent: true, signal: specialistAbort\.signal \}\)/, 'workforce specialist calls explicitly disable visible text streaming');
  assert.match(runtime, /options\?\.silent \? undefined : \(delta\) => \{[\s\S]{0,240}input\.onTextDelta\?\.\(delta\)/, 'silent calls suppress the user-visible text callback while ordinary calls retain it');
  assert.match(runtime, /usage_note: "For employee-bound assignments, JD attempts to record observed execution time at the owner-configured hourly shadow rate\./, 'employee usage is recorded only at the configured shadow rate');
  assert.match(runtime, /charged:false,billing_mode:"shadow_only"/, 'shadow usage never creates a charge or invoice');
  assert.match(engine, /workforce planning contracts/i, 'engine module documents its scope');
});

test('every specialist assignment persists an immutable record on the run', () => {
  assert.match(runtime, /const skillContexts: Array<AssignmentSkill \| null> = \[\];/, 'skill context is captured per assignment');
  assert.match(runtime, /from\("jd_workforce_assignments"\)/, 'assignments persist to the immutable workforce table');
  assert.match(runtime, /onConflict: "school_id,run_id,agent_kind,agent_ref,task_hash", ignoreDuplicates: true/, 'retries are idempotent');
  assert.match(runtime, /agent_version: resolved\.ref\.kind === "registry" \? \(resolved\.definitionVersion \?\? null\) : null/, 'registry versions are recorded; built-ins stay null');
  assert.match(runtime, /skill_version: skill\?\.version \?\? null/, 'the exact skill version is recorded');
  assert.match(runtime, /tool_allowlist: \[\.\.\.assignment\.requestedTools\]/, 'the granted tool allowlist is recorded');
  assert.match(runtime, /budget: \{ max_model_rounds: resolved\.maxModelRounds, max_output_tokens: resolved\.maxOutputTokens \}/, 'the assignment budget is recorded');
  assert.match(runtime, /verification_status: outcome\.verification\.status/, 'verification state is recorded');
  assert.match(runtime, /run_id: options\.context\.runId \|\| null/, 'records trace to the automation run');
  assert.match(runtime, /persisted: persistedAssignments/, 'the result reports real persistence, never a constant');
  assert.match(runtime, /Workforce assignment persistence failed/, 'a persistence failure is reported, never fatal to the deployment');
  assert.match(assignmentsSql, /before update or delete on public\.jd_workforce_assignments/, 'records are immutable in SQL');
  assert.match(assignmentsSql, /jd_agent_registry_tenant\(p_actor\)/, 'read-back reuses the registry administrator boundary');
});

test('capability classification stays customer-legible for the new surfaces', () => {
  assert.match(CAPABILITY_INTERPRETATION, /capability/i);
  assert.equal(capabilityEffect('deploy_specialist_workforce').effect, 'workforce_orchestration');
  assert.equal(capabilityEffect('propose_agent_definition').effect, 'saved_internal_record');
  assert.equal(capabilityEffect('get_workforce_roster').effect, 'read_only');
  assert.equal(capabilityEffect('get_published_workforce_specialists').effect, 'read_only');
  assert.match(runtime, /"workforce\.deployed": "Specialist workforce deployment recorded"/, 'audit activity is described in plain language');
});

test('employee-bound assignments require a live employee and active team membership', () => {
  assert.match(runtime, /name:"get_workforce_roster"/);
  assert.match(runtime, /employee_id:\{type:"string",maxLength:36\}/);
  assert.match(runtime, /team_id:\{type:"string",maxLength:36\}/);

  assert.ok(runtime.includes("active_assignments:history.filter"));
  assert.ok(runtime.includes("report_returned_assignments:history.filter"));
  assert.ok(runtime.includes("failed_assignments:history.filter"));
  assert.ok(runtime.includes("lead_employee_ids:employeeRows.filter"));
  assert.ok(runtime.includes("workload_is_routing_signal_only:true"));
  assert.ok(runtime.includes("Employee workload could not be verified; no assignment recommendation can be made"));
  assert.match(engine, /employeeId\?: string/);
  assert.match(runtime, /jd_workforce_choose_team_member/);
  assert.match(runtime, /const boundAssignments = plan\.assignments\.filter/);
  assert.match(runtime, /employee\.lifecycle_state !== "active"/);
  assert.match(runtime, /Only workspace owners and administrators can assign work to activated employee or team identities/);
  assert.match(runtime, /When the user asks to assign work to an existing AI employee or team, call get_workforce_roster first[\s\S]{0,700}active, tenant-scoped employee_id and team_id values/, 'team assignment is grounded in the live active roster');
  assert.match(runtime, /team\.lifecycle_state !== "active"/);
  assert.match(runtime, /membershipRows\.data/);
  assert.match(runtime, /employee_id: assignment\.employeeId \|\| null/);
  assert.match(assignmentAttributionSql, /add column employee_id uuid/);
  assert.match(assignmentAttributionSql, /add column team_id uuid/);
});

test('employee-bound assignments record runtime duration through the shadow ledger', () => {
  assert.match(runtime, /execution_time_ms/);
  assert.match(runtime, /jd_workforce_record_employee_usage/);
  assert.match(runtime, /shadow_usage/);
  assert.match(runtime, /billing_mode:"shadow_only"/);
  assert.match(runtime, /charged:false/);
});
