// JD discovery agent (phase 7): the customer describes the work; JD researches
// it against the allowlisted source catalogue and proposes the skills and
// specialist roles it needs. In assisted mode the plan waits for an
// independent administrator decision; in autonomous mode (workspace setting,
// spend ceiling honoured) JD proceeds without asking. The planner is offline
// and deterministic; acquisition reuses the phase-6 quarantine pipeline; the
// resulting playbooks are instruction text only and never grant tools or
// authority — assignments still flow through the existing workforce allowlists.
import {matchSkillsForTask} from './jd-skills-source-index.mjs';

const ROLE_CATEGORIES = Object.freeze({
  documents: ['operations_planner', 'finance_analyst'],
  communications: ['business_advisor', 'operations_planner'],
  design: ['product_designer'],
  engineering: ['software_engineer', 'quality_assurance'],
  meta: ['research_analyst'],
  learning: ['business_advisor'],
  quality: ['quality_assurance'],
});

const BASE_SECONDS = 600;
const MAX_SKILLS = 3;
const MAX_ROLES = 3;

export type DiscoveryPlan = {
  objective: string; skills: {id: string; name: string; description: string; expected_seconds: number; score: number}[];
  roles: string[]; estimated_seconds: number; basis: string;
};

export function planDiscovery(idea: string): DiscoveryPlan {
  const text = typeof idea === 'string' ? idea.trim() : '';
  if (text.length < 10 || text.length > 4000) throw Error('Describe the work in at least 10 characters (up to 4000).');
  const matches = matchSkillsForTask(text.slice(0, 2000), MAX_SKILLS);
  const roles: string[] = [];
  for (const match of matches) {
    for (const role of ROLE_CATEGORIES[(match as any).category as keyof typeof ROLE_CATEGORIES] || ['business_advisor']) {
      if (!roles.includes(role)) roles.push(role);
    }
  }
  if (!roles.length) roles.push('business_advisor');
  const skills = matches.map((m: any) => ({id: m.id, name: m.name, description: m.description, expected_seconds: m.expectedMinutes * 60, score: m.score}));
  const estimated_seconds = BASE_SECONDS + skills.reduce((n: number, s: any) => n + s.expected_seconds, 0);
  return {
    objective: text.length > 400 ? `${text.slice(0, 400)}…` : text,
    skills, roles: roles.slice(0, MAX_ROLES), estimated_seconds,
    basis: 'allowlist_source_index_estimate_v1',
  };
}

export async function handleDiscovery({payload, admin, actorId, profile, json, enabled = false}: {
 payload: any; admin: any; actorId: string; profile: any; json: (body: any, status?: number) => Response; enabled?: boolean;
}) {
 if (!['owner', 'admin', 'manager'].includes(profile?.role) || profile?.id !== actorId || !profile?.school_id) {
  return json({error: 'Workspace membership required'}, 403);
 }
 if (!enabled) return json({error: 'Discovery needs a reviewed backend and database release.', releaseEnabled: false}, 409);
 const action = payload?.action;
 const call = async (name: string, args: any) => {
  const {data, error} = await admin.rpc(name, args);
  if (error) throw {dbCode: error.code};
  if (!data || typeof data !== 'object' || data.hiring_enabled !== false || data.execution_enabled !== false) throw {dbCode: 'receipt'};
  return data;
 };
 const uuid = (v: unknown) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
 try {
  if (action === 'autonomy.read') {
   const receipt = await call('jd_read_workspace_autonomy', {p_actor: actorId});
   return json({autonomy: receipt});
  }
  if (action === 'autonomy.set') {
   if (!['owner', 'admin'].includes(profile.role)) return json({error: 'Administrator required to change the autonomy dial'}, 403);
   if (payload.confirm !== true || !uuid(payload.requestId)) return json({error: 'Confirmation and request identifier required'}, 400);
   const receipt = await call('jd_set_workspace_autonomy', {p_actor: actorId, p_request: payload.requestId,
    p_mode: payload.mode, p_ceiling_seconds: payload.ceilingSeconds, p_rate_minor_per_hour: payload.rateMinorPerHour});
   return json({receipt});
  }
  if (action === 'billing.summary') {
   const receipt = await call('jd_read_billing_summary', {p_actor: actorId});
   return json({billing: receipt});
  }
  if (action === 'agent.proposal.create') {
   if (payload.confirm !== true || !uuid(payload.requestId) || !Number.isInteger(payload.seconds) || !Number.isInteger(payload.spendCapSeconds)) return json({error:'Explicit quote request, duration and spend cap are required'},400);
   const receipt = await call('jd_specialist_proposal_create',{p_actor:actorId,p_request:payload.requestId,p_role:payload.specialist,p_task:payload.task,p_seconds:payload.seconds,p_spend_cap_seconds:payload.spendCapSeconds});
   return json({proposal:receipt});
  }
  if (action === 'agent.proposal.approve' || action === 'agent.proposal.decline') {
   if (payload.confirm !== true || !uuid(payload.requestId) || !uuid(payload.proposalId)) return json({error:'Explicit approval decision and proposal are required'},400);
   const receipt = await call('jd_specialist_proposal_approve',{p_actor:actorId,p_request:payload.requestId,p_proposal:payload.proposalId,p_decision:action.endsWith('approve')?'approve':'decline'});
   return json({receipt});
  }
  if (action === 'discovery.read') {
   const {data: rows, error} = await admin.from('jd_discovery_sessions')
    .select('id,idea,status,plan,receipt,requested_by,decided_by,created_at,completed_at')
    .eq('school_id', profile.school_id).order('created_at', {ascending: false}).limit(20);
   if (error) return json({error: 'Discovery sessions could not be read'}, 503);
   return json({sessions: {sessions: rows || [], hiring_enabled: false, execution_enabled: false, billing_enabled: false}});
  }
  if (action === 'discovery.start') {
   if (payload.confirm !== true || !uuid(payload.requestId)) return json({error: 'Confirmation and request identifier required'}, 400);
   const current = await call('jd_read_workspace_autonomy', {p_actor: actorId});
   let plan: DiscoveryPlan;
   try { plan = planDiscovery(payload.idea); } catch (e: any) { return json({error: e?.message || 'A bounded idea is required'}, 400); }
   const started = await call('jd_start_discovery', {p_actor: actorId, p_request: payload.requestId, p_idea: payload.idea,
    p_plan: plan as any, p_mode: current.mode, p_run: typeof payload.runId === 'string' && uuid(payload.runId) ? payload.runId : null});
   if (started.status !== 'proceeding') return json({discovery: started});
   const finish = await runDiscoveryAcquisition({session: started, plan, admin, actorId, tenantId: profile.school_id, requestId: crypto.randomUUID()});
   return json(finish.http);
  }
  if (action === 'discovery.decide') {
   if (!['owner', 'admin'].includes(profile.role)) return json({error: 'Administrator required to decide a discovery proposal'}, 403);
   if (payload.confirm !== true || !uuid(payload.requestId)) return json({error: 'Confirmation and request identifier required'}, 400);
   if (!uuid(payload.sessionId) || !['approve', 'decline'].includes(payload.decision) || typeof payload.note !== 'string') {
    return json({error: 'Session, explicit decision and review note are required'}, 400);
   }
   const receipt = await call('jd_decide_discovery', {p_actor: actorId, p_request: payload.requestId, p_session: payload.sessionId,
    p_decision: payload.decision, p_note: payload.note});
   return json({receipt});
  }
  if (action === 'discovery.proceed') {
   if (!['owner', 'admin'].includes(profile.role)) return json({error: 'Administrator required to proceed an approved discovery session'}, 403);
   if (payload.confirm !== true || !uuid(payload.requestId) || !uuid(payload.sessionId)) return json({error: 'Confirmation, request identifier and session required'}, 400);
   const {data: session, error: sessionError} = await admin.from('jd_discovery_sessions')
    .select('id,status,plan,idea').eq('id', payload.sessionId).eq('school_id', profile.school_id).maybeSingle();
   if (sessionError || !session) return json({error: 'Discovery session not found in this workspace'}, 404);
   if (session.status !== 'approved') return json({error: 'Only an approved proposal can proceed'}, 409);
   const finish = await runDiscoveryAcquisition({session: {session_id: session.id}, plan: session.plan, admin, actorId, tenantId: profile.school_id, requestId: crypto.randomUUID()});
   return json(finish.http);
  }
  return json({error: 'Unsupported discovery action'}, 400);
 } catch (e: any) {
  const code = e?.dbCode;
  return json({error: code === '42501' ? 'Authority, independence or mode requirements were not met for this discovery action.'
   : code === '40001' ? 'Discovery or request conflict. Reload the record; reuse the same request identifier after an uncertain submission.'
   : code === '22023' ? 'The discovery request was rejected as invalid; nothing was changed.'
   : code === '54000' ? 'The workspace spend ceiling was reached; JD stopped before spending beyond it.'
   : code === 'receipt' ? 'Discovery outcome not confirmed by the database. Reload records before retrying; do not assume the write failed.'
   : 'Discovery service could not complete this request safely.'},
   code === '42501' ? 403 : code === '40001' ? 409 : code === '22023' ? 400 : code === '54000' ? 402 : code === 'receipt' ? 502 : 503);
 }
}

// Autonomous execution path: acquire each missing capability through the
// phase-6 quarantine pipeline, bind the top specialist playbook per acquired
// skill and record the completion receipt. Any failure stops the session with
// its partial receipt — JD never silently continues past a failed acquisition.
// The core is HTTP-free so the chat submission flow can run the same
// acquisition for a run-linked discovery session.
export async function runDiscoveryAcquisition({session, plan, admin, actorId, tenantId, requestId}: {
 session: {session_id: string}; plan: DiscoveryPlan | any; admin: any; actorId: string; tenantId: string; requestId: string;
}): Promise<{http: {discovery: any}}> {
 const {acquireSkillCore} = await import('./jd-skills-acquire.ts');
 const call = async (name: string, args: any) => {
  const {data, error} = await admin.rpc(name, args);
  if (error) throw {dbCode: error.code};
  if (!data || typeof data !== 'object' || data.hiring_enabled !== false || data.execution_enabled !== false) throw {dbCode: 'receipt'};
  return data;
 };
 const receipt: any = {acquired: [], bound: [], skipped: [], errors: []};
 const {deriveRequestKey} = await import('./jd-skills-acquire.ts');
 for (const skill of (plan?.skills || []).slice(0, 3)) {
  try {
   const owned = await admin.from('jd_skills').select('id,status,current_version,name')
    .eq('school_id', tenantId).eq('name', skill.id).maybeSingle();
   if (owned.data?.status === 'published') { receipt.skipped.push({id: skill.id, reason: 'already_published'}); continue; }
   // The attempt id is deterministic per (session, capability): JD retrying
   // the same session's same capability reuses the attempt (replay/recovery),
   // while a new session starts a fresh attempt. Stage request keys are
   // derived inside acquireSkillCore.
   const result = await acquireSkillCore({entryId: skill.id, admin, actorId,
    requestId: await deriveRequestKey(session.session_id, 'acquire-attempt', skill.id),
    createRpc: (args: any) => call('jd_create_skill_import', args),
    completeRpc: (args: any) => call('jd_complete_skill_import', args),
    publishRpc: (args: any) => call('jd_acquire_publish_skill', args)});
   if ('error' in result) { receipt.errors.push({id: skill.id, message: result.error.message}); break; }
   receipt.acquired.push(result.receipt);
   if (result.receipt.state === 'published' && result.receipt.skill_id && plan?.roles?.length) {
    const bind = await call('jd_bind_agent_playbook', {p_actor: actorId,
     p_request: crypto.randomUUID(),
     p_role: plan.roles[0], p_skill: result.receipt.skill_id, p_expected_version: result.receipt.version});
    if (bind.bound) receipt.bound.push({role: plan.roles[0], skill_id: result.receipt.skill_id, version: result.receipt.version});
   }
  } catch (e: any) {
   receipt.errors.push({id: skill.id, message: e?.message || 'Acquisition failed'});
   break;
  }
 }
 try {
  const completed = await call('jd_complete_discovery', {p_actor: actorId, p_request: requestId,
   p_session: session.session_id, p_receipt: receipt});
  return {http: {discovery: {...completed, plan}}};
 } catch (e: any) {
  return {http: {discovery: {session_id: session.session_id, status: 'proceeding', receipt, plan,
   error: 'Acquisition finished but completion could not be recorded; reload the session.'}}};
 }
}
