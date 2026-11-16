import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {handleTaskAssignment} from '../supabase/functions/_shared/jd-task-assignment.mjs';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor=id(1),school=id(2),taskId=id(3),assignee=id(4),audit=id(5);
const payload={action:'operations.task.assign_checked',taskId,assigneeId:assignee,expectedAssigneeId:null,expectedUpdatedAt:'2026-11-16T20:00:00.123456+00:00'};
function fixture({role='manager',body=payload,result={data:{task:{id:taskId},auditRecorded:true,auditId:audit}}}={}){
 const calls=[];const query={select:fields=>{calls.push(['select',fields]);return query;},eq:(key,value)=>{calls.push(['eq',key,value]);return query;},maybeSingle:async()=>result};
 return{calls,run:()=>handleTaskAssignment({profile:{id:actor,school_id:school,role},actorId:actor,payload:body,json:(body,status=200)=>({body,status}),admin:{rpc:async(name,args)=>{calls.push(['rpc',name,args]);return result;},from:table=>{calls.push(['from',table]);return query;}}})};
}
for(const role of ['staff','contractor','viewer','finance','hr','teacher',undefined])test(`${role}: endpoint rejects assignment and exact reads before database access`,async()=>{
 for(const action of ['operations.task.assign_checked','operations.task.get','operations.task.assign']){const f=fixture({role:role??'unknown',body:{...payload,action}});assert.equal((await f.run()).status,403);assert.equal(f.calls.length,0);}
});
for(const role of ['owner','admin','manager'])test(`${role}: trusted identity and raw microsecond CAS version reach service-only RPC`,async()=>{
 const f=fixture({role,body:{...payload,actorId:id(999),schoolId:id(999)}});assert.equal((await f.run()).status,200);
 assert.deepEqual(f.calls,[['rpc','jd_assign_operational_task',{p_actor_id:actor,p_task_id:taskId,p_assignee_id:assignee,p_expected_assignee_id:null,p_expected_updated_at:payload.expectedUpdatedAt}]]);
});
test('legacy unchecked action is retired, not silently upgraded with a fresh server version',async()=>{
 const f=fixture({body:{...payload,action:'operations.task.assign'}});assert.equal((await f.run()).status,409);assert.equal(f.calls.length,0);
});
for(const patch of [{taskId:'bad'},{assigneeId:null},{expectedAssigneeId:undefined},{expectedAssigneeId:'bad'},{expectedUpdatedAt:null},{expectedUpdatedAt:'today'},{expectedUpdatedAt:'2026-11-16'}])test(`invalid input ${JSON.stringify(patch)} cannot write`,async()=>{
 const f=fixture({body:{...payload,...patch}});assert.equal((await f.run()).status,400);assert.equal(f.calls.length,0);
});
for(const [code,status] of [['42501',403],['P0002',404],['40001',409],['22023',400],['22007',400],['22008',400],['23514',500],['PGRST202',500]])test(`SQL ${code} maps to sanitized ${status} without retry`,async()=>{
 const f=fixture({result:{error:{code,message:'PRIVATE_TOKEN secret details'}}});const result=await f.run();assert.equal(result.status,status);assert.doesNotMatch(JSON.stringify(result),/PRIVATE_TOKEN|secret details/);assert.equal(f.calls.length,1);
});
test('incomplete successful RPC never claims assignment audit',async()=>{
 for(const data of [null,{}, {task:{id:taskId}}, {task:{id:taskId},auditRecorded:true,auditId:'bad'}]){const f=fixture({result:{data}});assert.equal((await f.run()).status,500);}
});
test('exact read constrains both task ID and authenticated tenant, not a bounded list',async()=>{
 const f=fixture({body:{action:'operations.task.get',taskId},result:{data:{id:taskId}}});assert.equal((await f.run()).status,200);
 assert.deepEqual(f.calls.filter(c=>c[0]==='eq'),[['eq','id',taskId],['eq','school_id',school]]);
 assert.equal(f.calls.some(c=>c[0]==='rpc'),false);
});
test('missing/cross-tenant exact read is not found and errors do not leak',async()=>{
 for(const [result,status] of [[{data:null},404],[{error:{message:'PRIVATE_TOKEN'}},500]]){const f=fixture({body:{action:'operations.task.get',taskId},result});const response=await f.run();assert.equal(response.status,status);assert.doesNotMatch(JSON.stringify(response),/PRIVATE_TOKEN/);}
});
test('edge wiring routes all assignment contracts after authentication and removes direct update path',()=>{
 const source=readFileSync(new URL('../supabase/functions/jd-automation/index.ts',import.meta.url),'utf8');
 assert.ok(source.indexOf('auth.auth.getUser(token)')<source.indexOf('return handleTaskAssignment('));
 assert.match(source,/\["operations.task.assign","operations.task.assign_checked","operations.task.get"\]\.includes\(payload.action\)/);
 assert.doesNotMatch(source,/update\(\{assigned_to:assigneeId/);
});
