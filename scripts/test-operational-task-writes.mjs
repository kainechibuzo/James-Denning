import test from "node:test";
import assert from "node:assert/strict";
import {blankTask,normaliseTaskDraft,createOperationalTask,assignOperationalTask,createTaskWriteController} from "../src/chat/operational-task-writes.mjs";
const school="11111111-1111-4111-8111-111111111111",actor="22222222-2222-4222-8222-222222222222",id="33333333-3333-4333-8333-333333333333",audit="44444444-4444-4444-8444-444444444444",token="55555555-5555-4555-8555-555555555555",member="66666666-6666-4666-8666-666666666666";
const draft={...blankTask(),title:"Inspect fleet",department:"Operations"};
const attempt={version:1,id:token,task:normaliseTaskDraft(draft)};
const row=()=>({id,school_id:school,created_by:actor,idempotency_key:`${school}:task.create:${token}`,title:draft.title,description:"",department:"Operations",priority:"normal",due_at:null,status:"queued",assigned_to:null,updated_at:"2026-11-16T20:00:00.123456+00:00"});
const ack=()=>({task:row(),reused:false,auditRecorded:true,auditId:audit});
const config={role:"manager",schoolId:school,actorId:actor,attempt,assignmentMode:"checked"};
const journal=`jd.task-create.v1:${school}:${actor}`;
const memory=()=>{const data=new Map();return{getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};};
const defer=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};
function fixture(handler,options={}){
 const calls=[];const storage=options.storage||memory();
 const client={functions:{invoke:async(_,request)=>{calls.push(request.body);return handler(request.body,calls.length);}}};
 const controller=createTaskWriteController(client,{...config,storage,randomUUID:()=>token,...options});controller.activate();
 return{client,controller,calls,storage,state:controller.getSnapshot};
}
const read=(body,task=row())=>body.action==="operations.task.list"?{data:{tasks:[task]}}:{data:{members:[{id:member,role:"staff",full_name:"Synthetic Member"}]}};
test("normalisation preserves details without silent truncation and converts dates once",()=>{
 assert.deepEqual(normaliseTaskDraft({...draft,title:" Inspect fleet ",dueAt:"2026-11-16T09:00:00+01:00"}),{title:"Inspect fleet",description:"",department:"Operations",priority:"normal",dueAt:"2026-11-16T08:00:00.000Z"});
 for(const patch of [{title:" "},{title:"x".repeat(181)},{description:"x".repeat(5001)},{department:"x".repeat(121)},{priority:"invalid"},{dueAt:"invalid"},{dueAt:123}])assert.throws(()=>normaliseTaskDraft({...draft,...patch}));
});
for(const role of ["owner","admin","manager"]){test(`${role} creation requires exact persisted request and audit`,async()=>{
 const f=fixture(()=>({data:ack()}));const result=await createOperationalTask(f.client,{...config,role});assert.equal(result.task.id,id);assert.deepEqual(f.calls[0],{action:"operations.task.create",task:attempt.task,idempotencyId:token});
});}
for(const [label,modify] of [
 ["wrong task id",d=>d.task.id="draft"],["wrong tenant",d=>d.task.school_id=actor],["wrong actor",d=>d.task.created_by=school],["wrong key",d=>d.task.idempotency_key="another"],["wrong title",d=>d.task.title="Other"],["wrong description",d=>d.task.description="Other"],["wrong department",d=>d.task.department="Other"],["wrong priority",d=>d.task.priority="high"],["wrong due date",d=>d.task.due_at="2026-11-16"],["invalid status",d=>d.task.status="published"],["missing reused flag",d=>delete d.reused],["missing audit",d=>d.auditRecorded=false],["bad audit id",d=>d.auditId="audit"],["new task not queued",d=>d.task.status="completed"]]){
 test(`creation rejects ${label}`,async()=>{const data=ack();modify(data);const f=fixture(()=>({data}));await assert.rejects(createOperationalTask(f.client,config),/not confirmed/);assert.equal(f.calls.length,1);});
}
test("reused task may have progressed but still needs original audit and request match",async()=>{
 const data=ack();data.reused=true;data.task.status="completed";const f=fixture(()=>({data}));assert.equal((await createOperationalTask(f.client,config)).reused,true);
 data.auditRecorded=false;await assert.rejects(createOperationalTask(f.client,config));
});
test("unsupported roles and invalid identities never send writes",async()=>{
 const f=fixture(()=>({data:ack()}));for(const role of ["staff","contractor","viewer",undefined])await assert.rejects(createOperationalTask(f.client,{...config,role}));
 await assert.rejects(createOperationalTask(f.client,{...config,schoolId:"bad"}));await assert.rejects(assignOperationalTask(f.client,{role:"staff",taskId:id,assigneeId:member,expectedTask:row()}));assert.equal(f.calls.length,0);
});
test("transport and API errors do not leak diagnostics or retry",async()=>{
 for(const response of [null,{error:{message:"SECRET",context:{status:403}}},{data:{error:"SECRET"}},{data:null}]){
 const f=fixture(()=>{if(!response)throw Error("SECRET");return response;});await assert.rejects(createOperationalTask(f.client,config),e=>{assert.doesNotMatch(e.message,/SECRET/);return true;});assert.equal(f.calls.length,1);
 }
});
test("journal is persisted before first network request and double clicks share one attempt",async()=>{
 const wait=defer();let f;f=fixture(()=>{assert.ok(f.storage.getItem(journal));return wait.promise;});const pending=f.controller.create(draft);await f.controller.create(draft);assert.equal(f.calls.length,1);assert.equal(f.state().created,0);
 wait.resolve({data:ack()});await pending;assert.equal(f.state().created,1);assert.equal(f.storage.getItem(journal),null);assert.match(f.state().notice,/audit evidence/);
});
test("lost response/remount retains exact ID and immutable details even if caller supplies another draft",async()=>{
 const storage=memory();const f=fixture(()=>{throw Error("lost response");},{storage});await f.controller.create(draft);f.controller.deactivate();
 const g=fixture(()=>({data:{...ack(),reused:true}}),{storage,randomUUID:()=>assert.fail("must reuse ID")});assert.equal(g.state().attempt.id,token);
 await g.controller.create({...draft,title:"Changed task"});assert.deepEqual(g.calls[0],f.calls[0]);assert.equal(g.storage.getItem(journal),null);assert.match(g.state().notice,/Existing task recovered/);
});
test("storage writes fail closed before any network mutation",async()=>{
 const storage=memory();storage.setItem=()=>{throw Error("private quota info");};const f=fixture(()=>assert.fail("network"),{storage});await f.controller.create(draft);assert.equal(f.calls.length,0);assert.match(f.state().error,/No request was sent/);assert.doesNotMatch(f.state().error,/private/);
});
test("corrupted or unavailable recovery storage is not silently discarded",async()=>{
 for(const raw of ["bad json",JSON.stringify({...attempt,version:2}),JSON.stringify({...attempt,id:"bad"})]){const storage=memory();storage.setItem(journal,raw);const f=fixture(()=>assert.fail("network"),{storage});assert.equal(f.state().fatal,true);await f.controller.create(draft);assert.equal(storage.getItem(journal),raw);}
 const f=fixture(()=>assert.fail("network"),{storage:{getItem:()=>{throw Error("blocked");}}});assert.equal(f.state().fatal,true);
});
test("confirmed save with failed journal cleanup stays recoverable, never rotates ID",async()=>{
 const storage=memory();let remove=storage.removeItem;storage.removeItem=()=>{};const f=fixture(()=>({data:ack()}),{storage});await f.controller.create(draft);assert.ok(f.state().attempt);assert.equal(f.state().created,0);assert.match(f.state().error,/task was confirmed/);
 storage.removeItem=remove;await f.controller.create();assert.equal(f.calls[1].idempotencyId,token);assert.equal(f.state().created,1);
});
test("recovery records are isolated by actor and workspace",()=>{
 const storage=memory();storage.setItem(journal,JSON.stringify(attempt));assert.ok(fixture(()=>{}, {storage}).state().attempt);
 assert.equal(fixture(()=>{}, {storage,actorId:member}).state().attempt,null);assert.equal(fixture(()=>{}, {storage,schoolId:member}).state().attempt,null);
});
test("late create acknowledgement after unmount leaves recovery journal for safe replay",async()=>{
 const wait=defer();const f=fixture(()=>wait.promise);const pending=f.controller.create(draft);f.controller.deactivate();wait.resolve({data:ack()});await pending;
 assert.ok(f.storage.getItem(journal));assert.equal(f.state().created,0);
});
test("assignment validates response then reads back exact saved assignee",async()=>{
 const data=assignmentAck();const f=fixture(body=>body.action==="operations.task.assign_checked"?{data}:{data:{task:data.task}});
 const result=await assignOperationalTask(f.client,{role:"manager",taskId:id,assigneeId:member,expectedTask:row()});assert.equal(result.task.assigned_to,member);assert.deepEqual(f.calls.map(c=>c.action),["operations.task.assign_checked","operations.task.get"]);assert.equal(result.auditId,audit);
});
for(const [label,response] of [["wrong task",{task:{id:actor,assigned_to:member,status:"queued"}}],["wrong assignee",{task:{id,assigned_to:actor,status:"queued"}}],["empty 2xx",{}]]){
 test(`assignment rejects ${label} without reporting success`,async()=>{const f=fixture(()=>({data:response}));await assert.rejects(assignOperationalTask(f.client,{role:"manager",taskId:id,assigneeId:member,expectedTask:row()}),/not confirmed/);});
}
test("assignment missing or overwritten at exact read-back is unconfirmed",async()=>{
 for(const task of [null,row(),{...row(),assigned_to:member,updated_at:"2026-11-16T20:00:02+00:00"}]){const f=fixture(body=>body.action==="operations.task.assign_checked"?{data:assignmentAck()}:{data:{task}});await assert.rejects(assignOperationalTask(f.client,{role:"manager",taskId:id,assigneeId:member,expectedTask:row()}),/read-back/);}
});
test("auto assign no-capacity is a non-success outcome; raw reasons are not trusted",async()=>{
 const f=fixture(()=>({data:{assignment:{assigned:false,reason:"No active department member has available capacity"}}}));assert.deepEqual(await assignOperationalTask(f.client,{role:"manager",taskId:id,auto:true}),{assigned:false});assert.equal(f.calls.length,1);
 const bad=fixture(()=>({data:{assignment:{assigned:false,reason:"SECRET"}}}));await assert.rejects(assignOperationalTask(bad.client,{role:"manager",taskId:id,auto:true}),e=>{assert.doesNotMatch(e.message,/SECRET/);return true;});
});
test("auto assign validates task/assignee then reads back; already assigned is supported",async()=>{
 const f=fixture(body=>body.action==="operations.task.auto_assign"?{data:{assignment:{assigned:true,already_assigned:true,task_id:id,assignee_id:member}}}:{data:{task:{...row(),assigned_to:member}}});
 assert.equal((await assignOperationalTask(f.client,{role:"manager",taskId:id,auto:true})).task.assigned_to,member);
});
test("uncertain assignment blocks repeat until read-only reconciliation; no optimistic assignment",async()=>{
 let assigned=null;const wait=defer();const f=fixture(body=>body.action==="operations.task.assign_checked"?(assigned=member,wait.promise):read(body,{...row(),assigned_to:assigned}));
 await f.controller.refresh();const pending=f.controller.assign(id,member);await f.controller.assign(id,member);assert.equal(f.calls.filter(c=>c.action==="operations.task.assign_checked").length,1);assert.equal(f.state().tasks[0].assigned_to,null);
 wait.resolve({data:{}});await pending;assert.deepEqual(f.state().needsRefresh,[id]);await f.controller.assign(id,member);await f.controller.refresh();assert.equal(f.state().tasks[0].assigned_to,member);assert.deepEqual(f.state().needsRefresh,[]);assert.equal(f.calls.filter(c=>c.action==="operations.task.assign_checked").length,1);
});
test("failed refresh disables queue and preserves creation success notice",async()=>{
 let fail=false;const f=fixture(body=>body.action==="operations.task.create"?{data:ack()}:fail?{error:{message:"private"}}:read(body));await f.controller.refresh();await f.controller.create(draft);fail=true;await f.controller.refresh();assert.equal(f.state().ready,false);assert.match(f.state().notice,/Task saved/);const count=f.calls.length;await f.controller.assign(id,member);assert.equal(f.calls.length,count);
});
test("externally removed unresolved journal never silently rotates request identity",async()=>{
 const f=fixture(()=>({data:{}}));await f.controller.create(draft);f.storage.removeItem(journal);await f.controller.create({...draft,title:"Another task"});assert.equal(f.calls.length,1);assert.equal(f.state().fatal,true);assert.match(f.state().recoveryError,/Recovery data changed/);
});

function assignmentAck(){return{task:{...row(),assigned_to:member,updated_at:"2026-11-16T20:00:01.234567+00:00"},auditRecorded:true,auditId:audit};}
test("manual assignment sends exact observed version, requires audit and uses exact-ID read rather than bounded list",async()=>{
 const data=assignmentAck();const f=fixture(body=>body.action==="operations.task.assign_checked"?{data}:{data:{task:data.task}});
 const result=await assignOperationalTask(f.client,{role:"manager",taskId:id,assigneeId:member,expectedTask:row()});
 assert.equal(result.auditId,audit);assert.deepEqual(f.calls,[{action:"operations.task.assign_checked",taskId:id,assigneeId:member,expectedAssigneeId:null,expectedUpdatedAt:row().updated_at},{action:"operations.task.get",taskId:id}]);
});
for(const field of ["auditId","auditRecorded"]){test(`assignment refuses missing ${field}`,async()=>{
 const data=assignmentAck();delete data[field];const f=fixture(()=>({data}));await assert.rejects(assignOperationalTask(f.client,{role:"manager",taskId:id,assigneeId:member,expectedTask:row()}),/audit were not confirmed/);assert.equal(f.calls.length,1);
});}
test("missing/stale-shaped expected record cannot dispatch assignment",async()=>{
 const f=fixture(()=>assert.fail("no network"));
 for(const expectedTask of [undefined,{...row(),id:actor},{...row(),updated_at:null},{...row(),assigned_to:undefined}])await assert.rejects(assignOperationalTask(f.client,{role:"manager",taskId:id,assigneeId:member,expectedTask}),/Refresh task records/);
 assert.equal(f.calls.length,0);
});
test("old server unsupported action does not fallback to unchecked assignment",async()=>{
 const f=fixture(()=>({data:{error:"Unsupported action"}}));await assert.rejects(assignOperationalTask(f.client,{role:"manager",taskId:id,assigneeId:member,expectedTask:row()}));assert.equal(f.calls.length,1);assert.equal(f.calls[0].action,"operations.task.assign_checked");
});
