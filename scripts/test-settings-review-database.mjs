// Actual repository DDL/RPC and transformed HTTP handler, local PGlite only.
// Auth/profiles are synthetic; pgcrypto digest uses PostgreSQL's built-in SHA256.
import test,{before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {transformWithOxc} from 'vite';
import {PGlite} from '@electric-sql/pglite';
import {submitSettingsForReview} from '../supabase/functions/_shared/jd-settings-review.ts';
import {buildSettingsChangePlan} from '../supabase/functions/_shared/jd-settings-change-planner.ts';
import {applyReviewedSettings} from '../src/chat/settings-review.mjs';
const db=new PGlite();const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor=id(1),school=id(2),otherSchool=id(3),outsider=id(4),staff=id(5);
const read=name=>readFileSync(`supabase/migrations/${name}`,'utf8');
const control='20261111085143_jd_autonomous_automation.sql',qualified='20261114214613_jd_qualify_pgcrypto_digest.sql',roles='20261114213713_jd_authorization_role_matrix.sql';
function ddl(file,table){const match=read(file).match(new RegExp(`create table if not exists (?:public\\.)?${table} \\([\\s\\S]*?\\n\\);`,'i'));assert.ok(match);return match[0];}
function rpc(file,name){const match=read(file).match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$function\\$\\n;`,'i'));assert.ok(match);return match[0];}
const cache=resolve('node_modules/.cache');mkdirSync(cache,{recursive:true});const temp=mkdtempSync(`${cache}/settings-db-`);
const source=readFileSync('supabase/functions/jd-automation/index.ts','utf8').replace(/^import .*;\n/gm,'');
writeFileSync(`${temp}/handler.mjs`,(await transformWithOxc(`export function makeHandler(createClient,buildSettingsChangePlan){let handler;const Deno={env:{get:key=>key},serve:fn=>{handler=fn;}};${source}\nreturn handler;}`,'handler.ts')).code);
const {makeHandler}=await import(pathToFileURL(`${temp}/handler.mjs`));
before(async()=>{
 await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create table schools(id uuid primary key);create table profiles(id uuid primary key,school_id uuid references schools,role text,full_name text);create schema extensions;create function extensions.digest(data bytea,algorithm text) returns bytea language sql immutable as $$select case when algorithm='sha256' then sha256(data) else null end$$;");
 for(const table of ['jd_conversations','jd_automation_runs','jd_automation_steps','jd_approvals','jd_audit_events'])await db.exec(ddl(control,table));
 await db.exec(read('20261111085145_jd_review_centre_foundation.sql').split('create index')[0]);
 await db.exec(read('20261112084412_jd_settings_proposal_review.sql').split('create or replace function')[0].replace('create extension if not exists pgcrypto;',''));
 await db.exec(ddl('20261112084459_jd_approved_settings_executor.sql','jd_settings_execution_steps'));
 await db.exec(ddl('001b_remaining_tables_RECONSTRUCTED.sql','school_settings')+'create unique index settings_unique on school_settings(school_id,key);');
 for(const [file,name,signature] of [[qualified,'jd_submit_settings_proposal','uuid,text,jsonb'],[qualified,'jd_apply_settings_proposal_step','uuid,uuid,integer'],[roles,'jd_decide_approval','uuid,uuid,text,text']]){
  await db.exec(rpc(file,name));await db.exec(`revoke all on function public.${name}(${signature}) from public,anon,authenticated;grant execute on function public.${name}(${signature}) to service_role;`);
 }
 await db.query('insert into schools values($1),($2)',[school,otherSchool]);
 for(const [who,tenant,role] of [[actor,school,'owner'],[outsider,otherSchool,'owner'],[staff,school,'staff']]){await db.query('insert into auth.users values($1)',[who]);await db.query('insert into profiles values($1,$2,$3,$4)',[who,tenant,role,'Synthetic test actor']);}
});
beforeEach(async()=>{
 await db.exec('reset role;truncate jd_settings_execution_steps,jd_audit_events,jd_approvals,jd_automation_steps,jd_automation_runs,jd_conversations,school_settings;');
 await db.query("insert into school_settings(school_id,key,value) values($1,'school_name','Old synthetic name'),($1,'education_module_enabled','true'),($2,'school_name','Other synthetic tenant')",[school,otherSchool]);
});
after(async()=>{await db.close();rmSync(temp,{recursive:true,force:true});});
async function snapshot(){const out={};for(const table of ['school_settings','jd_approvals','jd_settings_execution_steps','jd_audit_events','jd_automation_runs'])out[table]=(await db.query(`select to_jsonb(t) as row from ${table} t order by id`)).rows.map(r=>r.row);return out;}
function adminClient({tamperStep=false,staleRead=false}={}){
 const calls=[];const admin={from(table){assert.ok(['profiles','school_settings','jd_approvals','jd_automation_runs'].includes(table));let columns='*',filters=[],limit=100;const q={select(c='*'){assert.match(c,/^[a-z_,*]+$/);columns=c;return q;},eq(k,v){filters.push([k,[v]]);return q;},in(k,v){filters.push([k,v]);return q;},order(){return q;},limit(n){limit=n;return q;},async maybeSingle(){const r=await q;return{...r,data:r.data?.[0]||null};},async single(){return q.maybeSingle();},then(yes,no){return(async()=>{const values=[];const where=filters.map(([k,vs])=>{assert.match(k,/^[a-z_]+$/);return `${k} in (${vs.map(v=>{values.push(v);return '$'+values.length;}).join(',')})`;});try{const r=await db.query(`select ${columns} from ${table}${where.length?' where '+where.join(' and '):''} limit ${limit}`,values);let data=r.rows;if(staleRead&&table==='school_settings')data=data.map(r=>({...r,value:'UNMATCHED'}));return{data};}catch(e){return{error:{code:e.code}};}})().then(yes,no);}};return q;},async rpc(name,args){
  calls.push({name,args});if(name==='jd_expire_stale_approvals')return{data:{workspace_approvals_expired:0,connector_approvals_expired:0},error:null};const defs={jd_expire_stale_approvals:[],jd_submit_settings_proposal:['p_actor_id','p_title','p_proposal_json'],jd_decide_approval:['p_approval_id','p_actor_id','p_decision','p_note'],jd_apply_settings_proposal_step:['p_approval_id','p_actor_id','p_step_index']};const keys=defs[name];assert.ok(keys);
  await db.exec('set role service_role');try{const r=await db.query(`select public.${name}(${keys.map((_,i)=>'$'+(i+1)).join(',')}) as result`,keys.map(k=>typeof args[k]==='object'&&args[k]!==null?JSON.stringify(args[k]):args[k]));return{data:tamperStep&&name==='jd_apply_settings_proposal_step'?{}:r.rows[0].result};}catch(e){return{error:{code:e.code,message:'PRIVATE_DIAGNOSTIC'}};}finally{await db.exec('reset role');}
 }};return{admin,calls};
}
function http(who=actor,options={}){
 const f=adminClient(options),auth={auth:{getUser:async()=>who?{data:{user:{id:who}}}:{data:{user:null},error:{message:'invalid'}}}};
 const handler=makeHandler((_url,key)=>key==='SUPABASE_ANON_KEY'?auth:f.admin,buildSettingsChangePlan);
 const send=async body=>{const r=await handler(new Request('https://fixture.invalid',{method:'POST',headers:{Authorization:'Bearer synthetic','Content-Type':'application/json'},body:JSON.stringify(body)}));return{status:r.status,data:await r.json()};};
 return{...f,send,client:{functions:{invoke:async(_,request)=>{const r=await send(request.body);return r.status===200?{data:r.data}:{data:r.data,error:{status:r.status}};}}}};
}
async function proposal(f=http()){
 return submitSettingsForReview({title:'Synthetic identity and module update',changes:[{key:'school_name',value:'Synthetic Logistics Ltd'},{key:'education_module_enabled',value:false}]},{admin:f.admin,userId:actor,schoolId:school,role:'owner'});
}
async function approve(f,p){const r=await f.send({action:'approvals.decide',approvalId:p.proposal.id,decision:'approve'});assert.equal(r.status,200);return r;}
test('actual JD submit -> SQL -> human approval -> HTTP executor -> client/read-back',async()=>{
 const f=http(),before=await snapshot(),p=await proposal(f);assert.equal(p.status,'pending');assert.deepEqual((await snapshot()).school_settings,before.school_settings);
 const denied=await f.send({action:'settings.proposal.execute',approvalId:p.proposal.id});assert.equal(denied.status,409);await approve(f,p);assert.deepEqual((await snapshot()).school_settings,before.school_settings);
 const item=(await f.send({action:'approvals.list'})).data.approvals[0];const applied=await applyReviewedSettings(f.client,item);assert.match(applied.message,/applied and read back/);
 const after=await snapshot();assert.equal(after.school_settings.find(s=>s.school_id===school&&s.key==='school_name').value,'Synthetic Logistics Ltd');assert.equal(after.school_settings.find(s=>s.school_id===school&&s.key==='education_module_enabled').value,'false');assert.equal(after.school_settings.find(s=>s.school_id===otherSchool).value,'Other synthetic tenant');assert.equal(after.jd_settings_execution_steps.length,2);assert.equal(after.jd_audit_events.filter(e=>e.event_type==='settings.step_completed').length,2);
 if(process.env.JD_SETTINGS_EVIDENCE_DIR){mkdirSync(process.env.JD_SETTINGS_EVIDENCE_DIR,{recursive:true});writeFileSync(resolve(process.env.JD_SETTINGS_EVIDENCE_DIR,'settings-sql-records.json'),JSON.stringify({scope:'Local synthetic PGlite only; not live Supabase acceptance',before,after},null,2)+'\n');}
});
for(const [who,status] of [[null,401],[staff,403],[outsider,404]])test(`actual endpoint denies actor ${who} before execution`,async()=>{
 const f=http(),p=await proposal(f);await approve(f,p);const before=await snapshot();const denied=await http(who).send({action:'settings.proposal.execute',approvalId:p.proposal.id,actorId:actor,schoolId:school});assert.equal(denied.status,status);assert.deepEqual(await snapshot(),before);
});
test('stale approved before-value fails without overwriting intervening change',async()=>{
 const f=http(),p=await proposal(f);await approve(f,p);await db.query("update school_settings set value='Changed independently' where school_id=$1 and key='school_name'",[school]);const r=await f.send({action:'settings.proposal.execute',approvalId:p.proposal.id});assert.equal(r.status,409);const s=await snapshot();assert.equal(s.school_settings.find(r=>r.school_id===school&&r.key==='school_name').value,'Changed independently');assert.equal(s.school_settings.find(r=>r.school_id===school&&r.key==='education_module_enabled').value,'true');
});
test('tampered approved content fails its SQL hash check',async()=>{
 const f=http(),p=await proposal(f);await approve(f,p);await db.query("update jd_approvals set proposal_json=jsonb_set(proposal_json,'{changes,0,after}','\"Tampered\"') where id=$1",[p.proposal.id]);const before=await snapshot();const r=await f.send({action:'settings.proposal.execute',approvalId:p.proposal.id});assert.equal(r.status,409);assert.deepEqual(await snapshot(),before);
});
test('audit failure rolls back the step and does not run subsequent steps',async()=>{
 const f=http(),p=await proposal(f);await approve(f,p);const before=await snapshot();await db.exec("alter table jd_audit_events add constraint fault check(event_type<>'settings.step_completed')");try{assert.equal((await f.send({action:'settings.proposal.execute',approvalId:p.proposal.id})).status,500);assert.deepEqual(await snapshot(),before);}finally{await db.exec('alter table jd_audit_events drop constraint fault');}
});
test('replaying completed execution does not duplicate audit steps',async()=>{
 const f=http(),p=await proposal(f);await approve(f,p);assert.equal((await f.send({action:'settings.proposal.execute',approvalId:p.proposal.id})).status,200);const before=await snapshot();assert.equal((await f.send({action:'settings.proposal.execute',approvalId:p.proposal.id})).status,200);assert.deepEqual(await snapshot(),before);
});
test('malformed step receipt stops before the second write and reports uncertainty',async()=>{
 const f=http(),p=await proposal(f);await approve(f,p);const r=await http(actor,{tamperStep:true}).send({action:'settings.proposal.execute',approvalId:p.proposal.id});assert.equal(r.status,500);const s=await snapshot();assert.equal(s.jd_settings_execution_steps.length,1);assert.equal(s.school_settings.find(r=>r.school_id===school&&r.key==='education_module_enabled').value,'true');
});
test('final persisted settings mismatch is not a success acknowledgement',async()=>{
 const f=http(),p=await proposal(f);await approve(f,p);const r=await http(actor,{staleRead:true}).send({action:'settings.proposal.execute',approvalId:p.proposal.id});assert.equal(r.status,409);assert.equal((await snapshot()).jd_settings_execution_steps.length,2);
});
for(const role of ['anon','authenticated'])test(`${role}: direct executor RPC denied`,async()=>{
 const p=await proposal();await db.exec(`set role ${role}`);try{await assert.rejects(db.query('select jd_apply_settings_proposal_step($1,$2,0)',[p.proposal.id,actor]),e=>e.code==='42501');}finally{await db.exec('reset role');}
});
test('second-step failure is partial, then explicit resume skips the completed first step',async()=>{
 const f=http(),p=await proposal(f);await approve(f,p);
 await db.exec("alter table jd_audit_events add constraint second_step_fault check(not(event_type='settings.step_completed' and event_json->>'step_index'='1'))");
 try{const r=await f.send({action:'settings.proposal.execute',approvalId:p.proposal.id});assert.equal(r.status,500);assert.equal(r.data.partial,true);const s=await snapshot();assert.equal(s.jd_settings_execution_steps.length,1);assert.equal(s.school_settings.find(r=>r.school_id===school&&r.key==='school_name').value,'Synthetic Logistics Ltd');assert.equal(s.school_settings.find(r=>r.school_id===school&&r.key==='education_module_enabled').value,'true');}
 finally{await db.exec('alter table jd_audit_events drop constraint second_step_fault');}
 const item=(await f.send({action:'approvals.list'})).data.approvals[0];assert.equal(item.execution_status,'running');await applyReviewedSettings(f.client,item);const s=await snapshot();assert.equal(s.jd_settings_execution_steps.length,2);assert.equal(s.jd_audit_events.filter(e=>e.event_type==='settings.step_completed').length,2);
});
