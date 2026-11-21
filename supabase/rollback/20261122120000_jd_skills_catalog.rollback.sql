-- Reviewed rollback for 20261122120000_jd_skills_catalog.sql.
-- Removes the skills catalog, its functions and the quarantine bucket. Run
-- references, audit events (in jd_audit_events) and uploaded quarantine
-- objects are retained as evidence; uploaded files remain in storage until an
-- operator reviews them.
drop function if exists public.jd_skills_load(uuid,uuid,integer,uuid);
drop function if exists public.jd_skills_resolve(uuid,text,integer);
drop function if exists public.jd_read_skills_catalog(uuid,uuid);
drop function if exists public.jd_skills_lifecycle(uuid,uuid,uuid,text,text);
drop function if exists public.jd_skills_publish(uuid,uuid,uuid,integer,text);
drop function if exists public.jd_skills_decide(uuid,uuid,uuid,integer,text,text);
drop function if exists public.jd_complete_skill_import(uuid,uuid,uuid,text,jsonb,jsonb);
drop function if exists public.jd_create_skill_import(uuid,uuid,text);
drop function if exists public.jd_skills_assert_admin(uuid,uuid);
drop function if exists public.jd_skills_tenant(uuid);
drop trigger if exists jd_skill_versions_immutable on public.jd_skill_versions;
drop trigger if exists jd_skill_reviews_immutable on public.jd_skill_reviews;
drop trigger if exists jd_skill_requests_immutable on public.jd_skill_requests;
drop function if exists public.jd_skills_immutable();
drop table if exists public.jd_skill_requests cascade;
drop table if exists public.jd_skill_run_references cascade;
drop table if exists public.jd_skill_reviews cascade;
drop table if exists public.jd_skill_versions cascade;
drop table if exists public.jd_skills cascade;
drop table if exists public.jd_skill_imports cascade;
drop table if exists public.jd_skill_packages cascade;
delete from storage.buckets where id='jd-skill-packages';
