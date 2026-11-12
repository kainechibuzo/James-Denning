-- JD-004A: durable execution job ledger and queue primitives.
-- Apply only after JD control-plane migrations have been validated in a non-production
-- Supabase environment. Queue messages contain opaque identifiers only.
create extension if not exists pgmq;

do $$
begin
  if not exists (
    select 1
    from pgmq.list_queues() q
    where q.queue_name = 'jd_execution_jobs'
  ) then
    perform pgmq.create('jd_execution_jobs');
  end if;
end;
$$;

create table if not exists public.jd_execution_jobs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  run_id uuid not null references public.jd_automation_runs(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued','running','retry_wait','completed','partially_completed','failed','cancelled')),
  idempotency_key text not null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  available_at timestamptz not null default now(),
  lease_owner text,
  lease_token uuid,
  lease_expires_at timestamptz,
  heartbeat_at timestamptz,
  checkpoint_step_index integer not null default -1 check (checkpoint_step_index >= -1),
  queue_message_id bigint,
  last_error_code text,
  last_error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jd_execution_jobs_one_job_per_run unique (run_id),
  constraint jd_execution_jobs_idempotency unique (school_id, idempotency_key),
  constraint jd_execution_jobs_lease_consistency check (
    (status = 'running' and lease_owner is not null and lease_token is not null and lease_expires_at is not null)
    or
    (status <> 'running' and lease_owner is null and lease_token is null and lease_expires_at is null)
  )
);

create index if not exists jd_execution_jobs_dispatch_idx
  on public.jd_execution_jobs (status, available_at, created_at)
  where status in ('queued','retry_wait');

create index if not exists jd_execution_jobs_school_status_idx
  on public.jd_execution_jobs (school_id, status, created_at desc);

alter table public.jd_execution_jobs enable row level security;

drop policy if exists jd_execution_jobs_select on public.jd_execution_jobs;
create policy jd_execution_jobs_select on public.jd_execution_jobs
  for select to authenticated
  using (
    exists (
      select 1
      from public.jd_automation_runs r
      join public.profiles p on p.id = (select auth.uid())
      where r.id = jd_execution_jobs.run_id
        and r.school_id = jd_execution_jobs.school_id
        and (r.requested_by = (select auth.uid()) or p.role = 'admin')
        and p.school_id = jd_execution_jobs.school_id
    )
  );

revoke all on public.jd_execution_jobs from anon, authenticated;
grant select on public.jd_execution_jobs to authenticated;
grant all on public.jd_execution_jobs to service_role;

comment on table public.jd_execution_jobs is
  'Authoritative tenant-scoped execution ledger. Queue messages are delivery hints; this table owns state.';
comment on column public.jd_execution_jobs.idempotency_key is
  'Copied from the parent JD run; unique within a workspace.';
comment on column public.jd_execution_jobs.lease_token is
  'Fresh per-claim fencing token. Stale workers cannot mutate a job after lease replacement.';
comment on column public.jd_execution_jobs.checkpoint_step_index is
  'Highest step index durably checkpointed by the worker; -1 means no step has completed.';

create or replace function public.jd_enqueue_execution_job(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.jd_automation_runs%rowtype;
  v_job public.jd_execution_jobs%rowtype;
  v_message_id bigint;
begin
  select * into v_run
  from public.jd_automation_runs
  where id = p_run_id
  for update;

  if not found then
    raise exception 'JD run not found' using errcode = 'P0002';
  end if;

  if v_run.status not in ('queued','planning') then
    raise exception 'JD run is not eligible for background execution' using errcode = '22023';
  end if;

  select * into v_job
  from public.jd_execution_jobs
  where run_id = p_run_id;

  if found then
    return jsonb_build_object('job_id', v_job.id, 'run_id', v_job.run_id, 'status', v_job.status, 'duplicate', true);
  end if;

  if v_run.idempotency_key is null or length(v_run.idempotency_key) = 0 then
    raise exception 'JD run requires an idempotency key' using errcode = '22023';
  end if;

  insert into public.jd_execution_jobs (
    school_id, run_id, requested_by, idempotency_key
  ) values (
    v_run.school_id, v_run.id, v_run.requested_by, v_run.idempotency_key
  ) returning * into v_job;

  v_message_id := pgmq.send(
    'jd_execution_jobs',
    jsonb_build_object('job_id', v_job.id, 'schema_version', 1)
  );

  update public.jd_execution_jobs
  set queue_message_id = v_message_id, updated_at = now()
  where id = v_job.id;

  update public.jd_automation_runs
  set status = 'queued', updated_at = now()
  where id = v_run.id;

  insert into public.jd_audit_events (
    school_id, actor_id, run_id, event_type, event_json
  ) values (
    v_run.school_id, v_run.requested_by, v_run.id, 'execution.queued',
    jsonb_build_object('job_id', v_job.id, 'queue', 'jd_execution_jobs')
  );

  return jsonb_build_object('job_id', v_job.id, 'run_id', v_job.run_id, 'status', 'queued', 'duplicate', false);
end;
$$;

create or replace function public.jd_claim_execution_job(
  p_job_id uuid,
  p_queue_message_id bigint,
  p_worker_id text,
  p_lease_seconds integer default 90
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.jd_execution_jobs%rowtype;
  v_token uuid := gen_random_uuid();
  v_now timestamptz := now();
begin
  if p_worker_id is null or length(trim(p_worker_id)) = 0 or length(p_worker_id) > 120 then
    raise exception 'Invalid worker identifier' using errcode = '22023';
  end if;
  if p_lease_seconds is null or p_lease_seconds < 15 or p_lease_seconds > 600 then
    raise exception 'Lease duration must be between 15 and 600 seconds' using errcode = '22023';
  end if;

  update public.jd_execution_jobs j
  set status = 'running',
      attempt_count = j.attempt_count + 1,
      lease_owner = trim(p_worker_id),
      lease_token = v_token,
      lease_expires_at = v_now + make_interval(secs => p_lease_seconds),
      heartbeat_at = v_now,
      started_at = coalesce(j.started_at, v_now),
      updated_at = v_now
  where j.id = p_job_id
    and j.queue_message_id = p_queue_message_id
    and j.attempt_count < j.max_attempts
    and (
      (j.status in ('queued','retry_wait') and j.available_at <= v_now)
      or
      (j.status = 'running' and j.lease_expires_at <= v_now)
    )
  returning j.* into v_job;

  if not found then
    return jsonb_build_object('claimed', false);
  end if;

  update public.jd_automation_runs
  set status = 'running', started_at = coalesce(started_at, v_now), updated_at = v_now
  where id = v_job.run_id and school_id = v_job.school_id
    and status in ('queued','planning','running');

  insert into public.jd_audit_events (
    school_id, actor_id, run_id, event_type, event_json
  ) values (
    v_job.school_id, null, v_job.run_id, 'execution.claimed',
    jsonb_build_object('job_id', v_job.id, 'attempt', v_job.attempt_count, 'worker_id', trim(p_worker_id))
  );

  return jsonb_build_object(
    'claimed', true, 'job_id', v_job.id, 'run_id', v_job.run_id,
    'school_id', v_job.school_id, 'requested_by', v_job.requested_by,
    'lease_token', v_job.lease_token, 'lease_expires_at', v_job.lease_expires_at,
    'attempt_count', v_job.attempt_count, 'checkpoint_step_index', v_job.checkpoint_step_index
  );
end;
$$;

create or replace function public.jd_heartbeat_execution_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_lease_seconds integer default 90
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
begin
  if p_lease_seconds < 15 or p_lease_seconds > 600 then
    raise exception 'Lease duration must be between 15 and 600 seconds' using errcode = '22023';
  end if;

  update public.jd_execution_jobs
  set heartbeat_at = v_now,
      lease_expires_at = v_now + make_interval(secs => p_lease_seconds),
      updated_at = v_now
  where id = p_job_id and status = 'running'
    and lease_token = p_lease_token and lease_expires_at > v_now;

  return found;
end;
$$;

create or replace function public.jd_checkpoint_execution_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_step_index integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
begin
  if p_step_index < 0 then
    raise exception 'Step index must be zero or greater' using errcode = '22023';
  end if;

  update public.jd_execution_jobs
  set checkpoint_step_index = greatest(checkpoint_step_index, p_step_index),
      heartbeat_at = v_now,
      updated_at = v_now
  where id = p_job_id and status = 'running'
    and lease_token = p_lease_token and lease_expires_at > v_now;

  return found;
end;
$$;

create or replace function public.jd_finish_execution_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_terminal_status text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.jd_execution_jobs%rowtype;
  v_now timestamptz := now();
begin
  if p_terminal_status is null or p_terminal_status not in ('completed','partially_completed','failed','cancelled') then
    raise exception 'Invalid terminal execution status' using errcode = '22023';
  end if;

  update public.jd_execution_jobs
  set status = p_terminal_status,
      lease_owner = null, lease_token = null, lease_expires_at = null,
      completed_at = v_now, updated_at = v_now
  where id = p_job_id and status = 'running'
    and lease_token = p_lease_token and lease_expires_at > v_now
  returning * into v_job;

  if not found then
    return false;
  end if;

  update public.jd_automation_runs
  set status = p_terminal_status, completed_at = v_now, updated_at = v_now
  where id = v_job.run_id and school_id = v_job.school_id;

  insert into public.jd_audit_events (
    school_id, actor_id, run_id, event_type, event_json
  ) values (
    v_job.school_id, v_job.requested_by, v_job.run_id, 'execution.' || p_terminal_status,
    jsonb_build_object('job_id', v_job.id, 'attempt_count', v_job.attempt_count)
  );

  return true;
end;
$$;

create or replace function public.jd_retry_execution_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_queue_message_id bigint,
  p_delay_seconds integer,
  p_error_code text,
  p_safe_error_message text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.jd_execution_jobs%rowtype;
  v_message_id bigint;
  v_now timestamptz := now();
begin
  if p_delay_seconds is null or p_delay_seconds < 1 or p_delay_seconds > 3600 then
    raise exception 'Retry delay must be between 1 and 3600 seconds' using errcode = '22023';
  end if;

  select * into v_job
  from public.jd_execution_jobs
  where id = p_job_id and status = 'running'
    and queue_message_id = p_queue_message_id
    and lease_token = p_lease_token and lease_expires_at > v_now
  for update;

  if not found then
    return jsonb_build_object('scheduled', false, 'reason', 'lease_lost');
  end if;

  if v_job.attempt_count >= v_job.max_attempts then
    update public.jd_execution_jobs
    set status = 'failed', lease_owner = null, lease_token = null, lease_expires_at = null,
        last_error_code = left(coalesce(p_error_code, 'worker_error'), 100),
        last_error_message = left(coalesce(p_safe_error_message, 'Execution failed'), 1000),
        completed_at = v_now, updated_at = v_now
    where id = v_job.id;

    update public.jd_automation_runs
    set status = 'failed', completed_at = v_now, updated_at = v_now
    where id = v_job.run_id and school_id = v_job.school_id;

    insert into public.jd_audit_events (
      school_id, actor_id, run_id, event_type, event_json
    ) values (
      v_job.school_id, null, v_job.run_id, 'execution.retry_exhausted',
      jsonb_build_object('job_id', v_job.id, 'attempt_count', v_job.attempt_count,
        'error_code', left(coalesce(p_error_code, 'worker_error'), 100))
    );
    perform pgmq.archive('jd_execution_jobs', p_queue_message_id);
    return jsonb_build_object('scheduled', false, 'status', 'failed');
  end if;

  update public.jd_execution_jobs
  set status = 'retry_wait', available_at = v_now + make_interval(secs => p_delay_seconds),
      lease_owner = null, lease_token = null, lease_expires_at = null,
      last_error_code = left(coalesce(p_error_code, 'worker_error'), 100),
      last_error_message = left(coalesce(p_safe_error_message, 'Execution failed'), 1000),
      updated_at = v_now
  where id = v_job.id;

  v_message_id := pgmq.send(
    'jd_execution_jobs',
    jsonb_build_object('job_id', v_job.id, 'schema_version', 1),
    p_delay_seconds
  );

  update public.jd_execution_jobs
  set queue_message_id = v_message_id, updated_at = now()
  where id = v_job.id;

  perform pgmq.archive('jd_execution_jobs', p_queue_message_id);

  insert into public.jd_audit_events (
    school_id, actor_id, run_id, event_type, event_json
  ) values (
    v_job.school_id, null, v_job.run_id, 'execution.retry_scheduled',
    jsonb_build_object('job_id', v_job.id, 'attempt_count', v_job.attempt_count,
      'delay_seconds', p_delay_seconds, 'error_code', left(coalesce(p_error_code, 'worker_error'), 100))
  );

  return jsonb_build_object('scheduled', true, 'status', 'retry_wait', 'available_at', v_now + make_interval(secs => p_delay_seconds));
end;
$$;

revoke all on function public.jd_enqueue_execution_job(uuid) from public, anon, authenticated;
revoke all on function public.jd_claim_execution_job(uuid, bigint, text, integer) from public, anon, authenticated;
revoke all on function public.jd_heartbeat_execution_job(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.jd_checkpoint_execution_job(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.jd_finish_execution_job(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.jd_retry_execution_job(uuid, uuid, bigint, integer, text, text) from public, anon, authenticated;

grant execute on function public.jd_enqueue_execution_job(uuid) to service_role;
grant execute on function public.jd_claim_execution_job(uuid, bigint, text, integer) to service_role;
grant execute on function public.jd_heartbeat_execution_job(uuid, uuid, integer) to service_role;
grant execute on function public.jd_checkpoint_execution_job(uuid, uuid, integer) to service_role;
grant execute on function public.jd_finish_execution_job(uuid, uuid, text) to service_role;
grant execute on function public.jd_retry_execution_job(uuid, uuid, bigint, integer, text, text) to service_role;


-- Worker-only queue access. The queue schema itself is never exposed to browser clients.
create or replace function public.jd_read_execution_messages(
  p_visibility_seconds integer default 120,
  p_batch_size integer default 5
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_messages jsonb;
begin
  if p_visibility_seconds is null or p_visibility_seconds < 15 or p_visibility_seconds > 600 then
    raise exception 'Visibility timeout must be between 15 and 600 seconds' using errcode = '22023';
  end if;
  if p_batch_size is null or p_batch_size < 1 or p_batch_size > 20 then
    raise exception 'Batch size must be between 1 and 20' using errcode = '22023';
  end if;

  select coalesce(
    jsonb_agg(jsonb_build_object(
      'message_id', q.msg_id,
      'read_count', q.read_ct,
      'enqueued_at', q.enqueued_at,
      'visible_at', q.vt,
      'message', q.message
    ) order by q.msg_id),
    '[]'::jsonb
  )
  into v_messages
  from pgmq.read('jd_execution_jobs', p_visibility_seconds, p_batch_size) q;

  return v_messages;
end;
$$;

create or replace function public.jd_ack_execution_message(
  p_job_id uuid,
  p_queue_message_id bigint
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  select status into v_status
  from public.jd_execution_jobs
  where id = p_job_id and queue_message_id = p_queue_message_id;

  if v_status is null or v_status not in ('completed','partially_completed','failed','cancelled') then
    return false;
  end if;

  return pgmq.archive('jd_execution_jobs', p_queue_message_id);
end;
$$;

revoke all on function public.jd_read_execution_messages(integer, integer) from public, anon, authenticated;
revoke all on function public.jd_ack_execution_message(uuid, bigint) from public, anon, authenticated;
grant execute on function public.jd_read_execution_messages(integer, integer) to service_role;
grant execute on function public.jd_ack_execution_message(uuid, bigint) to service_role;
