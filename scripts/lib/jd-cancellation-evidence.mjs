// Offline assertions over operator-supplied, synthetic-fixture observations.
// Consistent records are NOT proof of live execution or independent acceptance.
import {isDeepStrictEqual} from 'node:util';

const deny=(id,role,status,extra={})=>({id,kind:'unchanged',role,status,...extra});
export const CASES=Object.freeze([
 {id:'owner-queued',kind:'cancel',role:'owner',jobStatus:'queued',runStatus:'queued',status:200},
 {id:'admin-retry-wait',kind:'cancel',role:'admin',jobStatus:'retry_wait',runStatus:'running',status:200},
 ...['manager','staff','viewer','finance','hr','contractor'].map(role=>deny(`${role}-denied`,role,403)),
 deny('outside-tenant','owner',404,{outsideTenant:true}),
 deny('missing-session',null,401),
 deny('stale-version','owner',409,{stale:true}),
 deny('audit-rollback','owner',500,{sqlstate:'23514'}),
 deny('run-rollback','owner',500,{sqlstate:'23514'}),
 deny('duplicate-replay','owner',409,{jobStatus:'cancelled',runStatus:'cancelled',existingAudit:true}),
 deny('running-job','owner',409,{jobStatus:'running',runStatus:'running'}),
 deny('terminal-run','owner',409,{runStatus:'completed'}),
 deny('legacy-client-checked-server','owner',409,{action:'execution.job.cancel'}),
 deny('checked-client-legacy-server','owner',409),
].map(Object.freeze));
export const REVIEW_GATES=Object.freeze([
 {id:'isolation-and-schema',expected:'Independently identify the isolated project; compare migration history, actual constraints/triggers, deployed source/dependencies and checked release modes. No production data.'},
 {id:'sessions-and-grants',expected:'Real JWT/PostgREST/RLS: login/logout/expiry, new sessions, anonymous/authenticated RPC denial, forged actor fields, profile demotion and every supported role/tenant.'},
 {id:'concurrent-claim-cancel',expected:'Separate PostgreSQL sessions: overlapping claim/cancel in both lock orderings, profile changes, duplicate requests, lock timeout/deadlock outcomes. Retain correlated session IDs, request IDs and worker logs.'},
 {id:'real-queue-redelivery',expected:'Real pgmq delivery/redelivery and retry exhaustion: cancelled ledger rejects claim, no duplicate external effect; retain queue and worker evidence.'},
 {id:'failure-injection',expected:'Review scoped run/audit fault injection, observed SQLSTATE, unchanged rows and removed fault hooks. Never inject faults into production.'},
 {id:'lost-ack-and-new-session',expected:'Drop acknowledgement after commit; UI blocks repeat, refresh/new authenticated session sees matching job/run and exactly one audit; retain receipt and browser evidence.'},
 {id:'state-and-version-matrix',expected:'All terminal job/run states, approval wait, expired running lease, microsecond stale version, cross-tenant run corruption and client/backend version mismatches fail closed.'},
 {id:'emergency-disable',expected:'Revoke-only disable, reconcile in-flight transactions, preserve evidence, explicitly reviewed reapply; no unchecked fallback or claim that external effects were undone.'},
]);
export const SOURCE_FILES=Object.freeze([
 'supabase/migrations/20261117220000_jd_atomic_execution_cancel.sql',
 'supabase/rollback/20261117220000_jd_atomic_execution_cancel.rollback.sql',
 'supabase/functions/jd-automation/index.ts',
 'supabase/functions/_shared/jd-execution-cancellation.mjs',
 'supabase/migrations/20261111085150_jd_durable_execution_jobs.sql',
 'src/chat/execution-monitor.mjs',
 'scripts/lib/jd-cancellation-evidence.mjs',
 'scripts/jd-cancellation-acceptance.mjs',
]);
export const requireEvidence=(condition,message)=>{if(!condition)throw Error(message);};
const need=requireEvidence;
const same=(a,b,message)=>need(isDeepStrictEqual(a,b),message);
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
export function micros(value){
 const match=typeof value==='string'&&value.match(/^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,6}))?(Z|[+-]\d\d:\d\d)$/);
 need(match&&Number.isFinite(Date.parse(match[1]+match[3]))&&Number.isFinite(Date.parse(match[1]+'Z')),'Missing or invalid timestamp');
 need(new Date(match[1]+'Z').toISOString().slice(0,19)===match[1],'Invalid calendar timestamp');
 return BigInt(Date.parse(match[1]+match[3]))*1000n+BigInt((match[2]||'').padEnd(6,'0'));
}
function snapshot(value){
 need(value&&typeof value==='object','Missing persisted snapshot');
 same(Object.keys(value).sort(),['audits','jobs','runs','steps'],'Snapshot must include jobs, runs, audits and steps');
 for(const table of ['jobs','runs','audits','steps']){
  need(Array.isArray(value[table])&&value[table].length<=500,'Snapshot table missing or too large');
  const ids=new Set();for(const row of value[table]){need(uuid(row?.id)&&!ids.has(row.id),'Snapshot has invalid or duplicate IDs');ids.add(row.id);}
 }
 return Object.fromEntries(Object.entries(value).map(([key,rows])=>[key,[...rows].sort((a,b)=>a.id.localeCompare(b.id))]));
}
const omit=(row,keys)=>Object.fromEntries(Object.entries(row).filter(([key])=>!keys.includes(key)));
export function assertObservation(spec,observation){
 need(spec&&CASES.some(c=>c===spec),'Unknown case specification');
 need(observation?.caseId===spec.id,'Observation case does not match');
 const {request,response}=observation;
 need(request&&response,'Missing request or response');
 need(request.role===spec.role,'Actor role does not match case');
 need(uuid(request.jobId)&&uuid(request.runId),'Invalid fixture identity');
 need(request.action===(spec.action||'execution.job.cancel_checked'),'Wrong cancellation action');
 need(response.status===spec.status,'Unexpected HTTP outcome');
 micros(observation.observedAt);
 const before=snapshot(observation.before),after=snapshot(observation.after);
 const job=before.jobs.find(r=>r.id===request.jobId),run=before.runs.find(r=>r.id===request.runId);
 need(job&&run&&job.run_id===run.id&&uuid(job.school_id)&&job.school_id===run.school_id,'Real same-tenant job/run fixture is required (no empty-fixture passes)');
 need(job.status===(spec.jobStatus||'queued')&&run.status===(spec.runStatus||'queued'),'Fixture is not in the required state');
 if(spec.role===null)need(request.actorId===null&&request.actorSchoolId===null,'Missing-session case must not declare an authenticated actor');
 else{
  need(uuid(request.actorId)&&uuid(request.actorSchoolId),'Authenticated fixture identity is missing');
  need(spec.outsideTenant?request.actorSchoolId!==job.school_id:request.actorSchoolId===job.school_id,'Fixture actor tenant does not match case');
 }
 micros(request.expectedUpdatedAt);
 if(spec.sqlstate)need(observation.sqlstate===spec.sqlstate,'Fault-injection SQLSTATE is missing');
 if(spec.stale)need(micros(request.expectedUpdatedAt)!==micros(job.updated_at),'Stale-version test used the current version');
 else if(!spec.existingAudit)need(micros(request.expectedUpdatedAt)===micros(job.updated_at),'Request did not carry the observed version');
 if(spec.kind==='unchanged'){
  need(!response.body?.auditRecorded&&!response.body?.auditId&&response.body?.job?.status!=='cancelled','Denial falsely acknowledges cancellation');
  if(spec.existingAudit)need(before.audits.filter(r=>r.run_id===run.id&&r.event_type==='execution.cancelled'&&r.event_json?.job_id===job.id).length===1,'Replay needs a real prior cancellation audit');
  same(after,before,'Denied or failed request changed persisted records');
  return {caseId:spec.id,result:'observations-consistent'};
 }
 need(!before.audits.some(r=>r.run_id===run.id&&r.event_type==='execution.cancelled'&&r.event_json?.job_id===job.id),'Successful fixture already has cancellation evidence');
 const saved=after.jobs.find(r=>r.id===job.id),savedRun=after.runs.find(r=>r.id===run.id),receipt=response.body;
 need(saved?.status==='cancelled'&&savedRun?.status==='cancelled','Job and run were not both cancelled');
 need(job.lease_owner===null&&job.lease_token===null&&job.lease_expires_at===null,'Cancellation fixture has an active lease');
 need(micros(saved.updated_at)>micros(job.updated_at)&&micros(saved.updated_at)>micros(run.updated_at),'Cancellation version did not advance');
 for(const value of [saved.completed_at,savedRun.updated_at,savedRun.completed_at])need(micros(value)===micros(saved.updated_at),'Job/run completion timestamps do not match');
 same(omit(saved,['status','updated_at','completed_at']),omit(job,['status','updated_at','completed_at']),'Cancellation erased or changed job evidence');
 same(omit(savedRun,['status','updated_at','completed_at']),omit(run,['status','updated_at','completed_at']),'Cancellation erased or changed run evidence');
 same(after.steps,before.steps,'Cancellation changed prior steps');
 same(after.jobs.filter(r=>r.id!==job.id),before.jobs.filter(r=>r.id!==job.id),'Unrelated jobs changed');
 same(after.runs.filter(r=>r.id!==run.id),before.runs.filter(r=>r.id!==run.id),'Unrelated runs changed');
 const added=after.audits.filter(r=>!before.audits.some(old=>old.id===r.id));
 need(added.length===1,'Cancellation must add exactly one audit');
 const audit=added[0];
 same(after.audits.filter(r=>r.id!==audit.id),before.audits,'Prior audit evidence changed');
 need(audit.school_id===job.school_id&&audit.actor_id===request.actorId&&audit.run_id===run.id&&audit.event_type==='execution.cancelled','Audit actor/tenant/run/type mismatch');
 const event=audit.event_json;
 need(event?.job_id===job.id&&event.contract==='atomic_cancel_v1'&&event.external_effects_reversed===false,'Invalid audit contract');
 need(event.previous_job_status===job.status&&event.previous_run_status===run.status,'Audit previous state mismatch');
 need(micros(event.previous_updated_at)===micros(job.updated_at)&&micros(event.updated_at)===micros(saved.updated_at),'Audit versions mismatch');
 need(receipt?.auditRecorded===true&&receipt.auditId===audit.id&&receipt.externalEffectsReversed===false,'Missing or misleading transactional receipt');
 need(receipt.job?.id===job.id&&receipt.job.run_id===run.id&&receipt.job.status==='cancelled'&&micros(receipt.job.updated_at)===micros(saved.updated_at),'Job receipt mismatch');
 need(receipt.run?.id===run.id&&receipt.run.status==='cancelled','Run receipt mismatch');
 return {caseId:spec.id,result:'observations-consistent'};
}
