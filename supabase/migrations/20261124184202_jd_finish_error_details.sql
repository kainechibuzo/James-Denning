-- Recovery and security follow-ups (roadmap operations review):
-- 1. Terminal execution failures must record their cause on the job row.
--    jd_retry_execution_job already stores the safe error message, but jobs
--    finalised directly as failed/partially_completed left last_error_message
--    NULL, hiding the actual failure cause (the run's result_json had it but
--    the job — the surface admins inspect for recovery — did not). Optional
--    error arguments extend the finish contract without changing callers that
--    do not need them.
-- 2. The four Supabase auth helper functions are flagged by the security
--    advisor for a mutable search path. Pinning it is the advisor-recommended
--    hardening and does not change their behaviour.

drop function public.jd_finish_execution_job(uuid, uuid, text);

create function public.jd_finish_execution_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_terminal_status text,
  p_error_code text default null,
  p_error_message text default null
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
      last_error_code = case when p_terminal_status in ('failed','partially_completed')
        then left(coalesce(p_error_code, last_error_code, 'worker_error'), 100) else null end,
      last_error_message = case when p_terminal_status in ('failed','partially_completed')
        then left(coalesce(p_error_message, last_error_message, 'Execution failed'), 1000) else null end,
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
    jsonb_build_object('job_id', v_job.id, 'attempt_count', v_job.attempt_count,
      'error_code', case when p_terminal_status in ('failed','partially_completed') then left(coalesce(p_error_code,'worker_error'),100) else null end)
  );

  return true;
end;
$$;

revoke all on function public.jd_finish_execution_job(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.jd_finish_execution_job(uuid, uuid, text, text, text) to service_role;
