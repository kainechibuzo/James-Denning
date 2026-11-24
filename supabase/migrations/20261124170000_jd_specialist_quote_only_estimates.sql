-- Specialist quote-only estimates are informational and never reserve time or authorise execution.
alter table public.jd_specialist_run_proposals
  drop constraint if exists jd_specialist_run_proposals_subscription_status_check,
  drop constraint if exists jd_specialist_run_proposals_status_check;
alter table public.jd_specialist_run_proposals
  add constraint jd_specialist_run_proposals_subscription_status_check
    check (subscription_status in ('trialing','active','missing','expired','past_due','cancelled','checkout_required','incomplete')),
  add constraint jd_specialist_run_proposals_status_check
    check (status in ('quote_only','awaiting_approval','approved','linked','running','completed','timed_out','failed','declined','expired'));
alter table public.jd_specialist_run_proposals
  add column if not exists authorization_block_reason text;

create or replace function public.jd_specialist_proposal_create(p_actor uuid,p_request uuid,p_role text,p_task text,p_seconds integer,p_spend_cap_seconds integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 tenant uuid;
 a public.jd_workspace_autonomy%rowtype;
 s public.jd_billing_subscriptions%rowtype;
 old public.jd_specialist_run_proposals%rowtype;
 rate bigint;
 amount bigint;
 result jsonb;
 committed integer;
 subscription_state text;
 block_reason text;
 eligible boolean := false;
begin
 tenant:=public.jd_skills_tenant(p_actor);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(tenant::text,0));
 if not exists(select 1 from public.profiles where id=p_actor and school_id=tenant and role in ('owner','admin','manager')) then
  raise exception 'Workspace member required' using errcode='42501';
 end if;
 if p_role not in ('business_advisor','research_analyst','finance_analyst','operations_planner','product_designer','software_engineer','security_reviewer','quality_assurance')
 or p_task is null or length(trim(p_task)) not between 20 and 5000 or p_seconds not between 60 and 86400
 or p_spend_cap_seconds not between 60 and 86400 or p_seconds>p_spend_cap_seconds then
  raise exception 'Invalid specialist quote inputs' using errcode='22023';
 end if;
 select * into old from public.jd_specialist_run_proposals where school_id=tenant and request_id=p_request;
 if found then
  if old.specialist_role<>p_role or old.task<>p_task or old.allocated_seconds<>p_seconds or old.spend_cap_seconds<>p_spend_cap_seconds then
   raise exception 'Request conflict' using errcode='40001';
  end if;
  return jsonb_build_object('proposal_id',old.id,'status',old.status,'role',old.specialist_role,
   'allocated_seconds',old.allocated_seconds,'spend_cap_seconds',old.spend_cap_seconds,
   'rate_minor_per_hour',old.rate_minor_per_hour,'estimated_amount_minor',old.estimated_amount_minor,
   'currency',old.currency,'subscription_status',old.subscription_status,
   'authorization_eligible',old.status='awaiting_approval','authorization_block_reason',old.authorization_block_reason,
   'expires_at',old.expires_at,'charging_enabled',false,'hiring_enabled',false,'execution_enabled',false,'billing_enabled',false);
 end if;
 select * into s from public.jd_billing_subscriptions where school_id=tenant;
 if s.id is null then
  subscription_state:='missing'; block_reason:='subscription_required';
 elsif s.status='trialing' and (s.trial_ends_at is null or s.trial_ends_at<=clock_timestamp()) then
  subscription_state:='expired'; block_reason:='subscription_expired';
 elsif s.status='active' and s.current_period_end is not null and s.current_period_end<=clock_timestamp() then
  subscription_state:='expired'; block_reason:='subscription_expired';
 elsif s.status not in ('trialing','active') then
  subscription_state:=s.status; block_reason:='subscription_not_eligible';
 else
  subscription_state:=s.status; eligible:=true;
 end if;
 select * into a from public.jd_workspace_autonomy where school_id=tenant;
 rate:=coalesce(a.agentic_rate_minor_per_hour,10000);
 if eligible then
  if p_spend_cap_seconds>coalesce(a.spend_ceiling_seconds,3600) then
   eligible:=false; block_reason:='workspace_time_ceiling_exceeded';
  else
   select coalesce(sum(allocated_seconds),0)::integer into committed
   from public.jd_specialist_run_proposals
   where school_id=tenant and status in ('approved','linked','running') and expires_at>clock_timestamp();
   if committed+p_seconds>coalesce(a.spend_ceiling_seconds,3600) then
    eligible:=false; block_reason:='workspace_time_capacity_unavailable';
   end if;
  end if;
 end if;
 amount:=round(p_seconds*rate/3600.0)::bigint;
 insert into public.jd_specialist_run_proposals(
  school_id,request_id,requested_by,specialist_role,task,allocated_seconds,spend_cap_seconds,
  rate_minor_per_hour,estimated_amount_minor,subscription_status,status,authorization_block_reason
 ) values(
  tenant,p_request,p_actor,p_role,trim(p_task),p_seconds,p_spend_cap_seconds,rate,amount,
  subscription_state,case when eligible then 'awaiting_approval' else 'quote_only' end,block_reason
 ) returning * into old;
 result:=jsonb_build_object('proposal_id',old.id,'status',old.status,'role',old.specialist_role,
  'allocated_seconds',old.allocated_seconds,'spend_cap_seconds',old.spend_cap_seconds,
  'rate_minor_per_hour',old.rate_minor_per_hour,'estimated_amount_minor',old.estimated_amount_minor,
  'currency',old.currency,'subscription_status',old.subscription_status,
  'authorization_eligible',eligible,'authorization_block_reason',block_reason,
  'expires_at',old.expires_at,'charging_enabled',false,'hiring_enabled',false,'execution_enabled',false,'billing_enabled',false);
 insert into public.jd_audit_events(school_id,actor_id,event_type,event_json)
 values(tenant,p_actor,'agent.specialist.quoted',result);
 return result;
end; $$;
