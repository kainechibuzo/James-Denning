-- JD Projects (business initiatives & software builds) and chat execution modes (ask / plan / execute).
-- Tenant isolation is enforced by profiles.school_id; all client writes go through authenticated Edge Functions.

create table if not exists public.jd_projects (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 140),
  description text not null default '' check (length(description) <= 4000),
  kind text not null default 'initiative' check (kind in ('initiative','software')),
  status text not null default 'active' check (status in ('active','published','archived')),
  pinned boolean not null default false,
  preview_config jsonb not null default '{}'::jsonb check (jsonb_typeof(preview_config) = 'object'),
  metadata_json jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata_json) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists jd_projects_school_status_updated_idx
  on public.jd_projects (school_id, status, pinned desc, updated_at desc);

create index if not exists jd_projects_school_creator_idx
  on public.jd_projects (school_id, created_by);

alter table public.jd_conversations
  add column if not exists project_id uuid references public.jd_projects(id) on delete set null;

create index if not exists jd_conversations_school_project_updated_idx
  on public.jd_conversations (school_id, project_id, updated_at desc)
  where project_id is not null;

alter table public.jd_operational_tasks
  add column if not exists project_id uuid references public.jd_projects(id) on delete set null;

create index if not exists jd_operational_tasks_school_project_idx
  on public.jd_operational_tasks (school_id, project_id, created_at desc)
  where project_id is not null;

alter table public.jd_projects enable row level security;

drop policy if exists jd_projects_select on public.jd_projects;
create policy jd_projects_select on public.jd_projects
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.school_id = jd_projects.school_id
        and (
          jd_projects.created_by = (select auth.uid())
          or p.role in ('owner','admin','manager')
        )
    )
  );

revoke insert, update, delete on public.jd_projects from authenticated;
grant select on public.jd_projects to authenticated;

create or replace function public.jd_set_chat_execution_mode(
  p_run_id uuid,
  p_actor_id uuid,
  p_mode text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.jd_automation_runs%rowtype;
  v_school_id uuid;
  v_existing text;
begin
  if p_mode not in ('ask','plan','execute') then
    raise exception 'Invalid execution mode' using errcode = '22023';
  end if;
  select school_id into v_school_id from public.profiles where id = p_actor_id;
  if v_school_id is null then
    raise exception 'Workspace profile required' using errcode = '42501';
  end if;
  select * into v_run
  from public.jd_automation_runs
  where id = p_run_id and school_id = v_school_id and requested_by = p_actor_id
  for update;
  if not found then
    raise exception 'Conversation run not found' using errcode = 'P0002';
  end if;
  v_existing := v_run.result_json->>'execution_mode';
  if v_existing is not null then
    if v_existing <> p_mode then
      raise exception 'Execution mode is already fixed for this request' using errcode = '40001';
    end if;
    return jsonb_build_object('run_id', p_run_id, 'execution_mode', p_mode, 'duplicate', true);
  end if;
  update public.jd_automation_runs
  set result_json = coalesce(result_json, '{}'::jsonb) || jsonb_build_object('execution_mode', p_mode),
      updated_at = clock_timestamp()
  where id = p_run_id and school_id = v_school_id and requested_by = p_actor_id;
  insert into public.jd_audit_events (school_id, actor_id, run_id, event_type, event_json)
  values (v_school_id, p_actor_id, p_run_id, 'conversation.execution_mode_set', jsonb_build_object('execution_mode', p_mode));
  return jsonb_build_object('run_id', p_run_id, 'execution_mode', p_mode, 'duplicate', false);
end;
$$;

revoke all on function public.jd_set_chat_execution_mode(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.jd_set_chat_execution_mode(uuid,uuid,text) to service_role;

create or replace function public.jd_link_conversation_project(
  p_conversation_id uuid,
  p_project_id uuid,
  p_actor_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school_id uuid;
  v_role text;
  v_conv public.jd_conversations%rowtype;
  v_proj public.jd_projects%rowtype;
begin
  select school_id, role into v_school_id, v_role from public.profiles where id = p_actor_id;
  if v_school_id is null then
    raise exception 'Workspace profile required' using errcode = '42501';
  end if;
  select * into v_conv from public.jd_conversations where id = p_conversation_id and school_id = v_school_id for update;
  if not found or (v_conv.created_by <> p_actor_id and v_role not in ('owner','admin')) then
    raise exception 'Conversation not found' using errcode = '42501';
  end if;
  select * into v_proj from public.jd_projects where id = p_project_id and school_id = v_school_id;
  if not found then
    raise exception 'Project not found' using errcode = 'P0002';
  end if;
  update public.jd_conversations
  set project_id = p_project_id, updated_at = clock_timestamp()
  where id = p_conversation_id and school_id = v_school_id;
  update public.jd_projects
  set updated_at = clock_timestamp()
  where id = p_project_id and school_id = v_school_id;
  return jsonb_build_object('conversation_id', p_conversation_id, 'project_id', p_project_id);
end;
$$;

revoke all on function public.jd_link_conversation_project(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.jd_link_conversation_project(uuid,uuid,uuid) to service_role;
