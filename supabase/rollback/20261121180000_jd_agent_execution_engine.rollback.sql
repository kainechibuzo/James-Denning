-- Reviewed rollback for 20261121180000_jd_agent_execution_engine.sql.
-- Removes execution-authority columns and functions without touching
-- definitions, versions, evaluations, evidence or publication records.
drop function if exists public.jd_agent_execution(uuid,uuid,uuid,integer,text,text,uuid,uuid);
drop function if exists public.jd_read_agent_registry(uuid,uuid);
drop trigger if exists jd_agent_execution_version_reset on public.jd_agent_definitions;
drop function if exists public.jd_agent_execution_version_reset();
alter table public.jd_agent_definitions
 drop column if exists execution_grant_approval,
 drop column if exists execution_authorized;
