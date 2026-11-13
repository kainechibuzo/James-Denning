-- JD operational task transitions and their audit events must commit atomically.
create or replace function public.jd_transition_operational_task(
  p_actor_id uuid,
  p_task_id uuid,
  p_expected_status text,
  p_next_status text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_school uuid;
  v_task public.jd_operational_tasks%rowtype;
  v_audit_id uuid;
begin
  select school_id into v_school
  from public.profiles
  where id=p_actor_id and role in ('admin','manager');

  if v_school is null then
    raise exception 'Manager permission required' using errcode='42501';
  end if;

  select * into v_task
  from public.jd_operational_tasks
  where id=p_task_id and school_id=v_school
  for update;

  if not found then
    raise exception 'Operational task not found' using errcode='P0002';
  end if;

  if v_task.status is distinct from p_expected_status then
    raise exception 'Task changed concurrently; reload before retrying' using errcode='40001';
  end if;

  if not (
    (v_task.status='queued' and p_next_status in ('in_progress','cancelled'))
    or (v_task.status='in_progress' and p_next_status in ('blocked','completed','cancelled'))
    or (v_task.status='blocked' and p_next_status in ('queued','in_progress','cancelled'))
  ) then
    raise exception 'Invalid operational task transition' using errcode='22023';
  end if;

  update public.jd_operational_tasks
  set status=p_next_status,
      completed_at=case when p_next_status='completed' then now() else completed_at end,
      updated_at=now()
  where id=v_task.id and school_id=v_school
  returning * into v_task;

  insert into public.jd_audit_events(school_id,actor_id,event_type,event_json)
  values(
    v_school,p_actor_id,'operational_task.status_changed',
    jsonb_build_object(
      'task_id',v_task.id,
      'from_status',p_expected_status,
      'to_status',p_next_status
    )
  )
  returning id into v_audit_id;

  return jsonb_build_object(
    'task',jsonb_build_object(
      'id',v_task.id,
      'status',v_task.status,
      'completed_at',v_task.completed_at,
      'updated_at',v_task.updated_at
    ),
    'auditRecorded',true,
    'auditId',v_audit_id
  );
end;
$$;

revoke all on function public.jd_transition_operational_task(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.jd_transition_operational_task(uuid,uuid,text,text) to service_role;
