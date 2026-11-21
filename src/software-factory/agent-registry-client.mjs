import {validateAgentDefinition} from '../../supabase/functions/_shared/jd-agent-registry.mjs';
import {stable} from './foundation-client.mjs';
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export async function registryRequest(client,role,body){
 if(!['owner','admin'].includes(role))throw Error('Workspace administrator required.');
 if(!['registry.read','registry.save','registry.evaluate','registry.request_review','registry.approve','registry.reject','registry.publish','registry.suspend','registry.execution.request_grant','registry.execution.approve','registry.execution.reject','registry.execution.grant','registry.execution.revoke'].includes(body?.action))throw Error('Unsupported registry action.');
 if(body.agentId!=null&&!uuid(body.agentId))throw Error('Invalid agent identifier.');
 if(body.action!=='registry.read'&&(!uuid(body.requestId)||body.confirm!==true||!Number.isInteger(body.expectedVersion)||body.expectedVersion<0))throw Error('Invalid registry submission.');
 if(body.action==='registry.save')validateAgentDefinition(body.definition);
 let reply;try{reply=await client.functions.invoke('jd-automation',{body});}catch{throw Error('Outcome uncertain. Reload records; keep the same request identifier when retrying.');}
 if(reply?.error||reply?.data?.error||!reply?.data)throw Error('Registry operation not confirmed. Check the release, access and evaluation/review requirements; reload before retrying.');
 const {registry:r,receipt}=reply.data;
 if(!r||r.hiring_enabled!==false||r.execution_enabled!==false||r.billing_enabled!==false||r.publication_scope!=='tenant_private'||!['agents','versions','evaluations','approvals'].every(k=>Array.isArray(r[k]))||r.agents.some(a=>!uuid(a.id)||!Number.isInteger(a.current_version)||!hash(a.content_hash)||typeof a.operational_evaluation_current!=='boolean'||typeof a.publication_current!=='boolean'||typeof a.execution_authorized!=='boolean'))throw Error('Registry read-back is incomplete.');
 if(body.agentId&&r.agents.some(a=>a.id!==body.agentId))throw Error('Registry read-back scope mismatch.');
 if(r.agents.length>50||r.versions.length>10||r.evaluations.length>10||r.versions.some(v=>!Number.isInteger(v.version)||!hash(v.content_hash))||r.evaluations.some(e=>!uuid(e.id)||!['contract','operational'].includes(e.kind)||(e.report!=null&&(!hash(e.report_hash)||!Array.isArray(e.report.cases)||e.report.cases.some(c=>typeof c.caseId!=='string'||typeof c.observed!=='string'||!['passed','failed','blocked'].includes(c.status))))))throw Error('Registry evidence is incomplete.');
 for(const v of r.versions)validateAgentDefinition(v.content);
 if((body.agentId||body.action!=='registry.read')&&(r.agents.length!==1||!r.versions.some(v=>v.version===r.agents[0].current_version&&v.content_hash===r.agents[0].content_hash)))throw Error('Current definition read-back is missing.');
 if(body.action==='registry.read')return r;
 const agent=r.agents[0];
 if(!receipt||receipt.hiring_enabled!==false||!agent)throw Error('Registry acknowledgement is incomplete.');
 if(body.action==='registry.save'){
  const canonical=validateAgentDefinition(body.definition),v=r.versions.find(v=>v.version===receipt.version);
  if(receipt.persisted!==true||receipt.version!==body.expectedVersion+1||receipt.agent_id!==agent.id||agent.current_version!==receipt.version||receipt.content_hash!==v?.content_hash||stable(v?.content)!==stable(canonical))throw Error('Saved definition read-back changed or did not match. Reload before editing.');
 }else if(body.action.startsWith('registry.execution.')){
  if(agent.current_version!==body.expectedVersion)throw Error('A newer definition exists. Reload before continuing.');
  if(receipt.agent_id!==agent.id||typeof receipt.execution_authorized!=='boolean'||receipt.execution_enabled!==false||receipt.hiring_enabled!==false)throw Error('Execution-authority receipt is incomplete. Reload records.');
  if(agent.execution_authorized!==receipt.execution_authorized)throw Error('Execution-authority read-back changed. Reload current records.');
  if(body.action==='registry.execution.grant'&&receipt.execution_authorized!==true)throw Error('Execution authority was not granted. Reload current records.');
  if(body.action==='registry.execution.revoke'&&receipt.execution_authorized!==false)throw Error('Execution authority was not revoked. Reload current records.');
 }else{
  if(agent.current_version!==body.expectedVersion)throw Error('A newer definition exists. Reload before continuing.');
  if(body.action==='registry.evaluate'){
   const e=r.evaluations.find(e=>e.id===receipt.evaluation_id);
   if(receipt.kind!=='contract'||e?.kind!=='contract'||e?.report_hash!==receipt.report_hash||!hash(receipt.report_hash)||agent.current_evaluation!==receipt.evaluation_id)throw Error('Contract evidence read-back did not match.');
  }else{
   const target={request_review:'review_pending',approve:'reviewed',reject:'draft',publish:'published',suspend:'suspended'}[body.action.slice('registry.'.length)];
   if(receipt.agent_id!==agent.id||receipt.state!==target||agent.state!==target)throw Error('Publication decision read-back changed. Reload current records.');
  }
 }
 return r;
}
