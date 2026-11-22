import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {transformWithOxc} from 'vite';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
const cache=resolve('node_modules/.cache');mkdirSync(cache,{recursive:true});const temp=mkdtempSync(`${cache}/jd-runs-`);after(()=>rmSync(temp,{recursive:true,force:true}));
const source=readFileSync('src/chat/RunMonitor.jsx','utf8').replace('import {supabase} from "../supabaseClient.js";','const supabase=null;').replace('"./run-history.mjs"',JSON.stringify(new URL('../src/chat/run-history.mjs',import.meta.url).href));
writeFileSync(`${temp}/monitor.mjs`,(await transformWithOxc(source,'RunMonitor.jsx',{jsx:{runtime:'classic'}})).code);const {RunMonitor}=await import(pathToFileURL(`${temp}/monitor.mjs`));
const id='00000000-0000-4000-8000-000000000001',step='00000000-0000-4000-8000-000000000002';
const run=(title='Synthetic request')=>({id,status:'queued',request_preview:title,steps:[{id:step,status:'pending',tool_key:'unknown'}]});
const response=(...runs)=>({data:{runs}});
const defer=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};
async function mount(handler){
 const dom=new JSDOM('<!doctype html><div id="root"></div>');globalThis.document=dom.window.document;globalThis.window=dom.window;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const root=createRoot(document.querySelector('#root'));const client={functions:{invoke:handler}};
 await act(async()=>root.render(React.createElement(RunMonitor,{client})));
 return{cleanup:async()=>{await act(async()=>root.unmount());dom.window.close();delete globalThis.document;delete globalThis.window;delete globalThis.IS_REACT_ACT_ENVIRONMENT;}};
}
const text=()=>document.querySelector('#root').textContent;
test('mounted monitor never labels pending unknown work completed and separates record completion from outcome',async()=>{
 const m=await mount(async()=>response(run()));try{
 await act(async()=>document.querySelector('.jd-runs-card-head').click());assert.match(text(),/description unavailable/);assert.match(text(),/Pending/);assert.doesNotMatch(text(),/Completed a workspace task/);assert.match(text(),/not independent verification/);
 }finally{await m.cleanup();}
});
test('failed refresh clears old records and shows unavailability, not successful empty history or raw diagnostics',async()=>{
 let fail=false;const m=await mount(async()=>fail?{error:{message:'PRIVATE_TOKEN'}}:response(run('Old record')));try{
 assert.match(text(),/Old record/);fail=true;await act(async()=>document.querySelector('[aria-label="Refresh runs"]').click());assert.doesNotMatch(text(),/Old record|PRIVATE_TOKEN|No automation runs were returned/);assert.match(text(),/Run history is unavailable/);
 }finally{await m.cleanup();}
});
test('late older response cannot replace newer refreshed records',async()=>{
 const slow=defer();let calls=0;const m=await mount(()=>++calls===1?slow.promise:Promise.resolve(response(run('Latest record'))));try{
 await act(async()=>document.querySelector('[aria-label="Refresh runs"]').click());await act(async()=>slow.resolve(response(run('Stale record'))));assert.match(text(),/Latest record/);assert.doesNotMatch(text(),/Stale record/);
 }finally{await m.cleanup();}
});
test('body error is unavailable rather than empty success and malformed records do not crash UI',async()=>{
 for(const result of [{data:{error:'PRIVATE_TOKEN'}},{data:{runs:[{}]}}]){const m=await mount(async()=>result);try{assert.match(text(),/Run history is unavailable/);assert.doesNotMatch(text(),/PRIVATE_TOKEN|No automation runs were returned/);}finally{await m.cleanup();}}
});
test('genuine empty response states only what the bounded read returned',async()=>{
 const m=await mount(async()=>response());try{assert.match(text(),/No automation runs were returned for this workspace/);assert.doesNotMatch(text(),/No automation runs have been recorded/);}finally{await m.cleanup();}
});
test('workforce cards show the recorded skill reference without instruction text',async()=>{
 const workforce=[{agent_ref:'builtin:finance_analyst',name:'Finance Analyst',source:'builtin',status:'report_returned',tools_granted:['get_billing_snapshot'],skill:{name:'xlsx',version:1},verification:'pending_jd_verification',report_returned:true},
  {agent_ref:'builtin:operations_manager',name:'Operations Manager',source:'builtin',status:'report_returned',tools_granted:[],skill:null,verification:'pending_jd_verification',report_returned:true}];
 const deployed=()=>({id:step,status:'completed',tool_key:'deploy_specialist_workforce',workforce});
 const m=await mount(async()=>response({id,status:'completed',request_preview:'Deploy specialists with a published skill',steps:[deployed()]}));try{
  await act(async()=>document.querySelector('.jd-runs-card-head').click());
  assert.match(text(),/Skill: xlsx v1/);
  assert.match(text(),/Operations Manager/);
  assert.doesNotMatch(text(),/untrusted|REFERENCE SKILL|instructions/);
 }finally{await m.cleanup();}
});
