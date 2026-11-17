-- LOCAL CANDIDATE ONLY. Separate reviewed staging/migration release required.
-- Blueprints are immutable documents, never executor instructions or billing authority.
create table public.jd_foundation_documents (
 id uuid primary key default gen_random_uuid(),
 school_id uuid not null references public.schools(id) on delete cascade,
 kind text not null check(kind in ('business','saas')),
 title text not null check(length(title) between 2 and 160),
 current_version integer not null default 0 check(current_version>=0),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 unique(id,school_id)
);
create table public.jd_foundation_versions (
 id uuid primary key default gen_random_uuid(),
 document_id uuid not null,
 school_id uuid not null,
 version integer not null check(version>0),
 base_version integer not null,
 restored_from_version integer check(restored_from_version>0),
 request_id uuid not null,
 request_hash text not null,
 content_hash text not null,
 content jsonb not null check(jsonb_typeof(content)='object' and octet_length(content::text)<=150000),
 approval_id uuid not null unique references public.jd_approvals(id),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 unique(document_id,version),unique(school_id,request_id),
 foreign key(document_id,school_id) references public.jd_foundation_documents(id,school_id) on delete cascade,
 foreign key(document_id,restored_from_version) references public.jd_foundation_versions(document_id,version)
);
create index jd_foundation_tenant_created on public.jd_foundation_documents(school_id,created_at desc);
alter table public.jd_foundation_documents enable row level security;
alter table public.jd_foundation_versions enable row level security;
create policy jd_foundation_documents_read on public.jd_foundation_documents for select to authenticated using(exists(select 1 from public.profiles p where p.id=auth.uid() and p.school_id=jd_foundation_documents.school_id and p.role in ('owner','admin')));
create policy jd_foundation_versions_read on public.jd_foundation_versions for select to authenticated using(exists(select 1 from public.profiles p where p.id=auth.uid() and p.school_id=jd_foundation_versions.school_id and p.role in ('owner','admin')));
revoke all on public.jd_foundation_documents,public.jd_foundation_versions from public,anon,authenticated;
grant select on public.jd_foundation_documents,public.jd_foundation_versions to authenticated;
grant select,insert,update,delete on public.jd_foundation_documents,public.jd_foundation_versions to service_role;
create function public.jd_foundation_immutable() returns trigger language plpgsql set search_path=pg_catalog as $$begin raise exception 'Foundation versions are immutable' using errcode='55000';end$$;
create trigger jd_foundation_version_immutable before update on public.jd_foundation_versions for each row execute function public.jd_foundation_immutable();
revoke all on function public.jd_foundation_immutable() from public,anon,authenticated;

create function public.jd_save_foundation(p_actor_id uuid,p_document_id uuid,p_expected_version integer,p_request_id uuid,p_kind text,p_title text,p_content jsonb,p_restore_version integer default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 tenant uuid; doc public.jd_foundation_documents%rowtype; previous public.jd_foundation_versions%rowtype;
 req_hash text; hash text; run_id uuid; approval_id uuid; version_id uuid;
begin
 select school_id into tenant from public.profiles where id=p_actor_id and role in ('owner','admin') for share;
 if tenant is null then raise exception 'Administrator required' using errcode='42501';end if;
 if p_request_id is null or p_expected_version is null or p_expected_version<0 or p_kind is null or p_kind not in ('business','saas') or p_title is null or length(trim(p_title)) not between 2 and 160 or p_content is null or jsonb_typeof(p_content)<>'object' or octet_length(p_content::text)>150000 then raise exception 'Invalid document' using errcode='22023';end if;
 -- Assert no execution/grant/payment is represented by the stored document.
 if (p_content->>'schemaVersion') is distinct from '1' or (p_content->'execution'->>'performed') is distinct from 'false' or (p_content->>'persisted') is distinct from 'false' then raise exception 'Invalid design contract' using errcode='22023';end if;
 if (p_kind='business' and p_content->>'kind' is distinct from 'business') or (p_kind='saas' and p_content->>'kind' is distinct from 'saas_agent_team_design') then raise exception 'Wrong document kind' using errcode='22023';end if;
 req_hash:=encode(extensions.digest(convert_to(jsonb_build_array(p_document_id,p_expected_version,p_kind,trim(p_title),p_content,p_restore_version)::text,'UTF8'),'sha256'),'hex');
 -- Serialise tenant document writes, including first-create idempotency across actors.
 perform id from public.schools where id=tenant for update;
 select * into previous from public.jd_foundation_versions where school_id=tenant and request_id=p_request_id;
 if found then
  if previous.request_hash<>req_hash or previous.created_by<>p_actor_id then raise exception 'Request conflict' using errcode='40001';end if;
  return jsonb_build_object('document_id',previous.document_id,'version',previous.version,'version_id',previous.id,'approval_id',previous.approval_id,'content_hash',previous.content_hash,'persisted',true,'execution_performed',false,'duplicate',true);
 end if;
 if p_document_id is null then
  if p_expected_version<>0 then raise exception 'Version conflict' using errcode='40001';end if;
  insert into public.jd_foundation_documents(school_id,kind,title,created_by) values(tenant,p_kind,trim(p_title),p_actor_id) returning * into doc;
 else
  select * into doc from public.jd_foundation_documents where id=p_document_id and school_id=tenant for update;
  if not found then raise exception 'Document unavailable' using errcode='42501';end if;
  if doc.current_version<>p_expected_version or doc.kind<>p_kind then raise exception 'Version conflict' using errcode='40001';end if;
 end if;
 if p_restore_version is not null and not exists(select 1 from public.jd_foundation_versions where document_id=doc.id and school_id=tenant and version=p_restore_version and version<=doc.current_version) then raise exception 'Restore source unavailable' using errcode='22023';end if;
 hash:=encode(extensions.digest(convert_to(p_content::text,'UTF8'),'sha256'),'hex');
 insert into public.jd_automation_runs(school_id,requested_by,trigger_type,status,autonomy_mode,scope,request_text,plan_json,idempotency_key)
 values(tenant,p_actor_id,'manual','awaiting_approval','assisted','foundation',trim(p_title),jsonb_build_array(jsonb_build_object('document_id',doc.id,'version',doc.current_version+1,'content_hash',hash,'execution_authorised',false)),'foundation:'||tenant::text||':'||p_request_id::text) returning id into run_id;
 insert into public.jd_approvals(school_id,run_id,requested_by,status,reason,title,action_key,risk_level,proposal_json,audience_text,execution_status)
 values(tenant,run_id,p_actor_id,'pending','Review blueprint content only; does not authorise execution, hiring, permissions or charges.',trim(p_title),'foundation.review','low',jsonb_build_object('document_id',doc.id,'version',doc.current_version+1,'content_hash',hash,'design',p_content),'Blueprint content review only','not_executed') returning id into approval_id;
 insert into public.jd_foundation_versions(document_id,school_id,version,base_version,restored_from_version,request_id,request_hash,content_hash,content,approval_id,created_by)
 values(doc.id,tenant,doc.current_version+1,doc.current_version,p_restore_version,p_request_id,req_hash,hash,p_content,approval_id,p_actor_id) returning id into version_id;
 update public.jd_foundation_documents set current_version=doc.current_version+1,title=trim(p_title) where id=doc.id;
 insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json) values(tenant,p_actor_id,run_id,'foundation.version_saved',jsonb_build_object('document_id',doc.id,'version_id',version_id,'restored_from_version',p_restore_version,'version',doc.current_version+1,'content_hash',hash,'approval_id',approval_id));
 return jsonb_build_object('document_id',doc.id,'version',doc.current_version+1,'version_id',version_id,'approval_id',approval_id,'content_hash',hash,'persisted',true,'execution_performed',false,'duplicate',false);
end$$;
revoke all on function public.jd_save_foundation(uuid,uuid,integer,uuid,text,text,jsonb,integer) from public,anon,authenticated;
grant execute on function public.jd_save_foundation(uuid,uuid,integer,uuid,text,text,jsonb,integer) to service_role;

-- Credentials never have authenticated table grants. Only redacted status is served by HTTP.
create table public.jd_research_credentials (
 school_id uuid primary key references public.schools(id) on delete cascade,
 provider text not null default 'serpapi' check(provider='serpapi'),
 encrypted_secret text not null,
 credential_version uuid not null default gen_random_uuid(),
 updated_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now()
);
create table public.jd_research_attempts (
 id uuid primary key default gen_random_uuid(),
 school_id uuid not null references public.schools(id) on delete cascade,
 actor_id uuid not null references auth.users(id),
 credential_version uuid not null,
 created_at timestamptz not null default clock_timestamp(),
 status text not null default 'reserved' check(status in ('reserved','success','empty','invalid_credentials','quota_exhausted','rate_limited','provider_error','timeout','invalid_response','network_error')),
 completed_at timestamptz,
 evidence jsonb -- no key or raw provider errors; bounded normalised public-source evidence only
);
create index jd_research_attempts_tenant_time on public.jd_research_attempts(school_id,created_at desc);
alter table public.jd_research_credentials enable row level security;
alter table public.jd_research_attempts enable row level security;
revoke all on public.jd_research_credentials,public.jd_research_attempts from public,anon,authenticated;
grant select,insert,update,delete on public.jd_research_credentials,public.jd_research_attempts to service_role;
create function public.jd_reserve_research(p_actor_id uuid,p_credential_version uuid) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare tenant uuid; result uuid;
begin
 select school_id into tenant from public.profiles where id=p_actor_id and role in ('owner','admin') for share;
 if tenant is null then raise exception 'Administrator required' using errcode='42501';end if;
 perform id from public.schools where id=tenant for update;
 if not exists(select 1 from public.jd_research_credentials where school_id=tenant and credential_version=p_credential_version) then raise exception 'Credential changed' using errcode='40001';end if;
 if (select count(*) from public.jd_research_attempts where school_id=tenant and created_at>clock_timestamp()-interval '1 minute')>=5 or (select count(*) from public.jd_research_attempts where school_id=tenant and created_at>clock_timestamp()-interval '24 hours')>=20 then raise exception 'Research limit reached' using errcode='54000';end if;
 insert into public.jd_research_attempts(school_id,actor_id,credential_version) values(tenant,p_actor_id,p_credential_version) returning id into result;
 return result;
end$$;
revoke all on function public.jd_reserve_research(uuid,uuid) from public,anon,authenticated;
grant execute on function public.jd_reserve_research(uuid,uuid) to service_role;

create function public.jd_store_research_secret(p_actor_id uuid,p_encrypted text,p_version uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare tenant uuid;
begin
 select school_id into tenant from public.profiles where id=p_actor_id and role in ('owner','admin') for share;
 if tenant is null then raise exception 'Administrator required' using errcode='42501';end if;
 perform id from public.schools where id=tenant for update;
 if p_encrypted is null then
  delete from public.jd_research_credentials where school_id=tenant;
 else
  if p_version is null or length(p_encrypted) not between 50 and 4000 then raise exception 'Invalid credential envelope' using errcode='22023';end if;
  insert into public.jd_research_credentials(school_id,encrypted_secret,credential_version,updated_by) values(tenant,p_encrypted,p_version,p_actor_id)
  on conflict(school_id) do update set encrypted_secret=excluded.encrypted_secret,credential_version=excluded.credential_version,updated_by=excluded.updated_by,updated_at=clock_timestamp();
 end if;
 insert into public.jd_audit_events(school_id,actor_id,event_type,event_json) values(tenant,p_actor_id,case when p_encrypted is null then 'research.credential_deleted' else 'research.credential_replaced' end,jsonb_build_object('provider','serpapi'));
 return jsonb_build_object('configured',p_encrypted is not null,'provider','serpapi');
end$$;
revoke all on function public.jd_store_research_secret(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.jd_store_research_secret(uuid,text,uuid) to service_role;
