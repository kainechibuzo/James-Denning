-- Rollback for 20261128120000_jd_projects_and_modes.sql
revoke execute on function public.jd_link_conversation_project(uuid,uuid,uuid) from service_role;
drop function if exists public.jd_link_conversation_project(uuid,uuid,uuid);

revoke execute on function public.jd_set_chat_execution_mode(uuid,uuid,text) from service_role;
drop function if exists public.jd_set_chat_execution_mode(uuid,uuid,text);

drop index if exists public.jd_operational_tasks_school_project_idx;
alter table public.jd_operational_tasks drop column if exists project_id;

drop index if exists public.jd_conversations_school_project_updated_idx;
alter table public.jd_conversations drop column if exists project_id;

drop policy if exists jd_projects_select on public.jd_projects;
drop index if exists public.jd_projects_school_creator_idx;
drop index if exists public.jd_projects_school_status_updated_idx;
drop table if exists public.jd_projects;
