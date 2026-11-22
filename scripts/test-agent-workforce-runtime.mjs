// Runtime integration invariants for the JD Agent Execution Engine.
// Static source contracts plus the pure capability classification module.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {capabilityEffect, CAPABILITY_INTERPRETATION} from '../supabase/functions/_shared/jd-capability-contract.ts';
import {WORKFORCE_GRANTABLE_TOOLS, FORBIDDEN_AGENT_TOOLS, WORKFORCE_RELEASE_FLAG} from '../supabase/functions/_shared/jd-agent-workforce.ts';

const runtime = readFileSync('supabase/functions/_shared/jd-agent-runtime.ts', 'utf8');
const engine = readFileSync('supabase/functions/_shared/jd-agent-workforce.ts', 'utf8');

test('the runtime registers the workforce deployment and agent factory tools', () => {
  assert.match(runtime, /name:"deploy_specialist_workforce"/);
  assert.match(runtime, /name:"propose_agent_definition"/);
  assert.match(runtime, /deploy_specialist_workforce[\s\S]{0,900}minItems:1,maxItems:5/, 'deployment is bounded to five specialists');
  assert.match(runtime, /roles:\["owner","admin","manager"\],\s*(strict:false,\s*)?description:"Deploy 1-5 specialist agents/, 'deployment is role-bounded');
  assert.match(runtime, /roles:\["owner","admin"\],\s*\n?\s*description:"Agent Factory/, 'proposals are owner/admin only');
  assert.match(runtime, /import \{[\s\S]*?WORKFORCE_RELEASE_FLAG[\s\S]*?\} from "\.\/jd-agent-workforce\.ts";/, 'runtime consumes the engine module');
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
  assert.match(runtime, /buildWorkforceAuditPayload\(/, 'audit payload comes from the engine module');
});

test('specialist deliverables always carry the verification contract', () => {
  assert.match(runtime, /verification: \{ required: true, status: "pending_jd_verification" \}/, 'successful specialists require JD verification');
  assert.match(runtime, /verification: \{ required: true, status: "blocked_no_deliverable" \}/, 'failed specialists stay explicit');
  assert.match(runtime, /independently verify every specialist deliverable against saved records or registered tools before reporting completion/, 'JD instructions require verification');
  assert.match(runtime, /Specialists have no approval, hiring, spending, deployment or agent-creation authority/, 'JD instructions carry the governance boundary');
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
  assert.match(runtime, /const skill = await loadAssignmentSkillContext\(options\.context, assignment\.task\);/, 'each assignment resolves its own skill context');
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
  assert.match(runtime, /requestModel: \(payload\) => requestModel\(payload, \{ silent: true \}\)/, 'workforce specialists never stream into the visible answer');
  assert.match(runtime, /usage_note: "Specialist model usage is metered on this run's existing usage records/, 'no new billing path is announced');
  assert.match(engine, /workforce planning contracts/i, 'engine module documents its scope');
});

test('capability classification stays customer-legible for the new surfaces', () => {
  assert.match(CAPABILITY_INTERPRETATION, /capability/i);
  assert.equal(capabilityEffect('deploy_specialist_workforce').effect, 'workforce_orchestration');
  assert.equal(capabilityEffect('propose_agent_definition').effect, 'saved_internal_record');
  assert.match(runtime, /"workforce\.deployed": "Specialist workforce deployment recorded"/, 'audit activity is described in plain language');
});
