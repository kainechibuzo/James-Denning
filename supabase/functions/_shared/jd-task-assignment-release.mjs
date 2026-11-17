import {handleTaskAssignment} from './jd-task-assignment.mjs';

// Server-owned release choice, never an HTTP argument or a response-based
// fallback. Change only with a reviewed staging/database/frontend release.
export const BACKEND_TASK_ASSIGNMENT_RELEASE = 'legacy';
const isId=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const assigneeRoles=new Set(['owner','admin','manager','staff','finance','hr','contractor']);
const statuses=new Set(['queued','in_progress','blocked','completed','cancelled']);

// Deliberate PR #89-compatible contract. This retains its nontransactional
// eligibility checks and unaudited update; it does NOT supply CAS guarantees.
async function assignLegacy({admin,profile,payload,json}) {
  if(!isId(payload.taskId)||!isId(payload.assigneeId))return json({error:'A valid task and assignee are required'},400);
  try {
    const [taskResult,memberResult]=await Promise.all([
      admin.from('jd_operational_tasks').select('id').eq('id',payload.taskId).eq('school_id',profile.school_id).maybeSingle(),
      admin.from('profiles').select('id,role').eq('id',payload.assigneeId).eq('school_id',profile.school_id).maybeSingle(),
    ]);
    if(taskResult.error||memberResult.error)return json({error:'Could not verify assignment eligibility'},500);
    if(!taskResult.data)return json({error:'Operational task not found'},404);
    if(!memberResult.data||!assigneeRoles.has(memberResult.data.role))return json({error:'Assignee is not an eligible member of this workspace'},400);
    if(taskResult.data.id!==payload.taskId||memberResult.data.id!==payload.assigneeId)return json({error:'Assignment eligibility records did not match'},500);
    const {data,error}=await admin.from('jd_operational_tasks')
      .update({assigned_to:payload.assigneeId,updated_at:new Date().toISOString()})
      .eq('id',payload.taskId).eq('school_id',profile.school_id)
      .select('id,assigned_to,status').maybeSingle();
    if(error)return json({error:'Could not confirm assignment; refresh before another request'},500);
    if(!data)return json({error:'Task changed; refresh before assigning'},409);
    if(data.id!==payload.taskId||data.assigned_to!==payload.assigneeId||!statuses.has(data.status))return json({error:'Assignment acknowledgement is incomplete; refresh task records'},500);
    return json({task:data,assignmentMode:'legacy',auditRecorded:false});
  }catch{
    return json({error:'Assignment response was not confirmed; refresh before another request'},500);
  }
}
export async function handleReleasedTaskAssignment(options,release=BACKEND_TASK_ASSIGNMENT_RELEASE) {
  const {profile,actorId,payload,json}=options;
  if(!['owner','admin','manager'].includes(profile?.role))return json({error:'Manager permission required'},403);
  if(!isId(actorId)||profile.id!==actorId||!isId(profile.school_id))return json({error:'Authenticated workspace identity is required'},403);
  if(!['legacy','checked'].includes(release))return json({error:'Assignment release is unavailable'},503);
  if(!['operations.task.assign','operations.task.assign_checked','operations.task.get'].includes(payload?.action))return json({error:'Unsupported assignment action'},400);
  if(release==='checked'||payload.action==='operations.task.get')return handleTaskAssignment(options);
  if(payload.action==='operations.task.assign_checked')return json({error:'Checked assignment is not enabled in this release'},409);
  return assignLegacy(options);
}
