// Phase 7: workspace autonomy dial, discovery agent, specialist playbooks and
// agentic-time billing plumbing. Real candidate SQL in isolated PGlite plus
// planner and client read-back units. Nothing is executed; all plans and
// packages are synthetic text.
import test,{before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {planDiscovery} from '../supabase/functions/_shared/jd-discovery-agent.ts';
import {discoveryRequest} from '../src/software-factory/discovery-client.mjs';

const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const admin=id(1),second=id(2),staff=id(3),other=id(4),tenant=id(10),otherTenant=id(11);
const db=new PGlite();
let n;
const read=p=>readFileSync(p,'utf8');
const COMMIT='a'.repeat(40);

const manifest=over=>({schemaVersion:'1',name:'Invoice Reconciler',description:'Reconciles supplier invoices against the ledger with JD-verified evidence.',
 version:'1.0.0',license:'Apache-2.0',category:'finance',tags:['synthetic'],specialistRoles:['finance_analyst'],
 entrypoint:'SKILL.md',instructionText:'Reconcile supplier invoices against the ledger. Produce a JD-verified summary and never move money.',
 fileCount:2,totalBytes:2048,content_hash:'c'.repeat(64),
 files:[{path:'SKILL.md',bytes:1024,role:'instruction',executed:false},{path:'LICENSE.txt',bytes:12,role:'asset',executed:false}],
 source:{kind:'autonomous_github',originalFilename:'xlsx-a1b2c3d4.zip'},...over});
const report=over=>({kind:'skills_package_report',status:'needs_review',archiveBytes:2048,entryCount:2,
 summary:'Autonomous acquisition inspected clean; publication authorised by policy jd-autonomous-v1.',errors:[],warnings:[],findings:[],
 license:{declared:'Apache-2.0',licenseFile:true,status:'declared_with_license_file'},packageHash:'b'.repeat(64),manifestHash:'c'.repeat(64),...over});

async function initialise(){
 await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table schools(id uuid primary key);create table profiles(id uuid primary key,school_id uuid,role text,full_name text);create schema extensions;create function extensions.digest(data bytea,algorithm text) returns bytea language sql immutable as $$select sha256(data)$$;create schema storage;create table public.jd_billing_subscriptions(id uuid primary key default gen_random_uuid(),school_id uuid not null unique references public.schools(id),status text not null,currency text not null default 'USD',trial_ends_at timestamptz);create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);");
 const source=read('supabase/migrations/20261111085143_jd_autonomous_automation.sql');
 for(const t of ['jd_conversations','jd_automation_runs','jd_automation_steps','jd_approvals','jd_audit_events'])await db.exec(source.match(new RegExp(`create table if not exists public\\.${t} \\([\\s\\S]*?\\n\\);`))[0]);
 await db.exec(read('supabase/migrations/20261122120000_jd_skills_catalog.sql'));
 await db.exec(read('supabase/migrations/20261122210000_jd_skills_autonomous.sql'));
 await db.exec(read('supabase/migrations/20261122220000_jd_discovery_autonomy.sql'));
 await db.exec(read('supabase/migrations/20261124130000_jd_specialist_run_approval_billing.sql'));
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
const expectFail=async (promise,code)=>{
 try{await promise;}catch(e){if(code&&e.code!==code)throw Error(`Expected ${code}, got ${e.code||'(none)'}: ${e.message}`);return e.message||'failed';}
 throw Error(`Expected failure ${code||''} but the call succeeded`);
};
const acquireAndPublish=async(request=id(n++))=>{
 const imp=(await rpc('jd_create_skill_import',[admin,request,'xlsx-a1b2c3d4.zip'])).import_id;
 await rpc('jd_complete_skill_import',[admin,id(n++),imp,'b'.repeat(64),report(),manifest()]);
 const skillRow=(await db.query('select id,current_version from jd_skills where school_id=$1',[tenant])).rows[0];
 return rpc('jd_acquire_publish_skill',[admin,id(n++),imp,
  {repo:'anthropics/skills',ref:'main',commit:COMMIT,path:'skills/xlsx',policy:'jd-autonomous-v1'},
  'Autonomous acquisition under policy jd-autonomous-v1; validated clean; never executed.']).then(()=>skillRow);
};

test('planner maps the idea onto allowlisted skills and real specialist roles',()=>{
 const plan=planDiscovery('Reconcile this month supplier invoices against the ledger and draft the leadership update');
 assert.ok(plan.skills.some(s=>s.id==='xlsx'));
 assert.ok(plan.roles.length>=1&&plan.roles.length<=3);
 assert.ok(plan.roles.every(r=>['business_advisor','research_analyst','finance_analyst','operations_planner','product_designer','software_engineer','security_reviewer','quality_assurance'].includes(r)));
 assert.equal(plan.basis,'allowlist_source_index_estimate_v1');
 assert.equal(plan.estimated_seconds,600+plan.skills.reduce((x,s)=>x+s.expected_seconds,0));
 assert.throws(()=>planDiscovery('short'),/at least 10/);
 assert.throws(()=>planDiscovery('x'.repeat(4001)),/at least 10/);
});

test('autonomy dial: defaults, admin-only changes, audit and idempotent replay',async()=>{
 const defaults=await rpc('jd_read_workspace_autonomy',[staff]);
 assert.equal(defaults.mode,'assisted');assert.equal(defaults.defaults_applied,true);
 assert.equal(defaults.spend_ceiling_seconds,3600);assert.equal(defaults.agentic_rate_minor_per_hour,10000);
 await expectFail(rpc('jd_set_workspace_autonomy',[staff,id(n++),'autonomous',7200,15000]),'42501');
 await expectFail(rpc('jd_set_workspace_autonomy',[admin,id(n++),'yolo',7200,15000]),'22023');
 await expectFail(rpc('jd_set_workspace_autonomy',[admin,id(n++),'autonomous',10,15000]),'22023');
 const req=id(n++);
 const receipt=await rpc('jd_set_workspace_autonomy',[admin,req,'autonomous',7200,15000]);
 assert.equal(receipt.mode,'autonomous');assert.equal(receipt.billing_enabled,false);
 const replay=await rpc('jd_set_workspace_autonomy',[admin,req,'autonomous',7200,15000]);
 assert.deepEqual(replay,receipt);
 const audit=(await db.query("select count(*)::int as c from jd_audit_events where event_type='autonomy.mode_set' and school_id=$1",[tenant])).rows[0];
 assert.equal(audit.c,1);
 const reread=await rpc('jd_read_workspace_autonomy',[staff]);
 assert.equal(reread.mode,'autonomous');assert.equal(reread.defaults_applied,false);
});

test('discovery: assisted proposal flows with independent decision; autonomous proceeds',async()=>{
 await rpc('jd_set_workspace_autonomy',[admin,id(n++),'assisted',3600,10000]);
 const plan=planDiscovery('Prepare a monthly supplier invoice reconciliation against the ledger');
 await expectFail(rpc('jd_start_discovery',[admin,id(n++),'Prepare a monthly supplier invoice reconciliation against the ledger',
  JSON.parse(JSON.stringify(plan)),'autonomous']),'22023'); // mode mismatch
 await expectFail(rpc('jd_start_discovery',[admin,id(n++),'Prepare a monthly supplier invoice reconciliation against the ledger',
  {...plan,roles:['astronaut']},'assisted']),'22023');
 const started=await rpc('jd_start_discovery',[admin,id(n++),'Prepare a monthly supplier invoice reconciliation against the ledger',
  JSON.parse(JSON.stringify(plan)),'assisted']);
 assert.equal(started.status,'proposed');
 // requester self-decision must be refused: an independent administrator decides
 await expectFail(rpc('jd_decide_discovery',[admin,id(n++),started.session_id,'approve','Attempt to approve my own proposal.']),'42501');
 // second admin is the independent decider
 const decision=await rpc('jd_decide_discovery',[second,id(n++),started.session_id,'approve','Independent approval of the reconciliation proposal.']);
 assert.equal(decision.status,'approved');
 const receipt=await rpc('jd_complete_discovery',[admin,id(n++),started.session_id,
  {acquired:[{skill_id:started.session_id}],bound:[{role:plan.roles[0]}],skipped:[],errors:[]}]);
 assert.equal(receipt.status,'completed');
 await expectFail(rpc('jd_decide_discovery',[second,id(n++),started.session_id,'decline','Too late; the session already completed.']),'40001');
 await expectFail(db.query('delete from jd_discovery_sessions where id=$1',[started.session_id]).then(r=>r),'55000');
});

test('playbook binding requires a published current version',async()=>{
 await expectFail(rpc('jd_bind_agent_playbook',[admin,id(n++),'finance_analyst',id(50),1]),'42501');
 const skillRow=await acquireAndPublish();
 const receipt=await rpc('jd_bind_agent_playbook',[admin,id(n++),'finance_analyst',skillRow.id,skillRow.current_version]);
 assert.equal(receipt.bound,true);
 const replay=await rpc('jd_bind_agent_playbook',[admin,id(n++),'finance_analyst',skillRow.id,skillRow.current_version]);
 assert.equal(replay.bound,true);
 const rows=(await db.query('select count(*)::int as c from jd_agent_playbooks where school_id=$1 and skill_id=$2',[tenant,skillRow.id])).rows[0];
 assert.equal(rows.c,1);
 await expectFail(rpc('jd_bind_agent_playbook',[admin,id(n++),'astronaut',skillRow.id,1]),'22023');
});

test('autonomous preauthorisation: mode-gated, ceiling-bounded, audited',async()=>{
 const skillRow=await acquireAndPublish();
 const run=(await db.query("insert into jd_automation_runs(school_id,requested_by,status,request_text) values($1,$2,'queued','Synthetic discovery run') returning id",[tenant,admin])).rows[0].id;
 // Reset to assisted: authorisation refused
 await rpc('jd_set_workspace_autonomy',[admin,id(n++),'assisted',3600,10000]);
 await expectFail(rpc('jd_autonomous_cost_authorize',[admin,id(n++),run,skillRow.id,skillRow.current_version,1800]),'42501');
 await rpc('jd_set_workspace_autonomy',[admin,id(n++),'autonomous',3600,10000]);
 // Non-acquired skill refused
 await expectFail(rpc('jd_autonomous_cost_authorize',[admin,id(n++),run,id(51),1,1800]),'22023');
 const first=await rpc('jd_autonomous_cost_authorize',[admin,id(n++),run,skillRow.id,skillRow.current_version,1800]);
 assert.equal(first.basis,'autonomous_preauthorized');assert.equal(first.committed_seconds,1800);
 assert.equal(first.pricing,'computed_at_settlement');assert.equal(first.billing_enabled,false);
 // Second authorisation (different run) within ceiling succeeds; third breaches it (54000)
 const run2=(await db.query("insert into jd_automation_runs(school_id,requested_by,status,request_text) values($1,$2,'queued','Synthetic discovery run two') returning id",[tenant,admin])).rows[0].id;
 const secondAuth=await rpc('jd_autonomous_cost_authorize',[admin,id(n++),run2,skillRow.id,skillRow.current_version,1800]);
 assert.equal(secondAuth.committed_seconds,3600);
 const run3=(await db.query("insert into jd_automation_runs(school_id,requested_by,status,request_text) values($1,$2,'queued','Synthetic discovery run three') returning id",[tenant,admin])).rows[0].id;
 await expectFail(rpc('jd_autonomous_cost_authorize',[admin,id(n++),run3,skillRow.id,skillRow.current_version,60]),'54000');
 const audit=(await db.query("select count(*)::int as c from jd_audit_events where event_type='autonomy.cost_authorized'")).rows[0];
 assert.equal(audit.c,2);
});

test('manual confirmation is bounded by the ceiling and settlement maths is exact',async()=>{
 const skillRow=await acquireAndPublish();
 const run=(await db.query("insert into jd_automation_runs(school_id,requested_by,status,request_text) values($1,$2,'queued','Synthetic billing run') returning id",[tenant,admin])).rows[0].id;
 await rpc('jd_set_workspace_autonomy',[admin,id(n++),'assisted',3600,10000]);
 await expectFail(rpc('jd_confirm_run_skill_cost',[admin,id(n++),run,skillRow.id,skillRow.current_version,7200]),'54000');
 const confirm=await rpc('jd_confirm_run_skill_cost',[admin,id(n++),run,skillRow.id,skillRow.current_version,3600]);
 assert.equal(confirm.status,'confirmed');
 await db.query("update jd_automation_runs set status='running',started_at=clock_timestamp()-interval '120 seconds' where id=$1",[run]);
 await db.query("update jd_automation_runs set status='completed',completed_at=clock_timestamp() where id=$1",[run]);
 const summary=await rpc('jd_read_billing_summary',[admin]);
 assert.equal(summary.mode,'assisted');
 assert.ok(summary.actual_seconds>=100&&summary.actual_seconds<=125);
 assert.equal(summary.ledger_rows,1);
 assert.equal(summary.charging_enabled,false);
 assert.ok(summary.amount_minor_actual>=Math.floor(100*10000/3600)&&summary.amount_minor_actual<=Math.ceil(125*10000/3600));
 assert.equal(summary.hiring_enabled,false);
});

test('discovery client validates read-backs and enforces the charging boundary',async()=>{
 const invoke=async(_name,{body})=>{
  if(body.action==='autonomy.read')return{data:{autonomy:{mode:'autonomous',spend_ceiling_seconds:7200,agentic_rate_minor_per_hour:15000,currency:'USD',defaults_applied:false,hiring_enabled:false,execution_enabled:false,billing_enabled:false}}};
  if(body.action==='billing.summary')return{data:{billing:{mode:'autonomous',spend_ceiling_seconds:7200,agentic_rate_minor_per_hour:15000,currency:'USD',actual_seconds:120,confirmed_estimate_seconds:1800,ledger_rows:1,amount_minor_actual:333,charging_enabled:false,pricing_policy:'agentic-seconds-v1',hiring_enabled:false,execution_enabled:false,billing_enabled:false}}};
  if(body.action==='discovery.start')return{data:{discovery:{session_id:id(60),status:'completed',mode:'autonomous',plan:{skills:[{id:'xlsx',expected_seconds:1200}],roles:['finance_analyst']},estimated_seconds:1800,hiring_enabled:false,execution_enabled:false,billing_enabled:false}}};
  if(body.action==='discovery.decide')return{data:{receipt:{session_id:id(60),status:'approved',hiring_enabled:false,execution_enabled:false,billing_enabled:false}}};
  return{data:{error:'unexpected'}};
 };
 const client={functions:{invoke}};
 const role='admin';
 const autonomy=await discoveryRequest(client,role,{action:'autonomy.read'});
 assert.equal(autonomy.mode,'autonomous');
 const billing=await discoveryRequest(client,role,{action:'billing.summary'});
 assert.equal(billing.charging_enabled,false);
 const discovery=await discoveryRequest(client,role,{action:'discovery.start',confirm:true,requestId:id(61),idea:'Prepare a monthly supplier invoice reconciliation against the ledger'});
 assert.equal(discovery.status,'completed');
 // Charging lie rejected: a client/server claiming charging_enabled=true must fail
 const lying={functions:{invoke:async()=>({data:{billing:{mode:'autonomous',spend_ceiling_seconds:7200,agentic_rate_minor_per_hour:15000,currency:'USD',actual_seconds:0,confirmed_estimate_seconds:0,ledger_rows:0,amount_minor_actual:0,charging_enabled:true,pricing_policy:'agentic-seconds-v1',hiring_enabled:false,execution_enabled:false,billing_enabled:false}}})}};
 await assert.rejects(()=>discoveryRequest(lying,role,{action:'billing.summary'}),/charging boundary/);
 await assert.rejects(()=>discoveryRequest(client,role,{action:'discovery.decide',confirm:true,requestId:id(62),sessionId:id(63),decision:'maybe',note:'nonsense note here'}),/explicit decision/);
 await assert.rejects(()=>discoveryRequest(client,role,{action:'discovery.start',confirm:true,requestId:id(64),idea:'too short'}),/at least 10/);
 await assert.rejects(()=>discoveryRequest(client,'staff',{action:'autonomy.read'}),/membership/);
});

test('specialist quote verifies subscription, approval, run gate, time cap and settlement',async()=>{
 await db.query("insert into jd_billing_subscriptions(school_id,status,trial_ends_at) values($1,'trialing',clock_timestamp()+interval '2 days')",[tenant]);
 await rpc('jd_set_workspace_autonomy',[admin,id(n++),'assisted',3600,15000]);
 const proposal=await rpc('jd_specialist_proposal_create',[admin,id(n++),'research_analyst','Research the market, competitors, customer demand and pricing evidence for this product.',1800,1800]);
 assert.equal(proposal.status,'awaiting_approval');assert.equal(proposal.subscription_status,'trialing');assert.equal(proposal.rate_minor_per_hour,15000);assert.equal(proposal.estimated_amount_minor,7500);assert.equal(proposal.charging_enabled,false);
 const run=(await db.query("insert into jd_automation_runs(school_id,requested_by,status,request_text) values($1,$2,'queued','Approved specialist run') returning id",[tenant,admin])).rows[0].id;
 await expectFail(rpc('jd_specialist_run_start',[admin,run,'research_analyst']),'42501');
 await expectFail(rpc('jd_specialist_proposal_approve',[staff,id(n++),proposal.proposal_id,'approve']),'42501');
 const approved=await rpc('jd_specialist_proposal_approve',[admin,id(n++),proposal.proposal_id,'approve']);assert.equal(approved.status,'approved');
 const linked=await rpc('jd_specialist_proposal_link_run',[admin,id(n++),proposal.proposal_id,run]);assert.equal(linked.status,'linked');
 const started=await rpc('jd_specialist_run_start',[admin,run,'research_analyst']);assert.equal(started.allocated_seconds,1800);
 await db.query("update jd_specialist_run_proposals set started_at=clock_timestamp()-interval '31 minutes' where run_id=$1",[run]);
 const settled=await rpc('jd_specialist_run_settle',[admin,run,'timed_out']);assert.equal(settled.status,'timed_out');assert.equal(settled.actual_seconds,1800);assert.equal(settled.actual_amount_minor,7500);
 const summary=await rpc('jd_read_billing_summary',[admin]);assert.equal(summary.specialist_runs,1);assert.equal(summary.actual_seconds,1800);assert.equal(summary.amount_minor_actual,7500);assert.equal(summary.charging_enabled,false);
});

test('specialist quote rejects missing or expired subscription and ceiling overflow',async()=>{
 await expectFail(rpc('jd_specialist_proposal_create',[admin,id(n++),'research_analyst','Research the market, competitors, customer demand and pricing evidence for this product.',600,600]),'42501');
 await db.query("insert into jd_billing_subscriptions(school_id,status,trial_ends_at) values($1,'expired',clock_timestamp()-interval '1 day')",[tenant]);
 await expectFail(rpc('jd_specialist_proposal_create',[admin,id(n++),'research_analyst','Research the market, competitors, customer demand and pricing evidence for this product.',600,600]),'42501');
 await db.query("update jd_billing_subscriptions set status='active',trial_ends_at=null where school_id=$1",[tenant]);
 await rpc('jd_set_workspace_autonomy',[admin,id(n++),'assisted',600,15000]);
 await expectFail(rpc('jd_specialist_proposal_create',[admin,id(n++),'research_analyst','Research the market, competitors, customer demand and pricing evidence for this product.',900,900]),'54000');
});
