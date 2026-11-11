-- JD execution controls: explicit admin retry for exhausted jobs.
-- The job ledger remains authoritative; the queue message is only a delivery hint.

create or replace function public.jd_requeue_failed_execution_job(
  p_job_id uuid,
  p_actor_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.jd_execution_jobs%rowtype;
  v_school_id uuid;
  v_message_id bigint;
  v_now timestamptz := now();
begin
  select school_id into v_school_id
  from public.profiles
  where id = p_actor_id and role = 'admin';

  if v_school_id is null then
    raise exception 'Workspace administrator required' using errcode = '42501';
  end if;

  select * into v_job
  from public.jd_execution_jobs
  where id = p_job_id and school_id = v_school_id
  for update;

  if not found then
    raise exception 'Execution job not found' using errcode = 'P0002';
  end if;

  if v_job.status <> 'failed' then
    raise exception 'Only failed jobs can be manually retried' using errcode = '22023';
  end if;

  update public.jd_execution_jobs
  set status = 'queued',
      attempt_count = 0,
      available_at = v_now,
      lease_owner = null,
      lease_token = null,
      lease_expires_at = null,
      heartbeat_at = null,
      last_error_code = null,
      last_error_message = null,
      started_at = null,
      completed_at = null,
      updated_at = v_now
  where id = v_job.id;

  v_message_id := pgmq.send(
    'jd_execution_jobs',
    jsonb_build_object('job_id', v_job.id, 'schema_version', 1)
  );

  update public.jd_execution_jobs
  set queue_message_id = v_message_id, updated_at = now()
  where id = v_job.id;

  update public.jd_automation_runs
  set status = 'queued', completed_at = null, result_json = null, updated_at = now()
  where id = v_job.run_id and school_id = v_school_id;

  insert into public.jd_audit_events (
    school_id, actor_id, run_id, event_type, event_json
  ) values (
    v_school_id, p_actor_id, v_job.run_id, 'execution.manual_retry',
    jsonb_build_object('job_id', v_job.id, 'previous_attempt_count', v_job.attempt_count)
  );

  return jsonb_build_object(
    'job_id', v_job.id, 'run_id', v_job.run_id,
    'status', 'queued', 'queue_message_id', v_message_id
  );
end;
$$;

revoke all on function public.jd_requeue_failed_execution_job(uuid,uuid) from public,anon,authenticated;
grant execute on function public.jd_requeue_failed_execution_job(uuid,uuid) to service_role;
