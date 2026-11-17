import {businessBlueprint} from '../../supabase/functions/_shared/jd-business-foundation.mjs';
import {buildSaasAgentTeam} from '../../supabase/functions/_shared/jd-agent-architect.mjs';
export const stable=value=>JSON.stringify(sort(value));
function sort(v){return Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;}
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export async function foundationRequest(client,role,body){
 if(!['owner','admin'].includes(role))throw Error('Workspace administrator required.');
 let r;try{r=await client.functions.invoke('jd-automation',{body});}catch{throw Error('Response unavailable. Refresh records before retrying; no success is confirmed.');}
 if(r?.error||r?.data?.error||!r?.data){const status=r?.error?.context?.status||r?.error?.status;throw Error(status===409?'Version conflict or release gate. Refresh records; no execution is confirmed.':status===429?'Research request limit reached. Wait before retrying.':'Request not confirmed. Check access and the reviewed backend release; no success is confirmed.');}
 return r.data;
}
export async function readFoundationVersions(client,role,documentId){
 const r=await foundationRequest(client,role,{action:'foundation.versions',documentId});
 if(r.executionEnabled!==false||!Array.isArray(r.versions)||!r.versions.length||r.versions.some(v=>!uuid(v.id)||v.document_id!==documentId||!Number.isInteger(v.version)||!v.content||!uuid(v.approval_id)||!['pending','approved','rejected','expired','cancelled'].includes(v.review?.status)))throw Error('Version history is incomplete. No current state has been confirmed.');
 return r.versions;
}
export async function saveFoundationDesign(client,role,{design,documentId=null,expectedVersion=0,requestId}){
 const kind=design?.kind==='business'?'business':design?.kind==='saas_agent_team_design'?'saas':null;
 const canonical=kind==='business'?businessBlueprint(design.dna):kind==='saas'?buildSaasAgentTeam(design.project):null;
 if(!canonical||stable(design)!==stable(canonical)||!uuid(requestId)||!Number.isInteger(expectedVersion)||expectedVersion<0||(documentId!==null&&!uuid(documentId)))throw Error('Invalid blueprint save request.');
 const r=await foundationRequest(client,role,{action:'foundation.save',kind,dna:kind==='business'?design.dna:undefined,project:kind==='saas'?design.project:undefined,documentId,expectedVersion,requestId});
 const receipt=r.receipt;
 if(receipt?.persisted!==true||receipt.execution_performed!==false||!uuid(receipt.document_id)||!uuid(receipt.version_id)||!uuid(receipt.approval_id)||receipt.version!==expectedVersion+1||(documentId&&receipt.document_id!==documentId))throw Error('Save acknowledgement incomplete. Refresh before retrying.');
 const versions=await readFoundationVersions(client,role,receipt.document_id),saved=versions.find(v=>v.id===receipt.version_id);
 if(!saved||saved.version!==receipt.version||saved.approval_id!==receipt.approval_id||saved.content_hash!==receipt.content_hash||stable(saved.content)!==stable(canonical))throw Error('Saved version read-back did not match. Refresh before retrying.');
 return {receipt,versions};
}
