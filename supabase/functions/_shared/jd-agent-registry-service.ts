import {safeText} from './jd-business-foundation.mjs';
import {validateAgentDefinition,evaluateDefinitionContract,CONTRACT_RUNNER} from './jd-agent-registry.mjs';
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export async function handleAgentRegistry({payload,admin,profile,actorId,json,enabled=false}:any){
 if(!['owner','admin'].includes(profile?.role)||profile?.id!==actorId||!profile?.school_id)return json({error:'Workspace administrator required'},403);
 if(!enabled)return json({error:'Agent registry needs a reviewed backend and database release.',releaseEnabled:false},409);
 const action=payload?.action;
 const executionAction=typeof action==='string'&&action.startsWith('registry.execution.')?action.slice('registry.execution.'.length):null;
 if(!['registry.read','registry.save','registry.evaluate','registry.request_review','registry.approve','registry.reject','registry.publish','registry.suspend','registry.execution.request_grant','registry.execution.approve','registry.execution.reject','registry.execution.grant','registry.execution.revoke'].includes(action))return json({error:'Unsupported registry action'},400);
 if(payload.agentId!=null&&!uuid(payload.agentId))return json({error:'Invalid agent identifier'},400);
 const call=async(name:string,args:any)=>{const {data,error}=await admin.rpc(name,args);if(error)throw {dbCode:error.code};if(!data||data.hiring_enabled!==false)throw {dbCode:'receipt'};return data;};
 const read=(id:string|null)=>call('jd_read_agent_registry',{p_actor:actorId,p_agent:id});
 try{
  if(action==='registry.read')return json({registry:await read(payload.agentId||null)});
  if(payload.confirm!==true||!uuid(payload.requestId)||!Number.isInteger(payload.expectedVersion)||payload.expectedVersion<0)return json({error:'Confirmation, request identifier and expected version required'},400);
  let receipt;
  if(action==='registry.save'){
   let content;try{content=validateAgentDefinition(payload.definition);}catch{return json({error:'Definition invalid. Check required cases, limits and fields; remove credentials.'},400);}
   receipt=await call('jd_save_agent_definition',{p_actor:actorId,p_request:payload.requestId,p_agent:payload.agentId||null,p_expected:payload.expectedVersion,p_content:content});
  }else{
   if(!uuid(payload.agentId))return json({error:'Saved agent required'},400);
   if(action==='registry.evaluate'){
    // Browser cannot choose an evaluator, submit results or label these operational.
    const before=await read(payload.agentId),version=before.versions?.find((v:any)=>v.version===payload.expectedVersion);
    if(!version||before.agents?.[0]?.current_version!==payload.expectedVersion)return json({error:'Current version changed. Reload before evaluating.'},409);
    const report=evaluateDefinitionContract(version.content);
    const started=await call('jd_start_agent_evaluation',{p_actor:actorId,p_request:payload.requestId,p_agent:payload.agentId,p_expected:payload.expectedVersion,p_kind:'contract',p_runner:CONTRACT_RUNNER});
    if(!uuid(started.evaluation_id)||started.content_hash!==version.content_hash)throw {dbCode:'receipt'};
    receipt=await call('jd_finish_agent_evaluation',{p_evaluation:started.evaluation_id,p_runner:CONTRACT_RUNNER,p_report:report});
   }else if(executionAction){
    // Execution authority is recorded only; the registry never executes agents.
    try{safeText(payload.note,'Review note',10,1000);}catch{return json({error:'A review note of 10–1000 characters without credentials is required'},400);}
    receipt=await call('jd_agent_execution',{p_actor:actorId,p_request:payload.requestId,p_agent:payload.agentId,p_expected:payload.expectedVersion,p_action:executionAction,p_note:payload.note,p_expected_evaluation:payload.evaluationId||null,p_expected_approval:payload.approvalId||null});
    if(receipt?.execution_authorized!==true&&receipt?.execution_authorized!==false)throw {dbCode:'receipt'};
    if(receipt?.execution_enabled!==false||receipt?.hiring_enabled!==false)throw {dbCode:'receipt'};
   }else{
    try{safeText(payload.note,'Review note',10,1000);}catch{return json({error:'A review note of 10–1000 characters without credentials is required'},400);}
    receipt=await call('jd_agent_publication',{p_actor:actorId,p_request:payload.requestId,p_agent:payload.agentId,p_expected:payload.expectedVersion,p_action:action.slice('registry.'.length),p_note:payload.note,p_expected_evaluation:payload.evaluationId||null,p_expected_approval:payload.approvalId||null});
   }
  }
  const id=receipt.agent_id||payload.agentId;
  if(!uuid(id))throw {dbCode:'receipt'};
  return json({receipt,registry:await read(id)});
 }catch(e:any){const code=e?.dbCode;return json({error:code==='42501'?'Current authority or evaluation/review requirements were not met. Contract checks do not permit publication.':code==='40001'?'Version, request or review conflict. Reload; reuse the same request identifier after an uncertain submission.':'Registry outcome not confirmed. Reload records before retrying; do not assume the write failed.'},code==='42501'?403:code==='40001'?409:code==='22023'?400:code==='receipt'?502:503);}
}
