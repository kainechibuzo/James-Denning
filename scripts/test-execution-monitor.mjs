import test from 'node:test';
import assert from 'node:assert/strict';
import {canChangeExecution,readExecutionMonitor,changeExecutionJob,createExecutionMonitorController} from '../src/chat/execution-monitor.mjs';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const runId=id(1),jobId=id(2),stepId=id(3);
const job=(status='failed')=>({id:jobId,run_id:runId,status,attempt_count:5,max_attempts:5,last_error_message:'PRIVATE_DIAGNOSTIC'});
const rows=(status='failed')=>({runs:[{id:runId,status,request_text:'Synthetic execution',result_json:{secret:'PRIVATE_DIAGNOSTIC'}}],jobs:[job(status)],steps:[{id:stepId,run_id:runId,tool_key:'unknown',status:'failed',error_message:'PRIVATE_DIAGNOSTIC'}]});
const retry=()=>({data:{job:{job_id:jobId,run_id:runId,status:'queued',queue_message_id:12}}});
const cancel=()=>({data:{job:{id:jobId,status:'cancelled'}}});
const defer=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};
function fixture(handler,role='owner'){
 const calls=[];const client={functions:{invoke:async(_,request)=>{calls.push(request.body);return handler(request.body);}}};const controller=createExecutionMonitorController(client,{role});controller.activate();return{calls,client,controller,state:controller.getSnapshot};
}
for(const role of ['owner','admin','manager'])test(`${role}: reads monitor and strips diagnostics/result payloads`,async()=>{
 const f=fixture(()=>({data:rows()}),role);const result=await readExecutionMonitor(f.client,role);assert.doesNotMatch(JSON.stringify(result),/PRIVATE_DIAGNOSTIC|result_json|last_error_message/);assert.equal(result.jobs[0].hasError,true);assert.equal(result.steps[0].hasError,true);
});
for(const role of ['staff','viewer','finance','hr','contractor',undefined])test(`${role}: cannot read monitor or mutate jobs`,async()=>{
 const f=fixture(()=>assert.fail('network'));await assert.rejects(readExecutionMonitor(f.client,role));for(const action of ['retry','cancel'])await assert.rejects(changeExecutionJob(f.client,{role,job:job(action==='retry'?'failed':'queued'),action}));assert.equal(f.calls.length,0);
});
test('manager can read but cannot retry/cancel through a direct client call',async()=>{
 const f=fixture(()=>assert.fail('write'));for(const action of ['retry','cancel'])await assert.rejects(changeExecutionJob(f.client,{role:'manager',job:job(action==='retry'?'failed':'queued'),action}));assert.equal(f.calls.length,0);
});
for(const [name,mutate] of [['missing arrays',d=>delete d.jobs],['duplicate run',d=>d.runs.push(d.runs[0])],['wrong job/run relation',d=>d.jobs[0].run_id=id(999)],['wrong step/run relation',d=>d.steps[0].run_id=id(999)],['unknown state',d=>d.jobs[0].status='approved'],['invalid attempts',d=>d.jobs[0].attempt_count=-1],['missing request text',d=>delete d.runs[0].request_text]])test(`read fails closed: ${name}`,async()=>{
 const data=rows();mutate(data);const f=fixture(()=>({data}));await assert.rejects(readExecutionMonitor(f.client,'owner'));
});
for(const response of [{data:{error:'PRIVATE_DIAGNOSTIC'}},{error:{message:'PRIVATE_DIAGNOSTIC',context:{status:403}}},{data:null}])test(`errors are sanitised: ${JSON.stringify(response)}`,async()=>{
 const f=fixture(()=>response);await assert.rejects(readExecutionMonitor(f.client,'owner'),e=>{assert.doesNotMatch(e.message,/PRIVATE_DIAGNOSTIC/);return true;});assert.equal(f.calls.length,1);
});
test('mutation eligibility is explicit and running cancellation is never offered',()=>{
 for(const role of ['owner','admin']){
 assert.equal(canChangeExecution(role,job(),'retry'),true);assert.equal(canChangeExecution(role,job('queued'),'cancel'),true);assert.equal(canChangeExecution(role,job('retry_wait'),'cancel'),true);
 for(const status of ['running','completed','partially_completed','cancelled'])for(const action of ['retry','cancel'])assert.equal(canChangeExecution(role,job(status),action),false);
 }assert.equal(canChangeExecution('owner',job(),'delete'),false);
});
for(const data of [{},{job:{id:jobId,status:'queued'}},{job:{job_id:jobId,run_id:runId,status:'queued'}},{job:{job_id:id(999),run_id:runId,status:'queued',queue_message_id:12}}])test(`incomplete retry acknowledgement cannot claim success: ${JSON.stringify(data)}`,async()=>{
 const f=fixture(()=>({data}));await assert.rejects(changeExecutionJob(f.client,{role:'owner',job:job(),action:'retry'}));assert.equal(f.calls.length,1);
});
test('incomplete cancellation cannot claim success',async()=>{
 for(const data of [{},{job:{id:jobId,status:'queued'}},{job:{id:id(99),status:'cancelled'}}]){const f=fixture(()=>({data}));await assert.rejects(changeExecutionJob(f.client,{role:'admin',job:job('queued'),action:'cancel'}));}
});
test('read-before-write and synchronous lock prevent double retry, with advanced job state observed honestly',async()=>{
 const wait=defer();let status='failed';const f=fixture(b=>b.action==='execution.monitor.list'?{data:rows(status)}:wait.promise);
 await f.controller.change(jobId,'retry');assert.equal(f.calls.length,0);await f.controller.refresh();const pending=f.controller.change(jobId,'retry');await f.controller.change(jobId,'retry');await f.controller.refresh();assert.equal(f.calls.length,2);assert.equal(f.state().jobs[0].status,'failed');status='running';wait.resolve(retry());await pending;
 assert.equal(f.state().jobs[0].status,'running');assert.match(f.state().notice,/not proof of successful execution/);assert.equal(f.calls.filter(b=>b.action==='execution.job.retry').length,1);
});
test('lost write acknowledgement requires explicit read reconciliation, never retries automatically',async()=>{
 let status='failed';const f=fixture(b=>{if(b.action==='execution.monitor.list')return{data:rows(status)};status='queued';throw Error('PRIVATE_DIAGNOSTIC');});await f.controller.refresh();await f.controller.change(jobId,'retry');assert.equal(f.state().notice,'');assert.equal(f.state().needsRefresh,true);await f.controller.change(jobId,'retry');assert.equal(f.calls.length,2);await f.controller.refresh();assert.equal(f.state().jobs[0].status,'queued');assert.equal(f.state().needsRefresh,false);assert.doesNotMatch(f.state().error,/PRIVATE_DIAGNOSTIC/);
});
test('cancel requires both job and run read-back and never claims an audit',async()=>{
 let status='queued';const f=fixture(b=>{if(b.action==='execution.monitor.list')return{data:rows(status)};status='cancelled';return cancel();});await f.controller.refresh();await f.controller.change(jobId,'cancel');assert.equal(f.state().jobs[0].status,'cancelled');assert.match(f.state().notice,/Earlier external effects are not undone/);assert.match(f.state().notice,/Audit evidence is not verified/);
});
test('partial cancellation summary and out-of-sample read-back require reconciliation',async()=>{
 for(const readback of [{...rows('queued'),jobs:[job('cancelled')]},{runs:[],jobs:[],steps:[]}]){let changed=false;const f=fixture(b=>b.action==='execution.monitor.list'?{data:changed?readback:rows('queued')}:(changed=true,cancel()));await f.controller.refresh();await f.controller.change(jobId,'cancel');assert.equal(f.state().needsRefresh,true);assert.equal(f.state().notice,'');}
});
test('failed refresh clears stale records and action eligibility',async()=>{
 let failed=false;const f=fixture(()=>failed?{error:{}}:{data:rows()});await f.controller.refresh();failed=true;await f.controller.refresh();assert.deepEqual(f.state().jobs,[]);assert.equal(f.state().phase,'error');await f.controller.change(jobId,'retry');assert.equal(f.calls.length,2);
});
test('deactivated scope ignores late write acknowledgement and never follows it with a read',async()=>{
 const wait=defer();const f=fixture(b=>b.action==='execution.monitor.list'?{data:rows()}:wait.promise);await f.controller.refresh();const write=f.controller.change(jobId,'retry');f.controller.deactivate();f.controller.activate();wait.resolve(retry());await write;assert.equal(f.calls.length,2);assert.deepEqual(f.state().jobs,[]);assert.equal(f.state().notice,'');
});
test('failed job with nonfailed run cannot be retried by controller',async()=>{
 const data=rows();data.runs[0].status='awaiting_approval';const f=fixture(()=>({data}));await f.controller.refresh();await f.controller.change(jobId,'retry');assert.equal(f.calls.length,1);assert.equal(canChangeExecution('owner',job(),'retry',data.runs[0]),false);
});
