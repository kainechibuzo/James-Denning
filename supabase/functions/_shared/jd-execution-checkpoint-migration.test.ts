const migrationUrl = new URL("../../migrations/20261111085151_jd_durable_execution_checkpoints.sql", import.meta.url);
const migration = await Deno.readTextFile(migrationUrl);

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

Deno.test("runtime checkpoints are private and bounded", () => {
  assert(migration.includes("create table if not exists public.jd_execution_checkpoints"), "private checkpoint table exists");
  assert(migration.includes("alter table public.jd_execution_checkpoints enable row level security"), "RLS is enabled");
  assert(migration.includes("revoke all on public.jd_execution_checkpoints from public, anon, authenticated"), "browser roles have no access");
  assert(migration.includes("grant all on public.jd_execution_checkpoints to service_role"), "service role has access");
  assert(migration.includes("pg_column_size(runtime_state_json) <= 524288"), "checkpoint size is bounded to 512 KiB");
});

Deno.test("checkpoint writes require the active unexpired lease", () => {
  assert(migration.includes("status = 'running'"), "only running jobs can checkpoint");
  assert(migration.includes("lease_token = p_lease_token"), "checkpoint writes are fenced by lease token");
  assert(migration.includes("lease_expires_at > v_now"), "expired leases cannot write checkpoints");
  assert(migration.includes("grant execute on function public.jd_save_execution_checkpoint(uuid, uuid, jsonb) to service_role"), "only service role can call checkpoint writer");
});
