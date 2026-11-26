-- Candidate only: isolated staging and independent release approval required.
-- Defines per-agent execution authority: a published tenant-private definition
-- may be deployed by the JD runtime workforce engine ONLY after an independent
-- owner/admin review is approved and an explicit grant is recorded. Authority
-- is revocable at any time and never implies hiring, spending or billing.
alter table public.jd_agent_definitions
 add column execution_authorized boolean not null default false,
 add column execution_grant_approval uuid references public.jd_approvals(id);

-- Appending a new immutable definition version invalidates any execution
-- authority, mirroring how evaluation/publication eligibility is reset.
create function public.jd_agent_execution_version_reset() returns trigger language plpgsql set search_path='' as $$
begin
 if new.current_version is distinct from old.current_version then
  new.execution_authorized:=false;
  new.execution_grant_approval:=null;
 end if;
 return new;
end; $$;
create trigger jd_agent_execution_version_reset before update on public.jd_agent_definitions
 for each row execute function public.jd_agent_execution_version_reset();

-- Replaces the registry read service, adding execution-authority fields.
-- Publication and evidence semantics are unchanged.
create or replace function public.jd_read_agent_registry(p_actor uuid,p_agent uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid;items jsonb;versions jsonb;evals jsonb;approvals jsonb;execapprovals jsonb;begin
 tenant:=public.jd_agent_registry_tenant(p_actor);
 if p_agent is not null and not exists(select 1 from public.jd_agent_definitions where id=p_agent and school_id=tenant) then raise exception 'Agent unavailable' using errcode='42501';end if;
 select coalesce(jsonb_agg(x),'[]') into items from (
  select a.id,a.current_version,a.state,a.current_evaluation,a.review_approval,v.content->>'name' as name,v.content_hash,
   (e.kind='operational' and e.version=a.current_version and r.outcome='passed' and r.completed_at>clock_timestamp()-interval '30 days' and exists(select 1 from public.jd_agent_evaluators where runner_key=e.runner_key and enabled)) is true as operational_evaluation_current,
   (a.state='published' and e.kind='operational' and e.version=a.current_version and e.content_hash=v.content_hash and r.outcome='passed' and r.completed_at>clock_timestamp()-interval '30 days'
    and exists(select 1 from public.jd_agent_evaluators where runner_key=e.runner_key and enabled)
    and exists(select 1 from public.jd_approvals ap join public.profiles p on p.id=ap.decided_by where ap.id=a.review_approval and ap.school_id=a.school_id and ap.status='approved' and p.school_id=a.school_id and p.role in ('owner','admin') and ap.decided_by not in (v.created_by,e.requested_by) and ap.proposal_json->>'content_hash'=v.content_hash and ap.proposal_json->>'evaluation_id'=e.id::text and ap.proposal_json->>'report_hash'=r.report_hash)) is true as publication_current,
   a.execution_authorized is true as execution_authorized,
   ga.id as execution_approval_id,ga.status as execution_approval_status
  from public.jd_agent_definitions a join public.jd_agent_definition_versions v on v.agent_id=a.id and v.version=a.current_version
  left join public.jd_agent_evaluations e on e.id=a.current_evaluation left join public.jd_agent_evaluation_reports r on r.evaluation_id=e.id
  left join public.jd_approvals ga on ga.id=a.execution_grant_approval
  where a.school_id=tenant and (p_agent is null or a.id=p_agent) order by a.created_at desc,a.id limit 50
 ) x;
 if p_agent is not null then
  select coalesce(jsonb_agg(x),'[]') into versions from (select version,content_hash,content,created_by,created_at from public.jd_agent_definition_versions where agent_id=p_agent and school_id=tenant order by version desc limit 10)x;
  select coalesce(jsonb_agg(x),'[]') into evals from (select e.id,e.version,e.content_hash,e.kind,e.runner_key,e.started_at,r.report,r.report_hash,r.outcome,r.completed_at from public.jd_agent_evaluations e left join public.jd_agent_evaluation_reports r on r.evaluation_id=e.id where e.agent_id=p_agent and e.school_id=tenant order by e.started_at desc limit 10)x;
  select coalesce(jsonb_agg(x),'[]') into approvals from (select ap.id,ap.status,ap.decided_by,ap.expires_at from public.jd_approvals ap join public.jd_agent_definitions a on a.review_approval=ap.id where a.id=p_agent and a.school_id=tenant)x;
  select coalesce(jsonb_agg(x),'[]') into execapprovals from (select ap.id,ap.status,ap.decided_by,ap.requested_by,ap.expires_at from public.jd_approvals ap join public.jd_agent_definitions a on a.execution_grant_approval=ap.id where a.id=p_agent and a.school_id=tenant)x;
 end if;
 return jsonb_build_object('agents',items,'versions',coalesce(versions,'[]'),'evaluations',coalesce(evals,'[]'),'approvals',coalesce(approvals,'[]'),'execution_approvals',coalesce(execapprovals,'[]'),'hiring_enabled',false,'execution_enabled',false,'billing_enabled',false,'publication_scope','tenant_private','agent_limit',50,'history_limit',10);
end; $$;

-- Per-agent execution authority lifecycle. The registry service itself still
-- never executes agents; this RPC only records review/grant authority that the
-- separately release-gated JD workforce engine reads at deployment time.
create function public.jd_agent_execution(p_actor uuid,p_request uuid,p_agent uuid,p_expected integer,p_action text,p_note text,p_expected_evaluation uuid default null,p_expected_approval uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid;a public.jd_agent_definitions%rowtype;v public.jd_agent_definition_versions%rowtype;e public.jd_agent_evaluations%rowtype;r public.jd_agent_evaluation_reports%rowtype;ap public.jd_approvals%rowtype;old public.jd_agent_registry_requests%rowtype;req jsonb;result jsonb;rid uuid;aid uuid;authorized boolean;grant_approval uuid;
begin
 tenant:=public.jd_agent_registry_tenant(p_actor);
 if p_request is null or p_action is null or p_action not in ('request_grant','approve','reject','grant','revoke') or length(coalesce(trim(p_note),'')) not between 10 and 1000 then raise exception 'Explicit execution action and review note required' using errcode='22023';end if;
 req:=jsonb_build_array('execution',p_actor,p_agent,p_expected,p_action,p_note,p_expected_evaluation,p_expected_approval);
 select * into old from public.jd_agent_registry_requests where school_id=tenant and request_id=p_request;
 if found then if old.request<>req then raise exception 'Request conflict' using errcode='40001';end if;return old.receipt;end if;
 select * into a from public.jd_agent_definitions where id=p_agent and school_id=tenant for update;
 if not found then raise exception 'Agent unavailable' using errcode='42501';end if;
 if p_expected is null or a.current_version<>p_expected then raise exception 'Version conflict' using errcode='40001';end if;
 select * into v from public.jd_agent_definition_versions where agent_id=a.id and version=a.current_version;
 select * into e from public.jd_agent_evaluations where id=a.current_evaluation;
 select * into r from public.jd_agent_evaluation_reports where evaluation_id=e.id;
 if p_action<>'revoke' then
  -- The pinned publication evidence must still be current before any
  -- execution-authority request, decision or grant is accepted.
  if a.state<>'published' or e.id is null or e.kind<>'operational' or e.version<>a.current_version or e.content_hash<>v.content_hash or r.outcome is distinct from 'passed' or r.completed_at<clock_timestamp()-interval '30 days' or not exists(select 1 from public.jd_agent_evaluators where runner_key=e.runner_key and enabled) then raise exception 'Current published operational evaluation required before execution authority' using errcode='42501';end if;
 end if;
 if p_action='request_grant' then
  insert into public.jd_automation_runs(school_id,requested_by,trigger_type,status,autonomy_mode,scope,request_text,idempotency_key)
  values(tenant,p_actor,'manual','awaiting_approval','assisted','agent_registry','Review tenant agent execution authority','agent-execution:'||p_request::text) returning id into rid;
  insert into public.jd_approvals(school_id,run_id,requested_by,reason,title,action_key,risk_level,proposal_json,audience_text,execution_status)
  values(tenant,rid,p_actor,'Bounded read-only deployment authority for the JD workforce engine; no hiring, spending or tool grants beyond assigned tasks.','Review '||(v.content->>'name')||' execution authority','agent.execution.grant','high',jsonb_build_object('agent_id',a.id,'version',a.current_version,'content_hash',v.content_hash,'evaluation_id',e.id,'report_hash',r.report_hash),'Independent owner/admin review','not_executed') returning id into aid;
  authorized:=a.execution_authorized;grant_approval:=aid;
 elsif p_action in ('approve','reject') then
  select * into ap from public.jd_approvals where id=a.execution_grant_approval and school_id=tenant for update;
  if ap.id is null or ap.expires_at<=clock_timestamp() or ap.action_key<>'agent.execution.grant' or ap.status<>'pending' or ap.proposal_json->>'content_hash' is distinct from v.content_hash or ap.proposal_json->>'evaluation_id' is distinct from e.id::text or ap.proposal_json->>'report_hash' is distinct from r.report_hash then raise exception 'Current pending execution review required' using errcode='42501';end if;
  if p_actor=v.created_by or p_actor=e.requested_by or p_actor=ap.requested_by then raise exception 'Independent reviewer required' using errcode='42501';end if;
  perform public.jd_decide_approval(ap.id,p_actor,case when p_action='approve' then 'approved' else 'rejected' end,p_note);
  authorized:=a.execution_authorized;grant_approval:=a.execution_grant_approval;
 elsif p_action='grant' then
  select * into ap from public.jd_approvals where id=a.execution_grant_approval and school_id=tenant for update;
  if ap.id is null or ap.expires_at<=clock_timestamp() or ap.action_key<>'agent.execution.grant' or ap.status<>'approved' or ap.decided_by is null then raise exception 'Approved execution review required' using errcode='42501';end if;
  if ap.decided_by in (v.created_by,e.requested_by,ap.requested_by) or not exists(select 1 from public.profiles where id=ap.decided_by and school_id=tenant and role in ('owner','admin')) then raise exception 'Independent current approval required' using errcode='42501';end if;
  if ap.proposal_json->>'content_hash' is distinct from v.content_hash or ap.proposal_json->>'evaluation_id' is distinct from e.id::text or ap.proposal_json->>'report_hash' is distinct from r.report_hash then raise exception 'Approval no longer pins the current definition evidence' using errcode='42501';end if;
  authorized:=true;grant_approval:=a.execution_grant_approval;
 else
  authorized:=false;grant_approval:=null;
 end if;
 update public.jd_agent_definitions set execution_authorized=authorized,execution_grant_approval=grant_approval where id=a.id;
 result:=jsonb_build_object('agent_id',a.id,'version',a.current_version,'state',a.state,'action',p_action,'execution_authorized',authorized,'approval_id',coalesce(aid,grant_approval),'hiring_enabled',false,'execution_enabled',false,'billing_enabled',false,'publication_scope','tenant_private');
 insert into public.jd_agent_registry_requests values(tenant,p_request,req,result);
 insert into public.jd_audit_events(school_id,actor_id,event_type,event_json) values(tenant,p_actor,'agent.execution.'||p_action,result||jsonb_build_object('note',p_note));
 return result;
end; $$;

revoke all on function public.jd_read_agent_registry(uuid,uuid),public.jd_agent_execution(uuid,uuid,uuid,integer,text,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.jd_read_agent_registry(uuid,uuid),public.jd_agent_execution(uuid,uuid,uuid,integer,text,text,uuid,uuid) to service_role;
