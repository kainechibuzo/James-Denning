import test,{after} from "node:test";
import assert from "node:assert/strict";
import {readFileSync,mkdirSync,mkdtempSync,writeFileSync,rmSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
import {transformWithOxc} from "vite";
import {JSDOM} from "jsdom";
import React,{act} from "react";
import {createRoot} from "react-dom/client";
import {Simulate} from "react-dom/test-utils";
const cache=resolve("node_modules/.cache");mkdirSync(cache,{recursive:true});const temp=mkdtempSync(`${cache}/jd-queue-`);after(()=>rmSync(temp,{recursive:true,force:true}));
const source=readFileSync(new URL("../src/pages/jd-task-queue.jsx",import.meta.url),"utf8").replace('"../chat/operational-task-writes.mjs"',JSON.stringify(new URL("../src/chat/operational-task-writes.mjs",import.meta.url).href));
const {code}=await transformWithOxc(source,"jd-task-queue.jsx",{jsx:{runtime:"classic"}});writeFileSync(`${temp}/queue.mjs`,code);const {JDTaskQueue}=await import(pathToFileURL(`${temp}/queue.mjs`));
const school="11111111-1111-4111-8111-111111111111",actor="22222222-2222-4222-8222-222222222222",id="33333333-3333-4333-8333-333333333333",member="44444444-4444-4444-8444-444444444444",audit="55555555-5555-4555-8555-555555555555";
const row=()=>({id,title:"Existing task",description:"Synthetic record",department:"Operations",priority:"normal",status:"queued",assigned_to:null,updated_at:"2026-11-16T20:00:00.123456+00:00",due_at:null});
const memory=()=>{const m=new Map();return{getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};};
const defer=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};
function fixture(write){
 const calls=[];let tasks=[row()];const storage=memory();const client={functions:{invoke:async(_,request)=>{const body=request.body;calls.push(body);
 if(body.action==="operations.task.list")return{data:{tasks}};
 if(body.action==="operations.task.get")return{data:{task:tasks.find(t=>t.id===body.taskId)}};
 if(body.action==="operations.team.list")return{data:{members:[{id:member,role:"staff",full_name:"Test Staff"}]}};
 return write(body,record=>{tasks=[record];});
 }}};
 return{client,calls,storage};
}
function created(body,reused=false){return{data:{task:{id,school_id:school,created_by:actor,idempotency_key:`${school}:task.create:${body.idempotencyId}`,title:body.task.title,description:body.task.description,department:body.task.department||null,priority:body.task.priority,due_at:body.task.dueAt,status:"queued"},auditRecorded:true,auditId:audit,reused}};}
const element=(f,props={})=>React.createElement(JDTaskQueue,{client:f.client,storage:f.storage,schoolId:school,actorId:actor,role:"manager",...props});
async function mount(f,props={}){
 const dom=new JSDOM('<!doctype html><body><div id="root"></div></body>');globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const root=createRoot(document.querySelector("#root"));await act(async()=>root.render(element(f,props)));
 return{dom,render:async props=>act(async()=>root.render(element(f,props))),cleanup:async()=>{await act(async()=>root.unmount());dom.window.close();delete globalThis.window;delete globalThis.document;delete globalThis.IS_REACT_ACT_ENVIRONMENT;}};
}
const button=label=>[...document.querySelectorAll("button")].find(b=>b.textContent===label);
const text=()=>document.querySelector("#root").textContent;
async function enterTitle(value){const input=document.querySelector('input[maxlength="180"]');await act(async()=>Simulate.change(input,{target:{value}}));}
async function submit(dom){await act(async()=>document.querySelector("form").dispatchEvent(new dom.window.Event("submit",{bubbles:true,cancelable:true})));}
test("mounted form submits once, retains details while pending, then clears only after task+audit acknowledgement",async()=>{
 const pending=defer();let request;const f=fixture(body=>{request=body;return pending.promise;});const m=await mount(f);
 try{await enterTitle("New dispatch check");const form=document.querySelector("form");await act(async()=>{form.dispatchEvent(new m.dom.window.Event("submit",{bubbles:true,cancelable:true}));form.dispatchEvent(new m.dom.window.Event("submit",{bubbles:true,cancelable:true}));});
 assert.equal(f.calls.filter(c=>c.action==="operations.task.create").length,1);assert.match(text(),/Unresolved creation request: New dispatch check/);assert.equal(document.querySelector("form"),null);assert.ok(button("Confirming request…").disabled);
 await act(async()=>pending.resolve(created(request)));assert.match(text(),/Task saved with audit evidence/);assert.equal(document.querySelector('input[maxlength="180"]').value,"");
 }finally{await m.cleanup();}
});
test("unconfirmed create survives component remount and explicit recovery reuses original payload",async()=>{
 let tries=0;const f=fixture(body=>++tries===1?{data:{}}:created(body,true));const m=await mount(f);
 try{await enterTitle("Keep this request");await submit(m.dom);assert.match(text(),/not confirmed/);const first=f.calls.find(c=>c.action==="operations.task.create");
 await m.render({key:"reload"});assert.match(text(),/Keep this request/);assert.equal(document.querySelector("form"),null);
 await act(async()=>button("Recover same request").click());const writes=f.calls.filter(c=>c.action==="operations.task.create");assert.deepEqual(writes[1],first);assert.match(text(),/Existing task recovered/);
 }finally{await m.cleanup();}
});
test("corrupt storage renders a blocking explanation, not a fresh creation form",async()=>{
 const f=fixture(()=>assert.fail("write"));f.storage.setItem(`jd.task-create.v1:${school}:${actor}`,"corrupt");const m=await mount(f);
 try{assert.match(text(),/recovery storage is unavailable or invalid/);assert.ok(document.querySelector("fieldset").disabled);assert.equal(f.calls.filter(c=>c.action==="operations.task.create").length,0);}finally{await m.cleanup();}
});
test("manual assignment is disabled while pending and reports success only after matching read-back",async()=>{
 const pending=defer();let save;const f=fixture((body,replace)=>{save=()=>replace({...row(),assigned_to:member,updated_at:"2026-11-16T20:00:01.123456+00:00"});return pending.promise;});const m=await mount(f);
 try{const select=document.querySelector('select[aria-label="Assign Existing task"]');await act(async()=>{Simulate.change(select,{target:{value:member}});Simulate.change(select,{target:{value:member}});});assert.ok(select.disabled);assert.equal(select.value,"");assert.equal(f.calls.filter(c=>c.action==="operations.task.assign_checked").length,1);
 await act(async()=>{save();pending.resolve({data:{task:{id,assigned_to:member,status:"queued",updated_at:"2026-11-16T20:00:01.123456+00:00"},auditRecorded:true,auditId:audit}});});assert.match(text(),/Assignment saved with audit evidence and confirmed by record read-back/);assert.equal(select.value,member);
 }finally{await m.cleanup();}
});
test("lost assignment acknowledgement does not show success and requires refresh before another write",async()=>{
 const f=fixture((body,save)=>{save({...row(),assigned_to:member});return{data:{}};});const m=await mount(f);
 try{await act(async()=>Simulate.change(document.querySelector('select[aria-label="Assign Existing task"]'),{target:{value:member}}));assert.match(text(),/Update not confirmed/);assert.ok(document.querySelector('select[aria-label="Assign Existing task"]').disabled);assert.doesNotMatch(text(),/Assignment confirmed/);
 await act(async()=>button("Refresh task records").click());assert.equal(document.querySelector('select[aria-label="Assign Existing task"]').value,member);assert.equal(f.calls.filter(c=>c.action==="operations.task.assign_checked").length,1);
 }finally{await m.cleanup();}
});
test("auto assign button calls the real endpoint and no-capacity never claims assignment success",async()=>{
 const f=fixture(()=>({data:{assignment:{assigned:false,reason:"No active department member has available capacity"}}}));const m=await mount(f);
 try{await act(async()=>button("Auto assign").click());assert.equal(f.calls.at(-1).action,"operations.task.auto_assign");assert.match(text(),/No assignment made/);assert.doesNotMatch(text(),/Assignment confirmed/);}finally{await m.cleanup();}
});
test("unsupported role has no mutation controls and sends no requests",async()=>{
 const f=fixture(()=>assert.fail("write"));const m=await mount(f,{role:"staff"});try{assert.match(text(),/signed-in workspace manager/);assert.ok(document.querySelector("fieldset").disabled);assert.equal(f.calls.length,0);}finally{await m.cleanup();}
});
test("scope switch discards late creation response and retains old scoped journal",async()=>{
 const pending=defer();let request;const f=fixture(body=>{request=body;return pending.promise;});const m=await mount(f);
 try{await enterTitle("Old account task");await submit(m.dom);await m.render({actorId:member});await act(async()=>pending.resolve(created(request)));assert.doesNotMatch(text(),/Task saved with audit evidence|Old account task/);assert.ok(f.storage.getItem(`jd.task-create.v1:${school}:${actor}`));}
 finally{await m.cleanup();}
});
test("operations integration replaces unguarded writes and remounts on identity changes",()=>{
 const page=readFileSync(new URL("../src/pages/jd-operations.jsx",import.meta.url),"utf8"),shell=readFileSync(new URL("../src/AppDemo.jsx",import.meta.url),"utf8");
 assert.match(page,/<JDTaskQueue client=\{supabase\}/);assert.doesNotMatch(page,/idempotencyId:crypto.randomUUID|onClick=\{\(\)=>autoAssignTask/);
 assert.match(page,/loading&&tab!=="tasks"/);assert.match(shell,/<JDOperationsPage key=\{JSON.stringify\(\[selectedSchool\?\.id,user\?\._authUserId\|\|user\?\.id,user\?\.role\]\)\}/);
});
test("confirmed queue changes update the parent overview without a second write",async()=>{
 const snapshots=[];const f=fixture(body=>created(body));const m=await mount(f,{onTasksChanged:tasks=>snapshots.push(tasks)});
 try{await enterTitle("Overview synced task");await submit(m.dom);assert.equal(snapshots.at(-1)[0].title,"Overview synced task");assert.equal(f.calls.filter(c=>c.action==="operations.task.create").length,1);}finally{await m.cleanup();}
});
test("queue Start requires task/audit acknowledgement and prevents a repeated transition",async()=>{
 const pending=defer();const f=fixture(()=>pending.promise);const m=await mount(f);
 try{await act(async()=>{button("Start").click();button("Start").click();});assert.equal(f.calls.filter(c=>c.action==="operations.task.transition").length,1);assert.match(text(),/queued/);
 await act(async()=>pending.resolve({data:{task:{id,status:"in_progress"},auditRecorded:true,auditId:audit}}));assert.match(text(),/Task status saved with audit evidence/);assert.ok(button("Complete record"));}
 finally{await m.cleanup();}
});
test("queue transition without audit is not success and requires a refresh",async()=>{
 const f=fixture(()=>({data:{task:{id,status:"in_progress"}}}));const m=await mount(f);
 try{await act(async()=>button("Start").click());assert.match(text(),/Update not confirmed/);assert.ok(button("Start").disabled);assert.doesNotMatch(text(),/Task status saved with audit evidence/);}
 finally{await m.cleanup();}
});
test("tab hide/reopen preserves the unsubmitted draft and refreshes queue records",async()=>{
 const f=fixture(()=>assert.fail("no write"));const m=await mount(f);
 try{await enterTitle("Unsubmitted draft");await m.render({active:false});await m.render({active:true});assert.equal(document.querySelector('input[maxlength="180"]').value,"Unsubmitted draft");assert.equal(f.calls.filter(c=>c.action==="operations.task.list").length,2);}
 finally{await m.cleanup();}
});
