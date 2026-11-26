-- Candidate only: isolated staging and independent release approval required.
-- Tenant-private definition publication is NOT hiring, execution or spending authority.
create table public.jd_agent_definitions (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id),
 current_version integer not null default 0, state text not null default 'draft'
 check(state in ('draft','testing','review_pending','reviewed','published','suspended')),
 current_evaluation uuid, review_approval uuid references public.jd_approvals(id),
 created_at timestamptz not null default clock_timestamp(), unique(id,school_id)
);
create table public.jd_agent_definition_versions (
 agent_id uuid not null, school_id uuid not null, version integer not null check(version>0),
 content jsonb not null, content_hash text not null, created_by uuid not null references auth.users(id),
 created_at timestamptz not null default clock_timestamp(), primary key(agent_id,version),
 foreign key(agent_id,school_id) references public.jd_agent_definitions(id,school_id)
);
-- Only reviewed deployment SQL can register an operational evaluator. No HTTP RPC
-- can insert/enable one. An empty allowlist is intentional, not a missing seed.
create table public.jd_agent_evaluators (
 runner_key text primary key check(runner_key ~ '^[a-f0-9]{64}$'),
 enabled boolean not null default false, release_reference text not null
);
create table public.jd_agent_evaluations (
 id uuid primary key default gen_random_uuid(), agent_id uuid not null, school_id uuid not null,
 version integer not null, content_hash text not null,
 kind text not null check(kind in ('contract','operational')), runner_key text not null,
 requested_by uuid not null references auth.users(id), started_at timestamptz not null default clock_timestamp(),
 foreign key(agent_id,version) references public.jd_agent_definition_versions(agent_id,version),
 foreign key(agent_id,school_id) references public.jd_agent_definitions(id,school_id), unique(id,agent_id)
);
create table public.jd_agent_evaluation_reports (
 evaluation_id uuid primary key references public.jd_agent_evaluations(id),
 report jsonb not null, report_hash text not null, outcome text not null check(outcome in ('passed','failed','blocked')),
 completed_at timestamptz not null default clock_timestamp()
);
alter table public.jd_agent_definitions add constraint jd_agent_current_eval_fk
 foreign key(current_evaluation,id) references public.jd_agent_evaluations(id,agent_id);
create table public.jd_agent_registry_requests (
 school_id uuid not null references public.schools(id),request_id uuid not null,
 request jsonb not null, receipt jsonb not null, primary key(school_id,request_id)
);
create index jd_agent_registry_scope on public.jd_agent_definitions(school_id,created_at desc);
create index jd_agent_evaluation_scope on public.jd_agent_evaluations(agent_id,started_at desc);

create function public.jd_agent_registry_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Agent evidence and versions are immutable' using errcode='55000';end; $$;
create trigger jd_agent_versions_immutable before update or delete on public.jd_agent_definition_versions for each row execute function public.jd_agent_registry_immutable();
create trigger jd_agent_evals_immutable before update or delete on public.jd_agent_evaluations for each row execute function public.jd_agent_registry_immutable();
create trigger jd_agent_reports_immutable before update or delete on public.jd_agent_evaluation_reports for each row execute function public.jd_agent_registry_immutable();
create trigger jd_agent_requests_immutable before update or delete on public.jd_agent_registry_requests for each row execute function public.jd_agent_registry_immutable();

do $$ declare t text;begin
 foreach t in array array['jd_agent_definitions','jd_agent_definition_versions','jd_agent_evaluators','jd_agent_evaluations','jd_agent_evaluation_reports','jd_agent_registry_requests'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
  execute format('grant select on public.%I to service_role',t);
 end loop;
end; $$;

create function public.jd_agent_registry_tenant(p_actor uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare tenant uuid;begin
 select school_id into tenant from public.profiles where id=p_actor and role in ('owner','admin') for share;
 if tenant is null then raise exception 'Administrator required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(tenant::text,171300));return tenant;
end; $$;

create function public.jd_save_agent_definition(p_actor uuid,p_request uuid,p_agent uuid,p_expected integer,p_content jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid; a public.jd_agent_definitions%rowtype; old public.jd_agent_registry_requests%rowtype; req jsonb; result jsonb; hash text;
begin
 tenant:=public.jd_agent_registry_tenant(p_actor);
 if p_request is null or p_expected is null or p_expected<0 or p_content is null or jsonb_typeof(p_content)<>'object' or octet_length(p_content::text)>60000 or p_content->>'schemaVersion' is distinct from '1' or length(coalesce(p_content->>'name','')) not between 2 and 120 then raise exception 'Invalid agent definition' using errcode='22023';end if;
 -- Strict full shape is validated by the shared service; SQL independently forbids authority fields.
 if p_content - array['schemaVersion','templateId','name','responsibility','instructions','capabilities','deliverables','limitations','model','maxSteps','timeoutSeconds','evaluationCases'] <> '{}'::jsonb or jsonb_typeof(p_content->'evaluationCases') is distinct from 'array' then raise exception 'Definition is data only' using errcode='22023';end if;
 req:=jsonb_build_array('save',p_actor,p_agent,p_expected,p_content);
 select * into old from public.jd_agent_registry_requests where school_id=tenant and request_id=p_request;
 if found then if old.request<>req then raise exception 'Request conflict' using errcode='40001';end if;return old.receipt;end if;
 if p_agent is null then
  if p_expected<>0 then raise exception 'Version conflict' using errcode='40001';end if;
  insert into public.jd_agent_definitions(school_id) values(tenant) returning * into a;
 else
  select * into a from public.jd_agent_definitions where id=p_agent and school_id=tenant for update;
  if not found then raise exception 'Agent unavailable' using errcode='42501';end if;
  if a.current_version<>p_expected then raise exception 'Version conflict' using errcode='40001';end if;
 end if;
 hash:=encode(extensions.digest(convert_to(p_content::text,'UTF8'),'sha256'),'hex');
 insert into public.jd_agent_definition_versions(agent_id,school_id,version,content,content_hash,created_by) values(a.id,tenant,a.current_version+1,p_content,hash,p_actor);
 update public.jd_agent_definitions set current_version=current_version+1,state='draft',current_evaluation=null,review_approval=null where id=a.id;
 result:=jsonb_build_object('agent_id',a.id,'version',a.current_version+1,'content_hash',hash,'state','draft','hiring_enabled',false,'execution_enabled',false,'persisted',true);
 insert into public.jd_agent_registry_requests values(tenant,p_request,req,result);
 insert into public.jd_audit_events(school_id,actor_id,event_type,event_json) values(tenant,p_actor,'agent.definition_saved',result);
 return result;
end; $$;

create function public.jd_start_agent_evaluation(p_actor uuid,p_request uuid,p_agent uuid,p_expected integer,p_kind text,p_runner text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid;a public.jd_agent_definitions%rowtype;v public.jd_agent_definition_versions%rowtype;old public.jd_agent_registry_requests%rowtype;req jsonb;result jsonb;eid uuid;
begin
 tenant:=public.jd_agent_registry_tenant(p_actor);
 if p_request is null or p_kind is null or p_kind not in ('contract','operational') or p_runner is null then raise exception 'Invalid evaluation request' using errcode='22023';end if;
 req:=jsonb_build_array('evaluate',p_actor,p_agent,p_expected,p_kind,p_runner);
 select * into old from public.jd_agent_registry_requests where school_id=tenant and request_id=p_request;
 if found then if old.request<>req then raise exception 'Request conflict' using errcode='40001';end if;return old.receipt;end if;
 select * into a from public.jd_agent_definitions where id=p_agent and school_id=tenant for update;
 if not found then raise exception 'Agent unavailable' using errcode='42501';end if;
 if p_expected is null or a.current_version<>p_expected then raise exception 'Version conflict' using errcode='40001';end if;
 if p_kind='contract' and p_runner<>'contract-v1' then raise exception 'Unknown contract runner' using errcode='22023';end if;
 select * into v from public.jd_agent_definition_versions where agent_id=a.id and version=a.current_version;
 if p_kind='operational' and (not exists(select 1 from public.jd_agent_evaluators where runner_key=p_runner and enabled) or nullif(v.content->'model'->>'provider','') is null or nullif(v.content->'model'->>'name','') is null) then raise exception 'Reviewed evaluator and pinned model required' using errcode='42501';end if;
 insert into public.jd_agent_evaluations(agent_id,school_id,version,content_hash,kind,runner_key,requested_by) values(a.id,tenant,a.current_version,v.content_hash,p_kind,p_runner,p_actor) returning id into eid;
 update public.jd_agent_definitions set state='testing',current_evaluation=eid,review_approval=null where id=a.id;
 result:=jsonb_build_object('evaluation_id',eid,'agent_id',a.id,'version',a.current_version,'content_hash',v.content_hash,'kind',p_kind,'hiring_enabled',false,'execution_enabled',false);
 insert into public.jd_agent_registry_requests values(tenant,p_request,req,result);
 insert into public.jd_audit_events(school_id,actor_id,event_type,event_json) values(tenant,p_actor,'agent.evaluation_started',result);
 return result;
end; $$;

-- Trusted evaluator completion only; NEVER dispatched from the browser/model API.
create function public.jd_finish_agent_evaluation(p_evaluation uuid,p_runner text,p_report jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.jd_agent_evaluations%rowtype;v public.jd_agent_definition_versions%rowtype;r public.jd_agent_evaluation_reports%rowtype;ids jsonb;outcome text;hash text;result jsonb;
begin
 select * into e from public.jd_agent_evaluations where id=p_evaluation;
 if not found then raise exception 'Evaluation unavailable' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(e.school_id::text,171300));
 if p_runner is distinct from e.runner_key then raise exception 'Evaluator mismatch' using errcode='42501';end if;
 if e.kind='operational' and not exists(select 1 from public.jd_agent_evaluators where runner_key=p_runner and enabled) then raise exception 'Evaluator revoked' using errcode='42501';end if;
 if p_report::text ~* '(Bearer[[:space:]]+[A-Za-z0-9._-]{16,}|sk_live_[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{16,}|BEGIN[^-]*PRIVATE KEY)' then raise exception 'Remove credentials from evaluation evidence' using errcode='22023';end if;
 if p_report is null or jsonb_typeof(p_report)<>'object' or octet_length(p_report::text)>64000 or p_report->>'kind' is distinct from e.kind or p_report->>'runner' is distinct from e.runner_key or jsonb_typeof(p_report->'cases') is distinct from 'array' or p_report-array['kind','runner','cases']<>'{}'::jsonb then raise exception 'Invalid evaluation report' using errcode='22023';end if;
 select * into r from public.jd_agent_evaluation_reports where evaluation_id=e.id;
 if found then
  if r.report<>p_report then raise exception 'Evaluation receipt conflict' using errcode='40001';end if;
  return jsonb_build_object('evaluation_id',e.id,'outcome',r.outcome,'report_hash',r.report_hash,'kind',e.kind,'hiring_enabled',false);
 end if;
 if clock_timestamp()>e.started_at+interval '1 hour' then raise exception 'Evaluation completion window expired' using errcode='40001';end if;
 select * into v from public.jd_agent_definition_versions where agent_id=e.agent_id and version=e.version;
 if e.kind='contract' then ids:='["definition_schema","evaluation_plan","authority_boundary"]'::jsonb;
 else
  if jsonb_array_length(v.content->'evaluationCases')<5 or exists(select 1 from unnest(array['task_quality','tool_security','tenant_isolation','budget','cancellation']) category where not exists(select 1 from jsonb_array_elements(v.content->'evaluationCases') c where c->>'category'=category)) then raise exception 'Evaluation coverage missing' using errcode='22023';end if;
  select jsonb_agg(c->>'id') into ids from jsonb_array_elements(v.content->'evaluationCases') c;
 end if;
 if jsonb_array_length(p_report->'cases')<>jsonb_array_length(ids) or (select count(distinct c->>'caseId') from jsonb_array_elements(p_report->'cases') c)<>jsonb_array_length(ids) or exists(select 1 from jsonb_array_elements(p_report->'cases') c where jsonb_typeof(c)<>'object' or jsonb_typeof(c->'caseId') is distinct from 'string' or jsonb_typeof(c->'status') is distinct from 'string' or jsonb_typeof(c->'observed') is distinct from 'string' or not (ids ? coalesce(c->>'caseId','')) or coalesce(c->>'status','') not in ('passed','failed','blocked') or length(coalesce(c->>'observed','')) not between 1 and 4000 or c-array['caseId','status','observed']<>'{}'::jsonb) then raise exception 'Every pinned case needs one bounded result' using errcode='22023';end if;
 outcome:=case when exists(select 1 from jsonb_array_elements(p_report->'cases') c where c->>'status'='failed') then 'failed' when exists(select 1 from jsonb_array_elements(p_report->'cases') c where c->>'status'='blocked') then 'blocked' else 'passed' end;
 hash:=encode(extensions.digest(convert_to(p_report::text,'UTF8'),'sha256'),'hex');
 insert into public.jd_agent_evaluation_reports values(e.id,p_report,hash,outcome,clock_timestamp());
 -- Old results remain evidence, but can never restore a newer version's eligibility.
 update public.jd_agent_definitions set state='draft' where id=e.agent_id and current_version=e.version and current_evaluation=e.id;
 result:=jsonb_build_object('evaluation_id',e.id,'outcome',outcome,'report_hash',hash,'kind',e.kind,'hiring_enabled',false);
 insert into public.jd_audit_events(school_id,actor_id,event_type,event_json) values(e.school_id,e.requested_by,'agent.evaluation_completed',result);
 return result;
end; $$;

create function public.jd_agent_publication(p_actor uuid,p_request uuid,p_agent uuid,p_expected integer,p_action text,p_note text,p_expected_evaluation uuid default null,p_expected_approval uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid;a public.jd_agent_definitions%rowtype;v public.jd_agent_definition_versions%rowtype;e public.jd_agent_evaluations%rowtype;r public.jd_agent_evaluation_reports%rowtype;ap public.jd_approvals%rowtype;old public.jd_agent_registry_requests%rowtype;req jsonb;result jsonb;rid uuid;aid uuid;target text;
begin
 tenant:=public.jd_agent_registry_tenant(p_actor);
 if p_request is null or p_action is null or p_action not in ('request_review','approve','reject','publish','suspend') or length(coalesce(trim(p_note),'')) not between 10 and 1000 then raise exception 'Explicit publication action and review note required' using errcode='22023';end if;
 req:=jsonb_build_array('publication',p_actor,p_agent,p_expected,p_action,p_note,p_expected_evaluation,p_expected_approval);
 select * into old from public.jd_agent_registry_requests where school_id=tenant and request_id=p_request;
 if found then if old.request<>req then raise exception 'Request conflict' using errcode='40001';end if;return old.receipt;end if;
 select * into a from public.jd_agent_definitions where id=p_agent and school_id=tenant for update;
 if not found then raise exception 'Agent unavailable' using errcode='42501';end if;
 if p_expected is null or a.current_version<>p_expected then raise exception 'Version conflict' using errcode='40001';end if;
 select * into v from public.jd_agent_definition_versions where agent_id=a.id and version=a.current_version;
 if p_action='suspend' then target:='suspended';
 else
  if a.current_evaluation is distinct from p_expected_evaluation or a.review_approval is distinct from p_expected_approval then raise exception 'Evaluation or review changed' using errcode='40001';end if;
  select * into e from public.jd_agent_evaluations where id=a.current_evaluation;
  select * into r from public.jd_agent_evaluation_reports where evaluation_id=e.id;
  if e.id is null or e.kind<>'operational' or e.version<>a.current_version or e.content_hash<>v.content_hash or r.outcome is distinct from 'passed' or r.completed_at<clock_timestamp()-interval '30 days' or not exists(select 1 from public.jd_agent_evaluators where runner_key=e.runner_key and enabled) then raise exception 'Current reviewed operational evaluation required; contract checks are insufficient' using errcode='42501';end if;
  if p_action='request_review' then
   insert into public.jd_automation_runs(school_id,requested_by,trigger_type,status,autonomy_mode,scope,request_text,idempotency_key)
   values(tenant,p_actor,'manual','awaiting_approval','assisted','agent_registry','Review tenant-private agent definition publication','agent-review:'||p_request::text) returning id into rid;
   insert into public.jd_approvals(school_id,run_id,requested_by,reason,title,action_key,risk_level,proposal_json,audience_text,execution_status)
   values(tenant,rid,p_actor,'Definition publication only; no hiring, execution, permissions or spending.','Review '||(v.content->>'name'),'agent.publication.review','medium',jsonb_build_object('agent_id',a.id,'version',a.current_version,'content_hash',v.content_hash,'evaluation_id',e.id,'report_hash',r.report_hash),'Independent owner/admin review','not_executed') returning id into aid;
   target:='review_pending';
  else
   select * into ap from public.jd_approvals where id=a.review_approval and school_id=tenant for update;
   if ap.id is null or ap.expires_at<=clock_timestamp() or ap.action_key<>'agent.publication.review' or ap.proposal_json->>'content_hash' is distinct from v.content_hash or ap.proposal_json->>'evaluation_id' is distinct from e.id::text or ap.proposal_json->>'report_hash' is distinct from r.report_hash then raise exception 'Current publication review required' using errcode='42501';end if;
   if p_action in ('approve','reject') then
    if a.state<>'review_pending' or ap.status<>'pending' or p_actor=v.created_by or p_actor=e.requested_by then raise exception 'Independent pending reviewer required' using errcode='42501';end if;
    perform public.jd_decide_approval(ap.id,p_actor,case when p_action='approve' then 'approved' else 'rejected' end,p_note);
    target:=case when p_action='approve' then 'reviewed' else 'draft' end;
   else
    if a.state<>'reviewed' or ap.status<>'approved' or ap.decided_by is null or ap.decided_by in (v.created_by,e.requested_by) or not exists(select 1 from public.profiles where id=ap.decided_by and school_id=tenant and role in ('owner','admin')) then raise exception 'Independent current approval required' using errcode='42501';end if;
    target:='published';
   end if;
  end if;
 end if;
 update public.jd_agent_definitions set state=target,review_approval=case when p_action='suspend' then null when p_action='request_review' then aid else review_approval end where id=a.id;
 result:=jsonb_build_object('agent_id',a.id,'version',a.current_version,'state',target,'approval_id',coalesce(aid,a.review_approval),'hiring_enabled',false,'execution_enabled',false,'billing_enabled',false,'publication_scope','tenant_private');
 insert into public.jd_agent_registry_requests values(tenant,p_request,req,result);
 insert into public.jd_audit_events(school_id,actor_id,event_type,event_json) values(tenant,p_actor,'agent.'||p_action,result||jsonb_build_object('note',p_note));
 return result;
end; $$;

create function public.jd_read_agent_registry(p_actor uuid,p_agent uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid;items jsonb;versions jsonb;evals jsonb;approvals jsonb;begin
 tenant:=public.jd_agent_registry_tenant(p_actor);
 if p_agent is not null and not exists(select 1 from public.jd_agent_definitions where id=p_agent and school_id=tenant) then raise exception 'Agent unavailable' using errcode='42501';end if;
 select coalesce(jsonb_agg(x),'[]') into items from (
  select a.id,a.current_version,a.state,a.current_evaluation,a.review_approval,v.content->>'name' as name,v.content_hash,
   (e.kind='operational' and e.version=a.current_version and r.outcome='passed' and r.completed_at>clock_timestamp()-interval '30 days' and exists(select 1 from public.jd_agent_evaluators where runner_key=e.runner_key and enabled)) is true as operational_evaluation_current,
   (a.state='published' and e.kind='operational' and e.version=a.current_version and e.content_hash=v.content_hash and r.outcome='passed' and r.completed_at>clock_timestamp()-interval '30 days'
    and exists(select 1 from public.jd_agent_evaluators where runner_key=e.runner_key and enabled)
    and exists(select 1 from public.jd_approvals ap join public.profiles p on p.id=ap.decided_by where ap.id=a.review_approval and ap.school_id=a.school_id and ap.status='approved' and p.school_id=a.school_id and p.role in ('owner','admin') and ap.decided_by not in (v.created_by,e.requested_by) and ap.proposal_json->>'content_hash'=v.content_hash and ap.proposal_json->>'evaluation_id'=e.id::text and ap.proposal_json->>'report_hash'=r.report_hash)) is true as publication_current
  from public.jd_agent_definitions a join public.jd_agent_definition_versions v on v.agent_id=a.id and v.version=a.current_version
  left join public.jd_agent_evaluations e on e.id=a.current_evaluation left join public.jd_agent_evaluation_reports r on r.evaluation_id=e.id
  where a.school_id=tenant and (p_agent is null or a.id=p_agent) order by a.created_at desc,a.id limit 50
 ) x;
 if p_agent is not null then
  select coalesce(jsonb_agg(x),'[]') into versions from (select version,content_hash,content,created_by,created_at from public.jd_agent_definition_versions where agent_id=p_agent and school_id=tenant order by version desc limit 10)x;
  select coalesce(jsonb_agg(x),'[]') into evals from (select e.id,e.version,e.content_hash,e.kind,e.runner_key,e.started_at,r.report,r.report_hash,r.outcome,r.completed_at from public.jd_agent_evaluations e left join public.jd_agent_evaluation_reports r on r.evaluation_id=e.id where e.agent_id=p_agent and e.school_id=tenant order by e.started_at desc limit 10)x;
  select coalesce(jsonb_agg(x),'[]') into approvals from (select ap.id,ap.status,ap.decided_by,ap.expires_at from public.jd_approvals ap join public.jd_agent_definitions a on a.review_approval=ap.id where a.id=p_agent and a.school_id=tenant)x;
 end if;
 return jsonb_build_object('agents',items,'versions',coalesce(versions,'[]'),'evaluations',coalesce(evals,'[]'),'approvals',coalesce(approvals,'[]'),'hiring_enabled',false,'execution_enabled',false,'billing_enabled',false,'publication_scope','tenant_private','agent_limit',50,'history_limit',10);
end; $$;

revoke all on function public.jd_agent_registry_immutable(),public.jd_agent_registry_tenant(uuid),public.jd_save_agent_definition(uuid,uuid,uuid,integer,jsonb),public.jd_start_agent_evaluation(uuid,uuid,uuid,integer,text,text),public.jd_finish_agent_evaluation(uuid,text,jsonb),public.jd_agent_publication(uuid,uuid,uuid,integer,text,text,uuid,uuid),public.jd_read_agent_registry(uuid,uuid) from public,anon,authenticated;
grant execute on function public.jd_save_agent_definition(uuid,uuid,uuid,integer,jsonb),public.jd_start_agent_evaluation(uuid,uuid,uuid,integer,text,text),public.jd_finish_agent_evaluation(uuid,text,jsonb),public.jd_agent_publication(uuid,uuid,uuid,integer,text,text,uuid,uuid),public.jd_read_agent_registry(uuid,uuid) to service_role;
