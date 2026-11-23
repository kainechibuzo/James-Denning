const uuid=(v:unknown)=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const adminRoles=["owner","admin"];
export async function handleWorkforceControl({payload,admin,profile,actorId,json}:any){
 if(!adminRoles.includes(profile?.role)||profile?.id!==actorId||!uuid(actorId)||!uuid(profile.school_id))return json({error:"Workspace administrator required"},403);
 if(payload?.action==="workforce.control.snapshot"){
  const [employees,teams,members,assignments]=await Promise.all([
   admin.from("jd_workforce_employees").select("id,agent_kind,agent_ref,agent_version,display_name,department,lifecycle_state,created_at,updated_at,retired_at").eq("school_id",profile.school_id).order("created_at",{ascending:false}).limit(100),
   admin.from("jd_workforce_teams").select("id,name,purpose,lifecycle_state,created_at,updated_at,retired_at").eq("school_id",profile.school_id).order("created_at",{ascending:false}).limit(100),
   admin.from("jd_workforce_team_members").select("team_id,employee_id,member_role,joined_at,left_at").eq("school_id",profile.school_id).is("left_at",null).limit(500),
   admin.from("jd_workforce_assignments").select("id,run_id,agent_kind,agent_ref,agent_name,agent_version,task,status,verification_status,created_at").eq("school_id",profile.school_id).order("created_at",{ascending:false}).limit(100)
  ]);
  if(employees.error||teams.error||members.error||assignments.error)return json({error:"Workforce records are not available. Confirm the reviewed schema is present before enabling this feature.",releaseReady:false},503);
  return json({employees:employees.data||[],teams:teams.data||[],members:members.data||[],assignments:assignments.data||[],snapshotAt:new Date().toISOString(),executionControlsEnabled:false,agentChatEnabled:false,billingMode:"shadow_only"});
 }
 if(payload?.action==="workforce.control"){
  if(!uuid(payload.requestId)||!uuid(payload.targetId)||!["employee","team"].includes(payload.targetKind)||!["pause","resume","retire"].includes(payload.operation))return json({error:"Invalid workforce control request"},400);
  const action=payload.targetKind+"."+payload.operation;
  const {data,error}=await admin.rpc("jd_workforce_control",{p_actor:actorId,p_request:payload.requestId,p_target_kind:payload.targetKind,p_target:payload.targetId,p_action:action});
  if(error){const status=error.code==="42501"?403:error.code==="P0002"?404:error.code==="40001"?409:400;return json({error:status===409?"Workforce state changed or request conflicts. Refresh before retrying.":"Workforce control was not confirmed.",code:error.code||"control_failed"},status);}
  if(data?.state!==({pause:"paused",resume:"active",retire:"retired"}[payload.operation])||!uuid(data?.event_id))return json({error:"Workforce control receipt was incomplete. Refresh before retrying."},502);
  return json({receipt:data});
 }
 return json({error:"Unsupported workforce control action"},400);
}
