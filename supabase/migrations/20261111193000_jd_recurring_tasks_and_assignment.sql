-- JD-B02-04/05: recurring operational tasks and explicit department assignment pools.
-- Schedule dispatch is a task-creation operation only; it never runs workflow nodes.

create table if not exists public.jd_task_schedules (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  title text not null check (length(trim(title)) between 1 and 180),
  description text not null default '' check (length(description) <= 5000),
  department text not null check (length(trim(department)) between 1 and 120),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  frequency text not null check (frequency in ('daily','weekly')),
  local_time time not null,
  timezone text not null check (length(timezone) between 1 and 80),
  weekdays smallint[] not null default array[1,2,3,4,5]::smallint[],
  next_run_at timestamptz not null,
  assigned_to uuid references auth.users(id) on delete set null,
  auto_assign boolean not null default false,
  active boolean not null default true,
  last_run_at timestamptz,
  last_task_id uuid references public.jd_operational_tasks(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (weekdays <@ array[1,2,3,4,5,6,7]::smallint[]),
  check (frequency <> 'weekly' or cardinality(weekdays) > 0)
);
create index if not exists jd_task_schedules_due_idx
  on public.jd_task_schedules(next_run_at) where active = true;
create index if not exists jd_task_schedules_school_idx
  on public.jd_task_schedules(school_id,active,next_run_at);

create table if not exists public.jd_task_assignment_members (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  department text not null check (length(trim(department)) between 1 and 120),
  max_open_tasks integer not null default 10 check (max_open_tasks between 1 and 500),
  active boolean not null default true,
  last_assigned_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id,profile_id,department)
);
create index if not exists jd_task_assignment_members_pool_idx
  on public.jd_task_assignment_members(school_id,department,active,last_assigned_at);

alter table public.jd_task_schedules enable row level security;
alter table public.jd_task_assignment_members enable row level security;
revoke all on public.jd_task_schedules from anon,authenticated;
revoke all on public.jd_task_assignment_members from anon,authenticated;
grant select,insert,update,delete on public.jd_task_schedules to service_role;
grant select,insert,update,delete on public.jd_task_assignment_members to service_role;

create or replace function public.jd_set_task_assignment_member(
  p_actor_id uuid,p_profile_id uuid,p_department text,p_max_open_tasks integer,p_active boolean
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_school uuid; v_target_school uuid; v_role text; v_row public.jd_task_assignment_members%rowtype;
begin
  select school_id into v_school from public.profiles
  where id=p_actor_id and role in ('admin','manager');
  if v_school is null then raise exception 'Manager permission required' using errcode='42501'; end if;
  if length(trim(coalesce(p_department,''))) not between 1 and 120
     or p_max_open_tasks not between 1 and 500 then
    raise exception 'Invalid assignment pool configuration' using errcode='22023';
  end if;
  select school_id,role into v_target_school,v_role from public.profiles where id=p_profile_id;
  if v_target_school is distinct from v_school or v_role not in ('admin','manager','teacher','bursar') then
    raise exception 'Assignment member must be an eligible profile in this workspace' using errcode='42501';
  end if;
  insert into public.jd_task_assignment_members(school_id,profile_id,department,max_open_tasks,active,created_by)
  values(v_school,p_profile_id,trim(p_department),p_max_open_tasks,coalesce(p_active,true),p_actor_id)
  on conflict(school_id,profile_id,department) do update
    set max_open_tasks=excluded.max_open_tasks,active=excluded.active,updated_at=now()
  returning * into v_row;
  insert into public.jd_audit_events(school_id,actor_id,event_type,event_json)
  values(v_school,p_actor_id,'task.assignment_pool.updated',
    jsonb_build_object('profile_id',p_profile_id,'department',trim(p_department),'active',v_row.active,'max_open_tasks',v_row.max_open_tasks));
  return jsonb_build_object('id',v_row.id,'profile_id',v_row.profile_id,'department',v_row.department,'active',v_row.active,'max_open_tasks',v_row.max_open_tasks);
end;
$$;
revoke all on function public.jd_set_task_assignment_member(uuid,uuid,text,integer,boolean) from public,anon,authenticated;
grant execute on function public.jd_set_task_assignment_member(uuid,uuid,text,integer,boolean) to service_role;

create or replace function public.jd_auto_assign_operational_task(p_actor_id uuid,p_task_id uuid)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_school uuid; v_task public.jd_operational_tasks%rowtype; v_assignee uuid; v_open integer;
begin
  select school_id into v_school from public.profiles where id=p_actor_id and role in ('admin','manager');
  if v_school is null then raise exception 'Manager permission required' using errcode='42501'; end if;
  select * into v_task from public.jd_operational_tasks
  where id=p_task_id and school_id=v_school for update;
  if not found then raise exception 'Operational task not found' using errcode='P0002'; end if;
  if v_task.status in ('completed','cancelled') then
    raise exception 'Terminal tasks cannot be auto-assigned' using errcode='22023';
  end if;
  if v_task.assigned_to is not null then
    return jsonb_build_object('assigned',true,'task_id',v_task.id,'assignee_id',v_task.assigned_to,'already_assigned',true);
  end if;
  select m.profile_id,count(t.id)::integer into v_assignee,v_open
  from public.jd_task_assignment_members m
  join public.profiles p on p.id=m.profile_id and p.school_id=m.school_id
  left join public.jd_operational_tasks t on t.school_id=m.school_id and t.assigned_to=m.profile_id
    and t.status in ('queued','in_progress','blocked')
  where m.school_id=v_school and lower(m.department)=lower(coalesce(v_task.department,''))
    and m.active=true and p.role in ('admin','manager','teacher','bursar')
  group by m.profile_id,m.max_open_tasks,m.last_assigned_at
  having count(t.id)<m.max_open_tasks
  order by count(t.id) asc,m.last_assigned_at asc nulls first,m.profile_id
  limit 1;
  if v_assignee is null then
    return jsonb_build_object('assigned',false,'reason','No active department member has available capacity');
  end if;
  update public.jd_operational_tasks set assigned_to=v_assignee,updated_at=now()
  where id=v_task.id and school_id=v_school;
  update public.jd_task_assignment_members set last_assigned_at=now(),updated_at=now()
  where school_id=v_school and profile_id=v_assignee and lower(department)=lower(coalesce(v_task.department,''));
  insert into public.jd_audit_events(school_id,actor_id,event_type,event_json)
  values(v_school,p_actor_id,'task.auto_assigned',jsonb_build_object('task_id',v_task.id,'assignee_id',v_assignee,'department',v_task.department));
  return jsonb_build_object('assigned',true,'task_id',v_task.id,'assignee_id',v_assignee);
end;
$$;
revoke all on function public.jd_auto_assign_operational_task(uuid,uuid) from public,anon,authenticated;
grant execute on function public.jd_auto_assign_operational_task(uuid,uuid) to service_role;

create or replace function public.jd_create_task_schedule(
  p_actor_id uuid,p_title text,p_description text,p_department text,p_priority text,
  p_frequency text,p_local_time time,p_timezone text,p_weekdays smallint[],
  p_next_run_at timestamptz,p_assigned_to uuid,p_auto_assign boolean
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_school uuid; v_id uuid; v_target_school uuid;
begin
  select school_id into v_school from public.profiles where id=p_actor_id and role in ('admin','manager');
  if v_school is null then raise exception 'Manager permission required' using errcode='42501'; end if;
  if length(trim(coalesce(p_title,''))) not between 1 and 180
     or length(coalesce(p_description,''))>5000
     or length(trim(coalesce(p_department,''))) not between 1 and 120
     or p_priority not in ('low','normal','high','urgent')
     or p_frequency not in ('daily','weekly')
     or p_local_time is null or p_next_run_at<=now()
     or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_timezone)
     or (p_frequency='weekly' and (coalesce(cardinality(p_weekdays),0)=0 or not (p_weekdays <@ array[1,2,3,4,5,6,7]::smallint[]))) then
    raise exception 'Invalid recurring task schedule' using errcode='22023';
  end if;
  if p_assigned_to is not null and coalesce(p_auto_assign,false) then
    raise exception 'Choose a fixed assignee or automatic assignment, not both' using errcode='22023';
  end if;
  if p_assigned_to is not null then
    select school_id into v_target_school from public.profiles where id=p_assigned_to and role in ('admin','manager','teacher','bursar');
    if v_target_school is distinct from v_school then raise exception 'Assignee must be an eligible member of this workspace' using errcode='42501'; end if;
  end if;
  insert into public.jd_task_schedules(school_id,created_by,title,description,department,priority,frequency,local_time,timezone,weekdays,next_run_at,assigned_to,auto_assign)
  values(v_school,p_actor_id,trim(p_title),coalesce(p_description,''),trim(p_department),p_priority,p_frequency,p_local_time,p_timezone,
    case when p_frequency='daily' then array[1,2,3,4,5,6,7]::smallint[] else p_weekdays end,
    p_next_run_at,p_assigned_to,coalesce(p_auto_assign,false))
  returning id into v_id;
  insert into public.jd_audit_events(school_id,actor_id,event_type,event_json)
  values(v_school,p_actor_id,'task.schedule.created',jsonb_build_object('schedule_id',v_id,'frequency',p_frequency,'timezone',p_timezone,'next_run_at',p_next_run_at));
  return jsonb_build_object('id',v_id,'active',true,'next_run_at',p_next_run_at);
end;
$$;
revoke all on function public.jd_create_task_schedule(uuid,text,text,text,text,text,time,text,smallint[],timestamptz,uuid,boolean) from public,anon,authenticated;
grant execute on function public.jd_create_task_schedule(uuid,text,text,text,text,text,time,text,smallint[],timestamptz,uuid,boolean) to service_role;

create or replace function public.jd_dispatch_task_schedule(
  p_schedule_id uuid,p_expected_run_at timestamptz,p_next_run_at timestamptz
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_schedule public.jd_task_schedules%rowtype; v_task_id uuid; v_key text; v_assignee uuid;
begin
  select * into v_schedule from public.jd_task_schedules
  where id=p_schedule_id and active=true for update;
  if not found then return jsonb_build_object('dispatched',false,'reason','inactive_or_missing'); end if;
  if v_schedule.next_run_at<>p_expected_run_at or v_schedule.next_run_at>now() then
    return jsonb_build_object('dispatched',false,'reason','already_processed_or_not_due');
  end if;
  if p_next_run_at<=p_expected_run_at then raise exception 'Next occurrence must be later than the due occurrence' using errcode='22023'; end if;
  v_assignee:=v_schedule.assigned_to;
  if v_assignee is null and v_schedule.auto_assign then
    select m.profile_id into v_assignee
    from public.jd_task_assignment_members m
    join public.profiles p on p.id=m.profile_id and p.school_id=m.school_id
    left join public.jd_operational_tasks t on t.school_id=m.school_id and t.assigned_to=m.profile_id and t.status in ('queued','in_progress','blocked')
    where m.school_id=v_schedule.school_id and lower(m.department)=lower(v_schedule.department) and m.active=true
      and p.role in ('admin','manager','teacher','bursar')
    group by m.profile_id,m.max_open_tasks,m.last_assigned_at
    having count(t.id)<m.max_open_tasks
    order by count(t.id) asc,m.last_assigned_at asc nulls first,m.profile_id
    limit 1;
    if v_assignee is not null then
      update public.jd_task_assignment_members set last_assigned_at=now(),updated_at=now()
      where school_id=v_schedule.school_id and profile_id=v_assignee and lower(department)=lower(v_schedule.department);
    end if;
  end if;
  v_key:='schedule:'||v_schedule.id::text||':'||floor(extract(epoch from p_expected_run_at))::bigint::text;
  insert into public.jd_operational_tasks(school_id,created_by,title,description,department,priority,assigned_to,idempotency_key,metadata)
  values(v_schedule.school_id,v_schedule.created_by,v_schedule.title,v_schedule.description,v_schedule.department,v_schedule.priority,
    v_assignee,v_key,jsonb_build_object('source','recurring_schedule','schedule_id',v_schedule.id,'scheduled_for',p_expected_run_at))
  on conflict(school_id,idempotency_key) do nothing
  returning id into v_task_id;
  if v_task_id is null then
    select id into v_task_id from public.jd_operational_tasks where school_id=v_schedule.school_id and idempotency_key=v_key;
  end if;
  update public.jd_task_schedules set next_run_at=p_next_run_at,last_run_at=p_expected_run_at,last_task_id=v_task_id,updated_at=now()
  where id=v_schedule.id;
  insert into public.jd_audit_events(school_id,actor_id,event_type,event_json)
  values(v_schedule.school_id,null,'task.schedule.dispatched',jsonb_build_object('schedule_id',v_schedule.id,'task_id',v_task_id,'scheduled_for',p_expected_run_at,'next_run_at',p_next_run_at));
  return jsonb_build_object('dispatched',true,'schedule_id',v_schedule.id,'task_id',v_task_id,'next_run_at',p_next_run_at);
end;
$$;
revoke all on function public.jd_dispatch_task_schedule(uuid,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.jd_dispatch_task_schedule(uuid,timestamptz,timestamptz) to service_role;

