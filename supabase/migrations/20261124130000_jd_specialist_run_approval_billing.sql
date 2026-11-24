-- Specialist-agent approval, quote, time budget and settlement.
-- Additive and service-role-only. This does not enable payment collection.
create table public.jd_specialist_run_proposals (
 id uuid primary key default gen_random_uuid(),
 school_id uuid not null references public.schools(id) on delete restrict,
 request_id uuid not null,
 requested_by uuid not null references auth.users(id),
 run_id uuid references public.jd_automation_runs(id) on delete restrict,
 specialist_role text not null check (specialist_role in ('business_advisor','research_analyst','finance_analyst','operations_planner','product_designer','software_engineer','security_reviewer','quality_assurance')),
 task text not null check (length(trim(task)) between 20 and 5000),
 allocated_seconds integer not null check (allocated_seconds between 60 and 86400),
 spend_cap_seconds integer not null check (spend_cap_seconds between 60 and 86400),
 rate_minor_per_hour bigint not null check (rate_minor_per_hour between 100 and 100000000),
 estimated_amount_minor bigint not null check (estimated_amount_minor >= 0),
 currency text not null default 'USD' check(currency='USD'),
 subscription_status text not null check(subscription_status in ('trialing','active')),
 status text not null default 'awaiting_approval' check(status in ('awaiting_approval','approved','linked','running','completed','timed_out','failed','declined','expired')),
 approved_by uuid references auth.users(id),
 approved_at timestamptz,
 tool_call_id text,
 started_at timestamptz,
 completed_at timestamptz,
 actual_seconds integer check(actual_seconds is null or actual_seconds between 0 and 86400),
 actual_amount_minor bigint check(actual_amount_minor is null or actual_amount_minor>=0),
 outcome text,
 expires_at timestamptz not null default (clock_timestamp()+interval '30 minutes'),
 created_at timestamptz not null default clock_timestamp(),
 unique(school_id,request_id),
 unique(run_id)
);
create index jd_specialist_run_proposals_scope on public.jd_specialist_run_proposals(school_id,created_at desc);
alter table public.jd_specialist_run_proposals enable row level security;
revoke all on public.jd_specialist_run_proposals from public,anon,authenticated,service_role;
grant select,insert,update on public.jd_specialist_run_proposals to service_role;

create function public.jd_specialist_proposal_create(p_actor uuid,p_request uuid,p_role text,p_task text,p_seconds integer,p_spend_cap_seconds integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid;a public.jd_workspace_autonomy%rowtype;s public.jd_billing_subscriptions%rowtype;old public.jd_specialist_run_proposals%rowtype;rate bigint;amount bigint;result jsonb;committed integer;
begin
 tenant:=public.jd_skills_tenant(p_actor);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(tenant::text,0));
 if not exists(select 1 from public.profiles where id=p_actor and school_id=tenant and role in ('owner','admin','manager')) then raise exception 'Workspace member required' using errcode='42501';end if;
 if p_role not in ('business_advisor','research_analyst','finance_analyst','operations_planner','product_designer','software_engineer','security_reviewer','quality_assurance')
 or p_task is null or length(trim(p_task)) not between 20 and 5000 or p_seconds not between 60 and 86400
 or p_spend_cap_seconds not between 60 and 86400 or p_seconds>p_spend_cap_seconds then raise exception 'Invalid specialist quote inputs' using errcode='22023';end if;
 select * into old from public.jd_specialist_run_proposals where school_id=tenant and request_id=p_request;
 if found then
  if old.specialist_role<>p_role or old.task<>p_task or old.allocated_seconds<>p_seconds or old.spend_cap_seconds<>p_spend_cap_seconds then raise exception 'Request conflict' using errcode='40001';end if;
  return jsonb_build_object('proposal_id',old.id,'status',old.status,'role',old.specialist_role,'allocated_seconds',old.allocated_seconds,'spend_cap_seconds',old.spend_cap_seconds,'rate_minor_per_hour',old.rate_minor_per_hour,'estimated_amount_minor',old.estimated_amount_minor,'currency',old.currency,'subscription_status',old.subscription_status,'expires_at',old.expires_at,'charging_enabled',false,'hiring_enabled',false,'execution_enabled',false,'billing_enabled',false);
 end if;
 select * into s from public.jd_billing_subscriptions where school_id=tenant;
 if s.id is null or s.status not in ('trialing','active') or (s.status='trialing' and (s.trial_ends_at is null or s.trial_ends_at<=clock_timestamp())) or (s.status='active' and s.current_period_end is not null and s.current_period_end<=clock_timestamp()) then raise exception 'An active subscription or valid trial is required for specialist execution' using errcode='42501';end if;
 select * into a from public.jd_workspace_autonomy where school_id=tenant;
 rate:=coalesce(a.agentic_rate_minor_per_hour,10000);
 if p_spend_cap_seconds>coalesce(a.spend_ceiling_seconds,3600) then raise exception 'The requested time cap exceeds the workspace ceiling' using errcode='54000';end if;
 select coalesce(sum(allocated_seconds),0)::integer into committed from public.jd_specialist_run_proposals
 where school_id=tenant and status in ('approved','linked','running') and expires_at>clock_timestamp();
 if committed+p_seconds>coalesce(a.spend_ceiling_seconds,3600) then raise exception 'Workspace agent-time ceiling reached' using errcode='54000';end if;
 amount:=round(p_seconds*rate/3600.0)::bigint;
 insert into public.jd_specialist_run_proposals(school_id,request_id,requested_by,specialist_role,task,allocated_seconds,spend_cap_seconds,rate_minor_per_hour,estimated_amount_minor,subscription_status)
 values(tenant,p_request,p_actor,p_role,trim(p_task),p_seconds,p_spend_cap_seconds,rate,amount,s.status)
 returning * into old;
 result:=jsonb_build_object('proposal_id',old.id,'status',old.status,'role',old.specialist_role,'allocated_seconds',old.allocated_seconds,'spend_cap_seconds',old.spend_cap_seconds,'rate_minor_per_hour',old.rate_minor_per_hour,'estimated_amount_minor',old.estimated_amount_minor,'currency',old.currency,'subscription_status',old.subscription_status,'expires_at',old.expires_at,'charging_enabled',false,'hiring_enabled',false,'execution_enabled',false,'billing_enabled',false);
 insert into public.jd_audit_events(school_id,actor_id,event_type,event_json) values(tenant,p_actor,'agent.specialist.proposed',result);
 return result;
end; $$;

create function public.jd_specialist_proposal_approve(p_actor uuid,p_request uuid,p_proposal uuid,p_decision text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid;p public.jd_specialist_run_proposals%rowtype;s public.jd_billing_subscriptions%rowtype;old public.jd_skill_requests%rowtype;req jsonb;result jsonb;ceiling_value integer;committed integer;
begin
 tenant:=public.jd_skills_tenant(p_actor);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(tenant::text,0));
 if not exists(select 1 from public.profiles where id=p_actor and school_id=tenant and role in ('owner','admin')) then raise exception 'Workspace administrator required to approve agent spend' using errcode='42501';end if;
 if p_decision not in ('approve','decline') then raise exception 'Explicit decision required' using errcode='22023';end if;
 req:=jsonb_build_array('agent.specialist.decision',p_actor,p_proposal,p_decision);
 select * into old from public.jd_skill_requests where school_id=tenant and request_id=p_request;
 if found then if old.request<>req then raise exception 'Request conflict' using errcode='40001';end if;return old.receipt;end if;
 select * into p from public.jd_specialist_run_proposals where id=p_proposal and school_id=tenant for update;
 if not found or p.status<>'awaiting_approval' or p.expires_at<=clock_timestamp() then raise exception 'Pending, unexpired proposal required' using errcode='40001';end if;
 if p.requested_by<>p_actor then raise exception 'Only the requesting owner/admin can confirm this specialist run' using errcode='42501';end if;
 if p_decision='approve' then
  select * into s from public.jd_billing_subscriptions where school_id=tenant;
  if s.id is null or s.status not in ('trialing','active') or (s.status='trialing' and (s.trial_ends_at is null or s.trial_ends_at<=clock_timestamp())) or (s.status='active' and s.current_period_end is not null and s.current_period_end<=clock_timestamp()) then raise exception 'Subscription is no longer eligible for specialist execution' using errcode='42501';end if;
  select coalesce(spend_ceiling_seconds,3600) into ceiling_value from public.jd_workspace_autonomy where school_id=tenant;
  if ceiling_value is null then ceiling_value:=3600;end if;
  select coalesce(sum(allocated_seconds),0)::integer into committed from public.jd_specialist_run_proposals where school_id=tenant and id<>p.id and status in ('approved','linked','running') and expires_at>clock_timestamp();
  if committed+p.allocated_seconds>ceiling_value then raise exception 'Workspace agent-time ceiling reached before approval' using errcode='54000';end if;
 end if;
 update public.jd_specialist_run_proposals set status=case when p_decision='approve' then 'approved' else 'declined' end,approved_by=case when p_decision='approve' then p_actor else null end,approved_at=case when p_decision='approve' then clock_timestamp() else null end where id=p.id returning * into p;
 result:=jsonb_build_object('proposal_id',p.id,'status',p.status,'role',p.specialist_role,'allocated_seconds',p.allocated_seconds,'spend_cap_seconds',p.spend_cap_seconds,'estimated_amount_minor',p.estimated_amount_minor,'currency',p.currency,'charging_enabled',false,'hiring_enabled',false,'execution_enabled',false,'billing_enabled',false);
 insert into public.jd_skill_requests values(tenant,p_request,req,result);
 insert into public.jd_audit_events(school_id,actor_id,event_type,event_json) values(tenant,p_actor,'agent.specialist.'||p_decision,result);
 return result;
end; $$;

create function public.jd_specialist_proposal_link_run(p_actor uuid,p_request uuid,p_proposal uuid,p_run uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid;p public.jd_specialist_run_proposals%rowtype;r public.jd_automation_runs%rowtype;old public.jd_skill_requests%rowtype;req jsonb;result jsonb;
begin
 tenant:=public.jd_skills_tenant(p_actor);
 req:=jsonb_build_array('agent.specialist.link',p_actor,p_proposal,p_run);
 select * into old from public.jd_skill_requests where school_id=tenant and request_id=p_request;
 if found then if old.request<>req then raise exception 'Request conflict' using errcode='40001';end if;return old.receipt;end if;
 select * into p from public.jd_specialist_run_proposals where id=p_proposal and school_id=tenant for update;
 select * into r from public.jd_automation_runs where id=p_run and school_id=tenant for update;
 if p.id is null or p.status<>'approved' or p.expires_at<=clock_timestamp() or r.id is null or r.requested_by<>p_actor or r.status not in ('queued','planning') then raise exception 'Approved proposal and queued run required' using errcode='42501';end if;
 update public.jd_specialist_run_proposals set run_id=p_run,status='linked' where id=p.id returning * into p;
 result:=jsonb_build_object('proposal_id',p.id,'run_id',p_run,'status',p.status,'role',p.specialist_role,'allocated_seconds',p.allocated_seconds,'spend_cap_seconds',p.spend_cap_seconds,'charging_enabled',false,'hiring_enabled',false,'execution_enabled',false,'billing_enabled',false);
 insert into public.jd_skill_requests values(tenant,p_request,req,result);
 insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json) values(tenant,p_actor,p_run,'agent.specialist.linked',result);
 return result;
end; $$;

create function public.jd_specialist_run_start(p_actor uuid,p_run uuid,p_role text,p_call_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid;p public.jd_specialist_run_proposals%rowtype;s public.jd_billing_subscriptions%rowtype;a public.jd_workspace_autonomy%rowtype;ceiling_value integer;committed integer;
begin
 tenant:=public.jd_skills_tenant(p_actor);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(tenant::text,0));
 select * into p from public.jd_specialist_run_proposals where run_id=p_run and school_id=tenant for update;
 if not found or p.status not in ('linked','running') or (p.status<>'running' and p.expires_at<=clock_timestamp()) or p.specialist_role<>p_role or p.requested_by<>p_actor or p_call_id is null or length(p_call_id) not between 1 and 100 then raise exception 'A linked, approved specialist proposal for this role is required' using errcode='42501';end if;
 select * into s from public.jd_billing_subscriptions where school_id=tenant;
 if s.id is null or s.status not in ('trialing','active') or (s.status='trialing' and (s.trial_ends_at is null or s.trial_ends_at<=clock_timestamp())) or (s.status='active' and s.current_period_end is not null and s.current_period_end<=clock_timestamp()) then raise exception 'Subscription is not eligible for specialist execution' using errcode='42501';end if;
 select * into a from public.jd_workspace_autonomy where school_id=tenant;
 if p.status='running' and p.tool_call_id=p_call_id then
  return jsonb_build_object('proposal_id',p.id,'role',p.specialist_role,'allocated_seconds',p.allocated_seconds,'spend_cap_seconds',p.spend_cap_seconds,'rate_minor_per_hour',p.rate_minor_per_hour,'currency',p.currency,'started_at',p.started_at,'charging_enabled',false,'hiring_enabled',false,'execution_enabled',false,'billing_enabled',false);
 end if;
 if p.status<>'linked' then raise exception 'This run already consumed its approved specialist assignment' using errcode='42501';end if;
 select coalesce(spend_ceiling_seconds,3600) into ceiling_value from public.jd_workspace_autonomy where school_id=tenant;
 if ceiling_value is null then ceiling_value:=3600;end if;
 select coalesce(sum(allocated_seconds),0)::integer into committed from public.jd_specialist_run_proposals where school_id=tenant and id<>p.id and status in ('approved','linked','running') and expires_at>clock_timestamp();
 if committed+p.allocated_seconds>ceiling_value then raise exception 'Workspace agent-time ceiling reached before execution' using errcode='54000';end if;
 update public.jd_specialist_run_proposals set status='running',tool_call_id=p_call_id,started_at=clock_timestamp() where id=p.id returning * into p;
 insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json) values(tenant,p_actor,p_run,'agent.specialist.started',jsonb_build_object('proposal_id',p.id,'role',p.specialist_role,'allocated_seconds',p.allocated_seconds,'spend_cap_seconds',p.spend_cap_seconds));
 return jsonb_build_object('proposal_id',p.id,'role',p.specialist_role,'allocated_seconds',p.allocated_seconds,'spend_cap_seconds',p.spend_cap_seconds,'rate_minor_per_hour',p.rate_minor_per_hour,'currency',p.currency,'started_at',p.started_at,'charging_enabled',false,'hiring_enabled',false,'execution_enabled',false,'billing_enabled',false);
end; $$;

create function public.jd_specialist_run_settle(p_actor uuid,p_run uuid,p_outcome text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid;p public.jd_specialist_run_proposals%rowtype;seconds integer;amount bigint;status_value text;
begin
 tenant:=public.jd_skills_tenant(p_actor);
 select * into p from public.jd_specialist_run_proposals where run_id=p_run and school_id=tenant for update;
 if not found then raise exception 'Specialist proposal unavailable for settlement' using errcode='40001';end if;
 if p.status in ('completed','timed_out','failed') then
  return jsonb_build_object('proposal_id',p.id,'status',p.status,'actual_seconds',p.actual_seconds,'actual_amount_minor',p.actual_amount_minor,'currency',p.currency,'charging_enabled',false,'hiring_enabled',false,'execution_enabled',false,'billing_enabled',false);
 end if;
 if p.status<>'running' or p.started_at is null then raise exception 'Running specialist proposal required for settlement' using errcode='40001';end if;
 seconds:=greatest(0,least(p.allocated_seconds,extract(epoch from (clock_timestamp()-p.started_at))::integer));
 amount:=round(seconds*p.rate_minor_per_hour/3600.0)::bigint;
 status_value:=case when p_outcome='timed_out' or extract(epoch from (clock_timestamp()-p.started_at))>=p.allocated_seconds then 'timed_out' when p_outcome='completed' then 'completed' else 'failed' end;
 update public.jd_specialist_run_proposals set status=status_value,completed_at=clock_timestamp(),actual_seconds=seconds,actual_amount_minor=amount,outcome=left(coalesce(p_outcome,'unknown'),120) where id=p.id returning * into p;
 insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json) values(tenant,p_actor,p_run,'agent.specialist.settled',jsonb_build_object('proposal_id',p.id,'role',p.specialist_role,'status',p.status,'actual_seconds',p.actual_seconds,'actual_amount_minor',p.actual_amount_minor,'currency',p.currency,'charging_enabled',false,'hiring_enabled',false,'execution_enabled',false,'billing_enabled',false));
 return jsonb_build_object('proposal_id',p.id,'status',p.status,'actual_seconds',p.actual_seconds,'actual_amount_minor',p.actual_amount_minor,'currency',p.currency,'charging_enabled',false,'hiring_enabled',false,'execution_enabled',false,'billing_enabled',false);
end; $$;

revoke all on function public.jd_specialist_proposal_create(uuid,uuid,text,text,integer,integer),public.jd_specialist_proposal_approve(uuid,uuid,uuid,text),public.jd_specialist_proposal_link_run(uuid,uuid,uuid,uuid),public.jd_specialist_run_start(uuid,uuid,text,text),public.jd_specialist_run_settle(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.jd_specialist_proposal_create(uuid,uuid,text,text,integer,integer),public.jd_specialist_proposal_approve(uuid,uuid,uuid,text),public.jd_specialist_proposal_link_run(uuid,uuid,uuid,uuid),public.jd_specialist_run_start(uuid,uuid,text,text),public.jd_specialist_run_settle(uuid,uuid,text) to service_role;

-- Include specialist-run usage in the same verified billing summary.
create or replace function public.jd_read_billing_summary(p_actor uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid;a public.jd_workspace_autonomy%rowtype;s public.jd_billing_subscriptions%rowtype;skill_tally record;specialist_tally record;
begin
 tenant:=public.jd_skills_tenant(p_actor);
 select * into a from public.jd_workspace_autonomy where school_id=tenant;
 select * into s from public.jd_billing_subscriptions where school_id=tenant;
 select coalesce(sum(actual_seconds) filter(where status='completed'),0)::integer as actual_seconds,
  coalesce(sum(estimated_seconds) filter(where status='confirmed'),0)::integer as confirmed_seconds,
  coalesce(sum(actual_seconds*coalesce(a.agentic_rate_minor_per_hour,10000)/3600.0) filter(where status='completed'),0)::bigint as amount_minor
 into skill_tally from public.jd_agent_time_ledger where school_id=tenant;
 select coalesce(sum(actual_seconds),0)::integer as actual_seconds,
  coalesce(sum(allocated_seconds) filter(where status in ('approved','linked','running')),0)::integer as confirmed_seconds,
  coalesce(sum(actual_amount_minor),0)::bigint as amount_minor,
  count(*) filter(where status in ('linked','running','completed','timed_out','failed'))::integer as specialist_runs
 into specialist_tally from public.jd_specialist_run_proposals where school_id=tenant;
 return jsonb_build_object('mode',coalesce(a.mode,'assisted'),'spend_ceiling_seconds',coalesce(a.spend_ceiling_seconds,3600),
  'agentic_rate_minor_per_hour',coalesce(a.agentic_rate_minor_per_hour,10000),'currency',coalesce(a.currency,'USD'),
  'actual_seconds',skill_tally.actual_seconds+specialist_tally.actual_seconds,
  'confirmed_estimate_seconds',skill_tally.confirmed_seconds+specialist_tally.confirmed_seconds,
  'ledger_rows',(select count(*)::integer from public.jd_agent_time_ledger where school_id=tenant)+specialist_tally.specialist_runs,
  'specialist_runs',specialist_tally.specialist_runs,
  'amount_minor_actual',skill_tally.amount_minor+specialist_tally.amount_minor,
  'subscription_status',coalesce(s.status,'not_started'),
  'charging_enabled',false,'pricing_policy','agentic-seconds-v1',
  'hiring_enabled',false,'execution_enabled',false,'billing_enabled',false);
end; $$;

create function public.jd_specialist_run_status(p_actor uuid,p_run uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid;p public.jd_specialist_run_proposals%rowtype;seconds integer;amount bigint;
begin
 tenant:=public.jd_skills_tenant(p_actor);
 select * into p from public.jd_specialist_run_proposals where run_id=p_run and school_id=tenant;
 if not found then return null;end if;
 seconds:=case when p.status='running' and p.started_at is not null then greatest(0,least(p.allocated_seconds,extract(epoch from (clock_timestamp()-p.started_at))::integer)) else coalesce(p.actual_seconds,0) end;
 amount:=case when p.actual_amount_minor is not null then p.actual_amount_minor else round(seconds*p.rate_minor_per_hour/3600.0)::bigint end;
 return jsonb_build_object('proposal_id',p.id,'role',p.specialist_role,'status',p.status,'allocated_seconds',p.allocated_seconds,'elapsed_seconds',seconds,'rate_minor_per_hour',p.rate_minor_per_hour,'estimated_amount_minor',p.estimated_amount_minor,'actual_amount_minor',amount,'currency',p.currency,'charging_enabled',false,'hiring_enabled',false,'execution_enabled',false,'billing_enabled',false);
end; $$;
revoke all on function public.jd_specialist_run_status(uuid,uuid) from public,anon,authenticated;
grant execute on function public.jd_specialist_run_status(uuid,uuid) to service_role;
