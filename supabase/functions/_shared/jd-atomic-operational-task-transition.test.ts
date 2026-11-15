import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const migration = await Deno.readTextFile(new URL("../../migrations/20261113200345_jd_atomic_operational_task_transition.sql", import.meta.url));

Deno.test("operational task status and audit writes share one transaction", () => {
  assertEquals(migration.includes("for update"), true);
  assertEquals(migration.includes("update public.jd_operational_tasks"), true);
  assertEquals(migration.includes("insert into public.jd_audit_events"), true);
  assertEquals(migration.includes("returning id into v_audit_id"), true);
  assertEquals(migration.includes("return jsonb_build_object("), true);
});

Deno.test("transition RPC rechecks actor role and tenant ownership", () => {
  assertEquals(migration.includes("where id=p_actor_id and role in ('admin','manager')"), true);
  assertEquals(migration.includes("where id=p_task_id and school_id=v_school"), true);
  assertEquals(migration.includes("v_task.status is distinct from p_expected_status"), true);
});

Deno.test("transition RPC rejects invalid state changes and is service-only", () => {
  assertEquals(migration.includes("Invalid operational task transition"), true);
  assertEquals(migration.includes("revoke all on function public.jd_transition_operational_task(uuid,uuid,text,text) from public, anon, authenticated"), true);
  assertEquals(migration.includes("grant execute on function public.jd_transition_operational_task(uuid,uuid,text,text) to service_role"), true);
});
