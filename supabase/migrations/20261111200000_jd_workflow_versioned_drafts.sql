-- JD-B02-02: immutable workflow versions with exact-version Review Centre approval.
create extension if not exists pgcrypto;

create table if not exists public.jd_workflows (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  title text not null check (length(trim(title)) between 1 and 120),
  description text not null default '' check (length(description) <= 2000),
  latest_version_no integer not null default 0 check (latest_version_no >= 0),
  active_version_id uuid,
  status text not null default 'draft' check (status in ('draft','active','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.jd_workflow_versions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  workflow_id uuid not null references public.jd_workflows(id) on delete cascade,
  version_no integer not null check (version_no > 0),
  definition_json jsonb not null check (jsonb_typeof(definition_json) = 'object'),
  definition_hash text not null check (definition_hash ~ '^[a-f0-9]{64}$'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (workflow_id, version_no),
  unique (workflow_id, id),
  unique (school_id, workflow_id, version_no)
);

alter table public.jd_workflows
  add constraint jd_workflows_active_version_fk
  foreign key (id, active_version_id)
  references public.jd_workflow_versions(workflow_id, id)
  deferrable initially deferred;

create index if not exists jd_workflows_school_updated_idx
  on public.jd_workflows(school_id, updated_at desc);
create index if not exists jd_workflow_versions_school_workflow_idx
  on public.jd_workflow_versions(school_id, workflow_id, version_no desc);

alter table public.jd_workflows enable row level security;
alter table public.jd_workflow_versions enable row level security;
revoke all on public.jd_workflows, public.jd_workflow_versions from anon, authenticated;
grant select, insert, update, delete on public.jd_workflows to service_role;
revoke update, delete on public.jd_workflow_versions from service_role;
grant select, insert on public.jd_workflow_versions to service_role;

-- Version records are append-only. The service role uses the RPC below for inserts;
-- no browser role can mutate workflow records directly.
create or replace function public.jd_save_workflow_draft(
  p_actor_id uuid,
  p_workflow_id uuid,
  p_expected_version integer,
  p_definition jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school_id uuid;
  v_workflow public.jd_workflows%rowtype;
  v_version_id uuid;
  v_version_no integer;
  v_hash text;
  v_title text;
  v_description text;
  v_audit_id uuid;
begin
  select p.school_id into v_school_id
  from public.profiles p
  where p.id = p_actor_id and p.role in ('admin','manager');
  if v_school_id is null then
    raise exception 'Workflow manager permission required' using errcode = '42501';
  end if;
  if p_definition is null or jsonb_typeof(p_definition) <> 'object'
     or jsonb_typeof(p_definition->'nodes') <> 'array'
     or jsonb_typeof(p_definition->'edges') <> 'array'
     or length(trim(coalesce(p_definition->>'name',''))) not between 1 and 120
     or length(coalesce(p_definition->>'description','')) > 2000 then
    raise exception 'Invalid workflow definition' using errcode = '22023';
  end if;
  if jsonb_array_length(p_definition->'nodes') not between 2 and 100
     or jsonb_array_length(p_definition->'edges') > 200 then
    raise exception 'Workflow graph exceeds allowed bounds' using errcode = '22023';
  end if;
  v_title := trim(p_definition->>'name');
  v_description := coalesce(p_definition->>'description','');
  v_hash := encode(public.digest(convert_to(p_definition::text,'UTF8'),'sha256'),'hex');

  if p_workflow_id is null then
    if coalesce(p_expected_version,0) <> 0 then
      raise exception 'New workflow expected version must be zero' using errcode = '40001';
    end if;
    insert into public.jd_workflows(school_id,created_by,title,description)
    values(v_school_id,p_actor_id,v_title,v_description)
    returning * into v_workflow;
  else
    select * into v_workflow
    from public.jd_workflows
    where id = p_workflow_id and school_id = v_school_id
    for update;
    if not found then
      raise exception 'Workflow not found' using errcode = 'P0002';
    end if;
    if v_workflow.status = 'archived' then
      raise exception 'Archived workflows cannot be edited' using errcode = '22023';
    end if;
    if v_workflow.latest_version_no <> coalesce(p_expected_version,-1) then
      raise exception 'Workflow version changed; reload before saving' using errcode = '40001';
    end if;
    update public.jd_workflows
    set title = v_title, description = v_description, updated_at = now()
    where id = v_workflow.id
    returning * into v_workflow;
  end if;

  v_version_no := v_workflow.latest_version_no + 1;
  insert into public.jd_workflow_versions(
    school_id,workflow_id,version_no,definition_json,definition_hash,created_by
  ) values (
    v_school_id,v_workflow.id,v_version_no,p_definition,v_hash,p_actor_id
  ) returning id into v_version_id;

  update public.jd_workflows
  set latest_version_no = v_version_no, status = case when active_version_id is null then 'draft' else status end,
      updated_at = now()
  where id = v_workflow.id;

  insert into public.jd_audit_events(school_id,actor_id,event_type,event_json)
  values(v_school_id,p_actor_id,'workflow.draft.saved',
    jsonb_build_object('workflow_id',v_workflow.id,'version_id',v_version_id,
      'version_no',v_version_no,'definition_hash',v_hash));

  return jsonb_build_object('workflow_id',v_workflow.id,'version_id',v_version_id,
    'version_no',v_version_no,'definition_hash',v_hash,'status','draft');
end;
$$;

create or replace function public.jd_submit_workflow_review(
  p_actor_id uuid,
  p_workflow_id uuid,
  p_version_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school_id uuid;
  v_workflow public.jd_workflows%rowtype;
  v_version public.jd_workflow_versions%rowtype;
  v_run_id uuid;
  v_approval_id uuid;
  v_proposal jsonb;
  v_proposal_hash text;
begin
  select p.school_id into v_school_id
  from public.profiles p
  where p.id = p_actor_id and p.role in ('admin','manager');
  if v_school_id is null then
    raise exception 'Workflow manager permission required' using errcode = '42501';
  end if;

  select * into v_workflow from public.jd_workflows
  where id = p_workflow_id and school_id = v_school_id for update;
  if not found then raise exception 'Workflow not found' using errcode = 'P0002'; end if;
  select * into v_version from public.jd_workflow_versions
  where id = p_version_id and workflow_id = v_workflow.id and school_id = v_school_id;
  if not found then raise exception 'Workflow version not found' using errcode = 'P0002'; end if;
  if v_version.version_no <> v_workflow.latest_version_no then
    raise exception 'Only the latest workflow version can be submitted for review' using errcode = '40001';
  end if;
  if exists(select 1 from public.jd_approvals a
    where a.school_id = v_school_id and a.action_key = 'workflow.activate'
      and a.status = 'pending' and a.proposal_json->>'workflow_id' = v_workflow.id::text) then
    raise exception 'A workflow version is already awaiting review' using errcode = '23505';
  end if;

  v_proposal := jsonb_build_object(
    'workflow_id',v_workflow.id,'version_id',v_version.id,
    'version_no',v_version.version_no,'definition_hash',v_version.definition_hash,
    'definition',v_version.definition_json
  );
  v_proposal_hash := encode(public.digest(convert_to(v_proposal::text,'UTF8'),'sha256'),'hex');

  insert into public.jd_automation_runs(
    school_id,requested_by,trigger_type,status,autonomy_mode,scope,
    request_text,plan_json,idempotency_key
  ) values (
    v_school_id,p_actor_id,'manual','awaiting_approval','assisted','organisation',
    'workflow activation review: ' || v_workflow.title,
    jsonb_build_array(v_proposal),'workflow-review:' || v_workflow.id::text || ':' || v_version.id::text
  ) returning id into v_run_id;

  insert into public.jd_approvals(
    school_id,run_id,requested_by,status,reason,title,action_key,risk_level,
    proposal_json,audience_text,execution_status,proposal_hash
  ) values (
    v_school_id,v_run_id,p_actor_id,'pending',
    'Activating a workflow requires administrator review of the exact immutable version.',
    'Activate workflow: ' || v_workflow.title,'workflow.activate','high',
    v_proposal,'Review the exact workflow definition and version before activation.',
    'not_executed',v_proposal_hash
  ) returning id into v_approval_id;

  update public.jd_audit_events
  set event_json = event_json || jsonb_build_object('approval_id',v_approval_id)
  where id = (
    insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
    values(v_school_id,p_actor_id,v_run_id,'workflow.review.submitted',
      jsonb_build_object('workflow_id',v_workflow.id,'version_id',v_version.id,
        'version_no',v_version.version_no,'definition_hash',v_version.definition_hash))
    returning id
  );

  return jsonb_build_object('approval_id',v_approval_id,'run_id',v_run_id,
    'workflow_id',v_workflow.id,'version_id',v_version.id,
    'version_no',v_version.version_no,'definition_hash',v_version.definition_hash,
    'status','pending','execution_status','not_executed');
end;
$$;

create or replace function public.jd_activate_approved_workflow(
  p_actor_id uuid,
  p_approval_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school_id uuid;
  v_approval public.jd_approvals%rowtype;
  v_workflow public.jd_workflows%rowtype;
  v_version public.jd_workflow_versions%rowtype;
  v_expected_hash text;
begin
  select p.school_id into v_school_id
  from public.profiles p
  where p.id = p_actor_id and p.role = 'admin';
  if v_school_id is null then
    raise exception 'Only workspace administrators can activate workflows' using errcode = '42501';
  end if;

  select * into v_approval from public.jd_approvals
  where id = p_approval_id and school_id = v_school_id for update;
  if not found then raise exception 'Workflow approval not found' using errcode = 'P0002'; end if;
  if v_approval.action_key <> 'workflow.activate' or v_approval.status <> 'approved' then
    raise exception 'Workflow activation requires an approved workflow proposal' using errcode = '42501';
  end if;

  v_expected_hash := v_approval.proposal_json->>'definition_hash';
  select * into v_workflow from public.jd_workflows
  where id = (v_approval.proposal_json->>'workflow_id')::uuid
    and school_id = v_school_id for update;
  if not found then raise exception 'Workflow not found' using errcode = 'P0002'; end if;
  select * into v_version from public.jd_workflow_versions
  where id = (v_approval.proposal_json->>'version_id')::uuid
    and workflow_id = v_workflow.id and school_id = v_school_id;
  if not found then raise exception 'Workflow version not found' using errcode = 'P0002'; end if;
  if v_version.version_no <> v_workflow.latest_version_no
     or v_version.definition_hash <> v_expected_hash
     or v_approval.proposal_hash <> encode(public.digest(convert_to(v_approval.proposal_json::text,'UTF8'),'sha256'),'hex') then
    raise exception 'Approved workflow version is stale or has been altered' using errcode = '40001';
  end if;

  update public.jd_workflows
  set active_version_id = v_version.id,status = 'active',updated_at = now()
  where id = v_workflow.id and school_id = v_school_id;

  update public.jd_approvals
  set execution_status = 'completed',
      execution_result_json = jsonb_build_object('workflow_id',v_workflow.id,
        'version_id',v_version.id,'version_no',v_version.version_no,
        'definition_hash',v_version.definition_hash,'activated',true),
      updated_at = now()
  where id = v_approval.id;

  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
  values(v_school_id,p_actor_id,v_approval.run_id,'workflow.activated',
    jsonb_build_object('approval_id',v_approval.id,'workflow_id',v_workflow.id,
      'version_id',v_version.id,'version_no',v_version.version_no,
      'definition_hash',v_version.definition_hash));

  return jsonb_build_object('workflow_id',v_workflow.id,'version_id',v_version.id,
    'version_no',v_version.version_no,'status','active','execution_status','completed');
end;
$$;

revoke all on function public.jd_save_workflow_draft(uuid,uuid,integer,jsonb) from public,anon,authenticated;
revoke all on function public.jd_submit_workflow_review(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.jd_activate_approved_workflow(uuid,uuid) from public,anon,authenticated;
grant execute on function public.jd_save_workflow_draft(uuid,uuid,integer,jsonb) to service_role;
grant execute on function public.jd_submit_workflow_review(uuid,uuid,uuid) to service_role;
grant execute on function public.jd_activate_approved_workflow(uuid,uuid) to service_role;
