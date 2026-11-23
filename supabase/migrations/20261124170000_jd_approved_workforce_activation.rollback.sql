-- Roll back approved workforce proposal activation.
-- Restores the pre-feature service-role helper grants and approval decision body.

drop function if exists public.jd_workforce_activate_approved_proposal(uuid,uuid,uuid);
drop table if exists public.jd_workforce_proposal_activations;

grant execute on function public.jd_workforce_create_employee(uuid,uuid,text,text,integer,text,text) to service_role;
grant execute on function public.jd_workforce_create_team(uuid,uuid,text,text) to service_role;

create or replace function public.jd_decide_approval(
  p_approval_id uuid,
  p_actor_id uuid,
  p_decision text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_school_id uuid;
  v_approval public.jd_approvals%rowtype;
  v_now timestamptz := now();
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Invalid approval decision' using errcode = '22023';
  end if;
  select school_id into v_school_id
  from public.profiles
  where id = p_actor_id and role = 'admin';
  if v_school_id is null then
    raise exception 'Only workspace administrators can decide approvals' using errcode = '42501';
  end if;
  select * into v_approval
  from public.jd_approvals
  where id = p_approval_id and school_id = v_school_id
  for update;
  if not found then
    raise exception 'Approval request not found' using errcode = 'P0002';
  end if;
  if v_approval.status <> 'pending' then
    raise exception 'Approval request has already been decided' using errcode = '40001';
  end if;
  if v_approval.expires_at <= v_now then
    update public.jd_approvals
    set status = 'expired', updated_at = v_now
    where id = p_approval_id;
    return jsonb_build_object('status', 'expired', 'execution_status', v_approval.execution_status);
  end if;
  update public.jd_approvals
  set status = p_decision,
      decided_by = p_actor_id,
      decision_note = left(coalesce(p_note, ''), 2000),
      decided_at = v_now,
      updated_at = v_now
  where id = p_approval_id
  returning * into v_approval;
  insert into public.jd_audit_events(school_id, actor_id, run_id, event_type, event_json)
  values(v_school_id, p_actor_id, v_approval.run_id, 'approval.' || p_decision,
    jsonb_build_object('approval_id', p_approval_id, 'execution_status', v_approval.execution_status));
  return jsonb_build_object(
    'id', v_approval.id, 'status', v_approval.status,
    'execution_status', v_approval.execution_status,
    'decided_by', v_approval.decided_by, 'decided_at', v_approval.decided_at,
    'decision_note', v_approval.decision_note
  );
end;
$$;
revoke all on function public.jd_decide_approval(uuid, uuid, text, text) from public;
revoke all on function public.jd_decide_approval(uuid, uuid, text, text) from anon, authenticated;
grant execute on function public.jd_decide_approval(uuid, uuid, text, text) to service_role;
