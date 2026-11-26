// Real repository table/RPC SQL, isolated PGlite. pgmq.send is a transactional
// test double backed by a local table; no Supabase/RLS/full pgmq claim is made.
import {test,before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();const dir=new URL('../supabase/migrations/',import.meta.url);
const read=name=>readFileSync(new URL(name,dir),'utf8');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const school=id(1),otherSchool=id(2),run=id(3),job=id(4),outsideRun=id(5);
const actors={owner:id(10),admin:id(11),manager:id(12),staff:id(13),viewer:id(14),finance:id(15),hr:id(16),contractor:id(17),outsider:id(18)};
const signature='public.jd_requeue_failed_execution_job(uuid,uuid)';
const patch='20261126083857_jd_retry_run_integrity.sql';
const pattern=/create or replace function public\.jd_requeue_failed_execution_job\s*\([\s\S]*?\bas\s+(\$[a-z_]*\$)[\s\S]*?\1\s*;/gi;
const definition=file=>[...read(file).matchAll(pattern)].at(-1)?.[0];
function ddl(file,table){const match=read(file).match(new RegExp(`create table if not exists public\\.${table} \\([\\s\\S]*?\\n\\);`,'i'));assert.ok(match);return match[0];}
before(async()=>{
 await db.exec('create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create table public.schools(id uuid primary key);create table public.profiles(id uuid primary key references auth.users,school_id uuid references public.schools,role text);');
 const control='20261111085143_jd_autonomous_automation.sql';for(const table of ['jd_conversations','jd_automation_runs','jd_audit_events'])await db.exec(ddl(control,table));
 await db.exec(ddl('20261111085150_jd_durable_execution_jobs.sql','jd_execution_jobs'));
 await db.exec(`create schema pgmq;create table pgmq.synthetic_messages(id bigint generated always as identity primary key,queue_name text,body jsonb);
 create function pgmq.send(text,jsonb) returns bigint language sql as $$insert into pgmq.synthetic_messages(queue_name,body) values($1,$2) returning id$$;`);
 for(const file of readdirSync(dir).filter(f=>f.endsWith('.sql')).sort()){
  for(const match of read(file).matchAll(pattern))await db.exec(match[0]);
  for(const match of read(file).matchAll(/^(?:grant|revoke)[^\n]*on function public\.jd_requeue_failed_execution_job[^\n]*;/gmi))await db.exec(match[0]);
 }
 await db.query('insert into public.schools values($1),($2)',[school,otherSchool]);
 for(const [role,actor] of Object.entries(actors)){await db.query('insert into auth.users values($1)',[actor]);await db.query('insert into public.profiles values($1,$2,$3)',[actor,role==='outsider'?otherSchool:school,role==='outsider'?'owner':role]);}
});
after(async()=>db.close());
beforeEach(async()=>{
 await db.exec('reset role;truncate public.jd_audit_events,public.jd_execution_jobs,public.jd_automation_runs,pgmq.synthetic_messages;');
 await db.query("insert into public.jd_automation_runs(id,school_id,requested_by,status,request_text,result_json) values($1,$2,$3,'failed','Synthetic failure','{\"failure\":true}'),($4,$5,$6,'failed','Other tenant failure','{}')",[run,school,actors.owner,outsideRun,otherSchool,actors.outsider]);
 await db.query("insert into public.jd_execution_jobs(id,school_id,run_id,requested_by,status,idempotency_key,attempt_count,max_attempts,last_error_code) values($1,$2,$3,$4,'failed','synthetic-retry',5,5,'synthetic_timeout')",[job,school,run,actors.owner]);
});
async function snapshot(){const out={};for(const table of ['public.jd_execution_jobs','public.jd_automation_runs','public.jd_audit_events','pgmq.synthetic_messages'])out[table]=(await db.query(`select * from ${table} order by id`)).rows;return out;}
async function retry(actor=actors.owner,role='service_role'){
 assert.ok(['service_role','anon','authenticated'].includes(role));await db.exec(`set role ${role}`);try{return(await db.query('select public.jd_requeue_failed_execution_job($1,$2) as result',[job,actor])).rows[0].result;}finally{await db.exec('reset role');}
}
async function denied(actor,code,role='service_role'){const original=await snapshot();await assert.rejects(retry(actor,role),{code});assert.deepEqual(await snapshot(),original);}
test('reproduces pre-fix NULL result_json violation without changing the persisted job, run, audit or synthetic queue',async()=>{
 await db.exec(definition('20261114213713_jd_authorization_role_matrix.sql'));
 try{await denied(actors.owner,'23502');}finally{await db.exec(read(patch));}
});
for(const role of ['owner','admin'])test(`${role}: retry atomically resets valid run JSON and creates one queue message and audit`,async()=>{
 const result=await retry(actors[role]);assert.equal(result.job_id,job);assert.equal(result.run_id,run);assert.equal(result.status,'queued');assert.ok(result.queue_message_id>0);
 const state=await snapshot();const j=state['public.jd_execution_jobs'][0],r=state['public.jd_automation_runs'].find(r=>r.id===run);assert.equal(j.status,'queued');assert.equal(j.attempt_count,0);assert.equal(j.last_error_code,null);assert.equal(r.status,'queued');assert.deepEqual(r.result_json,{});
 assert.equal(state['pgmq.synthetic_messages'].length,1);assert.deepEqual(state['pgmq.synthetic_messages'][0].body,{job_id:job,schema_version:1});assert.equal(state['public.jd_audit_events'].length,1);assert.equal(state['public.jd_audit_events'][0].actor_id,actors[role]);assert.equal(state['public.jd_audit_events'][0].event_json.previous_attempt_count,5);
});
for(const role of ['manager','staff','viewer','finance','hr','contractor'])test(`${role}: SQL retry denies authority`,()=>denied(actors[role],'42501'));
test('unknown actor denied by SQL',()=>denied(id(999),'42501'));
test('other-tenant owner cannot retry job',()=>denied(actors.outsider,'P0002'));
for(const role of ['anon','authenticated'])test(`${role}: forged service RPC actor denied`,()=>denied(actors.owner,'42501',role));
test('lost-response replay cannot enqueue duplicate retry or audit',async()=>{await retry();await denied(actors.owner,'22023');});
for(const status of ['queued','retry_wait','completed','cancelled'])test(`${status}: cannot manually retry`,async()=>{await db.query('update public.jd_execution_jobs set status=$1',[status]);await denied(actors.owner,'22023');});
test('job with mismatched run tenant is rejected before queue delivery or audit',async()=>{await db.query('update public.jd_execution_jobs set run_id=$1',[outsideRun]);await denied(actors.owner,'P0002');});
test('audit failure rolls back run, job and transactional queue test double',async()=>{
 await db.exec("alter table public.jd_audit_events add constraint reject_retry_audit check(event_type <> 'execution.manual_retry')");try{await denied(actors.owner,'23514');}finally{await db.exec('alter table public.jd_audit_events drop constraint reject_retry_audit');}
});
test('queue failure rolls back run/job state',async()=>{
 await db.exec("alter table pgmq.synthetic_messages add constraint reject_send check(queue_name <> 'jd_execution_jobs')");try{await denied(actors.owner,'23514');}finally{await db.exec('alter table pgmq.synthetic_messages drop constraint reject_send');}
});
test('service-only grants and empty search path survive new definition',async()=>{
 const {rows}=await db.query("select has_function_privilege('anon',$1,'EXECUTE') as anon,has_function_privilege('authenticated',$1,'EXECUTE') as authenticated,has_function_privilege('service_role',$1,'EXECUTE') as service",[signature]);assert.deepEqual(rows[0],{anon:false,authenticated:false,service:true});
 const f=(await db.query('select prosecdef,proconfig from pg_proc where oid=$1::regprocedure',[signature])).rows[0];assert.equal(f.prosecdef,true);assert.ok(f.proconfig.includes('search_path=""'));
});
test('emergency rollback disables retry without deleting evidence; reviewed reapply restores service access',async()=>{
 const original=await snapshot();await db.exec(readFileSync(new URL('../supabase/rollback/20261116210000_jd_retry_run_integrity.rollback.sql',import.meta.url),'utf8'));
 try{await denied(actors.owner,'42501');assert.deepEqual(await snapshot(),original);}finally{await db.exec(read(patch));}
 assert.equal((await retry()).status,'queued');
});
for(const status of ['awaiting_approval','queued','planning','running','completed','partially_completed','cancelled'])test(`failed job cannot overwrite ${status} run state or bypass approval`,async()=>{
 await db.query('update public.jd_automation_runs set status=$1 where id=$2',[status,run]);await denied(actors.owner,'22023');
});
