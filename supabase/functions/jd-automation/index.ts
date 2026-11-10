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
  const {data:approval,error:approvalErr}=await admin.from("jd_approvals")
   .select("id,run_id,status,expires_at,execution_status").eq("id",approvalId)
   .eq("school_id",profile.school_id).maybeSingle();
  if(approvalErr||!approval) return json({error:"Approval request not found"},404);
  if(approval.status!=="pending") return json({error:"This request has already been decided"},409);
  if(new Date(approval.expires_at).getTime()<=Date.now()){
   await admin.from("jd_approvals").update({status:"expired",updated_at:new Date().toISOString()}).eq("id",approvalId).eq("school_id",profile.school_id);
   return json({error:"This approval request has expired"},410);
  }
  const now=new Date().toISOString();
  const {data:updated,error:updateErr}=await admin.from("jd_approvals")
   .update({status:decision,decided_by:authData.user.id,decision_note:note,decided_at:now,updated_at:now})
   .eq("id",approvalId).eq("school_id",profile.school_id).eq("status","pending")
   .select("id,status,execution_status,decided_by,decided_at,decision_note").maybeSingle();
  if(updateErr||!updated) return json({error:"Could not record the approval decision"},500);
  await admin.from("jd_audit_events").insert({school_id:profile.school_id,actor_id:authData.user.id,run_id:approval.run_id,event_type:"approval."+decision,event_json:{approval_id:approvalId,execution_status:"not_executed"}});
  return json({approval:updated,execution:{status:"not_executed",message:decision==="approved"?"Approved. Execution is not enabled yet; no external action has been performed.":"Rejected. No action was performed."}});
 }
 if(payload.action==="history"){
  const id=String(payload.conversationId||"");
  if(!id) return json({error:"conversationId is required"},400);
  const {data,error}=await admin.from("jd_messages").select("id,role,content,content_json,created_at").eq("school_id",profile.school_id).eq("conversation_id",id).order("created_at").limit(100);
  if(error) return json({error:"Could not load conversation"},500);
  return json({messages:data||[]});
 }
 if(payload.action!=="submit") return json({error:"Unsupported action"},400);
 const message=typeof payload.message==="string"?payload.message.trim():"";
 if(!message||message.length>12000) return json({error:"Message is required and must be under 12,000 characters"},400);
 let conversationId=typeof payload.conversationId==="string"?payload.conversationId:null;
 if(conversationId){
  const {data}=await admin.from("jd_conversations").select("id").eq("id",conversationId).eq("school_id",profile.school_id).maybeSingle();
  if(!data) return json({error:"Conversation not found in this workspace"},404);
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
 try{
  await admin.from("jd_automation_runs").update({status:"running",started_at:new Date().toISOString()}).eq("id",run.id);
  const result=await runAgent({
   message,history:(history||[]).map((m:any)=>({role:m.role,content:m.content})),
   context:{admin,schoolId:profile.school_id,userId:authData.user.id,role:profile.role||"member"},
   apiKey,model:model||"",baseUrl:Deno.env.get("JD_MODEL_BASE_URL")||"https://openrouter.ai/api/v1",
   onToolEvent:async(event)=>{
    events.push(event);
    await admin.from("jd_automation_steps").insert({
     school_id:profile.school_id,run_id:run.id,step_index:events.length,tool_key:String(event.name||"unknown"),
     risk_level:String(event.risk||"low"),status:event.status==="completed"?"completed":event.status==="failed"?"failed":"running",
     output_json:{event:event.status},completed_at:event.status==="completed"||event.status==="failed"?new Date().toISOString():null
    });
   }
  });
  const {error:assistantErr}=await admin.from("jd_messages").insert({school_id:profile.school_id,conversation_id:conversationId,role:"assistant",content:result.text,content_json:{toolEvents:events.map(e=>({name:e.name,status:e.status}))}});
  if(assistantErr) throw new Error("Agent response could not be saved");
  await admin.from("jd_automation_runs").update({status:"completed",result_json:{toolEvents:events,responseId:result.responseId},completed_at:new Date().toISOString()}).eq("id",run.id);
  await admin.from("jd_audit_events").insert({school_id:profile.school_id,actor_id:authData.user.id,run_id:run.id,event_type:"automation.completed",event_json:{tool_count:events.length}});
  return json({conversationId,run:{...run,status:"completed"},reply:result.text,toolEvents:events});
 }catch(error){
  const detail=error instanceof Error?error.message:"Agent execution failed";
  const reply=`I couldn't complete this run. It is marked failed rather than pretending it succeeded. ${detail.slice(0,240)}`;
  await admin.from("jd_messages").insert({school_id:profile.school_id,conversation_id:conversationId,role:"assistant",content:reply});
  await admin.from("jd_automation_runs").update({status:"failed",result_json:{error:detail.slice(0,400),toolEvents:events},completed_at:new Date().toISOString()}).eq("id",run.id);
  await admin.from("jd_audit_events").insert({school_id:profile.school_id,actor_id:authData.user.id,run_id:run.id,event_type:"automation.failed",event_json:{error:detail.slice(0,240)}});
  return json({conversationId,run:{...run,status:"failed"},reply},502);
 }
});
