// Execute the actual Edge handler with synthetic authenticated clients. Imports
// outside these routes are removed; this is not live JWT/PostgREST/RLS proof.
import test,{after} from 'node:test';
import {handleExecutionCancellation} from '../supabase/functions/_shared/jd-execution-cancellation.mjs';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {transformWithOxc} from 'vite';
const cache=resolve('node_modules/.cache');mkdirSync(cache,{recursive:true});const temp=mkdtempSync(`${cache}/jd-execution-endpoint-`);after(()=>rmSync(temp,{recursive:true,force:true}));
const source=readFileSync('supabase/functions/jd-automation/index.ts','utf8').replace(/^import .*;\n/gm,'');
const wrapped=`export function makeHandler(createClient,handleExecutionCancellation){let handler;const Deno={env:{get:key=>key},serve:fn=>{handler=fn;}};${source}\nreturn handler;}`;
writeFileSync(`${temp}/handler.mjs`,(await transformWithOxc(wrapped,'handler.ts')).code);const {makeHandler}=await import(pathToFileURL(`${temp}/handler.mjs`));
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor=id(1),school=id(2),otherSchool=id(3),run=id(4),job=id(5),otherActor=id(6),otherRun=id(7),outsideRun=id(8);
function setup({role='owner',validSession=true,rpcError=null,writeConflict=false,cancellationRelease='legacy'}={}){
 const calls=[];
 const tables={profiles:[{id:actor,school_id:school,role}],jd_automation_runs:[{id:run,school_id:school,requested_by:actor,status:'queued',request_text:'Own run'},{id:otherRun,school_id:school,requested_by:otherActor,status:'queued',request_text:'Other actor'},{id:outsideRun,school_id:otherSchool,requested_by:otherActor,status:'queued',request_text:'Other tenant'}],jd_execution_jobs:[{id:job,run_id:run,school_id:school,status:'queued'},{id:id(9),run_id:otherRun,school_id:school,status:'queued'},{id:id(10),run_id:outsideRun,school_id:otherSchool,status:'queued'}],jd_automation_steps:[{id:id(11),run_id:run,school_id:school},{id:id(12),run_id:outsideRun,school_id:otherSchool}],jd_audit_events:[]};
 const admin={from(table){let mode='read',patch,filters=[];const query={
 select(fields){calls.push({table,select:fields});return query;},eq(key,value){filters.push(r=>r[key]===value);calls.push({table,eq:[key,value]});return query;},in(key,values){filters.push(r=>values.includes(r[key]));calls.push({table,in:[key,values]});return query;},order(){return query;},limit(){return query;},update(value){mode='update';patch=value;return query;},insert(value){mode='insert';patch=value;return query;},
 async maybeSingle(){const result=await query;return{...result,data:result.data?.[0]??null};},
 then(yes,no){try{let data=tables[table].filter(r=>filters.every(f=>f(r)));if(mode!=='read'){calls.push({table,write:mode,patch});if(writeConflict&&table==='jd_execution_jobs')data=[];else if(mode==='update')data.forEach(r=>Object.assign(r,patch));else{tables[table].push(patch);data=[patch];}}return Promise.resolve({data,error:null}).then(yes,no);}catch(e){return Promise.reject(e).then(yes,no);}}
 };return query;},async rpc(name,args){calls.push({rpc:name,args});if(name==='jd_cancel_execution_job_checked'&&!rpcError)return{data:{job:{id:args.p_job_id,run_id:args.p_expected_run_id,status:'cancelled',updated_at:'2026-11-16T13:00:00+00:00'},run:{id:args.p_expected_run_id,status:'cancelled'},auditRecorded:true,auditId:id(20),externalEffectsReversed:false}};return rpcError?{error:{code:rpcError,message:'PRIVATE_DIAGNOSTIC'}}:{data:{job_id:args.p_job_id,run_id:run,status:'queued',queue_message_id:42}};}};
 const auth={auth:{getUser:async token=>{calls.push({authenticate:token});return validSession?{data:{user:{id:actor}}}:{data:{user:null},error:{message:'PRIVATE_DIAGNOSTIC'}};}}};
 const handler=makeHandler((url,key)=>key==='SUPABASE_ANON_KEY'?auth:admin,args=>handleExecutionCancellation(args,cancellationRelease));
 return{calls,send:async(body,token='test-token')=>{const response=await handler(new Request('https://example.invalid',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)}));return{status:response.status,body:await response.json()};}};
}
for(const role of ['owner','admin','manager'])test(`${role}: monitor is tenant-scoped and manager is limited to own requests`,async()=>{
 const f=setup({role});const result=await f.send({action:'execution.monitor.list',schoolId:otherSchool,actorId:otherActor});assert.equal(result.status,200);
 assert.deepEqual(result.body.runs.map(r=>r.id),role==='manager'?[run]:[run,otherRun]);assert.ok(result.body.jobs.every(j=>j.school_id===school));assert.ok(result.body.steps.every(s=>s.school_id===school));
 for(const table of ['jd_automation_runs','jd_execution_jobs','jd_automation_steps'])assert.ok(f.calls.some(c=>c.table===table&&c.eq?.[0]==='school_id'&&c.eq[1]===school));
 assert.equal(f.calls.some(c=>c.write),false);
});
for(const role of ['staff','contractor','viewer','finance','hr','teacher','student'])test(`${role}: direct monitor/retry/cancel requests denied regardless of forged body role`,async()=>{
 for(const action of ['execution.monitor.list','execution.job.retry','execution.job.cancel','execution.job.cancel_checked']){
 const f=setup({role});const result=await f.send({action,jobId:job,role:'owner',actorId:otherActor,schoolId:otherSchool});assert.equal(result.status,403);assert.equal(f.calls.some(c=>c.rpc||c.write||c.table!=='profiles'&&c.table),false);
 }
});
for(const role of ['owner','admin'])test(`${role}: retry RPC receives authenticated actor, not caller-supplied identity`,async()=>{
 const f=setup({role});const result=await f.send({action:'execution.job.retry',jobId:job,actorId:otherActor,schoolId:otherSchool});assert.equal(result.status,200);assert.deepEqual(f.calls.find(c=>c.rpc),{rpc:'jd_requeue_failed_execution_job',args:{p_job_id:job,p_actor_id:actor}});
});
test('manager cannot retry or cancel despite read permission',async()=>{
 for(const action of ['execution.job.retry','execution.job.cancel','execution.job.cancel_checked']){const f=setup({role:'manager'});assert.equal((await f.send({action,jobId:job})).status,403);assert.equal(f.calls.some(c=>c.rpc||c.write),false);}
});
for(const [rpcError,status] of [['42501',403],['P0002',404],['22023',409],['XX000',500]])test(`retry database denial ${rpcError} maps safely`,async()=>{
 const f=setup({rpcError});const result=await f.send({action:'execution.job.retry',jobId:job});assert.equal(result.status,status);assert.doesNotMatch(JSON.stringify(result),/PRIVATE_DIAGNOSTIC/);assert.equal(f.calls.filter(c=>c.rpc).length,1);
});
test('cross-tenant cancellation finds no job and cannot update anything',async()=>{
 const f=setup();const result=await f.send({action:'execution.job.cancel',jobId:id(10)});assert.equal(result.status,404);assert.equal(f.calls.some(c=>c.write),false);
});
test('queued cancellation conditionally updates only tenant job and returns no audit verification claim',async()=>{
 const f=setup();const result=await f.send({action:'execution.job.cancel',jobId:job});assert.equal(result.status,200);assert.equal(result.body.job.status,'cancelled');assert.equal(result.body.auditRecorded,undefined);
 assert.ok(f.calls.some(c=>c.table==='jd_execution_jobs'&&c.eq?.[0]==='status'&&c.eq[1]==='queued'));
});
test('conditional cancellation conflict stops before run or audit writes',async()=>{
 const f=setup({writeConflict:true});assert.equal((await f.send({action:'execution.job.cancel',jobId:job})).status,409);assert.equal(f.calls.filter(c=>c.write&&c.table!=='jd_execution_jobs').length,0);
});
test('missing or invalid session blocks direct requests before profile data access',async()=>{
 const missing=setup();assert.equal((await missing.send({action:'execution.monitor.list'},null)).status,401);assert.equal(missing.calls.length,0);
 const invalid=setup({validSession:false});assert.equal((await invalid.send({action:'execution.job.retry',jobId:job})).status,401);assert.equal(invalid.calls.some(c=>c.table||c.rpc),false);
});

const cancelBody={action:'execution.job.cancel_checked',jobId:job,expectedRunId:run,expectedUpdatedAt:'2026-11-16T12:00:00.123456+00:00'};
test('actual HTTP checked cancellation route uses authenticated identity and RPC only',async()=>{
 const f=setup({cancellationRelease:'checked'});const r=await f.send({...cancelBody,actorId:otherActor,schoolId:otherSchool});assert.equal(r.status,200);assert.equal(r.body.auditRecorded,true);
 assert.deepEqual(f.calls.find(c=>c.rpc),{rpc:'jd_cancel_execution_job_checked',args:{p_actor_id:actor,p_job_id:job,p_expected_run_id:run,p_expected_updated_at:cancelBody.expectedUpdatedAt}});assert.equal(f.calls.some(c=>c.write),false);
});
test('actual HTTP route cannot enable checked cancellation by body flags',async()=>{
 const f=setup();assert.equal((await f.send({...cancelBody,release:'checked'})).status,409);assert.equal(f.calls.some(c=>c.rpc||c.write),false);
});
test('actual HTTP checked cancellation requires a valid session before profile/RPC access',async()=>{
 for(const token of [null,'invalid-token']){const f=setup({validSession:false,cancellationRelease:'checked'});assert.equal((await f.send(cancelBody,token)).status,401);assert.equal(f.calls.some(c=>c.table||c.rpc),false);}
});
test('actual HTTP missing checked RPC fails closed without legacy writes',async()=>{
 const f=setup({cancellationRelease:'checked',rpcError:'PGRST202'});const r=await f.send(cancelBody);assert.equal(r.status,500);assert.equal(f.calls.filter(c=>c.rpc).length,1);assert.equal(f.calls.some(c=>c.write),false);
});
