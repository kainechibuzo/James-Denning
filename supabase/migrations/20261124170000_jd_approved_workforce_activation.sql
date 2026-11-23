-- Approved workforce proposal activation.
-- Owner/admin approval is necessary but not sufficient: activation is a separate
-- explicit command. This transaction creates identities only; it never grants
-- tools, connectors, assignment execution or billable use.

alter table public.jd_workforce_employees
  add column role_title text,
  add column purpose text,
  add column responsibilities jsonb not null default '[]'::jsonb,
  add column requested_access jsonb not null default '[]'::jsonb;
alter table public.jd_workforce_teams
  add column department text,
  add column coordinator_specialist_ref text,
  add column coordinator_specialist_kind text,
  add column coordinator_specialist_version integer,
  add column coordinator_specialist_name text,
  add column responsibilities jsonb not null default '[]'::jsonb,
  add column requested_access jsonb not null default '[]'::jsonb;

-- A specialist definition can have multiple employee instances per tenant.
do $migration$
declare v_constraint record;
begin
  for v_constraint in
    select conname
    from pg_constraint
    where conrelid = 'public.jd_workforce_employees'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) like 'UNIQUE (school_id, agent_kind, agent_ref, agent_version)%'
  loop
    execute format('alter table public.jd_workforce_employees drop constraint %I', v_constraint.conname);
  end loop;
end;
$migration$;

create or replace function public.jd_workforce_create_employee(
  p_actor uuid,p_request uuid,p_kind text,p_ref text,p_version integer,p_name text,p_department text
) returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_school uuid;
  v_employee uuid;
  v_request jsonb;
  v_prior public.jd_workforce_provision_requests%rowtype;
  v_receipt jsonb;
  v_specialists constant text[] := array[
    'business_advisor','research_analyst','finance_analyst','operations_planner',
    'product_designer','software_engineer','security_reviewer','quality_assurance'
  ];
begin
  select school_id into v_school from public.profiles
  where id=p_actor and role in ('owner','admin');
  if v_school is null then raise exception 'Workspace administrator required' using errcode='42501'; end if;
  if p_request is null or p_kind is null or p_kind not in ('builtin','registry') or p_ref is null
     or length(trim(p_ref)) not between 1 and 120
     or length(trim(p_name)) not between 2 and 120
     or length(coalesce(trim(p_department),'')) > 120 then
    raise exception 'Invalid employee definition' using errcode='22023';
  end if;
  if p_kind='builtin' then
    if not (p_ref=any(v_specialists)) or p_version is not null then
      raise exception 'Unknown built-in specialist' using errcode='22023';
    end if;
  else
    if p_ref !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or p_version is null
       or not exists(
         select 1 from public.jd_agent_definitions a
         where a.id=p_ref::uuid and a.school_id=v_school
           and a.state='published' and a.execution_authorized=true
           and a.current_version=p_version
       ) then
      raise exception 'Registry agent must be current, published and execution-authorized' using errcode='42501';
    end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_school::text||':'||p_request::text,241303));
  v_request:=jsonb_build_array(p_actor,p_kind,p_ref,p_version,p_name,p_department);
  select * into v_prior from public.jd_workforce_provision_requests
  where school_id=v_school and request_id=p_request;
  if found then
    if v_prior.operation<>'employee.create' or v_prior.request<>v_request then
      raise exception 'Request identifier reused' using errcode='40001';
    end if;
    return v_prior.receipt;
  end if;
  insert into public.jd_workforce_employees(
    school_id,agent_kind,agent_ref,agent_version,display_name,department,created_by
  ) values (
    v_school,p_kind,p_ref,p_version,trim(p_name),nullif(trim(p_department),''),p_actor
  ) returning id into v_employee;
  insert into public.jd_workforce_employee_budgets(school_id,employee_id,budget_micros)
  values(v_school,v_employee,0);
  v_receipt:=jsonb_build_object(
    'employee_id',v_employee,'lifecycle_state','active',
    'execution_started',false,'billing_mode','shadow_only'
  );
  insert into public.jd_workforce_provision_requests
  values(v_school,p_request,p_actor,'employee.create',v_request,v_receipt,clock_timestamp());
  insert into public.jd_audit_events(school_id,actor_id,event_type,event_json)
  values(v_school,p_actor,'workforce.employee.created',
    v_receipt||jsonb_build_object('request_id',p_request));
  return v_receipt;
end;
$function$;

create table public.jd_workforce_proposal_activations (
  school_id uuid not null references public.schools(id),
  approval_id uuid not null references public.jd_approvals(id),
  request_id uuid not null,
  actor_id uuid not null references auth.users(id),
  proposal_kind text not null check (proposal_kind in ('employee','team')),
  receipt jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (school_id,approval_id),
  unique (school_id,request_id)
);
alter table public.jd_workforce_proposal_activations enable row level security;
revoke all on public.jd_workforce_proposal_activations from public,anon,authenticated,service_role;
grant select on public.jd_workforce_proposal_activations to service_role;

create or replace function public.jd_workforce_activate_approved_proposal(
  p_actor uuid,p_approval uuid,p_request uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare
  v_school uuid;
  v_approval public.jd_approvals%rowtype;
  v_existing public.jd_workforce_proposal_activations%rowtype;
  v_proposal jsonb;
  v_kind text;
  v_member jsonb;
  v_created jsonb;
  v_receipt jsonb;
  v_employee_ids jsonb := '[]'::jsonb;
  v_team_id uuid;
  v_employee_id uuid;
  v_member_index integer := 0;
  v_specialist text;
  v_specialist_kind text;
  v_specialist_version integer;
  v_specialist_name text;
  v_name text;
  v_team_name text;
  v_department text;
  v_purpose text;
  v_allowed constant text[] := array[
    'business_advisor','research_analyst','finance_analyst','operations_planner',
    'product_designer','software_engineer','security_reviewer','quality_assurance'
  ];
begin
  select school_id into v_school from public.profiles
  where id=p_actor and role in ('owner','admin') for share;
  if v_school is null then raise exception 'Workspace administrator required' using errcode='42501'; end if;
  if p_approval is null or p_request is null then
    raise exception 'Approval and request identifiers are required' using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_school::text||':'||p_approval::text,241306));
  select * into v_existing from public.jd_workforce_proposal_activations
  where school_id=v_school and approval_id=p_approval;
  if found then
    return v_existing.receipt||jsonb_build_object('replayed',true,'activated_by',v_existing.actor_id);
  end if;

  select * into v_approval from public.jd_approvals
  where id=p_approval and school_id=v_school for update;
  if not found then raise exception 'Workforce approval not found' using errcode='P0002'; end if;
  if v_approval.status is distinct from 'approved' or v_approval.decided_by is null then
    raise exception 'Only an explicitly approved proposal can be activated' using errcode='42501';
  end if;
  if v_approval.action_key is null or v_approval.action_key not in ('workforce.employee.proposal','workforce.team.proposal') then
    raise exception 'Approval is not a workforce proposal' using errcode='22023';
  end if;
  if v_approval.execution_status is distinct from 'not_executed' and v_approval.execution_status is distinct from 'failed' then
    raise exception 'Proposal activation is already in progress or complete' using errcode='40001';
  end if;

  v_proposal:=v_approval.proposal_json->'workforce_proposal';
  if jsonb_typeof(v_proposal) is distinct from 'object' then
    raise exception 'Workforce proposal is missing or invalid' using errcode='22023';
  end if;
  v_kind:=v_proposal->>'kind';
  if v_kind is null
     or (v_kind='employee' and v_approval.action_key is distinct from 'workforce.employee.proposal')
     or (v_kind='team' and v_approval.action_key is distinct from 'workforce.team.proposal')
     or v_kind not in ('employee','team') then
    raise exception 'Proposal kind does not match its approval' using errcode='22023';
  end if;
  v_name:=btrim(coalesce(v_proposal->>'name',''));
  v_department:=nullif(btrim(coalesce(v_proposal->>'department','')),'');
  v_purpose:=btrim(coalesce(v_proposal->>'purpose',''));
  if length(v_name) not between 2 and 120
     or length(coalesce(v_department,'')) not between 2 and 120
     or length(v_purpose) not between 12 and 1200 then
    raise exception 'Proposal details are incomplete or invalid' using errcode='22023';
  end if;
  if jsonb_typeof(v_proposal->'responsibilities') is distinct from 'array' then
    raise exception 'Proposal responsibilities must be a list' using errcode='22023';
  end if;
  if jsonb_array_length(v_proposal->'responsibilities')<1 then
    raise exception 'Proposal must include at least one responsibility' using errcode='22023';
  end if;
  if v_proposal ? 'requested_access' and jsonb_typeof(v_proposal->'requested_access') is distinct from 'array' then
    raise exception 'Requested access must be a list' using errcode='22023';
  end if;

  if v_kind='employee' then
    v_specialist:=v_proposal->>'specialist_ref';
    v_specialist_kind:=coalesce(v_proposal->>'specialist_kind','builtin');
    v_specialist_version:=case when coalesce(v_proposal->>'specialist_version','') ~ '^[1-9][0-9]*
    v_employee_ids:=jsonb_build_array(jsonb_build_object(
      'employee_id',v_employee_id,'name',v_name,'specialist_ref',v_specialist
    ));
  else
    v_specialist:=v_proposal->>'specialist_ref';
    v_specialist_kind:=coalesce(v_proposal->>'specialist_kind','builtin');
    v_specialist_version:=case when coalesce(v_proposal->>'specialist_version','') ~ '^[1-9][0-9]*
      raise exception 'A team must contain a member list' using errcode='22023';
    end if;
    if jsonb_array_length(v_proposal->'members') not between 1 and 20 then
      raise exception 'A team must contain between one and twenty described members' using errcode='22023';
    end if;
    v_team_name:=v_name;
    if exists(select 1 from public.jd_workforce_teams
      where school_id=v_school and lower(name)=lower(v_team_name) and retired_at is null) then
      raise exception 'An active team already uses this name; revise the proposal before activation' using errcode='40001';
    end if;
    v_created:=public.jd_workforce_create_team(p_actor,gen_random_uuid(),v_team_name,v_purpose);
    v_team_id:=(v_created->>'team_id')::uuid;
    if v_team_id is null then raise exception 'Team creation was not confirmed' using errcode='P0001'; end if;
    update public.jd_workforce_teams
    set department=v_department,coordinator_specialist_ref=v_specialist,
        coordinator_specialist_kind=v_specialist_kind,
        coordinator_specialist_version=v_specialist_version,
        coordinator_specialist_name=v_specialist_name,
        responsibilities=coalesce(v_proposal->'responsibilities','[]'::jsonb),
        requested_access=coalesce(v_proposal->'requested_access','[]'::jsonb)
    where id=v_team_id and school_id=v_school;

    for v_member in select value from jsonb_array_elements(v_proposal->'members')
    loop
      v_member_index:=v_member_index+1;
      v_specialist:=v_member->>'specialist_ref';
      v_specialist_kind:=coalesce(v_member->>'specialist_kind','builtin');
      v_specialist_version:=case when coalesce(v_member->>'specialist_version','') ~ '^[1-9][0-9]*
        raise exception 'Team member responsibilities must be a list' using errcode='22023';
      end if;
      if v_member ? 'requested_access' and jsonb_typeof(v_member->'requested_access') is distinct from 'array' then
        raise exception 'Team member requested access must be a list' using errcode='22023';
      end if;
      if jsonb_array_length(v_member->'responsibilities')<1 then
        raise exception 'Every team member needs at least one responsibility' using errcode='22023';
      end if;
      v_created:=public.jd_workforce_create_employee(
        p_actor,gen_random_uuid(),v_specialist_kind,v_specialist,v_specialist_version,v_name,v_department
      );
      v_employee_id:=(v_created->>'employee_id')::uuid;
      if v_employee_id is null then raise exception 'A team employee identity was not confirmed' using errcode='P0001'; end if;
      update public.jd_workforce_employees
      set role_title=btrim(v_member->>'role'),purpose=v_purpose,
          responsibilities=coalesce(v_member->'responsibilities','[]'::jsonb),
          requested_access=coalesce(v_member->'requested_access','[]'::jsonb)
      where id=v_employee_id and school_id=v_school;
      perform public.jd_workforce_team_membership(
        p_actor,gen_random_uuid(),v_team_id,v_employee_id,'add',
        case when v_member_index=1 then 'lead' else 'member' end
      );
      v_employee_ids:=v_employee_ids||jsonb_build_array(jsonb_build_object(
        'employee_id',v_employee_id,'name',v_name,'role',v_member->>'role',
        'specialist_ref',v_specialist
      ));
    end loop;
  end if;

  v_receipt:=jsonb_build_object(
    'approval_id',p_approval,'kind',v_kind,'employee_ids',v_employee_ids,
    'team_id',v_team_id,'activated',true,'tools_granted',false,
    'connectors_authorised',false,'assignment_started',false,
    'billing_enabled',false,'billing_mode','shadow_only','replayed',false
  );
  insert into public.jd_workforce_proposal_activations(
    school_id,approval_id,request_id,actor_id,proposal_kind,receipt
  ) values(v_school,p_approval,p_request,p_actor,v_kind,v_receipt);

  update public.jd_approvals
  set execution_status='completed',execution_result_json=v_receipt,updated_at=clock_timestamp()
  where id=p_approval and school_id=v_school;
  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
  values(v_school,p_actor,v_approval.run_id,'workforce.proposal.activated',
    v_receipt||jsonb_build_object('request_id',p_request));
  return v_receipt;
end;
$function$;

revoke all on function public.jd_workforce_activate_approved_proposal(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.jd_workforce_activate_approved_proposal(uuid,uuid,uuid) to service_role;

create or replace function public.jd_decide_approval(
  p_approval_id uuid,p_actor_id uuid,p_decision text,p_note text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare
  v_school uuid;
  v_approval public.jd_approvals%rowtype;
  v_now timestamptz:=clock_timestamp();
begin
  if p_decision is null or p_decision not in ('approved','rejected') then
    raise exception 'Invalid approval decision' using errcode='22023';
  end if;
  select school_id into v_school from public.profiles
  where id=p_actor_id and role in ('owner','admin') for share;
  if v_school is null then raise exception 'Only workspace administrators can decide approvals' using errcode='42501'; end if;
  select * into v_approval from public.jd_approvals
  where id=p_approval_id and school_id=v_school for update;
  if not found then raise exception 'Approval request not found' using errcode='P0002'; end if;
  if v_approval.status<>'pending' then raise exception 'Approval request has already been decided' using errcode='40001'; end if;
  if v_approval.expires_at<=v_now then
    update public.jd_approvals set status='expired',updated_at=v_now
    where id=p_approval_id and school_id=v_school;
    insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
    values(v_school,p_actor_id,v_approval.run_id,'approval.expired',
      jsonb_build_object('approval_id',p_approval_id,'expired_by','decision_guard'));
    return jsonb_build_object('id',p_approval_id,'status','expired','execution_status',v_approval.execution_status);
  end if;
  update public.jd_approvals
  set status=p_decision,decided_by=p_actor_id,decision_note=left(coalesce(p_note,''),2000),
      decided_at=v_now,updated_at=v_now
  where id=p_approval_id and school_id=v_school returning * into v_approval;
  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
  values(v_school,p_actor_id,v_approval.run_id,'approval.'||p_decision,
    jsonb_build_object('approval_id',p_approval_id,'execution_status',v_approval.execution_status));
  return jsonb_build_object(
    'id',v_approval.id,'status',v_approval.status,'execution_status',v_approval.execution_status,
    'decided_by',v_approval.decided_by,'decided_at',v_approval.decided_at,
    'decision_note',v_approval.decision_note
  );
end;
$function$;
revoke all on function public.jd_decide_approval(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.jd_decide_approval(uuid,uuid,text,text) to service_role;

-- Only the approved activation RPC may call the lower-level identity creators.
revoke execute on function public.jd_workforce_create_employee(uuid,uuid,text,text,integer,text,text) from service_role;
revoke execute on function public.jd_workforce_create_team(uuid,uuid,text,text) from service_role;
 then (v_proposal->>'specialist_version')::integer else null end;
    if v_specialist_kind='builtin' then
      if v_specialist is null or not (v_specialist=any(v_allowed)) or v_specialist_version is not null then
        raise exception 'Choose an available built-in specialist before activation' using errcode='22023';
      end if;
      v_specialist_name:=replace(v_specialist,'_',' ');
    elsif v_specialist_kind='registry' then
      if v_specialist is null or v_specialist !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}
    v_employee_ids:=jsonb_build_array(jsonb_build_object(
      'employee_id',v_employee_id,'name',v_name,'specialist_ref',v_specialist
    ));
  else
    v_specialist:=v_proposal->>'specialist_ref';
    if v_specialist is null or not (v_specialist=any(v_allowed)) then
      raise exception 'A team coordinator must use a supported built-in specialist' using errcode='22023';
    end if;
    if jsonb_typeof(v_proposal->'members') is distinct from 'array' then
      raise exception 'A team must contain a member list' using errcode='22023';
    end if;
    if jsonb_array_length(v_proposal->'members') not between 1 and 20 then
      raise exception 'A team must contain between one and twenty described members' using errcode='22023';
    end if;
    v_team_name:=v_name;
    if exists(select 1 from public.jd_workforce_teams
      where school_id=v_school and lower(name)=lower(v_team_name) and retired_at is null) then
      raise exception 'An active team already uses this name; revise the proposal before activation' using errcode='40001';
    end if;
    v_created:=public.jd_workforce_create_team(p_actor,gen_random_uuid(),v_team_name,v_purpose);
    v_team_id:=(v_created->>'team_id')::uuid;
    if v_team_id is null then raise exception 'Team creation was not confirmed' using errcode='P0001'; end if;
    update public.jd_workforce_teams
    set department=v_department,coordinator_specialist_ref=v_specialist,
        responsibilities=coalesce(v_proposal->'responsibilities','[]'::jsonb),
        requested_access=coalesce(v_proposal->'requested_access','[]'::jsonb)
    where id=v_team_id and school_id=v_school;

    for v_member in select value from jsonb_array_elements(v_proposal->'members')
    loop
      v_member_index:=v_member_index+1;
      v_specialist:=v_member->>'specialist_ref';
      v_name:=btrim(coalesce(v_member->>'name',''));
      if jsonb_typeof(v_member) is distinct from 'object'
         or v_specialist is null or not (v_specialist=any(v_allowed))
         or length(v_name) not between 2 and 120
         or length(btrim(coalesce(v_member->>'role',''))) not between 2 and 120 then
        raise exception 'Every team member needs a supported specialist and complete role details' using errcode='22023';
      end if;
      if jsonb_typeof(v_member->'responsibilities') is distinct from 'array' then
        raise exception 'Team member responsibilities must be a list' using errcode='22023';
      end if;
      if v_member ? 'requested_access' and jsonb_typeof(v_member->'requested_access') is distinct from 'array' then
        raise exception 'Team member requested access must be a list' using errcode='22023';
      end if;
      if jsonb_array_length(v_member->'responsibilities')<1 then
        raise exception 'Every team member needs at least one responsibility' using errcode='22023';
      end if;
      v_created:=public.jd_workforce_create_employee(
        p_actor,gen_random_uuid(),'builtin',v_specialist,null,v_name,v_department
      );
      v_employee_id:=(v_created->>'employee_id')::uuid;
      if v_employee_id is null then raise exception 'A team employee identity was not confirmed' using errcode='P0001'; end if;
      update public.jd_workforce_employees
      set role_title=btrim(v_member->>'role'),purpose=v_purpose,
          responsibilities=coalesce(v_member->'responsibilities','[]'::jsonb),
          requested_access=coalesce(v_member->'requested_access','[]'::jsonb)
      where id=v_employee_id and school_id=v_school;
      perform public.jd_workforce_team_membership(
        p_actor,gen_random_uuid(),v_team_id,v_employee_id,'add',
        case when v_member_index=1 then 'lead' else 'member' end
      );
      v_employee_ids:=v_employee_ids||jsonb_build_array(jsonb_build_object(
        'employee_id',v_employee_id,'name',v_name,'role',v_member->>'role',
        'specialist_ref',v_specialist
      ));
    end loop;
  end if;

  v_receipt:=jsonb_build_object(
    'approval_id',p_approval,'kind',v_kind,'employee_ids',v_employee_ids,
    'team_id',v_team_id,'activated',true,'tools_granted',false,
    'connectors_authorised',false,'assignment_started',false,
    'billing_enabled',false,'billing_mode','shadow_only','replayed',false
  );
  insert into public.jd_workforce_proposal_activations(
    school_id,approval_id,request_id,actor_id,proposal_kind,receipt
  ) values(v_school,p_approval,p_request,p_actor,v_kind,v_receipt);

  update public.jd_approvals
  set execution_status='completed',execution_result_json=v_receipt,updated_at=clock_timestamp()
  where id=p_approval and school_id=v_school;
  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
  values(v_school,p_actor,v_approval.run_id,'workforce.proposal.activated',
    v_receipt||jsonb_build_object('request_id',p_request));
  return v_receipt;
end;
$function$;

revoke all on function public.jd_workforce_activate_approved_proposal(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.jd_workforce_activate_approved_proposal(uuid,uuid,uuid) to service_role;

create or replace function public.jd_decide_approval(
  p_approval_id uuid,p_actor_id uuid,p_decision text,p_note text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare
  v_school uuid;
  v_approval public.jd_approvals%rowtype;
  v_now timestamptz:=clock_timestamp();
begin
  if p_decision is null or p_decision not in ('approved','rejected') then
    raise exception 'Invalid approval decision' using errcode='22023';
  end if;
  select school_id into v_school from public.profiles
  where id=p_actor_id and role in ('owner','admin') for share;
  if v_school is null then raise exception 'Only workspace administrators can decide approvals' using errcode='42501'; end if;
  select * into v_approval from public.jd_approvals
  where id=p_approval_id and school_id=v_school for update;
  if not found then raise exception 'Approval request not found' using errcode='P0002'; end if;
  if v_approval.status<>'pending' then raise exception 'Approval request has already been decided' using errcode='40001'; end if;
  if v_approval.expires_at<=v_now then
    update public.jd_approvals set status='expired',updated_at=v_now
    where id=p_approval_id and school_id=v_school;
    insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
    values(v_school,p_actor_id,v_approval.run_id,'approval.expired',
      jsonb_build_object('approval_id',p_approval_id,'expired_by','decision_guard'));
    return jsonb_build_object('id',p_approval_id,'status','expired','execution_status',v_approval.execution_status);
  end if;
  update public.jd_approvals
  set status=p_decision,decided_by=p_actor_id,decision_note=left(coalesce(p_note,''),2000),
      decided_at=v_now,updated_at=v_now
  where id=p_approval_id and school_id=v_school returning * into v_approval;
  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
  values(v_school,p_actor_id,v_approval.run_id,'approval.'||p_decision,
    jsonb_build_object('approval_id',p_approval_id,'execution_status',v_approval.execution_status));
  return jsonb_build_object(
    'id',v_approval.id,'status',v_approval.status,'execution_status',v_approval.execution_status,
    'decided_by',v_approval.decided_by,'decided_at',v_approval.decided_at,
    'decision_note',v_approval.decision_note
  );
end;
$function$;
revoke all on function public.jd_decide_approval(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.jd_decide_approval(uuid,uuid,text,text) to service_role;

-- Only the approved activation RPC may call the lower-level identity creators.
revoke execute on function public.jd_workforce_create_employee(uuid,uuid,text,text,integer,text,text) from service_role;
revoke execute on function public.jd_workforce_create_team(uuid,uuid,text,text) from service_role;

         or v_specialist_version is null
         or not exists(select 1 from public.jd_agent_definitions a where a.id=v_specialist::uuid and a.school_id=v_school and a.state='published' and a.execution_authorized is true and a.current_version=v_specialist_version) then
        raise exception 'Registry specialist must be current, published and execution-authorized' using errcode='42501';
      end if;
      select v.content->>'name' into v_specialist_name from public.jd_agent_definition_versions v
      where v.agent_id=v_specialist::uuid and v.school_id=v_school and v.version=v_specialist_version;
    else
      raise exception 'Unknown specialist kind' using errcode='22023';
    end if;
    v_created:=public.jd_workforce_create_employee(
      p_actor,gen_random_uuid(),v_specialist_kind,v_specialist,v_specialist_version,v_name,v_department
    );
    v_employee_id:=(v_created->>'employee_id')::uuid;
    if v_employee_id is null then raise exception 'Employee identity creation was not confirmed' using errcode='P0001'; end if;
    update public.jd_workforce_employees
    set role_title=coalesce(v_specialist_name,replace(v_specialist,'_',' ')),purpose=v_purpose,
        responsibilities=coalesce(v_proposal->'responsibilities','[]'::jsonb),
        requested_access=coalesce(v_proposal->'requested_access','[]'::jsonb)
    where id=v_employee_id and school_id=v_school;
    v_employee_ids:=jsonb_build_array(jsonb_build_object(
      'employee_id',v_employee_id,'name',v_name,'specialist_ref',v_specialist
    ));
  else
    v_specialist:=v_proposal->>'specialist_ref';
    if v_specialist is null or not (v_specialist=any(v_allowed)) then
      raise exception 'A team coordinator must use a supported built-in specialist' using errcode='22023';
    end if;
    if jsonb_typeof(v_proposal->'members') is distinct from 'array' then
      raise exception 'A team must contain a member list' using errcode='22023';
    end if;
    if jsonb_array_length(v_proposal->'members') not between 1 and 20 then
      raise exception 'A team must contain between one and twenty described members' using errcode='22023';
    end if;
    v_team_name:=v_name;
    if exists(select 1 from public.jd_workforce_teams
      where school_id=v_school and lower(name)=lower(v_team_name) and retired_at is null) then
      raise exception 'An active team already uses this name; revise the proposal before activation' using errcode='40001';
    end if;
    v_created:=public.jd_workforce_create_team(p_actor,gen_random_uuid(),v_team_name,v_purpose);
    v_team_id:=(v_created->>'team_id')::uuid;
    if v_team_id is null then raise exception 'Team creation was not confirmed' using errcode='P0001'; end if;
    update public.jd_workforce_teams
    set department=v_department,coordinator_specialist_ref=v_specialist,
        responsibilities=coalesce(v_proposal->'responsibilities','[]'::jsonb),
        requested_access=coalesce(v_proposal->'requested_access','[]'::jsonb)
    where id=v_team_id and school_id=v_school;

    for v_member in select value from jsonb_array_elements(v_proposal->'members')
    loop
      v_member_index:=v_member_index+1;
      v_specialist:=v_member->>'specialist_ref';
      v_name:=btrim(coalesce(v_member->>'name',''));
      if jsonb_typeof(v_member) is distinct from 'object'
         or v_specialist is null or not (v_specialist=any(v_allowed))
         or length(v_name) not between 2 and 120
         or length(btrim(coalesce(v_member->>'role',''))) not between 2 and 120 then
        raise exception 'Every team member needs a supported specialist and complete role details' using errcode='22023';
      end if;
      if jsonb_typeof(v_member->'responsibilities') is distinct from 'array' then
        raise exception 'Team member responsibilities must be a list' using errcode='22023';
      end if;
      if v_member ? 'requested_access' and jsonb_typeof(v_member->'requested_access') is distinct from 'array' then
        raise exception 'Team member requested access must be a list' using errcode='22023';
      end if;
      if jsonb_array_length(v_member->'responsibilities')<1 then
        raise exception 'Every team member needs at least one responsibility' using errcode='22023';
      end if;
      v_created:=public.jd_workforce_create_employee(
        p_actor,gen_random_uuid(),'builtin',v_specialist,null,v_name,v_department
      );
      v_employee_id:=(v_created->>'employee_id')::uuid;
      if v_employee_id is null then raise exception 'A team employee identity was not confirmed' using errcode='P0001'; end if;
      update public.jd_workforce_employees
      set role_title=btrim(v_member->>'role'),purpose=v_purpose,
          responsibilities=coalesce(v_member->'responsibilities','[]'::jsonb),
          requested_access=coalesce(v_member->'requested_access','[]'::jsonb)
      where id=v_employee_id and school_id=v_school;
      perform public.jd_workforce_team_membership(
        p_actor,gen_random_uuid(),v_team_id,v_employee_id,'add',
        case when v_member_index=1 then 'lead' else 'member' end
      );
      v_employee_ids:=v_employee_ids||jsonb_build_array(jsonb_build_object(
        'employee_id',v_employee_id,'name',v_name,'role',v_member->>'role',
        'specialist_ref',v_specialist
      ));
    end loop;
  end if;

  v_receipt:=jsonb_build_object(
    'approval_id',p_approval,'kind',v_kind,'employee_ids',v_employee_ids,
    'team_id',v_team_id,'activated',true,'tools_granted',false,
    'connectors_authorised',false,'assignment_started',false,
    'billing_enabled',false,'billing_mode','shadow_only','replayed',false
  );
  insert into public.jd_workforce_proposal_activations(
    school_id,approval_id,request_id,actor_id,proposal_kind,receipt
  ) values(v_school,p_approval,p_request,p_actor,v_kind,v_receipt);

  update public.jd_approvals
  set execution_status='completed',execution_result_json=v_receipt,updated_at=clock_timestamp()
  where id=p_approval and school_id=v_school;
  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
  values(v_school,p_actor,v_approval.run_id,'workforce.proposal.activated',
    v_receipt||jsonb_build_object('request_id',p_request));
  return v_receipt;
end;
$function$;

revoke all on function public.jd_workforce_activate_approved_proposal(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.jd_workforce_activate_approved_proposal(uuid,uuid,uuid) to service_role;

create or replace function public.jd_decide_approval(
  p_approval_id uuid,p_actor_id uuid,p_decision text,p_note text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare
  v_school uuid;
  v_approval public.jd_approvals%rowtype;
  v_now timestamptz:=clock_timestamp();
begin
  if p_decision is null or p_decision not in ('approved','rejected') then
    raise exception 'Invalid approval decision' using errcode='22023';
  end if;
  select school_id into v_school from public.profiles
  where id=p_actor_id and role in ('owner','admin') for share;
  if v_school is null then raise exception 'Only workspace administrators can decide approvals' using errcode='42501'; end if;
  select * into v_approval from public.jd_approvals
  where id=p_approval_id and school_id=v_school for update;
  if not found then raise exception 'Approval request not found' using errcode='P0002'; end if;
  if v_approval.status<>'pending' then raise exception 'Approval request has already been decided' using errcode='40001'; end if;
  if v_approval.expires_at<=v_now then
    update public.jd_approvals set status='expired',updated_at=v_now
    where id=p_approval_id and school_id=v_school;
    insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
    values(v_school,p_actor_id,v_approval.run_id,'approval.expired',
      jsonb_build_object('approval_id',p_approval_id,'expired_by','decision_guard'));
    return jsonb_build_object('id',p_approval_id,'status','expired','execution_status',v_approval.execution_status);
  end if;
  update public.jd_approvals
  set status=p_decision,decided_by=p_actor_id,decision_note=left(coalesce(p_note,''),2000),
      decided_at=v_now,updated_at=v_now
  where id=p_approval_id and school_id=v_school returning * into v_approval;
  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
  values(v_school,p_actor_id,v_approval.run_id,'approval.'||p_decision,
    jsonb_build_object('approval_id',p_approval_id,'execution_status',v_approval.execution_status));
  return jsonb_build_object(
    'id',v_approval.id,'status',v_approval.status,'execution_status',v_approval.execution_status,
    'decided_by',v_approval.decided_by,'decided_at',v_approval.decided_at,
    'decision_note',v_approval.decision_note
  );
end;
$function$;
revoke all on function public.jd_decide_approval(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.jd_decide_approval(uuid,uuid,text,text) to service_role;

-- Only the approved activation RPC may call the lower-level identity creators.
revoke execute on function public.jd_workforce_create_employee(uuid,uuid,text,text,integer,text,text) from service_role;
revoke execute on function public.jd_workforce_create_team(uuid,uuid,text,text) from service_role;
 then (v_proposal->>'specialist_version')::integer else null end;
    if v_specialist_kind='builtin' then
      if v_specialist is null or not (v_specialist=any(v_allowed)) or v_specialist_version is not null then
        raise exception 'A team coordinator must use a supported built-in specialist' using errcode='22023';
      end if;
      v_specialist_name:=replace(v_specialist,'_',' ');
    elsif v_specialist_kind='registry' then
      if v_specialist is null or v_specialist !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}
      raise exception 'A team must contain a member list' using errcode='22023';
    end if;
    if jsonb_array_length(v_proposal->'members') not between 1 and 20 then
      raise exception 'A team must contain between one and twenty described members' using errcode='22023';
    end if;
    v_team_name:=v_name;
    if exists(select 1 from public.jd_workforce_teams
      where school_id=v_school and lower(name)=lower(v_team_name) and retired_at is null) then
      raise exception 'An active team already uses this name; revise the proposal before activation' using errcode='40001';
    end if;
    v_created:=public.jd_workforce_create_team(p_actor,gen_random_uuid(),v_team_name,v_purpose);
    v_team_id:=(v_created->>'team_id')::uuid;
    if v_team_id is null then raise exception 'Team creation was not confirmed' using errcode='P0001'; end if;
    update public.jd_workforce_teams
    set department=v_department,coordinator_specialist_ref=v_specialist,
        responsibilities=coalesce(v_proposal->'responsibilities','[]'::jsonb),
        requested_access=coalesce(v_proposal->'requested_access','[]'::jsonb)
    where id=v_team_id and school_id=v_school;

    for v_member in select value from jsonb_array_elements(v_proposal->'members')
    loop
      v_member_index:=v_member_index+1;
      v_specialist:=v_member->>'specialist_ref';
      v_name:=btrim(coalesce(v_member->>'name',''));
      if jsonb_typeof(v_member) is distinct from 'object'
         or v_specialist is null or not (v_specialist=any(v_allowed))
         or length(v_name) not between 2 and 120
         or length(btrim(coalesce(v_member->>'role',''))) not between 2 and 120 then
        raise exception 'Every team member needs a supported specialist and complete role details' using errcode='22023';
      end if;
      if jsonb_typeof(v_member->'responsibilities') is distinct from 'array' then
        raise exception 'Team member responsibilities must be a list' using errcode='22023';
      end if;
      if v_member ? 'requested_access' and jsonb_typeof(v_member->'requested_access') is distinct from 'array' then
        raise exception 'Team member requested access must be a list' using errcode='22023';
      end if;
      if jsonb_array_length(v_member->'responsibilities')<1 then
        raise exception 'Every team member needs at least one responsibility' using errcode='22023';
      end if;
      v_created:=public.jd_workforce_create_employee(
        p_actor,gen_random_uuid(),'builtin',v_specialist,null,v_name,v_department
      );
      v_employee_id:=(v_created->>'employee_id')::uuid;
      if v_employee_id is null then raise exception 'A team employee identity was not confirmed' using errcode='P0001'; end if;
      update public.jd_workforce_employees
      set role_title=btrim(v_member->>'role'),purpose=v_purpose,
          responsibilities=coalesce(v_member->'responsibilities','[]'::jsonb),
          requested_access=coalesce(v_member->'requested_access','[]'::jsonb)
      where id=v_employee_id and school_id=v_school;
      perform public.jd_workforce_team_membership(
        p_actor,gen_random_uuid(),v_team_id,v_employee_id,'add',
        case when v_member_index=1 then 'lead' else 'member' end
      );
      v_employee_ids:=v_employee_ids||jsonb_build_array(jsonb_build_object(
        'employee_id',v_employee_id,'name',v_name,'role',v_member->>'role',
        'specialist_ref',v_specialist
      ));
    end loop;
  end if;

  v_receipt:=jsonb_build_object(
    'approval_id',p_approval,'kind',v_kind,'employee_ids',v_employee_ids,
    'team_id',v_team_id,'activated',true,'tools_granted',false,
    'connectors_authorised',false,'assignment_started',false,
    'billing_enabled',false,'billing_mode','shadow_only','replayed',false
  );
  insert into public.jd_workforce_proposal_activations(
    school_id,approval_id,request_id,actor_id,proposal_kind,receipt
  ) values(v_school,p_approval,p_request,p_actor,v_kind,v_receipt);

  update public.jd_approvals
  set execution_status='completed',execution_result_json=v_receipt,updated_at=clock_timestamp()
  where id=p_approval and school_id=v_school;
  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
  values(v_school,p_actor,v_approval.run_id,'workforce.proposal.activated',
    v_receipt||jsonb_build_object('request_id',p_request));
  return v_receipt;
end;
$function$;

revoke all on function public.jd_workforce_activate_approved_proposal(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.jd_workforce_activate_approved_proposal(uuid,uuid,uuid) to service_role;

create or replace function public.jd_decide_approval(
  p_approval_id uuid,p_actor_id uuid,p_decision text,p_note text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare
  v_school uuid;
  v_approval public.jd_approvals%rowtype;
  v_now timestamptz:=clock_timestamp();
begin
  if p_decision is null or p_decision not in ('approved','rejected') then
    raise exception 'Invalid approval decision' using errcode='22023';
  end if;
  select school_id into v_school from public.profiles
  where id=p_actor_id and role in ('owner','admin') for share;
  if v_school is null then raise exception 'Only workspace administrators can decide approvals' using errcode='42501'; end if;
  select * into v_approval from public.jd_approvals
  where id=p_approval_id and school_id=v_school for update;
  if not found then raise exception 'Approval request not found' using errcode='P0002'; end if;
  if v_approval.status<>'pending' then raise exception 'Approval request has already been decided' using errcode='40001'; end if;
  if v_approval.expires_at<=v_now then
    update public.jd_approvals set status='expired',updated_at=v_now
    where id=p_approval_id and school_id=v_school;
    insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
    values(v_school,p_actor_id,v_approval.run_id,'approval.expired',
      jsonb_build_object('approval_id',p_approval_id,'expired_by','decision_guard'));
    return jsonb_build_object('id',p_approval_id,'status','expired','execution_status',v_approval.execution_status);
  end if;
  update public.jd_approvals
  set status=p_decision,decided_by=p_actor_id,decision_note=left(coalesce(p_note,''),2000),
      decided_at=v_now,updated_at=v_now
  where id=p_approval_id and school_id=v_school returning * into v_approval;
  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
  values(v_school,p_actor_id,v_approval.run_id,'approval.'||p_decision,
    jsonb_build_object('approval_id',p_approval_id,'execution_status',v_approval.execution_status));
  return jsonb_build_object(
    'id',v_approval.id,'status',v_approval.status,'execution_status',v_approval.execution_status,
    'decided_by',v_approval.decided_by,'decided_at',v_approval.decided_at,
    'decision_note',v_approval.decision_note
  );
end;
$function$;
revoke all on function public.jd_decide_approval(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.jd_decide_approval(uuid,uuid,text,text) to service_role;

-- Only the approved activation RPC may call the lower-level identity creators.
revoke execute on function public.jd_workforce_create_employee(uuid,uuid,text,text,integer,text,text) from service_role;
revoke execute on function public.jd_workforce_create_team(uuid,uuid,text,text) from service_role;
 then (v_proposal->>'specialist_version')::integer else null end;
    if v_specialist_kind='builtin' then
      if v_specialist is null or not (v_specialist=any(v_allowed)) or v_specialist_version is not null then
        raise exception 'Choose an available built-in specialist before activation' using errcode='22023';
      end if;
      v_specialist_name:=replace(v_specialist,'_',' ');
    elsif v_specialist_kind='registry' then
      if v_specialist is null or v_specialist !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}
    v_employee_ids:=jsonb_build_array(jsonb_build_object(
      'employee_id',v_employee_id,'name',v_name,'specialist_ref',v_specialist
    ));
  else
    v_specialist:=v_proposal->>'specialist_ref';
    if v_specialist is null or not (v_specialist=any(v_allowed)) then
      raise exception 'A team coordinator must use a supported built-in specialist' using errcode='22023';
    end if;
    if jsonb_typeof(v_proposal->'members') is distinct from 'array' then
      raise exception 'A team must contain a member list' using errcode='22023';
    end if;
    if jsonb_array_length(v_proposal->'members') not between 1 and 20 then
      raise exception 'A team must contain between one and twenty described members' using errcode='22023';
    end if;
    v_team_name:=v_name;
    if exists(select 1 from public.jd_workforce_teams
      where school_id=v_school and lower(name)=lower(v_team_name) and retired_at is null) then
      raise exception 'An active team already uses this name; revise the proposal before activation' using errcode='40001';
    end if;
    v_created:=public.jd_workforce_create_team(p_actor,gen_random_uuid(),v_team_name,v_purpose);
    v_team_id:=(v_created->>'team_id')::uuid;
    if v_team_id is null then raise exception 'Team creation was not confirmed' using errcode='P0001'; end if;
    update public.jd_workforce_teams
    set department=v_department,coordinator_specialist_ref=v_specialist,
        responsibilities=coalesce(v_proposal->'responsibilities','[]'::jsonb),
        requested_access=coalesce(v_proposal->'requested_access','[]'::jsonb)
    where id=v_team_id and school_id=v_school;

    for v_member in select value from jsonb_array_elements(v_proposal->'members')
    loop
      v_member_index:=v_member_index+1;
      v_specialist:=v_member->>'specialist_ref';
      v_name:=btrim(coalesce(v_member->>'name',''));
      if jsonb_typeof(v_member) is distinct from 'object'
         or v_specialist is null or not (v_specialist=any(v_allowed))
         or length(v_name) not between 2 and 120
         or length(btrim(coalesce(v_member->>'role',''))) not between 2 and 120 then
        raise exception 'Every team member needs a supported specialist and complete role details' using errcode='22023';
      end if;
      if jsonb_typeof(v_member->'responsibilities') is distinct from 'array' then
        raise exception 'Team member responsibilities must be a list' using errcode='22023';
      end if;
      if v_member ? 'requested_access' and jsonb_typeof(v_member->'requested_access') is distinct from 'array' then
        raise exception 'Team member requested access must be a list' using errcode='22023';
      end if;
      if jsonb_array_length(v_member->'responsibilities')<1 then
        raise exception 'Every team member needs at least one responsibility' using errcode='22023';
      end if;
      v_created:=public.jd_workforce_create_employee(
        p_actor,gen_random_uuid(),'builtin',v_specialist,null,v_name,v_department
      );
      v_employee_id:=(v_created->>'employee_id')::uuid;
      if v_employee_id is null then raise exception 'A team employee identity was not confirmed' using errcode='P0001'; end if;
      update public.jd_workforce_employees
      set role_title=btrim(v_member->>'role'),purpose=v_purpose,
          responsibilities=coalesce(v_member->'responsibilities','[]'::jsonb),
          requested_access=coalesce(v_member->'requested_access','[]'::jsonb)
      where id=v_employee_id and school_id=v_school;
      perform public.jd_workforce_team_membership(
        p_actor,gen_random_uuid(),v_team_id,v_employee_id,'add',
        case when v_member_index=1 then 'lead' else 'member' end
      );
      v_employee_ids:=v_employee_ids||jsonb_build_array(jsonb_build_object(
        'employee_id',v_employee_id,'name',v_name,'role',v_member->>'role',
        'specialist_ref',v_specialist
      ));
    end loop;
  end if;

  v_receipt:=jsonb_build_object(
    'approval_id',p_approval,'kind',v_kind,'employee_ids',v_employee_ids,
    'team_id',v_team_id,'activated',true,'tools_granted',false,
    'connectors_authorised',false,'assignment_started',false,
    'billing_enabled',false,'billing_mode','shadow_only','replayed',false
  );
  insert into public.jd_workforce_proposal_activations(
    school_id,approval_id,request_id,actor_id,proposal_kind,receipt
  ) values(v_school,p_approval,p_request,p_actor,v_kind,v_receipt);

  update public.jd_approvals
  set execution_status='completed',execution_result_json=v_receipt,updated_at=clock_timestamp()
  where id=p_approval and school_id=v_school;
  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
  values(v_school,p_actor,v_approval.run_id,'workforce.proposal.activated',
    v_receipt||jsonb_build_object('request_id',p_request));
  return v_receipt;
end;
$function$;

revoke all on function public.jd_workforce_activate_approved_proposal(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.jd_workforce_activate_approved_proposal(uuid,uuid,uuid) to service_role;

create or replace function public.jd_decide_approval(
  p_approval_id uuid,p_actor_id uuid,p_decision text,p_note text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare
  v_school uuid;
  v_approval public.jd_approvals%rowtype;
  v_now timestamptz:=clock_timestamp();
begin
  if p_decision is null or p_decision not in ('approved','rejected') then
    raise exception 'Invalid approval decision' using errcode='22023';
  end if;
  select school_id into v_school from public.profiles
  where id=p_actor_id and role in ('owner','admin') for share;
  if v_school is null then raise exception 'Only workspace administrators can decide approvals' using errcode='42501'; end if;
  select * into v_approval from public.jd_approvals
  where id=p_approval_id and school_id=v_school for update;
  if not found then raise exception 'Approval request not found' using errcode='P0002'; end if;
  if v_approval.status<>'pending' then raise exception 'Approval request has already been decided' using errcode='40001'; end if;
  if v_approval.expires_at<=v_now then
    update public.jd_approvals set status='expired',updated_at=v_now
    where id=p_approval_id and school_id=v_school;
    insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
    values(v_school,p_actor_id,v_approval.run_id,'approval.expired',
      jsonb_build_object('approval_id',p_approval_id,'expired_by','decision_guard'));
    return jsonb_build_object('id',p_approval_id,'status','expired','execution_status',v_approval.execution_status);
  end if;
  update public.jd_approvals
  set status=p_decision,decided_by=p_actor_id,decision_note=left(coalesce(p_note,''),2000),
      decided_at=v_now,updated_at=v_now
  where id=p_approval_id and school_id=v_school returning * into v_approval;
  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
  values(v_school,p_actor_id,v_approval.run_id,'approval.'||p_decision,
    jsonb_build_object('approval_id',p_approval_id,'execution_status',v_approval.execution_status));
  return jsonb_build_object(
    'id',v_approval.id,'status',v_approval.status,'execution_status',v_approval.execution_status,
    'decided_by',v_approval.decided_by,'decided_at',v_approval.decided_at,
    'decision_note',v_approval.decision_note
  );
end;
$function$;
revoke all on function public.jd_decide_approval(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.jd_decide_approval(uuid,uuid,text,text) to service_role;

-- Only the approved activation RPC may call the lower-level identity creators.
revoke execute on function public.jd_workforce_create_employee(uuid,uuid,text,text,integer,text,text) from service_role;
revoke execute on function public.jd_workforce_create_team(uuid,uuid,text,text) from service_role;

         or v_specialist_version is null
         or not exists(select 1 from public.jd_agent_definitions a where a.id=v_specialist::uuid and a.school_id=v_school and a.state='published' and a.execution_authorized is true and a.current_version=v_specialist_version) then
        raise exception 'Registry specialist must be current, published and execution-authorized' using errcode='42501';
      end if;
      select v.content->>'name' into v_specialist_name from public.jd_agent_definition_versions v
      where v.agent_id=v_specialist::uuid and v.school_id=v_school and v.version=v_specialist_version;
    else
      raise exception 'Unknown specialist kind' using errcode='22023';
    end if;
    v_created:=public.jd_workforce_create_employee(
      p_actor,gen_random_uuid(),v_specialist_kind,v_specialist,v_specialist_version,v_name,v_department
    );
    v_employee_id:=(v_created->>'employee_id')::uuid;
    if v_employee_id is null then raise exception 'Employee identity creation was not confirmed' using errcode='P0001'; end if;
    update public.jd_workforce_employees
    set role_title=coalesce(v_specialist_name,replace(v_specialist,'_',' ')),purpose=v_purpose,
        responsibilities=coalesce(v_proposal->'responsibilities','[]'::jsonb),
        requested_access=coalesce(v_proposal->'requested_access','[]'::jsonb)
    where id=v_employee_id and school_id=v_school;
    v_employee_ids:=jsonb_build_array(jsonb_build_object(
      'employee_id',v_employee_id,'name',v_name,'specialist_ref',v_specialist
    ));
  else
    v_specialist:=v_proposal->>'specialist_ref';
    if v_specialist is null or not (v_specialist=any(v_allowed)) then
      raise exception 'A team coordinator must use a supported built-in specialist' using errcode='22023';
    end if;
    if jsonb_typeof(v_proposal->'members') is distinct from 'array' then
      raise exception 'A team must contain a member list' using errcode='22023';
    end if;
    if jsonb_array_length(v_proposal->'members') not between 1 and 20 then
      raise exception 'A team must contain between one and twenty described members' using errcode='22023';
    end if;
    v_team_name:=v_name;
    if exists(select 1 from public.jd_workforce_teams
      where school_id=v_school and lower(name)=lower(v_team_name) and retired_at is null) then
      raise exception 'An active team already uses this name; revise the proposal before activation' using errcode='40001';
    end if;
    v_created:=public.jd_workforce_create_team(p_actor,gen_random_uuid(),v_team_name,v_purpose);
    v_team_id:=(v_created->>'team_id')::uuid;
    if v_team_id is null then raise exception 'Team creation was not confirmed' using errcode='P0001'; end if;
    update public.jd_workforce_teams
    set department=v_department,coordinator_specialist_ref=v_specialist,
        responsibilities=coalesce(v_proposal->'responsibilities','[]'::jsonb),
        requested_access=coalesce(v_proposal->'requested_access','[]'::jsonb)
    where id=v_team_id and school_id=v_school;

    for v_member in select value from jsonb_array_elements(v_proposal->'members')
    loop
      v_member_index:=v_member_index+1;
      v_specialist:=v_member->>'specialist_ref';
      v_name:=btrim(coalesce(v_member->>'name',''));
      if jsonb_typeof(v_member) is distinct from 'object'
         or v_specialist is null or not (v_specialist=any(v_allowed))
         or length(v_name) not between 2 and 120
         or length(btrim(coalesce(v_member->>'role',''))) not between 2 and 120 then
        raise exception 'Every team member needs a supported specialist and complete role details' using errcode='22023';
      end if;
      if jsonb_typeof(v_member->'responsibilities') is distinct from 'array' then
        raise exception 'Team member responsibilities must be a list' using errcode='22023';
      end if;
      if v_member ? 'requested_access' and jsonb_typeof(v_member->'requested_access') is distinct from 'array' then
        raise exception 'Team member requested access must be a list' using errcode='22023';
      end if;
      if jsonb_array_length(v_member->'responsibilities')<1 then
        raise exception 'Every team member needs at least one responsibility' using errcode='22023';
      end if;
      v_created:=public.jd_workforce_create_employee(
        p_actor,gen_random_uuid(),'builtin',v_specialist,null,v_name,v_department
      );
      v_employee_id:=(v_created->>'employee_id')::uuid;
      if v_employee_id is null then raise exception 'A team employee identity was not confirmed' using errcode='P0001'; end if;
      update public.jd_workforce_employees
      set role_title=btrim(v_member->>'role'),purpose=v_purpose,
          responsibilities=coalesce(v_member->'responsibilities','[]'::jsonb),
          requested_access=coalesce(v_member->'requested_access','[]'::jsonb)
      where id=v_employee_id and school_id=v_school;
      perform public.jd_workforce_team_membership(
        p_actor,gen_random_uuid(),v_team_id,v_employee_id,'add',
        case when v_member_index=1 then 'lead' else 'member' end
      );
      v_employee_ids:=v_employee_ids||jsonb_build_array(jsonb_build_object(
        'employee_id',v_employee_id,'name',v_name,'role',v_member->>'role',
        'specialist_ref',v_specialist
      ));
    end loop;
  end if;

  v_receipt:=jsonb_build_object(
    'approval_id',p_approval,'kind',v_kind,'employee_ids',v_employee_ids,
    'team_id',v_team_id,'activated',true,'tools_granted',false,
    'connectors_authorised',false,'assignment_started',false,
    'billing_enabled',false,'billing_mode','shadow_only','replayed',false
  );
  insert into public.jd_workforce_proposal_activations(
    school_id,approval_id,request_id,actor_id,proposal_kind,receipt
  ) values(v_school,p_approval,p_request,p_actor,v_kind,v_receipt);

  update public.jd_approvals
  set execution_status='completed',execution_result_json=v_receipt,updated_at=clock_timestamp()
  where id=p_approval and school_id=v_school;
  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
  values(v_school,p_actor,v_approval.run_id,'workforce.proposal.activated',
    v_receipt||jsonb_build_object('request_id',p_request));
  return v_receipt;
end;
$function$;

revoke all on function public.jd_workforce_activate_approved_proposal(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.jd_workforce_activate_approved_proposal(uuid,uuid,uuid) to service_role;

create or replace function public.jd_decide_approval(
  p_approval_id uuid,p_actor_id uuid,p_decision text,p_note text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare
  v_school uuid;
  v_approval public.jd_approvals%rowtype;
  v_now timestamptz:=clock_timestamp();
begin
  if p_decision is null or p_decision not in ('approved','rejected') then
    raise exception 'Invalid approval decision' using errcode='22023';
  end if;
  select school_id into v_school from public.profiles
  where id=p_actor_id and role in ('owner','admin') for share;
  if v_school is null then raise exception 'Only workspace administrators can decide approvals' using errcode='42501'; end if;
  select * into v_approval from public.jd_approvals
  where id=p_approval_id and school_id=v_school for update;
  if not found then raise exception 'Approval request not found' using errcode='P0002'; end if;
  if v_approval.status<>'pending' then raise exception 'Approval request has already been decided' using errcode='40001'; end if;
  if v_approval.expires_at<=v_now then
    update public.jd_approvals set status='expired',updated_at=v_now
    where id=p_approval_id and school_id=v_school;
    insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
    values(v_school,p_actor_id,v_approval.run_id,'approval.expired',
      jsonb_build_object('approval_id',p_approval_id,'expired_by','decision_guard'));
    return jsonb_build_object('id',p_approval_id,'status','expired','execution_status',v_approval.execution_status);
  end if;
  update public.jd_approvals
  set status=p_decision,decided_by=p_actor_id,decision_note=left(coalesce(p_note,''),2000),
      decided_at=v_now,updated_at=v_now
  where id=p_approval_id and school_id=v_school returning * into v_approval;
  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
  values(v_school,p_actor_id,v_approval.run_id,'approval.'||p_decision,
    jsonb_build_object('approval_id',p_approval_id,'execution_status',v_approval.execution_status));
  return jsonb_build_object(
    'id',v_approval.id,'status',v_approval.status,'execution_status',v_approval.execution_status,
    'decided_by',v_approval.decided_by,'decided_at',v_approval.decided_at,
    'decision_note',v_approval.decision_note
  );
end;
$function$;
revoke all on function public.jd_decide_approval(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.jd_decide_approval(uuid,uuid,text,text) to service_role;

-- Only the approved activation RPC may call the lower-level identity creators.
revoke execute on function public.jd_workforce_create_employee(uuid,uuid,text,text,integer,text,text) from service_role;
revoke execute on function public.jd_workforce_create_team(uuid,uuid,text,text) from service_role;

         or v_specialist_version is null
         or not exists(select 1 from public.jd_agent_definitions a where a.id=v_specialist::uuid and a.school_id=v_school and a.state='published' and a.execution_authorized is true and a.current_version=v_specialist_version) then
        raise exception 'Registry team coordinator must be current, published and execution-authorized' using errcode='42501';
      end if;
      select v.content->>'name' into v_specialist_name from public.jd_agent_definition_versions v
      where v.agent_id=v_specialist::uuid and v.school_id=v_school and v.version=v_specialist_version;
    else
      raise exception 'Unknown team coordinator specialist kind' using errcode='22023';
    end if;
    if jsonb_typeof(v_proposal->'members') is distinct from 'array' then
      raise exception 'A team must contain a member list' using errcode='22023';
    end if;
    if jsonb_array_length(v_proposal->'members') not between 1 and 20 then
      raise exception 'A team must contain between one and twenty described members' using errcode='22023';
    end if;
    v_team_name:=v_name;
    if exists(select 1 from public.jd_workforce_teams
      where school_id=v_school and lower(name)=lower(v_team_name) and retired_at is null) then
      raise exception 'An active team already uses this name; revise the proposal before activation' using errcode='40001';
    end if;
    v_created:=public.jd_workforce_create_team(p_actor,gen_random_uuid(),v_team_name,v_purpose);
    v_team_id:=(v_created->>'team_id')::uuid;
    if v_team_id is null then raise exception 'Team creation was not confirmed' using errcode='P0001'; end if;
    update public.jd_workforce_teams
    set department=v_department,coordinator_specialist_ref=v_specialist,
        responsibilities=coalesce(v_proposal->'responsibilities','[]'::jsonb),
        requested_access=coalesce(v_proposal->'requested_access','[]'::jsonb)
    where id=v_team_id and school_id=v_school;

    for v_member in select value from jsonb_array_elements(v_proposal->'members')
    loop
      v_member_index:=v_member_index+1;
      v_specialist:=v_member->>'specialist_ref';
      v_name:=btrim(coalesce(v_member->>'name',''));
      if jsonb_typeof(v_member) is distinct from 'object'
         or v_specialist is null or not (v_specialist=any(v_allowed))
         or length(v_name) not between 2 and 120
         or length(btrim(coalesce(v_member->>'role',''))) not between 2 and 120 then
        raise exception 'Every team member needs a supported specialist and complete role details' using errcode='22023';
      end if;
      if jsonb_typeof(v_member->'responsibilities') is distinct from 'array' then
        raise exception 'Team member responsibilities must be a list' using errcode='22023';
      end if;
      if v_member ? 'requested_access' and jsonb_typeof(v_member->'requested_access') is distinct from 'array' then
        raise exception 'Team member requested access must be a list' using errcode='22023';
      end if;
      if jsonb_array_length(v_member->'responsibilities')<1 then
        raise exception 'Every team member needs at least one responsibility' using errcode='22023';
      end if;
      v_created:=public.jd_workforce_create_employee(
        p_actor,gen_random_uuid(),'builtin',v_specialist,null,v_name,v_department
      );
      v_employee_id:=(v_created->>'employee_id')::uuid;
      if v_employee_id is null then raise exception 'A team employee identity was not confirmed' using errcode='P0001'; end if;
      update public.jd_workforce_employees
      set role_title=btrim(v_member->>'role'),purpose=v_purpose,
          responsibilities=coalesce(v_member->'responsibilities','[]'::jsonb),
          requested_access=coalesce(v_member->'requested_access','[]'::jsonb)
      where id=v_employee_id and school_id=v_school;
      perform public.jd_workforce_team_membership(
        p_actor,gen_random_uuid(),v_team_id,v_employee_id,'add',
        case when v_member_index=1 then 'lead' else 'member' end
      );
      v_employee_ids:=v_employee_ids||jsonb_build_array(jsonb_build_object(
        'employee_id',v_employee_id,'name',v_name,'role',v_member->>'role',
        'specialist_ref',v_specialist
      ));
    end loop;
  end if;

  v_receipt:=jsonb_build_object(
    'approval_id',p_approval,'kind',v_kind,'employee_ids',v_employee_ids,
    'team_id',v_team_id,'activated',true,'tools_granted',false,
    'connectors_authorised',false,'assignment_started',false,
    'billing_enabled',false,'billing_mode','shadow_only','replayed',false
  );
  insert into public.jd_workforce_proposal_activations(
    school_id,approval_id,request_id,actor_id,proposal_kind,receipt
  ) values(v_school,p_approval,p_request,p_actor,v_kind,v_receipt);

  update public.jd_approvals
  set execution_status='completed',execution_result_json=v_receipt,updated_at=clock_timestamp()
  where id=p_approval and school_id=v_school;
  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
  values(v_school,p_actor,v_approval.run_id,'workforce.proposal.activated',
    v_receipt||jsonb_build_object('request_id',p_request));
  return v_receipt;
end;
$function$;

revoke all on function public.jd_workforce_activate_approved_proposal(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.jd_workforce_activate_approved_proposal(uuid,uuid,uuid) to service_role;

create or replace function public.jd_decide_approval(
  p_approval_id uuid,p_actor_id uuid,p_decision text,p_note text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare
  v_school uuid;
  v_approval public.jd_approvals%rowtype;
  v_now timestamptz:=clock_timestamp();
begin
  if p_decision is null or p_decision not in ('approved','rejected') then
    raise exception 'Invalid approval decision' using errcode='22023';
  end if;
  select school_id into v_school from public.profiles
  where id=p_actor_id and role in ('owner','admin') for share;
  if v_school is null then raise exception 'Only workspace administrators can decide approvals' using errcode='42501'; end if;
  select * into v_approval from public.jd_approvals
  where id=p_approval_id and school_id=v_school for update;
  if not found then raise exception 'Approval request not found' using errcode='P0002'; end if;
  if v_approval.status<>'pending' then raise exception 'Approval request has already been decided' using errcode='40001'; end if;
  if v_approval.expires_at<=v_now then
    update public.jd_approvals set status='expired',updated_at=v_now
    where id=p_approval_id and school_id=v_school;
    insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
    values(v_school,p_actor_id,v_approval.run_id,'approval.expired',
      jsonb_build_object('approval_id',p_approval_id,'expired_by','decision_guard'));
    return jsonb_build_object('id',p_approval_id,'status','expired','execution_status',v_approval.execution_status);
  end if;
  update public.jd_approvals
  set status=p_decision,decided_by=p_actor_id,decision_note=left(coalesce(p_note,''),2000),
      decided_at=v_now,updated_at=v_now
  where id=p_approval_id and school_id=v_school returning * into v_approval;
  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
  values(v_school,p_actor_id,v_approval.run_id,'approval.'||p_decision,
    jsonb_build_object('approval_id',p_approval_id,'execution_status',v_approval.execution_status));
  return jsonb_build_object(
    'id',v_approval.id,'status',v_approval.status,'execution_status',v_approval.execution_status,
    'decided_by',v_approval.decided_by,'decided_at',v_approval.decided_at,
    'decision_note',v_approval.decision_note
  );
end;
$function$;
revoke all on function public.jd_decide_approval(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.jd_decide_approval(uuid,uuid,text,text) to service_role;

-- Only the approved activation RPC may call the lower-level identity creators.
revoke execute on function public.jd_workforce_create_employee(uuid,uuid,text,text,integer,text,text) from service_role;
revoke execute on function public.jd_workforce_create_team(uuid,uuid,text,text) from service_role;
 then (v_proposal->>'specialist_version')::integer else null end;
    if v_specialist_kind='builtin' then
      if v_specialist is null or not (v_specialist=any(v_allowed)) or v_specialist_version is not null then
        raise exception 'Choose an available built-in specialist before activation' using errcode='22023';
      end if;
      v_specialist_name:=replace(v_specialist,'_',' ');
    elsif v_specialist_kind='registry' then
      if v_specialist is null or v_specialist !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}
    v_employee_ids:=jsonb_build_array(jsonb_build_object(
      'employee_id',v_employee_id,'name',v_name,'specialist_ref',v_specialist
    ));
  else
    v_specialist:=v_proposal->>'specialist_ref';
    if v_specialist is null or not (v_specialist=any(v_allowed)) then
      raise exception 'A team coordinator must use a supported built-in specialist' using errcode='22023';
    end if;
    if jsonb_typeof(v_proposal->'members') is distinct from 'array' then
      raise exception 'A team must contain a member list' using errcode='22023';
    end if;
    if jsonb_array_length(v_proposal->'members') not between 1 and 20 then
      raise exception 'A team must contain between one and twenty described members' using errcode='22023';
    end if;
    v_team_name:=v_name;
    if exists(select 1 from public.jd_workforce_teams
      where school_id=v_school and lower(name)=lower(v_team_name) and retired_at is null) then
      raise exception 'An active team already uses this name; revise the proposal before activation' using errcode='40001';
    end if;
    v_created:=public.jd_workforce_create_team(p_actor,gen_random_uuid(),v_team_name,v_purpose);
    v_team_id:=(v_created->>'team_id')::uuid;
    if v_team_id is null then raise exception 'Team creation was not confirmed' using errcode='P0001'; end if;
    update public.jd_workforce_teams
    set department=v_department,coordinator_specialist_ref=v_specialist,
        responsibilities=coalesce(v_proposal->'responsibilities','[]'::jsonb),
        requested_access=coalesce(v_proposal->'requested_access','[]'::jsonb)
    where id=v_team_id and school_id=v_school;

    for v_member in select value from jsonb_array_elements(v_proposal->'members')
    loop
      v_member_index:=v_member_index+1;
      v_specialist:=v_member->>'specialist_ref';
      v_name:=btrim(coalesce(v_member->>'name',''));
      if jsonb_typeof(v_member) is distinct from 'object'
         or v_specialist is null or not (v_specialist=any(v_allowed))
         or length(v_name) not between 2 and 120
         or length(btrim(coalesce(v_member->>'role',''))) not between 2 and 120 then
        raise exception 'Every team member needs a supported specialist and complete role details' using errcode='22023';
      end if;
      if jsonb_typeof(v_member->'responsibilities') is distinct from 'array' then
        raise exception 'Team member responsibilities must be a list' using errcode='22023';
      end if;
      if v_member ? 'requested_access' and jsonb_typeof(v_member->'requested_access') is distinct from 'array' then
        raise exception 'Team member requested access must be a list' using errcode='22023';
      end if;
      if jsonb_array_length(v_member->'responsibilities')<1 then
        raise exception 'Every team member needs at least one responsibility' using errcode='22023';
      end if;
      v_created:=public.jd_workforce_create_employee(
        p_actor,gen_random_uuid(),'builtin',v_specialist,null,v_name,v_department
      );
      v_employee_id:=(v_created->>'employee_id')::uuid;
      if v_employee_id is null then raise exception 'A team employee identity was not confirmed' using errcode='P0001'; end if;
      update public.jd_workforce_employees
      set role_title=btrim(v_member->>'role'),purpose=v_purpose,
          responsibilities=coalesce(v_member->'responsibilities','[]'::jsonb),
          requested_access=coalesce(v_member->'requested_access','[]'::jsonb)
      where id=v_employee_id and school_id=v_school;
      perform public.jd_workforce_team_membership(
        p_actor,gen_random_uuid(),v_team_id,v_employee_id,'add',
        case when v_member_index=1 then 'lead' else 'member' end
      );
      v_employee_ids:=v_employee_ids||jsonb_build_array(jsonb_build_object(
        'employee_id',v_employee_id,'name',v_name,'role',v_member->>'role',
        'specialist_ref',v_specialist
      ));
    end loop;
  end if;

  v_receipt:=jsonb_build_object(
    'approval_id',p_approval,'kind',v_kind,'employee_ids',v_employee_ids,
    'team_id',v_team_id,'activated',true,'tools_granted',false,
    'connectors_authorised',false,'assignment_started',false,
    'billing_enabled',false,'billing_mode','shadow_only','replayed',false
  );
  insert into public.jd_workforce_proposal_activations(
    school_id,approval_id,request_id,actor_id,proposal_kind,receipt
  ) values(v_school,p_approval,p_request,p_actor,v_kind,v_receipt);

  update public.jd_approvals
  set execution_status='completed',execution_result_json=v_receipt,updated_at=clock_timestamp()
  where id=p_approval and school_id=v_school;
  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
  values(v_school,p_actor,v_approval.run_id,'workforce.proposal.activated',
    v_receipt||jsonb_build_object('request_id',p_request));
  return v_receipt;
end;
$function$;

revoke all on function public.jd_workforce_activate_approved_proposal(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.jd_workforce_activate_approved_proposal(uuid,uuid,uuid) to service_role;

create or replace function public.jd_decide_approval(
  p_approval_id uuid,p_actor_id uuid,p_decision text,p_note text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare
  v_school uuid;
  v_approval public.jd_approvals%rowtype;
  v_now timestamptz:=clock_timestamp();
begin
  if p_decision is null or p_decision not in ('approved','rejected') then
    raise exception 'Invalid approval decision' using errcode='22023';
  end if;
  select school_id into v_school from public.profiles
  where id=p_actor_id and role in ('owner','admin') for share;
  if v_school is null then raise exception 'Only workspace administrators can decide approvals' using errcode='42501'; end if;
  select * into v_approval from public.jd_approvals
  where id=p_approval_id and school_id=v_school for update;
  if not found then raise exception 'Approval request not found' using errcode='P0002'; end if;
  if v_approval.status<>'pending' then raise exception 'Approval request has already been decided' using errcode='40001'; end if;
  if v_approval.expires_at<=v_now then
    update public.jd_approvals set status='expired',updated_at=v_now
    where id=p_approval_id and school_id=v_school;
    insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
    values(v_school,p_actor_id,v_approval.run_id,'approval.expired',
      jsonb_build_object('approval_id',p_approval_id,'expired_by','decision_guard'));
    return jsonb_build_object('id',p_approval_id,'status','expired','execution_status',v_approval.execution_status);
  end if;
  update public.jd_approvals
  set status=p_decision,decided_by=p_actor_id,decision_note=left(coalesce(p_note,''),2000),
      decided_at=v_now,updated_at=v_now
  where id=p_approval_id and school_id=v_school returning * into v_approval;
  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
  values(v_school,p_actor_id,v_approval.run_id,'approval.'||p_decision,
    jsonb_build_object('approval_id',p_approval_id,'execution_status',v_approval.execution_status));
  return jsonb_build_object(
    'id',v_approval.id,'status',v_approval.status,'execution_status',v_approval.execution_status,
    'decided_by',v_approval.decided_by,'decided_at',v_approval.decided_at,
    'decision_note',v_approval.decision_note
  );
end;
$function$;
revoke all on function public.jd_decide_approval(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.jd_decide_approval(uuid,uuid,text,text) to service_role;

-- Only the approved activation RPC may call the lower-level identity creators.
revoke execute on function public.jd_workforce_create_employee(uuid,uuid,text,text,integer,text,text) from service_role;
revoke execute on function public.jd_workforce_create_team(uuid,uuid,text,text) from service_role;

         or v_specialist_version is null
         or not exists(select 1 from public.jd_agent_definitions a where a.id=v_specialist::uuid and a.school_id=v_school and a.state='published' and a.execution_authorized is true and a.current_version=v_specialist_version) then
        raise exception 'Registry specialist must be current, published and execution-authorized' using errcode='42501';
      end if;
      select v.content->>'name' into v_specialist_name from public.jd_agent_definition_versions v
      where v.agent_id=v_specialist::uuid and v.school_id=v_school and v.version=v_specialist_version;
    else
      raise exception 'Unknown specialist kind' using errcode='22023';
    end if;
    v_created:=public.jd_workforce_create_employee(
      p_actor,gen_random_uuid(),v_specialist_kind,v_specialist,v_specialist_version,v_name,v_department
    );
    v_employee_id:=(v_created->>'employee_id')::uuid;
    if v_employee_id is null then raise exception 'Employee identity creation was not confirmed' using errcode='P0001'; end if;
    update public.jd_workforce_employees
    set role_title=coalesce(v_specialist_name,replace(v_specialist,'_',' ')),purpose=v_purpose,
        responsibilities=coalesce(v_proposal->'responsibilities','[]'::jsonb),
        requested_access=coalesce(v_proposal->'requested_access','[]'::jsonb)
    where id=v_employee_id and school_id=v_school;
    v_employee_ids:=jsonb_build_array(jsonb_build_object(
      'employee_id',v_employee_id,'name',v_name,'specialist_ref',v_specialist
    ));
  else
    v_specialist:=v_proposal->>'specialist_ref';
    if v_specialist is null or not (v_specialist=any(v_allowed)) then
      raise exception 'A team coordinator must use a supported built-in specialist' using errcode='22023';
    end if;
    if jsonb_typeof(v_proposal->'members') is distinct from 'array' then
      raise exception 'A team must contain a member list' using errcode='22023';
    end if;
    if jsonb_array_length(v_proposal->'members') not between 1 and 20 then
      raise exception 'A team must contain between one and twenty described members' using errcode='22023';
    end if;
    v_team_name:=v_name;
    if exists(select 1 from public.jd_workforce_teams
      where school_id=v_school and lower(name)=lower(v_team_name) and retired_at is null) then
      raise exception 'An active team already uses this name; revise the proposal before activation' using errcode='40001';
    end if;
    v_created:=public.jd_workforce_create_team(p_actor,gen_random_uuid(),v_team_name,v_purpose);
    v_team_id:=(v_created->>'team_id')::uuid;
    if v_team_id is null then raise exception 'Team creation was not confirmed' using errcode='P0001'; end if;
    update public.jd_workforce_teams
    set department=v_department,coordinator_specialist_ref=v_specialist,
        responsibilities=coalesce(v_proposal->'responsibilities','[]'::jsonb),
        requested_access=coalesce(v_proposal->'requested_access','[]'::jsonb)
    where id=v_team_id and school_id=v_school;

    for v_member in select value from jsonb_array_elements(v_proposal->'members')
    loop
      v_member_index:=v_member_index+1;
      v_specialist:=v_member->>'specialist_ref';
      v_name:=btrim(coalesce(v_member->>'name',''));
      if jsonb_typeof(v_member) is distinct from 'object'
         or v_specialist is null or not (v_specialist=any(v_allowed))
         or length(v_name) not between 2 and 120
         or length(btrim(coalesce(v_member->>'role',''))) not between 2 and 120 then
        raise exception 'Every team member needs a supported specialist and complete role details' using errcode='22023';
      end if;
      if jsonb_typeof(v_member->'responsibilities') is distinct from 'array' then
        raise exception 'Team member responsibilities must be a list' using errcode='22023';
      end if;
      if v_member ? 'requested_access' and jsonb_typeof(v_member->'requested_access') is distinct from 'array' then
        raise exception 'Team member requested access must be a list' using errcode='22023';
      end if;
      if jsonb_array_length(v_member->'responsibilities')<1 then
        raise exception 'Every team member needs at least one responsibility' using errcode='22023';
      end if;
      v_created:=public.jd_workforce_create_employee(
        p_actor,gen_random_uuid(),'builtin',v_specialist,null,v_name,v_department
      );
      v_employee_id:=(v_created->>'employee_id')::uuid;
      if v_employee_id is null then raise exception 'A team employee identity was not confirmed' using errcode='P0001'; end if;
      update public.jd_workforce_employees
      set role_title=btrim(v_member->>'role'),purpose=v_purpose,
          responsibilities=coalesce(v_member->'responsibilities','[]'::jsonb),
          requested_access=coalesce(v_member->'requested_access','[]'::jsonb)
      where id=v_employee_id and school_id=v_school;
      perform public.jd_workforce_team_membership(
        p_actor,gen_random_uuid(),v_team_id,v_employee_id,'add',
        case when v_member_index=1 then 'lead' else 'member' end
      );
      v_employee_ids:=v_employee_ids||jsonb_build_array(jsonb_build_object(
        'employee_id',v_employee_id,'name',v_name,'role',v_member->>'role',
        'specialist_ref',v_specialist
      ));
    end loop;
  end if;

  v_receipt:=jsonb_build_object(
    'approval_id',p_approval,'kind',v_kind,'employee_ids',v_employee_ids,
    'team_id',v_team_id,'activated',true,'tools_granted',false,
    'connectors_authorised',false,'assignment_started',false,
    'billing_enabled',false,'billing_mode','shadow_only','replayed',false
  );
  insert into public.jd_workforce_proposal_activations(
    school_id,approval_id,request_id,actor_id,proposal_kind,receipt
  ) values(v_school,p_approval,p_request,p_actor,v_kind,v_receipt);

  update public.jd_approvals
  set execution_status='completed',execution_result_json=v_receipt,updated_at=clock_timestamp()
  where id=p_approval and school_id=v_school;
  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
  values(v_school,p_actor,v_approval.run_id,'workforce.proposal.activated',
    v_receipt||jsonb_build_object('request_id',p_request));
  return v_receipt;
end;
$function$;

revoke all on function public.jd_workforce_activate_approved_proposal(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.jd_workforce_activate_approved_proposal(uuid,uuid,uuid) to service_role;

create or replace function public.jd_decide_approval(
  p_approval_id uuid,p_actor_id uuid,p_decision text,p_note text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare
  v_school uuid;
  v_approval public.jd_approvals%rowtype;
  v_now timestamptz:=clock_timestamp();
begin
  if p_decision is null or p_decision not in ('approved','rejected') then
    raise exception 'Invalid approval decision' using errcode='22023';
  end if;
  select school_id into v_school from public.profiles
  where id=p_actor_id and role in ('owner','admin') for share;
  if v_school is null then raise exception 'Only workspace administrators can decide approvals' using errcode='42501'; end if;
  select * into v_approval from public.jd_approvals
  where id=p_approval_id and school_id=v_school for update;
  if not found then raise exception 'Approval request not found' using errcode='P0002'; end if;
  if v_approval.status<>'pending' then raise exception 'Approval request has already been decided' using errcode='40001'; end if;
  if v_approval.expires_at<=v_now then
    update public.jd_approvals set status='expired',updated_at=v_now
    where id=p_approval_id and school_id=v_school;
    insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
    values(v_school,p_actor_id,v_approval.run_id,'approval.expired',
      jsonb_build_object('approval_id',p_approval_id,'expired_by','decision_guard'));
    return jsonb_build_object('id',p_approval_id,'status','expired','execution_status',v_approval.execution_status);
  end if;
  update public.jd_approvals
  set status=p_decision,decided_by=p_actor_id,decision_note=left(coalesce(p_note,''),2000),
      decided_at=v_now,updated_at=v_now
  where id=p_approval_id and school_id=v_school returning * into v_approval;
  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
  values(v_school,p_actor_id,v_approval.run_id,'approval.'||p_decision,
    jsonb_build_object('approval_id',p_approval_id,'execution_status',v_approval.execution_status));
  return jsonb_build_object(
    'id',v_approval.id,'status',v_approval.status,'execution_status',v_approval.execution_status,
    'decided_by',v_approval.decided_by,'decided_at',v_approval.decided_at,
    'decision_note',v_approval.decision_note
  );
end;
$function$;
revoke all on function public.jd_decide_approval(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.jd_decide_approval(uuid,uuid,text,text) to service_role;

-- Only the approved activation RPC may call the lower-level identity creators.
revoke execute on function public.jd_workforce_create_employee(uuid,uuid,text,text,integer,text,text) from service_role;
revoke execute on function public.jd_workforce_create_team(uuid,uuid,text,text) from service_role;
 then (v_member->>'specialist_version')::integer else null end;
      v_name:=btrim(coalesce(v_member->>'name',''));
      if jsonb_typeof(v_member) is distinct from 'object'
         or length(v_name) not between 2 and 120
         or length(btrim(coalesce(v_member->>'role',''))) not between 2 and 120 then
        raise exception 'Every team member needs a supported specialist and complete role details' using errcode='22023';
      end if;
      if v_specialist_kind='builtin' then
        if v_specialist is null or not (v_specialist=any(v_allowed)) or v_specialist_version is not null then
          raise exception 'Team member must use a supported built-in specialist' using errcode='22023';
        end if;
        v_specialist_name:=replace(v_specialist,'_',' ');
      elsif v_specialist_kind='registry' then
        if v_specialist is null or v_specialist !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}
        raise exception 'Team member responsibilities must be a list' using errcode='22023';
      end if;
      if v_member ? 'requested_access' and jsonb_typeof(v_member->'requested_access') is distinct from 'array' then
        raise exception 'Team member requested access must be a list' using errcode='22023';
      end if;
      if jsonb_array_length(v_member->'responsibilities')<1 then
        raise exception 'Every team member needs at least one responsibility' using errcode='22023';
      end if;
      v_created:=public.jd_workforce_create_employee(
        p_actor,gen_random_uuid(),'builtin',v_specialist,null,v_name,v_department
      );
      v_employee_id:=(v_created->>'employee_id')::uuid;
      if v_employee_id is null then raise exception 'A team employee identity was not confirmed' using errcode='P0001'; end if;
      update public.jd_workforce_employees
      set role_title=btrim(v_member->>'role'),purpose=v_purpose,
          responsibilities=coalesce(v_member->'responsibilities','[]'::jsonb),
          requested_access=coalesce(v_member->'requested_access','[]'::jsonb)
      where id=v_employee_id and school_id=v_school;
      perform public.jd_workforce_team_membership(
        p_actor,gen_random_uuid(),v_team_id,v_employee_id,'add',
        case when v_member_index=1 then 'lead' else 'member' end
      );
      v_employee_ids:=v_employee_ids||jsonb_build_array(jsonb_build_object(
        'employee_id',v_employee_id,'name',v_name,'role',v_member->>'role',
        'specialist_ref',v_specialist
      ));
    end loop;
  end if;

  v_receipt:=jsonb_build_object(
    'approval_id',p_approval,'kind',v_kind,'employee_ids',v_employee_ids,
    'team_id',v_team_id,'activated',true,'tools_granted',false,
    'connectors_authorised',false,'assignment_started',false,
    'billing_enabled',false,'billing_mode','shadow_only','replayed',false
  );
  insert into public.jd_workforce_proposal_activations(
    school_id,approval_id,request_id,actor_id,proposal_kind,receipt
  ) values(v_school,p_approval,p_request,p_actor,v_kind,v_receipt);

  update public.jd_approvals
  set execution_status='completed',execution_result_json=v_receipt,updated_at=clock_timestamp()
  where id=p_approval and school_id=v_school;
  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
  values(v_school,p_actor,v_approval.run_id,'workforce.proposal.activated',
    v_receipt||jsonb_build_object('request_id',p_request));
  return v_receipt;
end;
$function$;

revoke all on function public.jd_workforce_activate_approved_proposal(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.jd_workforce_activate_approved_proposal(uuid,uuid,uuid) to service_role;

create or replace function public.jd_decide_approval(
  p_approval_id uuid,p_actor_id uuid,p_decision text,p_note text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare
  v_school uuid;
  v_approval public.jd_approvals%rowtype;
  v_now timestamptz:=clock_timestamp();
begin
  if p_decision is null or p_decision not in ('approved','rejected') then
    raise exception 'Invalid approval decision' using errcode='22023';
  end if;
  select school_id into v_school from public.profiles
  where id=p_actor_id and role in ('owner','admin') for share;
  if v_school is null then raise exception 'Only workspace administrators can decide approvals' using errcode='42501'; end if;
  select * into v_approval from public.jd_approvals
  where id=p_approval_id and school_id=v_school for update;
  if not found then raise exception 'Approval request not found' using errcode='P0002'; end if;
  if v_approval.status<>'pending' then raise exception 'Approval request has already been decided' using errcode='40001'; end if;
  if v_approval.expires_at<=v_now then
    update public.jd_approvals set status='expired',updated_at=v_now
    where id=p_approval_id and school_id=v_school;
    insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
    values(v_school,p_actor_id,v_approval.run_id,'approval.expired',
      jsonb_build_object('approval_id',p_approval_id,'expired_by','decision_guard'));
    return jsonb_build_object('id',p_approval_id,'status','expired','execution_status',v_approval.execution_status);
  end if;
  update public.jd_approvals
  set status=p_decision,decided_by=p_actor_id,decision_note=left(coalesce(p_note,''),2000),
      decided_at=v_now,updated_at=v_now
  where id=p_approval_id and school_id=v_school returning * into v_approval;
  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
  values(v_school,p_actor_id,v_approval.run_id,'approval.'||p_decision,
    jsonb_build_object('approval_id',p_approval_id,'execution_status',v_approval.execution_status));
  return jsonb_build_object(
    'id',v_approval.id,'status',v_approval.status,'execution_status',v_approval.execution_status,
    'decided_by',v_approval.decided_by,'decided_at',v_approval.decided_at,
    'decision_note',v_approval.decision_note
  );
end;
$function$;
revoke all on function public.jd_decide_approval(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.jd_decide_approval(uuid,uuid,text,text) to service_role;

-- Only the approved activation RPC may call the lower-level identity creators.
revoke execute on function public.jd_workforce_create_employee(uuid,uuid,text,text,integer,text,text) from service_role;
revoke execute on function public.jd_workforce_create_team(uuid,uuid,text,text) from service_role;
 then (v_proposal->>'specialist_version')::integer else null end;
    if v_specialist_kind='builtin' then
      if v_specialist is null or not (v_specialist=any(v_allowed)) or v_specialist_version is not null then
        raise exception 'Choose an available built-in specialist before activation' using errcode='22023';
      end if;
      v_specialist_name:=replace(v_specialist,'_',' ');
    elsif v_specialist_kind='registry' then
      if v_specialist is null or v_specialist !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}
    v_employee_ids:=jsonb_build_array(jsonb_build_object(
      'employee_id',v_employee_id,'name',v_name,'specialist_ref',v_specialist
    ));
  else
    v_specialist:=v_proposal->>'specialist_ref';
    if v_specialist is null or not (v_specialist=any(v_allowed)) then
      raise exception 'A team coordinator must use a supported built-in specialist' using errcode='22023';
    end if;
    if jsonb_typeof(v_proposal->'members') is distinct from 'array' then
      raise exception 'A team must contain a member list' using errcode='22023';
    end if;
    if jsonb_array_length(v_proposal->'members') not between 1 and 20 then
      raise exception 'A team must contain between one and twenty described members' using errcode='22023';
    end if;
    v_team_name:=v_name;
    if exists(select 1 from public.jd_workforce_teams
      where school_id=v_school and lower(name)=lower(v_team_name) and retired_at is null) then
      raise exception 'An active team already uses this name; revise the proposal before activation' using errcode='40001';
    end if;
    v_created:=public.jd_workforce_create_team(p_actor,gen_random_uuid(),v_team_name,v_purpose);
    v_team_id:=(v_created->>'team_id')::uuid;
    if v_team_id is null then raise exception 'Team creation was not confirmed' using errcode='P0001'; end if;
    update public.jd_workforce_teams
    set department=v_department,coordinator_specialist_ref=v_specialist,
        responsibilities=coalesce(v_proposal->'responsibilities','[]'::jsonb),
        requested_access=coalesce(v_proposal->'requested_access','[]'::jsonb)
    where id=v_team_id and school_id=v_school;

    for v_member in select value from jsonb_array_elements(v_proposal->'members')
    loop
      v_member_index:=v_member_index+1;
      v_specialist:=v_member->>'specialist_ref';
      v_name:=btrim(coalesce(v_member->>'name',''));
      if jsonb_typeof(v_member) is distinct from 'object'
         or v_specialist is null or not (v_specialist=any(v_allowed))
         or length(v_name) not between 2 and 120
         or length(btrim(coalesce(v_member->>'role',''))) not between 2 and 120 then
        raise exception 'Every team member needs a supported specialist and complete role details' using errcode='22023';
      end if;
      if jsonb_typeof(v_member->'responsibilities') is distinct from 'array' then
        raise exception 'Team member responsibilities must be a list' using errcode='22023';
      end if;
      if v_member ? 'requested_access' and jsonb_typeof(v_member->'requested_access') is distinct from 'array' then
        raise exception 'Team member requested access must be a list' using errcode='22023';
      end if;
      if jsonb_array_length(v_member->'responsibilities')<1 then
        raise exception 'Every team member needs at least one responsibility' using errcode='22023';
      end if;
      v_created:=public.jd_workforce_create_employee(
        p_actor,gen_random_uuid(),'builtin',v_specialist,null,v_name,v_department
      );
      v_employee_id:=(v_created->>'employee_id')::uuid;
      if v_employee_id is null then raise exception 'A team employee identity was not confirmed' using errcode='P0001'; end if;
      update public.jd_workforce_employees
      set role_title=btrim(v_member->>'role'),purpose=v_purpose,
          responsibilities=coalesce(v_member->'responsibilities','[]'::jsonb),
          requested_access=coalesce(v_member->'requested_access','[]'::jsonb)
      where id=v_employee_id and school_id=v_school;
      perform public.jd_workforce_team_membership(
        p_actor,gen_random_uuid(),v_team_id,v_employee_id,'add',
        case when v_member_index=1 then 'lead' else 'member' end
      );
      v_employee_ids:=v_employee_ids||jsonb_build_array(jsonb_build_object(
        'employee_id',v_employee_id,'name',v_name,'role',v_member->>'role',
        'specialist_ref',v_specialist
      ));
    end loop;
  end if;

  v_receipt:=jsonb_build_object(
    'approval_id',p_approval,'kind',v_kind,'employee_ids',v_employee_ids,
    'team_id',v_team_id,'activated',true,'tools_granted',false,
    'connectors_authorised',false,'assignment_started',false,
    'billing_enabled',false,'billing_mode','shadow_only','replayed',false
  );
  insert into public.jd_workforce_proposal_activations(
    school_id,approval_id,request_id,actor_id,proposal_kind,receipt
  ) values(v_school,p_approval,p_request,p_actor,v_kind,v_receipt);

  update public.jd_approvals
  set execution_status='completed',execution_result_json=v_receipt,updated_at=clock_timestamp()
  where id=p_approval and school_id=v_school;
  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
  values(v_school,p_actor,v_approval.run_id,'workforce.proposal.activated',
    v_receipt||jsonb_build_object('request_id',p_request));
  return v_receipt;
end;
$function$;

revoke all on function public.jd_workforce_activate_approved_proposal(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.jd_workforce_activate_approved_proposal(uuid,uuid,uuid) to service_role;

create or replace function public.jd_decide_approval(
  p_approval_id uuid,p_actor_id uuid,p_decision text,p_note text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare
  v_school uuid;
  v_approval public.jd_approvals%rowtype;
  v_now timestamptz:=clock_timestamp();
begin
  if p_decision is null or p_decision not in ('approved','rejected') then
    raise exception 'Invalid approval decision' using errcode='22023';
  end if;
  select school_id into v_school from public.profiles
  where id=p_actor_id and role in ('owner','admin') for share;
  if v_school is null then raise exception 'Only workspace administrators can decide approvals' using errcode='42501'; end if;
  select * into v_approval from public.jd_approvals
  where id=p_approval_id and school_id=v_school for update;
  if not found then raise exception 'Approval request not found' using errcode='P0002'; end if;
  if v_approval.status<>'pending' then raise exception 'Approval request has already been decided' using errcode='40001'; end if;
  if v_approval.expires_at<=v_now then
    update public.jd_approvals set status='expired',updated_at=v_now
    where id=p_approval_id and school_id=v_school;
    insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
    values(v_school,p_actor_id,v_approval.run_id,'approval.expired',
      jsonb_build_object('approval_id',p_approval_id,'expired_by','decision_guard'));
    return jsonb_build_object('id',p_approval_id,'status','expired','execution_status',v_approval.execution_status);
  end if;
  update public.jd_approvals
  set status=p_decision,decided_by=p_actor_id,decision_note=left(coalesce(p_note,''),2000),
      decided_at=v_now,updated_at=v_now
  where id=p_approval_id and school_id=v_school returning * into v_approval;
  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
  values(v_school,p_actor_id,v_approval.run_id,'approval.'||p_decision,
    jsonb_build_object('approval_id',p_approval_id,'execution_status',v_approval.execution_status));
  return jsonb_build_object(
    'id',v_approval.id,'status',v_approval.status,'execution_status',v_approval.execution_status,
    'decided_by',v_approval.decided_by,'decided_at',v_approval.decided_at,
    'decision_note',v_approval.decision_note
  );
end;
$function$;
revoke all on function public.jd_decide_approval(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.jd_decide_approval(uuid,uuid,text,text) to service_role;

-- Only the approved activation RPC may call the lower-level identity creators.
revoke execute on function public.jd_workforce_create_employee(uuid,uuid,text,text,integer,text,text) from service_role;
revoke execute on function public.jd_workforce_create_team(uuid,uuid,text,text) from service_role;

         or v_specialist_version is null
         or not exists(select 1 from public.jd_agent_definitions a where a.id=v_specialist::uuid and a.school_id=v_school and a.state='published' and a.execution_authorized is true and a.current_version=v_specialist_version) then
        raise exception 'Registry specialist must be current, published and execution-authorized' using errcode='42501';
      end if;
      select v.content->>'name' into v_specialist_name from public.jd_agent_definition_versions v
      where v.agent_id=v_specialist::uuid and v.school_id=v_school and v.version=v_specialist_version;
    else
      raise exception 'Unknown specialist kind' using errcode='22023';
    end if;
    v_created:=public.jd_workforce_create_employee(
      p_actor,gen_random_uuid(),v_specialist_kind,v_specialist,v_specialist_version,v_name,v_department
    );
    v_employee_id:=(v_created->>'employee_id')::uuid;
    if v_employee_id is null then raise exception 'Employee identity creation was not confirmed' using errcode='P0001'; end if;
    update public.jd_workforce_employees
    set role_title=coalesce(v_specialist_name,replace(v_specialist,'_',' ')),purpose=v_purpose,
        responsibilities=coalesce(v_proposal->'responsibilities','[]'::jsonb),
        requested_access=coalesce(v_proposal->'requested_access','[]'::jsonb)
    where id=v_employee_id and school_id=v_school;
    v_employee_ids:=jsonb_build_array(jsonb_build_object(
      'employee_id',v_employee_id,'name',v_name,'specialist_ref',v_specialist
    ));
  else
    v_specialist:=v_proposal->>'specialist_ref';
    if v_specialist is null or not (v_specialist=any(v_allowed)) then
      raise exception 'A team coordinator must use a supported built-in specialist' using errcode='22023';
    end if;
    if jsonb_typeof(v_proposal->'members') is distinct from 'array' then
      raise exception 'A team must contain a member list' using errcode='22023';
    end if;
    if jsonb_array_length(v_proposal->'members') not between 1 and 20 then
      raise exception 'A team must contain between one and twenty described members' using errcode='22023';
    end if;
    v_team_name:=v_name;
    if exists(select 1 from public.jd_workforce_teams
      where school_id=v_school and lower(name)=lower(v_team_name) and retired_at is null) then
      raise exception 'An active team already uses this name; revise the proposal before activation' using errcode='40001';
    end if;
    v_created:=public.jd_workforce_create_team(p_actor,gen_random_uuid(),v_team_name,v_purpose);
    v_team_id:=(v_created->>'team_id')::uuid;
    if v_team_id is null then raise exception 'Team creation was not confirmed' using errcode='P0001'; end if;
    update public.jd_workforce_teams
    set department=v_department,coordinator_specialist_ref=v_specialist,
        responsibilities=coalesce(v_proposal->'responsibilities','[]'::jsonb),
        requested_access=coalesce(v_proposal->'requested_access','[]'::jsonb)
    where id=v_team_id and school_id=v_school;

    for v_member in select value from jsonb_array_elements(v_proposal->'members')
    loop
      v_member_index:=v_member_index+1;
      v_specialist:=v_member->>'specialist_ref';
      v_name:=btrim(coalesce(v_member->>'name',''));
      if jsonb_typeof(v_member) is distinct from 'object'
         or v_specialist is null or not (v_specialist=any(v_allowed))
         or length(v_name) not between 2 and 120
         or length(btrim(coalesce(v_member->>'role',''))) not between 2 and 120 then
        raise exception 'Every team member needs a supported specialist and complete role details' using errcode='22023';
      end if;
      if jsonb_typeof(v_member->'responsibilities') is distinct from 'array' then
        raise exception 'Team member responsibilities must be a list' using errcode='22023';
      end if;
      if v_member ? 'requested_access' and jsonb_typeof(v_member->'requested_access') is distinct from 'array' then
        raise exception 'Team member requested access must be a list' using errcode='22023';
      end if;
      if jsonb_array_length(v_member->'responsibilities')<1 then
        raise exception 'Every team member needs at least one responsibility' using errcode='22023';
      end if;
      v_created:=public.jd_workforce_create_employee(
        p_actor,gen_random_uuid(),'builtin',v_specialist,null,v_name,v_department
      );
      v_employee_id:=(v_created->>'employee_id')::uuid;
      if v_employee_id is null then raise exception 'A team employee identity was not confirmed' using errcode='P0001'; end if;
      update public.jd_workforce_employees
      set role_title=btrim(v_member->>'role'),purpose=v_purpose,
          responsibilities=coalesce(v_member->'responsibilities','[]'::jsonb),
          requested_access=coalesce(v_member->'requested_access','[]'::jsonb)
      where id=v_employee_id and school_id=v_school;
      perform public.jd_workforce_team_membership(
        p_actor,gen_random_uuid(),v_team_id,v_employee_id,'add',
        case when v_member_index=1 then 'lead' else 'member' end
      );
      v_employee_ids:=v_employee_ids||jsonb_build_array(jsonb_build_object(
        'employee_id',v_employee_id,'name',v_name,'role',v_member->>'role',
        'specialist_ref',v_specialist
      ));
    end loop;
  end if;

  v_receipt:=jsonb_build_object(
    'approval_id',p_approval,'kind',v_kind,'employee_ids',v_employee_ids,
    'team_id',v_team_id,'activated',true,'tools_granted',false,
    'connectors_authorised',false,'assignment_started',false,
    'billing_enabled',false,'billing_mode','shadow_only','replayed',false
  );
  insert into public.jd_workforce_proposal_activations(
    school_id,approval_id,request_id,actor_id,proposal_kind,receipt
  ) values(v_school,p_approval,p_request,p_actor,v_kind,v_receipt);

  update public.jd_approvals
  set execution_status='completed',execution_result_json=v_receipt,updated_at=clock_timestamp()
  where id=p_approval and school_id=v_school;
  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
  values(v_school,p_actor,v_approval.run_id,'workforce.proposal.activated',
    v_receipt||jsonb_build_object('request_id',p_request));
  return v_receipt;
end;
$function$;

revoke all on function public.jd_workforce_activate_approved_proposal(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.jd_workforce_activate_approved_proposal(uuid,uuid,uuid) to service_role;

create or replace function public.jd_decide_approval(
  p_approval_id uuid,p_actor_id uuid,p_decision text,p_note text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare
  v_school uuid;
  v_approval public.jd_approvals%rowtype;
  v_now timestamptz:=clock_timestamp();
begin
  if p_decision is null or p_decision not in ('approved','rejected') then
    raise exception 'Invalid approval decision' using errcode='22023';
  end if;
  select school_id into v_school from public.profiles
  where id=p_actor_id and role in ('owner','admin') for share;
  if v_school is null then raise exception 'Only workspace administrators can decide approvals' using errcode='42501'; end if;
  select * into v_approval from public.jd_approvals
  where id=p_approval_id and school_id=v_school for update;
  if not found then raise exception 'Approval request not found' using errcode='P0002'; end if;
  if v_approval.status<>'pending' then raise exception 'Approval request has already been decided' using errcode='40001'; end if;
  if v_approval.expires_at<=v_now then
    update public.jd_approvals set status='expired',updated_at=v_now
    where id=p_approval_id and school_id=v_school;
    insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
    values(v_school,p_actor_id,v_approval.run_id,'approval.expired',
      jsonb_build_object('approval_id',p_approval_id,'expired_by','decision_guard'));
    return jsonb_build_object('id',p_approval_id,'status','expired','execution_status',v_approval.execution_status);
  end if;
  update public.jd_approvals
  set status=p_decision,decided_by=p_actor_id,decision_note=left(coalesce(p_note,''),2000),
      decided_at=v_now,updated_at=v_now
  where id=p_approval_id and school_id=v_school returning * into v_approval;
  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
  values(v_school,p_actor_id,v_approval.run_id,'approval.'||p_decision,
    jsonb_build_object('approval_id',p_approval_id,'execution_status',v_approval.execution_status));
  return jsonb_build_object(
    'id',v_approval.id,'status',v_approval.status,'execution_status',v_approval.execution_status,
    'decided_by',v_approval.decided_by,'decided_at',v_approval.decided_at,
    'decision_note',v_approval.decision_note
  );
end;
$function$;
revoke all on function public.jd_decide_approval(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.jd_decide_approval(uuid,uuid,text,text) to service_role;

-- Only the approved activation RPC may call the lower-level identity creators.
revoke execute on function public.jd_workforce_create_employee(uuid,uuid,text,text,integer,text,text) from service_role;
revoke execute on function public.jd_workforce_create_team(uuid,uuid,text,text) from service_role;
 then (v_proposal->>'specialist_version')::integer else null end;
    if v_specialist_kind='builtin' then
      if v_specialist is null or not (v_specialist=any(v_allowed)) or v_specialist_version is not null then
        raise exception 'A team coordinator must use a supported built-in specialist' using errcode='22023';
      end if;
      v_specialist_name:=replace(v_specialist,'_',' ');
    elsif v_specialist_kind='registry' then
      if v_specialist is null or v_specialist !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}
      raise exception 'A team must contain a member list' using errcode='22023';
    end if;
    if jsonb_array_length(v_proposal->'members') not between 1 and 20 then
      raise exception 'A team must contain between one and twenty described members' using errcode='22023';
    end if;
    v_team_name:=v_name;
    if exists(select 1 from public.jd_workforce_teams
      where school_id=v_school and lower(name)=lower(v_team_name) and retired_at is null) then
      raise exception 'An active team already uses this name; revise the proposal before activation' using errcode='40001';
    end if;
    v_created:=public.jd_workforce_create_team(p_actor,gen_random_uuid(),v_team_name,v_purpose);
    v_team_id:=(v_created->>'team_id')::uuid;
    if v_team_id is null then raise exception 'Team creation was not confirmed' using errcode='P0001'; end if;
    update public.jd_workforce_teams
    set department=v_department,coordinator_specialist_ref=v_specialist,
        responsibilities=coalesce(v_proposal->'responsibilities','[]'::jsonb),
        requested_access=coalesce(v_proposal->'requested_access','[]'::jsonb)
    where id=v_team_id and school_id=v_school;

    for v_member in select value from jsonb_array_elements(v_proposal->'members')
    loop
      v_member_index:=v_member_index+1;
      v_specialist:=v_member->>'specialist_ref';
      v_name:=btrim(coalesce(v_member->>'name',''));
      if jsonb_typeof(v_member) is distinct from 'object'
         or v_specialist is null or not (v_specialist=any(v_allowed))
         or length(v_name) not between 2 and 120
         or length(btrim(coalesce(v_member->>'role',''))) not between 2 and 120 then
        raise exception 'Every team member needs a supported specialist and complete role details' using errcode='22023';
      end if;
      if jsonb_typeof(v_member->'responsibilities') is distinct from 'array' then
        raise exception 'Team member responsibilities must be a list' using errcode='22023';
      end if;
      if v_member ? 'requested_access' and jsonb_typeof(v_member->'requested_access') is distinct from 'array' then
        raise exception 'Team member requested access must be a list' using errcode='22023';
      end if;
      if jsonb_array_length(v_member->'responsibilities')<1 then
        raise exception 'Every team member needs at least one responsibility' using errcode='22023';
      end if;
      v_created:=public.jd_workforce_create_employee(
        p_actor,gen_random_uuid(),'builtin',v_specialist,null,v_name,v_department
      );
      v_employee_id:=(v_created->>'employee_id')::uuid;
      if v_employee_id is null then raise exception 'A team employee identity was not confirmed' using errcode='P0001'; end if;
      update public.jd_workforce_employees
      set role_title=btrim(v_member->>'role'),purpose=v_purpose,
          responsibilities=coalesce(v_member->'responsibilities','[]'::jsonb),
          requested_access=coalesce(v_member->'requested_access','[]'::jsonb)
      where id=v_employee_id and school_id=v_school;
      perform public.jd_workforce_team_membership(
        p_actor,gen_random_uuid(),v_team_id,v_employee_id,'add',
        case when v_member_index=1 then 'lead' else 'member' end
      );
      v_employee_ids:=v_employee_ids||jsonb_build_array(jsonb_build_object(
        'employee_id',v_employee_id,'name',v_name,'role',v_member->>'role',
        'specialist_ref',v_specialist
      ));
    end loop;
  end if;

  v_receipt:=jsonb_build_object(
    'approval_id',p_approval,'kind',v_kind,'employee_ids',v_employee_ids,
    'team_id',v_team_id,'activated',true,'tools_granted',false,
    'connectors_authorised',false,'assignment_started',false,
    'billing_enabled',false,'billing_mode','shadow_only','replayed',false
  );
  insert into public.jd_workforce_proposal_activations(
    school_id,approval_id,request_id,actor_id,proposal_kind,receipt
  ) values(v_school,p_approval,p_request,p_actor,v_kind,v_receipt);

  update public.jd_approvals
  set execution_status='completed',execution_result_json=v_receipt,updated_at=clock_timestamp()
  where id=p_approval and school_id=v_school;
  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
  values(v_school,p_actor,v_approval.run_id,'workforce.proposal.activated',
    v_receipt||jsonb_build_object('request_id',p_request));
  return v_receipt;
end;
$function$;

revoke all on function public.jd_workforce_activate_approved_proposal(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.jd_workforce_activate_approved_proposal(uuid,uuid,uuid) to service_role;

create or replace function public.jd_decide_approval(
  p_approval_id uuid,p_actor_id uuid,p_decision text,p_note text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare
  v_school uuid;
  v_approval public.jd_approvals%rowtype;
  v_now timestamptz:=clock_timestamp();
begin
  if p_decision is null or p_decision not in ('approved','rejected') then
    raise exception 'Invalid approval decision' using errcode='22023';
  end if;
  select school_id into v_school from public.profiles
  where id=p_actor_id and role in ('owner','admin') for share;
  if v_school is null then raise exception 'Only workspace administrators can decide approvals' using errcode='42501'; end if;
  select * into v_approval from public.jd_approvals
  where id=p_approval_id and school_id=v_school for update;
  if not found then raise exception 'Approval request not found' using errcode='P0002'; end if;
  if v_approval.status<>'pending' then raise exception 'Approval request has already been decided' using errcode='40001'; end if;
  if v_approval.expires_at<=v_now then
    update public.jd_approvals set status='expired',updated_at=v_now
    where id=p_approval_id and school_id=v_school;
    insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
    values(v_school,p_actor_id,v_approval.run_id,'approval.expired',
      jsonb_build_object('approval_id',p_approval_id,'expired_by','decision_guard'));
    return jsonb_build_object('id',p_approval_id,'status','expired','execution_status',v_approval.execution_status);
  end if;
  update public.jd_approvals
  set status=p_decision,decided_by=p_actor_id,decision_note=left(coalesce(p_note,''),2000),
      decided_at=v_now,updated_at=v_now
  where id=p_approval_id and school_id=v_school returning * into v_approval;
  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
  values(v_school,p_actor_id,v_approval.run_id,'approval.'||p_decision,
    jsonb_build_object('approval_id',p_approval_id,'execution_status',v_approval.execution_status));
  return jsonb_build_object(
    'id',v_approval.id,'status',v_approval.status,'execution_status',v_approval.execution_status,
    'decided_by',v_approval.decided_by,'decided_at',v_approval.decided_at,
    'decision_note',v_approval.decision_note
  );
end;
$function$;
revoke all on function public.jd_decide_approval(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.jd_decide_approval(uuid,uuid,text,text) to service_role;

-- Only the approved activation RPC may call the lower-level identity creators.
revoke execute on function public.jd_workforce_create_employee(uuid,uuid,text,text,integer,text,text) from service_role;
revoke execute on function public.jd_workforce_create_team(uuid,uuid,text,text) from service_role;
 then (v_proposal->>'specialist_version')::integer else null end;
    if v_specialist_kind='builtin' then
      if v_specialist is null or not (v_specialist=any(v_allowed)) or v_specialist_version is not null then
        raise exception 'Choose an available built-in specialist before activation' using errcode='22023';
      end if;
      v_specialist_name:=replace(v_specialist,'_',' ');
    elsif v_specialist_kind='registry' then
      if v_specialist is null or v_specialist !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}
    v_employee_ids:=jsonb_build_array(jsonb_build_object(
      'employee_id',v_employee_id,'name',v_name,'specialist_ref',v_specialist
    ));
  else
    v_specialist:=v_proposal->>'specialist_ref';
    if v_specialist is null or not (v_specialist=any(v_allowed)) then
      raise exception 'A team coordinator must use a supported built-in specialist' using errcode='22023';
    end if;
    if jsonb_typeof(v_proposal->'members') is distinct from 'array' then
      raise exception 'A team must contain a member list' using errcode='22023';
    end if;
    if jsonb_array_length(v_proposal->'members') not between 1 and 20 then
      raise exception 'A team must contain between one and twenty described members' using errcode='22023';
    end if;
    v_team_name:=v_name;
    if exists(select 1 from public.jd_workforce_teams
      where school_id=v_school and lower(name)=lower(v_team_name) and retired_at is null) then
      raise exception 'An active team already uses this name; revise the proposal before activation' using errcode='40001';
    end if;
    v_created:=public.jd_workforce_create_team(p_actor,gen_random_uuid(),v_team_name,v_purpose);
    v_team_id:=(v_created->>'team_id')::uuid;
    if v_team_id is null then raise exception 'Team creation was not confirmed' using errcode='P0001'; end if;
    update public.jd_workforce_teams
    set department=v_department,coordinator_specialist_ref=v_specialist,
        responsibilities=coalesce(v_proposal->'responsibilities','[]'::jsonb),
        requested_access=coalesce(v_proposal->'requested_access','[]'::jsonb)
    where id=v_team_id and school_id=v_school;

    for v_member in select value from jsonb_array_elements(v_proposal->'members')
    loop
      v_member_index:=v_member_index+1;
      v_specialist:=v_member->>'specialist_ref';
      v_name:=btrim(coalesce(v_member->>'name',''));
      if jsonb_typeof(v_member) is distinct from 'object'
         or v_specialist is null or not (v_specialist=any(v_allowed))
         or length(v_name) not between 2 and 120
         or length(btrim(coalesce(v_member->>'role',''))) not between 2 and 120 then
        raise exception 'Every team member needs a supported specialist and complete role details' using errcode='22023';
      end if;
      if jsonb_typeof(v_member->'responsibilities') is distinct from 'array' then
        raise exception 'Team member responsibilities must be a list' using errcode='22023';
      end if;
      if v_member ? 'requested_access' and jsonb_typeof(v_member->'requested_access') is distinct from 'array' then
        raise exception 'Team member requested access must be a list' using errcode='22023';
      end if;
      if jsonb_array_length(v_member->'responsibilities')<1 then
        raise exception 'Every team member needs at least one responsibility' using errcode='22023';
      end if;
      v_created:=public.jd_workforce_create_employee(
        p_actor,gen_random_uuid(),'builtin',v_specialist,null,v_name,v_department
      );
      v_employee_id:=(v_created->>'employee_id')::uuid;
      if v_employee_id is null then raise exception 'A team employee identity was not confirmed' using errcode='P0001'; end if;
      update public.jd_workforce_employees
      set role_title=btrim(v_member->>'role'),purpose=v_purpose,
          responsibilities=coalesce(v_member->'responsibilities','[]'::jsonb),
          requested_access=coalesce(v_member->'requested_access','[]'::jsonb)
      where id=v_employee_id and school_id=v_school;
      perform public.jd_workforce_team_membership(
        p_actor,gen_random_uuid(),v_team_id,v_employee_id,'add',
        case when v_member_index=1 then 'lead' else 'member' end
      );
      v_employee_ids:=v_employee_ids||jsonb_build_array(jsonb_build_object(
        'employee_id',v_employee_id,'name',v_name,'role',v_member->>'role',
        'specialist_ref',v_specialist
      ));
    end loop;
  end if;

  v_receipt:=jsonb_build_object(
    'approval_id',p_approval,'kind',v_kind,'employee_ids',v_employee_ids,
    'team_id',v_team_id,'activated',true,'tools_granted',false,
    'connectors_authorised',false,'assignment_started',false,
    'billing_enabled',false,'billing_mode','shadow_only','replayed',false
  );
  insert into public.jd_workforce_proposal_activations(
    school_id,approval_id,request_id,actor_id,proposal_kind,receipt
  ) values(v_school,p_approval,p_request,p_actor,v_kind,v_receipt);

  update public.jd_approvals
  set execution_status='completed',execution_result_json=v_receipt,updated_at=clock_timestamp()
  where id=p_approval and school_id=v_school;
  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
  values(v_school,p_actor,v_approval.run_id,'workforce.proposal.activated',
    v_receipt||jsonb_build_object('request_id',p_request));
  return v_receipt;
end;
$function$;

revoke all on function public.jd_workforce_activate_approved_proposal(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.jd_workforce_activate_approved_proposal(uuid,uuid,uuid) to service_role;

create or replace function public.jd_decide_approval(
  p_approval_id uuid,p_actor_id uuid,p_decision text,p_note text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare
  v_school uuid;
  v_approval public.jd_approvals%rowtype;
  v_now timestamptz:=clock_timestamp();
begin
  if p_decision is null or p_decision not in ('approved','rejected') then
    raise exception 'Invalid approval decision' using errcode='22023';
  end if;
  select school_id into v_school from public.profiles
  where id=p_actor_id and role in ('owner','admin') for share;
  if v_school is null then raise exception 'Only workspace administrators can decide approvals' using errcode='42501'; end if;
  select * into v_approval from public.jd_approvals
  where id=p_approval_id and school_id=v_school for update;
  if not found then raise exception 'Approval request not found' using errcode='P0002'; end if;
  if v_approval.status<>'pending' then raise exception 'Approval request has already been decided' using errcode='40001'; end if;
  if v_approval.expires_at<=v_now then
    update public.jd_approvals set status='expired',updated_at=v_now
    where id=p_approval_id and school_id=v_school;
    insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
    values(v_school,p_actor_id,v_approval.run_id,'approval.expired',
      jsonb_build_object('approval_id',p_approval_id,'expired_by','decision_guard'));
    return jsonb_build_object('id',p_approval_id,'status','expired','execution_status',v_approval.execution_status);
  end if;
  update public.jd_approvals
  set status=p_decision,decided_by=p_actor_id,decision_note=left(coalesce(p_note,''),2000),
      decided_at=v_now,updated_at=v_now
  where id=p_approval_id and school_id=v_school returning * into v_approval;
  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
  values(v_school,p_actor_id,v_approval.run_id,'approval.'||p_decision,
    jsonb_build_object('approval_id',p_approval_id,'execution_status',v_approval.execution_status));
  return jsonb_build_object(
    'id',v_approval.id,'status',v_approval.status,'execution_status',v_approval.execution_status,
    'decided_by',v_approval.decided_by,'decided_at',v_approval.decided_at,
    'decision_note',v_approval.decision_note
  );
end;
$function$;
revoke all on function public.jd_decide_approval(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.jd_decide_approval(uuid,uuid,text,text) to service_role;

-- Only the approved activation RPC may call the lower-level identity creators.
revoke execute on function public.jd_workforce_create_employee(uuid,uuid,text,text,integer,text,text) from service_role;
revoke execute on function public.jd_workforce_create_team(uuid,uuid,text,text) from service_role;

         or v_specialist_version is null
         or not exists(select 1 from public.jd_agent_definitions a where a.id=v_specialist::uuid and a.school_id=v_school and a.state='published' and a.execution_authorized is true and a.current_version=v_specialist_version) then
        raise exception 'Registry specialist must be current, published and execution-authorized' using errcode='42501';
      end if;
      select v.content->>'name' into v_specialist_name from public.jd_agent_definition_versions v
      where v.agent_id=v_specialist::uuid and v.school_id=v_school and v.version=v_specialist_version;
    else
      raise exception 'Unknown specialist kind' using errcode='22023';
    end if;
    v_created:=public.jd_workforce_create_employee(
      p_actor,gen_random_uuid(),v_specialist_kind,v_specialist,v_specialist_version,v_name,v_department
    );
    v_employee_id:=(v_created->>'employee_id')::uuid;
    if v_employee_id is null then raise exception 'Employee identity creation was not confirmed' using errcode='P0001'; end if;
    update public.jd_workforce_employees
    set role_title=coalesce(v_specialist_name,replace(v_specialist,'_',' ')),purpose=v_purpose,
        responsibilities=coalesce(v_proposal->'responsibilities','[]'::jsonb),
        requested_access=coalesce(v_proposal->'requested_access','[]'::jsonb)
    where id=v_employee_id and school_id=v_school;
    v_employee_ids:=jsonb_build_array(jsonb_build_object(
      'employee_id',v_employee_id,'name',v_name,'specialist_ref',v_specialist
    ));
  else
    v_specialist:=v_proposal->>'specialist_ref';
    if v_specialist is null or not (v_specialist=any(v_allowed)) then
      raise exception 'A team coordinator must use a supported built-in specialist' using errcode='22023';
    end if;
    if jsonb_typeof(v_proposal->'members') is distinct from 'array' then
      raise exception 'A team must contain a member list' using errcode='22023';
    end if;
    if jsonb_array_length(v_proposal->'members') not between 1 and 20 then
      raise exception 'A team must contain between one and twenty described members' using errcode='22023';
    end if;
    v_team_name:=v_name;
    if exists(select 1 from public.jd_workforce_teams
      where school_id=v_school and lower(name)=lower(v_team_name) and retired_at is null) then
      raise exception 'An active team already uses this name; revise the proposal before activation' using errcode='40001';
    end if;
    v_created:=public.jd_workforce_create_team(p_actor,gen_random_uuid(),v_team_name,v_purpose);
    v_team_id:=(v_created->>'team_id')::uuid;
    if v_team_id is null then raise exception 'Team creation was not confirmed' using errcode='P0001'; end if;
    update public.jd_workforce_teams
    set department=v_department,coordinator_specialist_ref=v_specialist,
        responsibilities=coalesce(v_proposal->'responsibilities','[]'::jsonb),
        requested_access=coalesce(v_proposal->'requested_access','[]'::jsonb)
    where id=v_team_id and school_id=v_school;

    for v_member in select value from jsonb_array_elements(v_proposal->'members')
    loop
      v_member_index:=v_member_index+1;
      v_specialist:=v_member->>'specialist_ref';
      v_name:=btrim(coalesce(v_member->>'name',''));
      if jsonb_typeof(v_member) is distinct from 'object'
         or v_specialist is null or not (v_specialist=any(v_allowed))
         or length(v_name) not between 2 and 120
         or length(btrim(coalesce(v_member->>'role',''))) not between 2 and 120 then
        raise exception 'Every team member needs a supported specialist and complete role details' using errcode='22023';
      end if;
      if jsonb_typeof(v_member->'responsibilities') is distinct from 'array' then
        raise exception 'Team member responsibilities must be a list' using errcode='22023';
      end if;
      if v_member ? 'requested_access' and jsonb_typeof(v_member->'requested_access') is distinct from 'array' then
        raise exception 'Team member requested access must be a list' using errcode='22023';
      end if;
      if jsonb_array_length(v_member->'responsibilities')<1 then
        raise exception 'Every team member needs at least one responsibility' using errcode='22023';
      end if;
      v_created:=public.jd_workforce_create_employee(
        p_actor,gen_random_uuid(),'builtin',v_specialist,null,v_name,v_department
      );
      v_employee_id:=(v_created->>'employee_id')::uuid;
      if v_employee_id is null then raise exception 'A team employee identity was not confirmed' using errcode='P0001'; end if;
      update public.jd_workforce_employees
      set role_title=btrim(v_member->>'role'),purpose=v_purpose,
          responsibilities=coalesce(v_member->'responsibilities','[]'::jsonb),
          requested_access=coalesce(v_member->'requested_access','[]'::jsonb)
      where id=v_employee_id and school_id=v_school;
      perform public.jd_workforce_team_membership(
        p_actor,gen_random_uuid(),v_team_id,v_employee_id,'add',
        case when v_member_index=1 then 'lead' else 'member' end
      );
      v_employee_ids:=v_employee_ids||jsonb_build_array(jsonb_build_object(
        'employee_id',v_employee_id,'name',v_name,'role',v_member->>'role',
        'specialist_ref',v_specialist
      ));
    end loop;
  end if;

  v_receipt:=jsonb_build_object(
    'approval_id',p_approval,'kind',v_kind,'employee_ids',v_employee_ids,
    'team_id',v_team_id,'activated',true,'tools_granted',false,
    'connectors_authorised',false,'assignment_started',false,
    'billing_enabled',false,'billing_mode','shadow_only','replayed',false
  );
  insert into public.jd_workforce_proposal_activations(
    school_id,approval_id,request_id,actor_id,proposal_kind,receipt
  ) values(v_school,p_approval,p_request,p_actor,v_kind,v_receipt);

  update public.jd_approvals
  set execution_status='completed',execution_result_json=v_receipt,updated_at=clock_timestamp()
  where id=p_approval and school_id=v_school;
  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
  values(v_school,p_actor,v_approval.run_id,'workforce.proposal.activated',
    v_receipt||jsonb_build_object('request_id',p_request));
  return v_receipt;
end;
$function$;

revoke all on function public.jd_workforce_activate_approved_proposal(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.jd_workforce_activate_approved_proposal(uuid,uuid,uuid) to service_role;

create or replace function public.jd_decide_approval(
  p_approval_id uuid,p_actor_id uuid,p_decision text,p_note text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare
  v_school uuid;
  v_approval public.jd_approvals%rowtype;
  v_now timestamptz:=clock_timestamp();
begin
  if p_decision is null or p_decision not in ('approved','rejected') then
    raise exception 'Invalid approval decision' using errcode='22023';
  end if;
  select school_id into v_school from public.profiles
  where id=p_actor_id and role in ('owner','admin') for share;
  if v_school is null then raise exception 'Only workspace administrators can decide approvals' using errcode='42501'; end if;
  select * into v_approval from public.jd_approvals
  where id=p_approval_id and school_id=v_school for update;
  if not found then raise exception 'Approval request not found' using errcode='P0002'; end if;
  if v_approval.status<>'pending' then raise exception 'Approval request has already been decided' using errcode='40001'; end if;
  if v_approval.expires_at<=v_now then
    update public.jd_approvals set status='expired',updated_at=v_now
    where id=p_approval_id and school_id=v_school;
    insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
    values(v_school,p_actor_id,v_approval.run_id,'approval.expired',
      jsonb_build_object('approval_id',p_approval_id,'expired_by','decision_guard'));
    return jsonb_build_object('id',p_approval_id,'status','expired','execution_status',v_approval.execution_status);
  end if;
  update public.jd_approvals
  set status=p_decision,decided_by=p_actor_id,decision_note=left(coalesce(p_note,''),2000),
      decided_at=v_now,updated_at=v_now
  where id=p_approval_id and school_id=v_school returning * into v_approval;
  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
  values(v_school,p_actor_id,v_approval.run_id,'approval.'||p_decision,
    jsonb_build_object('approval_id',p_approval_id,'execution_status',v_approval.execution_status));
  return jsonb_build_object(
    'id',v_approval.id,'status',v_approval.status,'execution_status',v_approval.execution_status,
    'decided_by',v_approval.decided_by,'decided_at',v_approval.decided_at,
    'decision_note',v_approval.decision_note
  );
end;
$function$;
revoke all on function public.jd_decide_approval(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.jd_decide_approval(uuid,uuid,text,text) to service_role;

-- Only the approved activation RPC may call the lower-level identity creators.
revoke execute on function public.jd_workforce_create_employee(uuid,uuid,text,text,integer,text,text) from service_role;
revoke execute on function public.jd_workforce_create_team(uuid,uuid,text,text) from service_role;

         or v_specialist_version is null
         or not exists(select 1 from public.jd_agent_definitions a where a.id=v_specialist::uuid and a.school_id=v_school and a.state='published' and a.execution_authorized is true and a.current_version=v_specialist_version) then
        raise exception 'Registry team coordinator must be current, published and execution-authorized' using errcode='42501';
      end if;
      select v.content->>'name' into v_specialist_name from public.jd_agent_definition_versions v
      where v.agent_id=v_specialist::uuid and v.school_id=v_school and v.version=v_specialist_version;
    else
      raise exception 'Unknown team coordinator specialist kind' using errcode='22023';
    end if;
    if jsonb_typeof(v_proposal->'members') is distinct from 'array' then
      raise exception 'A team must contain a member list' using errcode='22023';
    end if;
    if jsonb_array_length(v_proposal->'members') not between 1 and 20 then
      raise exception 'A team must contain between one and twenty described members' using errcode='22023';
    end if;
    v_team_name:=v_name;
    if exists(select 1 from public.jd_workforce_teams
      where school_id=v_school and lower(name)=lower(v_team_name) and retired_at is null) then
      raise exception 'An active team already uses this name; revise the proposal before activation' using errcode='40001';
    end if;
    v_created:=public.jd_workforce_create_team(p_actor,gen_random_uuid(),v_team_name,v_purpose);
    v_team_id:=(v_created->>'team_id')::uuid;
    if v_team_id is null then raise exception 'Team creation was not confirmed' using errcode='P0001'; end if;
    update public.jd_workforce_teams
    set department=v_department,coordinator_specialist_ref=v_specialist,
        responsibilities=coalesce(v_proposal->'responsibilities','[]'::jsonb),
        requested_access=coalesce(v_proposal->'requested_access','[]'::jsonb)
    where id=v_team_id and school_id=v_school;

    for v_member in select value from jsonb_array_elements(v_proposal->'members')
    loop
      v_member_index:=v_member_index+1;
      v_specialist:=v_member->>'specialist_ref';
      v_name:=btrim(coalesce(v_member->>'name',''));
      if jsonb_typeof(v_member) is distinct from 'object'
         or v_specialist is null or not (v_specialist=any(v_allowed))
         or length(v_name) not between 2 and 120
         or length(btrim(coalesce(v_member->>'role',''))) not between 2 and 120 then
        raise exception 'Every team member needs a supported specialist and complete role details' using errcode='22023';
      end if;
      if jsonb_typeof(v_member->'responsibilities') is distinct from 'array' then
        raise exception 'Team member responsibilities must be a list' using errcode='22023';
      end if;
      if v_member ? 'requested_access' and jsonb_typeof(v_member->'requested_access') is distinct from 'array' then
        raise exception 'Team member requested access must be a list' using errcode='22023';
      end if;
      if jsonb_array_length(v_member->'responsibilities')<1 then
        raise exception 'Every team member needs at least one responsibility' using errcode='22023';
      end if;
      v_created:=public.jd_workforce_create_employee(
        p_actor,gen_random_uuid(),'builtin',v_specialist,null,v_name,v_department
      );
      v_employee_id:=(v_created->>'employee_id')::uuid;
      if v_employee_id is null then raise exception 'A team employee identity was not confirmed' using errcode='P0001'; end if;
      update public.jd_workforce_employees
      set role_title=btrim(v_member->>'role'),purpose=v_purpose,
          responsibilities=coalesce(v_member->'responsibilities','[]'::jsonb),
          requested_access=coalesce(v_member->'requested_access','[]'::jsonb)
      where id=v_employee_id and school_id=v_school;
      perform public.jd_workforce_team_membership(
        p_actor,gen_random_uuid(),v_team_id,v_employee_id,'add',
        case when v_member_index=1 then 'lead' else 'member' end
      );
      v_employee_ids:=v_employee_ids||jsonb_build_array(jsonb_build_object(
        'employee_id',v_employee_id,'name',v_name,'role',v_member->>'role',
        'specialist_ref',v_specialist
      ));
    end loop;
  end if;

  v_receipt:=jsonb_build_object(
    'approval_id',p_approval,'kind',v_kind,'employee_ids',v_employee_ids,
    'team_id',v_team_id,'activated',true,'tools_granted',false,
    'connectors_authorised',false,'assignment_started',false,
    'billing_enabled',false,'billing_mode','shadow_only','replayed',false
  );
  insert into public.jd_workforce_proposal_activations(
    school_id,approval_id,request_id,actor_id,proposal_kind,receipt
  ) values(v_school,p_approval,p_request,p_actor,v_kind,v_receipt);

  update public.jd_approvals
  set execution_status='completed',execution_result_json=v_receipt,updated_at=clock_timestamp()
  where id=p_approval and school_id=v_school;
  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
  values(v_school,p_actor,v_approval.run_id,'workforce.proposal.activated',
    v_receipt||jsonb_build_object('request_id',p_request));
  return v_receipt;
end;
$function$;

revoke all on function public.jd_workforce_activate_approved_proposal(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.jd_workforce_activate_approved_proposal(uuid,uuid,uuid) to service_role;

create or replace function public.jd_decide_approval(
  p_approval_id uuid,p_actor_id uuid,p_decision text,p_note text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare
  v_school uuid;
  v_approval public.jd_approvals%rowtype;
  v_now timestamptz:=clock_timestamp();
begin
  if p_decision is null or p_decision not in ('approved','rejected') then
    raise exception 'Invalid approval decision' using errcode='22023';
  end if;
  select school_id into v_school from public.profiles
  where id=p_actor_id and role in ('owner','admin') for share;
  if v_school is null then raise exception 'Only workspace administrators can decide approvals' using errcode='42501'; end if;
  select * into v_approval from public.jd_approvals
  where id=p_approval_id and school_id=v_school for update;
  if not found then raise exception 'Approval request not found' using errcode='P0002'; end if;
  if v_approval.status<>'pending' then raise exception 'Approval request has already been decided' using errcode='40001'; end if;
  if v_approval.expires_at<=v_now then
    update public.jd_approvals set status='expired',updated_at=v_now
    where id=p_approval_id and school_id=v_school;
    insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
    values(v_school,p_actor_id,v_approval.run_id,'approval.expired',
      jsonb_build_object('approval_id',p_approval_id,'expired_by','decision_guard'));
    return jsonb_build_object('id',p_approval_id,'status','expired','execution_status',v_approval.execution_status);
  end if;
  update public.jd_approvals
  set status=p_decision,decided_by=p_actor_id,decision_note=left(coalesce(p_note,''),2000),
      decided_at=v_now,updated_at=v_now
  where id=p_approval_id and school_id=v_school returning * into v_approval;
  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
  values(v_school,p_actor_id,v_approval.run_id,'approval.'||p_decision,
    jsonb_build_object('approval_id',p_approval_id,'execution_status',v_approval.execution_status));
  return jsonb_build_object(
    'id',v_approval.id,'status',v_approval.status,'execution_status',v_approval.execution_status,
    'decided_by',v_approval.decided_by,'decided_at',v_approval.decided_at,
    'decision_note',v_approval.decision_note
  );
end;
$function$;
revoke all on function public.jd_decide_approval(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.jd_decide_approval(uuid,uuid,text,text) to service_role;

-- Only the approved activation RPC may call the lower-level identity creators.
revoke execute on function public.jd_workforce_create_employee(uuid,uuid,text,text,integer,text,text) from service_role;
revoke execute on function public.jd_workforce_create_team(uuid,uuid,text,text) from service_role;
 then (v_proposal->>'specialist_version')::integer else null end;
    if v_specialist_kind='builtin' then
      if v_specialist is null or not (v_specialist=any(v_allowed)) or v_specialist_version is not null then
        raise exception 'Choose an available built-in specialist before activation' using errcode='22023';
      end if;
      v_specialist_name:=replace(v_specialist,'_',' ');
    elsif v_specialist_kind='registry' then
      if v_specialist is null or v_specialist !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}
    v_employee_ids:=jsonb_build_array(jsonb_build_object(
      'employee_id',v_employee_id,'name',v_name,'specialist_ref',v_specialist
    ));
  else
    v_specialist:=v_proposal->>'specialist_ref';
    if v_specialist is null or not (v_specialist=any(v_allowed)) then
      raise exception 'A team coordinator must use a supported built-in specialist' using errcode='22023';
    end if;
    if jsonb_typeof(v_proposal->'members') is distinct from 'array' then
      raise exception 'A team must contain a member list' using errcode='22023';
    end if;
    if jsonb_array_length(v_proposal->'members') not between 1 and 20 then
      raise exception 'A team must contain between one and twenty described members' using errcode='22023';
    end if;
    v_team_name:=v_name;
    if exists(select 1 from public.jd_workforce_teams
      where school_id=v_school and lower(name)=lower(v_team_name) and retired_at is null) then
      raise exception 'An active team already uses this name; revise the proposal before activation' using errcode='40001';
    end if;
    v_created:=public.jd_workforce_create_team(p_actor,gen_random_uuid(),v_team_name,v_purpose);
    v_team_id:=(v_created->>'team_id')::uuid;
    if v_team_id is null then raise exception 'Team creation was not confirmed' using errcode='P0001'; end if;
    update public.jd_workforce_teams
    set department=v_department,coordinator_specialist_ref=v_specialist,
        responsibilities=coalesce(v_proposal->'responsibilities','[]'::jsonb),
        requested_access=coalesce(v_proposal->'requested_access','[]'::jsonb)
    where id=v_team_id and school_id=v_school;

    for v_member in select value from jsonb_array_elements(v_proposal->'members')
    loop
      v_member_index:=v_member_index+1;
      v_specialist:=v_member->>'specialist_ref';
      v_name:=btrim(coalesce(v_member->>'name',''));
      if jsonb_typeof(v_member) is distinct from 'object'
         or v_specialist is null or not (v_specialist=any(v_allowed))
         or length(v_name) not between 2 and 120
         or length(btrim(coalesce(v_member->>'role',''))) not between 2 and 120 then
        raise exception 'Every team member needs a supported specialist and complete role details' using errcode='22023';
      end if;
      if jsonb_typeof(v_member->'responsibilities') is distinct from 'array' then
        raise exception 'Team member responsibilities must be a list' using errcode='22023';
      end if;
      if v_member ? 'requested_access' and jsonb_typeof(v_member->'requested_access') is distinct from 'array' then
        raise exception 'Team member requested access must be a list' using errcode='22023';
      end if;
      if jsonb_array_length(v_member->'responsibilities')<1 then
        raise exception 'Every team member needs at least one responsibility' using errcode='22023';
      end if;
      v_created:=public.jd_workforce_create_employee(
        p_actor,gen_random_uuid(),'builtin',v_specialist,null,v_name,v_department
      );
      v_employee_id:=(v_created->>'employee_id')::uuid;
      if v_employee_id is null then raise exception 'A team employee identity was not confirmed' using errcode='P0001'; end if;
      update public.jd_workforce_employees
      set role_title=btrim(v_member->>'role'),purpose=v_purpose,
          responsibilities=coalesce(v_member->'responsibilities','[]'::jsonb),
          requested_access=coalesce(v_member->'requested_access','[]'::jsonb)
      where id=v_employee_id and school_id=v_school;
      perform public.jd_workforce_team_membership(
        p_actor,gen_random_uuid(),v_team_id,v_employee_id,'add',
        case when v_member_index=1 then 'lead' else 'member' end
      );
      v_employee_ids:=v_employee_ids||jsonb_build_array(jsonb_build_object(
        'employee_id',v_employee_id,'name',v_name,'role',v_member->>'role',
        'specialist_ref',v_specialist
      ));
    end loop;
  end if;

  v_receipt:=jsonb_build_object(
    'approval_id',p_approval,'kind',v_kind,'employee_ids',v_employee_ids,
    'team_id',v_team_id,'activated',true,'tools_granted',false,
    'connectors_authorised',false,'assignment_started',false,
    'billing_enabled',false,'billing_mode','shadow_only','replayed',false
  );
  insert into public.jd_workforce_proposal_activations(
    school_id,approval_id,request_id,actor_id,proposal_kind,receipt
  ) values(v_school,p_approval,p_request,p_actor,v_kind,v_receipt);

  update public.jd_approvals
  set execution_status='completed',execution_result_json=v_receipt,updated_at=clock_timestamp()
  where id=p_approval and school_id=v_school;
  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
  values(v_school,p_actor,v_approval.run_id,'workforce.proposal.activated',
    v_receipt||jsonb_build_object('request_id',p_request));
  return v_receipt;
end;
$function$;

revoke all on function public.jd_workforce_activate_approved_proposal(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.jd_workforce_activate_approved_proposal(uuid,uuid,uuid) to service_role;

create or replace function public.jd_decide_approval(
  p_approval_id uuid,p_actor_id uuid,p_decision text,p_note text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare
  v_school uuid;
  v_approval public.jd_approvals%rowtype;
  v_now timestamptz:=clock_timestamp();
begin
  if p_decision is null or p_decision not in ('approved','rejected') then
    raise exception 'Invalid approval decision' using errcode='22023';
  end if;
  select school_id into v_school from public.profiles
  where id=p_actor_id and role in ('owner','admin') for share;
  if v_school is null then raise exception 'Only workspace administrators can decide approvals' using errcode='42501'; end if;
  select * into v_approval from public.jd_approvals
  where id=p_approval_id and school_id=v_school for update;
  if not found then raise exception 'Approval request not found' using errcode='P0002'; end if;
  if v_approval.status<>'pending' then raise exception 'Approval request has already been decided' using errcode='40001'; end if;
  if v_approval.expires_at<=v_now then
    update public.jd_approvals set status='expired',updated_at=v_now
    where id=p_approval_id and school_id=v_school;
    insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
    values(v_school,p_actor_id,v_approval.run_id,'approval.expired',
      jsonb_build_object('approval_id',p_approval_id,'expired_by','decision_guard'));
    return jsonb_build_object('id',p_approval_id,'status','expired','execution_status',v_approval.execution_status);
  end if;
  update public.jd_approvals
  set status=p_decision,decided_by=p_actor_id,decision_note=left(coalesce(p_note,''),2000),
      decided_at=v_now,updated_at=v_now
  where id=p_approval_id and school_id=v_school returning * into v_approval;
  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
  values(v_school,p_actor_id,v_approval.run_id,'approval.'||p_decision,
    jsonb_build_object('approval_id',p_approval_id,'execution_status',v_approval.execution_status));
  return jsonb_build_object(
    'id',v_approval.id,'status',v_approval.status,'execution_status',v_approval.execution_status,
    'decided_by',v_approval.decided_by,'decided_at',v_approval.decided_at,
    'decision_note',v_approval.decision_note
  );
end;
$function$;
revoke all on function public.jd_decide_approval(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.jd_decide_approval(uuid,uuid,text,text) to service_role;

-- Only the approved activation RPC may call the lower-level identity creators.
revoke execute on function public.jd_workforce_create_employee(uuid,uuid,text,text,integer,text,text) from service_role;
revoke execute on function public.jd_workforce_create_team(uuid,uuid,text,text) from service_role;

         or v_specialist_version is null
         or not exists(select 1 from public.jd_agent_definitions a where a.id=v_specialist::uuid and a.school_id=v_school and a.state='published' and a.execution_authorized is true and a.current_version=v_specialist_version) then
        raise exception 'Registry specialist must be current, published and execution-authorized' using errcode='42501';
      end if;
      select v.content->>'name' into v_specialist_name from public.jd_agent_definition_versions v
      where v.agent_id=v_specialist::uuid and v.school_id=v_school and v.version=v_specialist_version;
    else
      raise exception 'Unknown specialist kind' using errcode='22023';
    end if;
    v_created:=public.jd_workforce_create_employee(
      p_actor,gen_random_uuid(),v_specialist_kind,v_specialist,v_specialist_version,v_name,v_department
    );
    v_employee_id:=(v_created->>'employee_id')::uuid;
    if v_employee_id is null then raise exception 'Employee identity creation was not confirmed' using errcode='P0001'; end if;
    update public.jd_workforce_employees
    set role_title=coalesce(v_specialist_name,replace(v_specialist,'_',' ')),purpose=v_purpose,
        responsibilities=coalesce(v_proposal->'responsibilities','[]'::jsonb),
        requested_access=coalesce(v_proposal->'requested_access','[]'::jsonb)
    where id=v_employee_id and school_id=v_school;
    v_employee_ids:=jsonb_build_array(jsonb_build_object(
      'employee_id',v_employee_id,'name',v_name,'specialist_ref',v_specialist
    ));
  else
    v_specialist:=v_proposal->>'specialist_ref';
    if v_specialist is null or not (v_specialist=any(v_allowed)) then
      raise exception 'A team coordinator must use a supported built-in specialist' using errcode='22023';
    end if;
    if jsonb_typeof(v_proposal->'members') is distinct from 'array' then
      raise exception 'A team must contain a member list' using errcode='22023';
    end if;
    if jsonb_array_length(v_proposal->'members') not between 1 and 20 then
      raise exception 'A team must contain between one and twenty described members' using errcode='22023';
    end if;
    v_team_name:=v_name;
    if exists(select 1 from public.jd_workforce_teams
      where school_id=v_school and lower(name)=lower(v_team_name) and retired_at is null) then
      raise exception 'An active team already uses this name; revise the proposal before activation' using errcode='40001';
    end if;
    v_created:=public.jd_workforce_create_team(p_actor,gen_random_uuid(),v_team_name,v_purpose);
    v_team_id:=(v_created->>'team_id')::uuid;
    if v_team_id is null then raise exception 'Team creation was not confirmed' using errcode='P0001'; end if;
    update public.jd_workforce_teams
    set department=v_department,coordinator_specialist_ref=v_specialist,
        responsibilities=coalesce(v_proposal->'responsibilities','[]'::jsonb),
        requested_access=coalesce(v_proposal->'requested_access','[]'::jsonb)
    where id=v_team_id and school_id=v_school;

    for v_member in select value from jsonb_array_elements(v_proposal->'members')
    loop
      v_member_index:=v_member_index+1;
      v_specialist:=v_member->>'specialist_ref';
      v_name:=btrim(coalesce(v_member->>'name',''));
      if jsonb_typeof(v_member) is distinct from 'object'
         or v_specialist is null or not (v_specialist=any(v_allowed))
         or length(v_name) not between 2 and 120
         or length(btrim(coalesce(v_member->>'role',''))) not between 2 and 120 then
        raise exception 'Every team member needs a supported specialist and complete role details' using errcode='22023';
      end if;
      if jsonb_typeof(v_member->'responsibilities') is distinct from 'array' then
        raise exception 'Team member responsibilities must be a list' using errcode='22023';
      end if;
      if v_member ? 'requested_access' and jsonb_typeof(v_member->'requested_access') is distinct from 'array' then
        raise exception 'Team member requested access must be a list' using errcode='22023';
      end if;
      if jsonb_array_length(v_member->'responsibilities')<1 then
        raise exception 'Every team member needs at least one responsibility' using errcode='22023';
      end if;
      v_created:=public.jd_workforce_create_employee(
        p_actor,gen_random_uuid(),'builtin',v_specialist,null,v_name,v_department
      );
      v_employee_id:=(v_created->>'employee_id')::uuid;
      if v_employee_id is null then raise exception 'A team employee identity was not confirmed' using errcode='P0001'; end if;
      update public.jd_workforce_employees
      set role_title=btrim(v_member->>'role'),purpose=v_purpose,
          responsibilities=coalesce(v_member->'responsibilities','[]'::jsonb),
          requested_access=coalesce(v_member->'requested_access','[]'::jsonb)
      where id=v_employee_id and school_id=v_school;
      perform public.jd_workforce_team_membership(
        p_actor,gen_random_uuid(),v_team_id,v_employee_id,'add',
        case when v_member_index=1 then 'lead' else 'member' end
      );
      v_employee_ids:=v_employee_ids||jsonb_build_array(jsonb_build_object(
        'employee_id',v_employee_id,'name',v_name,'role',v_member->>'role',
        'specialist_ref',v_specialist
      ));
    end loop;
  end if;

  v_receipt:=jsonb_build_object(
    'approval_id',p_approval,'kind',v_kind,'employee_ids',v_employee_ids,
    'team_id',v_team_id,'activated',true,'tools_granted',false,
    'connectors_authorised',false,'assignment_started',false,
    'billing_enabled',false,'billing_mode','shadow_only','replayed',false
  );
  insert into public.jd_workforce_proposal_activations(
    school_id,approval_id,request_id,actor_id,proposal_kind,receipt
  ) values(v_school,p_approval,p_request,p_actor,v_kind,v_receipt);

  update public.jd_approvals
  set execution_status='completed',execution_result_json=v_receipt,updated_at=clock_timestamp()
  where id=p_approval and school_id=v_school;
  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
  values(v_school,p_actor,v_approval.run_id,'workforce.proposal.activated',
    v_receipt||jsonb_build_object('request_id',p_request));
  return v_receipt;
end;
$function$;

revoke all on function public.jd_workforce_activate_approved_proposal(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.jd_workforce_activate_approved_proposal(uuid,uuid,uuid) to service_role;

create or replace function public.jd_decide_approval(
  p_approval_id uuid,p_actor_id uuid,p_decision text,p_note text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare
  v_school uuid;
  v_approval public.jd_approvals%rowtype;
  v_now timestamptz:=clock_timestamp();
begin
  if p_decision is null or p_decision not in ('approved','rejected') then
    raise exception 'Invalid approval decision' using errcode='22023';
  end if;
  select school_id into v_school from public.profiles
  where id=p_actor_id and role in ('owner','admin') for share;
  if v_school is null then raise exception 'Only workspace administrators can decide approvals' using errcode='42501'; end if;
  select * into v_approval from public.jd_approvals
  where id=p_approval_id and school_id=v_school for update;
  if not found then raise exception 'Approval request not found' using errcode='P0002'; end if;
  if v_approval.status<>'pending' then raise exception 'Approval request has already been decided' using errcode='40001'; end if;
  if v_approval.expires_at<=v_now then
    update public.jd_approvals set status='expired',updated_at=v_now
    where id=p_approval_id and school_id=v_school;
    insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
    values(v_school,p_actor_id,v_approval.run_id,'approval.expired',
      jsonb_build_object('approval_id',p_approval_id,'expired_by','decision_guard'));
    return jsonb_build_object('id',p_approval_id,'status','expired','execution_status',v_approval.execution_status);
  end if;
  update public.jd_approvals
  set status=p_decision,decided_by=p_actor_id,decision_note=left(coalesce(p_note,''),2000),
      decided_at=v_now,updated_at=v_now
  where id=p_approval_id and school_id=v_school returning * into v_approval;
  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
  values(v_school,p_actor_id,v_approval.run_id,'approval.'||p_decision,
    jsonb_build_object('approval_id',p_approval_id,'execution_status',v_approval.execution_status));
  return jsonb_build_object(
    'id',v_approval.id,'status',v_approval.status,'execution_status',v_approval.execution_status,
    'decided_by',v_approval.decided_by,'decided_at',v_approval.decided_at,
    'decision_note',v_approval.decision_note
  );
end;
$function$;
revoke all on function public.jd_decide_approval(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.jd_decide_approval(uuid,uuid,text,text) to service_role;

-- Only the approved activation RPC may call the lower-level identity creators.
revoke execute on function public.jd_workforce_create_employee(uuid,uuid,text,text,integer,text,text) from service_role;
revoke execute on function public.jd_workforce_create_team(uuid,uuid,text,text) from service_role;

           or v_specialist_version is null
           or not exists(select 1 from public.jd_agent_definitions a where a.id=v_specialist::uuid and a.school_id=v_school and a.state='published' and a.execution_authorized is true and a.current_version=v_specialist_version) then
          raise exception 'Registry team member must be current, published and execution-authorized' using errcode='42501';
        end if;
        select v.content->>'name' into v_specialist_name from public.jd_agent_definition_versions v
        where v.agent_id=v_specialist::uuid and v.school_id=v_school and v.version=v_specialist_version;
      else
        raise exception 'Unknown team member specialist kind' using errcode='22023';
      end if;
      if jsonb_typeof(v_member->'responsibilities') is distinct from 'array' then
        raise exception 'Team member responsibilities must be a list' using errcode='22023';
      end if;
      if v_member ? 'requested_access' and jsonb_typeof(v_member->'requested_access') is distinct from 'array' then
        raise exception 'Team member requested access must be a list' using errcode='22023';
      end if;
      if jsonb_array_length(v_member->'responsibilities')<1 then
        raise exception 'Every team member needs at least one responsibility' using errcode='22023';
      end if;
      v_created:=public.jd_workforce_create_employee(
        p_actor,gen_random_uuid(),'builtin',v_specialist,null,v_name,v_department
      );
      v_employee_id:=(v_created->>'employee_id')::uuid;
      if v_employee_id is null then raise exception 'A team employee identity was not confirmed' using errcode='P0001'; end if;
      update public.jd_workforce_employees
      set role_title=btrim(v_member->>'role'),purpose=v_purpose,
          responsibilities=coalesce(v_member->'responsibilities','[]'::jsonb),
          requested_access=coalesce(v_member->'requested_access','[]'::jsonb)
      where id=v_employee_id and school_id=v_school;
      perform public.jd_workforce_team_membership(
        p_actor,gen_random_uuid(),v_team_id,v_employee_id,'add',
        case when v_member_index=1 then 'lead' else 'member' end
      );
      v_employee_ids:=v_employee_ids||jsonb_build_array(jsonb_build_object(
        'employee_id',v_employee_id,'name',v_name,'role',v_member->>'role',
        'specialist_ref',v_specialist
      ));
    end loop;
  end if;

  v_receipt:=jsonb_build_object(
    'approval_id',p_approval,'kind',v_kind,'employee_ids',v_employee_ids,
    'team_id',v_team_id,'activated',true,'tools_granted',false,
    'connectors_authorised',false,'assignment_started',false,
    'billing_enabled',false,'billing_mode','shadow_only','replayed',false
  );
  insert into public.jd_workforce_proposal_activations(
    school_id,approval_id,request_id,actor_id,proposal_kind,receipt
  ) values(v_school,p_approval,p_request,p_actor,v_kind,v_receipt);

  update public.jd_approvals
  set execution_status='completed',execution_result_json=v_receipt,updated_at=clock_timestamp()
  where id=p_approval and school_id=v_school;
  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
  values(v_school,p_actor,v_approval.run_id,'workforce.proposal.activated',
    v_receipt||jsonb_build_object('request_id',p_request));
  return v_receipt;
end;
$function$;

revoke all on function public.jd_workforce_activate_approved_proposal(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.jd_workforce_activate_approved_proposal(uuid,uuid,uuid) to service_role;

create or replace function public.jd_decide_approval(
  p_approval_id uuid,p_actor_id uuid,p_decision text,p_note text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare
  v_school uuid;
  v_approval public.jd_approvals%rowtype;
  v_now timestamptz:=clock_timestamp();
begin
  if p_decision is null or p_decision not in ('approved','rejected') then
    raise exception 'Invalid approval decision' using errcode='22023';
  end if;
  select school_id into v_school from public.profiles
  where id=p_actor_id and role in ('owner','admin') for share;
  if v_school is null then raise exception 'Only workspace administrators can decide approvals' using errcode='42501'; end if;
  select * into v_approval from public.jd_approvals
  where id=p_approval_id and school_id=v_school for update;
  if not found then raise exception 'Approval request not found' using errcode='P0002'; end if;
  if v_approval.status<>'pending' then raise exception 'Approval request has already been decided' using errcode='40001'; end if;
  if v_approval.expires_at<=v_now then
    update public.jd_approvals set status='expired',updated_at=v_now
    where id=p_approval_id and school_id=v_school;
    insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
    values(v_school,p_actor_id,v_approval.run_id,'approval.expired',
      jsonb_build_object('approval_id',p_approval_id,'expired_by','decision_guard'));
    return jsonb_build_object('id',p_approval_id,'status','expired','execution_status',v_approval.execution_status);
  end if;
  update public.jd_approvals
  set status=p_decision,decided_by=p_actor_id,decision_note=left(coalesce(p_note,''),2000),
      decided_at=v_now,updated_at=v_now
  where id=p_approval_id and school_id=v_school returning * into v_approval;
  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
  values(v_school,p_actor_id,v_approval.run_id,'approval.'||p_decision,
    jsonb_build_object('approval_id',p_approval_id,'execution_status',v_approval.execution_status));
  return jsonb_build_object(
    'id',v_approval.id,'status',v_approval.status,'execution_status',v_approval.execution_status,
    'decided_by',v_approval.decided_by,'decided_at',v_approval.decided_at,
    'decision_note',v_approval.decision_note
  );
end;
$function$;
revoke all on function public.jd_decide_approval(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.jd_decide_approval(uuid,uuid,text,text) to service_role;

-- Only the approved activation RPC may call the lower-level identity creators.
revoke execute on function public.jd_workforce_create_employee(uuid,uuid,text,text,integer,text,text) from service_role;
revoke execute on function public.jd_workforce_create_team(uuid,uuid,text,text) from service_role;
 then (v_proposal->>'specialist_version')::integer else null end;
    if v_specialist_kind='builtin' then
      if v_specialist is null or not (v_specialist=any(v_allowed)) or v_specialist_version is not null then
        raise exception 'Choose an available built-in specialist before activation' using errcode='22023';
      end if;
      v_specialist_name:=replace(v_specialist,'_',' ');
    elsif v_specialist_kind='registry' then
      if v_specialist is null or v_specialist !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}
    v_employee_ids:=jsonb_build_array(jsonb_build_object(
      'employee_id',v_employee_id,'name',v_name,'specialist_ref',v_specialist
    ));
  else
    v_specialist:=v_proposal->>'specialist_ref';
    if v_specialist is null or not (v_specialist=any(v_allowed)) then
      raise exception 'A team coordinator must use a supported built-in specialist' using errcode='22023';
    end if;
    if jsonb_typeof(v_proposal->'members') is distinct from 'array' then
      raise exception 'A team must contain a member list' using errcode='22023';
    end if;
    if jsonb_array_length(v_proposal->'members') not between 1 and 20 then
      raise exception 'A team must contain between one and twenty described members' using errcode='22023';
    end if;
    v_team_name:=v_name;
    if exists(select 1 from public.jd_workforce_teams
      where school_id=v_school and lower(name)=lower(v_team_name) and retired_at is null) then
      raise exception 'An active team already uses this name; revise the proposal before activation' using errcode='40001';
    end if;
    v_created:=public.jd_workforce_create_team(p_actor,gen_random_uuid(),v_team_name,v_purpose);
    v_team_id:=(v_created->>'team_id')::uuid;
    if v_team_id is null then raise exception 'Team creation was not confirmed' using errcode='P0001'; end if;
    update public.jd_workforce_teams
    set department=v_department,coordinator_specialist_ref=v_specialist,
        responsibilities=coalesce(v_proposal->'responsibilities','[]'::jsonb),
        requested_access=coalesce(v_proposal->'requested_access','[]'::jsonb)
    where id=v_team_id and school_id=v_school;

    for v_member in select value from jsonb_array_elements(v_proposal->'members')
    loop
      v_member_index:=v_member_index+1;
      v_specialist:=v_member->>'specialist_ref';
      v_name:=btrim(coalesce(v_member->>'name',''));
      if jsonb_typeof(v_member) is distinct from 'object'
         or v_specialist is null or not (v_specialist=any(v_allowed))
         or length(v_name) not between 2 and 120
         or length(btrim(coalesce(v_member->>'role',''))) not between 2 and 120 then
        raise exception 'Every team member needs a supported specialist and complete role details' using errcode='22023';
      end if;
      if jsonb_typeof(v_member->'responsibilities') is distinct from 'array' then
        raise exception 'Team member responsibilities must be a list' using errcode='22023';
      end if;
      if v_member ? 'requested_access' and jsonb_typeof(v_member->'requested_access') is distinct from 'array' then
        raise exception 'Team member requested access must be a list' using errcode='22023';
      end if;
      if jsonb_array_length(v_member->'responsibilities')<1 then
        raise exception 'Every team member needs at least one responsibility' using errcode='22023';
      end if;
      v_created:=public.jd_workforce_create_employee(
        p_actor,gen_random_uuid(),'builtin',v_specialist,null,v_name,v_department
      );
      v_employee_id:=(v_created->>'employee_id')::uuid;
      if v_employee_id is null then raise exception 'A team employee identity was not confirmed' using errcode='P0001'; end if;
      update public.jd_workforce_employees
      set role_title=btrim(v_member->>'role'),purpose=v_purpose,
          responsibilities=coalesce(v_member->'responsibilities','[]'::jsonb),
          requested_access=coalesce(v_member->'requested_access','[]'::jsonb)
      where id=v_employee_id and school_id=v_school;
      perform public.jd_workforce_team_membership(
        p_actor,gen_random_uuid(),v_team_id,v_employee_id,'add',
        case when v_member_index=1 then 'lead' else 'member' end
      );
      v_employee_ids:=v_employee_ids||jsonb_build_array(jsonb_build_object(
        'employee_id',v_employee_id,'name',v_name,'role',v_member->>'role',
        'specialist_ref',v_specialist
      ));
    end loop;
  end if;

  v_receipt:=jsonb_build_object(
    'approval_id',p_approval,'kind',v_kind,'employee_ids',v_employee_ids,
    'team_id',v_team_id,'activated',true,'tools_granted',false,
    'connectors_authorised',false,'assignment_started',false,
    'billing_enabled',false,'billing_mode','shadow_only','replayed',false
  );
  insert into public.jd_workforce_proposal_activations(
    school_id,approval_id,request_id,actor_id,proposal_kind,receipt
  ) values(v_school,p_approval,p_request,p_actor,v_kind,v_receipt);

  update public.jd_approvals
  set execution_status='completed',execution_result_json=v_receipt,updated_at=clock_timestamp()
  where id=p_approval and school_id=v_school;
  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
  values(v_school,p_actor,v_approval.run_id,'workforce.proposal.activated',
    v_receipt||jsonb_build_object('request_id',p_request));
  return v_receipt;
end;
$function$;

revoke all on function public.jd_workforce_activate_approved_proposal(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.jd_workforce_activate_approved_proposal(uuid,uuid,uuid) to service_role;

create or replace function public.jd_decide_approval(
  p_approval_id uuid,p_actor_id uuid,p_decision text,p_note text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare
  v_school uuid;
  v_approval public.jd_approvals%rowtype;
  v_now timestamptz:=clock_timestamp();
begin
  if p_decision is null or p_decision not in ('approved','rejected') then
    raise exception 'Invalid approval decision' using errcode='22023';
  end if;
  select school_id into v_school from public.profiles
  where id=p_actor_id and role in ('owner','admin') for share;
  if v_school is null then raise exception 'Only workspace administrators can decide approvals' using errcode='42501'; end if;
  select * into v_approval from public.jd_approvals
  where id=p_approval_id and school_id=v_school for update;
  if not found then raise exception 'Approval request not found' using errcode='P0002'; end if;
  if v_approval.status<>'pending' then raise exception 'Approval request has already been decided' using errcode='40001'; end if;
  if v_approval.expires_at<=v_now then
    update public.jd_approvals set status='expired',updated_at=v_now
    where id=p_approval_id and school_id=v_school;
    insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
    values(v_school,p_actor_id,v_approval.run_id,'approval.expired',
      jsonb_build_object('approval_id',p_approval_id,'expired_by','decision_guard'));
    return jsonb_build_object('id',p_approval_id,'status','expired','execution_status',v_approval.execution_status);
  end if;
  update public.jd_approvals
  set status=p_decision,decided_by=p_actor_id,decision_note=left(coalesce(p_note,''),2000),
      decided_at=v_now,updated_at=v_now
  where id=p_approval_id and school_id=v_school returning * into v_approval;
  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
  values(v_school,p_actor_id,v_approval.run_id,'approval.'||p_decision,
    jsonb_build_object('approval_id',p_approval_id,'execution_status',v_approval.execution_status));
  return jsonb_build_object(
    'id',v_approval.id,'status',v_approval.status,'execution_status',v_approval.execution_status,
    'decided_by',v_approval.decided_by,'decided_at',v_approval.decided_at,
    'decision_note',v_approval.decision_note
  );
end;
$function$;
revoke all on function public.jd_decide_approval(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.jd_decide_approval(uuid,uuid,text,text) to service_role;

-- Only the approved activation RPC may call the lower-level identity creators.
revoke execute on function public.jd_workforce_create_employee(uuid,uuid,text,text,integer,text,text) from service_role;
revoke execute on function public.jd_workforce_create_team(uuid,uuid,text,text) from service_role;

         or v_specialist_version is null
         or not exists(select 1 from public.jd_agent_definitions a where a.id=v_specialist::uuid and a.school_id=v_school and a.state='published' and a.execution_authorized is true and a.current_version=v_specialist_version) then
        raise exception 'Registry specialist must be current, published and execution-authorized' using errcode='42501';
      end if;
      select v.content->>'name' into v_specialist_name from public.jd_agent_definition_versions v
      where v.agent_id=v_specialist::uuid and v.school_id=v_school and v.version=v_specialist_version;
    else
      raise exception 'Unknown specialist kind' using errcode='22023';
    end if;
    v_created:=public.jd_workforce_create_employee(
      p_actor,gen_random_uuid(),v_specialist_kind,v_specialist,v_specialist_version,v_name,v_department
    );
    v_employee_id:=(v_created->>'employee_id')::uuid;
    if v_employee_id is null then raise exception 'Employee identity creation was not confirmed' using errcode='P0001'; end if;
    update public.jd_workforce_employees
    set role_title=coalesce(v_specialist_name,replace(v_specialist,'_',' ')),purpose=v_purpose,
        responsibilities=coalesce(v_proposal->'responsibilities','[]'::jsonb),
        requested_access=coalesce(v_proposal->'requested_access','[]'::jsonb)
    where id=v_employee_id and school_id=v_school;
    v_employee_ids:=jsonb_build_array(jsonb_build_object(
      'employee_id',v_employee_id,'name',v_name,'specialist_ref',v_specialist
    ));
  else
    v_specialist:=v_proposal->>'specialist_ref';
    if v_specialist is null or not (v_specialist=any(v_allowed)) then
      raise exception 'A team coordinator must use a supported built-in specialist' using errcode='22023';
    end if;
    if jsonb_typeof(v_proposal->'members') is distinct from 'array' then
      raise exception 'A team must contain a member list' using errcode='22023';
    end if;
    if jsonb_array_length(v_proposal->'members') not between 1 and 20 then
      raise exception 'A team must contain between one and twenty described members' using errcode='22023';
    end if;
    v_team_name:=v_name;
    if exists(select 1 from public.jd_workforce_teams
      where school_id=v_school and lower(name)=lower(v_team_name) and retired_at is null) then
      raise exception 'An active team already uses this name; revise the proposal before activation' using errcode='40001';
    end if;
    v_created:=public.jd_workforce_create_team(p_actor,gen_random_uuid(),v_team_name,v_purpose);
    v_team_id:=(v_created->>'team_id')::uuid;
    if v_team_id is null then raise exception 'Team creation was not confirmed' using errcode='P0001'; end if;
    update public.jd_workforce_teams
    set department=v_department,coordinator_specialist_ref=v_specialist,
        responsibilities=coalesce(v_proposal->'responsibilities','[]'::jsonb),
        requested_access=coalesce(v_proposal->'requested_access','[]'::jsonb)
    where id=v_team_id and school_id=v_school;

    for v_member in select value from jsonb_array_elements(v_proposal->'members')
    loop
      v_member_index:=v_member_index+1;
      v_specialist:=v_member->>'specialist_ref';
      v_name:=btrim(coalesce(v_member->>'name',''));
      if jsonb_typeof(v_member) is distinct from 'object'
         or v_specialist is null or not (v_specialist=any(v_allowed))
         or length(v_name) not between 2 and 120
         or length(btrim(coalesce(v_member->>'role',''))) not between 2 and 120 then
        raise exception 'Every team member needs a supported specialist and complete role details' using errcode='22023';
      end if;
      if jsonb_typeof(v_member->'responsibilities') is distinct from 'array' then
        raise exception 'Team member responsibilities must be a list' using errcode='22023';
      end if;
      if v_member ? 'requested_access' and jsonb_typeof(v_member->'requested_access') is distinct from 'array' then
        raise exception 'Team member requested access must be a list' using errcode='22023';
      end if;
      if jsonb_array_length(v_member->'responsibilities')<1 then
        raise exception 'Every team member needs at least one responsibility' using errcode='22023';
      end if;
      v_created:=public.jd_workforce_create_employee(
        p_actor,gen_random_uuid(),'builtin',v_specialist,null,v_name,v_department
      );
      v_employee_id:=(v_created->>'employee_id')::uuid;
      if v_employee_id is null then raise exception 'A team employee identity was not confirmed' using errcode='P0001'; end if;
      update public.jd_workforce_employees
      set role_title=btrim(v_member->>'role'),purpose=v_purpose,
          responsibilities=coalesce(v_member->'responsibilities','[]'::jsonb),
          requested_access=coalesce(v_member->'requested_access','[]'::jsonb)
      where id=v_employee_id and school_id=v_school;
      perform public.jd_workforce_team_membership(
        p_actor,gen_random_uuid(),v_team_id,v_employee_id,'add',
        case when v_member_index=1 then 'lead' else 'member' end
      );
      v_employee_ids:=v_employee_ids||jsonb_build_array(jsonb_build_object(
        'employee_id',v_employee_id,'name',v_name,'role',v_member->>'role',
        'specialist_ref',v_specialist
      ));
    end loop;
  end if;

  v_receipt:=jsonb_build_object(
    'approval_id',p_approval,'kind',v_kind,'employee_ids',v_employee_ids,
    'team_id',v_team_id,'activated',true,'tools_granted',false,
    'connectors_authorised',false,'assignment_started',false,
    'billing_enabled',false,'billing_mode','shadow_only','replayed',false
  );
  insert into public.jd_workforce_proposal_activations(
    school_id,approval_id,request_id,actor_id,proposal_kind,receipt
  ) values(v_school,p_approval,p_request,p_actor,v_kind,v_receipt);

  update public.jd_approvals
  set execution_status='completed',execution_result_json=v_receipt,updated_at=clock_timestamp()
  where id=p_approval and school_id=v_school;
  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
  values(v_school,p_actor,v_approval.run_id,'workforce.proposal.activated',
    v_receipt||jsonb_build_object('request_id',p_request));
  return v_receipt;
end;
$function$;

revoke all on function public.jd_workforce_activate_approved_proposal(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.jd_workforce_activate_approved_proposal(uuid,uuid,uuid) to service_role;

create or replace function public.jd_decide_approval(
  p_approval_id uuid,p_actor_id uuid,p_decision text,p_note text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare
  v_school uuid;
  v_approval public.jd_approvals%rowtype;
  v_now timestamptz:=clock_timestamp();
begin
  if p_decision is null or p_decision not in ('approved','rejected') then
    raise exception 'Invalid approval decision' using errcode='22023';
  end if;
  select school_id into v_school from public.profiles
  where id=p_actor_id and role in ('owner','admin') for share;
  if v_school is null then raise exception 'Only workspace administrators can decide approvals' using errcode='42501'; end if;
  select * into v_approval from public.jd_approvals
  where id=p_approval_id and school_id=v_school for update;
  if not found then raise exception 'Approval request not found' using errcode='P0002'; end if;
  if v_approval.status<>'pending' then raise exception 'Approval request has already been decided' using errcode='40001'; end if;
  if v_approval.expires_at<=v_now then
    update public.jd_approvals set status='expired',updated_at=v_now
    where id=p_approval_id and school_id=v_school;
    insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
    values(v_school,p_actor_id,v_approval.run_id,'approval.expired',
      jsonb_build_object('approval_id',p_approval_id,'expired_by','decision_guard'));
    return jsonb_build_object('id',p_approval_id,'status','expired','execution_status',v_approval.execution_status);
  end if;
  update public.jd_approvals
  set status=p_decision,decided_by=p_actor_id,decision_note=left(coalesce(p_note,''),2000),
      decided_at=v_now,updated_at=v_now
  where id=p_approval_id and school_id=v_school returning * into v_approval;
  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
  values(v_school,p_actor_id,v_approval.run_id,'approval.'||p_decision,
    jsonb_build_object('approval_id',p_approval_id,'execution_status',v_approval.execution_status));
  return jsonb_build_object(
    'id',v_approval.id,'status',v_approval.status,'execution_status',v_approval.execution_status,
    'decided_by',v_approval.decided_by,'decided_at',v_approval.decided_at,
    'decision_note',v_approval.decision_note
  );
end;
$function$;
revoke all on function public.jd_decide_approval(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.jd_decide_approval(uuid,uuid,text,text) to service_role;

-- Only the approved activation RPC may call the lower-level identity creators.
revoke execute on function public.jd_workforce_create_employee(uuid,uuid,text,text,integer,text,text) from service_role;
revoke execute on function public.jd_workforce_create_team(uuid,uuid,text,text) from service_role;
 then (v_proposal->>'specialist_version')::integer else null end;
    if v_specialist_kind='builtin' then
      if v_specialist is null or not (v_specialist=any(v_allowed)) or v_specialist_version is not null then
        raise exception 'A team coordinator must use a supported built-in specialist' using errcode='22023';
      end if;
      v_specialist_name:=replace(v_specialist,'_',' ');
    elsif v_specialist_kind='registry' then
      if v_specialist is null or v_specialist !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}
      raise exception 'A team must contain a member list' using errcode='22023';
    end if;
    if jsonb_array_length(v_proposal->'members') not between 1 and 20 then
      raise exception 'A team must contain between one and twenty described members' using errcode='22023';
    end if;
    v_team_name:=v_name;
    if exists(select 1 from public.jd_workforce_teams
      where school_id=v_school and lower(name)=lower(v_team_name) and retired_at is null) then
      raise exception 'An active team already uses this name; revise the proposal before activation' using errcode='40001';
    end if;
    v_created:=public.jd_workforce_create_team(p_actor,gen_random_uuid(),v_team_name,v_purpose);
    v_team_id:=(v_created->>'team_id')::uuid;
    if v_team_id is null then raise exception 'Team creation was not confirmed' using errcode='P0001'; end if;
    update public.jd_workforce_teams
    set department=v_department,coordinator_specialist_ref=v_specialist,
        responsibilities=coalesce(v_proposal->'responsibilities','[]'::jsonb),
        requested_access=coalesce(v_proposal->'requested_access','[]'::jsonb)
    where id=v_team_id and school_id=v_school;

    for v_member in select value from jsonb_array_elements(v_proposal->'members')
    loop
      v_member_index:=v_member_index+1;
      v_specialist:=v_member->>'specialist_ref';
      v_name:=btrim(coalesce(v_member->>'name',''));
      if jsonb_typeof(v_member) is distinct from 'object'
         or v_specialist is null or not (v_specialist=any(v_allowed))
         or length(v_name) not between 2 and 120
         or length(btrim(coalesce(v_member->>'role',''))) not between 2 and 120 then
        raise exception 'Every team member needs a supported specialist and complete role details' using errcode='22023';
      end if;
      if jsonb_typeof(v_member->'responsibilities') is distinct from 'array' then
        raise exception 'Team member responsibilities must be a list' using errcode='22023';
      end if;
      if v_member ? 'requested_access' and jsonb_typeof(v_member->'requested_access') is distinct from 'array' then
        raise exception 'Team member requested access must be a list' using errcode='22023';
      end if;
      if jsonb_array_length(v_member->'responsibilities')<1 then
        raise exception 'Every team member needs at least one responsibility' using errcode='22023';
      end if;
      v_created:=public.jd_workforce_create_employee(
        p_actor,gen_random_uuid(),'builtin',v_specialist,null,v_name,v_department
      );
      v_employee_id:=(v_created->>'employee_id')::uuid;
      if v_employee_id is null then raise exception 'A team employee identity was not confirmed' using errcode='P0001'; end if;
      update public.jd_workforce_employees
      set role_title=btrim(v_member->>'role'),purpose=v_purpose,
          responsibilities=coalesce(v_member->'responsibilities','[]'::jsonb),
          requested_access=coalesce(v_member->'requested_access','[]'::jsonb)
      where id=v_employee_id and school_id=v_school;
      perform public.jd_workforce_team_membership(
        p_actor,gen_random_uuid(),v_team_id,v_employee_id,'add',
        case when v_member_index=1 then 'lead' else 'member' end
      );
      v_employee_ids:=v_employee_ids||jsonb_build_array(jsonb_build_object(
        'employee_id',v_employee_id,'name',v_name,'role',v_member->>'role',
        'specialist_ref',v_specialist
      ));
    end loop;
  end if;

  v_receipt:=jsonb_build_object(
    'approval_id',p_approval,'kind',v_kind,'employee_ids',v_employee_ids,
    'team_id',v_team_id,'activated',true,'tools_granted',false,
    'connectors_authorised',false,'assignment_started',false,
    'billing_enabled',false,'billing_mode','shadow_only','replayed',false
  );
  insert into public.jd_workforce_proposal_activations(
    school_id,approval_id,request_id,actor_id,proposal_kind,receipt
  ) values(v_school,p_approval,p_request,p_actor,v_kind,v_receipt);

  update public.jd_approvals
  set execution_status='completed',execution_result_json=v_receipt,updated_at=clock_timestamp()
  where id=p_approval and school_id=v_school;
  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
  values(v_school,p_actor,v_approval.run_id,'workforce.proposal.activated',
    v_receipt||jsonb_build_object('request_id',p_request));
  return v_receipt;
end;
$function$;

revoke all on function public.jd_workforce_activate_approved_proposal(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.jd_workforce_activate_approved_proposal(uuid,uuid,uuid) to service_role;

create or replace function public.jd_decide_approval(
  p_approval_id uuid,p_actor_id uuid,p_decision text,p_note text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare
  v_school uuid;
  v_approval public.jd_approvals%rowtype;
  v_now timestamptz:=clock_timestamp();
begin
  if p_decision is null or p_decision not in ('approved','rejected') then
    raise exception 'Invalid approval decision' using errcode='22023';
  end if;
  select school_id into v_school from public.profiles
  where id=p_actor_id and role in ('owner','admin') for share;
  if v_school is null then raise exception 'Only workspace administrators can decide approvals' using errcode='42501'; end if;
  select * into v_approval from public.jd_approvals
  where id=p_approval_id and school_id=v_school for update;
  if not found then raise exception 'Approval request not found' using errcode='P0002'; end if;
  if v_approval.status<>'pending' then raise exception 'Approval request has already been decided' using errcode='40001'; end if;
  if v_approval.expires_at<=v_now then
    update public.jd_approvals set status='expired',updated_at=v_now
    where id=p_approval_id and school_id=v_school;
    insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
    values(v_school,p_actor_id,v_approval.run_id,'approval.expired',
      jsonb_build_object('approval_id',p_approval_id,'expired_by','decision_guard'));
    return jsonb_build_object('id',p_approval_id,'status','expired','execution_status',v_approval.execution_status);
  end if;
  update public.jd_approvals
  set status=p_decision,decided_by=p_actor_id,decision_note=left(coalesce(p_note,''),2000),
      decided_at=v_now,updated_at=v_now
  where id=p_approval_id and school_id=v_school returning * into v_approval;
  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
  values(v_school,p_actor_id,v_approval.run_id,'approval.'||p_decision,
    jsonb_build_object('approval_id',p_approval_id,'execution_status',v_approval.execution_status));
  return jsonb_build_object(
    'id',v_approval.id,'status',v_approval.status,'execution_status',v_approval.execution_status,
    'decided_by',v_approval.decided_by,'decided_at',v_approval.decided_at,
    'decision_note',v_approval.decision_note
  );
end;
$function$;
revoke all on function public.jd_decide_approval(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.jd_decide_approval(uuid,uuid,text,text) to service_role;

-- Only the approved activation RPC may call the lower-level identity creators.
revoke execute on function public.jd_workforce_create_employee(uuid,uuid,text,text,integer,text,text) from service_role;
revoke execute on function public.jd_workforce_create_team(uuid,uuid,text,text) from service_role;
 then (v_proposal->>'specialist_version')::integer else null end;
    if v_specialist_kind='builtin' then
      if v_specialist is null or not (v_specialist=any(v_allowed)) or v_specialist_version is not null then
        raise exception 'Choose an available built-in specialist before activation' using errcode='22023';
      end if;
      v_specialist_name:=replace(v_specialist,'_',' ');
    elsif v_specialist_kind='registry' then
      if v_specialist is null or v_specialist !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}
    v_employee_ids:=jsonb_build_array(jsonb_build_object(
      'employee_id',v_employee_id,'name',v_name,'specialist_ref',v_specialist
    ));
  else
    v_specialist:=v_proposal->>'specialist_ref';
    if v_specialist is null or not (v_specialist=any(v_allowed)) then
      raise exception 'A team coordinator must use a supported built-in specialist' using errcode='22023';
    end if;
    if jsonb_typeof(v_proposal->'members') is distinct from 'array' then
      raise exception 'A team must contain a member list' using errcode='22023';
    end if;
    if jsonb_array_length(v_proposal->'members') not between 1 and 20 then
      raise exception 'A team must contain between one and twenty described members' using errcode='22023';
    end if;
    v_team_name:=v_name;
    if exists(select 1 from public.jd_workforce_teams
      where school_id=v_school and lower(name)=lower(v_team_name) and retired_at is null) then
      raise exception 'An active team already uses this name; revise the proposal before activation' using errcode='40001';
    end if;
    v_created:=public.jd_workforce_create_team(p_actor,gen_random_uuid(),v_team_name,v_purpose);
    v_team_id:=(v_created->>'team_id')::uuid;
    if v_team_id is null then raise exception 'Team creation was not confirmed' using errcode='P0001'; end if;
    update public.jd_workforce_teams
    set department=v_department,coordinator_specialist_ref=v_specialist,
        responsibilities=coalesce(v_proposal->'responsibilities','[]'::jsonb),
        requested_access=coalesce(v_proposal->'requested_access','[]'::jsonb)
    where id=v_team_id and school_id=v_school;

    for v_member in select value from jsonb_array_elements(v_proposal->'members')
    loop
      v_member_index:=v_member_index+1;
      v_specialist:=v_member->>'specialist_ref';
      v_name:=btrim(coalesce(v_member->>'name',''));
      if jsonb_typeof(v_member) is distinct from 'object'
         or v_specialist is null or not (v_specialist=any(v_allowed))
         or length(v_name) not between 2 and 120
         or length(btrim(coalesce(v_member->>'role',''))) not between 2 and 120 then
        raise exception 'Every team member needs a supported specialist and complete role details' using errcode='22023';
      end if;
      if jsonb_typeof(v_member->'responsibilities') is distinct from 'array' then
        raise exception 'Team member responsibilities must be a list' using errcode='22023';
      end if;
      if v_member ? 'requested_access' and jsonb_typeof(v_member->'requested_access') is distinct from 'array' then
        raise exception 'Team member requested access must be a list' using errcode='22023';
      end if;
      if jsonb_array_length(v_member->'responsibilities')<1 then
        raise exception 'Every team member needs at least one responsibility' using errcode='22023';
      end if;
      v_created:=public.jd_workforce_create_employee(
        p_actor,gen_random_uuid(),'builtin',v_specialist,null,v_name,v_department
      );
      v_employee_id:=(v_created->>'employee_id')::uuid;
      if v_employee_id is null then raise exception 'A team employee identity was not confirmed' using errcode='P0001'; end if;
      update public.jd_workforce_employees
      set role_title=btrim(v_member->>'role'),purpose=v_purpose,
          responsibilities=coalesce(v_member->'responsibilities','[]'::jsonb),
          requested_access=coalesce(v_member->'requested_access','[]'::jsonb)
      where id=v_employee_id and school_id=v_school;
      perform public.jd_workforce_team_membership(
        p_actor,gen_random_uuid(),v_team_id,v_employee_id,'add',
        case when v_member_index=1 then 'lead' else 'member' end
      );
      v_employee_ids:=v_employee_ids||jsonb_build_array(jsonb_build_object(
        'employee_id',v_employee_id,'name',v_name,'role',v_member->>'role',
        'specialist_ref',v_specialist
      ));
    end loop;
  end if;

  v_receipt:=jsonb_build_object(
    'approval_id',p_approval,'kind',v_kind,'employee_ids',v_employee_ids,
    'team_id',v_team_id,'activated',true,'tools_granted',false,
    'connectors_authorised',false,'assignment_started',false,
    'billing_enabled',false,'billing_mode','shadow_only','replayed',false
  );
  insert into public.jd_workforce_proposal_activations(
    school_id,approval_id,request_id,actor_id,proposal_kind,receipt
  ) values(v_school,p_approval,p_request,p_actor,v_kind,v_receipt);

  update public.jd_approvals
  set execution_status='completed',execution_result_json=v_receipt,updated_at=clock_timestamp()
  where id=p_approval and school_id=v_school;
  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
  values(v_school,p_actor,v_approval.run_id,'workforce.proposal.activated',
    v_receipt||jsonb_build_object('request_id',p_request));
  return v_receipt;
end;
$function$;

revoke all on function public.jd_workforce_activate_approved_proposal(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.jd_workforce_activate_approved_proposal(uuid,uuid,uuid) to service_role;

create or replace function public.jd_decide_approval(
  p_approval_id uuid,p_actor_id uuid,p_decision text,p_note text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare
  v_school uuid;
  v_approval public.jd_approvals%rowtype;
  v_now timestamptz:=clock_timestamp();
begin
  if p_decision is null or p_decision not in ('approved','rejected') then
    raise exception 'Invalid approval decision' using errcode='22023';
  end if;
  select school_id into v_school from public.profiles
  where id=p_actor_id and role in ('owner','admin') for share;
  if v_school is null then raise exception 'Only workspace administrators can decide approvals' using errcode='42501'; end if;
  select * into v_approval from public.jd_approvals
  where id=p_approval_id and school_id=v_school for update;
  if not found then raise exception 'Approval request not found' using errcode='P0002'; end if;
  if v_approval.status<>'pending' then raise exception 'Approval request has already been decided' using errcode='40001'; end if;
  if v_approval.expires_at<=v_now then
    update public.jd_approvals set status='expired',updated_at=v_now
    where id=p_approval_id and school_id=v_school;
    insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
    values(v_school,p_actor_id,v_approval.run_id,'approval.expired',
      jsonb_build_object('approval_id',p_approval_id,'expired_by','decision_guard'));
    return jsonb_build_object('id',p_approval_id,'status','expired','execution_status',v_approval.execution_status);
  end if;
  update public.jd_approvals
  set status=p_decision,decided_by=p_actor_id,decision_note=left(coalesce(p_note,''),2000),
      decided_at=v_now,updated_at=v_now
  where id=p_approval_id and school_id=v_school returning * into v_approval;
  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
  values(v_school,p_actor_id,v_approval.run_id,'approval.'||p_decision,
    jsonb_build_object('approval_id',p_approval_id,'execution_status',v_approval.execution_status));
  return jsonb_build_object(
    'id',v_approval.id,'status',v_approval.status,'execution_status',v_approval.execution_status,
    'decided_by',v_approval.decided_by,'decided_at',v_approval.decided_at,
    'decision_note',v_approval.decision_note
  );
end;
$function$;
revoke all on function public.jd_decide_approval(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.jd_decide_approval(uuid,uuid,text,text) to service_role;

-- Only the approved activation RPC may call the lower-level identity creators.
revoke execute on function public.jd_workforce_create_employee(uuid,uuid,text,text,integer,text,text) from service_role;
revoke execute on function public.jd_workforce_create_team(uuid,uuid,text,text) from service_role;

         or v_specialist_version is null
         or not exists(select 1 from public.jd_agent_definitions a where a.id=v_specialist::uuid and a.school_id=v_school and a.state='published' and a.execution_authorized is true and a.current_version=v_specialist_version) then
        raise exception 'Registry specialist must be current, published and execution-authorized' using errcode='42501';
      end if;
      select v.content->>'name' into v_specialist_name from public.jd_agent_definition_versions v
      where v.agent_id=v_specialist::uuid and v.school_id=v_school and v.version=v_specialist_version;
    else
      raise exception 'Unknown specialist kind' using errcode='22023';
    end if;
    v_created:=public.jd_workforce_create_employee(
      p_actor,gen_random_uuid(),v_specialist_kind,v_specialist,v_specialist_version,v_name,v_department
    );
    v_employee_id:=(v_created->>'employee_id')::uuid;
    if v_employee_id is null then raise exception 'Employee identity creation was not confirmed' using errcode='P0001'; end if;
    update public.jd_workforce_employees
    set role_title=coalesce(v_specialist_name,replace(v_specialist,'_',' ')),purpose=v_purpose,
        responsibilities=coalesce(v_proposal->'responsibilities','[]'::jsonb),
        requested_access=coalesce(v_proposal->'requested_access','[]'::jsonb)
    where id=v_employee_id and school_id=v_school;
    v_employee_ids:=jsonb_build_array(jsonb_build_object(
      'employee_id',v_employee_id,'name',v_name,'specialist_ref',v_specialist
    ));
  else
    v_specialist:=v_proposal->>'specialist_ref';
    if v_specialist is null or not (v_specialist=any(v_allowed)) then
      raise exception 'A team coordinator must use a supported built-in specialist' using errcode='22023';
    end if;
    if jsonb_typeof(v_proposal->'members') is distinct from 'array' then
      raise exception 'A team must contain a member list' using errcode='22023';
    end if;
    if jsonb_array_length(v_proposal->'members') not between 1 and 20 then
      raise exception 'A team must contain between one and twenty described members' using errcode='22023';
    end if;
    v_team_name:=v_name;
    if exists(select 1 from public.jd_workforce_teams
      where school_id=v_school and lower(name)=lower(v_team_name) and retired_at is null) then
      raise exception 'An active team already uses this name; revise the proposal before activation' using errcode='40001';
    end if;
    v_created:=public.jd_workforce_create_team(p_actor,gen_random_uuid(),v_team_name,v_purpose);
    v_team_id:=(v_created->>'team_id')::uuid;
    if v_team_id is null then raise exception 'Team creation was not confirmed' using errcode='P0001'; end if;
    update public.jd_workforce_teams
    set department=v_department,coordinator_specialist_ref=v_specialist,
        responsibilities=coalesce(v_proposal->'responsibilities','[]'::jsonb),
        requested_access=coalesce(v_proposal->'requested_access','[]'::jsonb)
    where id=v_team_id and school_id=v_school;

    for v_member in select value from jsonb_array_elements(v_proposal->'members')
    loop
      v_member_index:=v_member_index+1;
      v_specialist:=v_member->>'specialist_ref';
      v_name:=btrim(coalesce(v_member->>'name',''));
      if jsonb_typeof(v_member) is distinct from 'object'
         or v_specialist is null or not (v_specialist=any(v_allowed))
         or length(v_name) not between 2 and 120
         or length(btrim(coalesce(v_member->>'role',''))) not between 2 and 120 then
        raise exception 'Every team member needs a supported specialist and complete role details' using errcode='22023';
      end if;
      if jsonb_typeof(v_member->'responsibilities') is distinct from 'array' then
        raise exception 'Team member responsibilities must be a list' using errcode='22023';
      end if;
      if v_member ? 'requested_access' and jsonb_typeof(v_member->'requested_access') is distinct from 'array' then
        raise exception 'Team member requested access must be a list' using errcode='22023';
      end if;
      if jsonb_array_length(v_member->'responsibilities')<1 then
        raise exception 'Every team member needs at least one responsibility' using errcode='22023';
      end if;
      v_created:=public.jd_workforce_create_employee(
        p_actor,gen_random_uuid(),'builtin',v_specialist,null,v_name,v_department
      );
      v_employee_id:=(v_created->>'employee_id')::uuid;
      if v_employee_id is null then raise exception 'A team employee identity was not confirmed' using errcode='P0001'; end if;
      update public.jd_workforce_employees
      set role_title=btrim(v_member->>'role'),purpose=v_purpose,
          responsibilities=coalesce(v_member->'responsibilities','[]'::jsonb),
          requested_access=coalesce(v_member->'requested_access','[]'::jsonb)
      where id=v_employee_id and school_id=v_school;
      perform public.jd_workforce_team_membership(
        p_actor,gen_random_uuid(),v_team_id,v_employee_id,'add',
        case when v_member_index=1 then 'lead' else 'member' end
      );
      v_employee_ids:=v_employee_ids||jsonb_build_array(jsonb_build_object(
        'employee_id',v_employee_id,'name',v_name,'role',v_member->>'role',
        'specialist_ref',v_specialist
      ));
    end loop;
  end if;

  v_receipt:=jsonb_build_object(
    'approval_id',p_approval,'kind',v_kind,'employee_ids',v_employee_ids,
    'team_id',v_team_id,'activated',true,'tools_granted',false,
    'connectors_authorised',false,'assignment_started',false,
    'billing_enabled',false,'billing_mode','shadow_only','replayed',false
  );
  insert into public.jd_workforce_proposal_activations(
    school_id,approval_id,request_id,actor_id,proposal_kind,receipt
  ) values(v_school,p_approval,p_request,p_actor,v_kind,v_receipt);

  update public.jd_approvals
  set execution_status='completed',execution_result_json=v_receipt,updated_at=clock_timestamp()
  where id=p_approval and school_id=v_school;
  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
  values(v_school,p_actor,v_approval.run_id,'workforce.proposal.activated',
    v_receipt||jsonb_build_object('request_id',p_request));
  return v_receipt;
end;
$function$;

revoke all on function public.jd_workforce_activate_approved_proposal(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.jd_workforce_activate_approved_proposal(uuid,uuid,uuid) to service_role;

create or replace function public.jd_decide_approval(
  p_approval_id uuid,p_actor_id uuid,p_decision text,p_note text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare
  v_school uuid;
  v_approval public.jd_approvals%rowtype;
  v_now timestamptz:=clock_timestamp();
begin
  if p_decision is null or p_decision not in ('approved','rejected') then
    raise exception 'Invalid approval decision' using errcode='22023';
  end if;
  select school_id into v_school from public.profiles
  where id=p_actor_id and role in ('owner','admin') for share;
  if v_school is null then raise exception 'Only workspace administrators can decide approvals' using errcode='42501'; end if;
  select * into v_approval from public.jd_approvals
  where id=p_approval_id and school_id=v_school for update;
  if not found then raise exception 'Approval request not found' using errcode='P0002'; end if;
  if v_approval.status<>'pending' then raise exception 'Approval request has already been decided' using errcode='40001'; end if;
  if v_approval.expires_at<=v_now then
    update public.jd_approvals set status='expired',updated_at=v_now
    where id=p_approval_id and school_id=v_school;
    insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
    values(v_school,p_actor_id,v_approval.run_id,'approval.expired',
      jsonb_build_object('approval_id',p_approval_id,'expired_by','decision_guard'));
    return jsonb_build_object('id',p_approval_id,'status','expired','execution_status',v_approval.execution_status);
  end if;
  update public.jd_approvals
  set status=p_decision,decided_by=p_actor_id,decision_note=left(coalesce(p_note,''),2000),
      decided_at=v_now,updated_at=v_now
  where id=p_approval_id and school_id=v_school returning * into v_approval;
  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
  values(v_school,p_actor_id,v_approval.run_id,'approval.'||p_decision,
    jsonb_build_object('approval_id',p_approval_id,'execution_status',v_approval.execution_status));
  return jsonb_build_object(
    'id',v_approval.id,'status',v_approval.status,'execution_status',v_approval.execution_status,
    'decided_by',v_approval.decided_by,'decided_at',v_approval.decided_at,
    'decision_note',v_approval.decision_note
  );
end;
$function$;
revoke all on function public.jd_decide_approval(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.jd_decide_approval(uuid,uuid,text,text) to service_role;

-- Only the approved activation RPC may call the lower-level identity creators.
revoke execute on function public.jd_workforce_create_employee(uuid,uuid,text,text,integer,text,text) from service_role;
revoke execute on function public.jd_workforce_create_team(uuid,uuid,text,text) from service_role;

         or v_specialist_version is null
         or not exists(select 1 from public.jd_agent_definitions a where a.id=v_specialist::uuid and a.school_id=v_school and a.state='published' and a.execution_authorized is true and a.current_version=v_specialist_version) then
        raise exception 'Registry team coordinator must be current, published and execution-authorized' using errcode='42501';
      end if;
      select v.content->>'name' into v_specialist_name from public.jd_agent_definition_versions v
      where v.agent_id=v_specialist::uuid and v.school_id=v_school and v.version=v_specialist_version;
    else
      raise exception 'Unknown team coordinator specialist kind' using errcode='22023';
    end if;
    if jsonb_typeof(v_proposal->'members') is distinct from 'array' then
      raise exception 'A team must contain a member list' using errcode='22023';
    end if;
    if jsonb_array_length(v_proposal->'members') not between 1 and 20 then
      raise exception 'A team must contain between one and twenty described members' using errcode='22023';
    end if;
    v_team_name:=v_name;
    if exists(select 1 from public.jd_workforce_teams
      where school_id=v_school and lower(name)=lower(v_team_name) and retired_at is null) then
      raise exception 'An active team already uses this name; revise the proposal before activation' using errcode='40001';
    end if;
    v_created:=public.jd_workforce_create_team(p_actor,gen_random_uuid(),v_team_name,v_purpose);
    v_team_id:=(v_created->>'team_id')::uuid;
    if v_team_id is null then raise exception 'Team creation was not confirmed' using errcode='P0001'; end if;
    update public.jd_workforce_teams
    set department=v_department,coordinator_specialist_ref=v_specialist,
        responsibilities=coalesce(v_proposal->'responsibilities','[]'::jsonb),
        requested_access=coalesce(v_proposal->'requested_access','[]'::jsonb)
    where id=v_team_id and school_id=v_school;

    for v_member in select value from jsonb_array_elements(v_proposal->'members')
    loop
      v_member_index:=v_member_index+1;
      v_specialist:=v_member->>'specialist_ref';
      v_name:=btrim(coalesce(v_member->>'name',''));
      if jsonb_typeof(v_member) is distinct from 'object'
         or v_specialist is null or not (v_specialist=any(v_allowed))
         or length(v_name) not between 2 and 120
         or length(btrim(coalesce(v_member->>'role',''))) not between 2 and 120 then
        raise exception 'Every team member needs a supported specialist and complete role details' using errcode='22023';
      end if;
      if jsonb_typeof(v_member->'responsibilities') is distinct from 'array' then
        raise exception 'Team member responsibilities must be a list' using errcode='22023';
      end if;
      if v_member ? 'requested_access' and jsonb_typeof(v_member->'requested_access') is distinct from 'array' then
        raise exception 'Team member requested access must be a list' using errcode='22023';
      end if;
      if jsonb_array_length(v_member->'responsibilities')<1 then
        raise exception 'Every team member needs at least one responsibility' using errcode='22023';
      end if;
      v_created:=public.jd_workforce_create_employee(
        p_actor,gen_random_uuid(),'builtin',v_specialist,null,v_name,v_department
      );
      v_employee_id:=(v_created->>'employee_id')::uuid;
      if v_employee_id is null then raise exception 'A team employee identity was not confirmed' using errcode='P0001'; end if;
      update public.jd_workforce_employees
      set role_title=btrim(v_member->>'role'),purpose=v_purpose,
          responsibilities=coalesce(v_member->'responsibilities','[]'::jsonb),
          requested_access=coalesce(v_member->'requested_access','[]'::jsonb)
      where id=v_employee_id and school_id=v_school;
      perform public.jd_workforce_team_membership(
        p_actor,gen_random_uuid(),v_team_id,v_employee_id,'add',
        case when v_member_index=1 then 'lead' else 'member' end
      );
      v_employee_ids:=v_employee_ids||jsonb_build_array(jsonb_build_object(
        'employee_id',v_employee_id,'name',v_name,'role',v_member->>'role',
        'specialist_ref',v_specialist
      ));
    end loop;
  end if;

  v_receipt:=jsonb_build_object(
    'approval_id',p_approval,'kind',v_kind,'employee_ids',v_employee_ids,
    'team_id',v_team_id,'activated',true,'tools_granted',false,
    'connectors_authorised',false,'assignment_started',false,
    'billing_enabled',false,'billing_mode','shadow_only','replayed',false
  );
  insert into public.jd_workforce_proposal_activations(
    school_id,approval_id,request_id,actor_id,proposal_kind,receipt
  ) values(v_school,p_approval,p_request,p_actor,v_kind,v_receipt);

  update public.jd_approvals
  set execution_status='completed',execution_result_json=v_receipt,updated_at=clock_timestamp()
  where id=p_approval and school_id=v_school;
  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
  values(v_school,p_actor,v_approval.run_id,'workforce.proposal.activated',
    v_receipt||jsonb_build_object('request_id',p_request));
  return v_receipt;
end;
$function$;

revoke all on function public.jd_workforce_activate_approved_proposal(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.jd_workforce_activate_approved_proposal(uuid,uuid,uuid) to service_role;

create or replace function public.jd_decide_approval(
  p_approval_id uuid,p_actor_id uuid,p_decision text,p_note text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare
  v_school uuid;
  v_approval public.jd_approvals%rowtype;
  v_now timestamptz:=clock_timestamp();
begin
  if p_decision is null or p_decision not in ('approved','rejected') then
    raise exception 'Invalid approval decision' using errcode='22023';
  end if;
  select school_id into v_school from public.profiles
  where id=p_actor_id and role in ('owner','admin') for share;
  if v_school is null then raise exception 'Only workspace administrators can decide approvals' using errcode='42501'; end if;
  select * into v_approval from public.jd_approvals
  where id=p_approval_id and school_id=v_school for update;
  if not found then raise exception 'Approval request not found' using errcode='P0002'; end if;
  if v_approval.status<>'pending' then raise exception 'Approval request has already been decided' using errcode='40001'; end if;
  if v_approval.expires_at<=v_now then
    update public.jd_approvals set status='expired',updated_at=v_now
    where id=p_approval_id and school_id=v_school;
    insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
    values(v_school,p_actor_id,v_approval.run_id,'approval.expired',
      jsonb_build_object('approval_id',p_approval_id,'expired_by','decision_guard'));
    return jsonb_build_object('id',p_approval_id,'status','expired','execution_status',v_approval.execution_status);
  end if;
  update public.jd_approvals
  set status=p_decision,decided_by=p_actor_id,decision_note=left(coalesce(p_note,''),2000),
      decided_at=v_now,updated_at=v_now
  where id=p_approval_id and school_id=v_school returning * into v_approval;
  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
  values(v_school,p_actor_id,v_approval.run_id,'approval.'||p_decision,
    jsonb_build_object('approval_id',p_approval_id,'execution_status',v_approval.execution_status));
  return jsonb_build_object(
    'id',v_approval.id,'status',v_approval.status,'execution_status',v_approval.execution_status,
    'decided_by',v_approval.decided_by,'decided_at',v_approval.decided_at,
    'decision_note',v_approval.decision_note
  );
end;
$function$;
revoke all on function public.jd_decide_approval(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.jd_decide_approval(uuid,uuid,text,text) to service_role;

-- Only the approved activation RPC may call the lower-level identity creators.
revoke execute on function public.jd_workforce_create_employee(uuid,uuid,text,text,integer,text,text) from service_role;
revoke execute on function public.jd_workforce_create_team(uuid,uuid,text,text) from service_role;
 then (v_proposal->>'specialist_version')::integer else null end;
    if v_specialist_kind='builtin' then
      if v_specialist is null or not (v_specialist=any(v_allowed)) or v_specialist_version is not null then
        raise exception 'Choose an available built-in specialist before activation' using errcode='22023';
      end if;
      v_specialist_name:=replace(v_specialist,'_',' ');
    elsif v_specialist_kind='registry' then
      if v_specialist is null or v_specialist !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}
    v_employee_ids:=jsonb_build_array(jsonb_build_object(
      'employee_id',v_employee_id,'name',v_name,'specialist_ref',v_specialist
    ));
  else
    v_specialist:=v_proposal->>'specialist_ref';
    if v_specialist is null or not (v_specialist=any(v_allowed)) then
      raise exception 'A team coordinator must use a supported built-in specialist' using errcode='22023';
    end if;
    if jsonb_typeof(v_proposal->'members') is distinct from 'array' then
      raise exception 'A team must contain a member list' using errcode='22023';
    end if;
    if jsonb_array_length(v_proposal->'members') not between 1 and 20 then
      raise exception 'A team must contain between one and twenty described members' using errcode='22023';
    end if;
    v_team_name:=v_name;
    if exists(select 1 from public.jd_workforce_teams
      where school_id=v_school and lower(name)=lower(v_team_name) and retired_at is null) then
      raise exception 'An active team already uses this name; revise the proposal before activation' using errcode='40001';
    end if;
    v_created:=public.jd_workforce_create_team(p_actor,gen_random_uuid(),v_team_name,v_purpose);
    v_team_id:=(v_created->>'team_id')::uuid;
    if v_team_id is null then raise exception 'Team creation was not confirmed' using errcode='P0001'; end if;
    update public.jd_workforce_teams
    set department=v_department,coordinator_specialist_ref=v_specialist,
        responsibilities=coalesce(v_proposal->'responsibilities','[]'::jsonb),
        requested_access=coalesce(v_proposal->'requested_access','[]'::jsonb)
    where id=v_team_id and school_id=v_school;

    for v_member in select value from jsonb_array_elements(v_proposal->'members')
    loop
      v_member_index:=v_member_index+1;
      v_specialist:=v_member->>'specialist_ref';
      v_name:=btrim(coalesce(v_member->>'name',''));
      if jsonb_typeof(v_member) is distinct from 'object'
         or v_specialist is null or not (v_specialist=any(v_allowed))
         or length(v_name) not between 2 and 120
         or length(btrim(coalesce(v_member->>'role',''))) not between 2 and 120 then
        raise exception 'Every team member needs a supported specialist and complete role details' using errcode='22023';
      end if;
      if jsonb_typeof(v_member->'responsibilities') is distinct from 'array' then
        raise exception 'Team member responsibilities must be a list' using errcode='22023';
      end if;
      if v_member ? 'requested_access' and jsonb_typeof(v_member->'requested_access') is distinct from 'array' then
        raise exception 'Team member requested access must be a list' using errcode='22023';
      end if;
      if jsonb_array_length(v_member->'responsibilities')<1 then
        raise exception 'Every team member needs at least one responsibility' using errcode='22023';
      end if;
      v_created:=public.jd_workforce_create_employee(
        p_actor,gen_random_uuid(),'builtin',v_specialist,null,v_name,v_department
      );
      v_employee_id:=(v_created->>'employee_id')::uuid;
      if v_employee_id is null then raise exception 'A team employee identity was not confirmed' using errcode='P0001'; end if;
      update public.jd_workforce_employees
      set role_title=btrim(v_member->>'role'),purpose=v_purpose,
          responsibilities=coalesce(v_member->'responsibilities','[]'::jsonb),
          requested_access=coalesce(v_member->'requested_access','[]'::jsonb)
      where id=v_employee_id and school_id=v_school;
      perform public.jd_workforce_team_membership(
        p_actor,gen_random_uuid(),v_team_id,v_employee_id,'add',
        case when v_member_index=1 then 'lead' else 'member' end
      );
      v_employee_ids:=v_employee_ids||jsonb_build_array(jsonb_build_object(
        'employee_id',v_employee_id,'name',v_name,'role',v_member->>'role',
        'specialist_ref',v_specialist
      ));
    end loop;
  end if;

  v_receipt:=jsonb_build_object(
    'approval_id',p_approval,'kind',v_kind,'employee_ids',v_employee_ids,
    'team_id',v_team_id,'activated',true,'tools_granted',false,
    'connectors_authorised',false,'assignment_started',false,
    'billing_enabled',false,'billing_mode','shadow_only','replayed',false
  );
  insert into public.jd_workforce_proposal_activations(
    school_id,approval_id,request_id,actor_id,proposal_kind,receipt
  ) values(v_school,p_approval,p_request,p_actor,v_kind,v_receipt);

  update public.jd_approvals
  set execution_status='completed',execution_result_json=v_receipt,updated_at=clock_timestamp()
  where id=p_approval and school_id=v_school;
  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
  values(v_school,p_actor,v_approval.run_id,'workforce.proposal.activated',
    v_receipt||jsonb_build_object('request_id',p_request));
  return v_receipt;
end;
$function$;

revoke all on function public.jd_workforce_activate_approved_proposal(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.jd_workforce_activate_approved_proposal(uuid,uuid,uuid) to service_role;

create or replace function public.jd_decide_approval(
  p_approval_id uuid,p_actor_id uuid,p_decision text,p_note text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare
  v_school uuid;
  v_approval public.jd_approvals%rowtype;
  v_now timestamptz:=clock_timestamp();
begin
  if p_decision is null or p_decision not in ('approved','rejected') then
    raise exception 'Invalid approval decision' using errcode='22023';
  end if;
  select school_id into v_school from public.profiles
  where id=p_actor_id and role in ('owner','admin') for share;
  if v_school is null then raise exception 'Only workspace administrators can decide approvals' using errcode='42501'; end if;
  select * into v_approval from public.jd_approvals
  where id=p_approval_id and school_id=v_school for update;
  if not found then raise exception 'Approval request not found' using errcode='P0002'; end if;
  if v_approval.status<>'pending' then raise exception 'Approval request has already been decided' using errcode='40001'; end if;
  if v_approval.expires_at<=v_now then
    update public.jd_approvals set status='expired',updated_at=v_now
    where id=p_approval_id and school_id=v_school;
    insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
    values(v_school,p_actor_id,v_approval.run_id,'approval.expired',
      jsonb_build_object('approval_id',p_approval_id,'expired_by','decision_guard'));
    return jsonb_build_object('id',p_approval_id,'status','expired','execution_status',v_approval.execution_status);
  end if;
  update public.jd_approvals
  set status=p_decision,decided_by=p_actor_id,decision_note=left(coalesce(p_note,''),2000),
      decided_at=v_now,updated_at=v_now
  where id=p_approval_id and school_id=v_school returning * into v_approval;
  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
  values(v_school,p_actor_id,v_approval.run_id,'approval.'||p_decision,
    jsonb_build_object('approval_id',p_approval_id,'execution_status',v_approval.execution_status));
  return jsonb_build_object(
    'id',v_approval.id,'status',v_approval.status,'execution_status',v_approval.execution_status,
    'decided_by',v_approval.decided_by,'decided_at',v_approval.decided_at,
    'decision_note',v_approval.decision_note
  );
end;
$function$;
revoke all on function public.jd_decide_approval(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.jd_decide_approval(uuid,uuid,text,text) to service_role;

-- Only the approved activation RPC may call the lower-level identity creators.
revoke execute on function public.jd_workforce_create_employee(uuid,uuid,text,text,integer,text,text) from service_role;
revoke execute on function public.jd_workforce_create_team(uuid,uuid,text,text) from service_role;

         or v_specialist_version is null
         or not exists(select 1 from public.jd_agent_definitions a where a.id=v_specialist::uuid and a.school_id=v_school and a.state='published' and a.execution_authorized is true and a.current_version=v_specialist_version) then
        raise exception 'Registry specialist must be current, published and execution-authorized' using errcode='42501';
      end if;
      select v.content->>'name' into v_specialist_name from public.jd_agent_definition_versions v
      where v.agent_id=v_specialist::uuid and v.school_id=v_school and v.version=v_specialist_version;
    else
      raise exception 'Unknown specialist kind' using errcode='22023';
    end if;
    v_created:=public.jd_workforce_create_employee(
      p_actor,gen_random_uuid(),v_specialist_kind,v_specialist,v_specialist_version,v_name,v_department
    );
    v_employee_id:=(v_created->>'employee_id')::uuid;
    if v_employee_id is null then raise exception 'Employee identity creation was not confirmed' using errcode='P0001'; end if;
    update public.jd_workforce_employees
    set role_title=coalesce(v_specialist_name,replace(v_specialist,'_',' ')),purpose=v_purpose,
        responsibilities=coalesce(v_proposal->'responsibilities','[]'::jsonb),
        requested_access=coalesce(v_proposal->'requested_access','[]'::jsonb)
    where id=v_employee_id and school_id=v_school;
    v_employee_ids:=jsonb_build_array(jsonb_build_object(
      'employee_id',v_employee_id,'name',v_name,'specialist_ref',v_specialist
    ));
  else
    v_specialist:=v_proposal->>'specialist_ref';
    if v_specialist is null or not (v_specialist=any(v_allowed)) then
      raise exception 'A team coordinator must use a supported built-in specialist' using errcode='22023';
    end if;
    if jsonb_typeof(v_proposal->'members') is distinct from 'array' then
      raise exception 'A team must contain a member list' using errcode='22023';
    end if;
    if jsonb_array_length(v_proposal->'members') not between 1 and 20 then
      raise exception 'A team must contain between one and twenty described members' using errcode='22023';
    end if;
    v_team_name:=v_name;
    if exists(select 1 from public.jd_workforce_teams
      where school_id=v_school and lower(name)=lower(v_team_name) and retired_at is null) then
      raise exception 'An active team already uses this name; revise the proposal before activation' using errcode='40001';
    end if;
    v_created:=public.jd_workforce_create_team(p_actor,gen_random_uuid(),v_team_name,v_purpose);
    v_team_id:=(v_created->>'team_id')::uuid;
    if v_team_id is null then raise exception 'Team creation was not confirmed' using errcode='P0001'; end if;
    update public.jd_workforce_teams
    set department=v_department,coordinator_specialist_ref=v_specialist,
        responsibilities=coalesce(v_proposal->'responsibilities','[]'::jsonb),
        requested_access=coalesce(v_proposal->'requested_access','[]'::jsonb)
    where id=v_team_id and school_id=v_school;

    for v_member in select value from jsonb_array_elements(v_proposal->'members')
    loop
      v_member_index:=v_member_index+1;
      v_specialist:=v_member->>'specialist_ref';
      v_name:=btrim(coalesce(v_member->>'name',''));
      if jsonb_typeof(v_member) is distinct from 'object'
         or v_specialist is null or not (v_specialist=any(v_allowed))
         or length(v_name) not between 2 and 120
         or length(btrim(coalesce(v_member->>'role',''))) not between 2 and 120 then
        raise exception 'Every team member needs a supported specialist and complete role details' using errcode='22023';
      end if;
      if jsonb_typeof(v_member->'responsibilities') is distinct from 'array' then
        raise exception 'Team member responsibilities must be a list' using errcode='22023';
      end if;
      if v_member ? 'requested_access' and jsonb_typeof(v_member->'requested_access') is distinct from 'array' then
        raise exception 'Team member requested access must be a list' using errcode='22023';
      end if;
      if jsonb_array_length(v_member->'responsibilities')<1 then
        raise exception 'Every team member needs at least one responsibility' using errcode='22023';
      end if;
      v_created:=public.jd_workforce_create_employee(
        p_actor,gen_random_uuid(),'builtin',v_specialist,null,v_name,v_department
      );
      v_employee_id:=(v_created->>'employee_id')::uuid;
      if v_employee_id is null then raise exception 'A team employee identity was not confirmed' using errcode='P0001'; end if;
      update public.jd_workforce_employees
      set role_title=btrim(v_member->>'role'),purpose=v_purpose,
          responsibilities=coalesce(v_member->'responsibilities','[]'::jsonb),
          requested_access=coalesce(v_member->'requested_access','[]'::jsonb)
      where id=v_employee_id and school_id=v_school;
      perform public.jd_workforce_team_membership(
        p_actor,gen_random_uuid(),v_team_id,v_employee_id,'add',
        case when v_member_index=1 then 'lead' else 'member' end
      );
      v_employee_ids:=v_employee_ids||jsonb_build_array(jsonb_build_object(
        'employee_id',v_employee_id,'name',v_name,'role',v_member->>'role',
        'specialist_ref',v_specialist
      ));
    end loop;
  end if;

  v_receipt:=jsonb_build_object(
    'approval_id',p_approval,'kind',v_kind,'employee_ids',v_employee_ids,
    'team_id',v_team_id,'activated',true,'tools_granted',false,
    'connectors_authorised',false,'assignment_started',false,
    'billing_enabled',false,'billing_mode','shadow_only','replayed',false
  );
  insert into public.jd_workforce_proposal_activations(
    school_id,approval_id,request_id,actor_id,proposal_kind,receipt
  ) values(v_school,p_approval,p_request,p_actor,v_kind,v_receipt);

  update public.jd_approvals
  set execution_status='completed',execution_result_json=v_receipt,updated_at=clock_timestamp()
  where id=p_approval and school_id=v_school;
  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
  values(v_school,p_actor,v_approval.run_id,'workforce.proposal.activated',
    v_receipt||jsonb_build_object('request_id',p_request));
  return v_receipt;
end;
$function$;

revoke all on function public.jd_workforce_activate_approved_proposal(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.jd_workforce_activate_approved_proposal(uuid,uuid,uuid) to service_role;

create or replace function public.jd_decide_approval(
  p_approval_id uuid,p_actor_id uuid,p_decision text,p_note text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare
  v_school uuid;
  v_approval public.jd_approvals%rowtype;
  v_now timestamptz:=clock_timestamp();
begin
  if p_decision is null or p_decision not in ('approved','rejected') then
    raise exception 'Invalid approval decision' using errcode='22023';
  end if;
  select school_id into v_school from public.profiles
  where id=p_actor_id and role in ('owner','admin') for share;
  if v_school is null then raise exception 'Only workspace administrators can decide approvals' using errcode='42501'; end if;
  select * into v_approval from public.jd_approvals
  where id=p_approval_id and school_id=v_school for update;
  if not found then raise exception 'Approval request not found' using errcode='P0002'; end if;
  if v_approval.status<>'pending' then raise exception 'Approval request has already been decided' using errcode='40001'; end if;
  if v_approval.expires_at<=v_now then
    update public.jd_approvals set status='expired',updated_at=v_now
    where id=p_approval_id and school_id=v_school;
    insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
    values(v_school,p_actor_id,v_approval.run_id,'approval.expired',
      jsonb_build_object('approval_id',p_approval_id,'expired_by','decision_guard'));
    return jsonb_build_object('id',p_approval_id,'status','expired','execution_status',v_approval.execution_status);
  end if;
  update public.jd_approvals
  set status=p_decision,decided_by=p_actor_id,decision_note=left(coalesce(p_note,''),2000),
      decided_at=v_now,updated_at=v_now
  where id=p_approval_id and school_id=v_school returning * into v_approval;
  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
  values(v_school,p_actor_id,v_approval.run_id,'approval.'||p_decision,
    jsonb_build_object('approval_id',p_approval_id,'execution_status',v_approval.execution_status));
  return jsonb_build_object(
    'id',v_approval.id,'status',v_approval.status,'execution_status',v_approval.execution_status,
    'decided_by',v_approval.decided_by,'decided_at',v_approval.decided_at,
    'decision_note',v_approval.decision_note
  );
end;
$function$;
revoke all on function public.jd_decide_approval(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.jd_decide_approval(uuid,uuid,text,text) to service_role;

-- Only the approved activation RPC may call the lower-level identity creators.
revoke execute on function public.jd_workforce_create_employee(uuid,uuid,text,text,integer,text,text) from service_role;
revoke execute on function public.jd_workforce_create_team(uuid,uuid,text,text) from service_role;
