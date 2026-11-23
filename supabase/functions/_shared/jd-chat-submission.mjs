import {validateResponse,validateAnswer,answerText} from './jd-response.mjs';
/** Called only after bearer-token authentication. Identity and tenant are
 * supplied by the endpoint, never by the request payload. */
export async function recordChatSubmission({payload,profile,actorId,admin,needsApproval}) {
 let message=typeof payload.message==="string"?payload.message.trim():"";
 let interaction = null;
 let expectedResponse = null;
 const requestedStyle=payload.responseStyle==null?null:payload.responseStyle;
 if(requestedStyle!==null&&!["concise","balanced","detailed"].includes(requestedStyle))return {error:"Invalid response style",status:400};
 const requestedConversation = typeof payload.conversationId === "string" ? payload.conversationId : null;
 if (payload.interaction !== undefined) {
  const value=payload.interaction;
  if (!requestedConversation || !value || typeof value.messageId!=="string" || !/^[0-9a-f-]{36}$/i.test(value.messageId) || typeof value.blockId!=="string") return {error:"Invalid interaction target",status:400};
  const {data:parent,error:parentError}=await admin.from("jd_messages").select("id,content_json")
   .eq("id",value.messageId).eq("school_id",profile.school_id).eq("conversation_id",requestedConversation).eq("role","assistant").maybeSingle();
  expectedResponse=validateResponse(parent?.content_json?.response);
  const block=expectedResponse?.blocks.find((b)=>b.id===value.blockId);
  if(parentError||!parent||!block||parent.content_json?.streaming===true) return {error:"This response is not available for an answer",status:409};
  try {
   const values=validateAnswer(block,value.values);
   message=answerText(block,values);
   interaction={messageId:parent.id,blockId:block.id,values};
  } catch (error) { return {error:String(error.message),status:400}; }
 }
 if(!message||message.length>12000) return {error:"Message is required and must be under 12,000 characters",status:400};
 const requestId=typeof payload.idempotencyKey==="string"?payload.idempotencyKey:crypto.randomUUID();
 if(!/^[a-zA-Z0-9_-]{1,100}$/.test(requestId)) return {error:"Invalid request identifier",status:400};
 const risk=needsApproval(message)?"approval_required":"routine";
 const {data:submission,error:submissionError}=await admin.rpc("jd_submit_chat_request",{
  p_school_id:profile.school_id,p_actor_id:actorId,p_conversation_id:requestedConversation,
  p_request_id:requestId,p_message:message,p_risk:risk,p_trigger_type:payload.triggerType==="upload"?"upload":"chat",p_interaction:interaction,p_expected_response:expectedResponse
 });
 if(submissionError||!submission?.run)return {error:submissionError?.code==="42501"?"Conversation not found":submissionError?.code==="23505"?"This question was already answered. Refresh the conversation.":"The request could not be recorded. Retry with the same request identifier.",status:submissionError?.code==="42501"?404:409};
 const conversationId=submission.conversationId;
 const run=submission.run;
 if(requestedStyle!==null){
  const {data:styleReceipt,error:styleError}=await admin.rpc("jd_set_chat_response_style",{
   p_run_id:run.id,p_actor_id:actorId,p_style:requestedStyle
  });
  if(styleError||styleReceipt?.response_style!==requestedStyle)return {error:"The request was recorded, but JD could not confirm its response preference. Retry safely with the same request identifier.",status:503};
 }
 const responseStyle=requestedStyle||"balanced";
 const receipt={userMessageId:submission.messageId,clientRequestId:requestId};
 // Roadmap sequence 1–2: when the skills product is release-gated on, a chat
 // objective is also a discovery request. The session is linked to this run so
 // the persisted provenance chain is complete (run → discovery → ledger →
 // assignments). Acquisition reuses the phase-6 quarantine pipeline; in
 // assisted mode the plan simply waits for the independent administrator
 // decision. Discovery never blocks or fails the chat: capabilities are
 // presented as "already there", so any problem is audited and the run
 // proceeds without the skill context.
 // Environment flags are read through process.env, which exists both in the
 // Deno 2 runtime (Node-compatibility layer) and under the Node test runner.
 const envFlag=(key)=>{try{return typeof process!=="undefined"&&process.env?process.env[key]==="true":false;}catch{return false;}};
 if(envFlag("JD_SKILLS_ENABLED")&&envFlag("JD_SKILLS_AUTONOMOUS")&&message.length>=10){
  try{
   const{planDiscovery,runDiscoveryAcquisition}=await import('./jd-discovery-agent.ts');
   const idea=message.slice(0,2000);
   const plan=planDiscovery(idea);
   const{data:existing}=await admin.from("jd_discovery_sessions").select("id,status")
    .eq("school_id",profile.school_id).eq("idea",idea.trim())
    .in("status",["proposed","approved","proceeding","completed"]).limit(1).maybeSingle();
   if(!existing){
    const{data:autonomy}=await admin.rpc("jd_read_workspace_autonomy",{p_actor:actorId});
    const mode=autonomy?.mode==="autonomous"?"autonomous":"assisted";
    const{data:started,error:startError}=await admin.rpc("jd_start_discovery",{
     p_actor:actorId,p_request:crypto.randomUUID(),p_idea:idea,p_plan:plan,p_mode:mode,p_run:run.id
    });
    if(startError)throw new Error(startError.message||"discovery start refused");
    if(started?.status==="proceeding"){
     await runDiscoveryAcquisition({session:started,plan,admin,actorId,tenantId:profile.school_id,requestId:crypto.randomUUID()});
    }
   }
  }catch(discoveryFailure){
   try{
    await admin.from("jd_audit_events").insert({school_id:profile.school_id,actor_id:actorId,run_id:run.id,
     event_type:"discovery.start_skipped",event_json:{reason:String(discoveryFailure?.message||"unknown").slice(0,200)}});
   }catch{/* audit is best effort; the run proceeds */}
  }
 }
 return {conversationId,run:{...run,response_style:responseStyle},receipt,submission,risk,responseStyle};
}
