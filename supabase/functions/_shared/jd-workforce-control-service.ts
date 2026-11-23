const uuid=(v:unknown)=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const adminRoles=["owner","admin"];
export async function handleWorkforceControl({payload,admin,profile,actorId,json}:any){
 if(!adminRoles.includes(profile?.role)||profile?.id!==actorId||!uuid(actorId)||!uuid(profile.school_id))return json({error:"Workspace administrator required"},403);
 if(payload?.action==="workforce.control.snapshot"){
  const [employees,teams,members,assignments,budgets,employeeUsage]=await Promise.all([
   admin.from("jd_workforce_employees").select("id,agent_kind,agent_ref,agent_version,display_name,department,lifecycle_state,created_at,updated_at,retired_at").eq("school_id",profile.school_id).order("created_at",{ascending:false}).limit(100),
   admin.from("jd_workforce_teams").select("id,name,purpose,lifecycle_state,created_at,updated_at,retired_at").eq("school_id",profile.school_id).order("created_at",{ascending:false}).limit(100),
   admin.from("jd_workforce_team_members").select("team_id,employee_id,member_role,joined_at,left_at").eq("school_id",profile.school_id).is("left_at",null).limit(500),
   admin.from("jd_workforce_assignments").select("id,run_id,agent_kind,agent_ref,agent_name,agent_version,task,status,verification_status,created_at").eq("school_id",profile.school_id).order("created_at",{ascending:false}).limit(100)
  ]);
  if(employees.error||teams.error||members.error||assignments.error||budgets.error||employeeUsage.error)return json({error:"Workforce records are not available. Confirm the reviewed schema is present before enabling this feature.",releaseReady:false},503);
  return json({employees:employees.data||[],teams:teams.data||[],members:members.data||[],assignments:assignments.data||[],budgets:budgets.data||[],employeeUsage:employeeUsage.data||[],snapshotAt:new Date().toISOString(),executionControlsEnabled:false,agentChatEnabled:false,billingMode:"shadow_only"});
 }
 if(payload?.action==="workforce.employee.create"){
  const {kind,ref,version,name,department,requestId}=payload;
  if(!uuid(requestId)||!["builtin","registry"].includes(kind)||typeof ref!=="string"||ref.length>120||typeof name!=="string"||name.trim().length<2||name.trim().length>120||!(department==null||typeof department==="string"&&department.length<=120)||!(version==null||Number.isInteger(version)&&version>0))return json({error:"Invalid employee activation request"},400);
  const {data,error}=await admin.rpc("jd_workforce_create_employee",{p_actor:actorId,p_request:requestId,p_kind:kind,p_ref:ref,p_version:version??null,p_name:name.trim(),p_department:department??null});
  if(error){const status=error.code==="42501"?403:error.code==="22023"?400:error.code==="40001"?409:500;return json({error:"Employee activation was not confirmed. Refresh before retrying.",code:error.code||"activation_failed"},status);}
  if(!data?.employee_id&&!data?.employee?.id)return json({error:"Employee activation receipt was incomplete"},502);
  return json({receipt:data},201);
 }
 if(payload?.action==="workforce.employee.budget"){
  if(!uuid(payload.requestId)||!uuid(payload.employeeId)||!Number.isInteger(payload.expectedVersion)||payload.expectedVersion<0||!Number.isSafeInteger(payload.budgetMicros)||payload.budgetMicros<0||payload.budgetMicros>1000000000000||!Number.isSafeInteger(payload.rateMicrosPerHour)||payload.rateMicrosPerHour<0||payload.rateMicrosPerHour>1000000000)return json({error:"Invalid employee budget request"},400);
  const {data,error}=await admin.rpc("jd_workforce_set_employee_budget",{p_actor:actorId,p_request:payload.requestId,p_employee:payload.employeeId,p_expected_version:payload.expectedVersion,p_budget_micros:payload.budgetMicros,p_rate_micros_per_hour:payload.rateMicrosPerHour});
  if(error){const status=error.code==="42501"?403:error.code==="22023"?400:error.code==="40001"?409:500;return json({error:"Employee budget was not confirmed.",code:error.code||"budget_failed"},status);}
  if(data?.employee_id!==payload.employeeId||data?.charged!==false||data?.mode!=="shadow")return json({error:"Employee budget receipt was incomplete"},502);
  return json({receipt:data});
 }
 if(payload?.action==="workforce.team.create"){
  if(!uuid(payload.requestId)||typeof payload.name!=="string"||payload.name.trim().length<2||payload.name.length>120||typeof payload.purpose!=="string"||payload.purpose.trim().length<10||payload.purpose.length>1000)return json({error:"Invalid team creation request"},400);
  const {data,error}=await admin.rpc("jd_workforce_create_team",{p_actor:actorId,p_request:payload.requestId,p_name:payload.name.trim(),p_purpose:payload.purpose.trim()});
  if(error){const status=error.code==="42501"?403:error.code==="22023"?400:error.code==="40001"?409:500;return json({error:"Team creation was not confirmed.",code:error.code||"team_create_failed"},status);}
  if(!uuid(data?.team_id))return json({error:"Team creation receipt was incomplete"},502);
  return json({receipt:data},201);
 }
 if(payload?.action==="workforce.team.membership"){
  if(!uuid(payload.requestId)||!uuid(payload.teamId)||!uuid(payload.employeeId)||!["add","remove"].includes(payload.operation)||!(payload.memberRole==null||["lead","member"].includes(payload.memberRole)))return json({error:"Invalid team membership request"},400);
  const {data,error}=await admin.rpc("jd_workforce_team_membership",{p_actor:actorId,p_request:payload.requestId,p_team:payload.teamId,p_employee:payload.employeeId,p_action:payload.operation,p_member_role:payload.memberRole||"member"});
  if(error){const status=error.code==="42501"?403:error.code==="P0002"?404:error.code==="40001"?409:400;return json({error:"Team membership change was not confirmed.",code:error.code||"membership_failed"},status);}
  if(data?.confirmed!==true||data.team_id!==payload.teamId||data.employee_id!==payload.employeeId)return json({error:"Team membership receipt was incomplete"},502);
  return json({receipt:data});
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
