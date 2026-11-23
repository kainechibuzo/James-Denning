-- Approved workforce proposal activation.
-- An approval is necessary but not sufficient: an owner/admin must explicitly
-- activate the approved proposal. This transaction creates identities only;
-- it never grants tools, connector access, assignment execution or billable use.

alter table public.jd_workforce_employees
  add column role_title text,
  add column purpose text,
  add column responsibilities jsonb not null default '[]'::jsonb,
  add column requested_access jsonb not null default '[]'::jsonb;
alter table public.jd_workforce_teams
  add column department text,
  add column responsibilities jsonb not null default '[]'::jsonb,
  add column requested_access jsonb not null default '[]'::jsonb;

-- A specialist definition can have multiple employee instances in one tenant.
-- Idempotency belongs to the activation/request ledger, not to the role itself.
alter table public.jd_workforce_employees
  drop constraint if exists jd_workforce_employees_school_id_agent_kind_agent_ref_agent_version_key;

create or replace function public.jd_workforce_create_employee(
 p_actor uuid,p_request uuid,p_kind text,p_ref text,p_version integer,p_name text,p_department text
) returns jsonb language plpgsql security definer set search_path='' as $
declare tenant uuid; new_id uuid; req jsonb; prior public.jd_workforce_provision_requests%rowtype; receipt jsonb;
 specialist constant text[]:=array['business_advisor','research_analyst','finance_analyst','operations_planner','product_designer','software_engineer','security_reviewer','quality_assurance'];
begin
 select school_id into tenant from public.profiles where id=p_actor and role in ('owner','admin');
 if tenant is null then raise exception 'Workspace administrator required' using errcode='42501'; end if;
 if p_request is null or p_kind not in ('builtin','registry') or p_ref is null or length(trim(p_ref)) not between 1 and 120 or length(trim(p_name)) not between 2 and 120 or length(coalesce(trim(p_department),''))>120 then raise exception 'Invalid employee definition' using errcode='22023'; end if;
 if p_kind='builtin' then
  if not (p_ref=any(specialist)) or p_version is not null then raise exception 'Unknown built-in specialist' using errcode='22023'; end if;
 else
  if p_ref !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12} (
  school_id uuid not null references public.schools(id),
  approval_id uuid not null references public.jd_approvals(id),
  request_id uuid not null,
  actor_id uuid not null references auth.users(id),
  proposal_kind text not null check (proposal_kind in ('employee','team')),
  receipt jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (school_id, approval_id),
  unique (school_id, request_id)
);
alter table public.jd_workforce_proposal_activations enable row level security;
revoke all on public.jd_workforce_proposal_activations from public, anon, authenticated, service_role;
grant select on public.jd_workforce_proposal_activations to service_role;

create or replace function public.jd_workforce_activate_approved_proposal(
  p_actor uuid,
  p_approval uuid,
  p_request uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school uuid;
  v_approval public.jd_approvals%rowtype;
  v_existing public.jd_workforce_proposal_activations%rowtype;
  v_proposal jsonb;
  v_kind text;
  v_employee jsonb;
  v_team jsonb;
  v_member jsonb;
  v_receipt jsonb;
  v_created jsonb;
  v_employee_ids jsonb := '[]'::jsonb;
  v_team_id uuid;
  v_employee_id uuid;
  v_member_index integer := 0;
  v_specialist text;
  v_name text;
  v_team_name text;
  v_department text;
  v_purpose text;
  v_allowed text[] := array['business_advisor','research_analyst','finance_analyst','operations_planner','product_designer','software_engineer','security_reviewer','quality_assurance'];
begin
  select school_id into v_school
  from public.profiles
  where id = p_actor and role in ('owner','admin')
  for share;
  if v_school is null then
    raise exception 'Workspace administrator required' using errcode = '42501';
  end if;
  if p_approval is null or p_request is null then
    raise exception 'Approval and request identifiers are required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_school::text || ':' || p_approval::text, 241306));
  select * into v_existing
  from public.jd_workforce_proposal_activations
  where school_id = v_school and approval_id = p_approval;
  if found then
    if v_existing.actor_id <> p_actor then
      raise exception 'Activation belongs to another actor' using errcode = '42501';
    end if;
    return v_existing.receipt || jsonb_build_object('replayed', true);
  end if;

  select * into v_approval
  from public.jd_approvals
  where id = p_approval and school_id = v_school
  for update;
  if not found then
    raise exception 'Workforce approval not found' using errcode = 'P0002';
  end if;
  if v_approval.status <> 'approved' or v_approval.decided_by is null then
    raise exception 'Only an explicitly approved proposal can be activated' using errcode = '42501';
  end if;
  if v_approval.action_key not in ('workforce.employee.proposal','workforce.team.proposal') then
    raise exception 'Approval is not a workforce proposal' using errcode = '22023';
  end if;
  if v_approval.execution_status not in ('not_executed','failed') then
    raise exception 'Proposal activation is already in progress or complete' using errcode = '40001';
  end if;

  v_proposal := v_approval.proposal_json->'workforce_proposal';
  v_kind := v_proposal->>'kind';
  if jsonb_typeof(v_proposal) is distinct from 'object'
     or v_kind is null
     or (v_kind = 'employee' and v_approval.action_key <> 'workforce.employee.proposal')
     or (v_kind = 'team' and v_approval.action_key <> 'workforce.team.proposal')
     or v_kind not in ('employee','team') then
    raise exception 'Proposal kind does not match its approval' using errcode = '22023';
  end if;
  v_name := btrim(coalesce(v_proposal->>'name',''));
  v_department := nullif(btrim(coalesce(v_proposal->>'department','')),'');
  v_purpose := btrim(coalesce(v_proposal->>'purpose',''));
  if length(v_name) not between 2 and 120 or length(v_department) > 120 or length(v_purpose) not between 12 and 1200
     or jsonb_typeof(v_proposal->'responsibilities') is distinct from 'array'
     or jsonb_array_length(v_proposal->'responsibilities') < 1
     or (v_proposal ? 'requested_access' and jsonb_typeof(v_proposal->'requested_access') is distinct from 'array') then
    raise exception 'Proposal details are incomplete or invalid' using errcode = '22023';
  end if;

  if v_kind = 'employee' then
    v_specialist := v_proposal->>'specialist_ref';
    if not (v_specialist = any(v_allowed)) then
      raise exception 'Choose an available built-in specialist before activation' using errcode = '22023';
    end if;
    v_created := public.jd_workforce_create_employee(
      p_actor, gen_random_uuid(), 'builtin', v_specialist, null, v_name, v_department
    );
    v_employee_id := coalesce((v_created->>'employee_id')::uuid, (v_created->'employee'->>'id')::uuid);
    if v_employee_id is null then
      raise exception 'Employee identity creation was not confirmed' using errcode = 'P0001';
    end if;
    update public.jd_workforce_employees
    set role_title = replace(v_specialist,'_',' '), purpose = v_purpose,
        responsibilities = coalesce(v_proposal->'responsibilities','[]'::jsonb),
        requested_access = coalesce(v_proposal->'requested_access','[]'::jsonb)
    where id = v_employee_id and school_id = v_school;
    v_employee_ids := jsonb_build_array(jsonb_build_object(
      'employee_id', v_employee_id, 'name', v_name, 'specialist_ref', v_specialist
    ));
  else
    if jsonb_typeof(v_proposal->'members') is distinct from 'array' then
      raise exception 'A team must contain a member list' using errcode = '22023';
    end if;
    if jsonb_array_length(v_proposal->'members') not between 1 and 20 then
      raise exception 'A team must contain between one and twenty described members' using errcode = '22023';
    end if;
    v_team_name := v_name;
    if exists(select 1 from public.jd_workforce_teams where school_id=v_school and lower(name)=lower(v_team_name) and retired_at is null) then
      raise exception 'An active team already uses this name; revise the proposal before activation' using errcode = '40001';
    end if;
    v_team := public.jd_workforce_create_team(p_actor, gen_random_uuid(), v_team_name, v_purpose);
    v_team_id := (v_team->>'team_id')::uuid;
    if v_team_id is null then
      raise exception 'Team creation was not confirmed' using errcode = 'P0001';
    end if;
    update public.jd_workforce_teams
    set department = v_department,
        responsibilities = coalesce(v_proposal->'responsibilities','[]'::jsonb),
        requested_access = coalesce(v_proposal->'requested_access','[]'::jsonb)
    where id = v_team_id and school_id = v_school;
    for v_member in select value from jsonb_array_elements(v_proposal->'members')
    loop
      v_member_index := v_member_index + 1;
      v_specialist := v_member->>'specialist_ref';
      v_name := btrim(coalesce(v_member->>'name',''));
      if jsonb_typeof(v_member) is distinct from 'object'
         or not (v_specialist = any(v_allowed)) or length(v_name) not between 2 and 120
         or length(btrim(coalesce(v_member->>'role',''))) not between 2 and 120
         or jsonb_typeof(v_member->'responsibilities') is distinct from 'array'
         or (v_member ? 'requested_access' and jsonb_typeof(v_member->'requested_access') is distinct from 'array') then
        raise exception 'Every team member needs a supported specialist and complete role details' using errcode = '22023';
      end if;
      if jsonb_array_length(v_member->'responsibilities') < 1 then
        raise exception 'Every team member needs at least one responsibility' using errcode = '22023';
      end if;
      v_created := public.jd_workforce_create_employee(
        p_actor, gen_random_uuid(), 'builtin', v_specialist, null, v_name, v_department
      );
      v_employee_id := coalesce((v_created->>'employee_id')::uuid, (v_created->'employee'->>'id')::uuid);
      if v_employee_id is null then
        raise exception 'A team employee identity was not confirmed' using errcode = 'P0001';
      end if;
      update public.jd_workforce_employees
      set role_title = btrim(v_member->>'role'), purpose = v_purpose,
          responsibilities = coalesce(v_member->'responsibilities','[]'::jsonb),
          requested_access = coalesce(v_member->'requested_access','[]'::jsonb)
      where id = v_employee_id and school_id = v_school;
      perform public.jd_workforce_team_membership(
        p_actor, gen_random_uuid(), v_team_id, v_employee_id, 'add',
        case when v_member_index = 1 then 'lead' else 'member' end
      );
      v_employee_ids := v_employee_ids || jsonb_build_array(jsonb_build_object(
        'employee_id', v_employee_id, 'name', v_name, 'role', v_member->>'role',
        'specialist_ref', v_specialist
      ));
    end loop;
  end if;

  v_receipt := jsonb_build_object(
    'approval_id', p_approval,
    'kind', v_kind,
    'employee_ids', v_employee_ids,
    'team_id', v_team_id,
    'activated', true,
    'tools_granted', false,
    'connectors_authorised', false,
    'assignment_started', false,
    'billing_enabled', false,
    'billing_mode', 'shadow_only',
    'replayed', false
  );
  insert into public.jd_workforce_proposal_activations(
    school_id, approval_id, request_id, actor_id, proposal_kind, receipt
  ) values (v_school, p_approval, p_request, p_actor, v_kind, v_receipt);

  update public.jd_approvals
  set execution_status = 'completed',
      execution_result_json = v_receipt,
      updated_at = clock_timestamp()
  where id = p_approval and school_id = v_school;

  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
  values(v_school,p_actor,v_approval.run_id,'workforce.proposal.activated',
    v_receipt || jsonb_build_object('request_id',p_request));

  return v_receipt;
end;
$$;

revoke all on function public.jd_workforce_activate_approved_proposal(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.jd_workforce_activate_approved_proposal(uuid,uuid,uuid) to service_role;

-- Match the HTTP/API role contract: both owners and admins can make decisions.
create or replace function public.jd_decide_approval(
  p_approval_id uuid,
  p_actor_id uuid,
  p_decision text,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school_id uuid;
  v_approval public.jd_approvals%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if p_decision not in ('approved','rejected') then
    raise exception 'Invalid approval decision' using errcode = '22023';
  end if;
  select school_id into v_school_id
  from public.profiles
  where id = p_actor_id and role in ('owner','admin')
  for share;
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
    update public.jd_approvals set status = 'expired', updated_at = v_now
    where id = p_approval_id and school_id = v_school_id;
    insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
    values(v_school_id,p_actor_id,v_approval.run_id,'approval.expired',
      jsonb_build_object('approval_id',p_approval_id,'expired_by','decision_guard'));
    return jsonb_build_object('id',p_approval_id,'status','expired','execution_status',v_approval.execution_status);
  end if;
  update public.jd_approvals
  set status = p_decision, decided_by = p_actor_id,
      decision_note = left(coalesce(p_note,''),2000),
      decided_at = v_now, updated_at = v_now
  where id = p_approval_id and school_id = v_school_id
  returning * into v_approval;
  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
  values(v_school_id,p_actor_id,v_approval.run_id,'approval.'||p_decision,
    jsonb_build_object('approval_id',p_approval_id,'execution_status',v_approval.execution_status));
  return jsonb_build_object(
    'id',v_approval.id,'status',v_approval.status,
    'execution_status',v_approval.execution_status,
    'decided_by',v_approval.decided_by,'decided_at',v_approval.decided_at,
    'decision_note',v_approval.decision_note
  );
end;
$$;
revoke all on function public.jd_decide_approval(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.jd_decide_approval(uuid,uuid,text,text) to service_role;

-- These lower-level helpers must not be callable directly by Edge Functions.
-- The approved activation RPC runs as the function owner and is the sole path
-- that can invoke them for proposal-backed identity creation.
revoke execute on function public.jd_workforce_create_employee(uuid,uuid,text,text,integer,text,text) from service_role;
revoke execute on function public.jd_workforce_create_team(uuid,uuid,text,text) from service_role;
 or p_version is null or not exists(select 1 from public.jd_agent_definitions a where a.id=p_ref::uuid and a.school_id=tenant and a.state='published' and a.execution_authorized=true and a.current_version=p_version) then
   raise exception 'Registry agent must be current, published and execution-authorized' using errcode='42501';
  end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(tenant::text||':'||p_request::text,241303));
 req:=jsonb_build_array(p_actor,p_kind,p_ref,p_version,p_name,p_department);
 select * into prior from public.jd_workforce_provision_requests where school_id=tenant and request_id=p_request;
 if found then
  if prior.operation<>'employee.create' or prior.request<>req then raise exception 'Request identifier reused' using errcode='40001'; end if;
  return prior.receipt;
 end if;
 insert into public.jd_workforce_employees(school_id,agent_kind,agent_ref,agent_version,display_name,department,created_by)
 values(tenant,p_kind,p_ref,p_version,trim(p_name),nullif(trim(p_department),''),p_actor) returning id into new_id;
 insert into public.jd_workforce_employee_budgets(school_id,employee_id,budget_micros) values(tenant,new_id,0);
 receipt:=jsonb_build_object('employee_id',new_id,'lifecycle_state','active','execution_started',false,'billing_mode','shadow_only');
 insert into public.jd_workforce_provision_requests values(tenant,p_request,p_actor,'employee.create',req,receipt,clock_timestamp());
 insert into public.jd_audit_events(school_id,actor_id,event_type,event_json) values(tenant,p_actor,'workforce.employee.created',receipt||jsonb_build_object('request_id',p_request));
 return receipt;
end; $;

create table public.jd_workforce_proposal_activations (
  school_id uuid not null references public.schools(id),
  approval_id uuid not null references public.jd_approvals(id),
  request_id uuid not null,
  actor_id uuid not null references auth.users(id),
  proposal_kind text not null check (proposal_kind in ('employee','team')),
  receipt jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (school_id, approval_id),
  unique (school_id, request_id)
);
alter table public.jd_workforce_proposal_activations enable row level security;
revoke all on public.jd_workforce_proposal_activations from public, anon, authenticated, service_role;
grant select on public.jd_workforce_proposal_activations to service_role;

create or replace function public.jd_workforce_activate_approved_proposal(
  p_actor uuid,
  p_approval uuid,
  p_request uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school uuid;
  v_approval public.jd_approvals%rowtype;
  v_existing public.jd_workforce_proposal_activations%rowtype;
  v_proposal jsonb;
  v_kind text;
  v_employee jsonb;
  v_team jsonb;
  v_member jsonb;
  v_receipt jsonb;
  v_created jsonb;
  v_employee_ids jsonb := '[]'::jsonb;
  v_team_id uuid;
  v_employee_id uuid;
  v_member_index integer := 0;
  v_specialist text;
  v_name text;
  v_team_name text;
  v_department text;
  v_purpose text;
  v_allowed text[] := array['business_advisor','research_analyst','finance_analyst','operations_planner','product_designer','software_engineer','security_reviewer','quality_assurance'];
begin
  select school_id into v_school
  from public.profiles
  where id = p_actor and role in ('owner','admin')
  for share;
  if v_school is null then
    raise exception 'Workspace administrator required' using errcode = '42501';
  end if;
  if p_approval is null or p_request is null then
    raise exception 'Approval and request identifiers are required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_school::text || ':' || p_approval::text, 241306));
  select * into v_existing
  from public.jd_workforce_proposal_activations
  where school_id = v_school and approval_id = p_approval;
  if found then
    if v_existing.actor_id <> p_actor then
      raise exception 'Activation belongs to another actor' using errcode = '42501';
    end if;
    return v_existing.receipt || jsonb_build_object('replayed', true);
  end if;

  select * into v_approval
  from public.jd_approvals
  where id = p_approval and school_id = v_school
  for update;
  if not found then
    raise exception 'Workforce approval not found' using errcode = 'P0002';
  end if;
  if v_approval.status <> 'approved' or v_approval.decided_by is null then
    raise exception 'Only an explicitly approved proposal can be activated' using errcode = '42501';
  end if;
  if v_approval.action_key not in ('workforce.employee.proposal','workforce.team.proposal') then
    raise exception 'Approval is not a workforce proposal' using errcode = '22023';
  end if;
  if v_approval.execution_status not in ('not_executed','failed') then
    raise exception 'Proposal activation is already in progress or complete' using errcode = '40001';
  end if;

  v_proposal := v_approval.proposal_json->'workforce_proposal';
  v_kind := v_proposal->>'kind';
  if v_kind = 'employee' and v_approval.action_key <> 'workforce.employee.proposal'
     or v_kind = 'team' and v_approval.action_key <> 'workforce.team.proposal'
     or v_kind not in ('employee','team') then
    raise exception 'Proposal kind does not match its approval' using errcode = '22023';
  end if;
  v_name := btrim(coalesce(v_proposal->>'name',''));
  v_department := nullif(btrim(coalesce(v_proposal->>'department','')),'');
  v_purpose := btrim(coalesce(v_proposal->>'purpose',''));
  if length(v_name) not between 2 and 120 or length(v_department) > 120 or length(v_purpose) not between 12 and 1200 then
    raise exception 'Proposal details are incomplete or invalid' using errcode = '22023';
  end if;

  if v_kind = 'employee' then
    v_specialist := v_proposal->>'specialist_ref';
    if not (v_specialist = any(v_allowed)) then
      raise exception 'Choose an available built-in specialist before activation' using errcode = '22023';
    end if;
    v_created := public.jd_workforce_create_employee(
      p_actor, gen_random_uuid(), 'builtin', v_specialist, null, v_name, v_department
    );
    v_employee_id := coalesce((v_created->>'employee_id')::uuid, (v_created->'employee'->>'id')::uuid);
    if v_employee_id is null then
      raise exception 'Employee identity creation was not confirmed' using errcode = 'P0001';
    end if;
    update public.jd_workforce_employees
    set role_title = replace(v_specialist,'_',' '), purpose = v_purpose,
        responsibilities = coalesce(v_proposal->'responsibilities','[]'::jsonb),
        requested_access = coalesce(v_proposal->'requested_access','[]'::jsonb)
    where id = v_employee_id and school_id = v_school;
    v_employee_ids := jsonb_build_array(jsonb_build_object(
      'employee_id', v_employee_id, 'name', v_name, 'specialist_ref', v_specialist
    ));
  else
    if jsonb_typeof(v_proposal->'members') <> 'array'
       or jsonb_array_length(v_proposal->'members') not between 1 and 20 then
      raise exception 'A team must contain between one and twenty described members' using errcode = '22023';
    end if;
    v_team_name := v_name;
    v_team := public.jd_workforce_create_team(p_actor, gen_random_uuid(), v_team_name, v_purpose);
    v_team_id := (v_team->>'team_id')::uuid;
    if v_team_id is null then
      raise exception 'Team creation was not confirmed' using errcode = 'P0001';
    end if;
    update public.jd_workforce_teams
    set department = v_department,
        responsibilities = coalesce(v_proposal->'responsibilities','[]'::jsonb),
        requested_access = coalesce(v_proposal->'requested_access','[]'::jsonb)
    where id = v_team_id and school_id = v_school;
    for v_member in select value from jsonb_array_elements(v_proposal->'members')
    loop
      v_member_index := v_member_index + 1;
      v_specialist := v_member->>'specialist_ref';
      v_name := btrim(coalesce(v_member->>'name',''));
      if not (v_specialist = any(v_allowed)) or length(v_name) not between 2 and 120
         or length(btrim(coalesce(v_member->>'role',''))) not between 2 and 120
         or jsonb_typeof(v_member->'responsibilities') <> 'array'
         or jsonb_array_length(v_member->'responsibilities') < 1
         or exists(select 1 from jsonb_array_elements(v_employee_ids) prior where prior->>'specialist_ref' = v_specialist) then
        raise exception 'Every team member needs a distinct supported specialist and complete role details' using errcode = '22023';
      end if;
      v_created := public.jd_workforce_create_employee(
        p_actor, gen_random_uuid(), 'builtin', v_specialist, null, v_name, v_department
      );
      v_employee_id := coalesce((v_created->>'employee_id')::uuid, (v_created->'employee'->>'id')::uuid);
      if v_employee_id is null then
        raise exception 'A team employee identity was not confirmed' using errcode = 'P0001';
      end if;
      update public.jd_workforce_employees
      set role_title = btrim(v_member->>'role'), purpose = v_purpose,
          responsibilities = coalesce(v_member->'responsibilities','[]'::jsonb),
          requested_access = coalesce(v_member->'requested_access','[]'::jsonb)
      where id = v_employee_id and school_id = v_school;
      perform public.jd_workforce_team_membership(
        p_actor, gen_random_uuid(), v_team_id, v_employee_id, 'add',
        case when v_member_index = 1 then 'lead' else 'member' end
      );
      v_employee_ids := v_employee_ids || jsonb_build_array(jsonb_build_object(
        'employee_id', v_employee_id, 'name', v_name, 'role', v_member->>'role',
        'specialist_ref', v_specialist
      ));
    end loop;
  end if;

  v_receipt := jsonb_build_object(
    'approval_id', p_approval,
    'kind', v_kind,
    'employee_ids', v_employee_ids,
    'team_id', v_team_id,
    'activated', true,
    'tools_granted', false,
    'connectors_authorised', false,
    'assignment_started', false,
    'billing_enabled', false,
    'billing_mode', 'shadow_only',
    'replayed', false
  );
  insert into public.jd_workforce_proposal_activations(
    school_id, approval_id, request_id, actor_id, proposal_kind, receipt
  ) values (v_school, p_approval, p_request, p_actor, v_kind, v_receipt);

  update public.jd_approvals
  set execution_status = 'completed',
      execution_result_json = v_receipt,
      updated_at = clock_timestamp()
  where id = p_approval and school_id = v_school;

  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
  values(v_school,p_actor,v_approval.run_id,'workforce.proposal.activated',
    v_receipt || jsonb_build_object('request_id',p_request));

  return v_receipt;
end;
$$;

revoke all on function public.jd_workforce_activate_approved_proposal(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.jd_workforce_activate_approved_proposal(uuid,uuid,uuid) to service_role;

-- Match the HTTP/API role contract: both owners and admins can make decisions.
create or replace function public.jd_decide_approval(
  p_approval_id uuid,
  p_actor_id uuid,
  p_decision text,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school_id uuid;
  v_approval public.jd_approvals%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if p_decision not in ('approved','rejected') then
    raise exception 'Invalid approval decision' using errcode = '22023';
  end if;
  select school_id into v_school_id
  from public.profiles
  where id = p_actor_id and role in ('owner','admin')
  for share;
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
    update public.jd_approvals set status = 'expired', updated_at = v_now
    where id = p_approval_id and school_id = v_school_id;
    insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
    values(v_school_id,p_actor_id,v_approval.run_id,'approval.expired',
      jsonb_build_object('approval_id',p_approval_id,'expired_by','decision_guard'));
    return jsonb_build_object('id',p_approval_id,'status','expired','execution_status',v_approval.execution_status);
  end if;
  update public.jd_approvals
  set status = p_decision, decided_by = p_actor_id,
      decision_note = left(coalesce(p_note,''),2000),
      decided_at = v_now, updated_at = v_now
  where id = p_approval_id and school_id = v_school_id
  returning * into v_approval;
  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
  values(v_school_id,p_actor_id,v_approval.run_id,'approval.'||p_decision,
    jsonb_build_object('approval_id',p_approval_id,'execution_status',v_approval.execution_status));
  return jsonb_build_object(
    'id',v_approval.id,'status',v_approval.status,
    'execution_status',v_approval.execution_status,
    'decided_by',v_approval.decided_by,'decided_at',v_approval.decided_at,
    'decision_note',v_approval.decision_note
  );
end;
$$;
revoke all on function public.jd_decide_approval(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.jd_decide_approval(uuid,uuid,text,text) to service_role;

-- These lower-level helpers must not be callable directly by Edge Functions.
-- The approved activation RPC runs as the function owner and is the sole path
-- that can invoke them for proposal-backed identity creation.
revoke execute on function public.jd_workforce_create_employee(uuid,uuid,text,text,integer,text,text) from service_role;
revoke execute on function public.jd_workforce_create_team(uuid,uuid,text,text) from service_role;
