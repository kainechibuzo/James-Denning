-- Operator-only candidate rollback. Not run automatically; never discard retained evidence or credentials.
-- Prefer disabling JD_RESEARCH_RELEASE_ENABLED and rolling back frontend/functions first.
begin;
do $$begin
 if exists(select 1 from public.jd_foundation_documents) or exists(select 1 from public.jd_foundation_versions)
 or exists(select 1 from public.jd_research_credentials) or exists(select 1 from public.jd_research_attempts) then
  raise exception 'Rollback blocked: retained records exist. Review/export data and plan preservation before schema removal.';
 end if;
end$$;
drop function public.jd_save_foundation(uuid,uuid,integer,uuid,text,text,jsonb,integer);
drop function public.jd_reserve_research(uuid,uuid);
drop function public.jd_store_research_secret(uuid,text,uuid);
drop table public.jd_foundation_versions;
drop table public.jd_foundation_documents;
drop function public.jd_foundation_immutable();
drop table public.jd_research_attempts;
drop table public.jd_research_credentials;
commit;
