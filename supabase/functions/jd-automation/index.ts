import { buildSettingsChangePlan } from "../_shared/jd-settings-change-planner.ts";
import { buildCapabilityReport } from "../_shared/jd-capability-intelligence.ts";
import { validateOrganisationBlueprint } from "../_shared/jd-organisation-blueprint.ts";
import { makeIdempotencyKey, normaliseTaskInput, canTransitionTask, type TaskStatus } from "../_shared/jd-operations.ts";
import { validateVacancy, candidateStageTransition, type HiringStage } from "../_shared/jd-hiring.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { runAgent } from "../_shared/jd-agent-runtime.ts";

const cors = { "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods":"POST, OPTIONS", "Content-Type":"application/json" };
const json = (body: unknown, status=200) => new Response(JSON.stringify(body), {status, headers:cors});
const highImpact = [/\b(pay|payment|transfer|refund|purchase|withdraw|charge)\b/i,/\b(send|email|message|notify|publish|announce)\b/i,/\b(delete|remove|erase|purge|terminate)\b/i,/\b(permission|role|access|invite|disable account)\b/i,/\b(sign|submit|file|approve contract|legal)\b/i];
const needsApproval = (text:string) => highImpact.some((p)=>p.test(text));

Deno.serve(async (req) => {
 if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
 if(req.method!=="POST") return json({error:"Method not allowed"},405);
 const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
 if(!token) return json({error:"Authentication required"},401);
 const url=Deno.env.get("SUPABASE_URL"), anon=Deno.env.get("SUPABASE_ANON_KEY"), secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!anon||!secret) return json({error:"Automation service is not configured"},503);
 const auth=createClient(url,anon,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:authData,error:authErr}=await auth.auth.getUser(token);
 if(authErr||!authData.user) return json({error:"Invalid session"},401);
 const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:profile,error:profileErr}=await admin.from("profiles").select("id,school_id,role,full_name").eq("id",authData.user.id).maybeSingle();
 if(profileErr||!profile?.school_id) return json({error:"Your account is not linked to an organisation workspace"},403);
 let payload:any; try{payload=await req.json()}catch{return json({error:"Invalid JSON"},400)}



 if(payload.action==="capabilities.report"){
  if(profile.role!=="admin") return json({error:"Only workspace admins can inspect organisation capabilities"},403);
  // Capability status is intentionally unverified until migrations, deployment and smoke tests
  // are observed by a trusted deployment inventory. Do not infer live status from source code.
  const evidence:Record<string,any>={};
  return json({capabilities:buildCapabilityReport(evidence),environment:{database_schema_observed:true,deployment:"not_verified",authenticated_smoke_test:"not_run"}});
 }

 if(payload.action==="organisation.blueprint.preview"){
  if(profile.role!=="admin") return json({error:"Only workspace admins can prepare organisation blueprints"},403);
  const result=validateOrganisationBlueprint(payload.blueprint);
  if(!result.ok) return json({error:"Organisation blueprint needs correction",validation_errors:result.errors},400);
  return json({blueprint:result.blueprint,status:"draft",provisioning:{performed:false,requires_review:true},message:"Blueprint validated. No organisation configuration has been changed."});
 }
 if(payload.action==="organisation.blueprint.submit"){
  if(profile.role!=="admin") return json({error:"Only workspace admins can submit organisation blueprints"},403);
  const result=validateOrganisationBlueprint(payload.blueprint);
  if(!result.ok) return json({error:"Organisation blueprint needs correction",validation_errors:result.errors},400);
  const {data:saved,error}=await admin.rpc("jd_create_organisation_blueprint",{p_actor_id:authData.user.id,p_title:result.blueprint.name,p_industry:result.blueprint.industry,p_description:result.blueprint.businessModel,p_blueprint:result.blueprint});
  if(error) return json({error:"Could not persist organisation blueprint"},500);
  return json({blueprint:saved,status:"draft",provisioning:{performed:false,requires_review:true}});
 }
 if(payload.action==="operations.task.create"){
  if(!["admin","manager"].includes(String(profile.role))) return json({error:"Manager permission required to create operational tasks"},403);
  let task:any;try{task=normaliseTaskInput(payload.task||{});}catch(e){return json({error:e instanceof Error?e.message:"Invalid task"},400);}
  const stableId=typeof payload.idempotencyId==="string"?payload.idempotencyId:"";
  if(!stableId) return json({error:"idempotencyId is required"},400);
  const key=makeIdempotencyKey(profile.school_id,"task.create",stableId);
  const {data:existing}=await admin.from("jd_operational_tasks").select("id,status,title").eq("school_id",profile.school_id).eq("idempotency_key",key).maybeSingle();
  if(existing) return json({task:existing,reused:true});
  const {data:created,error}=await admin.from("jd_operational_tasks").insert({school_id:profile.school_id,created_by:authData.user.id,title:task.title,description:task.description,priority:task.priority,idempotency_key:key}).select("id,status,title,description,priority,created_at").single();
  if(error) return json({error:"Could not create operational task"},500);
  return json({task:created,reused:false},201);
 }
 if(payload.action==="operations.task.transition"){
  if(!["admin","manager"].includes(String(profile.role))) return json({error:"Manager permission required to update operational tasks"},403);
  const id=typeof payload.taskId==="string"?payload.taskId:"";
  const next=typeof payload.status==="string"?payload.status as TaskStatus:null;
  if(!id||!next) return json({error:"taskId and status are required"},400);
  const {data:task,error:lookupErr}=await admin.from("jd_operational_tasks").select("id,status").eq("id",id).eq("school_id",profile.school_id).maybeSingle();
  if(lookupErr||!task) return json({error:"Operational task not found"},404);
  if(!canTransitionTask(task.status as TaskStatus,next)) return json({error:"Invalid operational task transition"},409);
  const updates:any={status:next,updated_at:new Date().toISOString()};
  if(next==="completed") updates.completed_at=new Date().toISOString();
  const {data:updated,error}=await admin.from("jd_operational_tasks").update(updates).eq("id",id).eq("school_id",profile.school_id).eq("status",task.status).select("id,status,completed_at,updated_at").maybeSingle();
  if(error||!updated) return json({error:"Task changed concurrently; reload before retrying"},409);
  return json({task:updated});
 }
 if(payload.action==="hiring.vacancy.draft"){
  if(profile.role!=="admin") return json({error:"Only workspace admins can prepare vacancy drafts"},403);
  let vacancy:any;try{vacancy=validateVacancy(payload.vacancy||{});}catch(e){return json({error:e instanceof Error?e.message:"Invalid vacancy"},400);}
  const {data:created,error}=await admin.from("jd_hiring_requisitions").insert({school_id:profile.school_id,created_by:authData.user.id,...vacancy}).select("id,title,department,status,created_at").single();
  if(error) return json({error:"Could not save vacancy draft"},500);
  return json({vacancy:created,published:false,approval_required:true},201);
 }
 if(payload.action==="hiring.candidate.transition"){
  if(profile.role!=="admin") return json({error:"Only workspace admins can change recruitment stages"},403);
  const id=typeof payload.candidateId==="string"?payload.candidateId:"";
  const next=typeof payload.stage==="string"?payload.stage as HiringStage:null;
  if(!id||!next) return json({error:"candidateId and stage are required"},400);
  const {data:candidate,error:lookupErr}=await admin.from("jd_hiring_candidates").select("id,stage,requisition_id").eq("id",id).eq("school_id",profile.school_id).maybeSingle();
  if(lookupErr||!candidate) return json({error:"Candidate not found"},404);
  let transition:any;try{transition=candidateStageTransition(candidate.stage as HiringStage,next);}catch{return json({error:"Invalid recruitment stage transition"},409);}
  const {data:updated,error}=await admin.from("jd_hiring_candidates").update({stage:transition.to,stage_updated_by:authData.user.id,updated_at:new Date().toISOString()}).eq("id",id).eq("school_id",profile.school_id).eq("stage",transition.from).select("id,stage,updated_at").maybeSingle();
  if(error||!updated) return json({error:"Candidate stage changed concurrently; reload before retrying"},409);
  return json({candidate:updated});
 }
 if(payload.action==="settings.proposal.submit"){
  if(profile.role!=="admin") return json({error:"Only workspace admins can submit settings proposals"},403);
  const changes=Array.isArray(payload.changes)?payload.changes:[];
  if(changes.length<1||changes.length>20) return json({error:"Submit between 1 and 20 setting changes"},400);
  const keys=[...new Set(changes.map((item:any)=>typeof item?.key==="string"?item.key:"").filter(Boolean))];
  const {data:current,error:settingsErr}=await admin.from("school_settings")
   .select("key,value").eq("school_id",profile.school_id).in("key",keys).limit(100);
  if(settingsErr) return json({error:"Could not load current settings"},500);
  const plan=buildSettingsChangePlan(changes,(current||[]).map((row:any)=>({key:String(row.key||""),value:row.value})));
  if(plan.status!=="ready_for_review"||plan.rejected.length) return json({error:"Settings proposal failed validation",plan},400);
  if(plan.summary.approval_required<1) return json({error:"No change in this proposal requires Review Centre approval"},400);
  const title=typeof payload.title==="string"?payload.title.trim().slice(0,160):"Settings change proposal";
  const {data:proposal,error:proposalErr}=await admin.rpc("jd_submit_settings_proposal",{
   p_actor_id:authData.user.id,
   p_title:title||"Settings change proposal",
   p_proposal_json:plan
  });
  if(proposalErr){
   const code=String(proposalErr.code||"");
   if(code==="42501") return json({error:"Only workspace admins can submit settings proposals"},403);
   if(code==="22023") return json({error:"Settings proposal was rejected by database validation"},400);
   return json({error:"Could not persist settings proposal in Review Centre"},500);
  }
  return json({proposal,plan,execution:{performed:false,status:"not_executed"}});
 }

 if(payload.action==="settings.proposal.execute"){
  if(profile.role!=="admin") return json({error:"Only workspace admins can execute approved settings proposals"},403);
  const approvalId=typeof payload.approvalId==="string"?payload.approvalId:"";
  if(!approvalId) return json({error:"approvalId is required"},400);
  const {data:approval,error:approvalErr}=await admin.from("jd_approvals")
   .select("id,status,action_key,proposal_json,proposal_hash,execution_status,run_id")
   .eq("id",approvalId).eq("school_id",profile.school_id).maybeSingle();
  if(approvalErr||!approval) return json({error:"Approved settings proposal not found"},404);
  if(approval.action_key!=="settings.apply"||approval.status!=="approved")
   return json({error:"This settings proposal has not been approved"},409);
  const changes=Array.isArray(approval.proposal_json?.changes)?approval.proposal_json.changes:[];
  const actionable=changes.map((change:any,index:number)=>({change,index})).filter((item:{change:any;index:number})=>item.change?.status==="proposed"&&item.change?.approval_required===true);
  if(!actionable.length) return json({error:"No approved actionable settings changes were found"},400);
  const results:any[]=[];
  for(const item of actionable){
   const {data:step,error:stepErr}=await admin.rpc("jd_apply_settings_proposal_step",{
    p_approval_id:approvalId,p_actor_id:authData.user.id,p_step_index:item.index
   });
   if(stepErr){
    const code=String(stepErr.code||"");
    const status=code==="42501"?403:code==="P0002"?404:code==="22023"?409:500;
    return json({error:"Settings execution stopped; no later steps were attempted",reason:"The database rejected this execution step; inspect the server audit trail before retrying",results,failed_step:item.index,partial:results.some(x=>x.status==="step_completed"||x.status==="already_completed"),retry_safe:true},status);
   }
   results.push(step);
   if(step?.status==="conflict"||step?.status==="failed"){
    return json({error:"Settings execution stopped because a setting changed or failed verification",results,failed_step:item.index,partial:results.some(x=>x.status==="step_completed"||x.status==="already_completed"),retry_safe:false},409);
   }
  }
  const {data:finalApproval,error:finalErr}=await admin.from("jd_approvals")
   .select("execution_status").eq("id",approvalId).eq("school_id",profile.school_id).single();
  if(finalErr) return json({error:"Changes were applied but final execution status could not be read",results,partial:true},500);
  return json({approvalId,execution_status:finalApproval.execution_status,results,partial:finalApproval.execution_status!=="completed",message:finalApproval.execution_status==="completed"?"All approved settings changes were applied and verified.":"Some approved settings changes remain; retry resumes only unfinished steps."});
 }
 if(payload.action==="approvals.list"){
  if(profile.role!=="admin") return json({error:"Only workspace admins can review approval requests"},403);
  const {data,error}=await admin.from("jd_approvals")
   .select("id,run_id,requested_by,status,reason,title,action_key,risk_level,proposal_json,audience_text,execution_status,execution_result_json,decision_note,decided_by,decided_at,expires_at,created_at")
   .eq("school_id",profile.school_id).order("created_at",{ascending:false}).limit(100);
  if(error) return json({error:"Could not load the Review Centre queue"},500);
  return json({approvals:data||[]});
 }
 if(payload.action==="approvals.decide"){
  if(profile.role!=="admin") return json({error:"Only workspace admins can decide approval requests"},403);
  const approvalId=typeof payload.approvalId==="string"?payload.approvalId:"";
  const decision=payload.decision==="approve"?"approved":payload.decision==="reject"?"rejected":null;
  const note=typeof payload.note==="string"?payload.note.trim().slice(0,2000):null;
  if(!approvalId||!decision) return json({error:"approvalId and a valid decision are required"},400);
  const {data:result,error:decisionErr}=await admin.rpc("jd_decide_approval",{
   p_approval_id:approvalId,
   p_actor_id:authData.user.id,
   p_decision:decision,
   p_note:note
  });
  if(decisionErr){
   const code=String(decisionErr.code||"");
   if(code==="P0002") return json({error:"Approval request not found"},404);
   if(code==="40001") return json({error:"This request has already been decided"},409);
   if(code==="42501") return json({error:"Only workspace admins can decide approval requests"},403);
   return json({error:"Could not record the approval decision and audit event"},500);
  }
  if(result?.status==="expired") return json({error:"This approval request has expired",approval:result},410);
  return json({approval:result,execution:{status:"not_executed",message:decision==="approved"?"Approved. Execution is not enabled yet; no external action has been performed.":"Rejected. No action was performed."}});
 }
 if(payload.action==="runs.list"){
  if(profile.role!=="admin") return json({error:"Only workspace admins can view automation runs"},403);
  const {data,error}=await admin.from("jd_automation_runs")
   .select("id,requested_by,trigger_type,status,request_text,result_json,created_at,started_at,completed_at")
   .eq("school_id",profile.school_id).order("created_at",{ascending:false}).limit(50);
  if(error) return json({error:"Could not load automation runs"},500);
  const runs=data||[];
  const ids=runs.map((run:any)=>run.id);
  let steps:any[]=[];
  if(ids.length){
   const {data:stepData,error:stepError}=await admin.from("jd_automation_steps")
    .select("id,run_id,step_index,tool_key,risk_level,status,error_message,started_at,completed_at")
    .eq("school_id",profile.school_id).in("run_id",ids).order("step_index",{ascending:true});
   if(stepError) return json({error:"Could not load automation steps"},500);
   steps=stepData||[];
  }
  const byRun=new Map<string,any[]>();
  for(const step of steps){const list=byRun.get(step.run_id)||[];list.push(step);byRun.set(step.run_id,list);}
  return json({runs:runs.map((run:any)=>({
   id:run.id,requested_by:run.requested_by,trigger_type:run.trigger_type,status:run.status,
   request_preview:String(run.request_text||"").slice(0,500),created_at:run.created_at,
   started_at:run.started_at,completed_at:run.completed_at,
   token_usage:run.result_json?.tokenUsage||null,model_requests:run.result_json?.modelRequests||[],model:run.result_json?.model||null,
   steps:byRun.get(run.id)||[]
  }))});
 }
 if(payload.action==="usage.summary"){
  if(profile.role!=="admin") return json({error:"Only workspace admins can view agent usage"},403);
  const {data,error}=await admin.from("jd_automation_runs")
   .select("id,status,result_json,created_at")
   .eq("school_id",profile.school_id).order("created_at",{ascending:false}).limit(500);
  if(error) return json({error:"Could not load agent usage"},500);
  const runs=data||[];
  const summary={runs:runs.length,input_tokens:0,output_tokens:0,total_tokens:0,total_tokens_reported_runs:0,cached_input_tokens:0,reasoning_tokens:0,reported_runs:0,unreported_runs:0};
  const byDay:Record<string,{runs:number;tokens:number;reported_runs:number}>={};
  const byModel:Record<string,{runs:number;tokens:number;reported_runs:number}>={};
  for(const run of runs){
   const usage=run.result_json?.tokenUsage;
   if(!usage||typeof usage!=="object"||Number(usage.usage_reported_requests||0)===0){summary.unreported_runs++;continue;}
   summary.reported_runs++;
   const input=Number(usage.input_tokens)||0, output=Number(usage.output_tokens)||0;
   summary.input_tokens+=input; summary.output_tokens+=output;
   summary.cached_input_tokens+=Number(usage.cached_input_tokens)||0;
   summary.reasoning_tokens+=Number(usage.reasoning_tokens)||0;
   const totalsComplete=Number(usage.model_requests)>0&&Number(usage.total_tokens_reported_requests)===Number(usage.model_requests);
   const total=totalsComplete?Number(usage.total_tokens):null;
   if(total!==null){summary.total_tokens+=total;summary.total_tokens_reported_runs++;}
   const day=String(run.created_at||"").slice(0,10)||"unknown";
   byDay[day]??={runs:0,tokens:0,reported_runs:0}; byDay[day].runs++;
   if(total!==null){byDay[day].tokens+=total;byDay[day].reported_runs++;}
   const model=String(run.result_json?.model||"unknown");
   byModel[model]??={runs:0,tokens:0,reported_runs:0}; byModel[model].runs++;
   if(total!==null){byModel[model].tokens+=total;byModel[model].reported_runs++;}
  }
  return json({summary,byDay:Object.entries(byDay).sort((a,b)=>b[0].localeCompare(a[0])).slice(0,30),byModel:Object.entries(byModel).sort((a,b)=>b[1].tokens-a[1].tokens),note:"Token totals include only provider-reported usage. Costs are not estimated."});
 }
 if(payload.action==="history"){
  const id=String(payload.conversationId||"");
  if(!id) return json({error:"conversationId is required"},400);
  const {data:conversation,error:conversationErr}=await admin.from("jd_conversations")
   .select("id,created_by").eq("id",id).eq("school_id",profile.school_id).maybeSingle();
  if(conversationErr||!conversation||(conversation.created_by!==authData.user.id&&profile.role!=="admin"))
   return json({error:"Conversation not found"},404);
  const {data,error}=await admin.from("jd_messages").select("id,role,content,content_json,created_at").eq("school_id",profile.school_id).eq("conversation_id",id).order("created_at").limit(100);
  if(error) return json({error:"Could not load conversation"},500);
  return json({messages:data||[]});
 }
 if(payload.action!=="submit") return json({error:"Unsupported action"},400);
 const message=typeof payload.message==="string"?payload.message.trim():"";
 if(!message||message.length>12000) return json({error:"Message is required and must be under 12,000 characters"},400);
 let conversationId=typeof payload.conversationId==="string"?payload.conversationId:null;
 if(conversationId){
  const {data}=await admin.from("jd_conversations").select("id,created_by").eq("id",conversationId).eq("school_id",profile.school_id).maybeSingle();
  if(!data||(data.created_by!==authData.user.id&&profile.role!=="admin"))
   return json({error:"Conversation not found"},404);
 }else{
  const {data,error}=await admin.from("jd_conversations").insert({school_id:profile.school_id,created_by:authData.user.id,title:message.replace(/\s+/g," ").slice(0,72)}).select("id").single();
  if(error||!data) return json({error:"Could not create conversation"},500);
  conversationId=data.id;
 }
 const {data:history}=await admin.from("jd_messages").select("role,content").eq("school_id",profile.school_id).eq("conversation_id",conversationId).order("created_at").limit(20);
 const {error:saveError}=await admin.from("jd_messages").insert({school_id:profile.school_id,conversation_id:conversationId,sender_id:authData.user.id,role:"user",content:message});
 if(saveError) return json({error:"Could not save message"},500);
 const risk=needsApproval(message)?"approval_required":"routine";
 const {data:run,error:runErr}=await admin.from("jd_automation_runs").insert({
  school_id:profile.school_id,conversation_id:conversationId,requested_by:authData.user.id,
  trigger_type:payload.triggerType==="upload"?"upload":"chat",status:risk==="approval_required"?"awaiting_approval":"planning",
  autonomy_mode:"autonomous",scope:"organisation",request_text:message,
  plan_json:[],idempotency_key:typeof payload.idempotencyKey==="string"?payload.idempotencyKey.slice(0,120):crypto.randomUUID()
 }).select("id,status,created_at").single();
 if(runErr||!run){if(runErr?.code==="23505")return json({error:"Duplicate request",duplicate:true},409);return json({error:"Could not create automation run"},500)}
 await admin.from("jd_audit_events").insert({school_id:profile.school_id,actor_id:authData.user.id,run_id:run.id,event_type:"automation.requested",event_json:{risk}});
 if(risk==="approval_required"){
  const reason="This request may cause external or high-impact consequences and requires an administrator decision.";
  const {data:approval,error:approvalErr}=await admin.from("jd_approvals").insert({
   school_id:profile.school_id,run_id:run.id,requested_by:authData.user.id,status:"pending",
   reason,title:"Review JD action request",action_key:"unclassified_request",risk_level:"high",
   proposal_json:{request_text:message,execution_enabled:false},audience_text:null,execution_status:"not_executed"
  }).select("id,status,expires_at").single();
  if(approvalErr||!approval) return json({error:"The request was paused but its approval record could not be created"},500);
  const reply="I've placed this request in the Review Centre. It is waiting for an administrator decision. Approval records the decision only; execution remains disabled until a separately verified action handler is available.";
  await admin.from("jd_messages").insert({school_id:profile.school_id,conversation_id:conversationId,role:"assistant",content:reply,content_json:{approvalId:approval.id}});
  await admin.from("jd_automation_runs").update({status:"awaiting_approval",result_json:{approval_id:approval.id,execution_enabled:false},completed_at:new Date().toISOString()}).eq("id",run.id);
  return json({conversationId,run:{...run,status:"awaiting_approval"},reply,blocked:true,approval});
 }
 const apiKey=Deno.env.get("OPENROUTER_API_KEY");
 const model=Deno.env.get("JD_MODEL_NAME");
 if(!apiKey||!model){
  const reply="The request is saved, but JD's model provider is not configured. Add OPENROUTER_API_KEY and JD_MODEL_NAME to the Edge Function secrets to enable the agent.";
  await admin.from("jd_messages").insert({school_id:profile.school_id,conversation_id:conversationId,role:"assistant",content:reply});
  await admin.from("jd_automation_runs").update({status:"failed",result_json:{error:"model_provider_not_configured"},completed_at:new Date().toISOString()}).eq("id",run.id);
  return json({conversationId,run:{...run,status:"failed"},reply,configured:false},503);
 }
 const events:any[]=[];
 let stepIndex=0;
 const stepIds=new Map<string,string>();
 try{
  const {error:runningErr}=await admin.from("jd_automation_runs").update({status:"running",started_at:new Date().toISOString()}).eq("id",run.id);
  if(runningErr) throw new Error("Could not mark automation run as running");
  const result=await runAgent({
   message,history:(history||[]).map((m:any)=>({role:m.role,content:m.content})),
   context:{admin,schoolId:profile.school_id,userId:authData.user.id,role:profile.role||"member"},
   apiKey,model:model||"",baseUrl:Deno.env.get("JD_MODEL_BASE_URL")||"https://openrouter.ai/api/v1",
   onToolEvent:async(event)=>{
    events.push(event);
    const callId=String(event.callId||"");
    if(event.status==="started"){
     const {data,error}=await admin.from("jd_automation_steps").insert({
      school_id:profile.school_id,run_id:run.id,step_index:++stepIndex,tool_key:String(event.name||"unknown"),
      risk_level:String(event.risk||"low"),status:"running",input_json:{call_id:callId},started_at:new Date().toISOString()
     }).select("id").single();
     if(error||!data) throw new Error("Could not record agent tool execution step");
     if(callId) stepIds.set(callId,data.id);
    }else{
     const stepId=stepIds.get(callId);
     if(stepId){
      const {data:updatedStep,error}=await admin.from("jd_automation_steps").update({
       status:event.status==="completed"?"completed":"failed",
       output_json:{event:event.status},error_message:event.status==="failed"?String(event.error||"Tool execution failed").slice(0,240):null,
       completed_at:new Date().toISOString()
      }).eq("id",stepId).eq("school_id",profile.school_id).select("id").maybeSingle();
      if(error||!updatedStep) throw new Error("Could not verify agent tool execution step update");
     }
    }
   }
  });
  const {error:assistantErr}=await admin.from("jd_messages").insert({school_id:profile.school_id,conversation_id:conversationId,role:"assistant",content:result.text,content_json:{toolEvents:events.map(e=>({name:e.name,status:e.status}))}});
  if(assistantErr) throw new Error("Agent response could not be saved");
  const finalStatus=result.status==="partially_completed"?"partially_completed":"completed";
  const {data:finalRun,error:finalRunErr}=await admin.from("jd_automation_runs").update({
   status:finalStatus,
   result_json:{toolEvents:events,responseId:result.responseId,tokenUsage:result.tokenUsage,modelRequests:result.modelRequests,model:result.model,provider:result.provider,truncated:result.truncated===true},
   completed_at:new Date().toISOString()
  }).eq("id",run.id).eq("school_id",profile.school_id).select("id,status").maybeSingle();
  if(finalRunErr||!finalRun) throw new Error("Could not verify final automation run status");
  const {error:auditErr}=await admin.from("jd_audit_events").insert({
   school_id:profile.school_id,actor_id:authData.user.id,run_id:run.id,
   event_type:finalStatus==="completed"?"automation.completed":"automation.partially_completed",
   event_json:{tool_count:events.filter((event:any)=>event.status==="completed").length,token_usage:result.tokenUsage,model:result.model,provider:result.provider,truncated:result.truncated===true}
  });
  if(auditErr) throw new Error("Could not record automation completion audit event");
  return json({conversationId,run:{...run,status:finalStatus},reply:result.text,toolEvents:events,modelRequests:result.modelRequests,tokenUsage:result.tokenUsage});
 }catch(error){
  const detail=error instanceof Error?error.message:"Agent execution failed";
  const reply=`I couldn't complete this run. It is marked failed rather than pretending it succeeded. ${detail.slice(0,240)}`;
  await admin.from("jd_messages").insert({school_id:profile.school_id,conversation_id:conversationId,role:"assistant",content:reply});
  await admin.from("jd_automation_runs").update({status:"failed",result_json:{error:detail.slice(0,400),toolEvents:events},completed_at:new Date().toISOString()}).eq("id",run.id);
  await admin.from("jd_audit_events").insert({school_id:profile.school_id,actor_id:authData.user.id,run_id:run.id,event_type:"automation.failed",event_json:{error:detail.slice(0,240)}});
  return json({conversationId,run:{...run,status:"failed"},reply},502);
 }
});
