-- Release only a specifically approved, tenant-scoped generic request to the durable worker.
create or replace function public.jd_release_approved_execution(p_approval_id uuid,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 v_school_id uuid; v_approval public.jd_approvals%rowtype; v_run public.jd_automation_runs%rowtype;
 v_job jsonb; v_job_id uuid;
begin
 select school_id into v_school_id from public.profiles where id=p_actor_id and role in ('owner','admin');
 if v_school_id is null then raise exception 'Workspace administrator required' using errcode='42501'; end if;
 select * into v_approval from public.jd_approvals where id=p_approval_id and school_id=v_school_id for update;
 if not found then raise exception 'Approval request not found' using errcode='P0002'; end if;
 if v_approval.status <> 'approved' then raise exception 'Approval must be approved before execution release' using errcode='42501'; end if;
 if v_approval.action_key <> 'unclassified_request' then raise exception 'Only an explicitly approved generic request can be released here' using errcode='22023'; end if;
 if v_approval.execution_status in ('queued','running','completed') then
  return jsonb_build_object('approval_id',v_approval.id,'execution_status',v_approval.execution_status,'job_id',v_approval.execution_result_json->>'job_id','duplicate',true);
 end if;
 if v_approval.execution_status <> 'not_executed' then raise exception 'Approval execution requires manual reconciliation' using errcode='40001'; end if;
 select * into v_run from public.jd_automation_runs where id=v_approval.run_id and school_id=v_school_id for update;
 if not found or v_run.requested_by <> v_approval.requested_by then raise exception 'Approved run does not match its requester and workspace' using errcode='42501'; end if;
 if v_run.status <> 'awaiting_approval' then raise exception 'Run is not awaiting this approval' using errcode='40001'; end if;
 update public.jd_automation_runs set status='planning',
  result_json=coalesce(result_json,'{}'::jsonb)||jsonb_build_object('approval_id',v_approval.id,'approval_released_by',p_actor_id),
  updated_at=clock_timestamp() where id=v_run.id and school_id=v_school_id;
 v_job := public.jd_enqueue_execution_job(v_run.id);
 v_job_id := nullif(v_job->>'job_id','')::uuid;
 if v_job_id is null or v_job->>'status' <> 'queued' then raise exception 'Durable execution job was not confirmed' using errcode='55000'; end if;
 update public.jd_approvals set execution_status='queued',
  execution_result_json=jsonb_build_object('job_id',v_job_id,'run_id',v_run.id,'released_by',p_actor_id,'release_status','queued'),
  updated_at=clock_timestamp() where id=v_approval.id and school_id=v_school_id;
 insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
 values(v_school_id,p_actor_id,v_run.id,'approval.execution_released',jsonb_build_object('approval_id',v_approval.id,'job_id',v_job_id,'status','queued'));
 return jsonb_build_object('approval_id',v_approval.id,'run_id',v_run.id,'job_id',v_job_id,'execution_status','queued','duplicate',false);
end;
$$;
revoke all on function public.jd_release_approved_execution(uuid,uuid) from public,anon,authenticated;
grant execute on function public.jd_release_approved_execution(uuid,uuid) to service_role;
