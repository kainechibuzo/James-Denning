-- Create operational tasks and their audit evidence in one transaction.
-- Replays return the original task/audit evidence and never create duplicate audit rows.
create or replace function public.jd_create_operational_task(
  p_actor_id uuid,
  p_title text,
  p_description text,
  p_department text,
  p_due_at timestamptz,
  p_priority text,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_school uuid;
  v_task public.jd_operational_tasks%rowtype;
  v_audit_id uuid;
  v_reused boolean := false;
begin
  select school_id into v_school
  from public.profiles
  where id=p_actor_id and role in ('admin','manager');

  if v_school is null then
    raise exception 'Manager permission required' using errcode='42501';
  end if;

  if p_title is null or length(btrim(p_title))=0 or length(p_title)>180 then
    raise exception 'Task title is required and must be at most 180 characters' using errcode='22023';
  end if;
  if p_description is not null and length(p_description)>5000 then
    raise exception 'Task description must be at most 5000 characters' using errcode='22023';
  end if;
  if p_department is not null and length(p_department)>120 then
    raise exception 'Task department must be at most 120 characters' using errcode='22023';
  end if;
  if p_priority not in ('low','normal','high','urgent') then
    raise exception 'Invalid task priority' using errcode='22023';
  end if;
  if p_idempotency_key is null or length(btrim(p_idempotency_key))=0 or length(p_idempotency_key)>160 then
    raise exception 'A valid idempotency key is required' using errcode='22023';
  end if;

  insert into public.jd_operational_tasks(
    school_id,created_by,created_by_agent,title,description,department,due_at,priority,idempotency_key
  ) values (
    v_school,p_actor_id,true,btrim(p_title),coalesce(p_description,''),nullif(btrim(p_department),''),p_due_at,p_priority,p_idempotency_key
  )
  on conflict (school_id,idempotency_key) do nothing
  returning * into v_task;

  if not found then
    v_reused := true;
    select * into v_task
    from public.jd_operational_tasks
    where school_id=v_school and idempotency_key=p_idempotency_key
    for update;

    if not found then
      raise exception 'Task idempotency conflict; retry the request' using errcode='40001';
    end if;

    if v_task.title is distinct from btrim(p_title)
      or v_task.description is distinct from coalesce(p_description,'')
      or v_task.department is distinct from nullif(btrim(p_department),'')
      or v_task.due_at is distinct from p_due_at
      or v_task.priority is distinct from p_priority then
      raise exception 'Idempotency key was already used with different task details' using errcode='22023';
    end if;

    select id into v_audit_id
    from public.jd_audit_events
    where school_id=v_school
      and event_type='operational_task.created'
      and event_json->>'task_id'=v_task.id::text
    order by created_at
    limit 1;

    return jsonb_build_object(
      'task',to_jsonb(v_task),
      'reused',true,
      'auditRecorded',v_audit_id is not null,
      'auditId',v_audit_id
    );
  end if;

  insert into public.jd_audit_events(school_id,actor_id,event_type,event_json)
  values(
    v_school,p_actor_id,'operational_task.created',
    jsonb_build_object(
      'task_id',v_task.id,
      'title',v_task.title,
      'department',v_task.department,
      'priority',v_task.priority,
      'due_at',v_task.due_at,
      'status',v_task.status,
      'idempotency_key',p_idempotency_key
    )
  )
  returning id into v_audit_id;

  return jsonb_build_object(
    'task',to_jsonb(v_task),
    'reused',false,
    'auditRecorded',true,
    'auditId',v_audit_id
  );
end;
$$;

revoke all on function public.jd_create_operational_task(uuid,text,text,text,timestamptz,text,text) from public, anon, authenticated;
grant execute on function public.jd_create_operational_task(uuid,text,text,text,timestamptz,text,text) to service_role;
