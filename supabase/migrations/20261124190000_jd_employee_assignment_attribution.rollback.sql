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

drop index if exists public.jd_workforce_assignments_employee_recent;
drop index if exists public.jd_workforce_assignments_team_recent;
alter table public.jd_workforce_assignments
  drop constraint if exists jd_workforce_assignment_team_requires_employee,
  drop constraint if exists jd_workforce_assignment_employee_tenant_fk,
  drop constraint if exists jd_workforce_assignment_team_tenant_fk,
  drop column if exists employee_id,
  drop column if exists team_id;
