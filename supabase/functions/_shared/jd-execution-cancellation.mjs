// Source-owned release gate; never selected by HTTP body or an RPC failure.
export const BACKEND_CANCELLATION_RELEASE = 'legacy';
const isId=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const isVersion=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(v)&&Number.isFinite(Date.parse(v));
export async function handleExecutionCancellation({admin,profile,actorId,payload,json},release=BACKEND_CANCELLATION_RELEASE){
 if(!['owner','admin'].includes(profile?.role)||profile?.id!==actorId||!isId(actorId)||!isId(profile.school_id))return json({error:'Workspace administrator required'},403);
 if(!['legacy','checked'].includes(release))return json({error:'Cancellation release is unavailable'},503);
 if(!['execution.job.cancel','execution.job.cancel_checked'].includes(payload?.action))return json({error:'Unsupported cancellation action'},400);
 if(release==='legacy'){
  if(payload.action!=='execution.job.cancel')return json({error:'Checked cancellation is not enabled'},409);
  return legacyCancellation({admin,profile,actorId,payload,json});
 }
 if(payload.action!=='execution.job.cancel_checked')return json({error:'Refresh JD before cancelling; checked cancellation is required'},409);
 if(!isId(payload.jobId)||!isId(payload.expectedRunId)||!isVersion(payload.expectedUpdatedAt))return json({error:'Observed job, run and version are required; refresh records'},400);
 try{
  const {data,error}=await admin.rpc('jd_cancel_execution_job_checked',{
   p_actor_id:actorId,p_job_id:payload.jobId,p_expected_run_id:payload.expectedRunId,p_expected_updated_at:payload.expectedUpdatedAt,
  });
  if(error){
   const status=error.code==='42501'?403:error.code==='P0002'?404:error.code==='40001'?409:['22023','22007','22008'].includes(error.code)?400:500;
   return json({error:status===409?'Job or run changed; refresh records':'Cancellation was not confirmed; refresh before another request'},status);
  }
  if(data?.job?.id!==payload.jobId||data.job.run_id!==payload.expectedRunId||data.job.status!=='cancelled'||!isVersion(data.job.updated_at)||data.job.updated_at===payload.expectedUpdatedAt||data?.run?.id!==payload.expectedRunId||data.run.status!=='cancelled'||data.auditRecorded!==true||!isId(data.auditId)||data.externalEffectsReversed!==false)return json({error:'Cancellation acknowledgement is incomplete; refresh records'},500);
  return json({job:data.job,run:data.run,auditRecorded:true,auditId:data.auditId,externalEffectsReversed:false});
 }catch{return json({error:'Cancellation response was lost; refresh before another request'},500);}
}
// Preserved compatibility path. Job/run/audit are NOT atomic here; the UI must
// continue to reconcile both records and must not claim audit verification.
async function legacyCancellation({admin,profile,actorId,payload,json}){
  const jobId=typeof payload.jobId==="string"?payload.jobId:"";
  if(!jobId) return json({error:"jobId is required"},400);
  const {data:job,error:jobErr}=await admin.from("jd_execution_jobs").select("id,run_id,status").eq("id",jobId).eq("school_id",profile.school_id).maybeSingle();
  if(jobErr||!job) return json({error:"Execution job not found"},404);
  if(!["queued","retry_wait"].includes(job.status)) return json({error:"Only queued or waiting jobs can be cancelled safely"},409);
  const {data:updated,error:updateErr}=await admin.from("jd_execution_jobs").update({status:"cancelled",updated_at:new Date().toISOString(),completed_at:new Date().toISOString()}).eq("id",jobId).eq("school_id",profile.school_id).eq("status",job.status).select("id,status").maybeSingle();
  if(updateErr||!updated) return json({error:"Job changed concurrently; refresh before retrying"},409);
  const {error:runUpdateErr}=await admin.from("jd_automation_runs").update({status:"cancelled",completed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",job.run_id).eq("school_id",profile.school_id);
  if(runUpdateErr) return json({error:"Job was cancelled but run summary could not be updated"},500);
  await admin.from("jd_audit_events").insert({school_id:profile.school_id,actor_id:actorId,run_id:job.run_id,event_type:"execution.cancelled",event_json:{job_id:jobId,previous_status:job.status}});
  return json({job:updated});
}
