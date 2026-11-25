import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {transformWithOxc} from 'vite';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {Simulate} from 'react-dom/test-utils';
import {buildSaasAgentTeam} from '../supabase/functions/_shared/jd-agent-architect.mjs';
const cache=resolve('node_modules/.cache');mkdirSync(cache,{recursive:true});const temp=mkdtempSync(`${cache}/jd-agent-ui-`);after(()=>rmSync(temp,{recursive:true,force:true}));
let source=readFileSync('src/software-factory/SaaSAgentStudio.jsx','utf8').replace("import './agent-studio.css';",'').replace("'./agent-design-client.mjs'",JSON.stringify(new URL('../src/software-factory/agent-design-client.mjs',import.meta.url).href));
writeFileSync(`${temp}/studio.mjs`,(await transformWithOxc(source,'studio.jsx',{jsx:{runtime:'classic'}})).code);const {SaaSAgentStudio}=await import(pathToFileURL(`${temp}/studio.mjs`));
let page=readFileSync('src/pages/jd-operations.jsx','utf8').replace('import {supabase} from "../supabaseClient.js";','const supabase=null;').replace('"../software-factory/SaaSAgentStudio.jsx"',JSON.stringify(pathToFileURL(`${temp}/studio.mjs`).href)).replace('"../config/workspace-navigation.mjs"',JSON.stringify(new URL('../src/config/workspace-navigation.mjs',import.meta.url).href)).replace('import {Figure, PageHeader} from "../components/page-furniture.jsx";','const Figure=()=>null; const PageHeader=()=>null;')
for(const name of ['BusinessFoundation','JDExecutionMonitor','JDTaskQueue','JDWorkflowStudio','JDRecurringSchedules','JDDepartmentCollaboration','JDBusinessPlatform'])page=page.replace(new RegExp(`import \\{${name}\\} from [^;]+;`),`const ${name}=()=>null;`);
writeFileSync(`${temp}/page.mjs`,(await transformWithOxc(page,'page.jsx',{jsx:{runtime:'classic'}})).code);const {JDOperationsPage}=await import(pathToFileURL(`${temp}/page.mjs`));
const defer=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};
async function mount({handler=body=>({data:{design:buildSaasAgentTeam(body.project)}}),role='owner',page=false}={}){
 const calls=[],client={functions:{invoke:async(_,r)=>{calls.push(r.body);return handler(r.body);}}};
 const dom=new JSDOM('<!doctype html><div id="root"></div>');globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const root=createRoot(document.querySelector('#root'));
 const render=async extra=>act(async()=>root.render(page?React.createElement(JDOperationsPage,{client,ctx:{role,user:{id:'actor',school_id:'tenant'}}}):React.createElement(SaaSAgentStudio,{client,role,scopeKey:'tenant:actor',...extra})));
 await render();return{calls,render,cleanup:async()=>{await act(async()=>root.unmount());dom.window.close();delete globalThis.window;delete globalThis.document;delete globalThis.IS_REACT_ACT_ENVIRONMENT;}};
}
const text=()=>document.querySelector('#root').textContent;
const button=label=>[...document.querySelectorAll('button')].find(b=>b.textContent===label);
const change=async(el,value)=>act(async()=>Simulate.change(el,{target:{value}}));
async function fill(){await change(document.querySelector('input:not([type=checkbox])'),'Synthetic SaaS');await change(document.querySelector('textarea'),'Inventory for independent stores with tenant isolation.');}
const submit=async()=>act(async()=>Simulate.submit(document.querySelector('form')));
test('preview and per-agent edits are local, truthful, and discarded on requirements change',async()=>{
 const m=await mount();try{await fill();await submit();assert.equal(m.calls.length,1);assert.match(text(),/8 proposed agent definitions/);assert.match(text(),/0 authorised tools/);assert.match(text(),/Not run/);
 const note=document.querySelector('article textarea');await change(note,'Keep the prototype accessible. ');assert.equal(document.querySelector('article textarea').value,'Keep the prototype accessible. ');assert.equal(m.calls.length,1);assert.match(text(),/edited locally/);
 await change(document.querySelector('input:not([type=checkbox])'),'Another SaaS');assert.equal(document.querySelectorAll('article').length,0);assert.equal(button('Export design JSON'),undefined);
 }finally{await m.cleanup();}
});
test('invalid architecture never reaches backend',async()=>{const m=await mount();try{await fill();await act(async()=>Simulate.change(document.querySelector('input[type=checkbox]'),{target:{checked:false}}));await submit();assert.equal(m.calls.length,0);assert.match(text(),/require a backend/);}finally{await m.cleanup();}});
test('credential-like agent note is rejected without crashing or changing definition',async()=>{const m=await mount();try{await fill();await submit();await change(document.querySelector('article textarea'),'ghp_abcdefghijklmnopqrstuvwx');assert.equal(document.querySelector('article textarea').value,'');assert.match(text(),/Remove credentials/);}finally{await m.cleanup();}});
test('duplicate submissions lock; delayed previous-scope response never appears in new scope',async()=>{
 const wait=defer(),m=await mount({handler:()=>wait.promise});try{await fill();await act(async()=>{Simulate.submit(document.querySelector('form'));Simulate.submit(document.querySelector('form'));});assert.equal(m.calls.length,1);assert.ok(document.querySelector('fieldset').disabled);
 await m.render({scopeKey:'tenant-b:actor'});await act(async()=>wait.resolve({data:{design:buildSaasAgentTeam(m.calls[0].project)}}));assert.equal(document.querySelector('input:not([type=checkbox])').value,'');assert.equal(document.querySelectorAll('article').length,0);
 }finally{await m.cleanup();}
});
test('role downgrade removes unsaved data and controls',async()=>{const m=await mount();try{await fill();await submit();await m.render({role:'staff'});assert.equal(document.querySelector('form'),null);assert.doesNotMatch(text(),/Synthetic SaaS/);await m.render({role:'owner'});assert.equal(document.querySelector('input:not([type=checkbox])').value,'');}finally{await m.cleanup();}});
test('backend failure gives no local success fallback or export',async()=>{const m=await mount({handler:()=>({error:{message:'PRIVATE'}})});try{await fill();await submit();assert.match(text(),/backend may need a reviewed update/);assert.doesNotMatch(text(),/PRIVATE/);assert.equal(button('Export design JSON'),undefined);}finally{await m.cleanup();}});
test('non-admin cannot open studio directly',async()=>{const m=await mount({role:'manager'});try{assert.equal(document.querySelector('form'),null);assert.equal(m.calls.length,0);}finally{await m.cleanup();}});
test('operations studio is reachable while overview calls are still loading',async()=>{
 const wait=defer(),m=await mount({page:true,handler:()=>wait.promise});try{assert.ok(button('Build'));await act(async()=>button('Build').click());assert.ok(button('SaaS Agents'));await act(async()=>button('SaaS Agents').click());assert.match(text(),/Definitions, not running agents/);assert.ok(document.querySelector('form'));}finally{await m.cleanup();}
});
test('operations navigation does not expose studio to manager',async()=>{const m=await mount({page:true,role:'manager',handler:()=>({data:{}})});try{assert.equal(button('SaaS Agents'),undefined);}finally{await m.cleanup();}});
