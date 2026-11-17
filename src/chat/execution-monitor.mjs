import {isTaskId} from './operational-task-records.mjs';
// Change only after isolated migration/backend/client acceptance. Never auto-detect.
export const EXECUTION_CANCELLATION_RELEASE = 'legacy';
const isVersion=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(v)&&Number.isFinite(Date.parse(v));
const readers=new Set(['owner','admin','manager']);
const administrators=new Set(['owner','admin']);
const runStates=new Set(['queued','planning','awaiting_approval','running','retry_wait','completed','partially_completed','failed','cancelled']);
const jobStates=new Set(['queued','running','retry_wait','completed','partially_completed','failed','cancelled']);
const stepStates=new Set(['pending','awaiting_approval','running','completed','skipped','failed']);
const time=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?value:null;
const fail=message=>{throw Error(message);};
const empty=()=>({runs:[],jobs:[],steps:[]});
export const canReadExecution=role=>readers.has(role);
export function canChangeExecution(role,job,action,run){
 return administrators.has(role)&&isTaskId(job?.id)&&isTaskId(job?.run_id)&&(action==='retry'?job.status==='failed'&&(!run||run.status==='failed'):action==='cancel'&&['queued','retry_wait'].includes(job.status));
}
async function invoke(client,body){
 let response;
 try{response=await client.functions.invoke('jd-automation',{body});}catch{fail('The execution service response was lost. Refresh records before another action; no request was retried.');}
 if(response?.error||response?.data?.error||!response?.data){
  const status=response?.error?.context?.status||response?.error?.status;
  fail(status===401?'Sign in again to access execution records.':status===403?'Your account cannot perform this execution request.':status===409?'The job changed or is not eligible. Refresh execution records.':'The execution request was not confirmed. Refresh records before another action; no request was retried.');
 }
 return response.data;
}
export async function readExecutionMonitor(client,role){
 if(!canReadExecution(role))fail('Your role cannot read the execution monitor.');
 const data=await invoke(client,{action:'execution.monitor.list'});
 if(!Array.isArray(data.runs)||!Array.isArray(data.jobs)||!Array.isArray(data.steps)||data.runs.length>100||data.jobs.length>100||data.steps.length>500)fail('Execution history returned incomplete records. Refresh before making changes.');
 const seen={runs:new Set(),jobs:new Set(),steps:new Set()};
 for(const kind of ['runs','jobs','steps'])for(const row of data[kind]){
  if(!isTaskId(row?.id)||seen[kind].has(row.id))fail('Execution history returned invalid or duplicate records.');
  seen[kind].add(row.id);
  if(kind!=='runs'&&!seen.runs.has(row.run_id))fail('Execution history returned an unrelated job or step.');
  const states=kind==='runs'?runStates:kind==='jobs'?jobStates:stepStates;
  if(!states.has(row.status))fail('Execution history returned an unsupported state.');
  if(kind==='runs'&&typeof row.request_text!=='string')fail('Execution request details are incomplete.');
  if(kind==='jobs'&&(!Number.isInteger(row.attempt_count)||row.attempt_count<0||!Number.isInteger(row.max_attempts)||row.max_attempts<1))fail('Execution attempt details are incomplete.');
  if(kind==='steps'&&typeof row.tool_key!=='string')fail('Execution step details are incomplete.');
 }
 // Do not retain raw result_json/provider errors in UI state or tooltips.
 return{
  runs:data.runs.map(r=>({id:r.id,request_text:r.request_text.slice(0,500),status:r.status,created_at:time(r.created_at),started_at:time(r.started_at),completed_at:time(r.completed_at)})),
  jobs:data.jobs.map(j=>({id:j.id,run_id:j.run_id,status:j.status,attempt_count:j.attempt_count,max_attempts:j.max_attempts,available_at:time(j.available_at),updated_at:time(j.updated_at),hasError:!!(j.last_error_code||j.last_error_message)})),
  steps:data.steps.map(s=>({id:s.id,run_id:s.run_id,tool_key:s.tool_key,status:s.status,started_at:time(s.started_at),completed_at:time(s.completed_at),hasError:!!s.error_message})),
 };
}
export async function changeExecutionJob(client,{role,job,action,cancellationMode=EXECUTION_CANCELLATION_RELEASE}){
 if(!canChangeExecution(role,job,action))fail('Your role or the observed job state does not allow this action.');
 if(action==='cancel'&&!['legacy','checked'].includes(cancellationMode))fail('Cancellation release is invalid. No request was sent.');
 if(action==='cancel'&&cancellationMode==='checked'&&!isVersion(job.updated_at))fail('Refresh records to obtain the cancellation version.');
 const checked=action==='cancel'&&cancellationMode==='checked';
 const data=await invoke(client,checked?{action:'execution.job.cancel_checked',jobId:job.id,expectedRunId:job.run_id,expectedUpdatedAt:job.updated_at}:{action:`execution.job.${action}`,jobId:job.id});
 const saved=data.job;
 if(action==='retry'){
  if(saved?.job_id!==job.id||saved.run_id!==job.run_id||saved.status!=='queued'||!Number.isSafeInteger(saved.queue_message_id)||saved.queue_message_id<1)fail('Retry queue acknowledgement was incomplete. Refresh records; do not repeat the request.');
 }else if(checked){
  if(saved?.id!==job.id||saved.run_id!==job.run_id||saved.status!=='cancelled'||!isVersion(saved.updated_at)||saved.updated_at===job.updated_at||data.run?.id!==job.run_id||data.run.status!=='cancelled'||data.auditRecorded!==true||!isTaskId(data.auditId)||data.externalEffectsReversed!==false)fail('Cancellation and audit acknowledgement was incomplete. Refresh records; do not repeat the request.');
  return {id:saved.id,run_id:saved.run_id,status:saved.status,updated_at:saved.updated_at,cancellationAuditId:data.auditId};
 }else if(saved?.id!==job.id||saved.status!=='cancelled')fail('Cancellation acknowledgement was incomplete. Refresh records; partial changes may have been saved.');
 return saved; // Legacy cancellation/retry provide no audit receipt.
}
export function createExecutionMonitorController(client,{role,cancellationMode=EXECUTION_CANCELLATION_RELEASE}){
 let active=false,generation=0;
 let state={...empty(),phase:'idle',busy:false,error:'',notice:'',needsRefresh:false};
 const listeners=new Set();
 const emit=patch=>{state={...state,...patch};listeners.forEach(fn=>fn());};
 const current=g=>active&&g===generation;
 const api={
  getSnapshot:()=>state,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},
  activate(){active=true;generation++;emit({...empty(),phase:'idle',busy:false,error:'',notice:'',needsRefresh:false});},
  deactivate(){active=false;generation++;},
  async refresh(){
   if(!active||state.busy)return;
   const g=generation;emit({busy:true,phase:'loading',error:'',notice:''});
   try{const rows=await readExecutionMonitor(client,role);if(current(g))emit({...rows,phase:'ready',needsRefresh:false});}
   catch(error){if(current(g))emit({...empty(),phase:'error',error:error.message,needsRefresh:true});}
   finally{if(current(g))emit({busy:false});}
  },
  async change(jobId,action){
   const job=state.jobs.find(j=>j.id===jobId);
   if(!active||state.busy||state.phase!=='ready'||state.needsRefresh||!canChangeExecution(role,job,action,state.runs.find(r=>r.id===job?.run_id)))return;
   const g=generation;emit({busy:true,error:'',notice:''});
   try{
    const acknowledgement=await changeExecutionJob(client,{role,job,action,cancellationMode});
    if(!current(g))return;
    const rows=await readExecutionMonitor(client,role);
    if(!current(g))return;
    const observed=rows.jobs.find(j=>j.id===jobId&&j.run_id===job.run_id),run=rows.runs.find(r=>r.id===job.run_id);
    if(!observed||!run)fail('The changed job was not in the returned history sample. Refresh before another action.');
    if(action==='cancel'&&(observed.status!=='cancelled'||run.status!=='cancelled'))fail('Job and run cancellation records do not agree. Refresh and request administrator review; partial effects may remain.');
    if(acknowledgement.cancellationAuditId&&observed.updated_at!==acknowledgement.updated_at)fail('Cancellation version read-back did not match. Refresh and request administrator review.');
    emit({...rows,notice:action==='retry'?`Retry request acknowledged. Current job state: ${observed.status}. This is not proof of successful execution or absence of duplicate external effects.`:acknowledgement.cancellationAuditId?'Cancellation confirmed in job and run records; a transactional audit receipt was acknowledged. Earlier external effects are not undone. This is not independent verification of a business outcome.':'Cancellation confirmed in job and run records. Earlier external effects are not undone. Audit evidence is not verified by this response.'});
   }catch(error){if(current(g))emit({error:error.message,needsRefresh:true,notice:''});}
   finally{if(current(g))emit({busy:false});}
  },
 };
 return api;
}
