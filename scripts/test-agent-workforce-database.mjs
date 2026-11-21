// Real candidate SQL and execution-authority RPCs in isolated PGlite.
// Synthetic identity/evaluator only; never an operational agent evaluation.
import test,{before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {PGlite} from '@electric-sql/pglite';
import {transformWithOxc} from 'vite';
import {definitionFromTemplate} from '../supabase/functions/_shared/jd-agent-registry.mjs';
import {handleAgentRegistry} from '../supabase/functions/_shared/jd-agent-registry-service.ts';
const db=new PGlite(),id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const author=id(1),tenant=id(2),reviewer=id(3),staff=id(4),outside=id(5),other=id(6),runner='a'.repeat(64);
const read=p=>readFileSync(p,'utf8'),registry='supabase/migrations/20261117130000_jd_agent_registry.sql',engine='supabase/migrations/20261121180000_jd_agent_execution_engine.sql';
const definition=()=>({...definitionFromTemplate('inventory-analyst'),model:{provider:'synthetic-provider',name:'synthetic-model'}});
let n;
async function initialise(target){
 await target.exec("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table schools(id uuid primary key);create table profiles(id uuid primary key,school_id uuid,role text,full_name text);create schema extensions;create function extensions.digest(data bytea,algorithm text) returns bytea language sql immutable as $$select sha256(data)$$;");
 const source=read('supabase/migrations/20261111085143_jd_autonomous_automation.sql');
 for(const t of ['jd_conversations','jd_automation_runs','jd_automation_steps','jd_approvals','jd_audit_events'])await target.exec(source.match(new RegExp(`create table if not exists public\\.${t} \\([\\s\\S]*?\\n\\);`))[0]);
 await target.exec(read('supabase/migrations/20261111085145_jd_review_centre_foundation.sql').split('create index')[0]);
 await target.exec(read('supabase/migrations/20261114213713_jd_authorization_role_matrix.sql').match(/CREATE OR REPLACE FUNCTION public\.jd_decide_approval\([\s\S]*?\n\$function\$\n;/)[0]);
 await target.exec('revoke all on function public.jd_decide_approval(uuid,uuid,text,text) from public,anon,authenticated;grant execute on function public.jd_decide_approval(uuid,uuid,text,text) to service_role');
 await target.exec(read(registry));
 await target.exec(read(engine));
 await target.query('insert into schools values($1),($2)',[tenant,other]);
 for(const [who,school,role] of [[author,tenant,'owner'],[reviewer,tenant,'admin'],[staff,tenant,'staff'],[outside,other,'owner']]){await target.query('insert into auth.users values($1)',[who]);await target.query('insert into profiles values($1,$2,$3,$4)',[who,school,role,'Synthetic actor']);}
}
before(()=>initialise(db));
beforeEach(async()=>{n=100;await db.exec('reset role;truncate jd_agent_definitions,jd_agent_definition_versions,jd_agent_evaluations,jd_agent_evaluation_reports,jd_agent_evaluators,jd_agent_registry_requests,jd_approvals,jd_audit_events,jd_automation_runs cascade');await db.query("update profiles set role='admin' where id=$1",[reviewer]);});
after(()=>db.close());
async function rpc(name,args,role='service_role'){await db.exec(`set role ${role}`);try{return(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as result`,args.map(x=>x&&typeof x==='object'?JSON.stringify(x):x))).rows[0].result;}finally{await db.exec('reset role');}}
const save=(content=definition(),agent=null,expected=0,who=author,request=id(n++))=>rpc('jd_save_agent_definition',[who,request,agent,expected,content]);
const inspect=(agent=null,who=author)=>rpc('jd_read_agent_registry',[who,agent]);
const begin=(agent,version=1,kind='operational',key=runner,request=id(n++))=>rpc('jd_start_agent_evaluation',[author,request,agent,version,kind,key]);
const finish=(eid,report,key=runner)=>rpc('jd_finish_agent_evaluation',[eid,key,report]);
const publishTransition=async(agent,action,who=author,version=1,request=id(n++))=>{const a=(await inspect(agent)).agents[0];return rpc('jd_agent_publication',[who,request,agent,version,action,'Synthetic independent review note.',a.current_evaluation,a.review_approval]);};
const execution=async(agent,action,who=author,version=1,request=id(n++),note='Synthetic execution-authority review note.')=>rpc('jd_agent_execution',[who,request,agent,version,action,note]);
async function published({authorized=false}={}) {
 const s=await save();await db.query('insert into jd_agent_evaluators values($1,true,$2)',[runner,'SYNTHETIC FIXTURE ONLY; not an approved production evaluator']);
 const e=await begin(s.agent_id);await finish(e.evaluation_id,{runner,kind:'operational',cases:definition().evaluationCases.map((c,i)=>({caseId:c.id,status:'passed',observed:'Synthetic fixture result, not a real agent evaluation.'}))});
 await publishTransition(s.agent_id,'request_review');await publishTransition(s.agent_id,'approve',reviewer);await publishTransition(s.agent_id,'publish');
 if(authorized)await execution(s.agent_id,'request_grant'),await execution(s.agent_id,'approve',reviewer),await execution(s.agent_id,'grant');
 return s;
}
test('execution authority requires current published operational evidence',async()=>{
 const s=await save();
 for(const action of ['request_grant','approve','reject','grant'])await assert.rejects(execution(s.agent_id,action),e=>e.code==='42501');
 await db.query('insert into jd_agent_evaluators values($1,true,$2)',[runner,'SYNTHETIC ONLY']);
 const e=await begin(s.agent_id);await finish(e.evaluation_id,{runner,kind:'operational',cases:definition().evaluationCases.map(c=>({caseId:c.id,status:'passed',observed:'Synthetic fixture result.'}))});
 await assert.rejects(execution(s.agent_id,'request_grant'),e=>e.code==='42501');
 await publishTransition(s.agent_id,'request_review');await publishTransition(s.agent_id,'approve',reviewer);
 await assert.rejects(execution(s.agent_id,'request_grant'),e=>e.code==='42501');
 await publishTransition(s.agent_id,'publish');
 const r=await execution(s.agent_id,'request_grant');
 assert.equal(r.execution_authorized,false);assert.equal(r.execution_enabled,false);assert.equal(r.hiring_enabled,false);assert.ok(r.approval_id);
 const data=await inspect(s.agent_id);
 assert.equal(data.agents[0].execution_authorized,false);assert.equal(data.agents[0].execution_approval_status,'pending');assert.ok(data.agents[0].execution_approval_id);
 const approval=(await db.query(`select * from jd_approvals where id=$1`,[r.approval_id])).rows[0];
 assert.equal(approval.action_key,'agent.execution.grant');assert.equal(approval.status,'pending');assert.equal(approval.risk_level,'high');assert.equal(approval.proposal_json.content_hash,data.agents[0].content_hash);assert.equal(approval.execution_status,'not_executed');
 assert.equal((await db.query(`select count(*)::int as n from jd_audit_events where event_type='agent.execution.request_grant'`)).rows[0].n,1);
});
test('independence is enforced across request, decision and grant',async()=>{
 const s=await published();await execution(s.agent_id,'request_grant');
 for(const who of [author])await assert.rejects(execution(s.agent_id,'approve',who),e=>e.code==='42501');
 const approval=(await db.query(`select requested_by from jd_approvals where action_key='agent.execution.grant'`)).rows[0];
 assert.equal(approval.requested_by,author);
 await assert.rejects(execution(s.agent_id,'approve',outside),e=>e.code==='42501');
 const granted=await execution(s.agent_id,'approve',reviewer);
 assert.equal(granted.execution_authorized,false);
 const receipt=await execution(s.agent_id,'grant',author);
 assert.equal(receipt.execution_authorized,true);assert.equal(receipt.execution_enabled,false);assert.equal(receipt.hiring_enabled,false);assert.equal(receipt.billing_enabled,false);
 const data=await inspect(s.agent_id);assert.equal(data.agents[0].execution_authorized,true);assert.equal(data.agents[0].execution_approval_status,'approved');
 const column=(await db.query(`select execution_authorized from jd_agent_definitions where id=$1`,[s.agent_id])).rows[0];
 assert.equal(column.execution_authorized,true);
});
test('revoke is immediate and clears the review pointer',async()=>{
 const s=await published({authorized:true});assert.equal((await inspect(s.agent_id)).agents[0].execution_authorized,true);
 const receipt=await execution(s.agent_id,'revoke',reviewer,1,id(n++),'Note: suspension pending a new evaluation.');
 assert.equal(receipt.execution_authorized,false);assert.equal(receipt.approval_id,null);
 const data=await inspect(s.agent_id);assert.equal(data.agents[0].execution_authorized,false);assert.equal(data.agents[0].execution_approval_status,null);
});
test('requests replay exactly and reject changed payloads or stale versions',async()=>{
 const s=await published({authorized:true}),request=id(n++);
 const first=await execution(s.agent_id,'revoke',author,1,request);
 assert.deepEqual(await execution(s.agent_id,'revoke',author,1,request),first);
 await assert.rejects(execution(s.agent_id,'revoke',author,1,request,'A different note is a different request.'),e=>e.code==='40001');
 await assert.rejects(execution(s.agent_id,'revoke',author,99,id(n++)),e=>e.code==='40001');
});
test('grant requires an approved, current, independently decided review',async()=>{
 const s=await published();
 await assert.rejects(execution(s.agent_id,'grant'),e=>e.code==='42501');
 await execution(s.agent_id,'request_grant');
 await execution(s.agent_id,'approve',reviewer);
 await db.exec(`update jd_approvals set expires_at=clock_timestamp()-interval '1 second' where action_key='agent.execution.grant'`);
 await assert.rejects(execution(s.agent_id,'grant'),e=>e.code==='42501');
 await db.exec(`update jd_approvals set expires_at=clock_timestamp()+interval '1 day' where action_key='agent.execution.grant'`);
 await db.query(`update profiles set role='staff' where id=$1`,[reviewer]);
 await assert.rejects(execution(s.agent_id,'grant'),e=>e.code==='42501');
 await db.query(`update profiles set role='admin' where id=$1`,[reviewer]);
 const receipt=await execution(s.agent_id,'grant');
 assert.equal(receipt.execution_authorized,true);
 await db.exec(`update jd_approvals set status='rejected' where action_key='agent.execution.grant'`);
 await assert.rejects(execution(s.agent_id,'grant',author,1,id(n++)),e=>e.code==='42501');
});
test('a superseded definition version invalidates a previous execution grant path',async()=>{
 const s=await published();
 await execution(s.agent_id,'request_grant');
 await execution(s.agent_id,'approve',reviewer);
 await save({...definition(),name:'Revised inventory analyst'},s.agent_id,1);
 await assert.rejects(execution(s.agent_id,'grant',author,2,id(n++)),e=>e.code==='42501');
 const r=await inspect(s.agent_id);
 assert.equal(r.agents[0].execution_approval_status,null,'a new draft version clears the grant request pointer');
});
test('tenant and role boundaries hold for execution authority',async()=>{
 const s=await published();
 await assert.rejects(execution(s.agent_id,'request_grant',outside),e=>e.code==='42501');
 await assert.rejects(execution(s.agent_id,'request_grant',staff),e=>e.code==='42501');
 for(const role of ['anon','authenticated'])await assert.rejects(rpc('jd_agent_execution',[author,id(n++),s.agent_id,1,'request_grant','Synthetic note.'],role),e=>e.code==='42501');
 await db.exec('set role service_role');
 try{await assert.rejects(db.exec(`update jd_agent_definitions set execution_authorized=true`),e=>e.code==='42501');}finally{await db.exec('reset role');}
});
test('execution actions need a bounded note',async()=>{
 const s=await published({authorized:true});
 await assert.rejects(execution(s.agent_id,'revoke',author,1,id(n++),'short'),e=>e.code==='22023');
 await assert.rejects(execution(s.agent_id,'renamed_action',author,1,id(n++)),e=>e.code==='22023');
});
test('read registry exposes execution fields and execution approval history',async()=>{
 const s=await published({authorized:true});
 const data=await inspect(s.agent_id);
 assert.equal(data.agents[0].execution_authorized,true);
 assert.equal(Array.isArray(data.execution_approvals),true);
 assert.equal(data.execution_enabled,false);assert.equal(data.hiring_enabled,false);assert.equal(data.publication_scope,'tenant_private');
 const empty=await inspect();
 assert.equal(empty.agents.every(a=>typeof a.execution_authorized==='boolean'),true);
});
test('rollback removes execution columns and functions without touching definitions',async()=>{
 const s=await published({authorized:true});
 await db.exec('begin');
 try{
  await db.exec(read('supabase/rollback/20261121180000_jd_agent_execution_engine.rollback.sql'));
  const cols=await db.query(`select column_name from information_schema.columns where table_name='jd_agent_definitions' and column_name like 'execution%'`);
  assert.equal(cols.rows.length,0);
  assert.equal((await db.query(`select count(*)::int as n from jd_agent_definition_versions`)).rows[0].n,1,'definitions survive rollback');
 }finally{await db.exec('rollback');}
 const after=await inspect(s.agent_id);
 assert.equal(after.agents[0].execution_authorized,true,'rollback rehearsal was not committed');
});

const sig={jd_read_agent_registry:['p_actor','p_agent'],jd_agent_execution:['p_actor','p_request','p_agent','p_expected','p_action','p_note','p_expected_evaluation','p_expected_approval']};
mkdirSync('node_modules/.cache',{recursive:true});const tmp=mkdtempSync(`${process.cwd()}/node_modules/.cache/workforce-http-`);
const source=read('supabase/functions/jd-automation/index.ts').replace(/^import .*;\n/gm,'');writeFileSync(`${tmp}/http.mjs`,(await transformWithOxc(`export function makeHandler(createClient,handleAgentRegistry,enabled){let handler;const Deno={env:{get:key=>key==='JD_AGENT_REGISTRY_ENABLED'?String(enabled):key},serve:fn=>handler=fn};${source}\nreturn handler;}`,'handler.ts')).code);
const {makeHandler}=await import(pathToFileURL(`${tmp}/http.mjs`));after(()=>rmSync(tmp,{recursive:true,force:true}));
function http(who=author,enabled=true){const calls=[],admin={from(table){assert.ok(['profiles','jd_approvals'].includes(table));const filters=[];const q={select(){return q;},eq(k,v){assert.ok(['id','school_id'].includes(k));filters.push([k,v]);return q;},async maybeSingle(){return{data:(await db.query(`select * from ${table} where ${filters.map(([k],i)=>k+'=$'+(i+1)).join(' and ')}`,filters.map(([,v])=>v))).rows[0]};}};return q;},async rpc(name,args){calls.push({name,args});try{return{data:await rpc(name,sig[name].map(k=>args[k]))};}catch(e){return{error:{code:e.code,message:'PRIVATE_DIAGNOSTIC'}};}}},auth={auth:{getUser:async()=>({data:{user:who?{id:who}:null}})}};
 const handler=makeHandler((url,key)=>key==='SUPABASE_ANON_KEY'?auth:admin,handleAgentRegistry,enabled);return{calls,send:async payload=>{const r=await handler(new Request('https://fixture.invalid',{method:'POST',headers:{Authorization:'Bearer synthetic','Content-Type':'application/json'},body:JSON.stringify(payload)}));return{status:r.status,data:await r.json()};}};}
test('generic approval decisions cannot decide execution-authority reviews',async()=>{
 const s=await published();await execution(s.agent_id,'request_grant');
 const approval=(await db.query(`select id from jd_approvals where action_key='agent.execution.grant'`)).rows[0];
 const f=http(reviewer);
 const result=await f.send({action:'approvals.decide',approvalId:approval.id,decision:'approve',note:'Generic decision attempt.'});
 assert.equal(result.status,409);
 assert.match(result.data.error,/Agent registry/);
 assert.equal(f.calls.length,0,'no registry RPC was invoked by the generic route');
 const persisted=(await db.query(`select status from jd_approvals where id=$1`,[approval.id])).rows[0];
 assert.equal(persisted.status,'pending','generic route left the review pending');
});
test('registry service accepts execution actions through the reviewed release gate',async()=>{
 const s=await published();
 const off=http(author,false);
 assert.equal((await off.send({action:'registry.execution.request_grant',agentId:s.agent_id,expectedVersion:1,requestId:id(n++),confirm:true,note:'Synthetic execution-authority review note.'})).status,409);
 const f=http(author,true);
 const result=await f.send({action:'registry.execution.request_grant',agentId:s.agent_id,expectedVersion:1,requestId:id(n++),confirm:true,note:'Synthetic execution-authority review note.'});
 assert.equal(result.status,200);
 assert.equal(result.data.receipt.execution_authorized,false);
 assert.equal(result.data.registry.agents[0].execution_approval_status,'pending');
 const bad=await f.send({action:'registry.execution.approve',agentId:s.agent_id,expectedVersion:1,requestId:id(n++),confirm:true,note:'Synthetic execution-authority review note.'});
 assert.equal(bad.status,403,'the requesting author cannot also decide the review');
 const cred=await f.send({action:'registry.execution.request_grant',agentId:s.agent_id,expectedVersion:1,requestId:id(n++),confirm:true,note:'Bearer '+'a'.repeat(32)});
 assert.equal(cred.status,400,'credential-like notes are rejected before SQL');
 assert.equal((await db.query(`select count(*)::int as n from jd_approvals where action_key='agent.execution.grant' and proposal_json->>'agent_id'=$1`,[s.agent_id])).rows[0].n,1,'no extra execution approval rows were created');
});
