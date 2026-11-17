-- Preserve all definition/evaluation/audit evidence. Empty-schema recovery only.
begin;
lock table public.jd_agent_definitions,public.jd_agent_definition_versions,public.jd_agent_evaluators,public.jd_agent_evaluations,public.jd_agent_evaluation_reports,public.jd_agent_registry_requests in access exclusive mode;
do $$begin
 if exists(select 1 from public.jd_agent_definitions) or exists(select 1 from public.jd_agent_evaluators) or exists(select 1 from public.jd_agent_evaluations) or exists(select 1 from public.jd_agent_registry_requests) then raise exception 'Registry contains retained records; preservation migration required';end if;
end;$$;
drop function public.jd_read_agent_registry(uuid,uuid);
drop function public.jd_agent_publication(uuid,uuid,uuid,integer,text,text,uuid,uuid);
drop function public.jd_finish_agent_evaluation(uuid,text,jsonb);
drop function public.jd_start_agent_evaluation(uuid,uuid,uuid,integer,text,text);
drop function public.jd_save_agent_definition(uuid,uuid,uuid,integer,jsonb);
drop function public.jd_agent_registry_tenant(uuid);
alter table public.jd_agent_definitions drop constraint jd_agent_current_eval_fk;
drop table public.jd_agent_registry_requests,public.jd_agent_evaluation_reports,public.jd_agent_evaluations,public.jd_agent_definition_versions,public.jd_agent_definitions,public.jd_agent_evaluators;
drop function public.jd_agent_registry_immutable();
commit;
