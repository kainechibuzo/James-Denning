// JSDOM harness for the Skills Catalog dashboard: quarantine upload flow,
// review/publish/revoke with notes, discovery metadata and boundary copy.
// No real network, no package execution.
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {transformWithOxc} from 'vite';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {Simulate} from 'react-dom/test-utils';
mkdirSync('node_modules/.cache',{recursive:true});const temp=mkdtempSync(`${process.cwd()}/node_modules/.cache/skills-ui-`);after(()=>rmSync(temp,{recursive:true,force:true}));
const base=new URL('../src/pages/jd-skills.jsx',import.meta.url);
const source=readFileSync(base,'utf8')
 .replace(`import {supabase} from '../supabaseClient.js';`,'const supabase=null;')
 .replace(/from '([^']+)'/g,(all,path)=>path.startsWith('.')?`from '${new URL(path,base).href}'`:all);
writeFileSync(`${temp}/component.mjs`,(await transformWithOxc(source,'jd-skills.jsx',{jsx:{runtime:'classic'}})).code);
const {JdSkillsPage}=await import(pathToFileURL(`${temp}/component.mjs`));
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const manifest=over=>({schemaVersion:1,name:'Invoice Reconciler',description:'Reconciles supplier invoices against the ledger with JD-verified evidence.',
 version:'1.0.0',license:'MIT',category:'finance',tags:['synthetic'],specialistRoles:['finance_analyst'],entrypoint:'SKILL.md',
 instructionText:'Reconcile supplier invoices against the ledger. Produce a JD-verified summary and never move money.',
 fileCount:2,totalBytes:2048,content_hash:'a'.repeat(64),
 files:[{path:'SKILL.md',bytes:1024,role:'instruction',executed:false},{path:'LICENSE',bytes:12,role:'asset',executed:false},{path:'scripts/reconcile.sh',bytes:64,role:'inert_asset',executed:false}],
 source:{kind:'zip_upload',originalFilename:'invoice-reconciler.zip'},...over});
const catalog=(over={})=>({
 skills:over.skills||[{id:uid(21),name:'Invoice Reconciler',category:'finance',scope:'private',status:'needs_review',current_version:1,content_hash:'a'.repeat(64),created_at:'2026-01-01T00:00:00Z',pending_reviews:0,failed_imports:0,published_count:0}],
 versions:over.skillId?[{version:1,manifest:manifest(),content_hash:'a'.repeat(64),created_by:uid(1),created_at:'2026-01-01T00:00:00Z'}]:[],
 reviews:over.skillId?[{version:1,decision:'approved',note:'Synthetic independent review.',decided_by:uid(3),created_at:'2026-01-01T01:00:00Z'}]:[],
 imports:[{id:uid(31),status:'needs_review',error_message:null,created_at:'2026-01-01T00:00:00Z',completed_at:'2026-01-01T00:05:00Z'}],
 hiring_enabled:false,execution_enabled:false,billing_enabled:false,skill_scope:'tenant_private',skill_limit:50,history_limit:10,
});
const receipt={import_id:uid(31),skill_id:uid(21),version:1,status:'needs_review',hiring_enabled:false,execution_enabled:false,persisted:true};
const uploaded={token:'synthetic-upload-token',path:`${uid(2)}/imports/${uid(32)}.zip`,expiresInSeconds:600};
const createReceipt={import_id:uid(31),bucket:'jd-skill-packages',storage_path:uploaded.path,max_bytes:20971520,mime_type:'application/zip',scope:'private',hiring_enabled:false,execution_enabled:false,upload:uploaded};
async function mount({ctx={role:'admin'},handler}={}){
 const calls=[],uploads=[],client={
  functions:{invoke:async(_,r)=>{calls.push(r.body);return handler?await handler(r.body):{data:{catalog:catalog(r.body)}};}},
  storage:{from:()=>({uploadToSignedUrl:async(path,token,file)=>{uploads.push({path,token,file});return{error:null};}})},
 };
 const dom=new JSDOM('<!doctype html><div id="root"></div>');globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const root=createRoot(document.querySelector('#root'));
 const render=extra=>act(async()=>root.render(React.createElement(JdSkillsPage,{client,ctx,...extra})));
 await render();return{calls,uploads,render,cleanup:async()=>{await act(async()=>root.unmount());dom.window.close();delete globalThis.window;delete globalThis.document;delete globalThis.IS_REACT_ACT_ENVIRONMENT;}};
}
const button=label=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim().includes(label)),text=()=>document.querySelector('#root').textContent,field=name=>document.querySelector(`[aria-label="${name}"]`);
const click=label=>act(async()=>button(label).click());
const setFile=async file=>act(async()=>Simulate.change(field('Skill package ZIP'),{target:{files:[file]}}));
const setNote=async value=>act(async()=>Simulate.change(field('Review note'),{target:{value}}));
const zip=(name='invoice-reconciler.zip')=>new (globalThis.window.File)([new Uint8Array([80,75,3,4])],name,{type:'application/zip'});
test('non-administrators are gated before any form renders',async()=>{const m=await mount({ctx:{role:'manager'}});try{
 assert.match(text(),/Workspace administrator access is required/);assert.equal(document.querySelector('form'),null);
}finally{await m.cleanup();}});
test('the catalogue states the boundary copy and lists tenant-private skills',async()=>{const m=await mount();try{
 assert.match(text(),/Uploading is not execution approval/);
 assert.match(text(),/never executed during import, inspection, preview or loading/);
 assert.match(text(),/Invoice Reconciler · v1 · needs review/);
}finally{await m.cleanup();}});
test('import flow creates a quarantine target, uploads to the signed URL and records review-required outcome',async()=>{
 const m=await mount({handler:async body=>{
  if(body.action==='skills.import.create')return{data:{receipt:createReceipt}};
  if(body.action==='skills.import.complete')return{data:{receipt}};
  return{data:{catalog:catalog(body)}};
 }});
 try{assert.equal(m.calls.length,1);assert.equal(m.calls[0].action,'skills.read');
  await setFile(zip());
  await act(async()=>Simulate.submit(document.querySelector('form')));
  assert.equal(m.calls[1].action,'skills.import.create');assert.equal(m.calls[1].filename,'invoice-reconciler.zip');assert.equal(m.calls[1].confirm,true);
  assert.deepEqual(m.uploads,[{path:uploaded.path,token:'synthetic-upload-token',file:m.uploads[0].file}]);
  assert.equal(m.calls[2].action,'skills.import.complete');assert.equal(m.calls[2].importId,uid(31));
  assert.match(text(),/Inspection complete without execution/);
  assert.match(text(),/independent review required before publication/);
 }finally{await m.cleanup();}});
test('a failed inspection renders the failure and never a publication state',async()=>{
 const m=await mount({handler:async body=>{
  if(body.action==='skills.import.create')return{data:{receipt:createReceipt}};
  if(body.action==='skills.import.complete')return{data:{receipt:{import_id:uid(31),skill_id:null,version:null,status:'validation_failed',hiring_enabled:false,execution_enabled:false,persisted:true}}};
  return{data:{catalog:catalog(body)}};
 }});
 try{await setFile(zip('broken.zip'));await act(async()=>Simulate.submit(document.querySelector('form')));
  assert.match(text(),/validation failed; nothing published/);
  assert.match(text(),/Inspection failed and nothing was published/);
  assert.doesNotMatch(text(),/published for specialist discovery/);
 }finally{await m.cleanup();}});
test('an uncertain upload keeps the exact request identifier for retry',async()=>{
 let first=true;
 const m=await mount({handler:async body=>{
  if(body.action==='skills.import.create'&&first){first=false;throw new Error('lost');}
  if(body.action==='skills.import.create')return{data:{receipt:createReceipt}};
  if(body.action==='skills.import.complete')return{data:{receipt}};
  return{data:{catalog:catalog(body)}};
 }});
 try{await setFile(zip());await act(async()=>Simulate.submit(document.querySelector('form')));
  assert.match(text(),/Skills outcome uncertain|not confirmed/);assert.equal(m.calls.length,2);assert.equal(m.calls[1].action,'skills.import.create');
  await act(async()=>Simulate.submit(document.querySelector('form')));
  assert.equal(m.calls[1].requestId,m.calls[2].requestId);assert.equal(m.calls[2].action,'skills.import.create');
  assert.match(text(),/Inspection complete without execution/);
 }finally{await m.cleanup();}});
test('review requires a note and approve/publish stay distinct steps',async()=>{
 let state='needs_review';
 const m=await mount({handler:async body=>{
  if(body.action==='skills.decide')state='approved';
  if(body.action==='skills.publish')state='published';
  return{data:{catalog:catalog({...body,skills:[{id:uid(21),name:'Invoice Reconciler',category:'finance',scope:'private',status:state,current_version:1,content_hash:'a'.repeat(64),created_at:'',pending_reviews:0,failed_imports:0,published_count:0}]})}};
 }});
 try{await click('Invoice Reconciler');assert.equal(m.calls.length,2);assert.equal(m.calls[1].action,'skills.read');assert.equal(m.calls[1].skillId,uid(21));
  assert.equal(button('Publish approved version').disabled,true);
  await click('Approve review');assert.equal(m.calls.length,2);
  assert.equal(button('Confirm skills action').disabled,true);
  await setNote('Approved after reading the full inspection report.');
  await click('Confirm skills action');
  assert.equal(m.calls[2].action,'skills.decide');assert.equal(m.calls[2].decision,'approve');assert.equal(m.calls[2].expectedVersion,1);assert.equal(m.calls[3].action,'skills.read');
  assert.match(text(),/Publication still requires a separate publish step/);
  assert.equal(button('Publish approved version').disabled,false);
  await click('Publish approved version');
  await setNote('Published for specialist discovery in this workspace.');
  await click('Confirm skills action');
  assert.equal(m.calls[4].action,'skills.publish');
  assert.match(text(),/No tools were granted and nothing executes by itself/);
 }finally{await m.cleanup();}});
test('inert attachments are labelled as recorded but never executed',async()=>{const m=await mount();try{
 await click('Invoice Reconciler');
 assert.match(text(),/Inert attachments \(recorded, never executed\): scripts\/reconcile\.sh/);
}finally{await m.cleanup();}});
test('revoke records the lifecycle action with a note',async()=>{
 const m=await mount({handler:async body=>{
  const status=body.action==='skills.lifecycle'?'revoked':'published';
  return{data:{catalog:catalog({...body,skills:[{id:uid(21),name:'Invoice Reconciler',category:'finance',scope:'private',status,current_version:1,content_hash:'a'.repeat(64),created_at:'',pending_reviews:0,failed_imports:0,published_count:1}]})}};
 }});
 try{await click('Invoice Reconciler');
  await click('Revoke');await setNote('Revoking this skill pending a security re-review.');
  await click('Confirm skills action');
  assert.equal(m.calls[2].action,'skills.lifecycle');assert.equal(m.calls[2].lifecycleAction,'revoke');assert.equal(m.calls[3].action,'skills.read');
  assert.match(text(),/Revoked skills disappear from discovery/);
 }finally{await m.cleanup();}});
test('starter packages flow through the same quarantine import pipeline',async()=>{
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async()=>new Response(new Blob([new Uint8Array([80,75,3,4])]),{status:200});
 const m=await mount({handler:async body=>{
  if(body.action==='skills.import.create')return{data:{receipt:createReceipt}};
  if(body.action==='skills.import.complete')return{data:{receipt}};
  return{data:{catalog:catalog(body)}};
 }});
 try{
  await click('Spreadsheet workbooks (XLSX)');
  assert.equal(m.calls[1].action,'skills.import.create');assert.equal(m.calls[1].filename,'xlsx.zip');
  assert.match(m.calls[1].requestId,/^[a-f0-9-]{36}$/);assert.equal(m.calls[1].confirm,true);
  assert.equal(m.uploads[0].file.name,'xlsx.zip');
  assert.equal(m.calls[2].action,'skills.import.complete');assert.equal(m.calls[2].importId,uid(31));
  assert.match(text(),/Inspection complete without execution/);
 }finally{globalThis.fetch=originalFetch;await m.cleanup();}});
test('discovery preview shows metadata only and never instruction text',async()=>{
 const m=await mount({handler:async body=>body.action==='skills.resolve'
  ?{data:{discover:{skills:[{id:uid(21),name:'Invoice Reconciler',version:1,description:'Reconciles supplier invoices against the ledger.'}],scope:'tenant_private',execution_granted:false,instructions_included:false,notice:'Skill metadata only; loading an approved skill records its exact version and never grants tools or authority.'}}}
  :{data:{catalog:catalog(body)}}});
 try{
  await act(async()=>Simulate.change(field('Task description'),{target:{value:'Reconcile supplier invoices this week'}}));
  const forms=document.querySelectorAll('form');await act(async()=>Simulate.submit(forms[forms.length-1]));
  assert.equal(m.calls.at(-1).action,'skills.resolve');assert.equal(m.calls.at(-1).limit,5);
  assert.match(text(),/Invoice Reconciler v1/);
  assert.match(text(),/Skill metadata only/);
  assert.doesNotMatch(text(),/JD-verified summary and never move money/);
 }finally{await m.cleanup();}});
