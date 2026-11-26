-- Candidate only: rehearse in isolated staging before an approved release.
-- Queue messages are hints. The job ledger fences claims after cancellation;
-- leave delivery messages, steps, checkpoints and prior results as evidence.
create or replace function public.jd_cancel_execution_job_checked(
 p_actor_id uuid, p_job_id uuid, p_expected_run_id uuid,
 p_expected_updated_at timestamptz
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
 v_school uuid;
 v_job public.jd_execution_jobs%rowtype;
 v_run public.jd_automation_runs%rowtype;
 v_audit uuid;
 v_now timestamptz;
begin
 select school_id into v_school from public.profiles
 where id=p_actor_id and role in ('owner','admin') for share;
 if v_school is null then
  raise exception 'Workspace administrator required' using errcode='42501';
 end if;
 if p_job_id is null or p_expected_run_id is null or p_expected_updated_at is null then
  raise exception 'Observed job, run and version are required' using errcode='22023';
 end if;
 -- Same job-before-run lock order as the worker claim and retry paths.
 select * into v_job from public.jd_execution_jobs
 where id=p_job_id and school_id=v_school for update;
 if not found then
  raise exception 'Execution job not found' using errcode='P0002';
 end if;
 if v_job.run_id is distinct from p_expected_run_id
    or v_job.updated_at is distinct from p_expected_updated_at then
  raise exception 'Execution job changed; refresh records' using errcode='40001';
 end if;
 if v_job.status not in ('queued','retry_wait') then
  raise exception 'Only queued or waiting jobs can be cancelled' using errcode='40001';
 end if;
 select * into v_run from public.jd_automation_runs
 where id=v_job.run_id and school_id=v_school for update;
 if not found then
  raise exception 'Execution run not found in workspace' using errcode='P0002';
 end if;
 -- A retry-wait job may retain a running summary from its prior attempt.
 -- The locked job/lease ledger, not that summary, determines active ownership.
 -- Never overwrite terminal outcomes or an independent approval wait.
 if v_run.status not in ('queued','planning','running') then
  raise exception 'Execution run is not eligible for cancellation' using errcode='40001';
 end if;
 v_now := greatest(clock_timestamp(),v_job.updated_at + interval '1 microsecond',v_run.updated_at + interval '1 microsecond');
 update public.jd_execution_jobs set status='cancelled',completed_at=v_now,updated_at=v_now
 where id=v_job.id;
 update public.jd_automation_runs set status='cancelled',completed_at=v_now,updated_at=v_now
 where id=v_run.id;
 insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
 values(v_school,p_actor_id,v_run.id,'execution.cancelled',jsonb_build_object(
  'job_id',v_job.id,'previous_job_status',v_job.status,'previous_run_status',v_run.status,
  'previous_updated_at',v_job.updated_at,'updated_at',v_now,
  'external_effects_reversed',false,'contract','atomic_cancel_v1')) returning id into v_audit;
 return jsonb_build_object(
  'job',jsonb_build_object('id',v_job.id,'run_id',v_run.id,'status','cancelled','updated_at',v_now),
  'run',jsonb_build_object('id',v_run.id,'status','cancelled'),
  'auditRecorded',true,'auditId',v_audit,'externalEffectsReversed',false
 );
end;
$$;
revoke all on function public.jd_cancel_execution_job_checked(uuid,uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.jd_cancel_execution_job_checked(uuid,uuid,uuid,timestamptz) to service_role;
