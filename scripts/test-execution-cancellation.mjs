// Actual repository SQL and cancellation handlers; isolated PGlite plus
// synthetic authentication. Not deployed JWT/RLS, pgmq or multi-session proof.
import {test,before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {handleExecutionCancellation,BACKEND_CANCELLATION_RELEASE} from '../supabase/functions/_shared/jd-execution-cancellation.mjs';
import {changeExecutionJob,createExecutionMonitorController,EXECUTION_CANCELLATION_RELEASE} from '../src/chat/execution-monitor.mjs';
const db=new PGlite();
function evidence(name,records){
 const dir=process.env.JD_CANCELLATION_EVIDENCE_DIR;if(!dir)return;
 mkdirSync(dir,{recursive:true});writeFileSync(join(dir,`${name}.json`),JSON.stringify({scope:'Synthetic local PGlite records only; not production or live staging acceptance',...records},null,2)+'\n');
}
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const school=id(1),otherSchool=id(2),run=id(3),job=id(4),outsideRun=id(5);
const actors={owner:id(10),admin:id(11),manager:id(12),staff:id(13),viewer:id(14),finance:id(15),hr:id(16),contractor:id(17),outsider:id(18)};
const version='2026-11-16T12:00:00.123456+00:00';
const read=name=>readFileSync(`supabase/migrations/${name}`,'utf8');
const migration=read('20261117220000_jd_atomic_execution_cancel.sql');
function ddl(file,table){const m=read(file).match(new RegExp(`create table if not exists public\\.${table} \\([\\s\\S]*?\\n\\);`,'i'));assert.ok(m);return m[0];}
before(async()=>{
 await db.exec('create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create table schools(id uuid primary key);create table profiles(id uuid primary key references auth.users,school_id uuid references schools,role text);');
 for(const table of ['jd_conversations','jd_automation_runs','jd_audit_events','jd_automation_steps'])await db.exec(ddl('20261111085143_jd_autonomous_automation.sql',table));
 await db.exec(ddl('20261111085150_jd_durable_execution_jobs.sql','jd_execution_jobs'));
 const claim=read('20261111085150_jd_durable_execution_jobs.sql').match(/create or replace function public\.jd_claim_execution_job\([\s\S]*?\n\$\$;/i);assert.ok(claim);await db.exec(claim[0]);
 await db.exec(migration);
 await db.query('insert into schools values($1),($2)',[school,otherSchool]);
 for(const [role,actor] of Object.entries(actors)){await db.query('insert into auth.users values($1)',[actor]);await db.query('insert into profiles values($1,$2,$3)',[actor,role==='outsider'?otherSchool:school,role==='outsider'?'owner':role]);}
});
after(()=>db.close());
beforeEach(async()=>{
 await db.exec('reset role;truncate jd_audit_events,jd_automation_steps,jd_execution_jobs,jd_automation_runs;');
 await db.query("insert into jd_automation_runs(id,school_id,requested_by,status,request_text,result_json,updated_at) values($1,$2,$3,'queued','Synthetic run','{\"prior_effect\":true}',$4),($5,$6,$7,'queued','Other tenant','{}',$4)",[run,school,actors.owner,version,outsideRun,otherSchool,actors.outsider]);
 await db.query("insert into jd_execution_jobs(id,school_id,run_id,requested_by,status,idempotency_key,attempt_count,queue_message_id,updated_at) values($1,$2,$3,$4,'queued','synthetic-cancel',1,42,$5)",[job,school,run,actors.owner,version]);
});
async function records(table){return(await db.query(`select to_jsonb(t) as record from public.${table} t order by id`)).rows.map(r=>r.record);}
async function snapshot(){return{jobs:await records('jd_execution_jobs'),runs:await records('jd_automation_runs'),audits:await records('jd_audit_events'),steps:await records('jd_automation_steps')};}
async function cancel({actor=actors.owner,jobId=job,runId=run,expected=version,dbRole='service_role'}={}){
 assert.ok(['service_role','anon','authenticated'].includes(dbRole));await db.exec(`set role ${dbRole}`);
 try{return(await db.query('select public.jd_cancel_execution_job_checked($1,$2,$3,$4) as result',[actor,jobId,runId,expected])).rows[0].result;}finally{await db.exec('reset role');}
}
async function denied(options,code){const before=await snapshot();await assert.rejects(cancel(options),e=>e.code===code);assert.deepEqual(await snapshot(),before);}
for(const role of ['owner','admin'])for(const state of ['queued','retry_wait'])test(`${role}/${state}: job, run and audit commit together without erasing prior evidence`,async()=>{
 await db.query('update jd_execution_jobs set status=$1',[state]);if(state==='retry_wait')await db.query("update jd_automation_runs set status='running' where id=$1",[run]);
 const result=await cancel({actor:actors[role]}),s=await snapshot();
 assert.equal(result.job.status,'cancelled');assert.equal(result.run.status,'cancelled');assert.equal(result.auditRecorded,true);assert.equal(result.externalEffectsReversed,false);
 assert.equal(s.jobs[0].status,'cancelled');assert.equal(s.jobs[0].attempt_count,1);assert.equal(s.jobs[0].queue_message_id,42);assert.equal(s.runs.find(r=>r.id===run).status,'cancelled');assert.deepEqual(s.runs.find(r=>r.id===run).result_json,{prior_effect:true});
 assert.equal(s.audits.length,1);assert.equal(s.audits[0].id,result.auditId);assert.equal(s.audits[0].actor_id,actors[role]);assert.equal(s.audits[0].event_json.contract,'atomic_cancel_v1');assert.equal(s.runs.find(r=>r.id===outsideRun).status,'queued');assert.notEqual(result.job.updated_at,version);
 if(role==='owner'&&state==='retry_wait')evidence('committed-cancellation',{result,persisted:s});
});
for(const role of ['manager','staff','viewer','finance','hr','contractor'])test(`${role}: database rejects cancellation without mutation`,()=>denied({actor:actors[role]},'42501'));
for(const role of ['anon','authenticated'])test(`${role}: cannot invoke service-only cancellation`,()=>denied({dbRole:role},'42501'));
test('cross-tenant actor cannot cancel a known job',()=>denied({actor:actors.outsider},'P0002'));
test('mismatched job/run tenant refuses without erasing either run',async()=>{await db.query('update jd_execution_jobs set run_id=$1',[outsideRun]);await denied({runId:outsideRun},'P0002');});
for(const patch of [{expected:null},{runId:null},{jobId:null}])test(`missing observed identity/version ${JSON.stringify(patch)} fails`,()=>denied(patch,'22023'));
test('microsecond-stale version and wrong run identity cannot cancel',async()=>{await denied({expected:'2026-11-16T12:00:00.123455+00:00'},'40001');await denied({runId:outsideRun},'40001');});
for(const state of ['failed','completed','partially_completed','cancelled'])test(`terminal job ${state} is immutable`,async()=>{await db.query('update jd_execution_jobs set status=$1',[state]);await denied({},'40001');});
for(const state of ['awaiting_approval','completed','partially_completed','failed','cancelled'])test(`run ${state} cannot be overwritten by a queued-job cancellation`,async()=>{await db.query('update jd_automation_runs set status=$1 where id=$2',[state,run]);await denied({},'40001');});
test('audit insertion failure rolls back both status changes',async()=>{
 await db.exec("alter table jd_audit_events add constraint reject_cancel_audit check(event_type <> 'execution.cancelled')");try{const before=await snapshot();await denied({},'23514');evidence('audit-failure-rollback',{expectedError:'23514',before,after:await snapshot()});}finally{await db.exec('alter table jd_audit_events drop constraint reject_cancel_audit');}
});
test('run update failure rolls back the job before any audit can be acknowledged',async()=>{
 await db.exec("alter table jd_automation_runs add constraint reject_cancel_run check(status <> 'cancelled')");try{await denied({},'23514');}finally{await db.exec('alter table jd_automation_runs drop constraint reject_cancel_run');}
});
test('lost-response replay does not create duplicate audit evidence',async()=>{await cancel();await denied({},'40001');assert.equal((await records('jd_audit_events')).length,1);});
test('cancel first: actual worker claim refuses the terminal job even when delivery remains queued',async()=>{await cancel();const s=await snapshot();const claim=(await db.query("select public.jd_claim_execution_job($1,42,'synthetic-worker',90) as result",[job])).rows[0].result;assert.equal(claim.claimed,false);assert.deepEqual(await snapshot(),s);});
test('claim first: cancellation cannot interrupt an active lease',async()=>{const claim=(await db.query("select public.jd_claim_execution_job($1,42,'synthetic-worker',90) as result",[job])).rows[0].result;assert.equal(claim.claimed,true);await denied({expected:(await records('jd_execution_jobs'))[0].updated_at},'40001');});
test('emergency rollback disables RPC while preserving all records; reviewed reapply restores grant',async()=>{
 const s=await snapshot();await db.exec(readFileSync('supabase/rollback/20261117220000_jd_atomic_execution_cancel.rollback.sql','utf8'));
 try{await denied({},'42501');assert.deepEqual(await snapshot(),s);}finally{await db.exec(migration);}
 assert.equal((await cancel()).job.status,'cancelled');
});
const body={action:'execution.job.cancel_checked',jobId:job,expectedRunId:run,expectedUpdatedAt:version};
const response=(body,status=200)=>({body,status});
async function endpoint(payload=body,{role='owner',release='checked',rpcError=null,transform=x=>x}={}){
 const calls=[];const admin={async rpc(name,args){calls.push({name,args});if(rpcError)return{error:{code:rpcError,message:'PRIVATE_DIAGNOSTIC'}};
  try{return{data:transform(await cancel({actor:args.p_actor_id,jobId:args.p_job_id,runId:args.p_expected_run_id,expected:args.p_expected_updated_at}))};}catch(e){return{error:{code:e.code,message:e.message}};}
 },from(){assert.fail('checked cancellation must never issue direct writes');}};
 const result=await handleExecutionCancellation({admin,profile:{id:actors[role],school_id:school,role},actorId:actors[role],payload,json:response},release);return{...result,calls};
}
test('backend and client shipping gates stay legacy; body release fields cannot enable checked RPC',async()=>{
 assert.equal(BACKEND_CANCELLATION_RELEASE,'legacy');assert.equal(EXECUTION_CANCELLATION_RELEASE,'legacy');
 const result=await endpoint({...body,release:'checked',cancellationMode:'checked'},{release:BACKEND_CANCELLATION_RELEASE});assert.equal(result.status,409);assert.equal(result.calls.length,0);
});
test('checked handler -> actual SQL uses authenticated actor and preserves raw microsecond version',async()=>{
 const result=await endpoint({...body,actorId:actors.outsider,schoolId:otherSchool});assert.equal(result.status,200);assert.equal(result.calls[0].args.p_actor_id,actors.owner);assert.equal(result.calls[0].args.p_expected_updated_at,version);assert.equal(result.body.auditRecorded,true);
});
for(const role of ['manager','staff','viewer'])test(`${role}: checked HTTP helper cannot be elevated by body role`,async()=>{const r=await endpoint({...body,role:'owner'},{role});assert.equal(r.status,403);assert.equal(r.calls.length,0);});
for(const [code,status] of [['42501',403],['P0002',404],['40001',409],['22023',400],['PGRST202',500],['XX000',500]])test(`RPC ${code} is sanitized and never retried/fallen back`,async()=>{const r=await endpoint(body,{rpcError:code});assert.equal(r.status,status);assert.equal(r.calls.length,1);assert.doesNotMatch(JSON.stringify(r.body),/PRIVATE_DIAGNOSTIC/);});
for(const patch of [{jobId:'bad'},{expectedRunId:'bad'},{expectedUpdatedAt:'today'},{expectedUpdatedAt:undefined}])test(`checked input validation ${JSON.stringify(patch)} before RPC`,async()=>{const r=await endpoint({...body,...patch});assert.equal(r.status,400);assert.equal(r.calls.length,0);});
test('checked release retires unchecked calls without fetching a fresh version',async()=>{const r=await endpoint({action:'execution.job.cancel',jobId:job});assert.equal(r.status,409);assert.equal(r.calls.length,0);});
test('incomplete successful audit acknowledgement remains an error even if transaction committed',async()=>{const r=await endpoint(body,{transform:x=>({...x,auditRecorded:false})});assert.equal(r.status,500);assert.equal((await records('jd_execution_jobs'))[0].status,'cancelled');assert.equal((await records('jd_audit_events')).length,1);});
function clientFixture({loseAck=false,mismatch=false}={}){
 const calls=[];let changed=false;
 const client={functions:{invoke:async(_name,{body:request})=>{
  calls.push(request);
  if(request.action==='execution.monitor.list'){
   const s=await snapshot();const jobs=s.jobs;if(changed&&mismatch)jobs[0].updated_at=version;
   return{data:{runs:s.runs.filter(r=>r.id===run),jobs,steps:[]}};
  }
  const r=await endpoint(request);changed=r.status===200;
  if(loseAck&&changed)throw Error('PRIVATE_DIAGNOSTIC');
  return r.status===200?{data:r.body}:{error:{context:{status:r.status}},data:r.body};
 }}};
 const controller=createExecutionMonitorController(client,{role:'owner',cancellationMode:'checked'});controller.activate();return{calls,client,controller};
}
test('actual checked client/controller -> handler -> SQL -> persisted read-back',async()=>{
 const f=clientFixture();await f.controller.refresh();await f.controller.change(job,'cancel');const s=f.controller.getSnapshot();assert.equal(s.needsRefresh,false);assert.match(s.notice,/transactional audit receipt/);assert.match(s.notice,/not independent verification/);assert.equal(s.jobs[0].status,'cancelled');assert.equal((await records('jd_audit_events')).length,1);assert.equal(f.calls[1].expectedUpdatedAt,version);f.controller.deactivate();
});
test('lost acknowledgement locks repeated writes and recovers through refresh without duplicate audit',async()=>{
 const f=clientFixture({loseAck:true});await f.controller.refresh();await f.controller.change(job,'cancel');assert.equal(f.controller.getSnapshot().needsRefresh,true);assert.equal(f.controller.getSnapshot().notice,'');await f.controller.change(job,'cancel');assert.equal(f.calls.filter(r=>r.action==='execution.job.cancel_checked').length,1);await f.controller.refresh();assert.equal(f.controller.getSnapshot().jobs[0].status,'cancelled');assert.equal((await records('jd_audit_events')).length,1);f.controller.deactivate();
});
test('checked cancellation version mismatch during read-back stays unconfirmed',async()=>{
 const f=clientFixture({mismatch:true});await f.controller.refresh();await f.controller.change(job,'cancel');assert.equal(f.controller.getSnapshot().needsRefresh,true);assert.equal(f.controller.getSnapshot().notice,'');f.controller.deactivate();
});
test('client missing version or invalid release cannot dispatch a write',async()=>{
 const client={functions:{invoke:()=>assert.fail('network')}};const observed={id:job,run_id:run,status:'queued'};
 for(const cancellationMode of ['checked','auto-detect'])await assert.rejects(changeExecutionJob(client,{role:'owner',job:observed,action:'cancel',cancellationMode}));
});

test('expired running lease still cannot be cancelled by the queued-only contract',async()=>{
 await db.query("update jd_execution_jobs set status='running',lease_owner='old-worker',lease_token=$1,lease_expires_at=now()-interval '1 minute'",[id(30)]);await denied({},'40001');
});
test('cancellation retains completed steps and checkpoints as evidence of prior effects',async()=>{
 await db.query("update jd_execution_jobs set checkpoint_step_index=2,status='retry_wait'");
 await db.query("insert into jd_automation_steps(id,school_id,run_id,step_index,tool_key,risk_level,status,output_json) values($1,$2,$3,1,'synthetic.external.effect','low','completed',$4)",[id(31),school,run,JSON.stringify({effect_id:'synthetic-only'})]);
 const before=await records('jd_automation_steps');await cancel();assert.deepEqual(await records('jd_automation_steps'),before);assert.equal((await records('jd_execution_jobs'))[0].checkpoint_step_index,2);
});
test('profile demotion is rechecked by SQL, not trusted from the HTTP preflight',async()=>{
 await db.query("update profiles set role='staff' where id=$1",[actors.owner]);try{await denied({},'42501');}finally{await db.query("update profiles set role='owner' where id=$1",[actors.owner]);}
});
for(const transform of [x=>({...x,auditId:null}),x=>({...x,run:{id:outsideRun,status:'cancelled'}}),x=>({...x,externalEffectsReversed:true}),x=>({...x,job:{...x.job,updated_at:version}})])test('malformed checked receipt never becomes a success claim',async()=>{
 const r=await endpoint(body,{transform});assert.equal(r.status,500);assert.equal(r.calls.length,1);
});
test('handler transport exception is sanitized without retry or direct writes',async()=>{
 let calls=0;const admin={rpc(){calls++;throw Error('PRIVATE_DIAGNOSTIC');},from(){assert.fail('fallback');}};
 const r=await handleExecutionCancellation({admin,profile:{id:actors.owner,school_id:school,role:'owner'},actorId:actors.owner,payload:body,json:response},'checked');assert.equal(r.status,500);assert.equal(calls,1);assert.doesNotMatch(JSON.stringify(r),/PRIVATE_DIAGNOSTIC/);
});
