import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,symlinkSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {CASES,REVIEW_GATES,SOURCE_FILES,assertObservation,micros} from './lib/jd-cancellation-evidence.mjs';
import {makePlan,evaluateBundle,fingerprint} from './jd-cancellation-acceptance.mjs';

const cache=resolve('node_modules/.cache');mkdirSync(cache,{recursive:true});
const temp=mkdtempSync(join(cache,'cancellation-acceptance-'));after(()=>rmSync(temp,{recursive:true,force:true}));
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const jobId=id(1),runId=id(2),actor=id(3),school=id(4),auditId=id(5),outside=id(6);
const old='2026-11-16T12:00:00.123456+00:00',next='2026-11-16T12:00:01.123456+00:00';
const source={sha:'a'.repeat(40),dirty:false,files:Object.fromEntries(SOURCE_FILES.map(p=>[p,'b'.repeat(64)]))};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function observation(spec){
 const job={id:jobId,run_id:runId,school_id:school,status:spec.jobStatus||'queued',updated_at:old,completed_at:null,attempt_count:1,queue_message_id:42,checkpoint_step_index:1,lease_owner:null,lease_token:null,lease_expires_at:null};
 if(job.status==='running')Object.assign(job,{lease_owner:'synthetic-worker',lease_token:id(9),lease_expires_at:next});
 const run={id:runId,school_id:school,status:spec.runStatus||'queued',updated_at:old,completed_at:null,result_json:{prior_effect:'synthetic-only'}};
 const before={jobs:[job],runs:[run,{...run,id:id(10),school_id:outside}],steps:[{id:id(8),run_id:runId,status:'completed',output_json:{effect_id:'synthetic-only'}}],audits:[]};
 if(spec.existingAudit)before.audits.push({id:auditId,run_id:runId,event_type:'execution.cancelled',event_json:{job_id:jobId}});
 const after=structuredClone(before);
 const o={caseId:spec.id,sourceSha:source.sha,environment:'local-simulation',projectRef:null,observedAt:next,
  request:{role:spec.role,actorId:spec.role?actor:null,actorSchoolId:spec.role?(spec.outsideTenant?outside:school):null,jobId,runId,expectedUpdatedAt:spec.stale?'2026-11-16T12:00:00.123455+00:00':old,action:spec.action||'execution.job.cancel_checked'},response:{status:spec.status,body:{error:'Synthetic refusal'}},before,after};
 if(spec.sqlstate)o.sqlstate=spec.sqlstate;
 if(spec.kind==='cancel'){
  Object.assign(after.jobs[0],{status:'cancelled',updated_at:next,completed_at:next});Object.assign(after.runs[0],{status:'cancelled',updated_at:next,completed_at:next});
  after.audits.push({id:auditId,school_id:school,run_id:runId,actor_id:actor,event_type:'execution.cancelled',event_json:{job_id:jobId,contract:'atomic_cancel_v1',previous_job_status:job.status,previous_run_status:run.status,previous_updated_at:old,updated_at:next,external_effects_reversed:false}});
  o.response.body={job:{id:jobId,run_id:runId,status:'cancelled',updated_at:next},run:{id:runId,status:'cancelled'},auditRecorded:true,auditId,externalEffectsReversed:false};
 }
 return o;
}
for(const spec of CASES)test(`${spec.id}: expected synthetic observation is consistent, not accepted`,()=>{
 assert.deepEqual(assertObservation(spec,observation(spec)),{caseId:spec.id,result:'observations-consistent'});
});
const success=CASES[0];
for(const [name,mutate] of [
 ['empty fixture',o=>o.before.jobs=[]],['missing table',o=>delete o.after.steps],['duplicate identity',o=>o.after.jobs.push({...o.after.jobs[0]})],
 ['wrong case',o=>o.caseId='different'],['wrong role',o=>o.request.role='staff'],['wrong actor',o=>o.request.actorId=outside],['wrong tenant',o=>o.request.actorSchoolId=outside],
 ['wrong action',o=>o.request.action='execution.job.cancel'],['wrong HTTP status',o=>o.response.status=500],['stale success request',o=>o.request.expectedUpdatedAt=next],
 ['missing run',o=>o.after.runs.shift()],['partial run write',o=>o.after.runs[0].status='running'],['no version change',o=>o.after.jobs[0].updated_at=old],
 ['erased prior results',o=>o.after.runs[0].result_json={}],['erased checkpoint',o=>o.after.jobs[0].checkpoint_step_index=0],['changed queue identity',o=>o.after.jobs[0].queue_message_id=43],
 ['erased completed step',o=>o.after.steps=[]],['unrelated run changed',o=>o.after.runs[1].status='cancelled'],['audit absent',o=>o.after.audits=[]],
 ['duplicate audit',o=>o.after.audits.push({...o.after.audits[0],id:id(19)})],['audit wrong tenant',o=>o.after.audits[0].school_id=outside],['audit wrong actor',o=>o.after.audits[0].actor_id=outside],
 ['receipt missing audit ID',o=>delete o.response.body.auditId],['false undo claim',o=>o.response.body.externalEffectsReversed=true],['active lease',o=>o.before.jobs[0].lease_owner='worker'],
 ['audit version mismatch',o=>o.after.audits[0].event_json.updated_at=old],['false previous state',o=>o.after.audits[0].event_json.previous_job_status='failed'],
 ['changed completion time',o=>o.after.runs[0].completed_at=old],['receipt wrong run',o=>o.response.body.run.id=outside],['receipt wrong job',o=>o.response.body.job.id=outside],
])test(`record assertion rejects ${name}`,()=>{const o=observation(success);mutate(o);assert.throws(()=>assertObservation(success,o));});
for(const spec of CASES.filter(c=>c.kind==='unchanged'))test(`${spec.id}: denial cannot hide a persisted mutation`,()=>{const o=observation(spec);o.after.jobs[0].updated_at=next;assert.throws(()=>assertObservation(spec,o));});
test('stale case requires a genuinely different microsecond version',()=>{const spec=CASES.find(c=>c.stale),o=observation(spec);o.request.expectedUpdatedAt=old;assert.throws(()=>assertObservation(spec,o));});
test('same instant in a different offset is not a stale version',()=>{assert.equal(micros(old),micros('2026-11-16T13:00:00.123456+01:00'));assert.notEqual(micros(old),micros('2026-11-16T12:00:00.123455Z'));});
test('rollback requires observed SQLSTATE, not an arbitrary 500',()=>{const spec=CASES.find(c=>c.sqlstate),o=observation(spec);delete o.sqlstate;assert.throws(()=>assertObservation(spec,o));});
test('duplicate replay must include the prior cancellation audit',()=>{const spec=CASES.find(c=>c.existingAudit),o=observation(spec);o.before.audits=[];o.after.audits=[];assert.throws(()=>assertObservation(spec,o));});
let counter=0;
function fixture(){
 const root=join(temp,`bundle-${counter++}`);mkdirSync(root);return{root,plan:makePlan(structuredClone(source))};
}
function save(root,path,data){const bytes=typeof data==='string'?data:JSON.stringify(data);writeFileSync(join(root,path),bytes);return{path,sha256:hash(bytes)};}
function recordAll(f){
 f.plan.environment={kind:'local-simulation',projectRef:null};
 const log=save(f.root,'synthetic.log','Synthetic transcript for validator tests. Not live evidence.');
 for(const row of f.plan.cases){row.outcome='recorded';row.observation=save(f.root,`${row.id}.json`,observation(CASES.find(c=>c.id===row.id)));row.attachments=[log];}
 for(const row of f.plan.reviewGates)Object.assign(row,{outcome:'recorded',observedAt:next,actual:'Synthetic description of expected results; not live verification.',attachments:[log]});
 return f;
}
test('new plans have every case and gate not-run, never a vacuous pass',()=>{
 const f=fixture();assert.equal(f.plan.cases.length,18);assert.equal(f.plan.reviewGates.length,8);
 const result=evaluateBundle(f.root,f.plan,source);assert.equal(result.state,'blocked');assert.equal(result.productionApproved,false);assert.equal(result.observationChecks.filter(c=>c.result==='observations-consistent').length,0);
});
test('all-consistent local simulation remains blocked and cannot grant live acceptance',()=>{
 const f=recordAll(fixture()),result=evaluateBundle(f.root,f.plan,source);assert.equal(result.state,'blocked');assert.equal(result.liveAcceptanceVerified,false);assert.equal(result.productionApproved,false);assert.equal(result.observationChecks.filter(c=>c.result==='observations-consistent').length,CASES.length);
});
test('staging-labelled files at most become ready for independent review, never approval',()=>{
 const f=recordAll(fixture());f.plan.environment={kind:'isolated-staging',projectRef:'abcdefghijklmnopqrst'};
 for(const row of f.plan.cases){const o=observation(CASES.find(c=>c.id===row.id));o.environment='isolated-staging';o.projectRef=f.plan.environment.projectRef;row.observation=save(f.root,`${row.id}.json`,o);}
 const result=evaluateBundle(f.root,f.plan,source);assert.equal(result.state,'ready-for-independent-review');assert.equal(result.productionApproved,false);assert.equal(result.liveAcceptanceVerified,false);
});
for(const target of ['thklwiybjuhrjqrrxyid','mcdcwdfdpqzrzsixmrcg','https://example.com','--flag',null])test(`forbidden staging target ${target}`,()=>{
 const f=fixture();f.plan.environment={kind:'isolated-staging',projectRef:target};assert.throws(()=>evaluateBundle(f.root,f.plan,source));
});
for(const field of ['cases','reviewGates'])for(const type of ['missing','duplicate','unknown'])test(`${field}: rejects ${type} coverage`,()=>{
 const f=fixture();if(type==='missing')f.plan[field].pop();if(type==='duplicate')f.plan[field][1]={...f.plan[field][0]};if(type==='unknown')f.plan[field][0].id='invented';assert.throws(()=>evaluateBundle(f.root,f.plan,source));
});
for(const [name,mutate] of [
 ['untrusted pass flag',f=>f.plan.cases[0].outcome='passed'],
 ['hash tampering',f=>f.plan.cases[0].observation.sha256='0'.repeat(64)],
 ['missing supporting log',f=>f.plan.cases[0].attachments=[]],
 ['mislabeled source',f=>{const o=observation(success);o.sourceSha='c'.repeat(40);f.plan.cases[0].observation=save(f.root,'wrong.json',o);}],
 ['local evidence relabelled staging',f=>f.plan.environment={kind:'isolated-staging',projectRef:'abcdefghijklmnopqrst'}],
 ['recorded failure',f=>f.plan.cases[0].outcome='failed'],
 ['manual gate failure',f=>f.plan.reviewGates[0].outcome='failed'],
 ['manual gate missing evidence',f=>f.plan.reviewGates[0].attachments=[]],
 ['path traversal',f=>f.plan.cases[0].observation.path='../outside.json'],
 ['absolute path',f=>f.plan.cases[0].observation.path=join(f.root,'owner-queued.json')],
 ['symlink leaf',f=>{const p=join(f.root,'owner-queued.json');rmSync(p);symlinkSync(join(f.root,'admin-retry-wait.json'),p);}],
 ['symlink parent',f=>{symlinkSync(f.root,join(f.root,'link'));f.plan.cases[0].observation.path='link/owner-queued.json';}],
 ['oversized evidence',f=>{f.plan.cases[0].observation=save(f.root,'big.json',' '.repeat(1024*1024+1));}],
 ['malformed JSON',f=>{f.plan.cases[0].observation=save(f.root,'bad.json','{broken');}],
])test(`bundle refuses ${name}`,()=>{
 const f=recordAll(fixture());mutate(f);try{const r=evaluateBundle(f.root,f.plan,source);assert.equal(r.state,'blocked');assert.ok(r.issues.some(x=>!x.startsWith('No isolated staging')));}catch(e){assert.equal(name,'untrusted pass flag',e.message);}
});
test('source commit/hash drift and dirty source cannot be cleared by a manifest claim',()=>{
 for(const current of [{...source,sha:'d'.repeat(40)},{...source,dirty:true},{...source,files:{...source.files,[SOURCE_FILES[0]]:'e'.repeat(64)}}]){
 const f=recordAll(fixture());assert.ok(evaluateBundle(f.root,f.plan,current).issues.some(x=>/Source|dirty/.test(x)));
 }
});
test('diagnostics do not echo raw observation secrets or assertion differences',()=>{
 const f=recordAll(fixture()),o=observation(success);o.after.jobs[0].secret='PRIVATE_DIAGNOSTIC';f.plan.cases[0].observation=save(f.root,'secret.json',o);
 const result=evaluateBundle(f.root,f.plan,source);assert.doesNotMatch(JSON.stringify(result),/PRIVATE_DIAGNOSTIC/);assert.ok(result.issues.some(x=>x.startsWith(success.id)));
});
test('actual source fingerprint covers SQL, rollback, server, client and evaluator',()=>{assert.deepEqual(Object.keys(fingerprint(process.cwd())),SOURCE_FILES);});
const cli=resolve('scripts/jd-cancellation-acceptance.mjs');
for(const args of [[],['--live','x'],['--deploy','x'],['--check','../escape'],['--init','.git/new'],['--init','.'],['--check','missing'],['--init']])test(`CLI refuses ${JSON.stringify(args)} without remote APIs`,()=>{
 const result=spawnSync(process.execPath,[cli,...args],{encoding:'utf8'});assert.equal(result.status,2);assert.doesNotMatch(result.stderr,/PRIVATE_DIAGNOSTIC/);
});
test('actual CLI creates pending plan, refuses overwrite, and checks it as blocked',()=>{
 const path=join(temp,'cli-plan');let r=spawnSync(process.execPath,[cli,'--init',path],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);
 const original=readFileSync(join(path,'plan.json'),'utf8');assert.equal(JSON.parse(original).environment.kind,'unconfigured');
 r=spawnSync(process.execPath,[cli,'--init',path],{encoding:'utf8'});assert.equal(r.status,2);assert.equal(readFileSync(join(path,'plan.json'),'utf8'),original);
 r=spawnSync(process.execPath,[cli,'--check',path],{encoding:'utf8'});assert.equal(r.status,2);assert.equal(JSON.parse(r.stdout).productionApproved,false);
});
test('harness contains no network, credential or deployment API',()=>{
 const text=readFileSync(cli,'utf8');assert.doesNotMatch(text,/\bfetch\s*\(|https\.request|createClient\(|process\.env|SUPABASE_ACCESS_TOKEN|SUPABASE_DB_PASSWORD/);
 assert.equal(REVIEW_GATES.some(g=>g.id==='concurrent-claim-cancel'),true);
});

for(const value of ['2026-02-31T12:00:00Z','2026-11-16T25:00:00Z','2026-11-16T12:00:00.1234567Z','yesterday'])test(`invalid timestamp ${value} is rejected`,()=>assert.throws(()=>micros(value)));
