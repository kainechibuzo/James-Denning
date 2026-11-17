import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {transformWithOxc} from 'vite';
import {handleTaskAssignment} from '../supabase/functions/_shared/jd-task-assignment.mjs';
import {BACKEND_TASK_ASSIGNMENT_RELEASE,handleReleasedTaskAssignment} from '../supabase/functions/_shared/jd-task-assignment-release.mjs';
import {TASK_ASSIGNMENT_RELEASE,assignReleasedOperationalTask,createTaskWriteController} from '../src/chat/operational-task-writes.mjs';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor=id(1),school=id(2),taskId=id(3),member=id(4),otherSchool=id(5),otherMember=id(6),otherTask=id(7),audit=id(8);
const row=()=>({id:taskId,school_id:school,title:'Synthetic assignment',description:'Local test only',status:'queued',assigned_to:null,updated_at:'2026-11-16T10:00:00.123456+00:00'});
const base={action:'operations.task.assign',taskId,assigneeId:member};
const cache=resolve('node_modules/.cache');mkdirSync(cache,{recursive:true});const temp=mkdtempSync(`${cache}/backend-release-`);after(()=>rmSync(temp,{recursive:true,force:true}));
const source=readFileSync('supabase/functions/jd-automation/index.ts','utf8').replace(/^import .*;\n/gm,'');
writeFileSync(`${temp}/handler.mjs`,(await transformWithOxc(`export function makeHandler(createClient,handleReleasedTaskAssignment){let handler;const Deno={env:{get:key=>key},serve:fn=>handler=fn};${source}\nreturn handler;}`,'handler.ts')).code);
const {makeHandler}=await import(pathToFileURL(`${temp}/handler.mjs`));
function fixture({role='owner',memberRole='staff',release=BACKEND_TASK_ASSIGNMENT_RELEASE,session=true,dbError=false,lostAck=false,deleteAtWrite=false,rpcError=null,checkedOnly=false}={}){
 const calls=[];const tasks=[row(),{...row(),id:otherTask,school_id:otherSchool}];
 const profiles=[{id:actor,school_id:school,role},{id:member,school_id:school,role:memberRole},{id:otherMember,school_id:otherSchool,role:'staff'}];
 const admin={from(table){const filters=[];let patch;const q={
 select(){return q;},eq(key,value){filters.push(r=>r[key]===value);calls.push({table,eq:[key,value]});return q;},in(key,values){filters.push(r=>values.includes(r[key]));return q;},order(){return q;},limit(){return q;},update(value){patch=value;return q;},
 async maybeSingle(){const result=await q;return{...result,data:result.data?.[0]??null};},
 then(yes,no){try{
  let rows=(table==='profiles'?profiles:tasks).filter(r=>filters.every(f=>f(r)));
  if(dbError&&table==='jd_operational_tasks')return Promise.resolve({error:{message:'PRIVATE_DIAGNOSTIC'}}).then(yes,no);
  if(patch){calls.push({write:table,patch});if(deleteAtWrite)rows=[];else rows.forEach(r=>Object.assign(r,patch));if(lostAck)throw Error('PRIVATE_DIAGNOSTIC');}
  return Promise.resolve({data:rows.map(r=>({...r}))}).then(yes,no);
 }catch(e){return Promise.reject(e).then(yes,no);}}
 };return q;},async rpc(name,args){calls.push({rpc:name,args});if(rpcError)return{error:{code:rpcError,message:'PRIVATE_DIAGNOSTIC'}};
 const task=tasks[0];Object.assign(task,{assigned_to:args.p_assignee_id,updated_at:'2026-11-16T10:01:00.123456+00:00'});return{data:{task:{...task},auditRecorded:true,auditId:audit}};}};
 const auth={auth:{getUser:async()=>({data:{user:session?{id:actor}:null}})}};
 const handler=makeHandler((_url,key)=>key==='SUPABASE_ANON_KEY'?auth:admin,checkedOnly?handleTaskAssignment:options=>handleReleasedTaskAssignment(options,release));
 const request=async body=>{const response=await handler(new Request('https://example.invalid',{method:'POST',headers:{Authorization:'Bearer synthetic','Content-Type':'application/json'},body:JSON.stringify(body)}));return{status:response.status,body:await response.json()};};
 const client={functions:{invoke:async(_name,{body})=>{calls.push({action:body.action});const result=await request(body);return result.status>=400?{data:result.body,error:{context:{status:result.status}}}:{data:result.body};}}};
 return{calls,request,client,tasks};
}
const options={role:'owner',taskId,assigneeId:member,expectedTask:row()};
test('reproduces shipping-client failure against the previous checked-only backend',async()=>{
 const f=fixture({checkedOnly:true});await assert.rejects(assignReleasedOperationalTask(f.client,options));assert.equal(f.calls.some(c=>c.write||c.rpc),false);
});
test('both shipping releases remain legacy; request JSON cannot select release',async()=>{
 assert.equal(BACKEND_TASK_ASSIGNMENT_RELEASE,'legacy');assert.equal(BACKEND_TASK_ASSIGNMENT_RELEASE,TASK_ASSIGNMENT_RELEASE);
 const f=fixture();const result=await f.request({...base,action:'operations.task.assign_checked',assignmentMode:'checked',release:'checked'});
 assert.equal(result.status,409);assert.equal(f.calls.some(c=>c.write||c.rpc),false);
});
for(const role of ['owner','admin','manager'])test(`${role}: actual shipping client -> authenticated HTTP handler -> legacy update -> list read-back`,async()=>{
 const f=fixture({role});const result=await assignReleasedOperationalTask(f.client,{...options,role});
 assert.equal(result.assigned,true);assert.equal(result.task.assigned_to,member);assert.equal(result.auditId,null);
 assert.deepEqual(f.calls.filter(c=>c.action).map(c=>c.action),['operations.task.assign','operations.task.list']);
 assert.equal(f.calls.filter(c=>c.write).length,1);assert.equal(f.calls.some(c=>c.rpc),false);
 assert.equal(f.tasks[1].assigned_to,null);
});
for(const role of ['staff','viewer','contractor','finance','hr','teacher','student','unknown'])test(`${role}: forged owner body cannot authorize either release`,async()=>{
 for(const release of ['legacy','checked'])for(const action of ['operations.task.assign','operations.task.assign_checked','operations.task.get']){
  const f=fixture({role,release});assert.equal((await f.request({...base,action,role:'owner',actorId:member,schoolId:otherSchool})).status,403);assert.equal(f.calls.some(c=>c.write||c.rpc),false);
 }
});
for(const [name,patch,status] of [['cross-tenant task',{taskId:otherTask},404],['cross-tenant assignee',{assigneeId:otherMember},400],['invalid task',{taskId:'bad'},400],['invalid assignee',{assigneeId:'bad'},400]])test(`${name}: cannot write`,async()=>{
 const f=fixture();assert.equal((await f.request({...base,...patch})).status,status);assert.equal(f.calls.some(c=>c.write||c.rpc),false);
});
for(const memberRole of ['owner','admin','manager','staff','finance','hr','contractor'])test(`${memberRole}: eligible assignee preserves existing role contract`,async()=>{
 const f=fixture({memberRole});const result=await f.request(base);assert.equal(result.status,200);assert.equal(result.body.auditRecorded,false);
});
for(const memberRole of ['viewer','student','teacher','unknown'])test(`${memberRole}: ineligible assignee cannot be assigned`,async()=>{
 const f=fixture({memberRole});assert.equal((await f.request(base)).status,400);assert.equal(f.calls.some(c=>c.write),false);
});
test('write and both eligibility reads are explicitly tenant constrained',async()=>{
 const f=fixture();assert.equal((await f.request({...base,schoolId:otherSchool,actorId:otherMember})).status,200);
 assert.equal(f.calls.filter(c=>c.table==='jd_operational_tasks'&&c.eq?.[0]==='school_id'&&c.eq[1]===school).length,2);
 assert.ok(f.calls.some(c=>c.table==='profiles'&&c.eq?.[0]==='school_id'&&c.eq[1]===school));
});
for(const [setting,status] of [[{dbError:true},500],[{deleteAtWrite:true},409],[{session:false},401],[{release:'auto-detect'},503]])test(`fails closed ${JSON.stringify(setting)}`,async()=>{
 const f=fixture(setting);const result=await f.request(base);assert.equal(result.status,status);assert.doesNotMatch(JSON.stringify(result),/PRIVATE_DIAGNOSTIC/);assert.equal(f.calls.some(c=>c.rpc),false);
});
test('lost legacy write acknowledgement blocks repeat and preserves refresh recovery in actual controller',async()=>{
 const f=fixture({lostAck:true});const controller=createTaskWriteController(f.client,{role:'owner',schoolId:school,actorId:actor,storage:{getItem:()=>null}});
 controller.activate();await controller.refresh();await controller.assign(taskId,member);
 assert.equal(controller.getSnapshot().tasks[0].assigned_to,null);assert.deepEqual(controller.getSnapshot().needsRefresh,[taskId]);
 await controller.assign(taskId,member);assert.equal(f.calls.filter(c=>c.write).length,1);
 await controller.refresh();assert.equal(controller.getSnapshot().tasks[0].assigned_to,member);assert.deepEqual(controller.getSnapshot().needsRefresh,[]);controller.deactivate();
});
test('checked release explicitly retires legacy without reading a fresh version or falling back',async()=>{
 const f=fixture({release:'checked'});assert.equal((await f.request(base)).status,409);assert.equal(f.calls.some(c=>c.write||c.rpc),false);
});
test('explicit checked client and backend retain the service-only audited contract',async()=>{
 const f=fixture({release:'checked'});const result=await assignReleasedOperationalTask(f.client,{...options,assignmentMode:'checked'});
 assert.equal(result.auditId,audit);assert.equal(f.calls.filter(c=>c.rpc).length,1);assert.equal(f.calls.some(c=>c.write),false);
 assert.deepEqual(f.calls.find(c=>c.rpc).args,{p_actor_id:actor,p_task_id:taskId,p_assignee_id:member,p_expected_assignee_id:null,p_expected_updated_at:row().updated_at});
});
for(const rpcError of ['PGRST202','40001','42501','XX000'])test(`checked RPC ${rpcError} never falls back to an unchecked write`,async()=>{
 const f=fixture({release:'checked',rpcError});await assert.rejects(assignReleasedOperationalTask(f.client,{...options,assignmentMode:'checked'}));assert.equal(f.calls.filter(c=>c.rpc).length,1);assert.equal(f.calls.some(c=>c.write),false);
});
test('malformed authenticated identity and unknown actions are denied before access',async()=>{
 for(const patch of [{actorId:'bad'},{profile:{id:member,school_id:school,role:'owner'}},{profile:{id:actor,school_id:null,role:'owner'}}]){
 const result=await handleReleasedTaskAssignment({admin:{from(){assert.fail('database access');}},profile:{id:actor,school_id:school,role:'owner'},actorId:actor,payload:base,json:(body,status)=>({body,status}),...patch});assert.equal(result.status,403);
 }
 const result=await handleReleasedTaskAssignment({admin:{},profile:{id:actor,school_id:school,role:'owner'},actorId:actor,payload:{action:'unknown'},json:(body,status)=>({body,status})});assert.equal(result.status,400);
});
