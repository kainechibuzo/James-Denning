import test,{before,after} from "node:test";
import assert from "node:assert/strict";
import {PGlite} from "@electric-sql/pglite";
import {readFileSync} from "node:fs";

const db=new PGlite();
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const owner=id(1),other=id(2),school=id(3),otherSchool=id(4),team=id(5),assignment=id(6);
const migration=readFileSync("supabase/migrations/20261124210000_jd_workforce_team_budgets.sql","utf8");
before(async()=>{
 await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth;
  create table auth.users(id uuid primary key);
  create table public.schools(id uuid primary key);
  create table public.profiles(id uuid primary key,school_id uuid,role text);
  create table public.jd_workforce_teams(id uuid primary key,school_id uuid not null,name text,unique(school_id,id));
  create table public.jd_workforce_assignments(id uuid primary key,school_id uuid not null,team_id uuid);
  create table public.jd_workforce_employee_usage(id uuid primary key default gen_random_uuid(),school_id uuid not null,employee_id uuid not null,assignment_id uuid not null,amount_micros bigint not null,reconciliation_status text not null);
  create table public.jd_audit_events(id uuid primary key default gen_random_uuid(),school_id uuid,actor_id uuid,event_type text,event_json jsonb);
 `);
 await db.exec(migration);
 await db.query("insert into schools values($1),($2)",[school,otherSchool]);
 await db.query("insert into auth.users values($1),($2)",[owner,other]);
 await db.query("insert into profiles values($1,$2,'owner'),($3,$4,'owner')",[owner,school,other,otherSchool]);
 await db.query("insert into jd_workforce_teams values($1,$2,'Delivery'),($3,$4,'Other')",[team,school,id(7),otherSchool]);
 await db.query("insert into jd_workforce_assignments values($1,$2,$3)",[assignment,school,team]);
});
after(()=>db.close());
const rpc=async(name,args)=>{
 const result=await db.query(`select public.${name}(${args.map((_,i)=>"$"+(i+1)).join(",")}) as result`,args);
 return result.rows[0].result;
};
test("team budgets are idempotent, versioned and owner-scoped",async()=>{
 const request=id(8);
 const first=await rpc("jd_workforce_set_team_budget",[owner,request,team,0,1000]);
 assert.equal(first.budget_micros,1000);
 assert.equal(first.accrued_micros,0);
 assert.equal(first.charged,false);
 const replay=await rpc("jd_workforce_set_team_budget",[owner,request,team,0,1000]);
 assert.equal(replay.replayed,true);
 await assert.rejects(rpc("jd_workforce_set_team_budget",[owner,request,team,0,1200]),e=>e.code==="40001");
 await assert.rejects(rpc("jd_workforce_set_team_budget",[other,id(9),team,0,500]),e=>e.code==="P0002");
 await assert.rejects(rpc("jd_workforce_set_team_budget",[owner,id(10),team,0,1200]),e=>e.code==="40001");
});
test("team budget aggregates employee usage and disputes the observation that crosses the ceiling",async()=>{
 await db.query("insert into jd_workforce_employee_usage(school_id,employee_id,assignment_id,amount_micros,reconciliation_status) values($1,$2,$3,600,'observed')",[school,id(11),assignment]);
 let row=(await db.query("select * from jd_workforce_team_budgets where team_id=$1",[team])).rows[0];
 assert.equal(Number(row.accrued_micros),600);
 await db.query("insert into jd_workforce_employee_usage(school_id,employee_id,assignment_id,amount_micros,reconciliation_status) values($1,$2,$3,500,'observed')",[school,id(12),assignment]);
 const usage=(await db.query("select reconciliation_status from jd_workforce_employee_usage where employee_id=$1",[id(12)])).rows[0];
 assert.equal(usage.reconciliation_status,"disputed");
 row=(await db.query("select * from jd_workforce_team_budgets where team_id=$1",[team])).rows[0];
 assert.equal(Number(row.accrued_micros),1100);
});
test("team budgets cannot be lowered below accrued usage and usage without a configured team budget stays unbounded",async()=>{
 await assert.rejects(rpc("jd_workforce_set_team_budget",[owner,id(13),team,1,1000]),e=>e.code==="22023");
 const noBudgetTeam=id(14),noBudgetAssignment=id(15);
 await db.query("insert into jd_workforce_teams values($1,$2,'No cap')",[noBudgetTeam,school]);
 await db.query("insert into jd_workforce_assignments values($1,$2,$3)",[noBudgetAssignment,school,noBudgetTeam]);
 await db.query("insert into jd_workforce_employee_usage(school_id,employee_id,assignment_id,amount_micros,reconciliation_status) values($1,$2,$3,900,'observed')",[school,id(16),noBudgetAssignment]);
 assert.equal((await db.query("select count(*)::int as n from jd_workforce_team_budgets where team_id=$1",[noBudgetTeam])).rows[0].n,0);
});
test("rollback removes team budget enforcement without changing employee usage",async()=>{
 await db.exec("begin");
 try{
  const rollback=readFileSync("supabase/migrations/20261124210000_jd_workforce_team_budgets.rollback.sql","utf8");
  await db.exec(rollback);
  const tables=await db.query("select count(*)::int as n from information_schema.tables where table_schema='public' and table_name in ('jd_workforce_team_budgets','jd_workforce_team_budget_requests')");
  assert.equal(tables.rows[0].n,0);
  assert.equal((await db.query("select count(*)::int as n from jd_workforce_employee_usage")).rows[0].n,3);
 }finally{await db.exec("rollback");}
});
