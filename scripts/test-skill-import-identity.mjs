// Skill-import request identity (import-conflict fix): one attempt id per
// acquisition attempt; the create, upload, completion and publishing stages
// derive deterministic stage-scoped request keys from it; retries replay
// idempotently; uncertain submissions recover from the existing import record;
// conflicting payloads stay blocked. Real SQL in isolated PGlite with an
// injected (network-free) upstream source.
import test,{before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {acquireSkillCore,deriveRequestKey} from '../supabase/functions/_shared/jd-skills-acquire.ts';
import {buildZip} from '../supabase/functions/_shared/jd-skills-zip.mjs';
import {AUTONOMOUS_SOURCE} from '../supabase/functions/_shared/jd-skills-source-index.mjs';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const admin=id(1),tenant=id(10);
const db=new PGlite();let n;
const read=p=>readFileSync(p,'utf8');
const ENTRY='xlsx';
const skillMd=(flavor)=>`---
name: Invoice Reconciler
description: Reconciles supplier invoices against the ledger with JD-verified evidence ${flavor}.
version: 1.0.0
license: Apache-2.0
---
Reconcile supplier invoices against the ledger. Produce a JD-verified summary and never move money. ${flavor}
`;
async function zipball(commit,flavor){
 const root=`archive-${commit.slice(0,6)}-${flavor}/`;
 return buildZip([
  {path:`${root}skills/${ENTRY}/SKILL.md`,data:new TextEncoder().encode(skillMd(flavor))},
  {path:`${root}skills/${ENTRY}/LICENSE.txt`,data:new TextEncoder().encode('Apache License 2.0')},
 ]);
}
async function initialise(){
 await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table schools(id uuid primary key);create table profiles(id uuid primary key,school_id uuid,role text,full_name text);create schema extensions;create function extensions.digest(data bytea,algorithm text) returns bytea language sql immutable as $$select sha256(data)$$;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);");
 const source=read('supabase/migrations/20261111085143_jd_autonomous_automation.sql');
 for(const t of ['jd_conversations','jd_automation_runs','jd_automation_steps','jd_approvals','jd_audit_events'])await db.exec(source.match(new RegExp(`create table if not exists public\\.${t} \\([\\s\\S]*?\\n\\);`))[0]);
 await db.exec(read('supabase/migrations/20261122073215_jd_skills_catalog.sql'));
 await db.exec(read('supabase/migrations/20261122190743_jd_skills_autonomous.sql'));
 await db.exec(read('supabase/migrations/20261122222208_jd_discovery_autonomy.sql'));
 await db.query('insert into schools values($1)',[tenant]);
 for(const [who,school,role] of [[admin,tenant,'owner']]){
  await db.query('insert into auth.users values($1)',[who]);await db.query('insert into profiles values($1,$2,$3,$4)',[who,school,role,'Synthetic actor']);
 }
}
before(initialise);
beforeEach(async()=>{n=100;await db.exec('reset role;truncate jd_skill_packages,jd_skill_imports,jd_skills,jd_skill_versions,jd_skill_reviews,jd_skill_run_references,jd_skill_requests,jd_skill_acquisitions,jd_agent_time_ledger,jd_workspace_autonomy,jd_agent_playbooks,jd_discovery_sessions,jd_audit_events,jd_automation_runs cascade');});
after(()=>db.close());
// Minimal supabase-js-shaped admin over PGlite, with a mock quarantine bucket.
const client=(pg,uploadError=null)=>({
 async rpc(name,args){
  await pg.exec('set role service_role');
  try{
   const list=Object.values(args);
   const placeholders=list.map((_,i)=>'$'+(i+1)).join(',');
   const {rows}=await pg.query(`select public.${name}(${placeholders}) as result`,list.map(x=>x!==null&&typeof x==='object'?JSON.stringify(x):x));
   return {data:rows[0]?.result,error:null};
  }catch(e){return {data:null,error:{code:e.code||'XX000',message:e.message}};}
  finally{await pg.exec('reset role');}
 },
 from(table){
  const state={table,cols:'*',filters:[],order:null,limitN:1,single:false};
  const exec=async()=>{
   await pg.exec('set role service_role');
   try{
    let sql=`select ${state.cols} from public.${state.table}`;
    const params=[];
    for(const f of state.filters){params.push(f.value);sql+=`${params.length===1?' where':' and'} ${f.col} = $${params.length}`;}
    if(state.order)sql+=` order by ${state.order.col} ${state.order.asc?'asc':'desc'}`;
    sql+=` limit ${state.limitN}`;
    const {rows}=await pg.query(sql,params);
    const normalise=(r)=>{const o={...r};for(const k of Object.keys(o))if(typeof o[k]==='string'&&(o[k].startsWith('{')||o[k].startsWith('[')))try{o[k]=JSON.parse(o[k]);}catch{}return o;};
    const out=rows.map(normalise);
    return state.single?{data:out[0]||null,error:null}:{data:out,error:null};
   }catch(e){return {data:null,error:{code:e.code||'XX000',message:e.message}};}
   finally{await pg.exec('reset role');}
  };
  const chain={
   select(cols){state.cols=cols||'*';return chain;},
   eq(col,value){state.filters.push({col,op:'=',value});return chain;},
   order(col,{ascending=true}={}){state.order={col,asc:ascending};return chain;},
   limit(v){state.limitN=v;return chain;},
   maybeSingle(){state.single=true;state.limitN=1;return exec();},
   then(onFulfilled,onRejected){return exec().then(onFulfilled,onRejected);},
   catch(onRejected){return exec().catch(onRejected);},
  };
  return chain;
 },
 storage:{from:()=>({upload:async()=>uploadError?{error:uploadError}:{error:null}})},
});
const call=(name,args)=>async(adminClient)=>{
 const {data,error}=await adminClient.rpc(name,args);
 if(error)throw {dbCode:error.code};
 if(!data||typeof data!=='object'||data.hiring_enabled!==false||data.execution_enabled!==false)throw {dbCode:'receipt'};
 return data;
};
const run=(attempt,{commit='a'.repeat(40),flavor='one',uploadError=null,adminClient=null}={})=>
 acquireSkillCore({entryId:ENTRY,admin:adminClient||client(db,uploadError),actorId:admin,requestId:attempt,
  createRpc:(args)=>call('jd_create_skill_import',args)(adminClient||client(db,uploadError)),
  completeRpc:(args)=>call('jd_complete_skill_import',args)(adminClient||client(db,uploadError)),
  publishRpc:(args)=>call('jd_acquire_publish_skill',args)(adminClient||client(db,uploadError)),
  source:{resolveCommit:async()=>commit,fetchArchive:async()=>zipball(commit,flavor)}});
const counts=async()=>{
 const q=async(t)=>(await db.query(`select count(*)::int as c from ${t}`)).rows[0].c;
 return {imports:await q('jd_skill_imports'),packages:await q('jd_skill_packages'),versions:await q('jd_skill_versions'),acquisitions:await q('jd_skill_acquisitions'),requests:await q('jd_skill_requests')};
};
test('stage request keys are deterministic per attempt and distinct per stage',async()=>{
 const attempt=id(n++);
 const [c1,c2]=await Promise.all([deriveRequestKey(attempt,'create'),deriveRequestKey(attempt,'create')]);
 assert.equal(c1,c2);
 const keys=new Set([await deriveRequestKey(attempt,'create'),await deriveRequestKey(attempt,'complete'),await deriveRequestKey(attempt,'publish')]);
 assert.equal(keys.size,3);
 assert.notEqual(await deriveRequestKey(id(n++),'create'),c1);
 assert.match(c1,/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
});
test('a full attempt publishes; the same attempt replays identically with no duplicate operations',async()=>{
 const attempt=id(n++);
 const first=await run(attempt);
 assert(!('error' in first),JSON.stringify(first));
 assert.equal(first.receipt.state,'published');
 assert.ok(first.receipt.skill_id);assert.equal(first.receipt.version,1);
 const again=await run(attempt);
 assert(!('error' in again));
 assert.deepEqual(again.receipt,first.receipt);
 const c=await counts();
 assert.deepEqual(c,{imports:1,packages:1,versions:1,acquisitions:1,requests:3});
});
test('an interrupted upload recovers on retry of the same attempt; one import row only',async()=>{
 const attempt=id(n++);
 const interrupted=await run(attempt,{uploadError:{message:'The network connection dropped mid-upload'}});
 assert('error' in interrupted);
 const recovered=await run(attempt);
 assert(!('error' in recovered),JSON.stringify(recovered));
 assert.equal(recovered.receipt.state,'published');
 const c=await counts();
 assert.deepEqual(c,{imports:1,packages:1,versions:1,acquisitions:1,requests:3});
});
test('changed package contents on the same attempt are blocked by the request-conflict guard',async()=>{
 const attempt=id(n++);
 const first=await run(attempt,{commit:'b'.repeat(40),flavor:'one'});
 assert(!('error' in first));
 // Same pinned commit but different archive contents is an inconsistent
 // replay of the same attempt. The database conflict guard must reject it.
 const changed=await run(attempt,{commit:'b'.repeat(40),flavor:'two'});
 assert('error' in changed,'the conflicting resubmission must stay blocked');
 assert.equal(changed.error.status,409);
 assert.match(changed.error.message,/conflicts with this submission/i);
 const c=await counts();
 assert.deepEqual(c,{imports:1,packages:1,versions:1,acquisitions:1,requests:3});
});
test('a concurrent same-content attempt recovers from the existing record instead of duplicating',async()=>{
 const attemptA=id(n++);
 const first=await run(attemptA);
 assert(!('error' in first));
 const concurrent=await run(id(n++));
 assert('error' in concurrent);
 assert.equal(concurrent.error.status,409);
 assert.match(concurrent.error.message,/already recorded/);
 const c=await counts();
 assert.deepEqual(c,{imports:2,packages:1,versions:1,acquisitions:1,requests:4});
 const published=(await db.query('select current_version from jd_skills where school_id=$1',[tenant])).rows;
 assert.equal(published.length,1);assert.equal(published[0].current_version,1);
});
test('different content under different attempts proceeds as separate versions',async()=>{
 const a=await run(id(n++),{commit:'d'.repeat(40),flavor:'one'});
 const b=await run(id(n++),{commit:'e'.repeat(40),flavor:'two'});
 assert(!('error' in a)&&!('error' in b));
 assert.equal(a.receipt.version,1);assert.equal(b.receipt.version,2);
 const c=await counts();
 assert.deepEqual(c,{imports:2,packages:2,versions:2,acquisitions:2,requests:6});
 const skill=(await db.query('select id from jd_skills where school_id=$1',[tenant])).rows;
 assert.equal(skill.length,1);
});
