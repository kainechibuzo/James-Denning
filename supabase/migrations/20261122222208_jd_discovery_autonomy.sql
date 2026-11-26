-- Candidate only: isolated staging and independent release approval required.
-- JD phase 7: workspace autonomy dial, the discovery agent, specialist
-- playbooks acquired from the allowlisted catalogue, and agentic-time billing
-- plumbing. Skills remain the product: capabilities are always "already there"
-- (acquisition is automatic and invisible), the customer describes the work,
-- and — when the workspace autonomy is set to autonomous — JD researches,
-- acquires what it needs and proceeds without asking. The compensating
-- controls stay: nothing is executed, provenance is immutable, tools/authority
-- are never granted by packages, and the spend ceiling is a hard stop even in
-- autonomous mode. Charging itself remains behind the platform release flag.
create table public.jd_workspace_autonomy (
 school_id uuid primary key references public.schools(id) on delete restrict,
 mode text not null default 'assisted' check(mode in ('assisted','autonomous')),
 spend_ceiling_seconds integer not null default 3600 check(spend_ceiling_seconds between 60 and 86400),
 agentic_rate_minor_per_hour bigint not null default 10000 check(agentic_rate_minor_per_hour between 100 and 100000000),
 currency text not null default 'USD' check(currency='USD'),
 updated_by uuid not null references auth.users(id),
 updated_at timestamptz not null default clock_timestamp()
);
create table public.jd_agent_playbooks (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id),
 role text not null check(role in ('business_advisor','research_analyst','finance_analyst','operations_planner','product_designer','software_engineer','security_reviewer','quality_assurance')),
 skill_id uuid not null, version integer not null check(version>0),
 bound_by uuid not null references auth.users(id), created_at timestamptz not null default clock_timestamp(),
 unique(school_id,role,skill_id,version),
 foreign key(skill_id,version) references public.jd_skill_versions(skill_id,version)
);
create table public.jd_discovery_sessions (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id),
 requested_by uuid not null references auth.users(id),
 idea text not null check(length(idea) between 10 and 4000),
 status text not null default 'proposed' check(status in ('proposed','approved','proceeding','completed','declined')),
 plan jsonb not null, receipt jsonb not null default '{}'::jsonb,
 decided_by uuid references auth.users(id), decision_note text,
 created_at timestamptz not null default clock_timestamp(), completed_at timestamptz
);
create index jd_agent_playbooks_scope on public.jd_agent_playbooks(school_id,role);
create index jd_discovery_sessions_scope on public.jd_discovery_sessions(school_id,created_at desc);

-- Discovery plans and sessions are append-only evidence once proposed.
create function public.jd_discovery_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Discovery sessions are immutable evidence; start a new session instead' using errcode='55000';end; $$;
create trigger jd_discovery_sessions_immutable before delete on public.jd_discovery_sessions for each row execute function public.jd_discovery_immutable();

do $$ declare t text;begin
 foreach t in array array['jd_workspace_autonomy','jd_agent_playbooks','jd_discovery_sessions'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
  execute format('grant select,insert,update,delete on public.%I to service_role',t);
 end loop;
end; $$;

-- Read the workspace autonomy dial (any workspace member).
create function public.jd_read_workspace_autonomy(p_actor uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid;row public.jd_workspace_autonomy%rowtype;
begin
 tenant:=public.jd_skills_tenant(p_actor);
 select * into row from public.jd_workspace_autonomy where school_id=tenant;
 return jsonb_build_object('mode',coalesce(row.mode,'assisted'),
  'spend_ceiling_seconds',coalesce(row.spend_ceiling_seconds,3600),
  'agentic_rate_minor_per_hour',coalesce(row.agentic_rate_minor_per_hour,10000),
  'currency',coalesce(row.currency,'USD'),
  'defaults_applied',row.school_id is null,
  'hiring_enabled',false,'execution_enabled',false,'billing_enabled',false);
end; $$;

-- Set the autonomy dial: administrator only, explicit confirmation, audited.
-- Autonomous mode removes the per-run prompts; it never removes the ceiling,
-- the audit trail or the immutable metering.
create function public.jd_set_workspace_autonomy(p_actor uuid,p_request uuid,p_mode text,p_ceiling_seconds integer,p_rate_minor_per_hour bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid;old public.jd_skill_requests%rowtype;req jsonb;result jsonb;
begin
 tenant:=public.jd_skills_tenant(p_actor);
 perform public.jd_skills_assert_admin(p_actor,tenant);
 if p_mode not in ('assisted','autonomous') or p_ceiling_seconds is null or p_ceiling_seconds not between 60 and 86400
    or p_rate_minor_per_hour is null or p_rate_minor_per_hour not between 100 and 100000000 then
  raise exception 'Autonomy mode, bounded spend ceiling and rate are required' using errcode='22023';
 end if;
 req:=jsonb_build_array('autonomy.set',p_actor,p_mode,p_ceiling_seconds,p_rate_minor_per_hour);
 select * into old from public.jd_skill_requests where school_id=tenant and request_id=p_request;
 if found then if old.request<>req then raise exception 'Request conflict' using errcode='40001';end if;return old.receipt;end if;
 insert into public.jd_workspace_autonomy(school_id,mode,spend_ceiling_seconds,agentic_rate_minor_per_hour,currency,updated_by,updated_at)
  values(tenant,p_mode,p_ceiling_seconds,p_rate_minor_per_hour,'USD',p_actor,clock_timestamp())
  on conflict(school_id) do update set mode=excluded.mode,spend_ceiling_seconds=excluded.spend_ceiling_seconds,
   agentic_rate_minor_per_hour=excluded.agentic_rate_minor_per_hour,updated_by=excluded.updated_by,updated_at=clock_timestamp();
 result:=jsonb_build_object('mode',p_mode,'spend_ceiling_seconds',p_ceiling_seconds,
  'agentic_rate_minor_per_hour',p_rate_minor_per_hour,'currency','USD','hiring_enabled',false,'execution_enabled',false,'billing_enabled',false);
 insert into public.jd_skill_requests values(tenant,p_request,req,result);
 insert into public.jd_audit_events(school_id,actor_id,event_type,event_json) values(tenant,p_actor,'autonomy.mode_set',result);
 return result;
end; $$;

-- Start a discovery session: the service computed the plan; the database
-- validates its shape, records it immutably and — in assisted mode — holds it
-- as a proposal awaiting an administrator decision.
create function public.jd_start_discovery(p_actor uuid,p_request uuid,p_idea text,p_plan jsonb,p_mode text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid;old public.jd_skill_requests%rowtype;req jsonb;result jsonb;sid uuid;autonomy_row public.jd_workspace_autonomy%rowtype;
 skill_item jsonb;entry jsonb;
begin
 tenant:=public.jd_skills_tenant(p_actor);
 select * into autonomy_row from public.jd_workspace_autonomy where school_id=tenant;
 if p_mode is distinct from coalesce(autonomy_row.mode,'assisted') then
  raise exception 'Discovery must run in the workspace autonomy mode' using errcode='22023';
 end if;
 if p_idea is null or length(coalesce(trim(p_idea),''))<10 or length(p_idea)>4000
    or p_plan is null or jsonb_typeof(p_plan)<>'object'
    or length(coalesce(p_plan->>'objective',''))<10
    or not (jsonb_typeof(p_plan->'skills')='array' and jsonb_array_length(p_plan->'skills') between 0 and 6)
    or not (jsonb_typeof(p_plan->'roles')='array' and jsonb_array_length(p_plan->'roles') between 1 and 4)
    or coalesce((p_plan->>'estimated_seconds')::int,0) not between 60 and 86400 then
  raise exception 'A bounded idea and a valid discovery plan are required' using errcode='22023';
 end if;
 for skill_item in select * from jsonb_array_elements(p_plan->'skills') loop
  if skill_item->>'id' !~ '^[a-z0-9][a-z0-9-]{1,60}$' or coalesce((skill_item->>'expected_seconds')::int,0) not between 60 and 86400 then
   raise exception 'Discovery plan skill entries are invalid' using errcode='22023';
  end if;
 end loop;
 for entry in select * from jsonb_array_elements(p_plan->'roles') loop
  if entry#>>'{}' not in ('business_advisor','research_analyst','finance_analyst','operations_planner','product_designer','software_engineer','security_reviewer','quality_assurance') then
   raise exception 'Discovery plan roles must be known specialist roles' using errcode='22023';
  end if;
 end loop;
 req:=jsonb_build_array('discovery.start',p_actor,p_idea,p_plan,p_mode);
 select * into old from public.jd_skill_requests where school_id=tenant and request_id=p_request;
 if found then if old.request<>req then raise exception 'Request conflict' using errcode='40001';end if;return old.receipt;end if;
 insert into public.jd_discovery_sessions(school_id,requested_by,idea,status,plan)
  values(tenant,p_actor,trim(p_idea),case when p_mode='autonomous' then 'proceeding' else 'proposed' end,p_plan)
  returning id into sid;
 result:=jsonb_build_object('session_id',sid,'status',case when p_mode='autonomous' then 'proceeding' else 'proposed' end,
  'mode',p_mode,'estimated_seconds',p_plan->>'estimated_seconds','hiring_enabled',false,'execution_enabled',false,'billing_enabled',false);
 insert into public.jd_skill_requests values(tenant,p_request,req,result);
 insert into public.jd_audit_events(school_id,actor_id,event_type,event_json) values(tenant,p_actor,'discovery.started',result||jsonb_build_object('idea',left(p_idea,200)));
 return result;
end; $$;

-- Administrator decision on an assisted proposal. The decider must differ
-- from the requester (independent review of the spend intent).
create function public.jd_decide_discovery(p_actor uuid,p_request uuid,p_session uuid,p_decision text,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid;s public.jd_discovery_sessions%rowtype;old public.jd_skill_requests%rowtype;req jsonb;result jsonb;
begin
 tenant:=public.jd_skills_tenant(p_actor);
 perform public.jd_skills_assert_admin(p_actor,tenant);
 if p_decision not in ('approve','decline') or p_note is null or length(coalesce(trim(p_note),''))<10
    or length(coalesce(trim(p_note),''))>1000 then
  raise exception 'An explicit decision and a review note are required' using errcode='22023';
 end if;
 req:=jsonb_build_array('discovery.decide',p_actor,p_session,p_decision,p_note);
 select * into old from public.jd_skill_requests where school_id=tenant and request_id=p_request;
 if found then if old.request<>req then raise exception 'Request conflict' using errcode='40001';end if;return old.receipt;end if;
 select * into s from public.jd_discovery_sessions where id=p_session and school_id=tenant for update;
 if not found then raise exception 'Discovery session unavailable' using errcode='42501';end if;
 if s.status<>'proposed' then raise exception 'Only a pending proposal can be decided' using errcode='40001';end if;
 if p_actor=s.requested_by then raise exception 'A proposal needs an independent administrator decision' using errcode='42501';end if;
 update public.jd_discovery_sessions set status=case when p_decision='approve' then 'approved' else 'declined' end,
  decided_by=p_actor,decision_note=left(trim(p_note),1000),completed_at=case when p_decision='approve' then null else clock_timestamp() end
  where id=s.id;
 result:=jsonb_build_object('session_id',s.id,'status',case when p_decision='approve' then 'approved' else 'declined' end,
  'hiring_enabled',false,'execution_enabled',false,'billing_enabled',false);
 insert into public.jd_skill_requests values(tenant,p_request,req,result);
 insert into public.jd_audit_events(school_id,actor_id,event_type,event_json) values(tenant,p_actor,'discovery.'||p_decision,result||jsonb_build_object('note',p_note));
 return result;
end; $$;

-- Record the completion of a discovery session with its acquisition receipt.
create function public.jd_complete_discovery(p_actor uuid,p_request uuid,p_session uuid,p_receipt jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid;s public.jd_discovery_sessions%rowtype;old public.jd_skill_requests%rowtype;req jsonb;result jsonb;
begin
 tenant:=public.jd_skills_tenant(p_actor);
 perform public.jd_skills_assert_admin(p_actor,tenant);
 if p_receipt is null or jsonb_typeof(p_receipt)<>'object' or octet_length(p_receipt::text)>64000 then
  raise exception 'A bounded discovery receipt is required' using errcode='22023';
 end if;
 req:=jsonb_build_array('discovery.complete',p_actor,p_session,p_receipt);
 select * into old from public.jd_skill_requests where school_id=tenant and request_id=p_request;
 if found then if old.request<>req then raise exception 'Request conflict' using errcode='40001';end if;return old.receipt;end if;
 select * into s from public.jd_discovery_sessions where id=p_session and school_id=tenant for update;
 if not found then raise exception 'Discovery session unavailable' using errcode='42501';end if;
 if s.status not in ('proceeding','approved') then raise exception 'Only an approved or proceeding session can complete' using errcode='40001';end if;
 update public.jd_discovery_sessions set status='completed',receipt=p_receipt,completed_at=clock_timestamp() where id=s.id;
 result:=jsonb_build_object('session_id',s.id,'status','completed','receipt',p_receipt,'hiring_enabled',false,'execution_enabled',false,'billing_enabled',false);
 insert into public.jd_skill_requests values(tenant,p_request,req,result);
 insert into public.jd_audit_events(school_id,actor_id,event_type,event_json) values(tenant,p_actor,'discovery.completed',result);
 return result;
end; $$;

-- Bind an acquired, published skill as a specialist playbook. Instruction
-- text only: a playbook never grants tools or authority; assignments still
-- flow through the existing workforce allowlists.
create function public.jd_bind_agent_playbook(p_actor uuid,p_request uuid,p_role text,p_skill uuid,p_expected_version integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid;old public.jd_skill_requests%rowtype;req jsonb;result jsonb;
begin
 tenant:=public.jd_skills_tenant(p_actor);
 perform public.jd_skills_assert_admin(p_actor,tenant);
 if p_role not in ('business_advisor','research_analyst','finance_analyst','operations_planner','product_designer','software_engineer','security_reviewer','quality_assurance')
    or p_expected_version is null or p_expected_version<1 then
  raise exception 'A specialist role and expected version are required' using errcode='22023';
 end if;
 req:=jsonb_build_array('playbook.bind',p_actor,p_role,p_skill,p_expected_version);
 select * into old from public.jd_skill_requests where school_id=tenant and request_id=p_request;
 if found then if old.request<>req then raise exception 'Request conflict' using errcode='40001';end if;return old.receipt;end if;
 if not exists(select 1 from public.jd_skills where id=p_skill and school_id=tenant and status='published' and current_version=p_expected_version) then
  raise exception 'The playbook skill must be published and current' using errcode='42501';
 end if;
 insert into public.jd_agent_playbooks(school_id,role,skill_id,version,bound_by) values(tenant,p_role,p_skill,p_expected_version,p_actor)
  on conflict(school_id,role,skill_id,version) do nothing;
 result:=jsonb_build_object('role',p_role,'skill_id',p_skill,'version',p_expected_version,'bound',true,
  'hiring_enabled',false,'execution_enabled',false,'billing_enabled',false);
 insert into public.jd_skill_requests values(tenant,p_request,req,result);
 insert into public.jd_audit_events(school_id,actor_id,event_type,event_json) values(tenant,p_actor,'playbook.bound',result);
 return result;
end; $$;

-- Autonomous cost preauthorization: only in autonomous mode, only within the
-- recorded spend ceiling. This is the standing authorisation the customer gave
-- when they chose autonomous mode and set the ceiling at card-dump time; it
-- replaces the per-run prompt without removing the audit trail.
create function public.jd_autonomous_cost_authorize(p_actor uuid,p_request uuid,p_run uuid,p_skill uuid,p_expected_version integer,p_estimated_seconds integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid;a public.jd_workspace_autonomy%rowtype;old public.jd_skill_requests%rowtype;req jsonb;result jsonb;committed integer;
begin
 tenant:=public.jd_skills_tenant(p_actor);
 if not exists(select 1 from public.profiles where id=p_actor and school_id=tenant for share) then
  raise exception 'Workspace member required' using errcode='42501';
 end if;
 select * into a from public.jd_workspace_autonomy where school_id=tenant;
 if coalesce(a.mode,'assisted')<>'autonomous' then
  raise exception 'Autonomous cost authorisation requires autonomous mode' using errcode='42501';
 end if;
 if p_run is null or p_skill is null or p_expected_version is null or p_expected_version<1
    or p_estimated_seconds is null or p_estimated_seconds not between 30 and 86400 then
  raise exception 'Run, skill, version and a bounded estimate are required' using errcode='22023';
 end if;
 req:=jsonb_build_array('autonomy.cost.authorize',p_actor,p_run,p_skill,p_expected_version,p_estimated_seconds);
 select * into old from public.jd_skill_requests where school_id=tenant and request_id=p_request;
 if found then if old.request<>req then raise exception 'Request conflict' using errcode='40001';end if;return old.receipt;end if;
 if not exists(select 1 from public.jd_skill_acquisitions where school_id=tenant and skill_id=p_skill and version=p_expected_version) then
  raise exception 'Cost authorisation applies only to autonomously acquired skill versions' using errcode='22023';
 end if;
 if not exists(select 1 from public.jd_skills where id=p_skill and school_id=tenant and status='published' and current_version=p_expected_version) then
  raise exception 'The skill version is not published and current' using errcode='42501';
 end if;
 select coalesce(sum(estimated_seconds),0) into committed from public.jd_agent_time_ledger
  where school_id=tenant and status='confirmed';
 if committed+p_estimated_seconds>a.spend_ceiling_seconds then
  raise exception 'Spend ceiling reached; work stops and the workspace is notified' using errcode='54000';
 end if;
 insert into public.jd_agent_time_ledger(school_id,run_id,skill_id,version,estimated_seconds,basis,status,confirmed_by)
  values(tenant,p_run,p_skill,p_expected_version,p_estimated_seconds,'autonomous_preauthorized','confirmed',p_actor);
 result:=jsonb_build_object('run_id',p_run,'skill_id',p_skill,'version',p_expected_version,'estimated_seconds',p_estimated_seconds,
  'status','confirmed','basis','autonomous_preauthorized','ceiling_seconds',a.spend_ceiling_seconds,'committed_seconds',committed+p_estimated_seconds,
  'rate_basis','agentic_seconds','pricing','computed_at_settlement','hiring_enabled',false,'execution_enabled',false,'billing_enabled',false);
 insert into public.jd_skill_requests values(tenant,p_request,req,result);
 insert into public.jd_audit_events(school_id,actor_id,event_type,event_json) values(tenant,p_actor,'autonomy.cost_authorized',result);
 return result;
end; $$;

-- Agentic-time billing summary: actual measured work seconds, confirmed
-- estimates, ceiling headroom and the computed amount at the workspace rate.
create function public.jd_read_billing_summary(p_actor uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid;a public.jd_workspace_autonomy%rowtype;tally record;
begin
 tenant:=public.jd_skills_tenant(p_actor);
 select * into a from public.jd_workspace_autonomy where school_id=tenant;
 select
  coalesce(sum(actual_seconds) filter (where status='completed'),0) as actual_seconds,
  coalesce(sum(estimated_seconds) filter (where status='confirmed'),0) as confirmed_estimate_seconds,
  count(*)::int as ledger_rows
  into tally from public.jd_agent_time_ledger where school_id=tenant;
 return jsonb_build_object('mode',coalesce(a.mode,'assisted'),
  'spend_ceiling_seconds',coalesce(a.spend_ceiling_seconds,3600),
  'agentic_rate_minor_per_hour',coalesce(a.agentic_rate_minor_per_hour,10000),
  'currency',coalesce(a.currency,'USD'),
  'actual_seconds',tally.actual_seconds,
  'confirmed_estimate_seconds',tally.confirmed_estimate_seconds,
  'ledger_rows',tally.ledger_rows,
  'amount_minor_actual',round(tally.actual_seconds*coalesce(a.agentic_rate_minor_per_hour,10000)/3600.0)::bigint,
  'charging_enabled',false,'pricing_policy','agentic-seconds-v1',
  'hiring_enabled',false,'execution_enabled',false,'billing_enabled',false);
end; $$;

-- The assisted per-run confirmation from phase 6 gains independence: the
-- confirming member must differ from nothing (unchanged), and the ceiling now
-- also bounds manual confirmations.
create or replace function public.jd_confirm_run_skill_cost(p_actor uuid,p_request uuid,p_run uuid,p_skill uuid,p_expected_version integer,p_estimated_seconds integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid;a public.jd_workspace_autonomy%rowtype;old public.jd_skill_requests%rowtype;req jsonb;result jsonb;run record;committed integer;
begin
 tenant:=public.jd_skills_tenant(p_actor);
 if not exists(select 1 from public.profiles where id=p_actor and school_id=tenant for share) then
  raise exception 'Workspace member required' using errcode='42501';
 end if;
 select * into a from public.jd_workspace_autonomy where school_id=tenant;
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
 select coalesce(sum(estimated_seconds),0) into committed from public.jd_agent_time_ledger
  where school_id=tenant and status='confirmed';
 if committed+p_estimated_seconds>coalesce(a.spend_ceiling_seconds,3600) then
  raise exception 'Spend ceiling reached; work stops and the workspace is notified' using errcode='54000';
 end if;
 insert into public.jd_agent_time_ledger(school_id,run_id,skill_id,version,estimated_seconds,basis,status,confirmed_by)
  values(tenant,p_run,p_skill,p_expected_version,p_estimated_seconds,'source_index_estimate','confirmed',p_actor);
 result:=jsonb_build_object('run_id',p_run,'skill_id',p_skill,'version',p_expected_version,'estimated_seconds',p_estimated_seconds,
  'status','confirmed','rate_basis','agentic_seconds','pricing','computed_at_settlement',
  'hiring_enabled',false,'execution_enabled',false,'billing_enabled',false);
 insert into public.jd_skill_requests values(tenant,p_request,req,result);
 insert into public.jd_audit_events(school_id,actor_id,event_type,event_json) values(tenant,p_actor,'skills.run_cost_confirmed',result);
 return result;
end; $$;

revoke all on function public.jd_read_workspace_autonomy(uuid),public.jd_set_workspace_autonomy(uuid,uuid,text,integer,bigint),public.jd_start_discovery(uuid,uuid,text,jsonb,text),public.jd_decide_discovery(uuid,uuid,uuid,text,text),public.jd_complete_discovery(uuid,uuid,uuid,jsonb),public.jd_bind_agent_playbook(uuid,uuid,text,uuid,integer),public.jd_autonomous_cost_authorize(uuid,uuid,uuid,uuid,integer,integer),public.jd_read_billing_summary(uuid),public.jd_discovery_immutable() from public,anon,authenticated;
grant execute on function public.jd_read_workspace_autonomy(uuid),public.jd_set_workspace_autonomy(uuid,uuid,text,integer,bigint),public.jd_start_discovery(uuid,uuid,text,jsonb,text),public.jd_decide_discovery(uuid,uuid,uuid,text,text),public.jd_complete_discovery(uuid,uuid,uuid,jsonb),public.jd_bind_agent_playbook(uuid,uuid,text,uuid,integer),public.jd_autonomous_cost_authorize(uuid,uuid,uuid,uuid,integer,integer),public.jd_read_billing_summary(uuid) to service_role;
