const migrationUrl = new URL("../../migrations/20261111130000_jd_durable_execution_jobs.sql", import.meta.url);
const migration = await Deno.readTextFile(migrationUrl);

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

Deno.test("JD job ledger is tenant-scoped and browser read-only", () => {
  assert(migration.includes("create table if not exists public.jd_execution_jobs"), "job ledger table exists");
  assert(migration.includes("alter table public.jd_execution_jobs enable row level security"), "RLS is enabled");
  assert(migration.includes("grant select on public.jd_execution_jobs to authenticated"), "authenticated users receive read-only access");
  assert(migration.includes("revoke all on public.jd_execution_jobs from anon, authenticated"), "browser write privileges are revoked");
  assert(migration.includes("grant all on public.jd_execution_jobs to service_role"), "service role owns job writes");
  assert(migration.includes("p.school_id = jd_execution_jobs.school_id"), "job reads enforce workspace scope");
  assert(migration.includes("r.requested_by = (select auth.uid()) or p.role = 'admin'"), "job reads are limited to requester or workspace admin");
});

Deno.test("queue messages contain opaque job identifiers, not prompts or tool payloads", () => {
  assert(migration.includes("jsonb_build_object('job_id', v_job.id, 'schema_version', 1)"), "initial queue message is opaque");
  assert(migration.includes("jsonb_build_object('job_id', v_job.id, 'schema_version', 1),"), "retry queue message is opaque");
  assert(!/request_text|input_json|output_json|authorization|service_role_key/i.test(
    migration.slice(migration.indexOf("v_message_id := pgmq.send"), migration.indexOf("update public.jd_execution_jobs\n  set queue_message_id"))
  ), "queue payload must not include sensitive execution data");
});

Deno.test("claims use bounded leases, fencing tokens and bounded attempts", () => {
  assert(migration.includes("p_lease_seconds is null or p_lease_seconds < 15 or p_lease_seconds > 600"), "lease duration is bounded");
  assert(migration.includes("j.queue_message_id = p_queue_message_id"), "claim is fenced to the delivered queue message");
  assert(migration.includes("attempt_count = j.attempt_count + 1"), "attempt count increments atomically");
  assert(migration.includes("j.attempt_count < j.max_attempts"), "maximum attempts are enforced");
  assert(migration.includes("lease_token = p_lease_token and lease_expires_at > v_now"), "heartbeat and checkpoint reject stale leases");
  assert(migration.includes("unique (run_id)"), "one durable job exists per run");
  assert(migration.includes("unique (school_id, idempotency_key)"), "idempotency key is unique within workspace");
});

Deno.test("worker queue access is bounded and server-only", () => {
  assert(migration.includes("p_visibility_seconds < 15 or p_visibility_seconds > 600"), "queue visibility is bounded");
  assert(migration.includes("p_batch_size < 1 or p_batch_size > 20"), "worker batch size is bounded");
  assert(migration.includes("grant execute on function public.jd_read_execution_messages(integer, integer) to service_role"), "only service role can read queue messages");
  assert(migration.includes("grant execute on function public.jd_ack_execution_message(uuid, bigint) to service_role"), "only service role can acknowledge messages");
  assert(migration.includes("if v_status is null or v_status not in ('completed','partially_completed','failed','cancelled')"), "acknowledgement rejects unknown jobs and non-terminal states");
});

Deno.test("retry scheduling is bounded and archives the replaced delivery", () => {
  assert(migration.includes("p_delay_seconds < 1 or p_delay_seconds > 3600"), "retry delay is bounded");
  assert(migration.includes("pgmq.send("), "retry schedules a new queue delivery");
  assert(migration.includes("pgmq.archive('jd_execution_jobs', p_queue_message_id)"), "old queue delivery is archived");
  assert(migration.includes("execution.retry_exhausted"), "exhausted retries are audited");
});
