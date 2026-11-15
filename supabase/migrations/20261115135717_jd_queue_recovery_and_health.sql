alter table public.jd_execution_jobs
  add column if not exists dispatch_recovery_count integer not null default 0
    check (dispatch_recovery_count >= 0),
  add column if not exists last_dispatch_recovered_at timestamptz;

create index if not exists jd_execution_jobs_recovery_idx
  on public.jd_execution_jobs (status, updated_at, available_at)
  where status in ('queued','retry_wait','running');

create or replace function public.jd_recover_stale_execution_jobs(
  p_stale_after_seconds integer default 60,
  p_batch_size integer default 25
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_job public.jd_execution_jobs%rowtype;
  v_new_message_id bigint;
  v_now timestamptz := now();
  v_recovered integer := 0;
  v_failed integer := 0;
  v_examined integer := 0;
  v_stale_before timestamptz;
begin
  if p_stale_after_seconds is null or p_stale_after_seconds < 15 or p_stale_after_seconds > 3600 then
    raise exception 'Stale threshold must be between 15 and 3600 seconds' using errcode = '22023';
  end if;
  if p_batch_size is null or p_batch_size < 1 or p_batch_size > 100 then
    raise exception 'Recovery batch size must be between 1 and 100' using errcode = '22023';
  end if;
  v_stale_before := v_now - make_interval(secs => p_stale_after_seconds);

  for v_job in
    select j.* from public.jd_execution_jobs j
    where ((j.status in ('queued','retry_wait') and j.available_at <= v_now and j.updated_at <= v_stale_before)
      or (j.status = 'running' and j.lease_expires_at <= v_now))
    order by coalesce(j.lease_expires_at, j.updated_at), j.created_at
    for update skip locked limit p_batch_size
  loop
    v_examined := v_examined + 1;
    if v_job.dispatch_recovery_count >= 8 or v_job.attempt_count >= v_job.max_attempts then
      update public.jd_execution_jobs set status='failed', lease_owner=null, lease_token=null,
        lease_expires_at=null, last_error_code='worker_unclaimed_or_lease_expired',
        last_error_message='JD could not safely claim this queued task after automatic recovery attempts.',
        completed_at=v_now, updated_at=v_now where id=v_job.id;
      update public.jd_automation_runs set status='failed', completed_at=v_now, updated_at=v_now
        where id=v_job.run_id and school_id=v_job.school_id;
      if v_job.queue_message_id is not null then perform pgmq.archive('jd_execution_jobs',v_job.queue_message_id); end if;
      insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
      values(v_job.school_id,null,v_job.run_id,'execution.dispatch_recovery_exhausted',
        jsonb_build_object('job_id',v_job.id,'recovery_count',v_job.dispatch_recovery_count,'attempt_count',v_job.attempt_count));
      v_failed := v_failed + 1;
      continue;
    end if;
    if v_job.queue_message_id is not null then perform pgmq.archive('jd_execution_jobs',v_job.queue_message_id); end if;
    v_new_message_id := pgmq.send('jd_execution_jobs',jsonb_build_object('job_id',v_job.id,'schema_version',1));
    update public.jd_execution_jobs set status='queued', lease_owner=null, lease_token=null,
      lease_expires_at=null, available_at=v_now, queue_message_id=v_new_message_id,
      dispatch_recovery_count=dispatch_recovery_count+1, last_dispatch_recovered_at=v_now,
      last_error_code=case when status='running' then 'worker_lease_expired' else last_error_code end,
      last_error_message=case when status='running' then 'A worker lease expired; the task was returned to the queue.' else last_error_message end,
      updated_at=v_now where id=v_job.id;
    update public.jd_automation_runs set status='queued', completed_at=null, updated_at=v_now
      where id=v_job.run_id and school_id=v_job.school_id;
    insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
    values(v_job.school_id,null,v_job.run_id,'execution.dispatch_recovered',
      jsonb_build_object('job_id',v_job.id,'recovery_count',v_job.dispatch_recovery_count+1,
        'previous_status',v_job.status,'new_queue_message_id',v_new_message_id));
    v_recovered := v_recovered + 1;
  end loop;
  return jsonb_build_object('examined',v_examined,'recovered',v_recovered,'failed',v_failed,
    'stale_before',v_stale_before,'checked_at',v_now);
end;
$$;

create or replace function public.jd_execution_queue_health()
returns jsonb language sql security definer set search_path = ''
as $$
  select jsonb_build_object(
    'queued',count(*) filter(where status='queued'),
    'running',count(*) filter(where status='running'),
    'retry_wait',count(*) filter(where status='retry_wait'),
    'completed',count(*) filter(where status='completed'),
    'partially_completed',count(*) filter(where status='partially_completed'),
    'failed',count(*) filter(where status='failed'),
    'cancelled',count(*) filter(where status='cancelled'),
    'oldest_queued_at',min(created_at) filter(where status='queued'),
    'oldest_queued_age_seconds',coalesce(extract(epoch from (now()-(min(created_at) filter(where status='queued'))))::integer,0),
    'stale_queued',count(*) filter(where status='queued' and updated_at < now()-interval '60 seconds'),
    'expired_leases',count(*) filter(where status='running' and lease_expires_at <= now()),
    'checked_at',now()
  ) from public.jd_execution_jobs;
$$;

revoke all on function public.jd_recover_stale_execution_jobs(integer,integer) from public,anon,authenticated;
revoke all on function public.jd_execution_queue_health() from public,anon,authenticated;
grant execute on function public.jd_recover_stale_execution_jobs(integer,integer) to service_role;
grant execute on function public.jd_execution_queue_health() to service_role;
