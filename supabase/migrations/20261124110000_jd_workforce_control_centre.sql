-- Candidate schema only. Review and rehearse in isolated test DB before any release.
-- Durable workforce identities are separate from specialist definitions and assignment evidence.
create table public.jd_workforce_employees (
 id uuid primary key default gen_random_uuid(),
 school_id uuid not null references public.schools(id),
 agent_kind text not null check(agent_kind in ('builtin','registry')),
 agent_ref text not null,
 agent_version integer,
 display_name text not null check(length(btrim(display_name)) between 2 and 120),
 department text,
 lifecycle_state text not null default 'active' check(lifecycle_state in ('active','paused','retired')),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 retired_at timestamptz,
 unique(school_id,agent_kind,agent_ref,agent_version)
);
create index jd_workforce_employees_tenant_state on public.jd_workforce_employees(school_id,lifecycle_state,created_at desc);

create table public.jd_workforce_teams (
 id uuid primary key default gen_random_uuid(),
 school_id uuid not null references public.schools(id),
 name text not null check(length(btrim(name)) between 2 and 120),
 purpose text not null check(length(btrim(purpose)) between 10 and 1000),
 lifecycle_state text not null default 'active' check(lifecycle_state in ('active','paused','retired')),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 retired_at timestamptz
);
create unique index jd_workforce_teams_tenant_name_active on public.jd_workforce_teams(school_id,lower(name)) where retired_at is null;

create table public.jd_workforce_team_members (
 school_id uuid not null references public.schools(id),
 team_id uuid not null references public.jd_workforce_teams(id),
 employee_id uuid not null references public.jd_workforce_employees(id),
 member_role text not null default 'member' check(member_role in ('lead','member')),
 joined_at timestamptz not null default clock_timestamp(),
 left_at timestamptz,
 primary key(team_id,employee_id)
);
create index jd_workforce_team_members_tenant on public.jd_workforce_team_members(school_id,team_id) where left_at is null;

create table public.jd_workforce_agent_threads (
 id uuid primary key default gen_random_uuid(),
 school_id uuid not null references public.schools(id),
 employee_id uuid not null references public.jd_workforce_employees(id),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 unique(school_id,employee_id,created_by)
);
create table public.jd_workforce_agent_messages (
 id uuid primary key default gen_random_uuid(),
 school_id uuid not null references public.schools(id),
 thread_id uuid not null references public.jd_workforce_agent_threads(id),
 sender_id uuid not null references auth.users(id),
 sender_kind text not null check(sender_kind in ('user','agent')),
 content text not null check(length(btrim(content)) between 1 and 12000),
 created_at timestamptz not null default clock_timestamp()
);
create index jd_workforce_agent_messages_thread on public.jd_workforce_agent_messages(school_id,thread_id,created_at);

-- Append-only command/audit history. A request is idempotent within its tenant.
create table public.jd_workforce_control_events (
 id uuid primary key default gen_random_uuid(),
 school_id uuid not null references public.schools(id),
 actor_id uuid not null references auth.users(id),
 request_id uuid not null,
 target_kind text not null check(target_kind in ('employee','team')),
 target_id uuid not null,
 action text not null check(action in ('employee.pause','employee.resume','employee.retire','team.pause','team.resume','team.retire')),
 previous_state text not null,
 resulting_state text not null,
 created_at timestamptz not null default clock_timestamp(),
 unique(school_id,request_id)
);

alter table public.jd_workforce_employees enable row level security;
alter table public.jd_workforce_teams enable row level security;
alter table public.jd_workforce_team_members enable row level security;
alter table public.jd_workforce_agent_threads enable row level security;
alter table public.jd_workforce_agent_messages enable row level security;
alter table public.jd_workforce_control_events enable row level security;
revoke all on public.jd_workforce_employees,public.jd_workforce_teams,public.jd_workforce_team_members,public.jd_workforce_agent_threads,public.jd_workforce_agent_messages,public.jd_workforce_control_events from anon,authenticated;
grant select,insert,update on public.jd_workforce_employees,public.jd_workforce_teams,public.jd_workforce_team_members,public.jd_workforce_agent_threads,public.jd_workforce_agent_messages to service_role;
grant select,insert on public.jd_workforce_control_events to service_role;

create function public.jd_workforce_forbid_event_mutation() returns trigger language plpgsql as $$
begin raise exception 'Workforce control events are append-only' using errcode='55000'; end; $$;
create trigger jd_workforce_control_events_immutable before update or delete on public.jd_workforce_control_events for each row execute function public.jd_workforce_forbid_event_mutation();

create function public.jd_workforce_control(p_actor uuid,p_request uuid,p_target_kind text,p_target uuid,p_action text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_school uuid; v_state text; v_next text; v_event public.jd_workforce_control_events%rowtype;
begin
 select school_id into v_school from public.profiles where id=p_actor and role in ('owner','admin') for share;
 if v_school is null then raise exception 'Workspace administrator required' using errcode='42501'; end if;
 if p_request is null or p_target is null or p_target_kind not in ('employee','team') then raise exception 'Invalid control request' using errcode='22023'; end if;
 select * into v_event from public.jd_workforce_control_events where school_id=v_school and request_id=p_request;
 if found then
  if v_event.target_kind<>p_target_kind or v_event.target_id<>p_target or v_event.action<>p_action then raise exception 'Request identifier reused' using errcode='40001'; end if;
  return jsonb_build_object('event_id',v_event.id,'state',v_event.resulting_state,'replayed',true);
 end if;
 if p_target_kind='employee' then
  select lifecycle_state into v_state from public.jd_workforce_employees where id=p_target and school_id=v_school for update;
 else
  select lifecycle_state into v_state from public.jd_workforce_teams where id=p_target and school_id=v_school for update;
 end if;
 if v_state is null then raise exception 'Workforce target not found' using errcode='P0002'; end if;
 v_next:=case p_action
  when 'employee.pause' then 'paused' when 'employee.resume' then 'active' when 'employee.retire' then 'retired'
  when 'team.pause' then 'paused' when 'team.resume' then 'active' when 'team.retire' then 'retired' else null end;
 if v_next is null or split_part(p_action,'.',1)<>p_target_kind then raise exception 'Unsupported control action' using errcode='22023'; end if;
 if v_state='retired' or (p_action like '%.resume' and v_state<>'paused') or (p_action like '%.pause' and v_state<>'active') or (p_action like '%.retire' and v_state='retired') then
  raise exception 'Workforce target state changed; refresh before retrying' using errcode='40001';
 end if;
 if p_target_kind='employee' then
  update public.jd_workforce_employees set lifecycle_state=v_next,updated_at=clock_timestamp(),retired_at=case when v_next='retired' then clock_timestamp() else null end where id=p_target and school_id=v_school;
 else
  update public.jd_workforce_teams set lifecycle_state=v_next,updated_at=clock_timestamp(),retired_at=case when v_next='retired' then clock_timestamp() else null end where id=p_target and school_id=v_school;
 end if;
 insert into public.jd_workforce_control_events(school_id,actor_id,request_id,target_kind,target_id,action,previous_state,resulting_state)
 values(v_school,p_actor,p_request,p_target_kind,p_target,p_action,v_state,v_next) returning * into v_event;
 insert into public.jd_audit_events(school_id,actor_id,event_type,event_json)
 values(v_school,p_actor,'workforce.'||p_action,jsonb_build_object('target_kind',p_target_kind,'target_id',p_target,'request_id',p_request,'previous_state',v_state,'resulting_state',v_next));
 return jsonb_build_object('event_id',v_event.id,'state',v_next,'replayed',false);
end; $$;
revoke all on function public.jd_workforce_control(uuid,uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.jd_workforce_control(uuid,uuid,text,uuid,text) to service_role;
