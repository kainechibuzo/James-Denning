// Authenticated edge handler only: profile and actorId come from getUser + the
// server profile lookup, never from request JSON. SQL rechecks mutation authority.
const isId = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const isVersion = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
export async function handleTaskAssignment({admin,profile,actorId,payload,json}) {
  if (!["owner","admin","manager"].includes(profile.role)) return json({error:"Manager permission required"},403);
  // Retire the unchecked contract. No compatibility fallback may bypass CAS.
  if (payload.action === "operations.task.assign") return json({error:"Refresh JD before assigning tasks; checked assignment is required"},409);
  if (!isId(payload.taskId)) return json({error:"A valid taskId is required"},400);
  if (payload.action === "operations.task.get") {
    const {data,error} = await admin.from("jd_operational_tasks")
      .select("id,title,description,department,priority,status,assigned_to,due_at,completed_at,created_at,updated_at")
      .eq("id",payload.taskId).eq("school_id",profile.school_id).maybeSingle();
    if (error) return json({error:"Could not read operational task"},500);
    if (!data) return json({error:"Operational task not found"},404);
    return json({task:data});
  }
  if (!isId(payload.assigneeId) || !(payload.expectedAssigneeId === null || isId(payload.expectedAssigneeId)) || !isVersion(payload.expectedUpdatedAt)) {
    return json({error:"Assignee and the last observed assignment/version are required; refresh task records"},400);
  }
  const {data,error} = await admin.rpc("jd_assign_operational_task",{
    p_actor_id:actorId,p_task_id:payload.taskId,p_assignee_id:payload.assigneeId,
    p_expected_assignee_id:payload.expectedAssigneeId,p_expected_updated_at:payload.expectedUpdatedAt,
  });
  if (error) {
    if(error.code === "42501") return json({error:"Actor or assignee is not permitted in this workspace"},403);
    if(error.code === "P0002") return json({error:"Operational task not found"},404);
    if(error.code === "40001") return json({error:"Task changed; refresh before assigning"},409);
    if(error.code === "22023" || error.code === "22007" || error.code === "22008") return json({error:"Invalid assignment or expected version"},400);
    return json({error:"Could not confirm assignment and audit; refresh before another request"},500);
  }
  if (!data?.task || data.auditRecorded !== true || !isId(data.auditId)) return json({error:"Assignment audit acknowledgement is incomplete; refresh task records"},500);
  return json(data);
}
