// Authenticated human control path only. No model/tool API to grant budgets or meter time.
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const amount=(v:unknown,max:number)=>Number.isSafeInteger(v)&&Number(v)>=0&&Number(v)<=max;
export async function handleUsage({payload,admin,profile,actorId,json,enabled=false}:any){
 if(!['owner','admin'].includes(profile?.role)||!profile?.school_id||profile?.id!==actorId)return json({error:'Workspace administrator required'},403);
 if(!enabled)return json({error:'Shadow usage accounting is release-gated. No charges or reservations were created.',releaseEnabled:false,charged:false},409);
 const allowed=['usage.snapshot','usage.configure','usage.reserve','usage.reconcile'];
 if(!allowed.includes(payload?.action))return json({error:'Unsupported usage action'},400);
 // Actor and tenant are never accepted from payload; SQL rechecks the authenticated profile.
 let name='jd_usage_snapshot',args:Record<string,unknown>={p_actor_id:actorId};
 if(payload.action!=='usage.snapshot'){
  if(payload.confirm!==true||!uuid(payload.requestId))return json({error:'Explicit confirmation and request identifier required'},400);
  args.p_request_id=payload.requestId;
  if(payload.action==='usage.configure'){
   if(!amount(payload.budgetMicros,1000000000000)||!Number.isSafeInteger(payload.expectedVersion)||payload.expectedVersion<0||payload.policy!=='employee-active-v1-shadow')return json({error:'Invalid shadow budget or policy'},400);
   name='jd_configure_usage';args={...args,p_expected_version:payload.expectedVersion,p_budget_micros:payload.budgetMicros,p_policy:payload.policy};
  }else{
   if(!uuid(payload.jobId))return json({error:'Invalid job identifier'},400);
   args.p_job_id=payload.jobId;
   if(payload.action==='usage.reserve'){
    if(!amount(payload.maxMicros,1000000000)||payload.maxMicros<1||typeof payload.subjectReference!=='string'||payload.subjectReference.trim().length<1||payload.subjectReference.length>120)return json({error:'Invalid usage reservation'},400);
    name='jd_reserve_usage';args={...args,p_subject_reference:payload.subjectReference,p_max_micros:payload.maxMicros};
   }else name='jd_reconcile_usage';
  }
 }
 try{
  const {data,error}=await admin.rpc(name,args);
  if(error){const status=error.code==='42501'?403:error.code==='40001'?409:error.code==='54000'?429:error.code==='22023'?400:503;return json({error:'Usage operation not confirmed. Inspect current records before retrying; reuse the same request identifier for an uncertain submission.'},status);}
  if(!data||data.mode!=='shadow'||data.charged!==false)return json({error:'Usage receipt incomplete. No charging outcome is confirmed.'},502);
  return json({usage:data,releaseEnabled:true});
 }catch{return json({error:'Usage outcome uncertain. Refresh records before retrying.'},503);}
}
