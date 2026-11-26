// Run-capabilities contract (roadmap sequence 1–2): the bridge between a
// durable run and the skills/autonomy stack. Real SQL in isolated PGlite;
// synthetic tenants and synthetic skill fixtures only — never real agents.
import test,{before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {preauthorizeRunSkillCosts,readRunDiscoveryPlan,runSkillRequestKey} from '../supabase/functions/_shared/jd-run-capabilities.ts';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const admin=id(1),second=id(2),staff=id(3),other=id(4),tenant=id(10),otherTenant=id(11);
const db=new PGlite();let n;
const read=p=>readFileSync(p,'utf8');
const COMMIT='a'.repeat(40);
const manifest=over=>({schemaVersion:'1',name:'Invoice Reconciler',description:'Reconciles supplier invoices against the ledger with JD-verified evidence.',
 version:'1.0.0',license:'Apache-2.0',category:'finance',tags:['synthetic','invoice'],
 entrypoint:'SKILL.md',instructionText:'Reconcile supplier invoices against the ledger. Produce a JD-verified summary and never move money.',
 fileCount:2,totalBytes:2048,content_hash:'c'.repeat(64),
 files:[{path:'SKILL.md',bytes:1024,role:'instruction',executed:false},{path:'LICENSE.txt',bytes:12,role:'asset',executed:false}],
 source:{kind:'autonomous_github',originalFilename:'xlsx-a1b2c3d4.zip'},...over});
const report=over=>({kind:'skills_package_report',status:'needs_review',archiveBytes:2048,entryCount:2,
 summary:'Autonomous acquisition inspected clean; publication authorised by policy jd-autonomous-v1.',errors:[],warnings:[],findings:[],
 license:{declared:'Apache-2.0',licenseFile:true,status:'declared_with_license_file'},packageHash:'b'.repeat(64),manifestHash:'c'.repeat(64),...over});
const plan=over=>({objective:'Reconcile supplier invoices against the ledger and report risks.',
 skills:[{id:'invoice-reconciler',name:'Invoice Reconciler',description:'Reconciles supplier invoices.',expected_seconds:600,score:5}],
 roles:['finance_analyst'],estimated_seconds:1200,basis:'allowlist_source_index_estimate_v1',...over});
async function initialise(){
 await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table schools(id uuid primary key);create table profiles(id uuid primary key,school_id uuid,role text,full_name text);create schema extensions;create function extensions.digest(data bytea,algorithm text) returns bytea language sql immutable as $$select sha256(data)$$;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);");
 const source=read('supabase/migrations/20261111085143_jd_autonomous_automation.sql');
 for(const t of ['jd_conversations','jd_automation_runs','jd_automation_steps','jd_approvals','jd_audit_events'])await db.exec(source.match(new RegExp(`create table if not exists public\\.${t} \\([\\s\\S]*?\\n\\);`))[0]);
 await db.exec(read('supabase/migrations/20261122073215_jd_skills_catalog.sql'));
 await db.exec(read('supabase/migrations/20261122190743_jd_skills_autonomous.sql'));
 await db.exec(read('supabase/migrations/20261122222208_jd_discovery_autonomy.sql'));
 await db.exec(read('supabase/migrations/20261123141255_jd_run_discovery_link.sql'));
 await db.query('insert into schools values($1),($2)',[tenant,otherTenant]);
 for(const [who,school,role] of [[admin,tenant,'owner'],[second,tenant,'admin'],[staff,tenant,'manager'],[other,otherTenant,'owner']]){
  await db.query('insert into auth.users values($1)',[who]);await db.query('insert into profiles values($1,$2,$3,$4)',[who,school,role,'Synthetic actor']);
 }
}
before(initialise);
beforeEach(async()=>{n=100;await db.exec('reset role;truncate jd_skill_packages,jd_skill_imports,jd_skills,jd_skill_versions,jd_skill_reviews,jd_skill_run_references,jd_skill_requests,jd_skill_acquisitions,jd_agent_time_ledger,jd_workspace_autonomy,jd_agent_playbooks,jd_discovery_sessions,jd_audit_events,jd_automation_runs cascade');});
after(()=>db.close());
async function rpc(name,args,role='service_role'){
 await db.exec(`set role ${role}`);
 try{return(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as result`,args.map(x=>x!==null&&typeof x==='object'?JSON.stringify(x):x))).rows[0].result;}
 finally{await db.exec('reset role');}
}
// Minimal supabase-js-shaped admin over PGlite: rpc(name,args) plus the
// from/select/eq/in/order/limit/maybeSingle chain the runtime modules use.
const client=(pg,role='service_role')=>({
 async rpc(name,args){
  await pg.exec(`set role ${role}`);
  try{
   const list=Array.isArray(args)?args:Object.values(args);
   const placeholders=list.map((_,i)=>'$'+(i+1)).join(',');
   const {rows,fields}=await pg.query(`select public.${name}(${placeholders}) as result`,list.map(x=>x!==null&&typeof x==='object'?JSON.stringify(x):x));
   const value=rows[0]?.result;
   // JSON columns come back as strings through some drivers; normalise objects.
   const data=(value&&typeof value==='object')?value:(typeof value==='string'?JSON.parse(value):value);
   return {data,error:null};
  }catch(e){return {data:null,error:{code:e.code||'XX000',message:e.message}};}
  finally{await pg.exec('reset role');}
 },
 from(table){
  const state={table,cols:'*',filters:[],order:null,limitN:null,single:false};
  const exec=async()=>{
   await pg.exec(`set role ${role}`);
   try{
    let sql=`select ${state.cols} from public.${state.table}`;
    const params=[];
    for(const f of state.filters){
     if(f.op==='in'){
      const placeholders=f.value.map(v=>{params.push(v);return `$${params.length}`;}).join(',');
      sql+=`${params.length===f.value.length?' where':' and'} ${f.col} in (${placeholders})`;
     }else{
      params.push(f.value);
      sql+=`${params.length===1?' where':' and'} ${f.col} = $${params.length}`;
     }
    }
    if(state.order)sql+=` order by ${state.order.col} ${state.order.ascending===false?'desc':'asc'}`;
    sql+=` limit ${state.limitN??1}`;
    const {rows}=await pg.query(sql,params);
    const normalise=r=>{const o={...r};for(const k of Object.keys(o))if(typeof o[k]==='string'&&(o[k].startsWith('{')||o[k].startsWith('[')))try{o[k]=JSON.parse(o[k]);}catch{}return o;};
    const out=rows.map(normalise);
    return state.single?{data:out[0]||null,error:null}:{data:out,error:null};
   }catch(e){return {data:null,error:{code:e.code||'XX000',message:e.message}};}
   finally{await pg.exec('reset role');}
  };
  const chain={
   select(cols){state.cols=cols||'*';return chain;},
   eq(col,value){state.filters.push({col,op:'=',value});return chain;},
   in(col,values){state.filters.push({col,op:'in',value:values});return chain;},
   order(col,{ascending=true}={}){state.order={col,ascending};return chain;},
   limit(n){state.limitN=n;return chain;},
   maybeSingle(){state.single=true;state.limitN=1;return exec();},
   // supabase-js builders are thenable: awaiting the chain executes it.
   then(onFulfilled,onRejected){return exec().then(onFulfilled,onRejected);},
   catch(onRejected){return exec().catch(onRejected);},
  };
  return chain;
 },
});
const expectFail=async(promise,code)=>{
 try{await promise;}catch(e){if(code&&e.code!==code)throw Error(`Expected ${code}, got ${e.code||'(none)'}: ${e.message}`);return e.message||'failed';}
 throw Error(`Expected failure ${code||''} but the call succeeded`);
};
const makeRun=async(who=admin,where=tenant,text='Please reconcile supplier invoices against the ledger and report the risks.')=>{
 const runId=id(n++);
 await db.query('insert into jd_automation_runs(id,school_id,requested_by,request_text) values($1,$2,$3,$4)',[runId,where,who,text]);
 return runId;
};
const acquireAndPublish=async(request=id(n++))=>{
 const imp=(await rpc('jd_create_skill_import',[admin,request,'xlsx-a1b2c3d4.zip'])).import_id;
 await rpc('jd_complete_skill_import',[admin,id(n++),imp,'b'.repeat(64),report(),manifest()]);
 const skillRow=(await db.query('select id,current_version from jd_skills where school_id=$1',[tenant])).rows[0];
 await rpc('jd_acquire_publish_skill',[admin,id(n++),imp,
  {repo:'anthropics/skills',ref:'main',commit:COMMIT,path:'skills/xlsx',policy:'jd-autonomous-v1'},
  'Autonomous acquisition under policy jd-autonomous-v1; validated clean; never executed.']);
 return skillRow;
};
const setAutonomy=async(mode,ceiling=3600)=>rpc('jd_set_workspace_autonomy',[admin,id(n++),mode,ceiling,10000]);

test('request keys are deterministic and uuid-shaped; different inputs differ',async()=>{
 const a=await runSkillRequestKey(id(20),id(30),2,600);
 const b=await runSkillRequestKey(id(20),id(30),2,600);
 const c=await runSkillRequestKey(id(20),id(30),2,601);
 assert.equal(a,b);assert.notEqual(a,c);
 assert.match(a,/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
});
test('discovery links to the run: same-tenant run recorded, foreign run refused, default still works',async()=>{
 const runId=await makeRun();
 await setAutonomy('autonomous');
 const started=await rpc('jd_start_discovery',[admin,id(n++),'Reconcile supplier invoices against the ledger.',plan(),'autonomous',runId]);
 const row=(await db.query('select run_id from jd_discovery_sessions where id=$1',[started.session_id])).rows[0];
 assert.equal(row.run_id,runId);
 await expectFail(rpc('jd_start_discovery',[admin,id(n++),'Reconcile supplier invoices against the ledger.',plan(),'autonomous',id(90)]),'42501');
 const legacy=await rpc('jd_start_discovery',[admin,id(n++),'Reconcile supplier invoices against the ledger.',plan(),'autonomous']);
 const legacyRow=(await db.query('select run_id from jd_discovery_sessions where id=$1',[legacy.session_id])).rows[0];
 assert.equal(legacyRow.run_id,null);
});
test('readRunDiscoveryPlan: linked run wins; reused same-idea session is a fallback; none returns null',async()=>{
 const runId=await makeRun();
 await setAutonomy('autonomous');
 assert.equal(await readRunDiscoveryPlan(client(db),tenant,runId,'Please reconcile supplier invoices.'),null);
 const started=await rpc('jd_start_discovery',[admin,id(n++),'Reconcile supplier invoices against the ledger.',plan(),'autonomous',runId]);
 const linked=await readRunDiscoveryPlan(client(db),tenant,runId);
 assert.equal(linked.session_id,started.session_id);assert.deepEqual(linked.roles,['finance_analyst']);
 assert.equal(linked.skills[0].expected_seconds,600);
 // A run without linkage but with the same objective text reuses the newest session.
 const runB=await makeRun(admin,tenant,'Reconcile supplier invoices against the ledger.');
 const reused=await readRunDiscoveryPlan(client(db),tenant,runB,'Reconcile supplier invoices against the ledger.');
 assert.equal(reused.session_id,started.session_id);
 assert.equal(await readRunDiscoveryPlan(client(db),tenant,runB,'A completely different objective about hiring staff.'),null);
});
test('autonomous preauthorization confirms ledger time and unblocks jd_skills_load',async()=>{
 const runId=await makeRun();
 await setAutonomy('autonomous');
 const skill=await acquireAndPublish();
 const result=await preauthorizeRunSkillCosts({admin:client(db),schoolId:tenant,userId:admin,runId,requestText:'Please reconcile supplier invoices against the ledger and report the risks.'});
 assert.equal(result.mode,'autonomous');assert.equal(result.ceiling_stop,false);
 assert.equal(result.authorized.length,1);
 assert.equal(result.authorized[0].skill_id,skill.id);
 assert.equal(result.authorized[0].basis,'autonomous_preauthorized');
 const ledger=(await db.query('select estimated_seconds,basis,status from jd_agent_time_ledger where run_id=$1',[runId])).rows;
 assert.equal(ledger.length,1);assert.equal(ledger[0].basis,'autonomous_preauthorized');assert.equal(ledger[0].status,'confirmed');
 const loaded=await rpc('jd_skills_load',[admin,skill.id,skill.current_version,runId]);
 assert.equal(loaded.acquired,true);assert.equal(loaded.tools_granted,false);
 assert.equal((await db.query('select count(*)::int as c from jd_skill_run_references where run_id=$1',[runId])).rows[0].c,1);
});
test('assisted mode confirms through jd_confirm_run_skill_cost and load succeeds',async()=>{
 const runId=await makeRun();
 const skill=await acquireAndPublish();
 const result=await preauthorizeRunSkillCosts({admin:client(db),schoolId:tenant,userId:admin,runId,requestText:'Please reconcile supplier invoices against the ledger and report the risks.'});
 assert.equal(result.mode,'assisted');
 assert.equal(result.authorized[0].basis,'source_index_estimate');
 const loaded=await rpc('jd_skills_load',[admin,skill.id,skill.current_version,runId]);
 assert.equal(loaded.acquired,true);
 // Any workspace member may load for a tenant run; a foreign actor cannot.
 const member=await rpc('jd_skills_load',[second,skill.id,skill.current_version,runId]);
 assert.equal(member.acquired,true);
 await expectFail(rpc('jd_skills_load',[other,skill.id,skill.current_version,runId]),'42501');
});
test('the spend ceiling is a hard stop: 54000 surfaces as ceiling_stop with no ledger row',async()=>{
 const runId=await makeRun();
 await setAutonomy('autonomous',60);
 await acquireAndPublish();
 const result=await preauthorizeRunSkillCosts({admin:client(db),schoolId:tenant,userId:admin,runId,requestText:'Please reconcile supplier invoices against the ledger and report the risks.'});
 assert.equal(result.ceiling_stop,true);
 assert.equal(result.authorized.length,0);
 assert.deepEqual(result.skipped.map(s=>s.reason),['spend_ceiling']);
 assert.equal((await db.query('select count(*)::int as c from jd_agent_time_ledger')).rows[0].c,0);
});
test('replays are idempotent: the deterministic key returns the receipt and writes one ledger row',async()=>{
 const runId=await makeRun();
 await setAutonomy('autonomous');
 const skill=await acquireAndPublish();
 const args={admin:client(db),schoolId:tenant,userId:admin,runId,requestText:'Please reconcile supplier invoices against the ledger and report the risks.'};
 const first=await preauthorizeRunSkillCosts(args);
 const again=await preauthorizeRunSkillCosts(args);
 assert.equal(first.authorized.length,1);assert.equal(again.authorized.length,1);
 assert.deepEqual(first.authorized,again.authorized);
 assert.equal((await db.query('select count(*)::int as c from jd_agent_time_ledger')).rows[0].c,1);
});
test('curated (non-acquired) skills never preauthorize agentic time and load without a ledger row',async()=>{
 const runId=await makeRun();
 const skillId=id(n++);
 await db.query("insert into jd_skills(id,school_id,name,category,status,current_version,created_by) values($1,$2,'Invoice Reconciler','finance','published',1,$3)",[skillId,tenant,admin]);
 await db.query("insert into jd_skill_versions(skill_id,school_id,version,manifest,content_hash,package_id,created_by) values($1,$2,1,$3,$4,gen_random_uuid(),$5)",
  [skillId,tenant,JSON.stringify(manifest()),'d'.repeat(64),admin]);
 const result=await preauthorizeRunSkillCosts({admin:client(db),schoolId:tenant,userId:admin,runId,requestText:'Please reconcile supplier invoices against the ledger and report the risks.'});
 assert.deepEqual(result.authorized,[]);
 assert.ok(result.skipped.some(s=>s.reason==='not_acquired'));
 assert.equal((await db.query('select count(*)::int as c from jd_agent_time_ledger')).rows[0].c,0);
 const loaded=await rpc('jd_skills_load',[admin,skillId,1,runId]);
 assert.equal(loaded.acquired,false);
});
test('malformed or foreign context returns an idle result without throwing',async()=>{
 for(const bad of [
  {admin:client(db),schoolId:'',userId:admin,runId:id(20),requestText:'Reconcile supplier invoices.'},
  {admin:client(db),schoolId:tenant,userId:'',runId:id(20),requestText:'Reconcile supplier invoices.'},
  {admin:client(db),schoolId:tenant,userId:admin,runId:'not-a-uuid',requestText:'Reconcile supplier invoices.'},
  {admin:client(db),schoolId:tenant,userId:admin,runId:id(20),requestText:'hi'},
  {admin:null,schoolId:tenant,userId:admin,runId:id(20),requestText:'Reconcile supplier invoices.'},
 ]){
  const result=await preauthorizeRunSkillCosts(bad);
  assert.deepEqual(result.authorized,[]);
 }
 const result=await preauthorizeRunSkillCosts({admin:client(db),schoolId:otherTenant,userId:other,runId:id(20),requestText:'Reconcile supplier invoices.'});
 assert.deepEqual(result.authorized,[]);
});
