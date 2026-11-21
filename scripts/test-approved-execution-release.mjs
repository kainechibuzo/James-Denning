import test,{before,after} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {PGlite} from "@electric-sql/pglite";
const db=new PGlite();
const migration=readFileSync("supabase/migrations/20261121150000_jd_approved_execution_release.sql","utf8");
const school="00000000-0000-4000-8000-000000000001",owner="00000000-0000-4000-8000-000000000002",staff="00000000-0000-4000-8000-000000000003",run="00000000-0000-4000-8000-000000000004",approval="00000000-0000-4000-8000-000000000005";
before(async()=>{
 await db.exec(`
 create role anon;create role authenticated;create role service_role;
 create table profiles(id uuid primary key,school_id uuid,role text);
 create table jd_automation_runs(id uuid primary key,school_id uuid,requested_by uuid,status text,request_text text,result_json jsonb default '{}'::jsonb,updated_at timestamptz default now());
 create table jd_approvals(id uuid primary key,school_id uuid,run_id uuid,requested_by uuid,status text,action_key text,execution_status text,execution_result_json jsonb,proposal_json jsonb not null default '{}'::jsonb,updated_at timestamptz default now());
 create table jd_execution_jobs(id uuid primary key default gen_random_uuid(),run_id uuid unique,status text);
 create table jd_audit_events(id bigint generated always as identity primary key,school_id uuid,actor_id uuid,run_id uuid,event_type text,event_json jsonb);
 create function jd_enqueue_execution_job(p_run_id uuid) returns jsonb language plpgsql set search_path=public as $
 declare j jd_execution_jobs%rowtype;
 begin
  select * into j from jd_execution_jobs where run_id=p_run_id;
  if found then return jsonb_build_object('job_id',j.id,'status',j.status,'duplicate',true);end if;
  insert into jd_execution_jobs(run_id,status) values(p_run_id,'queued') returning * into j;
  update jd_automation_runs set status='queued' where id=p_run_id;
  insert into jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
   select school_id,requested_by,id,'execution.queued',jsonb_build_object('job_id',j.id) from jd_automation_runs where id=p_run_id;
  return jsonb_build_object('job_id',j.id,'status','queued','duplicate',false);
 end $$;
 insert into profiles values
 ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','owner'),
 ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','staff');
 insert into jd_automation_runs(id,school_id,requested_by,status,request_text) values
 ('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000003','awaiting_approval','Launch my approved project');
 insert into jd_approvals(id,school_id,run_id,requested_by,status,action_key,execution_status,proposal_json) values
 ('00000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000003','approved','unclassified_request','not_executed',jsonb_build_object('request_text','Launch my approved project'));
 `);
 await db.exec(migration);
});
after(async()=>db.close());
test("approved generic request is released once to the durable queue",async()=>{
 const receipt=(await db.query("select jd_release_approved_execution($1,$2) as receipt",[approval,owner])).rows[0].receipt;
 assert.equal(receipt.execution_status,"queued");assert.equal(receipt.duplicate,false);
 const runRow=(await db.query("select status,result_json->>'approval_id' approval_id from jd_automation_runs where id=$1",[run])).rows[0];
 assert.equal(runRow.status,"queued");assert.equal(runRow.approval_id,approval);
 const approvalRow=(await db.query("select execution_status,execution_result_json->>'job_id' job_id from jd_approvals where id=$1",[approval])).rows[0];
 assert.equal(approvalRow.execution_status,"queued");assert.equal(approvalRow.job_id,receipt.job_id);
 assert.equal((await db.query("select count(*)::int count from jd_execution_jobs where run_id=$1",[run])).rows[0].count,1);
 assert.deepEqual((await db.query("select event_type from jd_audit_events order by id")).rows.map(x=>x.event_type),["execution.queued","approval.execution_released"]);
});
test("repeated release returns the same queued job without duplicating execution",async()=>{
 const first=(await db.query("select jd_release_approved_execution($1,$2) receipt",[approval,owner])).rows[0].receipt;
 const second=(await db.query("select jd_release_approved_execution($1,$2) receipt",[approval,owner])).rows[0].receipt;
 assert.equal(second.duplicate,true);assert.equal(second.job_id,first.job_id);
 assert.equal((await db.query("select count(*)::int count from jd_execution_jobs where run_id=$1",[run])).rows[0].count,1);
});
test("unapproved, wrong-action and non-admin release attempts are denied",async()=>{
 await assert.rejects(db.query("select jd_release_approved_execution($1,$2)",[approval,staff]),/Workspace administrator required/);
 await db.query("update jd_approvals set status='pending' where id=$1",[approval]);
 await assert.rejects(db.query("select jd_release_approved_execution($1,$2)",[approval,owner]),/Approval must be approved/);
 await db.query("update jd_approvals set status='approved',action_key='settings.apply' where id=$1",[approval]);
 await assert.rejects(db.query("select jd_release_approved_execution($1,$2)",[approval,owner]),/generic request/);
});
test("database release RPC is service_role-only",async()=>{
 const result=(await db.query("select has_function_privilege('anon','jd_release_approved_execution(uuid,uuid)','EXECUTE') anon,has_function_privilege('authenticated','jd_release_approved_execution(uuid,uuid)','EXECUTE') authenticated,has_function_privilege('service_role','jd_release_approved_execution(uuid,uuid)','EXECUTE') service")).rows[0];
 assert.deepEqual(result,{anon:false,authenticated:false,service:true});
});

test("response style is stored separately from the user's message and is immutable for the run",async()=>{
 const first=(await db.query("select jd_set_chat_response_style($1,$2,'concise') receipt",[run,staff])).rows[0].receipt;
 assert.equal(first.response_style,"concise");
 assert.equal(first.duplicate,false);
 const second=(await db.query("select jd_set_chat_response_style($1,$2,'concise') receipt",[run,staff])).rows[0].receipt;
 assert.equal(second.duplicate,true);
 await assert.rejects(db.query("select jd_set_chat_response_style($1,$2,'detailed')",[run,staff]),/already fixed/);
 const stored=(await db.query("select result_json->>'response_style' style from jd_automation_runs where id=$1",[run])).rows[0];
 assert.equal(stored.style,"concise");
});
