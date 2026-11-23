// Workforce activation contract (roadmap sequence 1–2): every specialist
// assignment persists an immutable, tenant-scoped record of the selected
// agent/version, skill version, task scope, tool allowlist, budget, status and
// outcome. Real SQL in isolated PGlite; synthetic tenants only.
import test,{before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite(),id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const owner=id(1),admin=id(2),staff=id(3),outside=id(4),tenant=id(10),other=id(11),runA=id(20),runB=id(21);
const read=p=>readFileSync(p,'utf8');
const MIG='supabase/migrations/20261124090000_jd_workforce_assignments.sql';
async function initialise(target){
 await target.exec("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table schools(id uuid primary key);create table profiles(id uuid primary key,school_id uuid,role text,full_name text);create schema extensions;create function extensions.digest(data bytea,algorithm text) returns bytea language sql immutable as $$select sha256(data)$$;");
 const source=read('supabase/migrations/20261111085143_jd_autonomous_automation.sql');
 for(const t of ['jd_conversations','jd_automation_runs','jd_automation_steps','jd_approvals','jd_audit_events'])await target.exec(source.match(new RegExp(`create table if not exists public\\.${t} \\([\\s\\S]*?\\n\\);`))[0]);
 await target.exec(read('supabase/migrations/20261111085145_jd_review_centre_foundation.sql').split('create index')[0]);
 await target.exec(read('supabase/migrations/20261114213713_jd_authorization_role_matrix.sql').match(/CREATE OR REPLACE FUNCTION public\.jd_decide_approval\([\s\S]*?\n\$function\$\n;/)[0]);
 await target.exec(read('supabase/migrations/20261117130000_jd_agent_registry.sql'));
 await target.exec(read(MIG));
 await target.query('insert into schools values($1),($2)',[tenant,other]);
 for(const [who,school,role] of [[owner,tenant,'owner'],[admin,tenant,'admin'],[staff,tenant,'staff'],[outside,other,'owner']]){await target.query('insert into auth.users values($1)',[who]);await target.query('insert into profiles values($1,$2,$3,$4)',[who,school,role,'Synthetic actor']);}
 await target.query('insert into jd_automation_runs(id,school_id,requested_by,request_text) values($1,$2,$3,$4),($5,$6,$7,$8)',[runA,tenant,owner,'Synthetic workforce run A',runB,other,outside,'Synthetic workforce run B']);
}
before(()=>initialise(db));
beforeEach(async()=>{await db.exec('reset role;truncate jd_workforce_assignments cascade');});
after(()=>db.close());
async function rpc(name,args,role='service_role'){await db.exec(`set role ${role}`);try{return(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as result`,args.map(x=>x&&typeof x==='object'?JSON.stringify(x):x))).rows[0].result;}finally{await db.exec('reset role');}}
const record=async(over={},{onConflict=false}={})=>{
 const r={school_id:tenant,run_id:runA,objective:'Assess the Q1 pricing decision and report risks.',agent_kind:'builtin',agent_ref:'business_advisor',agent_name:'Business Advisor',agent_version:null,content_hash:null,skill_name:null,skill_version:null,skill_content_hash:null,task:'Review the proposed pricing change against saved KPIs and report risks.',task_hash:'a1b2c3d4e5f60718',tool_allowlist:['get_workspace_overview'],budget:{max_model_rounds:4,max_output_tokens:2500},status:'report_returned',outcome:{report:'Draft assessment; requires JD verification.',rounds_used:2},tool_evidence:[{tool:'get_workspace_overview',calls:1}],verification_status:'pending_jd_verification',...over};
 const cols=Object.keys(r);
 await db.query(`insert into jd_workforce_assignments(${cols.join(',')}) values(${cols.map((_,i)=>'$'+(i+1)).join(',')})${onConflict?' on conflict (school_id,run_id,agent_kind,agent_ref,task_hash) do nothing':''}`,cols.map(c=>r[c]));
};
test('records are append-only: mutation is impossible and clients cannot read directly',async()=>{
 await record();
 await assert.rejects(()=>db.query("update jd_workforce_assignments set status='failed' where agent_ref='business_advisor'"),e=>e.code==='55000');
 await assert.rejects(()=>db.query("delete from jd_workforce_assignments where agent_ref='business_advisor'"),e=>e.code==='55000');
 await db.exec('set role service_role');
 await assert.rejects(()=>db.query("update jd_workforce_assignments set status='failed'"),e=>e.code==='42501');
 await db.query('select count(*) from jd_workforce_assignments');
 await db.exec('reset role');
 await db.exec('set role authenticated');
 await assert.rejects(()=>db.query('select * from jd_workforce_assignments'),e=>e.code==='42501');
 await db.exec('reset role');
});
test('re-deploying the same assignment is idempotent; distinct tasks and runs are not collapsed',async()=>{
 await record();
 await assert.rejects(()=>record(),e=>e.code==='23505');
 await record({},{onConflict:true});
 let n=(await db.query('select count(*)::int as n from jd_workforce_assignments')).rows[0].n;
 assert.equal(n,1);
 await record({task_hash:'b2c3d4e5f6071809',task:'Second distinct task for the same specialist.'},{onConflict:true});
 n=(await db.query('select count(*)::int as n from jd_workforce_assignments')).rows[0].n;
 assert.equal(n,2);
 await record({run_id:runB},{onConflict:true});
 n=(await db.query('select count(*)::int as n from jd_workforce_assignments')).rows[0].n;
 assert.equal(n,3);
});
test('read-back RPC is administrator-only and tenant-scoped',async()=>{
 await record();
 await record({school_id:other,run_id:runB,agent_ref:'research_analyst',agent_name:'Research Analyst',task_hash:'c3d4e5f60718091a'});
 const mine=await rpc('jd_read_workforce_assignments',[owner,20]);
 assert.equal(mine.length,1);assert.equal(mine[0].agent_ref,'business_advisor');
 const others=await rpc('jd_read_workforce_assignments',[outside,20]);
 assert.equal(others.length,1);assert.equal(others[0].agent_ref,'research_analyst');
 assert.equal((await rpc('jd_read_workforce_assignments',[admin,20])).length,1);
 await assert.rejects(rpc('jd_read_workforce_assignments',[staff,20]),e=>e.code==='42501');
 assert.equal((await rpc('jd_read_workforce_assignments',[owner,20])).length,1);
});
test('the read limit is clamped and newest-first',async()=>{
 await record({task_hash:'d4e5f60718091a2b'});
 await record({task_hash:'e5f60718091a2b3c'});
 await record({task_hash:'f60718091a2b3c4d'});
 const two=await rpc('jd_read_workforce_assignments',[owner,2]);
 assert.equal(two.length,2);
 assert.equal((await rpc('jd_read_workforce_assignments',[owner,0])).length,1);
 assert.equal((await rpc('jd_read_workforce_assignments',[owner,500])).length,3);
 const all=await rpc('jd_read_workforce_assignments',[owner,20]);
 assert.deepEqual(all.map(r=>r.task_hash),['f60718091a2b3c4d','e5f60718091a2b3c','d4e5f60718091a2b']);
});
test('records carry the full assignment contract: agent/version, skill, tools, budget, outcome',async()=>{
 await record({agent_kind:'registry',agent_ref:id(30),agent_name:'Inventory Analyst',agent_version:3,content_hash:'h'.repeat(64),skill_name:'brand-guidelines',skill_version:'1.0.2',skill_content_hash:'s'.repeat(64),status:'failed',outcome:{error:'Specialist assignment failed'},tool_evidence:[],verification_status:'blocked_no_deliverable'});
 const rows=await rpc('jd_read_workforce_assignments',[owner,20]);
 assert.equal(rows.length,1);
 const r=rows[0];
 assert.equal(r.agent_kind,'registry');assert.equal(r.agent_ref,id(30));assert.equal(r.agent_version,3);assert.equal(r.content_hash,'h'.repeat(64));
 assert.equal(r.skill_name,'brand-guidelines');assert.equal(r.skill_version,'1.0.2');assert.equal(r.skill_content_hash,'s'.repeat(64));
 assert.deepEqual(r.tool_allowlist,['get_workspace_overview']);
 assert.deepEqual(r.budget,{max_model_rounds:4,max_output_tokens:2500});
 assert.equal(r.status,'failed');assert.deepEqual(r.outcome,{error:'Specialist assignment failed'});
 assert.equal(r.verification_status,'blocked_no_deliverable');
 assert.equal(r.run_id,runA);assert.ok(r.created_at);
});
