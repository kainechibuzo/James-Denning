import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {transformWithOxc} from 'vite';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
const cache=resolve('node_modules/.cache');mkdirSync(cache,{recursive:true});const temp=mkdtempSync(`${cache}/jd-activate-`);after(()=>rmSync(temp,{recursive:true,force:true}));
let source=readFileSync('src/App.jsx','utf8').replace('import {supabase,db} from "./supabaseClient.js";', 'const supabase={auth:{getSession:(...a)=>globalThis.__activation.supabase.auth.getSession(...a),getUser:(...a)=>globalThis.__activation.supabase.auth.getUser(...a),onAuthStateChange:(...a)=>globalThis.__activation.supabase.auth.onAuthStateChange(...a)},from:(...a)=>globalThis.__activation.supabase.from(...a)};const db={setSchool:(...a)=>globalThis.__activation.db.setSchool(...a),getSchool:(...a)=>globalThis.__activation.db.getSchool(...a)};').replace('"./auth/workspace-identity.mjs"',JSON.stringify(new URL('../src/auth/workspace-identity.mjs',import.meta.url).href)).replace('import {saveSession,saveSelectedSchool} from "./utils/session.js";', 'const saveSession=u=>globalThis.__activation.saved.push(u);const saveSelectedSchool=s=>globalThis.__activation.schools.push(s);');
source=source.replace(/^const AppDemo=.*$/m,'const AppDemo=()=>React.createElement("div",null,"Authenticated workspace");').replace(/^const EmailAuthPage=.*$/m,'const EmailAuthPage=()=>React.createElement("div",null,"Auth form");').replace(/^const PublicLanding=.*$/m,'const PublicLanding=()=>React.createElement("div",null,"Public landing");').replace(/^const OAuthConsentPage=.*$/m,'const OAuthConsentPage=()=>React.createElement("div",null,"Consent");');
writeFileSync(`${temp}/app.mjs`,(await transformWithOxc(source,'App.jsx',{jsx:{runtime:'classic'}})).code);const {default:App}=await import(pathToFileURL(`${temp}/app.mjs`));
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
async function mount({role='owner',profileId=id(1),schoolId=id(2),verifiedId=id(1),authError=false,transportFailure=false}={}){
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://example.invalid/'});globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const saved=[],schools=[],calls=[];const fixture={saved,schools,db:{setSchool:s=>calls.push(['setSchool',s]),getSchool:async()=>({data:{id:schoolId}})},supabase:{auth:{getSession:async()=>({data:{session:{user:{id:id(1)}}}}),getUser:async()=>{if(transportFailure)throw Error('PRIVATE_TOKEN');return authError?{error:{message:'PRIVATE_TOKEN'}}:{data:{user:{id:verifiedId,email:'synthetic@example.invalid'}}};},onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},from:table=>{calls.push(['table',table]);const query={select:()=>query,eq:()=>query,maybeSingle:async()=>({data:{id:profileId,school_id:id(2),role}})};return query;}}};globalThis.__activation=fixture;
 const root=createRoot(document.querySelector('#root'));await act(async()=>root.render(React.createElement(App)));
 return{saved,schools,calls,text:()=>document.querySelector('#root').textContent,cleanup:async()=>{await act(async()=>root.unmount());dom.window.close();delete globalThis.window;delete globalThis.document;delete globalThis.__activation;delete globalThis.IS_REACT_ACT_ENVIRONMENT;}};
}
test('mounted bootstrap preserves verified owner identity and opens workspace',async()=>{
 const m=await mount();try{assert.match(m.text(),/Authenticated workspace/);assert.equal(m.saved.length,1);assert.equal(m.saved[0].role,'owner');assert.equal(m.saved[0]._authUserId,id(1));}finally{await m.cleanup();}
});
for(const role of [null,'','unknown'])test(`mounted bootstrap never persists missing/unsupported role ${String(role)} as admin`,async()=>{
 const m=await mount({role});try{assert.match(m.text(),/role is missing or unsupported/);assert.equal(m.saved.length,0);assert.equal(m.schools.length,0);assert.equal(m.calls.some(c=>c[0]==='setSchool'),false);assert.doesNotMatch(m.text(),/Authenticated workspace/);}finally{await m.cleanup();}
});
for(const patch of [{profileId:id(3)},{schoolId:id(3)}])test(`mounted identity mismatch stops before cached workspace writes ${JSON.stringify(patch)}`,async()=>{
 const m=await mount(patch);try{assert.equal(m.saved.length,0);assert.equal(m.schools.length,0);assert.doesNotMatch(m.text(),/Authenticated workspace/);}finally{await m.cleanup();}
});
for(const patch of [{verifiedId:id(9)},{authError:true}])test(`restored session requires server-confirmed identity ${JSON.stringify(patch)}`,async()=>{
 const m=await mount(patch);try{assert.match(m.text(),/session could not be verified/);assert.equal(m.saved.length,0);assert.equal(m.calls.length,0);assert.doesNotMatch(m.text(),/PRIVATE_TOKEN/);}finally{await m.cleanup();}
});

test('bootstrap transport diagnostics are not exposed',async()=>{
 const m=await mount({transportFailure:true});try{assert.match(m.text(),/Unable to verify your account/);assert.doesNotMatch(m.text(),/PRIVATE_TOKEN/);assert.equal(m.saved.length,0);}finally{await m.cleanup();}
});
