// Execution-authority UI flows for the versioned agent registry (JSDOM).
// Synthetic transport only; never an operational deployment.
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {transformWithOxc} from 'vite';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {Simulate} from 'react-dom/test-utils';
import {registryFixture} from './fixtures/agent-registry.mjs';
mkdirSync('node_modules/.cache',{recursive:true});const temp=mkdtempSync(`${process.cwd()}/node_modules/.cache/workforce-ui-`);after(()=>rmSync(temp,{recursive:true,force:true}));
const base=new URL('../src/software-factory/AgentRegistry.jsx',import.meta.url);const source=readFileSync(base,'utf8').replace(/from '([^']+)'/g,(all,path)=>path.startsWith('.')?`from '${new URL(path,base).href}'`:all);
writeFileSync(`${temp}/component.mjs`,(await transformWithOxc(source,'registry.jsx',{jsx:{runtime:'classic'}})).code);const {AgentRegistry}=await import(pathToFileURL(`${temp}/component.mjs`));
async function mount({role='owner'}={}){
 const fixture=registryFixture(),calls=[],client={functions:{invoke:async(_,r)=>{calls.push(r.body);return fixture.handler(r.body);}}};const dom=new JSDOM('<!doctype html><div id="root"></div>');globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const root=createRoot(document.querySelector('#root'));const render=extra=>act(async()=>root.render(React.createElement(AgentRegistry,{client,role,scopeKey:'tenant:actor',...extra})));await render();return{fixture,calls,render,cleanup:async()=>{await act(async()=>root.unmount());dom.window.close();delete globalThis.window;delete globalThis.document;delete globalThis.IS_REACT_ACT_ENVIRONMENT;}};
}
const button=label=>[...document.querySelectorAll('button')].find(b=>b.textContent===label),text=()=>document.querySelector('#root').textContent,field=name=>document.querySelector(`[aria-label="${name}"]`);
const click=label=>act(async()=>button(label).click());
async function loadSeeded(fixture){fixture.seedPublishedAgent();await click('Refresh saved agents');await click('Inventory Analyst · v1 · published');}
async function confirmExecution(note='Independent synthetic execution-authority review note.'){await act(async()=>Simulate.change(field('Review note'),{target:{value:note}}));await click('Confirm execution action');}

test('execution authority starts closed and publishes the governance boundary',async()=>{
 const m=await mount();try{
  await loadSeeded(m.fixture);
  assert.match(text(),/Publication is not deployment authority/);
  assert.match(text(),/Execution authority: Not granted/);
  assert.equal(button('Request execution-authority review').disabled,false);
  for(const label of ['Approve execution review','Reject execution review','Grant execution authority','Revoke execution authority'])assert.equal(button(label).disabled,true,label);
 }finally{await m.cleanup();}
});

test('request, independent decision and grant flow records bounded read-only authority',async()=>{
 const m=await mount();try{
  await loadSeeded(m.fixture);
  const before=m.calls.length;
  await click('Request execution-authority review');
  assert.equal(m.calls.length,before,'nothing is sent before explicit confirmation');
  assert.equal(button('Confirm execution action').disabled,true,'an explicit note is required');
  await confirmExecution();
  assert.equal(m.calls.at(-1).action,'registry.execution.request_grant');
  assert.match(text(),/Execution-authority decision recorded and read back/);
  assert.match(text(),/Execution review: pending/);
  assert.equal(button('Request execution-authority review').disabled,false,'a fresh review supersedes a pending one, mirroring publication');
  assert.equal(button('Approve execution review').disabled,false);
  await click('Approve execution review');await confirmExecution();
  assert.equal(m.calls.at(-1).action,'registry.execution.approve');
  assert.equal(button('Grant execution authority').disabled,false);
  assert.equal(button('Revoke execution authority').disabled,true);
  await click('Grant execution authority');await confirmExecution();
  assert.equal(m.calls.at(-1).action,'registry.execution.grant');
  assert.match(text(),/Granted for saved version 1/);
  assert.equal(button('Revoke execution authority').disabled,false);
  assert.equal(button('Request execution-authority review').disabled,true);
  await click('Revoke execution authority');await confirmExecution('Revoke authority pending a new evaluation.');
  assert.equal(m.calls.at(-1).action,'registry.execution.revoke');
  assert.match(text(),/Execution authority: Not granted/);
 }finally{await m.cleanup();}
});

test('rejecting an execution review keeps authority closed',async()=>{
 const m=await mount();try{
  await loadSeeded(m.fixture);
  await click('Request execution-authority review');await confirmExecution();
  await click('Reject execution review');await confirmExecution();
  assert.equal(m.calls.at(-1).action,'registry.execution.reject');
  assert.match(text(),/Execution authority: Not granted/);
  for(const label of ['Approve execution review','Reject execution review','Grant execution authority','Revoke execution authority'])assert.equal(button(label).disabled,true,label);
 }finally{await m.cleanup();}
});

test('draft definitions can never request deployment authority',async()=>{
 const m=await mount();try{
  await click('Save agent draft');
  assert.match(text(),/Immutable draft saved/);
  assert.equal(button('Request execution-authority review').disabled,true);
  assert.match(text(),/Execution authority: Not granted/);
  assert.equal(m.calls.at(-1).action,'registry.save');
 }finally{await m.cleanup();}
});

test('unsaved edits lock execution controls like publication controls',async()=>{
 const m=await mount();try{
  await loadSeeded(m.fixture);
  await act(async()=>Simulate.change(field('Agent name'),{target:{value:'Revised inventory analyst'}}));
  assert.match(text(),/Unsaved changes/);
  for(const label of ['Request execution-authority review','Approve execution review','Revoke execution authority'])assert.equal(button(label).disabled,true,label);
 }finally{await m.cleanup();}
});

test('failed registry responses never display success or private diagnostics',async()=>{
 const m=await mount();try{
  await loadSeeded(m.fixture);
  const before=m.calls.length;
  m.fixture.setFail(true);
  await click('Request execution-authority review');await confirmExecution();
  assert.equal(m.calls.length,before+1,'the confirmed action reached the transport');
  assert.match(text(),/not confirmed/);
  assert.doesNotMatch(text(),/SYNTHETIC_PRIVATE_DIAGNOSTIC|Execution-authority decision recorded/);
 }finally{await m.cleanup();}
});
