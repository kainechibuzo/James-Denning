import {assertEquals} from "https://deno.land/std@0.224.0/assert/mod.ts";
const migration=await Deno.readTextFile(new URL("../../migrations/20261111193000_jd_recurring_tasks_and_assignment.sql",import.meta.url));
Deno.test("recurring schedule schema is tenant-scoped and browser-inaccessible",()=>{
 for(const table of ["jd_task_schedules","jd_task_assignment_members"]){
  assertEquals(migration.includes(`alter table public.${table} enable row level security`),true);
  assertEquals(migration.includes(`revoke all on public.${table} from anon,authenticated`),true);
 }
});
Deno.test("schedule dispatch is service-role-only and idempotent",()=>{
 assertEquals(migration.includes("grant execute on function public.jd_dispatch_task_schedule(uuid,timestamptz,timestamptz) to service_role"),true);
 assertEquals(migration.includes("on conflict(school_id,idempotency_key) do nothing"),true);
 assertEquals(migration.includes("v_schedule.next_run_at<>p_expected_run_at"),true);
});
Deno.test("automatic assignment enforces tenant, department and workload capacity",()=>{
 assertEquals(migration.includes("m.school_id=v_school"),true);
 assertEquals(migration.includes("lower(m.department)=lower(coalesce(v_task.department,''))"),true);
 assertEquals(migration.includes("having count(t.id)<m.max_open_tasks"),true);
});
Deno.test("schedule creation validates IANA timezone and manager role",()=>{
 assertEquals(migration.includes("pg_catalog.pg_timezone_names"),true);
 assertEquals(migration.includes("role in ('admin','manager')"),true);
});
