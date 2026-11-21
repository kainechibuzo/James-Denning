-- Roll back only the retry/run-state override from 20261121170000.
-- This restores the original durable-queue retry function definition.
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

