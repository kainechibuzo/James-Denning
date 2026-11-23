drop trigger if exists jd_workforce_team_usage_budget_after_insert on public.jd_workforce_employee_usage;
drop function if exists public.jd_workforce_apply_team_usage_budget();
drop function if exists public.jd_workforce_set_team_budget(uuid,uuid,uuid,integer,bigint);
drop table if exists public.jd_workforce_team_budget_requests;
drop table if exists public.jd_workforce_team_budgets;
