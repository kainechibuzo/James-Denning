import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TASK_ASSIGNMENT_RELEASE,assignReleasedOperationalTask,createTaskWriteController} from '../src/chat/operational-task-writes.mjs';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const taskId=id(1),member=id(2),school=id(3),actor=id(4),audit=id(5);
const row=()=>({id:taskId,title:'Synthetic task',status:'queued',assigned_to:null,updated_at:'2026-11-16T20:00:00.123456+00:00'});
const options={role:'manager',taskId,assigneeId:member,expectedTask:row()};
function fixture(handler){const calls=[];return{calls,client:{functions:{invoke:async(_,request)=>{calls.push(request.body);return handler(request.body);}}}};}
const confirmed=()=>({...row(),assigned_to:member});
test('shipping default remains explicitly legacy until separately reviewed backend release',()=>{
 assert.equal(TASK_ASSIGNMENT_RELEASE,'legacy');
 const parent=readFileSync('src/pages/jd-operations.jsx','utf8');assert.doesNotMatch(parent,/<JDTaskQueue[^>]*assignmentMode=/);
 // A merge must not apply the staged migration or deploy the gated endpoint.
 const deploy=readFileSync('.github/workflows/deploy.yml','utf8');const events=deploy.slice(deploy.indexOf('\non:'),deploy.indexOf('\nconcurrency:'));
 assert.match(events,/workflow_dispatch:/);assert.doesNotMatch(events,/^\s+(push|pull_request):/m);
});
for(const role of ['owner','admin','manager'])test(`${role}: default manual assignment uses existing production endpoints and truthful non-audited result`,async()=>{
 const f=fixture(body=>body.action==='operations.task.assign'?{data:{task:confirmed()}}:body.action==='operations.task.list'?{data:{tasks:[confirmed()]}}:assert.fail('undeployed endpoint called'));
 const result=await assignReleasedOperationalTask(f.client,{...options,role});assert.equal(result.task.assigned_to,member);assert.equal(result.auditId,null);
 assert.deepEqual(f.calls,[{action:'operations.task.assign',taskId,assigneeId:member},{action:'operations.task.list',limit:250}]);
});
test('default auto assignment uses old read-back, never the undeployed exact-read endpoint',async()=>{
 const f=fixture(body=>body.action==='operations.task.auto_assign'?{data:{assignment:{assigned:true,task_id:taskId,assignee_id:member}}}:body.action==='operations.task.list'?{data:{tasks:[confirmed()]}}:assert.fail('undeployed endpoint called'));
 assert.equal((await assignReleasedOperationalTask(f.client,{...options,auto:true})).auditId,null);
 assert.deepEqual(f.calls.map(b=>b.action),['operations.task.auto_assign','operations.task.list']);
});
test('default no-capacity performs no follow-up request and claims no success',async()=>{
 const f=fixture(()=>({data:{assignment:{assigned:false,reason:'No active department member has available capacity'}}}));
 assert.deepEqual(await assignReleasedOperationalTask(f.client,{...options,auto:true}),{assigned:false});assert.equal(f.calls.length,1);
});
for(const role of ['staff','viewer','contractor','finance'])test(`${role}: release mode cannot bypass manager access`,async()=>{
 const f=fixture(()=>assert.fail('network'));for(const assignmentMode of ['legacy','checked'])await assert.rejects(assignReleasedOperationalTask(f.client,{...options,role,assignmentMode}));assert.equal(f.calls.length,0);
});
test('invalid release mode fails without dispatching any write',async()=>{
 const f=fixture(()=>assert.fail('network'));await assert.rejects(assignReleasedOperationalTask(f.client,{...options,assignmentMode:'auto-detect'}),/No request was sent/);assert.equal(f.calls.length,0);
});
test('legacy uncertain result cannot retry, switch modes or claim success',async()=>{
 for(const response of [{data:{}},{error:{context:{status:409},message:'PRIVATE'}},{data:{task:{...confirmed(),assigned_to:actor}}}]){
 const f=fixture(()=>response);await assert.rejects(assignReleasedOperationalTask(f.client,options));assert.equal(f.calls.length,1);assert.equal(f.calls[0].action,'operations.task.assign');
 }
});
test('legacy missing/mismatched read-back remains unconfirmed',async()=>{
 for(const tasks of [[],[row()]]){
 const f=fixture(body=>body.action==='operations.task.assign'?{data:{task:confirmed()}}:{data:{tasks}});
 await assert.rejects(assignReleasedOperationalTask(f.client,options),/read-back did not match/);assert.equal(f.calls.length,2);
 }
});
test('explicit checked mode is reachable and requires its new audit/version/read contract',async()=>{
 const task={...confirmed(),updated_at:'2026-11-16T20:00:01.123456+00:00'};
 const f=fixture(body=>body.action==='operations.task.assign_checked'?{data:{task,auditId:audit,auditRecorded:true}}:body.action==='operations.task.get'?{data:{task}}:assert.fail('legacy endpoint called'));
 assert.equal((await assignReleasedOperationalTask(f.client,{...options,assignmentMode:'checked'})).auditId,audit);
 assert.deepEqual(f.calls.map(b=>b.action),['operations.task.assign_checked','operations.task.get']);
});
test('checked write error NEVER falls back to legacy, even for an unsupported old server',async()=>{
 for(const result of [{data:{error:'Unsupported action'}},{data:{}},{error:{context:{status:409}}}]){
 const f=fixture(()=>result);await assert.rejects(assignReleasedOperationalTask(f.client,{...options,assignmentMode:'checked'}));assert.deepEqual(f.calls.map(b=>b.action),['operations.task.assign_checked']);
 }
});
test('checked read error after successful mutation NEVER dispatches a second write',async()=>{
 const task={...confirmed(),updated_at:'2026-11-16T20:00:01.123456+00:00'};
 const f=fixture(body=>body.action==='operations.task.assign_checked'?{data:{task,auditId:audit,auditRecorded:true}}:{data:{error:'Unsupported action'}});
 await assert.rejects(assignReleasedOperationalTask(f.client,{...options,assignmentMode:'checked'}));assert.deepEqual(f.calls.map(b=>b.action),['operations.task.assign_checked','operations.task.get']);
});
test('default controller preserves PR89 mode, no optimistic success and explicit recovery after lost response',async()=>{
 let assigned=null;const f=fixture(body=>{
 if(body.action==='operations.task.list')return{data:{tasks:[{...row(),assigned_to:assigned}]}};
 if(body.action==='operations.team.list')return{data:{members:[{id:member,role:'staff'}]}};
 assert.equal(body.action,'operations.task.assign');assigned=member;return{data:{}};
 });
 const controller=createTaskWriteController(f.client,{role:'manager',schoolId:school,actorId:actor,storage:{getItem:()=>null}});controller.activate();await controller.refresh();await controller.assign(taskId,member);
 assert.equal(controller.getSnapshot().tasks[0].assigned_to,null);assert.deepEqual(controller.getSnapshot().needsRefresh,[taskId]);await controller.assign(taskId,member);assert.equal(f.calls.filter(b=>b.action==='operations.task.assign').length,1);
 await controller.refresh();assert.equal(controller.getSnapshot().tasks[0].assigned_to,member);assert.deepEqual(controller.getSnapshot().needsRefresh,[]);controller.deactivate();
});
