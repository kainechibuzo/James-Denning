import { runPrivateSpecialistReply } from "./jd-agent-runtime.ts";
import { selectJdModel } from "./jd-agent-routing.ts";
const uuid=(v:unknown)=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const adminRoles=["owner","admin"];
export async function handleWorkforceControl({payload,admin,profile,actorId,json}:any){
 if(!adminRoles.includes(profile?.role)||profile?.id!==actorId||!uuid(actorId)||!uuid(profile.school_id))return json({error:"Workspace administrator required"},403);
 const auditEvent=async(eventType:string,eventJson:Record<string,unknown>)=>{
  const {data:prior,error:lookupError}=await admin.from("jd_audit_events").select("id")
   .eq("school_id",profile.school_id).eq("event_type",eventType).contains("event_json",eventJson).limit(1).maybeSingle();
  if(lookupError)return false;
  if(prior)return true;
  const {error}=await admin.from("jd_audit_events").insert({
   school_id:profile.school_id,actor_id:actorId,event_type:eventType,event_json:eventJson
  });
  return !error;
 };
 if(payload?.action==="workforce.control.snapshot"){
  const [employees,teams,members,assignments,budgets,employeeUsage]=await Promise.all([
   admin.from("jd_workforce_employees").select("id,agent_kind,agent_ref,agent_version,display_name,department,role_title,purpose,responsibilities,requested_access,lifecycle_state,created_at,updated_at,retired_at").eq("school_id",profile.school_id).order("created_at",{ascending:false}).limit(100),
   admin.from("jd_workforce_teams").select("id,name,purpose,department,coordinator_specialist_ref,responsibilities,requested_access,lifecycle_state,created_at,updated_at,retired_at").eq("school_id",profile.school_id).order("created_at",{ascending:false}).limit(100),
   admin.from("jd_workforce_team_members").select("team_id,employee_id,member_role,joined_at,left_at").eq("school_id",profile.school_id).is("left_at",null).limit(500),
   admin.from("jd_workforce_assignments").select("id,run_id,agent_kind,agent_ref,agent_name,agent_version,task,status,verification_status,created_at").eq("school_id",profile.school_id).order("created_at",{ascending:false}).limit(100),
   admin.from("jd_workforce_employee_budgets").select("employee_id,budget_micros,reserved_micros,accrued_micros,rate_micros_per_hour,version,updated_at").eq("school_id",profile.school_id).limit(100),
   admin.from("jd_workforce_employee_usage").select("id,employee_id,assignment_id,rate_micros_per_hour,active_microseconds,amount_micros,reconciliation_status,created_at,reconciled_at").eq("school_id",profile.school_id).order("created_at",{ascending:false}).limit(500)
  ]);
  if(employees.error||teams.error||members.error||assignments.error||budgets.error||employeeUsage.error)return json({error:"Workforce records are not available. Confirm the reviewed schema is present before enabling this feature.",releaseReady:false},503);
  return json({employees:employees.data||[],teams:teams.data||[],members:members.data||[],assignments:assignments.data||[],budgets:budgets.data||[],employeeUsage:employeeUsage.data||[],snapshotAt:new Date().toISOString(),executionControlsEnabled:false,agentChatEnabled:Deno.env.get("JD_WORKFORCE_PRIVATE_CHAT_ENABLED")==="true",billingMode:"shadow_only"});
 }
 if(payload?.action==="workforce.agent.thread.open"||payload?.action==="workforce.agent.thread.history"||payload?.action==="workforce.agent.message.send"){
  if(Deno.env.get("JD_WORKFORCE_PRIVATE_CHAT_ENABLED")!=="true")return json({error:"Private specialist conversations are not enabled in this release."},503);
  const employeeId=payload.employeeId,threadId=payload.threadId;
  if(!uuid(employeeId))return json({error:"A valid employee identity is required"},400);
  const {data:employee,error:employeeError}=await admin.from("jd_workforce_employees")
   .select("id,agent_kind,agent_ref,display_name,role_title,purpose,responsibilities,lifecycle_state")
   .eq("school_id",profile.school_id).eq("id",employeeId).maybeSingle();
  if(employeeError)return json({error:"Could not verify this employee identity"},503);
  if(!employee)return json({error:"Employee not found in this workspace"},404);
  if(employee.agent_kind!=="builtin")return json({error:"Private chat is currently available for built-in specialist employees only."},409);
  if(payload.action==="workforce.agent.thread.open"&&employee.lifecycle_state!=="active")return json({error:"This employee is not currently available for a new private conversation."},409);
  if(payload.action==="workforce.agent.thread.open"){
   const {data:prior,error:priorError}=await admin.from("jd_workforce_agent_threads").select("id,employee_id,status,created_at,updated_at")
    .eq("school_id",profile.school_id).eq("employee_id",employeeId).eq("created_by",actorId).maybeSingle();
   if(priorError)return json({error:"Could not open the private specialist conversation"},503);
   if(prior){
    if(!await auditEvent("workforce.agent.thread.opened",{thread_id:prior.id,employee_id:employeeId}))
     return json({error:"The conversation exists but its audit receipt could not be confirmed."},503);
    return json({thread:prior,employee});
   }
   const {data:created,error:createError}=await admin.from("jd_workforce_agent_threads")
    .insert({school_id:profile.school_id,employee_id:employeeId,created_by:actorId,status:"active"})
    .select("id,employee_id,status,created_at,updated_at").single();
   if(createError){
    const {data:retry}=await admin.from("jd_workforce_agent_threads").select("id,employee_id,status,created_at,updated_at")
     .eq("school_id",profile.school_id).eq("employee_id",employeeId).eq("created_by",actorId).maybeSingle();
    if(retry){
     if(!await auditEvent("workforce.agent.thread.opened",{thread_id:retry.id,employee_id:employeeId}))
      return json({error:"The conversation exists but its audit receipt could not be confirmed."},503);
     return json({thread:retry,employee});
    }
    return json({error:"Private specialist conversation could not be created"},503);
   }
   if(!await auditEvent("workforce.agent.thread.opened",{thread_id:created.id,employee_id:employeeId}))
    return json({error:"The conversation was created but its audit receipt could not be confirmed. Refresh before retrying."},503);
   return json({thread:created,employee},201);
  }
  if(!uuid(threadId))return json({error:"A valid private conversation is required"},400);
  const {data:thread,error:threadError}=await admin.from("jd_workforce_agent_threads")
   .select("id,employee_id,status,created_by").eq("school_id",profile.school_id).eq("id",threadId)
   .eq("employee_id",employeeId).eq("created_by",actorId).maybeSingle();
  if(threadError)return json({error:"Could not verify the private conversation"},503);
  if(!thread)return json({error:"Private conversation not found"},404);
  if(thread.status!=="active")return json({error:"This private conversation is archived"},409);
  if(payload.action==="workforce.agent.thread.history"){
   const {data:messages,error:messagesError}=await admin.from("jd_workforce_agent_messages")
    .select("id,sender_kind,content,reply_to_message_id,created_at").eq("school_id",profile.school_id)
    .eq("thread_id",threadId).order("created_at",{ascending:true}).limit(100);
   if(messagesError)return json({error:"Could not load private conversation history"},503);
   return json({thread,messages:messages||[],employee});
  }
  if(employee.lifecycle_state!=="active")return json({error:"This employee is not currently available to reply to a new message."},409);
  const content=typeof payload.content==="string"?payload.content.trim():"";
  if(!uuid(payload.requestId)||content.length<1||content.length>8000)return json({error:"Enter a message of up to 8,000 characters"},400);
  let userMessage:any=null;
  const {data:existingUser,error:existingError}=await admin.from("jd_workforce_agent_messages")
   .select("id,sender_kind,content,created_at").eq("school_id",profile.school_id).eq("thread_id",threadId)
   .eq("sender_id",actorId).eq("sender_kind","user").eq("request_id",payload.requestId).maybeSingle();
  if(existingError)return json({error:"Could not verify whether this message was already sent"},503);
  userMessage=existingUser;
  if(userMessage&&userMessage.content!==content)return json({error:"This request identifier was already used for a different message."},409);
  if(!userMessage){
   const {data:inserted,error:insertError}=await admin.from("jd_workforce_agent_messages").insert({
    school_id:profile.school_id,thread_id:threadId,employee_id:employeeId,
    sender_kind:"user",sender_id:actorId,content,request_id:payload.requestId
   }).select("id,sender_kind,content,created_at").single();
   if(insertError){
    const {data:retry}=await admin.from("jd_workforce_agent_messages").select("id,sender_kind,content,created_at")
     .eq("school_id",profile.school_id).eq("thread_id",threadId).eq("sender_id",actorId)
     .eq("sender_kind","user").eq("request_id",payload.requestId).maybeSingle();
    if(!retry)return json({error:"Your message was not saved; refresh before retrying."},503);
    userMessage=retry;
   }else userMessage=inserted;
  }
  if(!await auditEvent("workforce.agent.message.sent",{thread_id:threadId,employee_id:employeeId,message_id:userMessage.id,request_id:payload.requestId}))
   return json({error:"Your message was saved but its audit receipt could not be confirmed. Retry the same message."},503);
  const {data:existingReply,error:replyLookupError}=await admin.from("jd_workforce_agent_messages")
   .select("id,sender_kind,content,created_at").eq("school_id",profile.school_id)
   .eq("reply_to_message_id",userMessage.id).eq("sender_kind","agent").maybeSingle();
  if(replyLookupError)return json({error:"Could not verify the specialist reply"},503);
  if(existingReply){
   if(!await auditEvent("workforce.agent.message.replied",{thread_id:threadId,employee_id:employeeId,message_id:existingReply.id}))
    return json({error:"The specialist reply exists but its audit receipt could not be confirmed. Retry the same message."},503);
   return json({thread,messages:[{...userMessage,sender_kind:"user"},existingReply],replayed:true});
  }
  const {data:priorMessages,error:historyError}=await admin.from("jd_workforce_agent_messages")
   .select("sender_kind,content,created_at").eq("school_id",profile.school_id).eq("thread_id",threadId)
   .lt("created_at",userMessage.created_at).order("created_at",{ascending:true}).limit(20);
  if(historyError)return json({error:"Could not prepare private conversation context"},503);
  const apiKey=Deno.env.get("OPENROUTER_API_KEY")||"";
  if(!apiKey)return json({error:"Private specialist chat is not configured with a model provider."},503);
  const configuredModel=Deno.env.get("JD_MODEL_NAME")||"google/gemini-3.1-flash-lite";
  const model=selectJdModel(content,configuredModel,{fast:Deno.env.get("JD_MODEL_FAST_NAME"),reasoning:Deno.env.get("JD_MODEL_REASONING_NAME")});
  const baseUrl=Deno.env.get("JD_MODEL_BASE_URL")||"https://openrouter.ai/api/v1";
  let reply:any;
  try{
   reply=await runPrivateSpecialistReply({
    employee,history:(priorMessages||[]).map((m:any)=>({role:m.sender_kind==="agent"?"assistant":"user",content:m.content})),
    message:userMessage.content,model,apiKey,baseUrl
   });
  }catch(error){
   console.error("Private specialist response failed",String(error instanceof Error?error.message:error).slice(0,180));
   return json({error:"The message was saved, but the specialist could not reply yet. Retry this same message after checking the provider."},502);
  }
  const {data:assistantMessage,error:assistantError}=await admin.from("jd_workforce_agent_messages").insert({
   school_id:profile.school_id,thread_id:threadId,employee_id:employeeId,
   sender_kind:"agent",sender_id:actorId,content:reply.content,reply_to_message_id:userMessage.id,model_name:reply.model,usage_json:reply.usage||{}
  }).select("id,sender_kind,content,reply_to_message_id,created_at").single();
  if(assistantError){
   const {data:concurrentReply}=await admin.from("jd_workforce_agent_messages").select("id,sender_kind,content,reply_to_message_id,created_at")
    .eq("school_id",profile.school_id).eq("reply_to_message_id",userMessage.id).eq("sender_kind","agent").maybeSingle();
   if(!concurrentReply)return json({error:"The specialist reply could not be saved. Refresh before retrying."},503);
   if(!await auditEvent("workforce.agent.message.replied",{thread_id:threadId,employee_id:employeeId,message_id:concurrentReply.id}))
    return json({error:"The specialist reply exists but its audit receipt could not be confirmed."},503);
   return json({thread,messages:[{...userMessage,sender_kind:"user"},concurrentReply],replayed:true});
  }
  await admin.from("jd_workforce_agent_threads").update({updated_at:new Date().toISOString()})
   .eq("school_id",profile.school_id).eq("id",threadId);
  if(!await auditEvent("workforce.agent.message.replied",{thread_id:threadId,employee_id:employeeId,message_id:assistantMessage.id,model:reply.model}))
   return json({error:"The specialist reply was saved but its audit receipt could not be confirmed. Retry the same message."},503);
  return json({thread,messages:[{...userMessage,sender_kind:"user"},assistantMessage],replayed:false});
 }
 if(payload?.action==="workforce.employee.create"||payload?.action==="workforce.team.create"){
  return json({error:"Employee and team identities can only be created by activating an explicitly approved Review Centre proposal."},409);
 }
 if(payload?.action==="workforce.proposal.activate"){
  if(!uuid(payload.approvalId)||!uuid(payload.requestId))return json({error:"A valid approved proposal and request identifier are required"},400);
  const {data,error}=await admin.rpc("jd_workforce_activate_approved_proposal",{
   p_actor:actorId,p_approval:payload.approvalId,p_request:payload.requestId
  });
  if(error){
   const code=String(error.code||"");
   const status=code==="42501"?403:code==="P0002"?404:code==="40001"?409:code==="22023"?400:500;
   return json({error:"The approved workforce proposal was not activated. Refresh the Review Centre and inspect its status before retrying.",code:code||"activation_failed"},status);
  }
  if(data?.activated!==true||data?.tools_granted!==false||data?.connectors_authorised!==false||data?.assignment_started!==false||data?.billing_enabled!==false||(!uuid(data?.team_id)&&!Array.isArray(data?.employee_ids)))return json({error:"Activation receipt was incomplete; refresh before retrying."},502);
  return json({receipt:data},201);
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
  if(data?.state!==(({pause:"paused",resume:"active",retire:"retired"}) as Record<string,string>)[payload.operation]||!uuid(data?.event_id))return json({error:"Workforce control receipt was incomplete. Refresh before retrying."},502);
  return json({receipt:data});
 }
 return json({error:"Unsupported workforce control action"},400);
}
