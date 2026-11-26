// Executes the real candidate SQL against local PGlite; no production/provider access.
import test, {before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const owner=id(1),tenant=id(2),outsider=id(3),other=id(4),staff=id(5),job=id(6),run=id(7),lease=id(8);
const migration='supabase/migrations/20261126083846_jd_usage_ledger.sql';
const read=p=>readFileSync(p,'utf8');
const ddl=(file,table)=>read(file).match(new RegExp(`create table if not exists public\\.${table} \\([\\s\\S]*?\\n\\);`))[0];
const control='supabase/migrations/20261111085143_jd_autonomous_automation.sql';
let request;
before(async()=>{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table schools(id uuid primary key);create table profiles(id uuid primary key,school_id uuid,role text);');
 for(const t of ['jd_conversations','jd_automation_runs','jd_automation_steps','jd_approvals','jd_audit_events'])await db.exec(ddl(control,t));
 await db.exec(ddl('supabase/migrations/20261111085150_jd_durable_execution_jobs.sql','jd_execution_jobs'));
 await db.exec(read(migration));
 await db.query('insert into schools values($1),($2)',[tenant,other]);
 for(const [who,t,role] of [[owner,tenant,'owner'],[outsider,other,'owner'],[staff,tenant,'staff']]){await db.query('insert into auth.users values($1)',[who]);await db.query('insert into profiles values($1,$2,$3)',[who,t,role]);}
});
beforeEach(async()=>{
 request=100;
 await db.exec('reset role;truncate jd_usage_events,jd_usage_runs,jd_usage_accounts,jd_execution_jobs,jd_automation_runs,jd_audit_events cascade');
 await db.query("update profiles set role='owner',school_id=$2 where id=$1",[owner,tenant]);
 await db.query("insert into jd_automation_runs(id,school_id,requested_by,status,idempotency_key,request_text) values($1,$2,$3,'queued','usage-fixture','Synthetic usage test')",[run,tenant,owner]);
 await db.query("insert into jd_execution_jobs(id,school_id,run_id,requested_by,idempotency_key) values($1,$2,$3,$4,'usage-fixture')",[job,tenant,run,owner]);
});
after(async()=>db.close());
async function rpc(name,args,role='service_role'){
 await db.exec(`set role ${role}`);
 try{return(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as result`,args)).rows[0].result;}finally{await db.exec('reset role');}
}
const configure=(budget=1000000,version=0,who=owner,req=id(request++))=>rpc('jd_configure_usage',[who,req,version,budget,'employee-active-v1-shadow']);
const reserve=(cap=500000,who=owner,req=id(request++),j=job)=>rpc('jd_reserve_usage',[who,req,j,'synthetic-subject-not-hired',cap]);
const observe=(phase,seq,token=lease,req=id(request++))=>rpc('jd_observe_usage',[job,token,req,seq,phase]);
const snapshot=(who=owner)=>rpc('jd_usage_snapshot',[who]);
async function start(){await configure();await reserve();await db.query("update jd_execution_jobs set status='running',lease_token=$2,lease_owner='synthetic-worker',lease_expires_at=clock_timestamp()+interval '90 seconds' where id=$1",[job,lease]);}
// Only fixture superuser changes timestamps to exercise durations deterministically. RPC callers cannot.
async function elapsed(seconds){await db.query("update jd_usage_runs set observed_at=clock_timestamp()-($2::double precision*interval '1 second'),deadline=clock_timestamp()+interval '10 seconds' where job_id=$1",[job,seconds]);}
async function terminal(status='completed'){await db.query('update jd_execution_jobs set status=$2,lease_owner=null,lease_token=null,lease_expires_at=null where id=$1',[job,status]);}

test('configuration is explicit shadow only and preserves base subscription',async()=>{const r=await configure();assert.equal(r.mode,'shadow');assert.equal(r.charged,false);assert.equal(r.platform_subscription,'unchanged');assert.equal(r.hourly_micros,1000000);assert.equal((await snapshot()).balanced,true);});
test('budget policy cannot be upgraded to charging by caller',async()=>{for(const policy of ['billable',null,'employee-active-v2'])await assert.rejects(rpc('jd_configure_usage',[owner,id(request++),0,1000000,policy]),e=>e.code==='22023');assert.equal((await snapshot()).configured,false);});
for(const [label,args] of [['null budget',[null,0]],['negative',[-1,0]],['oversized',[1000000000001,0]],['invalid version',[10,-1]]])test(`configuration rejects ${label}`,async()=>await assert.rejects(configure(...args),e=>e.code==='22023'));
test('configure has request replay and optimistic version protection',async()=>{const req=id(request++),first=await configure(1000,0,owner,req);assert.deepEqual(await configure(1000,0,owner,req),first);await assert.rejects(configure(1001,0,owner,req),e=>e.code==='40001');await assert.rejects(configure(1001,0),e=>e.code==='40001');assert.equal((await configure(1001,1)).version,2);});
test('reservation does not hire, authorise execution or charge',async()=>{await configure();const r=await reserve();assert.equal(r.execution_authorised,false);assert.equal(r.subject_verified,false);assert.equal(r.charged,false);assert.equal((await db.query('select status from jd_execution_jobs')).rows[0].status,'queued');const s=await snapshot();assert.equal(s.reserved_micros,500000);assert.equal(s.balanced,true);});
test('reservation requires configured sufficient budget and rejects double allocation',async()=>{await assert.rejects(reserve(),e=>e.code==='54000');await configure(100);await assert.rejects(reserve(101),e=>e.code==='54000');await reserve(100);await assert.rejects(reserve(1),e=>e.code==='40001');await assert.rejects(configure(99,1),e=>e.code==='22023');});
test('reservation replay cannot double reserve or reuse request for another operation',async()=>{await configure();const req=id(request++),r=await reserve(10,owner,req);assert.deepEqual(await reserve(10,owner,req),r);await assert.rejects(reserve(20,owner,req),e=>e.code==='40001');await assert.rejects(configure(5000,1,owner,req),e=>e.code==='40001');assert.equal((await snapshot()).reserved_micros,10);});
for(const [who,label] of [[staff,'staff'],[outsider,'other tenant']])test(`${label} cannot access or mutate this tenant's usage`,async()=>{await configure();await assert.rejects(reserve(10,who),e=>e.code==='42501');if(who===staff)await assert.rejects(snapshot(who),e=>e.code==='42501');else{const s=await snapshot(who);assert.equal(s.configured,false);assert.deepEqual(s.runs,[]);}});
for(const role of ['anon','authenticated'])test(`${role} cannot spoof actor or access private worker data`,async()=>{
 for(const [name,args] of [['jd_usage_snapshot',[owner]],['jd_configure_usage',[owner,id(request++),0,10,'employee-active-v1-shadow']],['jd_reserve_usage',[owner,id(request++),job,'forged',10]],['jd_observe_usage',[job,lease,id(request++),0,'active']],['jd_reconcile_usage',[owner,job,id(request++)]],['jd_usage_actor_tenant',[owner]]])await assert.rejects(rpc(name,args,role),e=>e.code==='42501');
 await db.exec(`set role ${role}`);try{for(const table of ['jd_usage_accounts','jd_usage_runs','jd_usage_events'])await assert.rejects(db.query(`select * from ${table}`),e=>e.code==='42501');}finally{await db.exec('reset role');}
});
test('service role cannot forge direct ledger writes',async()=>{await configure();await reserve();await db.exec('set role service_role');try{for(const sql of ["update jd_usage_accounts set accrued_micros=0","update jd_usage_runs set estimate_micros=0","delete from jd_usage_events","insert into jd_usage_events(school_id,request_id,kind,request,receipt) values(gen_random_uuid(),gen_random_uuid(),'observe','{}','{}')"])await assert.rejects(db.exec(sql),e=>e.code==='42501');}finally{await db.exec('reset role');}});
test('immutable observations also reject mutation by privileged fixture owner',async()=>{await configure();for(const sql of ['update jd_usage_events set receipt=\'{}\'','delete from jd_usage_events'])await assert.rejects(db.exec(sql),e=>e.code==='55000');});
test('active time comes from the server and aggregates rounding once',async()=>{
 await start();let r=await observe('active',0);assert.equal(r.active_microseconds,0);assert.ok(r.deadline);await elapsed(1);
 r=await observe('external_wait',1);assert.ok(r.active_microseconds>=1000000&&r.active_microseconds<1500000);assert.equal(r.estimate_micros,Math.ceil(r.active_microseconds/3600));const active=r.active_microseconds;
 await elapsed(20);r=await observe('active',2);assert.equal(r.active_microseconds,active);await elapsed(1);r=await observe('closed',3);assert.equal(r.status,'settled');assert.equal(r.estimate_micros,Math.ceil(r.active_microseconds/3600));const s=await snapshot();assert.equal(s.reserved_micros,0);assert.equal(s.accrued_micros,r.estimate_micros);assert.equal(s.balanced,true);assert.ok(!JSON.stringify(s).includes(lease));assert.ok(!JSON.stringify(s).includes('lease_token'));
});
for(const phase of ['idle','paused','approval_wait','external_wait'])test(`${phase} duration is not counted`,async()=>{await start();await observe(phase,0);await elapsed(15);const r=await observe('closed',1);assert.equal(r.active_microseconds,0);assert.equal(r.estimate_micros,0);});
test('observation replay is exact, never double counts and conflicts fail closed',async()=>{await start();await observe('active',0);await elapsed(2);const req=id(request++),r=await observe('paused',1,lease,req);assert.deepEqual(await observe('paused',1,lease,req),r);await assert.rejects(observe('closed',1,lease,req),e=>e.code==='40001');await assert.rejects(observe('active',1),e=>e.code==='40001');assert.equal((await snapshot()).runs[0].estimate_micros,r.estimate_micros);});
test('stale lease and expiration cannot append observations',async()=>{await start();await assert.rejects(observe('active',0,id(9)),e=>e.code==='42501');await db.exec("update jd_execution_jobs set lease_expires_at=clock_timestamp()-interval '1 second'");await assert.rejects(observe('active',0),e=>e.code==='42501');assert.equal((await snapshot()).runs[0].sequence,0);});
test('replacement lease cannot attribute old active time to new worker',async()=>{await start();await observe('active',0);await elapsed(10);await db.query('update jd_execution_jobs set lease_token=$1',[id(9)]);const r=await observe('active',1,id(9));assert.equal(r.status,'review_required');assert.equal(r.estimate_micros,0);assert.equal(r.uncertain,true);assert.equal((await snapshot()).reserved_micros,0);});
test('missed active deadline discards unconfirmed time and closes for review',async()=>{await start();await observe('active',0);await db.exec("update jd_usage_runs set observed_at=clock_timestamp()-interval '40 seconds',deadline=clock_timestamp()-interval '10 seconds'");const r=await observe('active',1);assert.equal(r.status,'review_required');assert.equal(r.active_microseconds,0);await assert.rejects(observe('active',2),e=>e.code==='40001');});
test('active deadline is bounded by remaining budget and job lease',async()=>{await configure(10);await reserve(10);await db.query("update jd_execution_jobs set status='running',lease_token=$1,lease_owner='fixture',lease_expires_at=clock_timestamp()+interval '90 seconds'",[lease]);const r=await observe('active',0);assert.ok(Date.parse(r.deadline)-Date.parse(r.observed_at)<=36);});
test('authorisation is checked again after role or tenant changes',async()=>{await start();await db.query("update profiles set role='staff' where id=$1",[owner]);await assert.rejects(observe('active',0),e=>e.code==='42501');await assert.rejects(configure(1000000,1),e=>e.code==='42501');});
test('reconciliation refuses running job and then releases terminal reservation without inventing time',async()=>{await start();await observe('active',0);await elapsed(20);await assert.rejects(rpc('jd_reconcile_usage',[owner,job,id(request++)]),e=>e.code==='40001');await terminal('failed');const req=id(request++),r=await rpc('jd_reconcile_usage',[owner,job,req]);assert.equal(r.status,'review_required');assert.equal(r.estimate_micros,0);assert.deepEqual(await rpc('jd_reconcile_usage',[owner,job,req]),r);const s=await snapshot();assert.equal(s.balanced,true);assert.equal(s.reserved_micros,0);});
test('completed zero-work reservation can be reconciled but never automatically billed',async()=>{await configure();await reserve();await terminal();const r=await rpc('jd_reconcile_usage',[owner,job,id(request++)]);assert.equal(r.charged,false);assert.equal((await snapshot()).invoice_created,false);});
test('audit failures roll back both reservation and financial counters',async()=>{await configure();await db.exec("create function usage_reject_audit() returns trigger language plpgsql as $$begin raise exception 'fixture audit unavailable';end$$;create trigger usage_reject_audit before insert on jd_audit_events for each row execute function usage_reject_audit()");try{await assert.rejects(reserve());assert.equal((await snapshot()).reserved_micros,0);assert.equal((await snapshot()).runs.length,0);}finally{await db.exec('drop trigger usage_reject_audit on jd_audit_events;drop function usage_reject_audit()');}});
test('reconciliation detects tampered derived counters without concealing drift',async()=>{await configure();await reserve();await db.exec('update jd_usage_accounts set reserved_micros=1');assert.equal((await snapshot()).balanced,false);});
test('persist evidence from actual synthetic reservation/observation/settlement chain',async()=>{
 await start();await observe('active',0);await elapsed(1);await observe('external_wait',1);await elapsed(20);await observe('closed',2);await terminal();
 const records={scope:'Local synthetic PGlite only. Fixture timestamps adjusted by test owner, never caller timestamps. No provider, charge or hired employee.',snapshot:await snapshot(),events:(await db.query('select kind,receipt,created_at from jd_usage_events order by created_at')).rows,audit:(await db.query("select event_type,event_json from jd_audit_events where event_type like 'usage.%' order by created_at")).rows};
 assert.equal(records.snapshot.balanced,true);
 if(process.env.JD_USAGE_EVIDENCE_DIR){mkdirSync(process.env.JD_USAGE_EVIDENCE_DIR,{recursive:true});writeFileSync(`${process.env.JD_USAGE_EVIDENCE_DIR}/synthetic-ledger.json`,JSON.stringify(records,null,2)+'\n');}
});

test('populated rollback refuses to erase usage evidence',async()=>{await configure();try{await assert.rejects(db.exec(read('supabase/rollback/20261117120000_jd_usage_ledger.rollback.sql')),/retained records/);}finally{await db.exec('rollback');}assert.equal((await snapshot()).configured,true);});
test('empty rollback/reapply preserves existing execution and audit tables',async()=>{await db.exec(read('supabase/rollback/20261117120000_jd_usage_ledger.rollback.sql'));try{await assert.rejects(db.query('select * from jd_usage_runs'),e=>e.code==='42P01');assert.equal((await db.query('select count(*)::int as n from jd_execution_jobs')).rows[0].n,1);}finally{await db.exec(read(migration));}});
test('audit failure at settlement rolls back time, sequence and account totals',async()=>{
 await start();await observe('active',0);await elapsed(1);
 await db.exec("create function usage_reject_audit() returns trigger language plpgsql as $$begin raise exception 'fixture audit unavailable';end$$;create trigger usage_reject_audit before insert on jd_audit_events for each row execute function usage_reject_audit()");
 try{await assert.rejects(observe('closed',1));const s=await snapshot();assert.equal(s.runs[0].sequence,1);assert.equal(s.runs[0].active_microseconds,0);assert.equal(s.reserved_micros,500000);assert.equal(s.accrued_micros,0);}finally{await db.exec('drop trigger usage_reject_audit on jd_audit_events;drop function usage_reject_audit()');}
});
test('tenant budget combines reservations for different jobs',async()=>{
 await configure(100);await reserve(60);
 await db.query("insert into jd_automation_runs(id,school_id,requested_by,status,idempotency_key,request_text) values($1,$2,$3,'queued','second','Synthetic second job')",[id(60),tenant,owner]);
 await db.query("insert into jd_execution_jobs(id,school_id,run_id,requested_by,idempotency_key) values($1,$2,$3,$4,'second')",[id(61),tenant,id(60),owner]);
 await assert.rejects(reserve(41,owner,id(request++),id(61)),e=>e.code==='54000');
 const r=await rpc('jd_reserve_usage',[owner,id(request++),id(61),'distinct-subject',40]);assert.equal(r.reservation_micros,40);assert.equal((await snapshot()).reserved_micros,100);
});

// Real authenticated HTTP dispatch -> service -> actual SQL RPC, synthetic auth only.
const {handleUsage}=await import('../supabase/functions/_shared/jd-usage-service.ts');
const {createUsageObserver}=await import('../supabase/functions/_shared/jd-usage-observer.mjs');
const {transformWithOxc}=await import('vite');
const {mkdtempSync,rmSync}=await import('node:fs');
const {pathToFileURL}=await import('node:url');
mkdirSync('node_modules/.cache',{recursive:true});const tmp=mkdtempSync(`${process.cwd()}/node_modules/.cache/usage-http-`);
const source=read('supabase/functions/jd-automation/index.ts').replace(/^import .*;\n/gm,'');
writeFileSync(`${tmp}/handler.mjs`,(await transformWithOxc(`export function makeHandler(createClient,handleUsage,enabled){let handler;const Deno={env:{get:key=>key==='JD_USAGE_SHADOW_ENABLED'?String(enabled):key},serve:fn=>handler=fn};${source}\nreturn handler;}`,'handler.ts')).code);
const {makeHandler}=await import(pathToFileURL(`${tmp}/handler.mjs`));
after(()=>rmSync(tmp,{recursive:true,force:true}));
const signatures={jd_configure_usage:['p_actor_id','p_request_id','p_expected_version','p_budget_micros','p_policy'],jd_reserve_usage:['p_actor_id','p_request_id','p_job_id','p_subject_reference','p_max_micros'],jd_usage_snapshot:['p_actor_id'],jd_reconcile_usage:['p_actor_id','p_job_id','p_request_id'],jd_observe_usage:['p_job_id','p_lease_token','p_request_id','p_expected_sequence','p_phase']};
function serviceClient(){return {from(table){assert.equal(table,'profiles');let who;const q={select(){return q;},eq(column,value){assert.equal(column,'id');who=value;return q;},async maybeSingle(){return{data:(await db.query('select * from profiles where id=$1',[who])).rows[0]};}};return q;},async rpc(name,args){try{return{data:await rpc(name,signatures[name].map(k=>args[k]))};}catch(e){return{error:{code:e.code,message:'PRIVATE_DATABASE_DIAGNOSTIC'}};}}};}
function http(who=owner,enabled=true){const service=serviceClient(),auth={auth:{getUser:async()=>({data:{user:who?{id:who}:null}})}};const handler=makeHandler((url,key)=>key==='SUPABASE_ANON_KEY'?auth:service,handleUsage,enabled);return async payload=>{const r=await handler(new Request('https://fixture.invalid',{method:'POST',headers:{Authorization:'Bearer synthetic','Content-Type':'application/json'},body:JSON.stringify(payload)}));return {status:r.status,body:await r.json()};};}
test('actual HTTP + worker adapter + SQL produces durable tenant-scoped shadow evidence',async()=>{
 const send=http();const config=await send({action:'usage.configure',confirm:true,requestId:id(request++),expectedVersion:0,budgetMicros:1000000,policy:'employee-active-v1-shadow'});assert.equal(config.status,200);
 const reserved=await send({action:'usage.reserve',confirm:true,requestId:id(request++),jobId:job,subjectReference:'synthetic-not-hired',maxMicros:500000});assert.equal(reserved.status,200);
 await db.query("update jd_execution_jobs set status='running',lease_token=$1,lease_owner='fixture',lease_expires_at=clock_timestamp()+interval '90 seconds'",[lease]);
 const observer=createUsageObserver({admin:serviceClient(),jobId:job,leaseToken:lease});await observer.observe('active');await elapsed(1);await observer.observe('external_wait');await elapsed(10);await observer.observe('closed');
 const snapshot=await send({action:'usage.snapshot',actorId:outsider,schoolId:other});assert.equal(snapshot.status,200);assert.equal(snapshot.body.usage.balanced,true);assert.ok(snapshot.body.usage.accrued_micros>0);assert.equal(snapshot.body.usage.reserved_micros,0);assert.ok(!JSON.stringify(snapshot).includes(lease));
 assert.equal((await http(outsider)({action:'usage.snapshot'})).body.usage.configured,false);
});
for(const [who,status] of [[null,401],[staff,403]])test(`HTTP authenticated usage boundary ${status}`,async()=>{assert.equal((await http(who)({action:'usage.configure',actorId:owner,role:'owner',confirm:true,requestId:id(request++),expectedVersion:0,budgetMicros:100,policy:'employee-active-v1-shadow'})).status,status);assert.equal((await snapshot()).configured,false);});
test('HTTP release off does not mutate records; worker observation action is not exposed',async()=>{assert.equal((await http(owner,false)({action:'usage.configure'})).status,409);assert.equal((await http()({action:'usage.observe',jobId:job,leaseToken:lease})).status,400);assert.equal((await snapshot()).configured,false);});

test('same subject cannot accrue overlapping job reservations in one tenant',async()=>{
 await configure();await reserve(100);
 await db.query("insert into jd_automation_runs(id,school_id,requested_by,status,idempotency_key,request_text) values($1,$2,$3,'queued','second','Synthetic second job')",[id(60),tenant,owner]);
 await db.query("insert into jd_execution_jobs(id,school_id,run_id,requested_by,idempotency_key) values($1,$2,$3,$4,'second')",[id(61),tenant,id(60),owner]);
 await assert.rejects(rpc('jd_reserve_usage',[owner,id(request++),id(61),' synthetic-subject-not-hired ',100]),e=>e.code==='40001');assert.equal((await snapshot()).reserved_micros,100);
});
test('malformed existing job-to-run scope is rejected rather than trusting foreign keys independently',async()=>{await configure();await db.query('update jd_automation_runs set school_id=$1',[other]);await assert.rejects(reserve(100),e=>e.code==='42501');assert.equal((await snapshot()).reserved_micros,0);});

test('existing runtime + worker wrapper + actual SQL excludes model wait and persists final estimate',async()=>{
 const {runAgent}=await import('../supabase/functions/_shared/jd-agent-runtime.ts');
 const {runWithShadowUsage}=await import('../supabase/functions/_shared/jd-usage-observer.mjs');
 await start();
 const base=serviceClient(),admin={...base,from(table){
  if(table==='jd_usage_runs'){const filters=[];const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},async maybeSingle(){assert.deepEqual(filters,[['job_id',job],['school_id',tenant]]);return{data:(await db.query('select job_id,school_id,status,sequence from jd_usage_runs where job_id=$1 and school_id=$2',[job,tenant])).rows[0]};}};return q;}
  assert.equal(table,'jd_business_memory');const q={select(){return q;},eq(){return q;},order(){return q;},async limit(){return{data:[]};}};return q;
 }};
 const oldFetch=globalThis.fetch,oldDeno=globalThis.Deno;globalThis.Deno={env:{get:()=>undefined}};
 globalThis.fetch=async()=>{
  assert.equal((await db.query('select phase from jd_usage_runs')).rows[0].phase,'external_wait');
  await elapsed(20); // Synthetic provider wait is excluded even when long.
  const response={id:'synthetic-provider-response',status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'Synthetic metered response, not operational employee evaluation.'}]}]};
  return new Response('data: '+JSON.stringify({type:'response.completed',response})+'\n\ndata: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}});
 };
 try{
  const result=await runWithShadowUsage({admin,jobId:job,schoolId:tenant,leaseToken:lease,enabled:true,run:onUsagePhase=>runAgent({message:'Synthetic task',history:[],context:{admin,userId:owner,schoolId:tenant,role:'owner'},apiKey:'synthetic',model:'synthetic',onUsagePhase})});assert.equal(result.status,'completed');
  const state=await snapshot();assert.equal(state.balanced,true);assert.equal(state.runs[0].status,'settled');assert.ok(state.runs[0].active_microseconds<20000000);assert.equal(state.reserved_micros,0);
  if(process.env.JD_USAGE_EVIDENCE_DIR)writeFileSync(`${process.env.JD_USAGE_EVIDENCE_DIR}/runtime-ledger.json`,JSON.stringify({scope:'Actual runtime and SQL with synthetic auth, fake model stream and fixture-adjusted excluded wait; not a real provider/employee evaluation.',result,snapshot:state,observations:(await db.query("select receipt from jd_usage_events where kind='observe' order by created_at")).rows},null,2)+'\n');
 }finally{globalThis.fetch=oldFetch;globalThis.Deno=oldDeno;}
});

test('on-disk ledger and idempotent receipts survive database close/reopen',async()=>{
 const directory=mkdtempSync(`${process.cwd()}/node_modules/.cache/usage-durable-`);let disk;
 try{
  disk=new PGlite(directory);
  await disk.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table schools(id uuid primary key);create table profiles(id uuid primary key,school_id uuid,role text);');
  for(const table of ['jd_conversations','jd_automation_runs','jd_automation_steps','jd_approvals','jd_audit_events'])await disk.exec(ddl(control,table));
  await disk.exec(ddl('supabase/migrations/20261111085150_jd_durable_execution_jobs.sql','jd_execution_jobs'));
  await disk.exec(read(migration));await disk.query('insert into schools values($1)',[tenant]);await disk.query('insert into auth.users values($1)',[owner]);await disk.query("insert into profiles values($1,$2,'owner')",[owner,tenant]);
  await disk.exec('set role service_role');
  const args=[owner,id(95),0,1000000,'employee-active-v1-shadow'];
  const first=(await disk.query('select jd_configure_usage($1,$2,$3,$4,$5) as result',args)).rows[0].result;
  await disk.exec('reset role');
  await disk.query("insert into jd_automation_runs(id,school_id,requested_by,status,idempotency_key,request_text) values($1,$2,$3,'queued','durable','Synthetic durable task')",[run,tenant,owner]);
  await disk.query("insert into jd_execution_jobs(id,school_id,run_id,requested_by,idempotency_key) values($1,$2,$3,$4,'durable')",[job,tenant,run,owner]);
  await disk.exec('set role service_role');
  await disk.query('select jd_reserve_usage($1,$2,$3,$4,$5)',[owner,id(96),job,'synthetic-durable',500000]);
  await disk.exec('reset role');
  await disk.query("update jd_execution_jobs set status='running',lease_token=$1,lease_owner='fixture',lease_expires_at=clock_timestamp()+interval '90 seconds'",[lease]);
  await disk.exec('set role service_role');
  await disk.query("select jd_observe_usage($1,$2,$3,0,'active')",[job,lease,id(97)]);
  await disk.exec("reset role;update jd_usage_runs set observed_at=clock_timestamp()-interval '1 second',deadline=clock_timestamp()+interval '10 seconds';set role service_role");
  const closed=(await disk.query("select jd_observe_usage($1,$2,$3,1,'closed') as result",[job,lease,id(98)])).rows[0].result;
  assert.ok(closed.estimate_micros>0);
  await disk.close();disk=new PGlite(directory);
  await disk.exec('set role service_role');
  const replay=(await disk.query('select jd_configure_usage($1,$2,$3,$4,$5) as result',args)).rows[0].result;
  assert.deepEqual((await disk.query("select jd_observe_usage($1,$2,$3,1,'closed') as result",[job,lease,id(98)])).rows[0].result,closed);
  assert.deepEqual(replay,first);assert.equal((await disk.query('select count(*)::int as n from jd_usage_events')).rows[0].n,4);
  const snapshot=(await disk.query('select jd_usage_snapshot($1) as result',[owner])).rows[0].result;assert.equal(snapshot.configured,true);assert.equal(snapshot.balanced,true);
  if(process.env.JD_USAGE_EVIDENCE_DIR)writeFileSync(`${process.env.JD_USAGE_EVIDENCE_DIR}/reopened-ledger.json`,JSON.stringify({scope:'Synthetic on-disk PGlite close/reopen, not hosted PostgreSQL crash recovery.',first,replay,snapshot},null,2)+'\n');
 }finally{if(disk&&!disk.closed)await disk.close();rmSync(directory,{recursive:true,force:true});}
});
