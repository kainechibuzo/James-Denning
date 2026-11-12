-- JD Batch 01: tenant-scoped organisation blueprints, operational tasks and hiring pipeline.
-- These tables are deliberately isolated from legacy hiring tables until reconciliation is complete.

create table if not exists public.jd_organisation_blueprints (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  title text not null check (length(trim(title)) between 1 and 160),
  industry text not null check (length(trim(industry)) between 1 and 80),
  business_description text not null check (length(trim(business_description)) between 1 and 4000),
  status text not null default 'draft' check (status in ('draft','in_review','approved','provisioned','rejected')),
  blueprint_json jsonb not null check (jsonb_typeof(blueprint_json)='object'),
  blueprint_hash text not null check (blueprint_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists jd_org_blueprints_school_created_idx on public.jd_organisation_blueprints(school_id,created_at desc);

create table if not exists public.jd_operational_tasks (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  assigned_to uuid references auth.users(id) on delete set null,
  title text not null check (length(trim(title)) between 1 and 180),
  description text not null default '' check (length(description) <= 5000),
  department text,
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'queued' check (status in ('queued','in_progress','blocked','completed','cancelled')),
  idempotency_key text not null check (length(idempotency_key) between 8 and 160),
  due_at timestamptz,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id,idempotency_key)
);
create index if not exists jd_operational_tasks_school_status_idx on public.jd_operational_tasks(school_id,status,priority,created_at desc);
create index if not exists jd_operational_tasks_assignee_idx on public.jd_operational_tasks(school_id,assigned_to,status);

create table if not exists public.jd_hiring_requisitions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  title text not null check (length(trim(title)) between 1 and 160),
  department text not null check (length(trim(department)) between 1 and 120),
  description text not null check (length(trim(description)) between 1 and 8000),
  requirements jsonb not null default '[]'::jsonb check (jsonb_typeof(requirements)='array'),
  status text not null default 'draft' check (status in ('draft','pending_approval','open','paused','closed','cancelled')),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists jd_hiring_requisitions_school_status_idx on public.jd_hiring_requisitions(school_id,status,created_at desc);

create table if not exists public.jd_hiring_candidates (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  requisition_id uuid not null references public.jd_hiring_requisitions(id) on delete cascade,
  full_name text not null check (length(trim(full_name)) between 1 and 160),
  contact_email text,
  stage text not null default 'applied' check (stage in ('applied','screening','interview','assessment','offer','hired','rejected','withdrawn')),
  notes text not null default '' check (length(notes) <= 5000),
  stage_updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists jd_hiring_candidates_requisition_stage_idx on public.jd_hiring_candidates(school_id,requisition_id,stage,created_at desc);

alter table public.jd_organisation_blueprints enable row level security;
alter table public.jd_operational_tasks enable row level security;
alter table public.jd_hiring_requisitions enable row level security;
alter table public.jd_hiring_candidates enable row level security;

-- No direct browser writes. Reads are also mediated through authenticated JD endpoints
-- until tenant/role-specific UI policies have been reviewed.
revoke all on public.jd_organisation_blueprints from anon, authenticated;
revoke all on public.jd_operational_tasks from anon, authenticated;
revoke all on public.jd_hiring_requisitions from anon, authenticated;
revoke all on public.jd_hiring_candidates from anon, authenticated;
grant select,insert,update,delete on public.jd_organisation_blueprints to service_role;
grant select,insert,update,delete on public.jd_operational_tasks to service_role;
grant select,insert,update,delete on public.jd_hiring_requisitions to service_role;
grant select,insert,update,delete on public.jd_hiring_candidates to service_role;

create or replace function public.jd_create_organisation_blueprint(
  p_actor_id uuid, p_title text, p_industry text, p_description text, p_blueprint jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_school uuid; v_id uuid; v_hash text;
begin
  select school_id into v_school from public.profiles where id=p_actor_id and role='admin';
  if v_school is null then raise exception 'Workspace administrator required' using errcode='42501'; end if;
  if length(trim(coalesce(p_title,''))) not between 1 and 160
     or length(trim(coalesce(p_industry,''))) not between 1 and 80
     or length(trim(coalesce(p_description,''))) not between 1 and 4000
     or jsonb_typeof(p_blueprint)<>'object' then
    raise exception 'Invalid organisation blueprint' using errcode='22023';
  end if;
  v_hash := encode(digest(convert_to(p_blueprint::text,'UTF8'),'sha256'),'hex');
  insert into public.jd_organisation_blueprints(school_id,created_by,title,industry,business_description,blueprint_json,blueprint_hash)
  values(v_school,p_actor_id,trim(p_title),trim(p_industry),trim(p_description),p_blueprint,v_hash)
  returning id into v_id;
  return jsonb_build_object('id',v_id,'school_id',v_school,'status','draft','blueprint_hash',v_hash);
end; $$;
revoke all on function public.jd_create_organisation_blueprint(uuid,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.jd_create_organisation_blueprint(uuid,text,text,text,jsonb) to service_role;
