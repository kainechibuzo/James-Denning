// Internal worker adapter. Never exposed as a model tool or browser meter.
// Caller must already hold a live job lease and a separately created shadow reservation.
// No automatic retries after ambiguous RPC outcomes. retryPending replays the SAME request.
const phases=new Set(['idle','active','external_wait','approval_wait','paused','closed']);
export function createUsageObserver({admin,jobId,leaseToken,sequence=0,requestId=()=>crypto.randomUUID()}){
 if(!Number.isSafeInteger(sequence)||sequence<0)throw Error('Invalid usage sequence');
 let pending=null,busy=false,stopped=false,receipt=null;
 async function send(){
  if(busy)throw Error('Usage observation already in flight');
  busy=true;
  try{
   let reply;
   try{reply=await admin.rpc('jd_observe_usage',pending);}catch{throw Error('Usage observation transport uncertain; stop work and reconcile');}
   const {data,error}=reply||{};
   if(error)throw Error('Usage observation not confirmed; stop work and reconcile before retrying');
   if(!data||data.job_id!==jobId||data.sequence!==sequence+1||data.mode!=='shadow'||data.charged!==false||!['open','settled','review_required'].includes(data.status)||!phases.has(data.phase)||!Number.isSafeInteger(data.active_microseconds)||data.active_microseconds<0||!Number.isSafeInteger(data.estimate_micros)||data.estimate_micros<0||typeof data.uncertain!=='boolean'||!Number.isFinite(Date.parse(data.observed_at)))throw Error('Usage observation receipt is invalid; stop work');
   if(data.phase!==pending.p_phase&&data.phase!=='closed')throw Error('Usage phase acknowledgement mismatch');
   if(data.phase==='active'&&(!Number.isFinite(Date.parse(data.deadline))||Date.parse(data.deadline)<=Date.parse(data.observed_at)))throw Error('Active usage deadline missing; stop work');
   if((data.phase==='closed')!==(data.status!=='open'))throw Error('Usage terminal acknowledgement mismatch');
   sequence=data.sequence;receipt=Object.freeze({...data});stopped=data.status!=='open';pending=null;
   return receipt;
  }finally{busy=false;}
 }
 return Object.freeze({
  async observe(phase){
   if(!phases.has(phase))throw Error('Unknown usage phase');
   if(stopped)throw Error('Usage reservation is closed');
   if(pending)throw Error('Unconfirmed usage observation; stop work and replay or reconcile');
   pending={p_job_id:jobId,p_lease_token:leaseToken,p_request_id:requestId(),p_expected_sequence:sequence,p_phase:phase};
   return send();
  },
  async retryPending(){if(!pending)throw Error('No pending usage observation');return send();},
  get receipt(){return receipt;},
  get blocked(){return busy||pending!==null||stopped;},
 });
}

// Optional instrumentation of the existing queue worker, not a second executor.
// Only explicitly reserved jobs are measured. All external/model/tool waits are
// conservatively excluded; this is NOT commercial model-compute time measurement.
export async function runWithShadowUsage({admin,jobId,schoolId,leaseToken,enabled=false,run}){
 if(!enabled)return run(undefined);
 const {data,error}=await admin.from('jd_usage_runs').select('job_id,school_id,status,sequence')
  .eq('job_id',jobId).eq('school_id',schoolId).maybeSingle();
 if(error)throw Error('Shadow usage reservation lookup unavailable; stop work');
 if(!data)return run(undefined);
 if(data.job_id!==jobId||data.school_id!==schoolId||data.status!=='open')throw Error('Shadow usage reservation is not open; human reconciliation required');
 const observer=createUsageObserver({admin,jobId,leaseToken,sequence:data.sequence});
 const phase=async value=>{
  const receipt=await observer.observe(value);
  if(receipt.status!=='open')throw Error('Shadow usage limit or reconciliation boundary reached; stop work');
 };
 try{
  // Validate fencing and human authorisation before running any provider/tool.
  await phase('idle');
  const result=await run(phase);
  const closed=await observer.observe('closed');
  if(closed.status!=='settled')throw Error('Shadow usage needs human reconciliation');
  return result;
 }catch(error){
  // Best-effort close only with a confirmed sequence, never guess after a lost ack.
  // Closing records an estimate, not a billable successful execution outcome.
  if(!observer.blocked){try{await observer.observe('closed');}catch{/* retain reservation for terminal reconciliation */}}
  throw error;
 }
}
