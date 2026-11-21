-- Candidate only: isolated staging and independent release approval required.
-- JD Skills Catalog: tenant-private skill packages uploaded as ZIP, inspected
-- without execution, reviewed by an independent administrator, published as
-- immutable versions for specialist workforce discovery.
--
-- Global catalogue scope exists in the schema but has NO write path in this
-- release: scope stays 'private' and every row is tenant-owned. Platform
-- curation of a global catalogue is a separate reviewed decision.
create table public.jd_skill_packages (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id),
 package_hash text not null, original_filename text, byte_size integer not null check(byte_size between 1 and 20971520),
 storage_path text not null, created_by uuid not null references auth.users(id),
 created_at timestamptz not null default clock_timestamp(), unique(school_id,package_hash)
);
create table public.jd_skill_imports (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id),
 package_id uuid references public.jd_skill_packages(id), requested_by uuid not null references auth.users(id),
 status text not null default 'awaiting_upload' check(status in ('awaiting_upload','uploaded','scanning','needs_review','validation_failed','rejected')),
 storage_path text not null, manifest jsonb, report jsonb, error_message text,
 created_at timestamptz not null default clock_timestamp(), completed_at timestamptz
);
create table public.jd_skills (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id),
 scope text not null default 'private' check(scope='private'),
 name text not null, category text,
 status text not null default 'draft' check(status in ('draft','needs_review','approved','published','deprecated','revoked','rejected')),
 current_version integer not null default 0 check(current_version>=0),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 unique(school_id,id), unique(school_id,name)
);
create table public.jd_skill_versions (
 skill_id uuid not null, school_id uuid not null, version integer not null check(version>0),
 manifest jsonb not null, content_hash text not null, package_id uuid not null,
 created_by uuid not null references auth.users(id), created_at timestamptz not null default clock_timestamp(),
 primary key(skill_id,version),
 foreign key(skill_id,school_id) references public.jd_skills(id,school_id)
);
create table public.jd_skill_reviews (
 id uuid primary key default gen_random_uuid(), skill_id uuid not null, school_id uuid not null,
 version integer not null, decision text not null check(decision in ('approved','rejected')),
 note text not null, decided_by uuid not null references auth.users(id),
 created_at timestamptz not null default clock_timestamp(), unique(id,skill_id),
 foreign key(skill_id,version) references public.jd_skill_versions(skill_id,version)
);
create table public.jd_skill_run_references (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id),
 run_id uuid not null references public.jd_automation_runs(id), skill_id uuid not null,
 version integer not null, loaded_by uuid not null references auth.users(id),
 loaded_at timestamptz not null default clock_timestamp()
);
create table public.jd_skill_requests (
 school_id uuid not null references public.schools(id), request_id uuid not null,
 request jsonb not null, receipt jsonb not null, primary key(school_id,request_id)
);
create index jd_skills_scope on public.jd_skills(school_id,created_at desc);
create index jd_skill_versions_scope on public.jd_skill_versions(skill_id,version desc);
create index jd_skill_imports_scope on public.jd_skill_imports(school_id,created_at desc);
create index jd_skill_run_references_run on public.jd_skill_run_references(school_id,run_id);

-- Versions, reviews and request receipts are immutable evidence.
create function public.jd_skills_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Skill versions, reviews and request receipts are immutable' using errcode='55000';end; $$;
create trigger jd_skill_versions_immutable before update or delete on public.jd_skill_versions for each row execute function public.jd_skills_immutable();
create trigger jd_skill_reviews_immutable before update or delete on public.jd_skill_reviews for each row execute function public.jd_skills_immutable();
create trigger jd_skill_requests_immutable before update or delete on public.jd_skill_requests for each row execute function public.jd_skills_immutable();

do $$ declare t text;begin
 foreach t in array array['jd_skill_packages','jd_skill_imports','jd_skills','jd_skill_versions','jd_skill_reviews','jd_skill_run_references','jd_skill_requests'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
  execute format('grant select,insert,update on public.%I to service_role',t);
 end loop;
end; $$;

create function public.jd_skills_tenant(p_actor uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare tenant uuid;begin
 select school_id into tenant from public.profiles where id=p_actor and school_id is not null for share;
 if tenant is null then raise exception 'Workspace member required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(tenant::text,211220));
 return tenant;
end; $$;

create function public.jd_skills_assert_admin(p_actor uuid,p_tenant uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.profiles where id=p_actor and school_id=p_tenant and role in ('owner','admin') for share) then
  raise exception 'Workspace administrator required' using errcode='42501';
 end if;
end; $$;

-- 1. Create a quarantined import and its bounded upload target.
create function public.jd_create_skill_import(p_actor uuid,p_request uuid,p_filename text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid;old public.jd_skill_requests%rowtype;req jsonb;result jsonb;path text;iid uuid;
begin
 tenant:=public.jd_skills_tenant(p_actor);
 perform public.jd_skills_assert_admin(p_actor,tenant);
 if p_request is null or p_filename is null or length(coalesce(trim(p_filename),'')) not between 1 and 200 or p_filename !~* '^[A-Za-z0-9._ -]+$' then raise exception 'A plain package filename is required' using errcode='22023';end if;
 req:=jsonb_build_array('import.create',p_actor,p_filename);
 select * into old from public.jd_skill_requests where school_id=tenant and request_id=p_request;
 if found then if old.request<>req then raise exception 'Request conflict' using errcode='40001';end if;return old.receipt;end if;
 if exists(select 1 from public.jd_skill_imports where school_id=tenant and requested_by=p_actor and status='awaiting_upload' and created_at>clock_timestamp()-interval '1 hour' and (report->>'pending_count')::int>=4) then
  raise exception 'Too many awaiting uploads; complete or discard an import first' using errcode='54000';
 end if;
 path:=tenant::text||'/imports/'||gen_random_uuid()::text||'.zip';
 insert into public.jd_skill_imports(school_id,requested_by,status,storage_path,report)
 values(tenant,p_actor,'awaiting_upload',path,jsonb_build_object('pending_count',
  (select count(*)::int from public.jd_skill_imports where school_id=tenant and requested_by=p_actor and status='awaiting_upload' and created_at>clock_timestamp()-interval '1 hour')+1,'original_filename',p_filename))
 returning id into iid;
 result:=jsonb_build_object('import_id',iid,'storage_path',path,'bucket','jd-skill-packages',
  'max_bytes',20971520,'mime_type','application/zip','scope','private','hiring_enabled',false,'execution_enabled',false);
 insert into public.jd_skill_requests values(tenant,p_request,req,result);
 insert into public.jd_audit_events(school_id,actor_id,event_type,event_json) values(tenant,p_actor,'skills.import_created',jsonb_build_object('import_id',iid));
 return result;
end; $$;

-- 2. Record the inspected package: report, manifest, immutable version, skill.
--    Called only by the trusted skills service after it downloaded and parsed
--    the archive itself. Never by the browser.
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

-- 3. Independent review decision on the current version.
create function public.jd_skills_decide(p_actor uuid,p_request uuid,p_skill uuid,p_expected integer,p_action text,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid;s public.jd_skills%rowtype;old public.jd_skill_requests%rowtype;req jsonb;result jsonb;
begin
 tenant:=public.jd_skills_tenant(p_actor);
 perform public.jd_skills_assert_admin(p_actor,tenant);
 if p_request is null or p_action is null or p_action not in ('approve','reject') or length(coalesce(trim(p_note),'')) not between 10 and 1000 then raise exception 'Explicit review decision and note required' using errcode='22023';end if;
 req:=jsonb_build_array('skills.decide',p_actor,p_skill,p_expected,p_action,p_note);
 select * into old from public.jd_skill_requests where school_id=tenant and request_id=p_request;
 if found then if old.request<>req then raise exception 'Request conflict' using errcode='40001';end if;return old.receipt;end if;
 select * into s from public.jd_skills where id=p_skill and school_id=tenant for update;
 if not found then raise exception 'Skill unavailable' using errcode='42501';end if;
 if p_expected is null or s.current_version<>p_expected or s.status<>'needs_review' then raise exception 'Current reviewable version required' using errcode='40001';end if;
 if p_actor=(select created_by from public.jd_skill_versions where skill_id=s.id and version=s.current_version) then
  raise exception 'An independent reviewer is required' using errcode='42501';
 end if;
 insert into public.jd_skill_reviews(skill_id,school_id,version,decision,note,decided_by)
 values(s.id,tenant,s.current_version,case when p_action='approve' then 'approved' else 'rejected' end,p_note,p_actor);
 if p_action='approve' then
  update public.jd_skills set status='approved',updated_at=clock_timestamp() where id=s.id;
 else
  update public.jd_skills set status='rejected',updated_at=clock_timestamp() where id=s.id;
 end if;
 result:=jsonb_build_object('skill_id',s.id,'version',s.current_version,'decision',p_action,'state',case when p_action='approve' then 'approved' else 'rejected' end,'hiring_enabled',false,'execution_enabled',false);
 insert into public.jd_skill_requests values(tenant,p_request,req,result);
 insert into public.jd_audit_events(school_id,actor_id,event_type,event_json) values(tenant,p_actor,'skills.review_'||p_action,result||jsonb_build_object('note',p_note));
 return result;
end; $$;

-- 4. Publication of an approved, reviewed immutable version.
create function public.jd_skills_publish(p_actor uuid,p_request uuid,p_skill uuid,p_expected integer,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid;s public.jd_skills%rowtype;old public.jd_skill_requests%rowtype;req jsonb;result jsonb;review record;
begin
 tenant:=public.jd_skills_tenant(p_actor);
 perform public.jd_skills_assert_admin(p_actor,tenant);
 if p_request is null or length(coalesce(trim(p_note),'')) not between 10 and 1000 then raise exception 'Publication note required' using errcode='22023';end if;
 req:=jsonb_build_array('skills.publish',p_actor,p_skill,p_expected,p_note);
 select * into old from public.jd_skill_requests where school_id=tenant and request_id=p_request;
 if found then if old.request<>req then raise exception 'Request conflict' using errcode='40001';end if;return old.receipt;end if;
 select * into s from public.jd_skills where id=p_skill and school_id=tenant for update;
 if not found then raise exception 'Skill unavailable' using errcode='42501';end if;
 if p_expected is null or s.current_version<>p_expected or s.status<>'approved' then raise exception 'An approved current version is required' using errcode='42501';end if;
 select * into review from public.jd_skill_reviews where skill_id=s.id and version=s.current_version and decision='approved' order by created_at desc limit 1;
 if review.id is null or review.decided_by=s.created_by
    or review.decided_by=(select created_by from public.jd_skill_versions where skill_id=s.id and version=s.current_version) then
  raise exception 'A recorded independent review is required before publication' using errcode='42501';
 end if;
 update public.jd_skills set status='published',updated_at=clock_timestamp() where id=s.id;
 result:=jsonb_build_object('skill_id',s.id,'version',s.current_version,'state','published','scope',s.scope,'hiring_enabled',false,'execution_enabled',false,'billing_enabled',false);
 insert into public.jd_skill_requests values(tenant,p_request,req,result);
 insert into public.jd_audit_events(school_id,actor_id,event_type,event_json) values(tenant,p_actor,'skills.published',result||jsonb_build_object('note',p_note,'review',review.id));
 return result;
end; $$;

-- 5. Immediate revocation or deprecation of a published skill.
create function public.jd_skills_lifecycle(p_actor uuid,p_request uuid,p_skill uuid,p_action text,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid;s public.jd_skills%rowtype;old public.jd_skill_requests%rowtype;req jsonb;result jsonb;target text;
begin
 tenant:=public.jd_skills_tenant(p_actor);
 perform public.jd_skills_assert_admin(p_actor,tenant);
 if p_request is null or p_action is null or p_action not in ('revoke','deprecate') or length(coalesce(trim(p_note),'')) not between 10 and 1000 then raise exception 'Explicit lifecycle action and note required' using errcode='22023';end if;
 req:=jsonb_build_array('skills.lifecycle',p_actor,p_skill,p_action,p_note);
 select * into old from public.jd_skill_requests where school_id=tenant and request_id=p_request;
 if found then if old.request<>req then raise exception 'Request conflict' using errcode='40001';end if;return old.receipt;end if;
 select * into s from public.jd_skills where id=p_skill and school_id=tenant for update;
 if not found then raise exception 'Skill unavailable' using errcode='42501';end if;
 if p_action='revoke' then
  if s.status not in ('published','approved','needs_review','draft') then raise exception 'Only active skills can be revoked' using errcode='42501';end if;
  target:='revoked';
 else
  if s.status<>'published' then raise exception 'Only published skills can be deprecated' using errcode='42501';end if;
  target:='deprecated';
 end if;
 update public.jd_skills set status=target,updated_at=clock_timestamp() where id=s.id;
 result:=jsonb_build_object('skill_id',s.id,'state',target,'hiring_enabled',false,'execution_enabled',false);
 insert into public.jd_skill_requests values(tenant,p_request,req,result);
 insert into public.jd_audit_events(school_id,actor_id,event_type,event_json) values(tenant,p_actor,'skills.'||p_action,result||jsonb_build_object('note',p_note));
 return result;
end; $$;

-- 6. Tenant catalog read (admin surfaces and status).
create function public.jd_read_skills_catalog(p_actor uuid,p_skill uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid;items jsonb;versions jsonb;imports jsonb;reviews jsonb;
begin
 tenant:=public.jd_skills_tenant(p_actor);
 if p_skill is not null and not exists(select 1 from public.jd_skills where id=p_skill and school_id=tenant) then raise exception 'Skill unavailable' using errcode='42501';end if;
 select coalesce(jsonb_agg(x),'[]') into items from (
  select s.id,s.name,s.category,s.scope,s.status,s.current_version,
   (select count(*)::int from public.jd_skill_imports i where i.school_id=s.school_id and i.status='needs_review') as pending_reviews,
   (select count(*)::int from public.jd_skill_imports i where i.school_id=s.school_id and i.status='validation_failed') as failed_imports,
   (select count(*)::int from public.jd_skills t where t.school_id=s.school_id and t.status='published') as published_count,
   v.content_hash,v.created_at
  from public.jd_skills s
  left join public.jd_skill_versions v on v.skill_id=s.id and v.version=s.current_version
  where s.school_id=tenant and (p_skill is null or s.id=p_skill) order by s.created_at desc,s.id limit 50
 ) x;
 if p_skill is not null then
  select coalesce(jsonb_agg(x),'[]') into versions from (select version,manifest,content_hash,created_by,created_at from public.jd_skill_versions where skill_id=p_skill and school_id=tenant order by version desc limit 10)x;
  select coalesce(jsonb_agg(x),'[]') into reviews from (select version,decision,note,decided_by,created_at from public.jd_skill_reviews where skill_id=p_skill and school_id=tenant order by created_at desc limit 10)x;
  select coalesce(jsonb_agg(x),'[]') into imports from (select id,status,left(coalesce(error_message,''),200) as error_message,created_at,completed_at from public.jd_skill_imports where school_id=tenant and (package_id in (select package_id from public.jd_skill_versions where skill_id=p_skill and school_id=tenant) or requested_by=(select created_by from public.jd_skill_versions where skill_id=p_skill and school_id=tenant limit 1)) order by created_at desc limit 10)x;
 end if;
 return jsonb_build_object('skills',items,'versions',coalesce(versions,'[]'),'reviews',coalesce(reviews,'[]'),'imports',coalesce(imports,'[]'),
  'hiring_enabled',false,'execution_enabled',false,'billing_enabled',false,'skill_scope','tenant_private','skill_limit',50,'history_limit',10);
end; $$;

-- 7. Discovery: bounded, tenant-published skills matching a task. Read-only.
create function public.jd_skills_resolve(p_actor uuid,p_task text,p_limit integer default 5)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid;items jsonb;terms text[];
begin
 tenant:=public.jd_skills_tenant(p_actor);
 if p_task is null or length(coalesce(trim(p_task),''))<4 or length(p_task)>2000 then raise exception 'A bounded task description is required' using errcode='22023';end if;
 select array_agg(lower(word)) into terms from (
  select regexp_split_to_table(regexp_replace(lower(substring(p_task from 1 for 400)),'[^a-z0-9 ]+',' ','g'),'\s+') as word
 ) w where length(word)>=4 and word not in ('this','that','with','from','have','needs','need','please','work','task','help','about');
 select coalesce(jsonb_agg(x),'[]') into items from (
  select s.id,s.name,v.version,v.manifest->>'description' as description,
   v.manifest->>'category' as category,
   coalesce((select jsonb_agg(t.value) from jsonb_array_elements_text(v.manifest->'tags') t),'[]'::jsonb) as tags,
   (
    (case when lower(s.name) in (select unnest(coalesce(terms,array[''::text]::text[]))) then 6 else 0 end)
    + (select greatest(0,count(*)) from unnest(coalesce(terms,array[''::text]::text[])) t
       where v.manifest->>'description' ilike '%'||t||'%' or lower(s.name) ilike '%'||t||'%' or exists(select 1 from jsonb_array_elements_text(v.manifest->'tags') tag where lower(tag.value)=t))
   )::int as score
  from public.jd_skills s join public.jd_skill_versions v on v.skill_id=s.id and v.version=s.current_version
  where s.school_id=tenant and s.scope='private' and s.status='published'
  order by score desc,s.updated_at desc limit greatest(1,least(10,coalesce(p_limit,5)))
 ) x where (x.score>0 or coalesce(jsonb_array_length(x.tags),0)>0);
 return jsonb_build_object('skills',coalesce(items,'[]'),'scope','tenant_private','execution_granted',false,'instructions_included',false,
  'notice','Skill metadata only; loading an approved skill records its exact version and never grants tools or authority.');
end; $$;

-- 8. Load one published skill version for a run and record the reference.
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

revoke all on function public.jd_skills_tenant(uuid),public.jd_skills_assert_admin(uuid,uuid),public.jd_create_skill_import(uuid,uuid,text),public.jd_complete_skill_import(uuid,uuid,uuid,text,jsonb,jsonb),public.jd_skills_decide(uuid,uuid,uuid,integer,text,text),public.jd_skills_publish(uuid,uuid,uuid,integer,text),public.jd_skills_lifecycle(uuid,uuid,uuid,text,text),public.jd_read_skills_catalog(uuid,uuid),public.jd_skills_resolve(uuid,text,integer),public.jd_skills_load(uuid,uuid,integer,uuid),public.jd_skills_immutable() from public,anon,authenticated;
grant execute on function public.jd_skills_tenant(uuid),public.jd_skills_assert_admin(uuid,uuid),public.jd_create_skill_import(uuid,uuid,text),public.jd_complete_skill_import(uuid,uuid,uuid,text,jsonb,jsonb),public.jd_skills_decide(uuid,uuid,uuid,integer,text,text),public.jd_skills_publish(uuid,uuid,uuid,integer,text),public.jd_skills_lifecycle(uuid,uuid,uuid,text,text),public.jd_read_skills_catalog(uuid,uuid),public.jd_skills_resolve(uuid,text,integer),public.jd_skills_load(uuid,uuid,integer,uuid) to service_role;

-- Private quarantine bucket; access is mediated exclusively by short-lived
-- signed upload URLs issued by the skills service. ZIP only, 20 MiB cap.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('jd-skill-packages','jd-skill-packages',false,20971520,array['application/zip'])
on conflict(id) do update set public=false,file_size_limit=20971520,allowed_mime_types=excluded.allowed_mime_types;
