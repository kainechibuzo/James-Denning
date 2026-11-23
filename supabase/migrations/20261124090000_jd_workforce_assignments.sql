-- Workforce activation contract (roadmap sequence 1–2, docs/ROADMAP_2026-11-23.md):
-- every specialist assignment must persist an immutable record of the selected
-- agent/version, skill version, task scope, tool allowlist, budget, status and
-- outcome, so a deployment is provable from stored records instead of only a
-- conversational reply. Records are append-only: verification is proven by
-- later records and audit events, never by mutating history.

create table public.jd_workforce_assignments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  run_id uuid references public.jd_automation_runs(id),
  objective text not null,
  agent_kind text not null check (agent_kind in ('builtin','registry')),
  agent_ref text not null,
  agent_name text not null,
  agent_version int,
  content_hash text,
  skill_name text,
  skill_version text,
  skill_content_hash text,
  task text not null,
  task_hash text not null,
  tool_allowlist jsonb not null default '[]'::jsonb,
  budget jsonb not null default '{}'::jsonb,
  status text not null check (status in ('report_returned','failed')),
  outcome jsonb not null default '{}'::jsonb,
  tool_evidence jsonb not null default '[]'::jsonb,
  verification_status text not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (school_id, run_id, agent_kind, agent_ref, task_hash)
);

alter table public.jd_workforce_assignments enable row level security;

revoke all on public.jd_workforce_assignments from anon, authenticated;
grant select, insert on public.jd_workforce_assignments to service_role;

-- Append-only: no update or delete path exists for assignment records.
create function public.jd_forbid_workforce_assignment_mutation() returns trigger language plpgsql as $$
begin
  raise exception 'Workforce assignment records are immutable' using errcode='55000';
end; $$;

create trigger jd_workforce_assignments_immutable
  before update or delete on public.jd_workforce_assignments
  for each row execute function public.jd_forbid_workforce_assignment_mutation();

create index jd_workforce_assignments_tenant_recent
  on public.jd_workforce_assignments (school_id, created_at desc);

-- Owner/admin read-back of recent assignment records for their tenant. The
-- registry tenant helper enforces the administrator boundary (42501 for
-- staff/outside actors) exactly as the agent registry does.
create or replace function public.jd_read_workforce_assignments(p_actor uuid,p_limit int default 20) returns jsonb
language plpgsql security definer set search_path='' as $$
declare tenant uuid;v_limit int;begin
  tenant:=public.jd_agent_registry_tenant(p_actor);
  v_limit:=least(greatest(coalesce(p_limit,20),1),100);
  return coalesce((select jsonb_agg(x) from (
    select id,run_id,objective,agent_kind,agent_ref,agent_name,agent_version,content_hash,task_hash,
           skill_name,skill_version,skill_content_hash,task,tool_allowlist,budget,status,outcome,
           tool_evidence,verification_status,created_at
    from public.jd_workforce_assignments
    where school_id=tenant
    order by created_at desc,id
    limit v_limit
  ) x),'[]');
end; $$;
