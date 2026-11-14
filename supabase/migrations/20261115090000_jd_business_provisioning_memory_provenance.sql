-- JD business organisation provisioning, shared memory and permanent AI provenance.
create table if not exists public.jd_departments (
 id uuid primary key default gen_random_uuid(),
 school_id uuid not null references public.schools(id) on delete cascade,
 name text not null check (length(trim(name)) between 1 and 120),
 purpose text not null default '',
 roles jsonb not null default '[]'::jsonb check (jsonb_typeof(roles)='array'),
 workflows jsonb not null default '[]'::jsonb check (jsonb_typeof(workflows)='array'),
 kpis jsonb not null default '[]'::jsonb check (jsonb_typeof(kpis)='array'),
 status text not null default 'active' check (status in ('active','archived')),
 created_by uuid references auth.users(id) on delete set null,
 created_by_agent boolean not null default false,
 created_via text not null default 'manual' check (created_via in ('manual','jd_approval')),
 source_approval_id uuid references public.jd_approvals(id) on delete set null,
 source_blueprint_id uuid references public.jd_organisation_blueprints(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (school_id,name)
);
create index if not exists jd_departments_school_status_idx on public.jd_departments(school_id,status,name);
alter table public.jd_departments enable row level security;
revoke all on public.jd_departments from anon,authenticated;
grant select,insert,update,delete on public.jd_departments to service_role;

create table if not exists public.jd_business_memory (
 id uuid primary key default gen_random_uuid(),
 school_id uuid not null references public.schools(id) on delete cascade,
 memory_key text not null check (length(trim(memory_key)) between 1 and 120),
 category text not null default 'business_context',
 content text not null check (length(trim(content)) between 1 and 4000),
 created_by uuid references auth.users(id) on delete set null,
 created_by_agent boolean not null default true,
 source_conversation_id uuid references public.jd_conversations(id) on delete set null,
 confidence text not null default 'confirmed' check (confidence in ('confirmed','assumption','preference')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (school_id,memory_key)
);
create index if not exists jd_business_memory_school_category_idx on public.jd_business_memory(school_id,category,updated_at desc);
alter table public.jd_business_memory enable row level security;
revoke all on public.jd_business_memory from anon,authenticated;
grant select,insert,update,delete on public.jd_business_memory to service_role;

alter table public.jd_organisation_blueprints add column if not exists created_by_agent boolean not null default false;
alter table public.jd_operational_tasks add column if not exists created_by_agent boolean not null default false;
alter table public.jd_hiring_requisitions add column if not exists created_by_agent boolean not null default false;
alter table public.jd_task_schedules add column if not exists created_by_agent boolean not null default false;
alter table public.jd_workflows add column if not exists created_by_agent boolean not null default false;

create or replace function public.jd_provision_approved_departments(p_approval_id uuid,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 v_school uuid; v_approval public.jd_approvals%rowtype; v_blueprint jsonb;
 v_blueprint_id uuid; v_count integer:=0; v_item jsonb; v_department_id uuid;
begin
 select school_id into v_school from public.profiles where id=p_actor_id and role in ('owner','admin');
 if v_school is null then raise exception 'Workspace administrator required' using errcode='42501'; end if;
 select * into v_approval from public.jd_approvals where id=p_approval_id and school_id=v_school for update;
 if not found then raise exception 'Approval request not found' using errcode='P0002'; end if;
 if v_approval.status<>'approved' then raise exception 'Approval must be accepted before provisioning' using errcode='42501'; end if;
 if v_approval.action_key<>'organisation.provision_departments' then raise exception 'This approval is not a department setup request' using errcode='22023'; end if;
 if v_approval.execution_status='completed' then
  return coalesce(v_approval.execution_result_json,'{}'::jsonb)||jsonb_build_object('already_completed',true);
 end if;
 v_blueprint:=v_approval.proposal_json->'blueprint';
 v_blueprint_id:=nullif(v_approval.proposal_json->>'blueprint_id','')::uuid;
 if jsonb_typeof(v_blueprint)<>'object' or jsonb_typeof(v_blueprint->'departments')<>'array' then
  raise exception 'The approved business plan is incomplete' using errcode='22023';
 end if;
 for v_item in select value from jsonb_array_elements(v_blueprint->'departments') loop
  insert into public.jd_departments(school_id,name,purpose,roles,workflows,kpis,created_by,created_by_agent,created_via,source_approval_id,source_blueprint_id)
  values(v_school,trim(v_item->>'name'),coalesce(v_item->>'purpose',''),coalesce(v_item->'roles','[]'::jsonb),coalesce(v_item->'workflows','[]'::jsonb),coalesce(v_item->'kpis','[]'::jsonb),v_approval.requested_by,true,'jd_approval',p_approval_id,v_blueprint_id)
  on conflict(school_id,name) do nothing
  returning id into v_department_id;
  if v_department_id is not null then v_count:=v_count+1; end if;
  v_department_id:=null;
 end loop;
 if v_blueprint_id is not null then
  update public.jd_organisation_blueprints set status='provisioned',created_by_agent=true,updated_at=now()
  where id=v_blueprint_id and school_id=v_school;
 end if;
 update public.jd_approvals set execution_status='completed',
  execution_result_json=jsonb_build_object('departments_created',v_count,'created_by_agent',true,'label','Created by JD'),
  updated_at=now()
 where id=p_approval_id and school_id=v_school;
 insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
 values(v_school,p_actor_id,v_approval.run_id,'organisation.departments.provisioned',
  jsonb_build_object('approval_id',p_approval_id,'blueprint_id',v_blueprint_id,'departments_created',v_count,'created_by_agent',true));
 return jsonb_build_object('departments_created',v_count,'created_by_agent',true,'label','Created by JD','status','completed');
end; $$;
revoke all on function public.jd_provision_approved_departments(uuid,uuid) from public,anon,authenticated;
grant execute on function public.jd_provision_approved_departments(uuid,uuid) to service_role;
