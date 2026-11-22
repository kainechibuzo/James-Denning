-- Candidate only: isolated staging and independent release approval required.
-- JD Skills phase 6: autonomous acquisition and per-run agentic-time metering.
-- The workspace administrator asks JD for a capability; JD searches the
-- allowlisted source catalogue (code-reviewed index of anthropics/skills),
-- fetches the pinned upstream skill, repackages instruction text only, inspects
-- it without executing anything and publishes the validated version WITHOUT a
-- human review step, under policy jd-autonomous-v1 chosen by the owner. The
-- compensating controls are recorded here: immutable acquisition provenance,
-- tenant-scoped RLS, the same quarantine/inspector pipeline, and per-run
-- agentic-time confirmation (the human checkpoint moved from publication to
-- spend: every billable run that loads an acquired skill needs an explicit,
-- recorded cost confirmation).
create table public.jd_skill_acquisitions (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id),
 skill_id uuid not null, version integer not null check(version>0),
 source_repo text not null, source_ref text not null, source_commit text not null, source_path text not null,
 package_hash text not null, policy text not null, acquired_by uuid not null references auth.users(id),
 created_at timestamptz not null default clock_timestamp(),
 unique(school_id,skill_id,version),
 foreign key(skill_id) references public.jd_skills(id),
 foreign key(skill_id,version) references public.jd_skill_versions(skill_id,version)
);
create table public.jd_agent_time_ledger (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id),
 run_id uuid not null references public.jd_automation_runs(id), skill_id uuid not null,
 version integer not null check(version>0), estimated_seconds integer not null check(estimated_seconds between 30 and 86400),
 actual_seconds integer check(actual_seconds is null or actual_seconds between 1 and 86400),
 basis text not null default 'source_index_estimate', status text not null default 'confirmed' check(status in ('confirmed','completed')),
 confirmed_by uuid not null references auth.users(id),
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 unique(school_id,run_id,skill_id,version),
 foreign key(skill_id) references public.jd_skills(id)
);
create index jd_skill_acquisitions_scope on public.jd_skill_acquisitions(school_id,created_at desc);
create index jd_agent_time_ledger_scope on public.jd_agent_time_ledger(school_id,run_id);
create index jd_agent_time_ledger_skill on public.jd_agent_time_ledger(skill_id,version);

-- Acquisition provenance and confirmed cost rows are immutable evidence.
create function public.jd_skills_autonomous_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Skill acquisitions and confirmed agentic-time ledger rows are immutable evidence' using errcode='55000';end; $$;
create trigger jd_skill_acquisitions_immutable before update or delete on public.jd_skill_acquisitions for each row execute function public.jd_skills_autonomous_immutable();
create trigger jd_agent_time_ledger_completed before update of actual_seconds,status on public.jd_agent_time_ledger
 for each row when (old.status='completed') execute function public.jd_skills_autonomous_immutable();

do $$ declare t text;begin
 foreach t in array array['jd_skill_acquisitions','jd_agent_time_ledger'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
  execute format('grant select,insert,update on public.%I to service_role',t);
 end loop;
end; $$;

-- Publish a validated acquired version without human review, recording exactly
-- what was trusted: the allowlisted repo, pinned commit, upstream path, package
-- hash and the policy that authorised the autonomous publication. No review
-- row is written: no human review happened, and none may be fabricated.
create function public.jd_acquire_publish_skill(p_actor uuid,p_request uuid,p_import uuid,p_source jsonb,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid;imp public.jd_skill_imports%rowtype;old public.jd_skill_requests%rowtype;req jsonb;result jsonb;
 sid uuid;v_version integer;vrow public.jd_skill_versions%rowtype;repo text;ref text;commit_sha text;spath text;policy text;
begin
 tenant:=public.jd_skills_tenant(p_actor);
 perform public.jd_skills_assert_admin(p_actor,tenant);
 if p_source is null or jsonb_typeof(p_source)<>'object' then raise exception 'Acquisition source provenance is required' using errcode='22023';end if;
 repo:=p_source->>'repo';ref:=p_source->>'ref';commit_sha:=p_source->>'commit';spath:=p_source->>'path';policy:=p_source->>'policy';
 if repo is distinct from 'anthropics/skills' or ref is distinct from 'main'
    or commit_sha is null or commit_sha !~ '^[0-9a-f]{40}$'
    or spath is null or spath !~ '^skills/[a-z0-9][a-z0-9-]{1,60}$'
    or policy is distinct from 'jd-autonomous-v1'
    or p_note is null or length(coalesce(trim(p_note),'')) not between 10 and 1000 then
  raise exception 'Acquisition source is outside the allowlisted catalogue or the record is incomplete' using errcode='22023';
 end if;
 req:=jsonb_build_array('skills.acquire.publish',p_actor,p_import,p_source,p_note);
 select * into old from public.jd_skill_requests where school_id=tenant and request_id=p_request;
 if found then if old.request<>req then raise exception 'Request conflict' using errcode='40001';end if;return old.receipt;end if;
 select * into imp from public.jd_skill_imports where id=p_import and school_id=tenant for update;
 if not found then raise exception 'Import unavailable' using errcode='42501';end if;
 if imp.status<>'needs_review' then raise exception 'Only a validated import can be published autonomously' using errcode='42501';end if;
 select s.id,s.current_version into sid,v_version from public.jd_skills s
  where s.school_id=tenant and lower(s.name)=lower(imp.manifest->>'name') for update;
 if sid is null then raise exception 'Validated import has no recorded skill' using errcode='42501';end if;
 select * into vrow from public.jd_skill_versions where skill_id=sid and version=v_version for share;
 if not found or vrow.package_id is distinct from imp.package_id then
  raise exception 'The import package does not match the current skill version' using errcode='42501';
 end if;
 insert into public.jd_skill_acquisitions(school_id,skill_id,version,source_repo,source_ref,source_commit,source_path,package_hash,policy,acquired_by)
  values(tenant,sid,v_version,repo,ref,commit_sha,spath,vrow.content_hash,policy,p_actor);
 update public.jd_skills set status='published',updated_at=clock_timestamp() where id=sid;
 result:=jsonb_build_object('skill_id',sid,'version',v_version,'state','published','autonomous',true,
  'source',jsonb_build_object('repo',repo,'ref',ref,'commit',commit_sha,'path',spath),'policy',policy,
  'package_hash',vrow.content_hash,'hiring_enabled',false,'execution_enabled',false,'billing_enabled',false);
 insert into public.jd_skill_requests values(tenant,p_request,req,result);
 insert into public.jd_audit_events(school_id,actor_id,event_type,event_json) values(tenant,p_actor,'skills.autonomously_published',result||jsonb_build_object('note',p_note,'import_id',imp.id));
 return result;
end; $$;

-- Confirm the billable agentic time for a run that will load an acquired
-- skill. The human checkpoint moved from publication to spend: this explicit,
-- recorded confirmation is what makes the run allowed to load the skill.
create function public.jd_confirm_run_skill_cost(p_actor uuid,p_request uuid,p_run uuid,p_skill uuid,p_expected_version integer,p_estimated_seconds integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid;old public.jd_skill_requests%rowtype;req jsonb;result jsonb;run record;acq record;
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

-- Read receipt for the dashboard autonomy panel: acquisition provenance and
-- per-run agentic-time ledger, tenant-scoped and bounded.
create function public.jd_read_skills_autonomy(p_actor uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid;acquisitions jsonb;ledger jsonb;
begin
 tenant:=public.jd_skills_tenant(p_actor);
 select coalesce(jsonb_agg(x),'[]') into acquisitions from (
  select a.skill_id,a.version,a.source_repo,a.source_ref,a.source_commit,a.source_path,a.package_hash,a.policy,a.created_at,s.name
  from public.jd_skill_acquisitions a join public.jd_skills s on s.id=a.skill_id
  where a.school_id=tenant order by a.created_at desc,a.skill_id limit 30
 ) x;
 select coalesce(jsonb_agg(x),'[]') into ledger from (
  select l.run_id,l.skill_id,l.version,l.estimated_seconds,l.actual_seconds,l.basis,l.status,l.created_at,s.name
  from public.jd_agent_time_ledger l join public.jd_skills s on s.id=l.skill_id
  where l.school_id=tenant order by l.created_at desc,l.run_id limit 30
 ) x;
 return jsonb_build_object('acquisitions',coalesce(acquisitions,'[]'),'ledger',coalesce(ledger,'[]'),
  'policy','jd-autonomous-v1','hiring_enabled',false,'execution_enabled',false,'billing_enabled',false);
end; $$;

-- Billable-run gate: an autonomously acquired skill version may be loaded only
-- for a run whose agentic time was explicitly confirmed. Human-reviewed
-- starter/uploaded skills keep the phase-4 behaviour.
create or replace function public.jd_skills_load(p_actor uuid,p_skill uuid,p_expected_version integer,p_run uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid;s public.jd_skills%rowtype;v public.jd_skill_versions%rowtype;instructions text;acquired boolean;
begin
 tenant:=public.jd_skills_tenant(p_actor);
 select * into s from public.jd_skills where id=p_skill and school_id=tenant;
 if not found or s.status<>'published' then raise exception 'Skill is not published for this workspace' using errcode='42501';end if;
 select * into v from public.jd_skill_versions where skill_id=s.id and version=s.current_version for share;
 if not found or (p_expected_version is not null and v.version<>p_expected_version) then raise exception 'Requested skill version is not current' using errcode='40001';end if;
 instructions:=left(coalesce(v.manifest->>'instructionText',''),32000);
 if length(instructions)<20 then raise exception 'The stored skill has no bounded instruction text' using errcode='42501';end if;
 acquired:=exists(select 1 from public.jd_skill_acquisitions where school_id=tenant and skill_id=s.id and version=v.version);
 if acquired then
  if p_run is null then raise exception 'Acquired skills load only for runs with confirmed agentic time' using errcode='42501';end if;
  if not exists(select 1 from public.jd_agent_time_ledger l where l.school_id=tenant and l.run_id=p_run
    and l.skill_id=s.id and l.version=v.version and l.status in ('confirmed','completed')) then
   raise exception 'Billable agentic time for this acquired skill was not confirmed for this run' using errcode='42501';
  end if;
 end if;
 if p_run is not null then
  if not exists(select 1 from public.jd_automation_runs r where r.id=p_run and r.school_id=tenant) then raise exception 'Run context unavailable' using errcode='42501';end if;
  insert into public.jd_skill_run_references(school_id,run_id,skill_id,version,loaded_by) values(tenant,p_run,s.id,v.version,p_actor);
 end if;
 return jsonb_build_object('skill_id',s.id,'name',s.name,'version',v.version,'content_hash',v.content_hash,
  'instructions',instructions,'license',v.manifest->>'license','acquired',acquired,
  'treated_as','untrusted_task_data_never_authority','tools_granted',false,'hiring_enabled',false,'execution_enabled',false);
end; $$;

-- Actual agentic time: when a run reaches a terminal state, its confirmed
-- ledger rows record the measured wall-clock seconds for the run.
create function public.jd_agent_time_run_terminal() returns trigger language plpgsql set search_path='' as $$
begin
 if new.status in ('completed','partially_completed','failed','cancelled') and new.completed_at is not null then
  update public.jd_agent_time_ledger l set actual_seconds=
   greatest(1,least(86400,extract(epoch from (new.completed_at-coalesce(new.started_at,new.created_at)))::int)),
   status='completed',updated_at=clock_timestamp()
  where l.run_id=new.id and l.school_id=new.school_id and l.status='confirmed';
 end if;
 return new;
end; $$;
create trigger jd_agent_time_run_terminal after update of status,completed_at on public.jd_automation_runs
 for each row execute function public.jd_agent_time_run_terminal();

-- Defense in depth for the phase-4 contract: a fully clean inspection reports
-- status 'validated', which the original importer rejected with 22023 (its
-- tests only exercised needs_review). The importer now records 'validated' as
-- needs_review with the true inspection status preserved in the report, so a
-- clean package still requires an independent human review before publication.
create or replace function public.jd_complete_skill_import(p_actor uuid,p_request uuid,p_import uuid,p_package_hash text,p_report jsonb,p_manifest jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid;imp public.jd_skill_imports%rowtype;old public.jd_skill_requests%rowtype;req jsonb;result jsonb;
 report_status text;effective text;sid uuid;version integer;hash text;pkg uuid;skill_name text;
begin
 tenant:=public.jd_skills_tenant(p_actor);
 perform public.jd_skills_assert_admin(p_actor,tenant);
 if p_request is null or p_import is null or p_package_hash !~ '^[0-9a-f]{64}$' or p_report is null or jsonb_typeof(p_report)<>'object'
    or p_report->>'kind' is distinct from 'skills_package_report'
    or octet_length(p_report::text)>64000 then
  raise exception 'Invalid skills import report' using errcode='22023';
 end if;
 report_status:=coalesce(p_report->>'status','');
 if report_status not in ('needs_review','validation_failed','validated') then raise exception 'Report status is not a review outcome' using errcode='22023';end if;
 effective:=case when report_status='validated' then 'needs_review' else report_status end;
 if effective='needs_review' then
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
 req:=jsonb_build_array('import.complete',p_actor,p_import,p_package_hash,effective);
 select * into old from public.jd_skill_requests where school_id=tenant and request_id=p_request;
 if found then if old.request<>req then raise exception 'Request conflict' using errcode='40001';end if;return old.receipt;end if;
 select * into imp from public.jd_skill_imports where id=p_import and school_id=tenant for update;
 if not found then raise exception 'Import unavailable' using errcode='42501';end if;
 if imp.status not in ('awaiting_upload','uploaded') then raise exception 'Import already completed; inspect its recorded outcome' using errcode='40001';end if;
 insert into public.jd_skill_packages(school_id,package_hash,original_filename,byte_size,storage_path,created_by)
  values(tenant,p_package_hash,left(coalesce(p_report->>'originalFilename','import.zip'),200),
   greatest(1,least(20971520,coalesce((p_report->>'archiveBytes')::int,1))),imp.storage_path,p_actor)
  returning id into pkg;
 if effective='needs_review' then
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
 update public.jd_skill_imports set status=effective,manifest=p_manifest,report=p_report,
  error_message=case when effective='validation_failed' then left(coalesce(p_report->>'summary','Validation failed'),240) else null end,
  package_id=pkg,completed_at=clock_timestamp() where id=imp.id;
 result:=jsonb_build_object('import_id',imp.id,'skill_id',sid,'version',version,'status',effective,
  'hiring_enabled',false,'execution_enabled',false,'persisted',true);
 insert into public.jd_skill_requests values(tenant,p_request,req,result);
 insert into public.jd_audit_events(school_id,actor_id,event_type,event_json) values(tenant,p_actor,'skills.import_completed',
  jsonb_build_object('import_id',imp.id,'skill_id',sid,'version',version,'status',effective,'package_hash',p_package_hash,
   'file_count',coalesce((p_report->>'entryCount')::int,0)));
 return result;
end; $$;

revoke all on function public.jd_acquire_publish_skill(uuid,uuid,uuid,jsonb,text),public.jd_confirm_run_skill_cost(uuid,uuid,uuid,uuid,integer,integer),public.jd_read_skills_autonomy(uuid),public.jd_skills_autonomous_immutable(),public.jd_agent_time_run_terminal() from public,anon,authenticated;
grant execute on function public.jd_acquire_publish_skill(uuid,uuid,uuid,jsonb,text),public.jd_confirm_run_skill_cost(uuid,uuid,uuid,uuid,integer,integer),public.jd_read_skills_autonomy(uuid) to service_role;
