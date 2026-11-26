-- Rollback of jd_skills_autonomous: restore the phase-4 importer and loader
-- verbatim, then drop functions, triggers and tables.
drop trigger if exists jd_agent_time_run_terminal on public.jd_automation_runs;
drop function if exists public.jd_agent_time_run_terminal();
drop function if exists public.jd_complete_skill_import(uuid,uuid,uuid,text,jsonb,jsonb);
create function public.jd_complete_skill_import(p_actor uuid,p_request uuid,p_import uuid,p_package_hash text,p_report jsonb,p_manifest jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid;imp public.jd_skill_imports%rowtype;old public.jd_skill_requests%rowtype;req jsonb;result jsonb;
 report_status text;sid uuid;version integer;hash text;pkg uuid;skill_name text;
begin
 tenant:=public.jd_skills_tenant(p_actor);
 perform public.jd_skills_assert_admin(p_actor,tenant);
 if p_request is null or p_import is null or p_package_hash !~ '^[0-9a-f]{64}$' or p_report is null or jsonb_typeof(p_report)<>'object'
    or p_report->>'kind' is distinct from 'skills_package_report'
    or octet_length(p_report::text)>64000 then
  raise exception 'Invalid skills import report' using errcode='22023';
 end if;
 report_status:=coalesce(p_report->>'status','');
 if report_status not in ('needs_review','validation_failed') then raise exception 'Report status is not a review outcome' using errcode='22023';end if;
 if report_status='needs_review' then
  if p_manifest is null or jsonb_typeof(p_manifest)<>'object'
    or p_manifest->>'schemaVersion' is distinct from '1'
    or p_manifest->>'entrypoint' is distinct from 'SKILL.md'
    or length(coalesce(p_manifest->>'name','')) not between 2 and 120
    or length(coalesce(p_manifest->>'description','')) not between 12 and 2000
    or length(coalesce(p_manifest->>'instructionText','')) not between 20 and 32000
    or octet_length(p_manifest::text)>120000 then
   raise exception 'Invalid skills manifest' using errcode='22023';
  end if;
  skill_name:=p_manifest->>'name';
 else
  if p_manifest is not null and jsonb_typeof(p_manifest)<>'object' then raise exception 'Invalid skills manifest' using errcode='22023';end if;
  skill_name:=null;sid:=null;version:=null;hash:=null;
 end if;
 req:=jsonb_build_array('import.complete',p_actor,p_import,p_package_hash,report_status);
 select * into old from public.jd_skill_requests where school_id=tenant and request_id=p_request;
 if found then if old.request<>req then raise exception 'Request conflict' using errcode='40001';end if;return old.receipt;end if;
 select * into imp from public.jd_skill_imports where id=p_import and school_id=tenant for update;
 if not found then raise exception 'Import unavailable' using errcode='42501';end if;
 if imp.status not in ('awaiting_upload','uploaded') then raise exception 'Import already completed; inspect its recorded outcome' using errcode='40001';end if;
 insert into public.jd_skill_packages(school_id,package_hash,original_filename,byte_size,storage_path,created_by)
  values(tenant,p_package_hash,left(coalesce(p_report->>'originalFilename','import.zip'),200),
   greatest(1,least(20971520,coalesce((p_report->>'archiveBytes')::int,1))),imp.storage_path,p_actor)
  returning id into pkg;
 if report_status='needs_review' then
  select coalesce(max(v.version),0)+1 into version from public.jd_skill_versions v join public.jd_skills s on s.id=v.skill_id
   where s.school_id=tenant and lower(s.name)=lower(skill_name);
  insert into public.jd_skills(school_id,scope,name,category,status,current_version,created_by)
   values(tenant,'private',skill_name,nullif(p_manifest->>'category',''),'draft',0,p_actor)
   on conflict(school_id,name) do update set updated_at=clock_timestamp()
   returning id into sid;
  hash:=coalesce(nullif(p_manifest->>'content_hash',''),p_package_hash);
  insert into public.jd_skill_versions(skill_id,school_id,version,manifest,content_hash,package_id,created_by)
   values(sid,tenant,version,p_manifest,hash,pkg,p_actor);
  update public.jd_skills set current_version=version,status='needs_review',updated_at=clock_timestamp() where id=sid;
 end if;
 update public.jd_skill_imports set status=report_status,manifest=p_manifest,report=p_report,
  error_message=case when report_status='validation_failed' then left(coalesce(p_report->>'summary','Validation failed'),240) else null end,
  package_id=pkg,completed_at=clock_timestamp() where id=imp.id;
 result:=jsonb_build_object('import_id',imp.id,'skill_id',sid,'version',version,'status',report_status,
  'hiring_enabled',false,'execution_enabled',false,'persisted',true);
 insert into public.jd_skill_requests values(tenant,p_request,req,result);
 insert into public.jd_audit_events(school_id,actor_id,event_type,event_json) values(tenant,p_actor,'skills.import_completed',
  jsonb_build_object('import_id',imp.id,'skill_id',sid,'version',version,'status',report_status,'package_hash',p_package_hash,
   'file_count',coalesce((p_report->>'entryCount')::int,0)));
 return result;
end; $$;
drop function if exists public.jd_skills_load(uuid,uuid,integer,uuid);
create function public.jd_skills_load(p_actor uuid,p_skill uuid,p_expected_version integer,p_run uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid;s public.jd_skills%rowtype;v public.jd_skill_versions%rowtype;instructions text;
begin
 tenant:=public.jd_skills_tenant(p_actor);
 select * into s from public.jd_skills where id=p_skill and school_id=tenant;
 if not found or s.status<>'published' then raise exception 'Skill is not published for this workspace' using errcode='42501';end if;
 select * into v from public.jd_skill_versions where skill_id=s.id and version=s.current_version for share;
 if not found or (p_expected_version is not null and v.version<>p_expected_version) then raise exception 'Requested skill version is not current' using errcode='40001';end if;
 instructions:=left(coalesce(v.manifest->>'instructionText',''),32000);
 if length(instructions)<20 then raise exception 'The stored skill has no bounded instruction text' using errcode='42501';end if;
 if p_run is not null then
  if not exists(select 1 from public.jd_automation_runs r where r.id=p_run and r.school_id=tenant) then raise exception 'Run context unavailable' using errcode='42501';end if;
  insert into public.jd_skill_run_references(school_id,run_id,skill_id,version,loaded_by) values(tenant,p_run,s.id,v.version,p_actor);
 end if;
 return jsonb_build_object('skill_id',s.id,'name',s.name,'version',v.version,'content_hash',v.content_hash,
  'instructions',instructions,'license',v.manifest->>'license',
  'treated_as','untrusted_task_data_never_authority','tools_granted',false,'hiring_enabled',false,'execution_enabled',false);
end; $$;
drop function if exists public.jd_read_skills_autonomy(uuid);
drop function if exists public.jd_confirm_run_skill_cost(uuid,uuid,uuid,uuid,integer,integer);
drop function if exists public.jd_acquire_publish_skill(uuid,uuid,uuid,jsonb,text);
drop trigger if exists jd_skill_acquisitions_immutable on public.jd_skill_acquisitions;
drop trigger if exists jd_agent_time_ledger_completed on public.jd_agent_time_ledger;
drop function if exists public.jd_skills_autonomous_immutable();
drop table if exists public.jd_agent_time_ledger;
drop table if exists public.jd_skill_acquisitions;
