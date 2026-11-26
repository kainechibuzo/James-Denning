-- Rollback of 20261125110000_jd_finish_error_details.sql
drop function public.jd_finish_execution_job(uuid, uuid, text, text, text);

create function public.jd_finish_execution_job(
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

revoke all on function public.jd_finish_execution_job(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.jd_finish_execution_job(uuid, uuid, text) to service_role;
