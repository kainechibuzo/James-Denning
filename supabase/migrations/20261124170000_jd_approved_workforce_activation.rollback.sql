-- Roll back approved workforce proposal activation.
-- Restores the pre-feature service-role helper grants and approval decision body.

drop function if exists public.jd_workforce_activate_approved_proposal(uuid,uuid,uuid);
drop table if exists public.jd_workforce_proposal_activations;
alter table public.jd_workforce_employees
  drop column if exists role_title,
  drop column if exists purpose,
  drop column if exists responsibilities,
  drop column if exists requested_access;
alter table public.jd_workforce_teams
  drop column if exists department,
  drop column if exists coordinator_specialist_ref,
  drop column if exists coordinator_specialist_kind,
  drop column if exists coordinator_specialist_version,
  drop column if exists coordinator_specialist_name,
  drop column if exists responsibilities,
  drop column if exists requested_access;

do $
begin
  if exists (
    select 1 from public.jd_workforce_employees
    group by school_id,agent_kind,agent_ref,agent_version
    having count(*) > 1
  ) then
    raise exception 'Cannot restore the one-employee-per-specialist constraint while duplicate employee instances exist';
  end if;
end;
$;
alter table public.jd_workforce_employees
  add constraint jd_workforce_employees_school_id_agent_kind_agent_ref_agent_version_key
  unique(school_id,agent_kind,agent_ref,agent_version);

create or replace function public.jd_workforce_create_employee(
 p_actor uuid,p_request uuid,p_kind text,p_ref text,p_version integer,p_name text,p_department text
) returns jsonb language plpgsql security definer set search_path='' as $
declare tenant uuid; existing public.jd_workforce_employees%rowtype; new_id uuid; req jsonb; prior public.jd_workforce_provision_requests%rowtype; receipt jsonb; specialist constant text[]:=array['business_advisor','research_analyst','finance_analyst','operations_planner','product_designer','software_engineer','security_reviewer','quality_assurance'];
begin
 select school_id into tenant from public.profiles where id=p_actor and role in ('owner','admin');
 if tenant is null then raise exception 'Workspace administrator required' using errcode='42501'; end if;
 if p_request is null or p_kind not in ('builtin','registry') or p_ref is null or length(trim(p_ref)) not between 1 and 120 or length(trim(p_name)) not between 2 and 120 or length(coalesce(trim(p_department),''))>120 then raise exception 'Invalid employee definition' using errcode='22023'; end if;
 if p_kind='builtin' then
  if not (p_ref=any(specialist)) or p_version is not null then raise exception 'Unknown built-in specialist' using errcode='22023'; end if;
 else
  if p_ref !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}
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
 or p_version is null or not exists(select 1 from public.jd_agent_definitions a where a.id=p_ref::uuid and a.school_id=tenant and a.state='published' and a.execution_authorized=true and a.current_version=p_version) then
   raise exception 'Registry agent must be current, published and execution-authorized' using errcode='42501';
  end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(tenant::text,241300));
 req:=jsonb_build_array(p_actor,p_kind,p_ref,p_version,p_name,p_department);
 perform pg_advisory_xact_lock(hashtextextended(tenant::text||':'||p_request::text,241303));
 select * into prior from public.jd_workforce_provision_requests where school_id=tenant and request_id=p_request;
 if found then if prior.operation<>'employee.create' or prior.request<>req then raise exception 'Request identifier reused' using errcode='40001'; end if; return prior.receipt; end if;
 select * into existing from public.jd_workforce_employees where school_id=tenant and agent_kind=p_kind and agent_ref=p_ref and agent_version is not distinct from p_version and lifecycle_state<>'retired' for update;
 if found then receipt:=jsonb_build_object('employee',to_jsonb(existing),'existing',true,'execution_started',false); insert into public.jd_workforce_provision_requests values(tenant,p_request,p_actor,'employee.create',req,receipt,clock_timestamp()); return receipt; end if;
 insert into public.jd_workforce_employees(school_id,agent_kind,agent_ref,agent_version,display_name,department,created_by)
 values(tenant,p_kind,p_ref,p_version,trim(p_name),nullif(trim(p_department),''),p_actor) returning id into new_id;
 insert into public.jd_workforce_employee_budgets(school_id,employee_id,budget_micros) values(tenant,new_id,0);
 receipt:=jsonb_build_object('employee_id',new_id,'lifecycle_state','active','execution_started',false,'billing_mode','shadow_only');
 insert into public.jd_workforce_provision_requests values(tenant,p_request,p_actor,'employee.create',req,receipt,clock_timestamp());
 insert into public.jd_audit_events(school_id,actor_id,event_type,event_json) values(tenant,p_actor,'workforce.employee.created',receipt||jsonb_build_object('request_id',p_request));
 return receipt;
end; $;

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
