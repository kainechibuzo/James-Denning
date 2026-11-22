-- Rollback of jd_discovery_autonomy: restore the phase-6 confirm RPC, then
-- drop functions, triggers and tables added in phase 7.
drop function if exists public.jd_confirm_run_skill_cost(uuid,uuid,uuid,uuid,integer,integer);
create function public.jd_confirm_run_skill_cost(p_actor uuid,p_request uuid,p_run uuid,p_skill uuid,p_expected_version integer,p_estimated_seconds integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid;old public.jd_skill_requests%rowtype;req jsonb;result jsonb;run record;
begin
 tenant:=public.jd_skills_tenant(p_actor);
 if not exists(select 1 from public.profiles where id=p_actor and school_id=tenant for share) then
  raise exception 'Workspace member required' using errcode='42501';
 end if;
 if p_run is null or p_skill is null or p_expected_version is null or p_expected_version<1
    or p_estimated_seconds is null or p_estimated_seconds not between 30 and 86400 then
  raise exception 'Run, skill, version and a bounded estimate are required' using errcode='22023';
 end if;
 req:=jsonb_build_array('skills.cost.confirm',p_actor,p_run,p_skill,p_expected_version,p_estimated_seconds);
 select * into old from public.jd_skill_requests where school_id=tenant and request_id=p_request;
 if found then if old.request<>req then raise exception 'Request conflict' using errcode='40001';end if;return old.receipt;end if;
 select * into run from public.jd_automation_runs where id=p_run and school_id=tenant for update;
 if not found then raise exception 'Run unavailable' using errcode='42501';end if;
 if run.status not in ('queued','planning','awaiting_approval') then raise exception 'The run is already executing or finished' using errcode='40001';end if;
 if not exists(select 1 from public.jd_skill_acquisitions where school_id=tenant and skill_id=p_skill and version=p_expected_version) then
  raise exception 'Cost confirmation applies only to autonomously acquired skill versions' using errcode='22023';
 end if;
 if not exists(select 1 from public.jd_skills where id=p_skill and school_id=tenant and status='published' and current_version=p_expected_version) then
  raise exception 'The skill version is not published and current' using errcode='42501';
 end if;
 insert into public.jd_agent_time_ledger(school_id,run_id,skill_id,version,estimated_seconds,basis,status,confirmed_by)
  values(tenant,p_run,p_skill,p_expected_version,p_estimated_seconds,'source_index_estimate','confirmed',p_actor);
 result:=jsonb_build_object('run_id',p_run,'skill_id',p_skill,'version',p_expected_version,'estimated_seconds',p_estimated_seconds,
  'status','confirmed','rate_basis','agentic_seconds','pricing','not_computed_in_this_release',
  'hiring_enabled',false,'execution_enabled',false,'billing_enabled',false);
 insert into public.jd_skill_requests values(tenant,p_request,req,result);
 insert into public.jd_audit_events(school_id,actor_id,event_type,event_json) values(tenant,p_actor,'skills.run_cost_confirmed',result);
 return result;
end; $$;
drop function if exists public.jd_read_billing_summary(uuid);
drop function if exists public.jd_autonomous_cost_authorize(uuid,uuid,uuid,uuid,integer,integer);
drop function if exists public.jd_bind_agent_playbook(uuid,uuid,text,uuid,integer);
drop function if exists public.jd_complete_discovery(uuid,uuid,uuid,jsonb);
drop function if exists public.jd_decide_discovery(uuid,uuid,uuid,text,text);
drop function if exists public.jd_start_discovery(uuid,uuid,text,jsonb,text);
drop function if exists public.jd_set_workspace_autonomy(uuid,uuid,text,integer,bigint);
drop function if exists public.jd_read_workspace_autonomy(uuid);
drop trigger if exists jd_discovery_sessions_immutable on public.jd_discovery_sessions;
drop function if exists public.jd_discovery_immutable();
drop table if exists public.jd_discovery_sessions;
drop table if exists public.jd_agent_playbooks;
drop table if exists public.jd_workspace_autonomy;
