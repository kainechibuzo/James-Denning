// JD Agent Execution Engine — planning contract tests (pure module).
// Synthetic inputs only; no model, database or deployment is involved.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WORKFORCE_RELEASE_FLAG, WORKFORCE_GRANTABLE_TOOLS, FORBIDDEN_AGENT_TOOLS, SPECIALIST_EXECUTION_ROLES,
  REGISTRY_EXECUTION_TOOL_ALLOWLIST, WORKFORCE_LIMITS, validateWorkforcePlan, resolveAssignmentTools,
  buildAgentInstructions, buildAssignmentUserContent, summariseAssignmentEvidence, buildWorkforceAuditPayload,
  mapRegistryDefinition, agentRefLabel, builtinSpecialist,
} from '../supabase/functions/_shared/jd-agent-workforce.ts';
import { definitionFromTemplate } from '../supabase/functions/_shared/jd-agent-registry.mjs';

const builtinRef = id => ({ kind: 'builtin', id });
const registryRef = agentId => ({ kind: 'registry', agentId });
const available = [...WORKFORCE_GRANTABLE_TOOLS];
const resolveBuiltin = ref => {
  const role = builtinSpecialist(ref);
  if (!role) return null;
  return { ref, name: role.name, instructions: [role.charter], allowedTools: role.allowedTools, maxModelRounds: role.maxModelRounds, maxOutputTokens: role.maxOutputTokens, source: 'builtin' };
};
const plan = (assignments, objective = 'Assess the quarterly operations plan from several angles.') =>
  validateWorkforcePlan({ objective, assignments }, resolveBuiltin, available);

test('allowlists are internally consistent and never contain delegation or write tools', () => {
  assert.equal(WORKFORCE_RELEASE_FLAG, 'JD_AGENT_WORKFORCE_ENABLED');
  assert.equal(FORBIDDEN_AGENT_TOOLS.some(tool => WORKFORCE_GRANTABLE_TOOLS.includes(tool)), false, 'delegation tools are never grantable');
  assert.equal(WORKFORCE_GRANTABLE_TOOLS.some(tool => ['create_business_document_draft', 'call_connected_mcp_tool', 'submit_workspace_settings_for_review', 'submit_organisation_blueprint_for_review'].includes(tool)), false, 'no write or approval-capable tools are grantable');
  for (const role of SPECIALIST_EXECUTION_ROLES) {
    assert.equal(role.allowedTools.every(tool => WORKFORCE_GRANTABLE_TOOLS.includes(tool)), true, `${role.id} allowlist inside grantable set`);
    assert.equal(role.maxModelRounds >= 1, true, `${role.id} bounded rounds`);
  }
  assert.equal(REGISTRY_EXECUTION_TOOL_ALLOWLIST.every(tool => WORKFORCE_GRANTABLE_TOOLS.includes(tool)), true, 'registry allowlist inside grantable set');
  assert.equal(new Set(SPECIALIST_EXECUTION_ROLES.map(role => role.id)).size, 8, 'exactly eight built-in specialists');
  for (const id of ['business_advisor', 'research_analyst', 'finance_analyst', 'operations_planner', 'product_designer', 'software_engineer', 'security_reviewer', 'quality_assurance']) {
    assert.ok(SPECIALIST_EXECUTION_ROLES.some(role => role.id === id), `specialist ${id} exists`);
  }
  for (const role of SPECIALIST_EXECUTION_ROLES) {
    assert.equal(role.executionScope === 'reasoning_only', role.allowedTools.length === 0, `${role.id} scope matches toolset`);
    assert.equal(role.maxModelRounds === 1, role.allowedTools.length === 0, `${role.id} reasoning-only roles get one round`);
  }
});

test('valid deployment plans are normalised and unknown tools are denied, never granted', () => {
  const result = plan([
    { agent: builtinRef('finance_analyst'), task: 'Analyse the supplied expense summary and flag budget risks.', tools: ['get_billing_snapshot', 'deploy_specialist_workforce', 'not_a_real_tool'] },
    { agent: builtinRef('product_designer'), task: 'Assess the onboarding journey for accessibility problems.' },
  ]);
  assert.equal(result.assignments.length, 2);
  assert.deepEqual(result.assignments[0].requestedTools, ['get_billing_snapshot'], 'only grantable base-allowlist tools survive');
  assert.deepEqual(result.deniedTools['builtin:finance_analyst'].sort(), ['deploy_specialist_workforce', 'not_a_real_tool']);
  assert.deepEqual(result.assignments[1].requestedTools, []);
  assert.equal(result.objective.length <= WORKFORCE_LIMITS.objectiveMaxLength, true);
});

test('plans are bounded in agent count, task and context length', () => {
  const task = 'Analyse the supplied operations summary and propose a sequenced plan.';
  assert.throws(() => plan(Array.from({ length: WORKFORCE_LIMITS.maxAgents + 1 }, (_, i) => ({ agent: builtinRef('finance_analyst'), task }))), /Between 1 and 5/);
  assert.throws(() => plan([{ agent: builtinRef('finance_analyst'), task: 'too short' }]), /task must contain 20/);
  assert.throws(() => plan([{ agent: builtinRef('finance_analyst'), task }], 'short'), /Objective must contain 12/);
  assert.throws(() => plan([{ agent: builtinRef('finance_analyst'), task, context: 'x'.repeat(WORKFORCE_LIMITS.contextMaxLength + 1) }]), /context must contain/);
  assert.throws(() => plan([{ agent: builtinRef('unknown_specialist'), task }]), /not available for deployment/);
  assert.throws(() => plan([{ agent: registryRef('not-a-uuid'), task }]), /not available for deployment/);
});

test('requested tools beyond the per-agent cap are denied, not granted', () => {
  const wide = WORKFORCE_GRANTABLE_TOOLS.slice(0, WORKFORCE_LIMITS.maxGrantedToolsPerAgent + 3);
  const result = validateWorkforcePlan(
    { objective: 'Assess the quarterly operations plan from several angles.', assignments: [{ agent: builtinRef('finance_analyst'), task: 'Analyse the supplied expense summary and flag budget risks.', tools: wide }] },
    ref => {
      const role = builtinSpecialist(ref);
      if (!role) return null;
      return { ref, name: role.name, instructions: [role.charter], allowedTools: [...WORKFORCE_GRANTABLE_TOOLS], maxModelRounds: role.maxModelRounds, maxOutputTokens: role.maxOutputTokens, source: 'builtin' };
    },
    available,
  );
  assert.equal(result.assignments[0].requestedTools.length, WORKFORCE_LIMITS.maxGrantedToolsPerAgent);
  assert.equal(result.deniedTools['builtin:finance_analyst'].length, 3);
});

test('tools are only granted when the deploying user can actually use them', () => {
  const role = builtinSpecialist(builtinRef('business_advisor'));
  const resolved = { ref: builtinRef('business_advisor'), name: role.name, instructions: [role.charter], allowedTools: role.allowedTools, maxModelRounds: role.maxModelRounds, maxOutputTokens: role.maxOutputTokens, source: 'builtin' };
  assert.deepEqual(resolveAssignmentTools(resolved, available), [...role.allowedTools]);
  assert.deepEqual(resolveAssignmentTools(resolved, ['get_workspace_overview']), ['get_workspace_overview'], 'unavailable role tools are dropped');
  assert.deepEqual(resolveAssignmentTools(resolved, []), []);
});

test('assignment instructions carry the governance boundary and granted tools', () => {
  const role = builtinSpecialist(builtinRef('finance_analyst'));
  const resolved = { ref: builtinRef('finance_analyst'), name: role.name, instructions: [role.charter], allowedTools: role.allowedTools, maxModelRounds: role.maxModelRounds, maxOutputTokens: role.maxOutputTokens, source: 'builtin' };
  const assignment = { agent: builtinRef('finance_analyst'), task: 'Analyse the supplied expenses for budget risks.', context: 'Synthetic expense summary.', requestedTools: ['get_billing_snapshot'] };
  const instructions = buildAgentInstructions(resolved, assignment);
  assert.match(instructions, /cannot grant yourself permissions/);
  assert.match(instructions, /create further agents/);
  assert.match(instructions, /Granted read-only tools/);
  assert.match(instructions, /get_billing_snapshot/);
  assert.match(instructions, /items JD must independently verify/);
  const reasoning = buildAgentInstructions({ ...resolved, name: 'Product Designer' }, { ...assignment, requestedTools: [] });
  assert.match(reasoning, /No tools are granted/);
  const userContent = buildAssignmentUserContent(assignment);
  assert.match(userContent, /Analyse the supplied expenses/);
  assert.match(userContent, /Synthetic expense summary/);
  assert.match(userContent, /stop and report exactly what is missing/);
});

test('assignment evidence summaries are bounded and exclude results', () => {
  const summary = summariseAssignmentEvidence([
    { name: 'get_billing_snapshot', status: 'completed', evidence: { result_keys: 'a,b', execution_state: 'returned', secret: 'value' } },
    { name: 'get_billing_snapshot', status: 'failed' },
    { name: 'get_operations_intelligence', status: 'started' },
  ]);
  assert.equal(summary.length, 3);
  assert.deepEqual(summary[0], { tool: 'get_billing_snapshot', status: 'completed', result_keys: 'a,b', execution_state: 'returned' });
  assert.equal('secret' in summary[0], false, 'raw evidence never leaks');
  assert.equal(summariseAssignmentEvidence(Array.from({ length: 40 }, (_, i) => ({ name: `t${i}`, status: 'completed' }))).length, 24);
});

test('audit payloads record structure only, never assignment or report text', () => {
  const taskText = 'CONFIDENTIAL-ASSIGNMENT-PAYLOAD';
  const reportText = 'CONFIDENTIAL-REPORT-PAYLOAD';
  const payload = buildWorkforceAuditPayload({
    objective: `Objective containing ${taskText}`,
    outcomes: [{ agent_ref: 'builtin:finance_analyst', name: 'Finance Analyst', source: 'builtin', status: 'report_returned', tool_calls: 2, tools_granted: ['get_billing_snapshot'] }],
  });
  const serialised = JSON.stringify(payload);
  assert.equal(serialised.includes(taskText), false, 'assignment/objective text excluded');
  assert.equal(serialised.includes(reportText), false);
  assert.equal(payload.reports_content_recorded, false);
  assert.equal(payload.execution_authority, 'assigned_read_only_tasks_only');
  assert.equal(payload.agents[0].tool_calls, 2);
});

test('registry definitions map to conservative executable specs only with authority', () => {
  const content = definitionFromTemplate('inventory-analyst');
  assert.throws(() => mapRegistryDefinition({ content, published: false, executionAuthorized: true, contentHash: 'a'.repeat(64), version: 1 }), /not published with execution authority/);
  assert.throws(() => mapRegistryDefinition({ content, published: true, executionAuthorized: false, contentHash: 'a'.repeat(64), version: 1 }), /not published with execution authority/);
  assert.throws(() => mapRegistryDefinition({ content: { broken: true }, published: true, executionAuthorized: true, contentHash: 'a'.repeat(64), version: 1 }), /could not be validated/);
  const resolved = mapRegistryDefinition({ content: { ...content, maxSteps: 30 }, published: true, executionAuthorized: true, contentHash: 'a'.repeat(64), version: 3 });
  assert.equal(resolved.source, 'registry');
  assert.equal(resolved.name, content.name);
  assert.deepEqual([...resolved.instructions], [...content.instructions]);
  assert.deepEqual([...resolved.allowedTools], [...REGISTRY_EXECUTION_TOOL_ALLOWLIST], 'capabilities never widen the toolset');
  assert.equal(resolved.maxModelRounds, WORKFORCE_LIMITS.registryMaxModelRounds, 'definition steps are bounded by engine limits');
  assert.equal(resolved.definitionVersion, 3);
  assert.equal(resolved.contentHash, 'a'.repeat(64));
  const modest = mapRegistryDefinition({ content: { ...content, maxSteps: 2 }, published: true, executionAuthorized: true, contentHash: 'a'.repeat(64), version: 1 });
  assert.equal(modest.maxModelRounds, 2);
});

test('agent references are labelled deterministically', () => {
  assert.equal(agentRefLabel(builtinRef('finance_analyst')), 'builtin:finance_analyst');
  assert.equal(agentRefLabel(registryRef('00000000-0000-4000-8000-000000000001')), 'registry:00000000-0000-4000-8000-000000000001');
  assert.throws(() => agentRefLabel({ kind: 'other' }));
  assert.equal(builtinSpecialist(builtinRef('finance_analyst')).id, 'finance_analyst');
  assert.equal(builtinSpecialist(builtinRef('nope')), null);
  assert.equal(builtinSpecialist(null), null);
});
