import {isTaskId} from './operational-task-records.mjs';
const toolLabels={get_workspace_overview:'Review organisation overview',get_organisation_departments:'Review departments',get_business_memory:'Read saved business decisions',remember_business_fact:'Save a business decision',get_hiring_pipeline:'Review hiring progress',get_people_intelligence:'Review workforce information',get_operations_intelligence:'Review operations',preview_hiring_vacancy:'Prepare a vacancy preview',preview_organisation_blueprint:'Prepare organisation structure',submit_organisation_blueprint_for_review:'Submit organisation plan for approval',get_workspace_settings_catalogue:'Review workspace settings',create_operational_setup_tasks:'Save launch-readiness tasks',create_business_document_draft:'Prepare a business document'};
// An unfamiliar tool or status must never be translated into a success claim.
export const friendlyTool=key=>Object.hasOwn(toolLabels,key)?toolLabels[key]:'Workspace tool (description unavailable)';
const statuses={pending:'Pending',queued:'Queued',planning:'Preparing',running:'Running',retry_wait:'Waiting to retry',completed:'Completed record',partially_completed:'Partially completed',awaiting_approval:'Awaiting approval',failed:'Failed',cancelled:'Cancelled',skipped:'Skipped'};
export const friendlyStatus=status=>Object.hasOwn(statuses,status)?statuses[status]:'Unrecognised status';
export async function readRunHistory(client){
 let result;
 try{result=await client.functions.invoke('jd-automation',{body:{action:'runs.list'}});}
 catch{throw Error('Run history could not be refreshed. Check your connection and try again.');}
 if(result?.error||result?.data?.error){
  const status=result?.error?.context?.status||result?.error?.status;
  throw Error(status===401?'Sign in again to read run history.':status===403?'Your account cannot read workspace run history.':'Run history could not be refreshed. No current execution state has been confirmed.');
 }
 const rows=result?.data?.runs;
 const ids=new Set();
 if(!Array.isArray(rows)||rows.length>50||rows.some(run=>{
  if(!isTaskId(run?.id)||ids.has(run.id)||typeof run.status!=='string'||typeof run.request_preview!=='string'||!Array.isArray(run.steps))return true;
  if(run.model!=null&&typeof run.model!=='string')return true;
  if(run.token_usage!=null&&(typeof run.token_usage!=='object'||Array.isArray(run.token_usage)))return true;
  if(run.model_requests!=null&&(!Array.isArray(run.model_requests)||run.model_requests.some(item=>!item||typeof item!=='object'||Array.isArray(item))))return true;
  ids.add(run.id);const steps=new Set();
  return run.steps.some(step=>{if(!isTaskId(step?.id)||steps.has(step.id)||typeof step.status!=='string'||typeof step.tool_key!=='string')return true;steps.add(step.id);return false;});
 }))throw Error('Run history returned incomplete records. No current execution state has been confirmed.');
 return rows;
}
