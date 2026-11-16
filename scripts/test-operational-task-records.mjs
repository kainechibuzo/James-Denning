import test from "node:test";
import assert from "node:assert/strict";
import {createTaskRecordController,readOperationalTasks,taskReadAction,savedTaskKey,isSavedTaskCard,nextChecklistTaskStatus} from "../src/chat/operational-task-records.mjs";
const id="11111111-1111-4111-8111-111111111111",other="22222222-2222-4222-8222-222222222222",audit="33333333-3333-4333-8333-333333333333";
const task=(status="queued",taskId=id)=>({id:taskId,title:"Inspect fleet",status});
const rows=(...tasks)=>({data:{tasks},error:null});
const ack=(status="in_progress",taskId=id)=>({data:{task:task(status,taskId),auditRecorded:true,auditId:audit},error:null});
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};
function setup(handler,role="manager",taskIds=[id]){
  const calls=[];const client={functions:{invoke:async(name,request)=>{calls.push(request.body);return handler(request.body,calls.length);}}};
  const controller=createTaskRecordController(client,{role,taskIds});controller.activate();
  return{controller,client,calls,state:controller.getSnapshot};
}
for(const [role,action] of [["owner","operations.task.list"],["admin","operations.task.list"],["manager","operations.task.list"],["staff","operations.task.list_mine"],["contractor","operations.task.list_mine"],["viewer","operations.task.list_readonly"]]){
  test(`task read routes ${role} to ${action}`,async()=>{
    const {client,calls}=setup(()=>rows(task()),role);assert.deepEqual(await readOperationalTasks(client,role),[task()]);assert.equal(calls[0].action,action);
  });
}
test("unsupported roles fail before network",async()=>{
  for(const role of [undefined,"teacher","finance","hr","employee","unknown"]){
    const {client,calls}=setup(()=>rows(task()),role);assert.equal(taskReadAction(role),null);await assert.rejects(readOperationalTasks(client,role));assert.equal(calls.length,0);
  }
});
for(const [label,response] of [["missing payload",{}],["missing task list",{data:{}}],["body error",{data:{error:"secret",tasks:[]}}],["invalid id",rows({...task(),id:"draft-1"})],["unknown status",rows(task("approved"))],["missing title",rows({id,status:"queued"})],["duplicate id",rows(task(),task())],["null item",rows(null)],["HTTP error",{error:{context:{status:401},message:"secret"}}]]){
  test(`read rejects ${label} without raw diagnostics`,async()=>{
    const {client}=setup(()=>response);await assert.rejects(readOperationalTasks(client,"manager"),err=>{assert.doesNotMatch(err.message,/secret/);return true;});
  });
}
test("saved task keys require source provenance and UUID, deduplicate and ignore non-assistant/non-checklist content",()=>{
  const visualWorkspace={source:"persisted_workspace_records",blocks:[{type:"checklist",items:[task(),task(),{id:"draft-1"}]},{type:"workflow",items:[task("queued",other)]}]};
  assert.equal(savedTaskKey([{role:"assistant",visualWorkspace},{role:"user",visualWorkspace}]),id);
  assert.equal(savedTaskKey([{role:"assistant",visualWorkspace:{...visualWorkspace,source:"model"}}]),"");
  assert.equal(isSavedTaskCard({source:"persisted_workspace_records"},{id:"draft-1"}),false);
});
test("checklist actions preserve the legal subset, never convert cancelled/unknown states into start",()=>{
  assert.equal(nextChecklistTaskStatus("queued"),"in_progress");assert.equal(nextChecklistTaskStatus("blocked"),"in_progress");assert.equal(nextChecklistTaskStatus("in_progress"),"completed");
  for(const status of ["pending","completed","cancelled","failed",undefined])assert.equal(nextChecklistTaskStatus(status),null);
});
test("mutations require a successful read and a returned record; out-of-sample records stay unavailable",async()=>{
  const {controller,calls,state}=setup(()=>rows(task("queued",other)));
  await controller.transition(id,"in_progress");assert.equal(calls.length,0);
  await controller.refresh();assert.deepEqual(state().records,{});
  await controller.transition(id,"in_progress");assert.equal(calls.length,1);
});
test("confirmed transition is not optimistic, locks duplicate cards synchronously, and records audit acknowledgement",async()=>{
  const pending=deferred();const {controller,calls,state}=setup(body=>body.action.endsWith("list")?rows(task()):pending.promise);
  await controller.refresh();const mutation=controller.transition(id,"in_progress");
  assert.equal(state().records[id].status,"queued");assert.deepEqual(state().pending,[id]);
  await controller.transition(id,"in_progress");await controller.refresh();assert.equal(calls.length,2);
  pending.resolve(ack());await mutation;
  assert.equal(state().records[id].status,"in_progress");assert.equal(state().audits[id],audit);assert.deepEqual(state().pending,[]);
});
test("uncertain mutation requires read reconciliation, never auto-retries or reports success",async()=>{
  let readStatus="queued";const {controller,calls,state}=setup(body=>body.action.endsWith("list")?rows(task(readStatus)):{data:{task:task("in_progress")},error:null});
  await controller.refresh();await controller.transition(id,"in_progress");
  assert.equal(state().records[id].status,"queued");assert.deepEqual(state().audits,{});assert.deepEqual(state().needsRefresh,[id]);
  await controller.transition(id,"in_progress");assert.equal(calls.length,2);
  readStatus="in_progress";await controller.refresh();assert.equal(state().records[id].status,"in_progress");assert.deepEqual(state().needsRefresh,[]);assert.equal(calls.length,3);
  await controller.transition(id,"in_progress");assert.equal(calls.length,3,"stale requested action is rejected locally");
});
test("transport failure after a committed mutation is reconciled by read-back",async()=>{
  let status="in_progress";const {controller,calls,state}=setup(body=>{if(body.action.endsWith("list"))return rows(task(status));status="completed";throw Error("lost response / private token");});
  await controller.refresh();await controller.transition(id,"completed");assert.equal(state().records[id].status,"in_progress");assert.doesNotMatch(state().error,/private token/);
  await controller.refresh();assert.equal(state().records[id].status,"completed");assert.deepEqual(state().audits,{});assert.equal(calls.filter(c=>c.action.includes("transition")).length,1);
});
test("failed refresh clears writable state instead of preserving stale success",async()=>{
  let fail=false;const {controller,state,calls}=setup(()=>fail?{error:{message:"private"}}:rows(task()));await controller.refresh();fail=true;await controller.refresh();
  assert.equal(state().phase,"error");assert.deepEqual(state().records,{});await controller.transition(id,"in_progress");assert.equal(calls.length,2);
});
test("late reads cannot overwrite a newer refresh",async()=>{
  const first=deferred();const {controller,state}=setup((body,n)=>n===1?first.promise:rows(task("completed")));
  const oldRead=controller.refresh();await controller.refresh();first.resolve(rows(task()));await oldRead;assert.equal(state().records[id].status,"completed");
});
test("deactivated scope ignores late reads and writes, including StrictMode reactivation",async()=>{
  const pending=deferred();const {controller,state}=setup(body=>body.action.endsWith("list")?rows(task()):pending.promise);
  await controller.refresh();const mutation=controller.transition(id,"in_progress");controller.deactivate();controller.activate();await controller.refresh();
  pending.resolve(ack());await mutation;assert.equal(state().records[id].status,"queued");assert.deepEqual(state().audits,{});
  const slow=deferred();const another=setup(()=>slow.promise);const read=another.controller.refresh();another.controller.deactivate();slow.resolve(rows(task()));await read;assert.deepEqual(another.state().records,{});
});
test("new cards during a pending mutation cannot reset its duplicate-click guard",async()=>{
  const pending=deferred();const {controller,state,calls}=setup(body=>body.action.endsWith("list")?rows(task(),task("queued",other)):pending.promise);
  await controller.refresh();const mutation=controller.transition(id,"in_progress");await controller.setTaskIds([id,other]);await controller.transition(id,"in_progress");assert.equal(calls.length,2);
  pending.resolve(ack());await mutation;await Promise.resolve();assert.equal(calls.filter(c=>c.action.includes("transition")).length,1);assert.ok(state().records[other]);
});
test("independent task mutations merge without losing either acknowledgement",async()=>{
  const one=deferred(),two=deferred();const {controller,state}=setup(body=>body.action.endsWith("list")?rows(task(),task("queued",other)):body.taskId===id?one.promise:two.promise,"manager",[id,other]);
  await controller.refresh();const a=controller.transition(id,"in_progress"),b=controller.transition(other,"in_progress");
  two.resolve(ack("in_progress",other));await b;one.resolve(ack());await a;
  assert.equal(state().records[id].status,"in_progress");assert.equal(state().records[other].status,"in_progress");assert.equal(Object.keys(state().audits).length,2);assert.deepEqual(state().pending,[]);
});
for(const role of ["viewer","contractor"]){
  test(`${role} can read but never dispatch a task transition`,async()=>{
    const {controller,calls}=setup(()=>rows(task()),role);await controller.refresh();await controller.transition(id,"in_progress");assert.equal(calls.length,1);
  });
}
