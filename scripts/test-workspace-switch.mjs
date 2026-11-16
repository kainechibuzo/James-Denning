import test, {after} from "node:test";
import assert from "node:assert/strict";
import {readFileSync,mkdirSync,mkdtempSync,writeFileSync,rmSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
import {transformWithOxc} from "vite";
import {JSDOM} from "jsdom";
import React, {act} from "react";
import {createRoot} from "react-dom/client";
import {signOutForWorkspaceSwitch} from "../src/utils/switch-workspace.mjs";

function dependencies(signOut){
  const events=[];
  return {events,args:{signOut:async options=>{events.push(["signOut",options]);return signOut();},
    clearSession:()=>events.push("session"),clearWorkspace:()=>events.push("workspace"),resetContext:()=>events.push("context"),leave:()=>events.push("leave")}};
}
test("switch clears local identity and workspace only after acknowledged local signout",async()=>{
  const {events,args}=dependencies(()=>({error:null}));await signOutForWorkspaceSwitch(args);
  assert.deepEqual(events,[["signOut",{scope:"local"}],"session","workspace","context","leave"]);
});
for(const failure of ["returned error","thrown error","missing acknowledgement"]){
  test(`switch fails closed on ${failure}`,async()=>{
    const {events,args}=dependencies(()=>{if(failure==="thrown error")throw Error("offline");return failure==="returned error"?{error:Error("offline")}:undefined;});
    await assert.rejects(signOutForWorkspaceSwitch(args));assert.deepEqual(events,[["signOut",{scope:"local"}]]);
  });
}
test("no clearing while signout is pending",async()=>{
  let finish;const {events,args}=dependencies(()=>new Promise(resolve=>{finish=resolve;}));
  const pending=signOutForWorkspaceSwitch(args);assert.equal(events.length,1);
  finish({error:null});await pending;assert.equal(events.at(-1),"leave");
});

// Compile and mount the real JSX dialog, not a hand-written DOM replica.
// Reuse Vite's installed transformer; no new production/test dependency.
const cache=resolve("node_modules/.cache");mkdirSync(cache,{recursive:true});
const temp=mkdtempSync(`${cache}/jd-dialog-`);after(()=>rmSync(temp,{recursive:true,force:true}));
const source=readFileSync(new URL("../src/components/workspace-switch-dialog.jsx",import.meta.url),"utf8")
  .replace('"./mobile-navigation.mjs"',JSON.stringify(new URL("../src/components/mobile-navigation.mjs",import.meta.url).href));
const compiled=await transformWithOxc(source,"workspace-switch-dialog.jsx",{jsx:{runtime:"classic"}});
const moduleFile=`${temp}/dialog.mjs`;writeFileSync(moduleFile,compiled.code);
const {WorkspaceSwitchDialog}=await import(pathToFileURL(moduleFile));

async function mount(onSwitch=async()=>{}){
  const dom=new JSDOM('<!doctype html><body style="overflow:auto"><button id="trigger">Switch</button><div id="root"></div></body>');
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  const trigger=document.querySelector("#trigger");trigger.focus();
  let closes=0;const root=createRoot(document.querySelector("#root"));
  await act(async()=>root.render(React.createElement(WorkspaceSwitchDialog,{organisation:'<img src=x onerror="bad()">',onClose:()=>{closes++;},onSwitch,returnFocus:trigger})));
  const dialog=document.querySelector('[role="dialog"]');
  const buttons=[...dialog.querySelectorAll("button")];
  const key=(target,key,shiftKey=false)=>target.dispatchEvent(new dom.window.KeyboardEvent("keydown",{key,shiftKey,bubbles:true,cancelable:true}));
  return {dom,dialog,buttons,trigger,key,closes:()=>closes,cleanup:async()=>{await act(async()=>root.unmount());dom.window.close();delete globalThis.window;delete globalThis.document;delete globalThis.IS_REACT_ACT_ENVIRONMENT;},unmount:async()=>act(async()=>root.unmount())};
}
test("mounted dialog names/describes intent, escapes organisation text and focuses safe cancel",async()=>{
  const m=await mount();try{
    assert.equal(m.dialog.getAttribute("aria-modal"),"true");
    assert.equal(document.getElementById(m.dialog.getAttribute("aria-labelledby")).textContent,"Switch organisation");
    assert.match(document.getElementById(m.dialog.getAttribute("aria-describedby")).textContent,/Save any unsaved work/);
    assert.match(m.dialog.textContent,/does not grant access/);assert.equal(m.dialog.querySelector("img"),null);
    assert.equal(document.activeElement,m.buttons[0]);assert.equal(document.body.style.overflow,"hidden");
  }finally{await m.cleanup();}
});
test("mounted dialog wraps keyboard focus, Escape/cancel have no signout side effects",async()=>{
  let calls=0;const m=await mount(async()=>{calls++;});try{
    m.key(m.buttons[0],"Tab",true);assert.equal(document.activeElement,m.buttons[1]);
    m.key(m.buttons[1],"Tab");assert.equal(document.activeElement,m.buttons[0]);
    await act(async()=>m.key(m.buttons[0],"Escape"));assert.equal(m.closes(),1);assert.equal(document.activeElement,m.trigger);
    await act(async()=>m.buttons[0].click());assert.equal(m.closes(),2);assert.equal(calls,0);
  }finally{await m.cleanup();}
});
test("mounted dialog prevents duplicate submission and closing during signout",async()=>{
  let finish,calls=0;const m=await mount(()=>{calls++;return new Promise(resolve=>{finish=resolve;});});try{
    await act(async()=>{m.buttons[1].click();m.buttons[1].click();});
    assert.equal(calls,1);assert.ok(m.buttons.every(b=>b.disabled));assert.equal(m.dialog.getAttribute("aria-busy"),"true");
    await act(async()=>m.key(m.dialog,"Escape"));assert.equal(m.closes(),0);
    await act(async()=>finish());assert.ok(m.buttons.every(b=>!b.disabled));
  }finally{await m.cleanup();}
});
test("mounted dialog reports failure without raw error details and allows retry",async()=>{
  let calls=0;const m=await mount(async()=>{calls++;if(calls===1)throw Error("private server details");});try{
    await act(async()=>m.buttons[1].click());assert.match(m.dialog.querySelector('[role="alert"]').textContent,/Could not sign out safely/);
    assert.doesNotMatch(m.dialog.textContent,/private server details/);assert.equal(m.closes(),0);
    await act(async()=>m.buttons[1].click());assert.equal(calls,2);assert.equal(m.dialog.querySelector('[role="alert"]'),null);
  }finally{await m.cleanup();}
});
test("unmount restores focus and pre-existing scroll style",async()=>{
  const m=await mount();try{await m.unmount();assert.equal(document.activeElement,m.trigger);assert.equal(document.body.style.overflow,"auto");assert.equal(document.querySelector('[role="dialog"]'),null);}
  finally{await m.cleanup();}
});
