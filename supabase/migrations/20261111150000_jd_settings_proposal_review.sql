-- Persist settings proposals in the Review Centre and bind approval to an immutable hash.
create extension if not exists pgcrypto;

alter table public.jd_approvals
  add column if not exists proposal_hash text;

create unique index if not exists jd_approvals_school_proposal_hash_uidx
  on public.jd_approvals (school_id, proposal_hash)
  where proposal_hash is not null;

create or replace function public.jd_submit_settings_proposal(
  p_actor_id uuid,
  p_title text,
  p_proposal_json jsonb,
  p_proposal_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_school_id uuid;
  v_run_id uuid;
  v_approval_id uuid;
  v_existing public.jd_approvals%rowtype;
  v_title text := left(trim(coalesce(p_title, 'Settings change proposal')), 160);
begin
  if p_proposal_json is null or jsonb_typeof(p_proposal_json) <> 'object' then
    raise exception 'A proposal object is required' using errcode = '22023';
  end if;
  if length(coalesce(p_proposal_hash, '')) <> 64
     or p_proposal_hash !~ '^[a-f0-9]{64}$'
     or encode(digest(convert_to(p_proposal_json::text, 'UTF8'), 'sha256'), 'hex') <> p_proposal_hash then
    raise exception 'Proposal hash does not match proposal content' using errcode = '22023';
  end if;
  if jsonb_typeof(p_proposal_json->'changes') <> 'array'
     or jsonb_array_length(p_proposal_json->'changes') < 1
     or jsonb_array_length(p_proposal_json->'changes') > 20 then
    raise exception 'Proposal must contain between 1 and 20 changes' using errcode = '22023';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(p_proposal_json->'changes') c
    where c->>'approval_required' = 'true'
  ) then
    raise exception 'This proposal does not contain a change requiring Review Centre approval' using errcode = '22023';
  end if;

  select school_id into v_school_id
  from public.profiles
  where id = p_actor_id and role = 'admin';
  if v_school_id is null then
    raise exception 'Only workspace administrators can submit settings proposals' using errcode = '42501';
  end if;

  select * into v_existing
  from public.jd_approvals
  where school_id = v_school_id and proposal_hash = p_proposal_hash
  limit 1;
  if found then
    return jsonb_build_object('id', v_existing.id, 'run_id', v_existing.run_id,
      'status', v_existing.status, 'duplicate', true, 'proposal_hash', v_existing.proposal_hash);
  end if;

  insert into public.jd_automation_runs (
    school_id, requested_by, trigger_type, status, autonomy_mode, scope,
    request_text, plan_json, idempotency_key
  ) values (
    v_school_id, p_actor_id, 'manual', 'awaiting_approval', 'assisted',
    'settings', v_title, jsonb_build_array(p_proposal_json),
    'settings-proposal:' || p_proposal_hash
  ) returning id into v_run_id;

  insert into public.jd_approvals (
    school_id, run_id, requested_by, status, reason, title, action_key,
    risk_level, proposal_json, audience_text, execution_status, proposal_hash
  ) values (
    v_school_id, v_run_id, p_actor_id, 'pending',
    'Settings changes require administrator review',
    v_title, 'settings.apply',
    'high', p_proposal_json,
    'Review the exact proposed settings diff before any changes are applied.',
    'not_executed', p_proposal_hash
  ) returning id into v_approval_id;

  insert into public.jd_audit_events (
    school_id, actor_id, run_id, event_type, event_json
  ) values (
    v_school_id, p_actor_id, v_run_id, 'settings.proposal_submitted',
    jsonb_build_object('approval_id', v_approval_id, 'proposal_hash', p_proposal_hash)
  );

  return jsonb_build_object('id', v_approval_id, 'run_id', v_run_id,
    'status', 'pending', 'duplicate', false, 'proposal_hash', p_proposal_hash,
    'execution_status', 'not_executed');
end;
$$;

revoke all on function public.jd_submit_settings_proposal(uuid, text, jsonb, text) from public;
revoke all on function public.jd_submit_settings_proposal(uuid, text, jsonb, text) from anon, authenticated;
grant execute on function public.jd_submit_settings_proposal(uuid, text, jsonb, text) to service_role;
