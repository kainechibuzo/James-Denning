// Synthetic UI transport only; never imported by product code.
import {evaluateDefinitionContract} from '../../supabase/functions/_shared/jd-agent-registry.mjs';
export const registryId=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export function registryFixture(){
 const calls=[],agents=[],histories=new Map(),requests=new Map();let fail=false;
 const snapshot=agentId=>{const selected=agents.filter(a=>!agentId||a.id===agentId),h=histories.get(agentId);return{agents:structuredClone(selected),versions:structuredClone(h?.versions||[]),evaluations:structuredClone(h?.evaluations||[]),approvals:[],hiring_enabled:false,execution_enabled:false,billing_enabled:false,publication_scope:'tenant_private'};};
 const handler=body=>{
  calls.push(structuredClone(body));if(fail)return{error:{message:'SYNTHETIC_PRIVATE_DIAGNOSTIC'}};
  if(body.action==='registry.read')return{data:{registry:snapshot(body.agentId)}};
  if(requests.has(body.requestId)){const prior=requests.get(body.requestId);return{data:{receipt:prior.receipt,registry:snapshot(prior.agentId)}};}
  let agent=agents.find(a=>a.id===body.agentId),receipt;
  if(body.action==='registry.save'){
   if(!agent){agent={id:registryId(agents.length+10),current_version:0};agents.push(agent);histories.set(agent.id,{versions:[],evaluations:[]});}
   if(agent.current_version!==body.expectedVersion)return{error:{message:'Version conflict'}};
   const version=agent.current_version+1,hash=version.toString(16).padStart(64,'0');Object.assign(agent,{name:body.definition.name,current_version:version,content_hash:hash,state:'draft',current_evaluation:null,review_approval:null,operational_evaluation_current:false,publication_current:false});histories.get(agent.id).versions.unshift({version,content_hash:hash,content:structuredClone(body.definition)});
   receipt={agent_id:agent.id,version,content_hash:hash,persisted:true,hiring_enabled:false,execution_enabled:false};
  }else if(body.action==='registry.evaluate'){
   if(!agent)throw Error('Missing synthetic agent');const h=histories.get(agent.id),eid=registryId(100+h.evaluations.length),report=evaluateDefinitionContract(h.versions[0].content);h.evaluations.unshift({id:eid,version:agent.current_version,kind:'contract',runner_key:'contract-v1',report,report_hash:'b'.repeat(64),outcome:'passed',completed_at:'2026-11-16T12:00:00Z'});agent.current_evaluation=eid;agent.state='draft';receipt={evaluation_id:eid,kind:'contract',outcome:'passed',report_hash:'b'.repeat(64),hiring_enabled:false};
  }else if(body.action==='registry.suspend'){agent.state='suspended';agent.publication_current=false;receipt={agent_id:agent.id,state:'suspended',hiring_enabled:false};}
  else throw Error('Unexpected synthetic registry action');
  requests.set(body.requestId,{receipt,agentId:agent.id});return{data:{receipt,registry:snapshot(agent.id)}};
 };
 return {calls,handler,client:{functions:{invoke:async(_,r)=>handler(r.body)}},setFail:value=>{fail=value;}};
}
