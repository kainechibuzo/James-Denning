-- Rollback specialist-run approval and metering additions.
drop function if exists public.jd_specialist_run_status(uuid,uuid);
drop function if exists public.jd_specialist_run_settle(uuid,uuid,text);
drop function if exists public.jd_specialist_run_start(uuid,uuid,text,text);
drop function if exists public.jd_specialist_proposal_link_run(uuid,uuid,uuid,uuid);
drop function if exists public.jd_specialist_proposal_approve(uuid,uuid,uuid,text);
drop function if exists public.jd_specialist_proposal_create(uuid,uuid,text,text,integer,integer);
drop table if exists public.jd_specialist_run_proposals;

-- Restore the phase-7 skills-only billing summary.
create or replace function public.jd_read_billing_summary(p_actor uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid;a public.jd_workspace_autonomy%rowtype;tally record;
begin
 tenant:=public.jd_skills_tenant(p_actor);
 select * into a from public.jd_workspace_autonomy where school_id=tenant;
 select coalesce(sum(actual_seconds) filter (where status='completed'),0) as actual_seconds,
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
