-- Attribute bounded specialist assignment history to activated workforce identities.
alter table public.jd_workforce_assignments
  add column employee_id uuid references public.jd_workforce_employees(id),
  add column team_id uuid references public.jd_workforce_teams(id),
  add constraint jd_workforce_assignment_team_requires_employee
    check (team_id is null or employee_id is not null);

create index jd_workforce_assignments_employee_recent
  on public.jd_workforce_assignments(school_id,employee_id,created_at desc)
  where employee_id is not null;
create index jd_workforce_assignments_team_recent
  on public.jd_workforce_assignments(school_id,team_id,created_at desc)
  where team_id is not null;

create or replace function public.jd_read_workforce_assignments(p_actor uuid,p_limit int default 20)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare tenant uuid;v_limit int;
begin
  tenant:=public.jd_agent_registry_tenant(p_actor);
  v_limit:=least(greatest(coalesce(p_limit,20),1),100);
  return coalesce((select jsonb_agg(x) from (
    select id,run_id,objective,agent_kind,agent_ref,agent_name,agent_version,employee_id,team_id,
           content_hash,task_hash,skill_name,skill_version,skill_content_hash,task,
           tool_allowlist,budget,status,outcome,tool_evidence,verification_status,created_at
    from public.jd_workforce_assignments
    where school_id=tenant
    order by created_at desc,id
    limit v_limit
  ) x),'[]');
end;
$function$;
