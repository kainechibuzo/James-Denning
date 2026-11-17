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
import {businessBlueprint} from '../supabase/functions/_shared/jd-business-foundation.mjs';
const cache=resolve('node_modules/.cache');mkdirSync(cache,{recursive:true});const temp=mkdtempSync(`${cache}/foundation-ui-`);after(()=>rmSync(temp,{recursive:true,force:true}));
let source=readFileSync('src/software-factory/BusinessFoundation.jsx','utf8').replace("import './agent-studio.css';",'').replace("'./foundation-client.mjs'",JSON.stringify(new URL('../src/software-factory/foundation-client.mjs',import.meta.url).href)).replace("'../../supabase/functions/_shared/jd-business-foundation.mjs'",JSON.stringify(new URL('../supabase/functions/_shared/jd-business-foundation.mjs',import.meta.url).href));
writeFileSync(`${temp}/component.mjs`,(await transformWithOxc(source,'component.jsx',{jsx:{runtime:'classic'}})).code);const {BusinessFoundation}=await import(pathToFileURL(`${temp}/component.mjs`));
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
async function mount({role='owner',handler=b=>({data:{design:businessBlueprint(b.dna)}})}={}){
 const dom=new JSDOM('<!doctype html><div id="root"></div>');globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;const calls=[],client={functions:{invoke:async(_,r)=>{calls.push(r.body);return handler(r.body);}}};const root=createRoot(document.querySelector('#root'));
 const render=extra=>act(async()=>root.render(React.createElement(BusinessFoundation,{role,client,scopeKey:'tenant:actor',...extra})));await render();return{calls,render,cleanup:async()=>{await act(async()=>root.unmount());dom.window.close();delete globalThis.window;delete globalThis.document;delete globalThis.IS_REACT_ACT_ENVIRONMENT;}};
}
const text=()=>document.querySelector('#root').textContent;
const button=label=>[...document.querySelectorAll('button')].find(b=>b.textContent===label);
const click=label=>act(async()=>button(label).click());
const change=(el,value)=>act(async()=>Simulate.change(el,{target:{value}}));
const field=label=>[...document.querySelectorAll('label')].find(el=>el.firstChild?.textContent===label)?.querySelector('input,textarea,select');
async function fill(){for(const [label,value] of [['Business name','Synthetic shop'],['Industry','retail'],['Business description','Sell clothing to local shoppers.'],['Target customers','Local shoppers'],['Geography','Lagos'],['Goals, one per line','Validate demand\n']])await change(field(label),value);}
const submit=()=>act(async()=>Simulate.submit(document.querySelector('form')));
test('business DNA preview has industry-specific modules without pretending activation or research',async()=>{const m=await mount();try{await fill();await submit();assert.equal(m.calls.length,1);assert.match(text(),/Inventory/);assert.match(text(),/No automatic departments/);assert.match(text(),/No live research was performed/);assert.ok(button('Save version for review'));assert.deepEqual(m.calls[0].dna.goals,['Validate demand']);}finally{await m.cleanup();}});
test('workspace switch clears drafts and ignores pending previous-workspace preview',async()=>{const wait=defer(),m=await mount({handler:()=>wait.promise});try{await fill();await submit();await m.render({scopeKey:'other-tenant:actor'});await act(async()=>wait.resolve({data:{design:businessBlueprint(m.calls[0].dna)}}));assert.equal(field('Business name').value,'');assert.equal(button('Save version for review'),undefined);}finally{await m.cleanup();}});
test('draft catalogue exposes true count and disables hiring',async()=>{const m=await mount();try{await click('AI workforce');assert.match(text(),/16 draft definitions · 0 evaluated/);const hire=[...document.querySelectorAll('button')].filter(b=>b.textContent.startsWith('Hiring blocked'));assert.equal(hire.length,16);assert.ok(hire.every(b=>b.disabled));await change(field('Search workforce'),'dispatch');assert.equal(document.querySelectorAll('article').length,1);assert.equal(m.calls.length,0);}finally{await m.cleanup();}});
test('billing policy preserves platform subscription and distinguishes disabled additional employee charges',async()=>{const m=await mount();try{await click('Billing policy');assert.match(text(),/existing platform subscription is unchanged/);assert.match(text(),/No employee billing is enabled/);assert.equal(m.calls.length,0);}finally{await m.cleanup();}});
test('provider credentials clear from input even on failure; stored key never displayed',async()=>{const m=await mount({handler:()=>({error:{message:'PRIVATE_DIAGNOSTIC'}})});try{await click('Research');await change(field('SerpApi key'),'synthetic-provider-key-0123456789');assert.equal(field('SerpApi key').type,'password');await submit();assert.equal(field('SerpApi key').value,'');assert.doesNotMatch(text(),/PRIVATE_DIAGNOSTIC|synthetic-provider-key/);assert.equal(m.calls.length,1);assert.equal(m.calls[0].action,'foundation.research.configure');assert.ok(button('Run authorised research').disabled);}finally{await m.cleanup();}});
test('failed preview does not fabricate local success or save controls',async()=>{const m=await mount({handler:()=>({data:{design:{status:'completed'}}})});try{await fill();await submit();assert.match(text(),/does not match/);assert.equal(button('Save version for review'),undefined);}finally{await m.cleanup();}});
test('role downgrade removes secret input, design and controls',async()=>{const m=await mount();try{await click('Research');await change(field('SerpApi key'),'synthetic-provider-key-0123456789');await m.render({role:'staff'});assert.equal(document.querySelector('form'),null);await m.render({role:'owner'});await click('Research');assert.equal(field('SerpApi key').value,'');assert.equal(m.calls.length,0);}finally{await m.cleanup();}});
test('duplicate pending submissions use one request',async()=>{const wait=defer(),m=await mount({handler:()=>wait.promise});try{await fill();await act(async()=>{Simulate.submit(document.querySelector('form'));Simulate.submit(document.querySelector('form'));});assert.equal(m.calls.length,1);assert.ok(document.querySelector('fieldset').disabled);await act(async()=>wait.resolve({data:{design:businessBlueprint(m.calls[0].dna)}}));}finally{await m.cleanup();}});
