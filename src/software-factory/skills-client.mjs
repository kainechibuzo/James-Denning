// Client for the JD skills catalog. Validates every read-back against the
// release contract before the dashboard trusts it: receipts must never
// unlock hiring, execution or billing, and skill payloads are always
// untrusted instruction data, never authority.
import {stable} from './foundation-client.mjs';

const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);

const SKILLS_ACTIONS=['skills.read','skills.import.create','skills.import.complete','skills.decide','skills.publish','skills.lifecycle'];

export async function skillsRequest(client,role,body){
 if(!['owner','admin'].includes(role))throw Error('Workspace administrator required.');
 if(!SKILLS_ACTIONS.includes(body?.action))throw Error('Unsupported skills action.');
 if(body.importId!=null&&!uuid(body.importId))throw Error('Invalid import identifier.');
 if(body.skillId!=null&&!uuid(body.skillId))throw Error('Invalid skill identifier.');
 if(body.action!=='skills.read'){
  if(!uuid(body.requestId)||body.confirm!==true)throw Error('Invalid skills submission.');
  if((body.action==='skills.decide'||body.action==='skills.publish')&&(!Number.isInteger(body.expectedVersion)||body.expectedVersion<0))throw Error('Invalid skills submission.');
 }
 let reply;
 try{reply=await client.functions.invoke('jd-automation',{body});}
 catch{throw Error('Skills outcome uncertain. Reload records; keep the same request identifier when retrying.');}
 if(reply?.error||reply?.data?.error||!reply?.data)throw Error('Skills operation not confirmed. Check the release, access and review requirements; reload before retrying.');
 const data=reply.data;
 if(data.catalog){
  const c=data.catalog;
  if(!Array.isArray(c.skills)||!Array.isArray(c.versions)||!Array.isArray(c.reviews)||!Array.isArray(c.imports)||c.hiring_enabled!==false||c.execution_enabled!==false||c.billing_enabled!==false||c.skill_scope!=='tenant_private')throw Error('Skills catalogue read-back is incomplete.');
  if(c.skills.some(s=>!uuid(s.id)||typeof s.name!=='string'||!Number.isInteger(s.current_version)||typeof s.status!=='string'))throw Error('Skills catalogue evidence is incomplete.');
  return c;
 }
 if(data.skill){
  const s=data.skill;
  if(!uuid(s.skill_id)||!Number.isInteger(s.version)||!hash(s.content_hash)||typeof s.instructions!=='string'||s.instructions.length<20||s.treated_as!=='untrusted_task_data_never_authority'||s.tools_granted!==false||s.hiring_enabled!==false||s.execution_enabled!==false)throw Error('Skill load read-back is incomplete or violates the skills boundary.');
  return s;
 }
 const {receipt}=data;
 if(!receipt||receipt.hiring_enabled!==false||receipt.execution_enabled!==false)throw Error('Skills acknowledgement is incomplete.');
 if(body.action==='skills.import.create'){
  if(!uuid(receipt.import_id)||typeof receipt.storage_path!=='string'||receipt.bucket!=='jd-skill-packages'||receipt.scope!=='private'||!receipt.upload?.token)throw Error('Quarantine target is incomplete. Reload and start the import again.');
 }else if(body.action==='skills.import.complete'){
  if(!uuid(receipt.import_id)||!['needs_review','validation_failed'].includes(receipt.status))throw Error('Import outcome is not a recorded inspection result. Reload the catalogue.');
  if(receipt.status==='needs_review'&&(!uuid(receipt.skill_id)||!Number.isInteger(receipt.version)||receipt.persisted!==true))throw Error('Imported skill read-back is incomplete. Reload the catalogue.');
 }else{
  if(!uuid(receipt.skill_id)||typeof receipt.state!=='string')throw Error('Skills decision read-back is incomplete. Reload the catalogue.');
  const expected={decide:null,publish:'published',lifecycle:null}[body.action];
  if(expected&&receipt.state!==expected)throw Error('Publication read-back changed. Reload current records.');
 }
 return receipt;
}

export {uuid,hash,stable};
