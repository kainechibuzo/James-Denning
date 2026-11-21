-- Keep the parent run recoverable when a job is waiting for its next provider attempt.
-- Cancellation is tenant-scoped, idempotent, audited, and immediately fences the active worker lease.
create or replace function public.jd_cancel_execution_job(
  p_job_id uuid,
  p_actor_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.jd_execution_jobs%rowtype;
  v_role text;
  v_now timestamptz := now();
begin
  select j.* into v_job
  from public.jd_execution_jobs j
  join public.profiles p on p.school_id=j.school_id
  where j.id=p_job_id and p.id=p_actor_id
    and (j.requested_by=p_actor_id or p.role in ('owner','admin','manager'))
  for update of j;

  if not found then
    raise exception 'Execution job not found or not authorised' using errcode='42501';
  end if;

  if v_job.status in ('completed','partially_completed','failed','cancelled') then
    return jsonb_build_object('cancelled',v_job.status='cancelled','status',v_job.status,'already_terminal',true);
  end if;

  update public.jd_execution_jobs
  set status='cancelled', lease_owner=null, lease_token=null, lease_expires_at=null,
      last_error_code='cancelled_by_user',
      last_error_message='Cancelled by the requester',
      completed_at=v_now, updated_at=v_now
  where id=v_job.id;

  update public.jd_automation_runs
  set status='cancelled', completed_at=v_now, updated_at=v_now,
      result_json=coalesce(result_json,'{}'::jsonb)||jsonb_build_object('cancelled_by',p_actor_id,'cancelled_at',v_now)
  where id=v_job.run_id and school_id=v_job.school_id
    and status not in ('completed','partially_completed','failed','cancelled');

  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
  values(v_job.school_id,p_actor_id,v_job.run_id,'execution.cancelled',
    jsonb_build_object('job_id',v_job.id,'previous_status',v_job.status,'attempt_count',v_job.attempt_count));

  if v_job.queue_message_id is not null then
    perform pgmq.archive('jd_execution_jobs',v_job.queue_message_id);
  end if;

  return jsonb_build_object('cancelled',true,'status','cancelled','job_id',v_job.id);
end;
$$;

-- The retry function in the durable queue migration previously left the parent
-- run marked "running". Keep it visibly queued while the job waits for retry.
create or replace function public.jd_retry_execution_job(
  p_job_id uuid, p_lease_token uuid, p_queue_message_id bigint,
  p_delay_seconds integer, p_error_code text, p_safe_error_message text
) returns jsonb
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
    raise exception 'Retry delay must be between 1 and 3600 seconds' using errcode='22023';
  end if;
  select * into v_job from public.jd_execution_jobs
  where id=p_job_id and status='running' and queue_message_id=p_queue_message_id
    and lease_token=p_lease_token and lease_expires_at>v_now for update;
  if not found then return jsonb_build_object('scheduled',false,'reason','lease_lost'); end if;

  if v_job.attempt_count >= v_job.max_attempts then
    update public.jd_execution_jobs set status='failed',lease_owner=null,lease_token=null,lease_expires_at=null,
      last_error_code=left(coalesce(p_error_code,'worker_error'),100),
      last_error_message=left(coalesce(p_safe_error_message,'Execution failed'),1000),
      completed_at=v_now,updated_at=v_now where id=v_job.id;
    update public.jd_automation_runs set status='failed',completed_at=v_now,updated_at=v_now
      where id=v_job.run_id and school_id=v_job.school_id;
    insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
      values(v_job.school_id,null,v_job.run_id,'execution.retry_exhausted',
        jsonb_build_object('job_id',v_job.id,'attempt_count',v_job.attempt_count,'error_code',left(coalesce(p_error_code,'worker_error'),100)));
    perform pgmq.archive('jd_execution_jobs',p_queue_message_id);
    return jsonb_build_object('scheduled',false,'status','failed');
  end if;

  update public.jd_execution_jobs set status='retry_wait',
    available_at=v_now+make_interval(secs=>p_delay_seconds),
    lease_owner=null,lease_token=null,lease_expires_at=null,
    last_error_code=left(coalesce(p_error_code,'worker_error'),100),
    last_error_message=left(coalesce(p_safe_error_message,'Execution failed'),1000),updated_at=v_now
    where id=v_job.id;
  v_message_id:=pgmq.send('jd_execution_jobs',jsonb_build_object('job_id',v_job.id,'schema_version',1),p_delay_seconds);
  update public.jd_execution_jobs set queue_message_id=v_message_id,updated_at=now() where id=v_job.id;
  update public.jd_automation_runs set status='queued',updated_at=v_now,
    result_json=coalesce(result_json,'{}'::jsonb)||jsonb_build_object('retry_wait',true,'retry_available_at',v_now+make_interval(secs=>p_delay_seconds),'last_error_code',left(coalesce(p_error_code,'worker_error'),100))
    where id=v_job.run_id and school_id=v_job.school_id and status not in ('cancelled','completed','partially_completed','failed');
  perform pgmq.archive('jd_execution_jobs',p_queue_message_id);
  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
    values(v_job.school_id,null,v_job.run_id,'execution.retry_scheduled',
      jsonb_build_object('job_id',v_job.id,'attempt_count',v_job.attempt_count,'delay_seconds',p_delay_seconds,'error_code',left(coalesce(p_error_code,'worker_error'),100)));
  return jsonb_build_object('scheduled',true,'status','retry_wait','available_at',v_now+make_interval(secs=>p_delay_seconds));
end;
$$;

revoke all on function public.jd_cancel_execution_job(uuid,uuid) from public,anon,authenticated;
grant execute on function public.jd_cancel_execution_job(uuid,uuid) to service_role;
