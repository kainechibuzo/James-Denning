import { buildSettingsChangePlan } from "../_shared/jd-settings-change-planner.ts";
import { buildCapabilityReport } from "../_shared/jd-capability-intelligence.ts";
import { validateOrganisationBlueprint } from "../_shared/jd-organisation-blueprint.ts";
import { makeIdempotencyKey, normaliseTaskInput, canTransitionTask, type TaskStatus } from "../_shared/jd-operations.ts";
import { validateVacancy, candidateStageTransition, type HiringStage } from "../_shared/jd-hiring.ts";
import { summariseScores, summariseTaskStatuses } from "../_shared/jd-business-intelligence.ts";
import { validateWorkflowDefinition } from "../_shared/jd-workflow-definition.ts";
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



 if(payload.action==="workflow.draft.list"){
  if(!["admin","manager"].includes(String(profile.role))) return json({error:"Manager permission required to inspect workflow drafts"},403);
  const {data:workflows,error}=await admin.from("jd_workflows")
   .select("id,title,description,status,latest_version_no,active_version_id,created_at,updated_at")
   .eq("school_id",profile.school_id).order("updated_at",{ascending:false}).limit(100);
  if(error) return json({error:"Could not load workflow drafts"},500);
  const ids=(workflows||[]).map((item:any)=>item.id);
  if(!ids.length) return json({workflows:[],versions:[]});
  const {data:versions,error:versionErr}=await admin.from("jd_workflow_versions")
   .select("id,workflow_id,version_no,definition_hash,created_by,created_at")
   .eq("school_id",profile.school_id).in("workflow_id",ids)
   .order("version_no",{ascending:false}).limit(500);
  if(versionErr) return json({error:"Could not load workflow version history"},500);
  return json({workflows:workflows||[],versions:versions||[],execution_enabled:false});
 }
 if(payload.action==="workflow.draft.save"){
  if(!["admin","manager"].includes(String(profile.role))) return json({error:"Manager permission required to save workflow drafts"},403);
  const result=validateWorkflowDefinition(payload.definition);
  if(!result.valid||!result.definition) return json({error:"Workflow definition failed validation",validation_errors:result.errors},400);
  const workflowId=typeof payload.workflowId==="string"?payload.workflowId:null;
  const expectedVersion=Number.isInteger(payload.expectedVersion)?Number(payload.expectedVersion):0;
  const {data:saved,error}=await admin.rpc("jd_save_workflow_draft",{
   p_actor_id:authData.user.id,p_workflow_id:workflowId,
   p_expected_version:expectedVersion,p_definition:result.definition
  });
  if(error){
   const code=String(error.code||"");
   const status=code==="42501"?403:code==="P0002"?404:code==="40001"?409:400;
   return json({error:code==="40001"?"Workflow changed or is stale; reload before saving":"Could not save workflow draft",reason:error.message},status);
  }
  return json({workflow:saved,execution_enabled:false,notice:"Saved as an immutable draft version. It is not active or executable."},201);
 }
 if(payload.action==="workflow.review.submit"){
  if(!["admin","manager"].includes(String(profile.role))) return json({error:"Manager permission required to submit workflows for review"},403);
  const workflowId=typeof payload.workflowId==="string"?payload.workflowId:"";
  const versionId=typeof payload.versionId==="string"?payload.versionId:"";
  if(!workflowId||!versionId) return json({error:"workflowId and versionId are required"},400);
  const {data:approval,error}=await admin.rpc("jd_submit_workflow_review",{
   p_actor_id:authData.user.id,p_workflow_id:workflowId,p_version_id:versionId
  });
  if(error){
   const code=String(error.code||"");
   const status=code==="42501"?403:code==="P0002"?404:code==="40001"?409:code==="23505"?409:400;
   return json({error:"Could not submit this workflow version for review",reason:error.message},status);
  }
  return json({approval,execution_enabled:false,notice:"The exact immutable workflow version was submitted to the Review Centre. No workflow action has run."},201);
 }
 if(payload.action==="workflow.activate"){
  if(profile.role!=="admin") return json({error:"Only workspace admins can activate an approved workflow"},403);
  const approvalId=typeof payload.approvalId==="string"?payload.approvalId:"";
  if(!approvalId) return json({error:"approvalId is required"},400);
  const {data:activated,error}=await admin.rpc("jd_activate_approved_workflow",{
   p_actor_id:authData.user.id,p_approval_id:approvalId
  });
  if(error){
   const code=String(error.code||"");
   const status=code==="42501"?403:code==="P0002"?404:code==="40001"?409:400;
   return json({error:"Could not activate this approved workflow",reason:error.message},status);
  }
  return json({workflow:activated,execution_enabled:false,notice:"The approved workflow version is active, but workflow execution is not enabled."});
 }
 if(payload.action==="workflow.definition.validate"){
  if(!["admin","manager"].includes(String(profile.role))) return json({error:"Manager permission required to design workflows"},403);
  const result=validateWorkflowDefinition(payload.definition);
  return json({valid:result.valid,errors:result.errors,definition:result.definition,execution_enabled:false,notice:"This is a validated draft preview only. It is not saved, scheduled or executable."});
 }
 if(payload.action==="intelligence.snapshot"){
  if(!["admin","manager"].includes(String(profile.role))) return json({error:"Manager permission required to inspect business intelligence"},403);
  const [{data:people,error:peopleErr},{data:bills,error:billsErr},{data:announcements,error:annErr},{data:emails,error:emailErr},{data:tasks,error:tasksErr},{data:session,error:sessionErr},{data:terms,error:termsErr}]=await Promise.all([
   admin.from("profiles").select("role").eq("school_id",profile.school_id).limit(5000),
   admin.from("fee_bills").select("total_amount,amount_paid,balance,status").eq("school_id",profile.school_id).limit(5000),
   admin.from("announcements").select("title,audience,target_audience,created_at,is_active").eq("school_id",profile.school_id).order("created_at",{ascending:false}).limit(8),
   admin.from("email_logs").select("subject,recipient_count,status,error_message,sent_at").eq("school_id",profile.school_id).order("sent_at",{ascending:false}).limit(20),
   admin.from("jd_operational_tasks").select("status,priority").eq("school_id",profile.school_id).limit(5000),
   admin.from("sessions").select("id,name").eq("school_id",profile.school_id).eq("is_active",true).limit(1).maybeSingle(),
   admin.from("terms").select("id,name,session_id").eq("school_id",profile.school_id).eq("is_active",true).limit(5)
  ]);
  if(peopleErr||billsErr||annErr||emailErr||tasksErr||sessionErr||termsErr) return json({error:"Business intelligence sources could not be loaded"},500);
  const roleCounts:Record<string,number>={};
  for(const row of people||[]){const role=String(row.role||"unknown");roleCounts[role]=(roleCounts[role]||0)+1;}
  const billRows=bills||[];
  const finance={bill_count:billRows.length,total_billed:billRows.reduce((a:any,r:any)=>a+Number(r.total_amount||0),0),total_paid:billRows.reduce((a:any,r:any)=>a+Number(r.amount_paid||0),0),outstanding:billRows.reduce((a:any,r:any)=>a+Number(r.balance||0),0),by_status:billRows.reduce((a:any,r:any)=>{const s=String(r.status||"unknown");a[s]=(a[s]||0)+1;return a;},{})};
  const term=(terms||[]).find((t:any)=>!session||String(t.session_id)===String(session.id));
  let performance:any={available:false,reason:"No active session and term are configured"};
  if(session&&term){
   const scores:number[]=[];let from=0;const batch=1000;let truncated=false;
   while(from<10000){
    const {data,error}=await admin.from("portal_results").select("total_score").eq("school_id",profile.school_id).eq("session_id",session.id).eq("term_id",term.id).not("total_score","is",null).range(from,from+batch-1);
    if(error) return json({error:"Performance records could not be summarised"},500);
    for(const row of data||[]) scores.push(Number(row.total_score));
    if(!data||data.length<batch) break;
    from+=batch;if(from>=10000) truncated=true;
   }
   performance={available:true,session:session.name,term:term.name,...summariseScores(scores),truncated};
  }
  return json({
   people:{total_members:(people||[]).length,roles:roleCounts,sample_truncated:(people||[]).length>=5000},
   finance,
   performance,
   operations:summariseTaskStatuses(tasks||[]),
   communications:{recent_announcements:announcements||[],recent_email_batches:(emails||[]).map((e:any)=>({subject:e.subject,recipients:e.recipient_count,status:e.status,error:e.error_message,sent_at:e.sent_at}))}
  });
 }
 if(payload.action==="execution.monitor.list"){
  if(!["admin","manager"].includes(String(profile.role))) return json({error:"Manager permission required to inspect execution history"},403);
  let runQuery=admin.from("jd_automation_runs").select("id,conversation_id,requested_by,request_text,status,result_json,created_at,started_at,completed_at").eq("school_id",profile.school_id);
  if(profile.role!=="admin") runQuery=runQuery.eq("requested_by",authData.user.id);
  const {data:runs,error:runErr}=await runQuery.order("created_at",{ascending:false}).limit(100);
  if(runErr) return json({error:"Could not load JD execution history"},500);
  const ids=(runs||[]).map((r:any)=>r.id);
  if(!ids.length) return json({runs:[],jobs:[],steps:[]});
  const [{data:jobs,error:jobErr},{data:steps,error:stepErr}]=await Promise.all([
   admin.from("jd_execution_jobs").select("id,run_id,status,attempt_count,max_attempts,available_at,lease_expires_at,heartbeat_at,last_error_code,last_error_message,created_at,updated_at").eq("school_id",profile.school_id).in("run_id",ids).order("created_at",{ascending:false}),
   admin.from("jd_automation_steps").select("id,run_id,tool_key,risk_level,status,error_message,started_at,completed_at").eq("school_id",profile.school_id).in("run_id",ids).order("step_index",{ascending:true}).limit(500)
  ]);
  if(jobErr||stepErr) return json({error:"Could not load execution job details"},500);
  return json({runs:runs||[],jobs:jobs||[],steps:steps||[]});
 }
 if(payload.action==="execution.job.retry"){
  if(profile.role!=="admin") return json({error:"Only workspace admins can retry failed JD jobs"},403);
  const jobId=typeof payload.jobId==="string"?payload.jobId:"";
  if(!jobId) return json({error:"jobId is required"},400);
  const {data:retry,error}=await admin.rpc("jd_requeue_failed_execution_job",{p_job_id:jobId,p_actor_id:authData.user.id});
  if(error){
   if(error.code==="42501") return json({error:"Only workspace admins can retry failed JD jobs"},403);
   if(error.code==="P0002") return json({error:"Execution job not found"},404);
   if(error.code==="22023") return json({error:"Only failed jobs can be manually retried"},409);
   return json({error:"Could not queue the failed job for retry"},500);
  }
  return json({job:retry});
 }
 if(payload.action==="execution.job.cancel"){
  if(profile.role!=="admin") return json({error:"Only workspace admins can cancel queued JD jobs"},403);
  const jobId=typeof payload.jobId==="string"?payload.jobId:"";
  if(!jobId) return json({error:"jobId is required"},400);
  const {data:job,error:jobErr}=await admin.from("jd_execution_jobs").select("id,run_id,status").eq("id",jobId).eq("school_id",profile.school_id).maybeSingle();
  if(jobErr||!job) return json({error:"Execution job not found"},404);
  if(!["queued","retry_wait"].includes(job.status)) return json({error:"Only queued or waiting jobs can be cancelled safely"},409);
  const {data:updated,error:updateErr}=await admin.from("jd_execution_jobs").update({status:"cancelled",updated_at:new Date().toISOString(),completed_at:new Date().toISOString()}).eq("id",jobId).eq("school_id",profile.school_id).eq("status",job.status).select("id,status").maybeSingle();
  if(updateErr||!updated) return json({error:"Job changed concurrently; refresh before retrying"},409);
  const {error:runUpdateErr}=await admin.from("jd_automation_runs").update({status:"cancelled",completed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",job.run_id).eq("school_id",profile.school_id);
  if(runUpdateErr) return json({error:"Job was cancelled but run summary could not be updated"},500);
  await admin.from("jd_audit_events").insert({school_id:profile.school_id,actor_id:authData.user.id,run_id:job.run_id,event_type:"execution.cancelled",event_json:{job_id:jobId,previous_status:job.status}});
  return json({job:updated});
 }
 if(payload.action==="organisation.blueprints.list"){
  if(profile.role!=="admin") return json({error:"Only workspace admins can inspect organisation blueprints"},403);
  const {data,error}=await admin.from("jd_organisation_blueprints").select("id,title,industry,status,blueprint_json,created_at,updated_at").eq("school_id",profile.school_id).order("created_at",{ascending:false}).limit(100);
  if(error) return json({error:"Could not load organisation blueprints"},500);
  return json({blueprints:data||[]});
 }
 if(payload.action==="operations.task.list"){
  if(!["admin","manager"].includes(String(profile.role))) return json({error:"Manager permission required to inspect operational tasks"},403);
  const {data,error}=await admin.from("jd_operational_tasks").select("id,title,description,department,priority,status,assigned_to,due_at,completed_at,created_at,updated_at").eq("school_id",profile.school_id).order("created_at",{ascending:false}).limit(250);
  if(error) return json({error:"Could not load operational tasks"},500);
  return json({tasks:data||[]});
 }
 if(payload.action==="hiring.pipeline.list"){
  if(profile.role!=="admin") return json({error:"Only workspace admins can inspect the recruitment pipeline"},403);
  const [{data:requisitions,error:reqErr},{data:candidates,error:candidateErr}]=await Promise.all([
   admin.from("jd_hiring_requisitions").select("id,title,department,description,requirements,status,created_at,updated_at").eq("school_id",profile.school_id).order("created_at",{ascending:false}).limit(150),
   admin.from("jd_hiring_candidates").select("id,requisition_id,full_name,stage,created_at,updated_at").eq("school_id",profile.school_id).order("created_at",{ascending:false}).limit(500)
  ]);
  if(reqErr||candidateErr) return json({error:"Could not load recruitment pipeline"},500);
  return json({requisitions:requisitions||[],candidates:candidates||[]});
 }
 if(payload.action==="capabilities.report"){
  if(profile.role!=="admin") return json({error:"Only workspace admins can inspect organisation capabilities"},403);
  // Capability status is intentionally unverified until migrations, deployment and smoke tests
  // are observed by a trusted deployment inventory. Do not infer live status from source code.
  const evidence:Record<string,any>={};
  return json({capabilities:buildCapabilityReport(evidence),environment:{database_schema_observed:false,deployment:"not_verified",authenticated_smoke_test:"not_run"}});
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
 if(payload.action==="operations.team.list"){
  if(!["admin","manager"].includes(String(profile.role))) return json({error:"Manager permission required to inspect the team directory"},403);
  const {data,error}=await admin.from("profiles").select("id,full_name,role").eq("school_id",profile.school_id).in("role",["admin","manager","teacher","bursar"]).order("full_name",{ascending:true}).limit(250);
  if(error) return json({error:"Could not load workspace team"},500);
  return json({members:data||[]});
 }
 if(payload.action==="operations.task.assign"){
  if(!["admin","manager"].includes(String(profile.role))) return json({error:"Manager permission required to assign tasks"},403);
  const taskId=typeof payload.taskId==="string"?payload.taskId:"";
  const assigneeId=typeof payload.assigneeId==="string"?payload.assigneeId:"";
  if(!taskId||!assigneeId) return json({error:"taskId and assigneeId are required"},400);
  const [{data:task,error:taskErr},{data:member,error:memberErr}]=await Promise.all([
   admin.from("jd_operational_tasks").select("id").eq("id",taskId).eq("school_id",profile.school_id).maybeSingle(),
   admin.from("profiles").select("id,role").eq("id",assigneeId).eq("school_id",profile.school_id).maybeSingle()
  ]);
  if(taskErr||!task) return json({error:"Operational task not found"},404);
  if(memberErr||!member||!["admin","manager","teacher","bursar"].includes(String(member.role))) return json({error:"Assignee is not an eligible member of this workspace"},400);
  const {data:updated,error}=await admin.from("jd_operational_tasks").update({assigned_to:assigneeId,updated_at:new Date().toISOString()}).eq("id",taskId).eq("school_id",profile.school_id).select("id,assigned_to,status").single();
  if(error) return json({error:"Could not assign operational task"},500);
  return json({task:updated});
 }
 if(payload.action==="operations.task.create"){
  if(!["admin","manager"].includes(String(profile.role))) return json({error:"Manager permission required to create operational tasks"},403);
  let task:any;try{task=normaliseTaskInput(payload.task||{});}catch(e){return json({error:e instanceof Error?e.message:"Invalid task"},400);}
  const stableId=typeof payload.idempotencyId==="string"?payload.idempotencyId:"";
  if(!stableId) return json({error:"idempotencyId is required"},400);
  const key=makeIdempotencyKey(profile.school_id,"task.create",stableId);
  const {data:existing}=await admin.from("jd_operational_tasks").select("id,status,title").eq("school_id",profile.school_id).eq("idempotency_key",key).maybeSingle();
  if(existing) return json({task:existing,reused:true});
  const {data:created,error}=await admin.from("jd_operational_tasks").insert({school_id:profile.school_id,created_by:authData.user.id,title:task.title,description:task.description,department:task.department,due_at:task.due_at,priority:task.priority,idempotency_key:key}).select("id,status,title,description,priority,created_at").single();
  if(error?.code==="23505"){
   const {data:duplicate}=await admin.from("jd_operational_tasks").select("id,status,title,description,priority,created_at").eq("school_id",profile.school_id).eq("idempotency_key",key).maybeSingle();
   if(duplicate) return json({task:duplicate,reused:true});
  }
  if(error||!created) return json({error:"Could not create operational task"},500);
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
 if(payload.action==="hiring.vacancy.approve"){
  if(profile.role!=="admin") return json({error:"Only workspace admins can approve vacancy publication"},403);
  const id=typeof payload.vacancyId==="string"?payload.vacancyId:"";
  if(!id) return json({error:"vacancyId is required"},400);
  const {data:vacancy,error:lookupErr}=await admin.from("jd_hiring_requisitions").select("id,status").eq("id",id).eq("school_id",profile.school_id).maybeSingle();
  if(lookupErr||!vacancy) return json({error:"Vacancy draft not found"},404);
  if(!["draft","pending_approval","paused"].includes(vacancy.status)) return json({error:"Vacancy is not eligible to be opened"},409);
  const {data:updated,error}=await admin.from("jd_hiring_requisitions").update({status:"open",approved_by:authData.user.id,approved_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",id).eq("school_id",profile.school_id).eq("status",vacancy.status).select("id,title,status,approved_at").maybeSingle();
  if(error||!updated) return json({error:"Vacancy changed concurrently; reload before retrying"},409);
  return json({vacancy:updated,public_publishing:false});
 }
 if(payload.action==="hiring.candidate.create"){
  if(profile.role!=="admin") return json({error:"Only workspace admins can register candidates"},403);
  const requisitionId=typeof payload.requisitionId==="string"?payload.requisitionId:"";
  const fullName=typeof payload.fullName==="string"?payload.fullName.trim().slice(0,160):"";
  const email=typeof payload.email==="string"&&payload.email.trim()?payload.email.trim().slice(0,254):null;
  if(!requisitionId||!fullName) return json({error:"An open vacancy and candidate name are required"},400);
  if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({error:"Candidate email is invalid"},400);
  const {data:vacancy,error:vacancyErr}=await admin.from("jd_hiring_requisitions").select("id,status").eq("id",requisitionId).eq("school_id",profile.school_id).maybeSingle();
  if(vacancyErr||!vacancy||vacancy.status!=="open") return json({error:"Candidate intake is available only for an internally open vacancy"},409);
  const {data:created,error}=await admin.from("jd_hiring_candidates").insert({school_id:profile.school_id,requisition_id:requisitionId,full_name:fullName,contact_email:email,stage:"applied"}).select("id,requisition_id,full_name,stage,created_at").single();
  if(error) return json({error:"Could not register candidate"},500);
  return json({candidate:created},201);
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
 // Routine requests enter the durable queue. The worker owns model execution,
 // checkpoints, retries and terminal run state; this request returns immediately.
 const {data:job,error:enqueueError}=await admin.rpc("jd_enqueue_execution_job",{p_run_id:run.id});
 if(enqueueError||!job?.job_id){
  await admin.from("jd_automation_runs").update({status:"failed",result_json:{error:"execution_enqueue_failed"},completed_at:new Date().toISOString()}).eq("id",run.id).eq("school_id",profile.school_id);
  return json({conversationId,run:{...run,status:"failed"},error:"JD could not queue this request. No execution was started."},503);
 }
 const queuedReply="Your request is safely queued. JD will process it in the background and preserve progress if a worker needs to retry.";
 await admin.from("jd_messages").insert({school_id:profile.school_id,conversation_id:conversationId,role:"assistant",content:queuedReply,content_json:{execution_job_id:job.job_id,execution_status:"queued"}});
 return json({conversationId,run:{...run,status:"queued"},job:{id:job.job_id,status:job.status},reply:queuedReply,queued:true});
});
