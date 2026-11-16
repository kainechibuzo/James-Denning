-- Reviewed release order: isolated staging -> this migration -> jd-automation -> frontend.
-- Do not apply to production as a test. No data backfill or role widening.
create or replace function public.jd_assign_operational_task(
  p_actor_id uuid,
  p_task_id uuid,
  p_assignee_id uuid,
  p_expected_assignee_id uuid,
  p_expected_updated_at timestamptz
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_school uuid;
  v_task public.jd_operational_tasks%rowtype;
  v_previous_assignee uuid;
  v_previous_updated_at timestamptz;
  v_audit_id uuid;
begin
  -- Lock the profile while its authority is used; caller identity is supplied
  -- only by the authenticated service endpoint, never a public RPC caller.
  select school_id into v_school from public.profiles
    where id=p_actor_id and role in ('owner','admin','manager') for share;
  if v_school is null then
    raise exception 'Manager permission required' using errcode='42501';
  end if;
  if p_task_id is null or p_assignee_id is null or p_expected_updated_at is null then
    raise exception 'Task, assignee and expected version are required' using errcode='22023';
  end if;
  select * into v_task from public.jd_operational_tasks
    where id=p_task_id and school_id=v_school for update;
  if not found then
    raise exception 'Operational task not found' using errcode='P0002';
  end if;
  if v_task.assigned_to is distinct from p_expected_assignee_id
     or v_task.updated_at is distinct from p_expected_updated_at then
    raise exception 'Task changed; refresh before assigning' using errcode='40001';
  end if;
  perform id from public.profiles
    where id=p_assignee_id and school_id=v_school
      and role in ('owner','admin','manager','staff','finance','hr','contractor') for share;
  if not found then
    raise exception 'Assignee is not eligible in this workspace' using errcode='42501';
  end if;
  v_previous_assignee := v_task.assigned_to;
  v_previous_updated_at := v_task.updated_at;
  -- Advance the version even for an explicit same-assignee confirmation:
  -- a lost-response replay cannot insert a duplicate audit with the old version.
  update public.jd_operational_tasks
    set assigned_to=p_assignee_id,
        updated_at=greatest(clock_timestamp(),v_previous_updated_at + interval '1 microsecond')
    where id=v_task.id and school_id=v_school returning * into v_task;
  insert into public.jd_audit_events(school_id,actor_id,event_type,event_json)
    values(v_school,p_actor_id,'operational_task.assigned',jsonb_build_object(
      'task_id',v_task.id,'from_assignee_id',v_previous_assignee,'to_assignee_id',v_task.assigned_to,
      'previous_updated_at',v_previous_updated_at,'updated_at',v_task.updated_at,
      'changed',v_previous_assignee is distinct from v_task.assigned_to))
    returning id into v_audit_id;
  return jsonb_build_object('task',to_jsonb(v_task),
    'changed',v_previous_assignee is distinct from v_task.assigned_to,
    'auditRecorded',true,'auditId',v_audit_id);
end;
$$;
revoke all on function public.jd_assign_operational_task(uuid,uuid,uuid,uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.jd_assign_operational_task(uuid,uuid,uuid,uuid,timestamptz) to service_role;
