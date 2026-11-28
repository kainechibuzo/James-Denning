// The workspace-wide Review Centre launcher is mounted from the shell header
// with no props. A regression there takes the whole workspace down with
// "pendingApprovalCount is not defined", which is exactly what happened when
// the launcher's state lived in AppInner's scope while the header markup was
// lifted into a Chromium fixture. These tests mount the component the way the
// header does: no client, no callbacks, a profileless user.
//
// The panel itself is exercised in Chromium (test:reference-layout and
// test:conversation-layout), where its layout and contrast are asserted too.
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
const temp=mkdtempSync(`${cache}/jd-approval-launcher-`);after(()=>{rmSync(temp,{recursive:true,force:true});});

// Load the component with its real relative imports, transpiled like the other
// UI tests. supabaseClient.js is replaced so no credentials or network are used.
const clientPath=resolve(temp,"supabase-client.mjs");
writeFileSync(clientPath,`export const supabase={functions:{invoke:async()=>({data:{approvals:[]},error:null})}};`);
const reviewSource=readFileSync(resolve("src/chat/ReviewCentre.jsx"),"utf8")
  .replace(/from "\.\.\/supabaseClient\.js"/g,`from ${JSON.stringify(pathToFileURL(clientPath).href)}`)
  .replace(/from "\.\/(settings-review\.mjs)"/g,(_,path)=>`from ${JSON.stringify(pathToFileURL(resolve("src/chat",path)).href)}`);
writeFileSync(resolve(temp,"ReviewCentre.mjs"),(await transformWithOxc(reviewSource,"ReviewCentre.jsx",{jsx:{runtime:"classic"}})).code);
const launcherSource=readFileSync(resolve("src/components/global-approval-launcher.jsx"),"utf8")
  .replace(/from "\.\.\/supabaseClient\.js"/g,`from ${JSON.stringify(pathToFileURL(clientPath).href)}`)
  .replace(/from "\.\.\/chat\/ReviewCentre\.jsx"/g,`from ${JSON.stringify(pathToFileURL(resolve(temp,"ReviewCentre.mjs")).href)}`);
writeFileSync(resolve(temp,"global-approval-launcher.mjs"),(await transformWithOxc(launcherSource,"global-approval-launcher.jsx",{jsx:{runtime:"classic"}})).code);
const {GlobalApprovalLauncher}=await import(pathToFileURL(resolve(temp,"global-approval-launcher.mjs")).href);

const launcher=props=>React.createElement(GlobalApprovalLauncher,props);
const button=label=>document.querySelector(`button[aria-label="${label}"]`);
function mount(){
  const dom=new JSDOM('<!doctype html><body><div id="root"></div></body>');
  globalThis.window=dom.window;globalThis.document=dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  const root=createRoot(document.querySelector("#root"));
  return{
    render:async element=>act(async()=>{root.render(element);}),
    // The launcher reads approvals in an effect; act() flushes the resolved
    // promise and the re-render without waiting on any real timer.
    settle:async()=>{await act(async()=>{});},
    cleanup:async()=>{await act(async()=>{root.unmount();});dom.window.close();delete globalThis.window;delete globalThis.document;delete globalThis.IS_REACT_ACT_ENVIRONMENT;},
  };
}

test("the launcher renders standalone, with no props, for the header",async()=>{
  const m=mount();
  try{
    await m.render(launcher());
    await m.settle();
    assert.ok(button("Open Review Centre"),"header renders a launcher without a pending count");
    assert.equal(button("Open Review Centre").getAttribute("title"),"Review Centre");
    assert.equal(document.querySelector("#root span"),null,"no badge is invented when nothing is pending");
    assert.doesNotMatch(document.querySelector("#root").innerHTML,/undefined|NaN/,"a missing user or client never leaks into the markup");
    assert.equal(document.querySelector(".jd-review")===null,true,"the panel stays closed until asked for");
  }finally{await m.cleanup();}
});

test("pending approvals badge and surface themselves, without inventing a count",async()=>{
  const approvals=[{id:"approval-a",status:"pending"},{id:"approval-b",status:"pending"},{id:"approval-c",status:"approved"}];
  const client={functions:{invoke:async(_name,{body})=>body.action==="approvals.list"?{data:{approvals},error:null}:{data:null,error:{message:"synthetic failure"}}}};
  const m=mount();
  try{
    await m.render(launcher({user:{id:"synthetic-owner",role:"owner"},client}));
    await m.settle();
    const badge=button("2 pending approvals");
    assert.ok(badge,"two pending approvals show as a count; approved records are not counted");
    assert.equal(badge.querySelector("span")?.textContent,"2");
    // Unseen pending work announces itself once, as this feature intends. The
    // panel is real UI, so compare its presence, never the DOM node itself.
    assert.equal(document.querySelector(".jd-review")!==null,true,"unseen pending approvals open the Review Centre");
    assert.match(document.querySelector(".jd-review").textContent,/pending review/);
  }finally{await m.cleanup();}
});

test("managers and viewers never poll approval records",async()=>{
  for(const role of ["manager","viewer","employee"]){
    const calls=[];
    const client={functions:{invoke:async(_name,{body})=>{calls.push(body.action);return {data:{approvals:[{id:"x",status:"pending"}]},error:null};}}};
    const m=mount();
    try{
      await m.render(launcher({user:{id:"synthetic-"+role,role},client}));
      await m.settle();
      assert.deepEqual(calls,[],role+" must not read approval records");
      assert.ok(button("Open Review Centre"),"a launcher is still offered, without a count");
    }finally{await m.cleanup();}
  }
});

test("a failed approval read leaves the count at zero instead of guessing",async()=>{
  const client={functions:{invoke:async()=>({data:null,error:{message:"synthetic failure"}})}};
  const m=mount();
  try{
    await m.render(launcher({user:{id:"synthetic-owner",role:"owner"},client}));
    await m.settle();
    assert.ok(button("Open Review Centre"));
    assert.equal(document.querySelector("#root span"),null,"no badge is invented from a failed read");
    assert.equal(document.querySelector(".jd-review")===null,true,"a failed read never opens the panel");
  }finally{await m.cleanup();}
});
