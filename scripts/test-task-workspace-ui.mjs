import test,{after} from "node:test";
import assert from "node:assert/strict";
import {readFileSync,mkdirSync,mkdtempSync,writeFileSync,rmSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
import {transformWithOxc} from "vite";
import {JSDOM} from "jsdom";
import React,{act} from "react";
import {createRoot} from "react-dom/client";

const cache=resolve("node_modules/.cache");mkdirSync(cache,{recursive:true});
const temp=mkdtempSync(`${cache}/jd-task-ui-`);after(()=>rmSync(temp,{recursive:true,force:true}));
async function loadComponent(name){
  const source=readFileSync(new URL(`../src/chat/${name}.jsx`,import.meta.url),"utf8").replace(/from "(\.\/[^\"]+)"/g,(_,path)=>`from ${JSON.stringify(new URL(`../src/chat/${path.slice(2)}`,import.meta.url).href)}`);
  const {code}=await transformWithOxc(source,`${name}.jsx`,{jsx:{runtime:"classic"}});
  const file=`${temp}/${name}.mjs`;writeFileSync(file,code);return import(pathToFileURL(file));
}
const {JDVisualWorkspace}=await loadComponent("JDVisualWorkspace");
const {useOperationalTaskRecords}=await loadComponent("use-operational-task-records");
const id="11111111-1111-4111-8111-111111111111",audit="22222222-2222-4222-8222-222222222222";
const task=(status="queued")=>({id,title:"Inspect fleet",status});
const workspace=(saved=true,item=task())=>({source:saved?"persisted_workspace_records":"advisory",blocks:[{type:"checklist",id:"tasks",items:[item]}]});
const ready=(status="queued")=>({phase:"ready",records:{[id]:task(status)},pending:[],needsRefresh:[],audits:{}});
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};
async function mount(element){
  const dom=new JSDOM('<!doctype html><body><div id="root"></div></body>');globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  const root=createRoot(document.querySelector("#root"));await act(async()=>root.render(element));
  return{dom,root,render:async element=>act(async()=>root.render(element)),cleanup:async()=>{await act(async()=>root.unmount());dom.window.close();delete globalThis.window;delete globalThis.document;delete globalThis.IS_REACT_ACT_ENVIRONMENT;}};
}
const view=props=>React.createElement(JDVisualWorkspace,{ui:workspace(),taskRole:"manager",...props});
const check=()=>document.querySelector("button.jd-viz-check");
const content=()=>document.querySelector("#root").textContent;
function Harness({client,scope="org-a:user-a:conversation-a",ui=workspace(),copies=1,role="manager",taskKey=id}){
  const tasks=useOperationalTaskRecords({client,role,scopeKey:scope,taskKey});
  return React.createElement(React.Fragment,null,
    React.createElement("button",{id:"refresh",onClick:tasks.refresh},"Refresh task records"),
    tasks.state.error&&React.createElement("p",{role:"alert"},tasks.state.error),
    Array.from({length:copies},(_,i)=>view({key:scope+":"+i,ui,taskRole:role,taskRecords:tasks.state,onTaskToggle:tasks.transition})));
}
for(const item of [task("completed"),{id:"draft-1",title:"Draft task",status:"completed"},{title:"No ID task",status:"completed"}]){
  test(`draft ${item.id||"without ID"} never claims saved completion or dispatches a mutation`,async()=>{
    let calls=0;const m=await mount(view({ui:workspace(false,item),taskRecords:ready("completed"),onTaskToggle:()=>calls++}));
    try{assert.match(content(),/0\/1 local ticks/);assert.match(content(),/Local checklist — no saved record confirmed/);assert.equal(check().getAttribute("aria-pressed"),"false");
      await act(async()=>check().click());assert.match(content(),/1\/1 local ticks/);assert.match(content(),/Locally checked/);assert.equal(calls,0);assert.doesNotMatch(content(),/Record complete|records complete|Status saved with audit/);
    }finally{await m.cleanup();}
  });
}
test("snapshot completion is unverified and inert until a matching authorised read",async()=>{
  const m=await mount(view({ui:workspace(true,task("completed")),onTaskToggle:()=>assert.fail("must not write")}));
  try{assert.ok(check().disabled);assert.match(content(),/Unverified snapshot/);assert.match(content(),/0\/1 records complete/);assert.equal(check().getAttribute("aria-pressed"),"false");}
  finally{await m.cleanup();}
});
test("invalid saved ID never becomes a local toggle",async()=>{
  const m=await mount(view({ui:workspace(true,{id:"draft-1",title:"Malformed saved task"}),onTaskToggle:()=>assert.fail("must not write")}));
  try{assert.ok(check().disabled);assert.match(content(),/Unverified snapshot/);assert.doesNotMatch(content(),/local ticks/);}finally{await m.cleanup();}
});
for(const role of ["viewer","contractor","teacher",undefined]){
  test(`${role} cannot turn a saved task into a local completion`,async()=>{
    const m=await mount(view({taskRole:role,taskRecords:ready(),onTaskToggle:()=>assert.fail("must not write")}));
    try{assert.ok(check().disabled);assert.match(content(),/Read-only for your role/);await act(async()=>check().click());assert.equal(check().getAttribute("aria-pressed"),"false");}
    finally{await m.cleanup();}
  });
}
test("refreshed records override stale card title and status, including cancelled",async()=>{
  const current=ready("cancelled");current.records[id].title="Current authorised title";
  const m=await mount(view({ui:workspace(true,task("completed")),taskRecords:current,onTaskToggle:()=>assert.fail("terminal task")}));
  try{assert.match(content(),/Current authorised title/);assert.match(content(),/Cancelled/);assert.doesNotMatch(content(),/Inspect fleet|Record complete/);assert.ok(check().disabled);}finally{await m.cleanup();}
});
test("local ticks do not carry to changed item content or remounted workspace",async()=>{
  const first=view({ui:workspace(false)});const m=await mount(first);
  try{await act(async()=>check().click());assert.match(content(),/1\/1 local ticks/);
    await m.render(view({ui:workspace(false,{...task(),title:"Different draft"})}));assert.match(content(),/0\/1 local ticks/);
    await m.render(view({key:"new-workspace",ui:workspace(false)}));assert.match(content(),/0\/1 local ticks/);
  }finally{await m.cleanup();}
});
test("references are hidden by default and revealed in explicit evidence details",async()=>{
  const ui={blocks:[{type:"evidence",title:"Audit evidence",items:[{label:"Task updated",reference:audit}]}]};const m=await mount(view({ui}));
  try{assert.ok(!content().includes(audit));await act(async()=>document.querySelector("button.jd-viz-expand").click());assert.ok(content().includes(audit));}
  finally{await m.cleanup();}
});
test("mounted hook/card integrates read → start → complete → remount/readback with a synthetic server",async()=>{
  let status="queued";const calls=[];const client={functions:{invoke:async(_,request)=>{
    calls.push(request.body);if(request.body.action==="operations.task.list")return{data:{tasks:[task(status)]}};
    status=request.body.status;return{data:{task:task(status),auditRecorded:true,auditId:audit}};
  }}};
  const m=await mount(React.createElement(Harness,{client}));
  try{assert.ok(!check().disabled);await act(async()=>check().click());assert.match(content(),/In progress/);assert.match(content(),/Status saved with audit evidence/);
    await act(async()=>check().click());assert.match(content(),/Record complete/);assert.match(content(),/not verified external execution or approval/);
    await m.render(React.createElement(Harness,{client,key:"remount"}));assert.match(content(),/Record complete/);assert.ok(check().disabled);assert.doesNotMatch(content(),/Status saved with audit evidence/);
    assert.deepEqual(calls.map(c=>c.action),["operations.task.list","operations.task.transition","operations.task.transition","operations.task.list"]);
  }finally{await m.cleanup();}
});
test("repeated mounted cards share a synchronous pending lock and no optimistic completion",async()=>{
  const wait=deferred();let writes=0;const client={functions:{invoke:async(_,request)=>request.body.action==="operations.task.list"?{data:{tasks:[task("in_progress")]}}:(writes++,wait.promise)}};
  const m=await mount(React.createElement(Harness,{client,copies:2}));
  try{await act(async()=>{const buttons=document.querySelectorAll("button.jd-viz-check");buttons[0].click();buttons[1].click();});
    assert.equal(writes,1);assert.ok([...document.querySelectorAll("button.jd-viz-check")].every(b=>b.disabled));assert.doesNotMatch(content(),/Record complete/);assert.match(content(),/Saving record status/);
    await act(async()=>wait.resolve({data:{task:task("completed"),auditRecorded:true,auditId:audit}}));assert.equal(document.querySelectorAll(".jd-viz-status.good").length,2);
  }finally{await m.cleanup();}
});
test("unconfirmed write blocks mounted retry until explicit read-only refresh reconciles status",async()=>{
  let writes=0,status="in_progress";const client={functions:{invoke:async(_,request)=>{
    if(request.body.action==="operations.task.list")return{data:{tasks:[task(status)]}};
    writes++;status="completed";return{data:{task:task(status)}}; // Lost atomic audit acknowledgement.
  }}};
  const m=await mount(React.createElement(Harness,{client}));
  try{await act(async()=>check().click());assert.ok(check().disabled);assert.match(content(),/Update not confirmed/);assert.doesNotMatch(content(),/Record complete/);
    await act(async()=>check().click());assert.equal(writes,1);await act(async()=>document.querySelector("#refresh").click());assert.match(content(),/Record complete/);assert.equal(writes,1);
  }finally{await m.cleanup();}
});
test("account/conversation scope changes discard late reads from the previous scope",async()=>{
  const old=deferred();let reads=0;const client={functions:{invoke:async()=>++reads===1?old.promise:{data:{tasks:[]}}}};
  const m=await mount(React.createElement(Harness,{client}));
  try{await m.render(React.createElement(Harness,{client,scope:"org-b:user-b:conversation-b"}));await act(async()=>old.resolve({data:{tasks:[task("completed")]}}));assert.match(content(),/Unverified snapshot/);assert.doesNotMatch(content(),/Record complete/);assert.ok(check().disabled);}
  finally{await m.cleanup();}
});
test("StrictMode replay still leaves mounted task records usable",async()=>{
  const client={functions:{invoke:async()=>({data:{tasks:[task()]}})}};
  const m=await mount(React.createElement(React.StrictMode,null,React.createElement(Harness,{client})));
  try{assert.ok(!check().disabled);assert.match(content(),/Saved record — refreshed/);}finally{await m.cleanup();}
});
test("chat wiring keys local state by account/workspace/conversation and offers read reconciliation",()=>{
  const source=readFileSync(new URL("../src/chat/ChatHome.jsx",import.meta.url),"utf8");
  assert.match(source,/savedTaskKey\(messages\)/);assert.match(source,/JSON.stringify\(\[organizationId,user\?\._authUserId\|\|user\?\.id,user\?\.role,conversationId\]\)/);
  const shell=readFileSync(new URL("../src/AppDemo.jsx",import.meta.url),"utf8");
  assert.match(shell,/<ChatHome key=\{JSON.stringify\(\[selectedSchool\?\.id,user\?\._authUserId\|\|user\?\.id,user\?\.role\]\)\}/);
  assert.match(shell,/organizationId=\{selectedSchool\?\.id\}/);
  assert.match(source,/key=\{taskScope\+":"\+index\}/);assert.match(source,/onClick=\{taskRecords.refresh\}/);
  assert.match(source,/onTaskToggle=\{taskRecords.transition\} taskRecords=\{taskRecords.state\} taskRole=\{user\?\.role\}/);
});
