import {assertEquals} from "https://deno.land/std@0.224.0/assert/mod.ts";
const migration=await Deno.readTextFile(new URL("../../migrations/20261111190000_jd_execution_retry_controls.sql",import.meta.url));
Deno.test("manual retry is service-role only and admin scoped",()=>{
 assertEquals(migration.includes("where id = p_actor_id and role = 'admin'"),true);
 assertEquals(migration.includes("where id = p_job_id and school_id = v_school_id"),true);
 assertEquals(migration.includes("if v_job.status <> 'failed'"),true);
 assertEquals(migration.includes("to service_role"),true);
});
