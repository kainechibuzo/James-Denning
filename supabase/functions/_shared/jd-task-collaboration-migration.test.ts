import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const migration = await Deno.readTextFile(new URL("../../migrations/20261112084602_jd_task_collaboration.sql", import.meta.url));

Deno.test("task discussion records are tenant-scoped and inaccessible to browser roles", () => {
  assertEquals(migration.includes("alter table public.jd_task_comments enable row level security"), true);
  assertEquals(migration.includes("revoke all on public.jd_task_comments from anon, authenticated"), true);
  assertEquals(migration.includes("grant select, insert, update, delete on public.jd_task_comments to service_role"), true);
});

Deno.test("comment writes validate workspace role, task ownership and mentioned members", () => {
  assertEquals(migration.includes("role in ('admin','manager')"), true);
  assertEquals(migration.includes("v_task_school is distinct from v_school"), true);
  assertEquals(migration.includes("Every mentioned member must belong to this workspace"), true);
  assertEquals(migration.includes("p_parent_comment_id"), true);
});

Deno.test("comment creation is auditable and RPC execution is service-only", () => {
  assertEquals(migration.includes("'task.comment.created'"), true);
  assertEquals(migration.includes("grant execute on function public.jd_add_task_comment(uuid,uuid,text,uuid[],uuid) to service_role"), true);
  assertEquals(migration.includes("from public, anon, authenticated"), true);
});
