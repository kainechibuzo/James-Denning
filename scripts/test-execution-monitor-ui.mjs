import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {transformWithOxc} from 'vite';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
const cache=resolve('node_modules/.cache');mkdirSync(cache,{recursive:true});const temp=mkdtempSync(`${cache}/jd-monitor-ui-`);after(()=>rmSync(temp,{recursive:true,force:true}));
let source=readFileSync('src/chat/JDExecutionMonitor.jsx','utf8');for(const file of ['execution-monitor.mjs','run-history.mjs'])source=source.replace(`'./${file}'`,JSON.stringify(new URL(`../src/chat/${file}`,import.meta.url).href));
writeFileSync(`${temp}/monitor.mjs`,(await transformWithOxc(source,'monitor.jsx',{jsx:{runtime:'classic'}})).code);const {JDExecutionMonitor}=await import(pathToFileURL(`${temp}/monitor.mjs`));
writeFileSync(`${temp}/furniture.mjs`,(await transformWithOxc(readFileSync('src/components/page-furniture.jsx','utf8'),'furniture.jsx',{jsx:{runtime:'classic'}})).code);
let page=readFileSync('src/pages/jd-operations.jsx','utf8').replace('import {supabase} from "../supabaseClient.js";','const supabase=null;').replace('"../chat/JDExecutionMonitor.jsx"',JSON.stringify(pathToFileURL(`${temp}/monitor.mjs`).href)).replace('"../config/workspace-navigation.mjs"',JSON.stringify(new URL('../src/config/workspace-navigation.mjs',import.meta.url).href));
page=page.replace('"../components/page-furniture.jsx"',JSON.stringify(pathToFileURL(`${temp}/furniture.mjs`).href));
for(const name of ['BusinessFoundation','SaaSAgentStudio','JDTaskQueue','JDWorkflowStudio','JDRecurringSchedules','JDDepartmentCollaboration','JDBusinessPlatform'])page=page.replace(new RegExp(`import \\{${name}\\} from [^;]+;`),`const ${name}=()=>null;`);
writeFileSync(`${temp}/page.mjs`,(await transformWithOxc(page,'page.jsx',{jsx:{runtime:'classic'}})).code);const {JDOperationsPage}=await import(pathToFileURL(`${temp}/page.mjs`));
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const jobId=id(2),runId=id(1);
const data=(status='failed',runStatus=status)=>({runs:[{id:runId,status:runStatus,request_text:'Synthetic dispatch review'}],jobs:[{id:jobId,run_id:runId,status,attempt_count:5,max_attempts:5,last_error_message:'PRIVATE_DIAGNOSTIC'}],steps:[{id:id(3),run_id:runId,status:'pending',tool_key:'unknown',error_message:'PRIVATE_DIAGNOSTIC'}]});
const ack=()=>({data:{job:{job_id:jobId,run_id:runId,status:'queued',queue_message_id:4}}});
const defer=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};
function fixture(handler){const calls=[];const client={functions:{invoke:async(_,request)=>{calls.push(request.body);return handler(request.body);}}};return{calls,client};}
async function mount(f,{role='owner',page=false,...props}={}){
 const dom=new JSDOM('<!doctype html><div id="root"></div>');globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const root=createRoot(document.querySelector('#root'));const render=async extra=>act(async()=>root.render(page?React.createElement(JDOperationsPage,{client:f.client,ctx:{role,user:{id:id(4),school_id:id(5)},selectedSchool:{id:id(5)}}}):React.createElement(JDExecutionMonitor,{client:f.client,role,scopeKey:'tenant-actor',...props,...extra})));
 await render();return{render,cleanup:async()=>{await act(async()=>root.unmount());dom.window.close();delete globalThis.window;delete globalThis.document;delete globalThis.IS_REACT_ACT_ENVIRONMENT;}};
}
const text=()=>document.querySelector('#root').textContent;
const button=label=>[...document.querySelectorAll('button')].find(b=>b.textContent===label);
const click=async label=>act(async()=>button(label).click());
test('mounted monitor hides raw diagnostics and uses neutral tool labels with diagnostic IDs collapsed',async()=>{
 const f=fixture(()=>({data:data()}));const m=await mount(f);try{assert.doesNotMatch(text(),/PRIVATE_DIAGNOSTIC|Completed a workspace task/);assert.match(text(),/Pending/);assert.match(text(),/not independently verified/);assert.equal(document.querySelector('details').open,false);}finally{await m.cleanup();}
});
test('retry requires explicit confirmation, locks double-clicks and observes advanced persisted state',async()=>{
 const wait=defer();let status='failed';const f=fixture(b=>b.action==='execution.monitor.list'?{data:data(status)}:wait.promise);const m=await mount(f);try{
 await click('Review retry');assert.match(text(),/repeat external effects/);assert.equal(f.calls.length,1);await act(async()=>{button('Confirm retry').click();button('Confirm retry')?.click();});assert.equal(f.calls.filter(c=>c.action==='execution.job.retry').length,1);assert.ok(button('Review retry').disabled);status='running';await act(async()=>wait.resolve(ack()));assert.match(text(),/Retry request acknowledged/);assert.match(text(),/Current job state: running/);assert.equal(button('Review retry'),undefined);
 }finally{await m.cleanup();}
});
test('declining confirmation sends no write',async()=>{
 const f=fixture(()=>({data:data()}));const m=await mount(f);try{await click('Review retry');await click('Keep unchanged');assert.equal(f.calls.length,1);assert.equal(button('Confirm retry'),undefined);}finally{await m.cleanup();}
});
test('manager sees history without retry or cancellation controls',async()=>{
 const f=fixture(()=>({data:data('queued')}));const m=await mount(f,{role:'manager'});try{assert.match(text(),/Synthetic dispatch review/);assert.equal(button('Review retry'),undefined);assert.equal(button('Review cancellation'),undefined);}finally{await m.cleanup();}
});
test('lost acknowledgement blocks another write until explicit refresh and never renders success',async()=>{
 let status='failed';const f=fixture(b=>{if(b.action==='execution.monitor.list')return{data:data(status)};status='queued';return{data:{}};});const m=await mount(f);try{
 await click('Review retry');await click('Confirm retry');assert.match(text(),/acknowledgement was incomplete/);assert.ok(button('Review retry').disabled);assert.doesNotMatch(text(),/Retry request acknowledged/);await click('Refresh execution records');assert.equal(button('Review retry'),undefined);assert.ok(button('Review cancellation'));assert.equal(f.calls.filter(c=>c.action==='execution.job.retry').length,1);
 }finally{await m.cleanup();}
});
test('cancellation summary mismatch is shown as unconfirmed, not successful cancellation',async()=>{
 let changed=false;const f=fixture(b=>b.action==='execution.monitor.list'?{data:changed?data('cancelled','queued'):data('queued')}:(changed=true,{data:{job:{id:jobId,status:'cancelled'}}}));const m=await mount(f);try{await click('Review cancellation');assert.match(text(),/does not undo/);await click('Confirm cancellation');assert.match(text(),/records do not agree/);assert.doesNotMatch(text(),/Cancellation confirmed/);}finally{await m.cleanup();}
});
test('account scope replacement ignores a late acknowledgement and resets confirmation',async()=>{
 const wait=defer();const f=fixture(b=>b.action==='execution.monitor.list'?{data:data()}:wait.promise);const m=await mount(f);try{await click('Review retry');await click('Confirm retry');await m.render({scopeKey:'another-actor'});await act(async()=>wait.resolve(ack()));assert.doesNotMatch(text(),/Retry request acknowledged/);assert.equal(f.calls.filter(b=>b.action==='execution.job.retry').length,1);}finally{await m.cleanup();}
});
function overview(body){if(body.action==='operations.task.list')return{data:{tasks:[]}};if(body.action==='operations.team.list')return{data:{members:[]}};if(body.action==='intelligence.snapshot')return{data:{}};if(body.action==='capabilities.report')return{data:{capabilities:[]}};if(body.action==='organisation.blueprints.list')return{data:{blueprints:[]}};if(body.action==='hiring.pipeline.list')return{data:{requisitions:[],candidates:[]}};return null;}
for(const role of ['owner','admin','manager'])test(`${role}: real operations page uses explicit role capabilities`,async()=>{
 const f=fixture(body=>overview(body)||{data:data()});const m=await mount(f,{role,page:true});try{assert.ok(button('Operations'));assert.ok(button('JD Runs'));assert.equal(!!button('Hiring'),role!=='manager');assert.equal(f.calls.some(b=>b.action==='hiring.pipeline.list'),role!=='manager');assert.equal(f.calls.some(b=>b.action==='execution.monitor.list'),false);await click('JD Runs');assert.match(text(),/Synthetic dispatch review/);}finally{await m.cleanup();}
});
test('forbidden role mounted directly cannot load operations records',async()=>{
 const f=fixture(()=>assert.fail('request'));const m=await mount(f,{role:'staff',page:true});try{assert.match(text(),/cannot open Business operations/);assert.equal(f.calls.length,0);}finally{await m.cleanup();}
});
test('operations tab switches and header refresh preserve pending execution lock',async()=>{
 const wait=defer();let status='failed';const f=fixture(body=>overview(body)||(body.action==='execution.monitor.list'?{data:data(status)}:wait.promise));const m=await mount(f,{page:true});try{
 await click('JD Runs');await click('Review retry');await click('Confirm retry');await click('Overview');await click('Refresh data');await click('JD Runs');assert.ok(button('Review retry').disabled);assert.equal(f.calls.filter(b=>b.action==='execution.job.retry').length,1);status='queued';await act(async()=>wait.resolve(ack()));assert.match(text(),/Retry request acknowledged/);
 }finally{await m.cleanup();}
});
test('failed job paired with awaiting-approval run shows discrepancy without retry controls',async()=>{
 const f=fixture(()=>({data:data('failed','awaiting_approval')}));const m=await mount(f);try{assert.match(text(),/states differ/);assert.equal(button('Review retry'),undefined);}finally{await m.cleanup();}
});
