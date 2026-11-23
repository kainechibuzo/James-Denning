-- Workforce lifecycle expansion. Candidate only; never apply to production without review.
-- Adds explicit hiring/activation and team membership RPCs. It does not grant
-- execution authority, create a running assignment, or charge a customer.

create table public.jd_workforce_employee_budgets (
 school_id uuid not null references public.schools(id),
 employee_id uuid not null,
 budget_micros bigint not null check (budget_micros between 0 and 1000000000000),
 reserved_micros bigint not null default 0 check (reserved_micros >= 0),
 accrued_micros bigint not null default 0 check (accrued_micros >= 0),
 rate_micros_per_hour bigint not null default 1000000 check (rate_micros_per_hour between 0 and 1000000000),
 version integer not null default 1,
 updated_at timestamptz not null default clock_timestamp(),
 primary key(school_id,employee_id),
 foreign key(school_id,employee_id) references public.jd_workforce_employees(school_id,id),
 check(reserved_micros+accrued_micros<=budget_micros)
);
create table public.jd_workforce_employee_usage (
 id uuid primary key default gen_random_uuid(),
 school_id uuid not null references public.schools(id),
 employee_id uuid not null,
 assignment_id uuid not null references public.jd_workforce_assignments(id),
 source_event_id uuid,
 rate_micros_per_hour bigint not null check(rate_micros_per_hour between 0 and 1000000000),
 active_microseconds bigint not null check(active_microseconds>=0),
 amount_micros bigint not null check(amount_micros>=0),
 reconciliation_status text not null check(reconciliation_status in ('observed','reconciled','disputed')),
 evidence jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default clock_timestamp(),
 reconciled_at timestamptz,
 foreign key(school_id,employee_id) references public.jd_workforce_employees(school_id,id),
 unique(school_id,assignment_id,employee_id,source_event_id)
);
create index jd_workforce_employee_usage_recent on public.jd_workforce_employee_usage(school_id,employee_id,created_at desc);
alter table public.jd_workforce_employee_budgets enable row level security;
alter table public.jd_workforce_employee_usage enable row level security;
revoke all on public.jd_workforce_employee_budgets,public.jd_workforce_employee_usage from public,anon,authenticated,service_role;
grant select on public.jd_workforce_employee_budgets,public.jd_workforce_employee_usage to service_role;

create table public.jd_workforce_provision_requests (
 school_id uuid not null references public.schools(id), request_id uuid not null, actor_id uuid not null references auth.users(id),
 operation text not null check(operation in ('employee.create','team.create','team.member.add','team.member.remove','employee.budget.set')),
 request jsonb not null, receipt jsonb not null, created_at timestamptz not null default clock_timestamp(),
 primary key(school_id,request_id)
);
alter table public.jd_workforce_provision_requests enable row level security;
revoke all on public.jd_workforce_provision_requests from public,anon,authenticated,service_role;
grant select on public.jd_workforce_provision_requests to service_role;
create function public.jd_workforce_set_employee_budget(p_actor uuid,p_request uuid,p_employee uuid,p_expected_version integer,p_budget_micros bigint,p_rate_micros_per_hour bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid; b public.jd_workforce_employee_budgets%rowtype; prior public.jd_workforce_provision_requests%rowtype; req jsonb; receipt jsonb;
begin
 select school_id into tenant from public.profiles where id=p_actor and role in ('owner','admin');
 if tenant is null then raise exception 'Workspace administrator required' using errcode='42501'; end if;
 if p_request is null or p_employee is null or p_expected_version is null or p_expected_version<0 or p_budget_micros not between 0 and 1000000000000 or p_rate_micros_per_hour not between 0 and 1000000000 then raise exception 'Invalid employee budget' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(tenant::text||':'||p_request::text,241302));
 req:=jsonb_build_array(p_actor,p_employee,p_expected_version,p_budget_micros,p_rate_micros_per_hour);
 select * into prior from public.jd_workforce_provision_requests where school_id=tenant and request_id=p_request;
 if found then if prior.operation<>'employee.budget.set' or prior.request<>req then raise exception 'Request identifier reused' using errcode='40001'; end if; return prior.receipt; end if;
 select * into b from public.jd_workforce_employee_budgets where school_id=tenant and employee_id=p_employee for update;
 if not found or b.version<>p_expected_version then raise exception 'Employee budget version changed' using errcode='40001'; end if;
 if p_budget_micros<b.reserved_micros+b.accrued_micros then raise exception 'Budget is below current reserved or accrued usage' using errcode='22023'; end if;
 update public.jd_workforce_employee_budgets set budget_micros=p_budget_micros,rate_micros_per_hour=p_rate_micros_per_hour,version=version+1,updated_at=clock_timestamp()
 where school_id=tenant and employee_id=p_employee returning * into b;
 receipt:=jsonb_build_object('employee_id',p_employee,'budget_micros',b.budget_micros,'reserved_micros',b.reserved_micros,'accrued_micros',b.accrued_micros,'rate_micros_per_hour',b.rate_micros_per_hour,'version',b.version,'charged',false,'mode','shadow');
 insert into public.jd_workforce_provision_requests values(tenant,p_request,p_actor,'employee.budget.set',req,receipt,clock_timestamp());
 insert into public.jd_audit_events(school_id,actor_id,event_type,event_json) values(tenant,p_actor,'workforce.employee.budget_set',receipt||jsonb_build_object('request_id',p_request));
 return receipt;
end; $$;

create function public.jd_workforce_create_employee(
 p_actor uuid,p_request uuid,p_kind text,p_ref text,p_version integer,p_name text,p_department text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid; existing public.jd_workforce_employees%rowtype; new_id uuid; req jsonb; prior public.jd_workforce_provision_requests%rowtype; receipt jsonb; specialist constant text[]:=array['business_advisor','research_analyst','finance_analyst','operations_planner','product_designer','software_engineer','security_reviewer','quality_assurance'];
begin
 select school_id into tenant from public.profiles where id=p_actor and role in ('owner','admin');
 if tenant is null then raise exception 'Workspace administrator required' using errcode='42501'; end if;
 if p_request is null or p_kind not in ('builtin','registry') or p_ref is null or length(trim(p_ref)) not between 1 and 120 or length(trim(p_name)) not between 2 and 120 or length(coalesce(trim(p_department),''))>120 then raise exception 'Invalid employee definition' using errcode='22023'; end if;
 if p_kind='builtin' then
  if not (p_ref=any(specialist)) or p_version is not null then raise exception 'Unknown built-in specialist' using errcode='22023'; end if;
 else
  if p_ref !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' or p_version is null or not exists(select 1 from public.jd_agent_definitions a where a.id=p_ref::uuid and a.school_id=tenant and a.state='published' and a.execution_authorized=true and a.current_version=p_version) then
   raise exception 'Registry agent must be current, published and execution-authorized' using errcode='42501';
  end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(tenant::text,241300));
 req:=jsonb_build_array(p_actor,p_kind,p_ref,p_version,p_name,p_department);
 perform pg_advisory_xact_lock(hashtextextended(tenant::text||':'||p_request::text,241303));
 select * into prior from public.jd_workforce_provision_requests where school_id=tenant and request_id=p_request;
 if found then if prior.operation<>'employee.create' or prior.request<>req then raise exception 'Request identifier reused' using errcode='40001'; end if; return prior.receipt; end if;
 -- Employee creation is naturally unique by specialist version; return the existing identity on retry.
 select * into existing from public.jd_workforce_employees where school_id=tenant and agent_kind=p_kind and agent_ref=p_ref and agent_version is not distinct from p_version and lifecycle_state<>'retired' for update;
 if found then receipt:=jsonb_build_object('employee',to_jsonb(existing),'existing',true,'execution_started',false); insert into public.jd_workforce_provision_requests values(tenant,p_request,p_actor,'employee.create',req,receipt,clock_timestamp()); return receipt; end if;
 insert into public.jd_workforce_employees(school_id,agent_kind,agent_ref,agent_version,display_name,department,created_by)
 values(tenant,p_kind,p_ref,p_version,trim(p_name),nullif(trim(p_department),''),p_actor) returning id into new_id;
 insert into public.jd_workforce_employee_budgets(school_id,employee_id,budget_micros) values(tenant,new_id,0);
 receipt:=jsonb_build_object('employee_id',new_id,'lifecycle_state','active','execution_started',false,'billing_mode','shadow_only');
 insert into public.jd_workforce_provision_requests values(tenant,p_request,p_actor,'employee.create',req,receipt,clock_timestamp());
 insert into public.jd_audit_events(school_id,actor_id,event_type,event_json) values(tenant,p_actor,'workforce.employee.created',receipt||jsonb_build_object('request_id',p_request));
 return receipt;
end; $$;

create function public.jd_workforce_create_team(p_actor uuid,p_request uuid,p_name text,p_purpose text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid; tid uuid; req jsonb; prior public.jd_workforce_provision_requests%rowtype; receipt jsonb;
begin
 select school_id into tenant from public.profiles where id=p_actor and role in ('owner','admin');
 if tenant is null then raise exception 'Workspace administrator required' using errcode='42501'; end if;
 if p_request is null or length(trim(coalesce(p_name,''))) not between 2 and 120 or length(trim(coalesce(p_purpose,''))) not between 10 and 1000 then raise exception 'Invalid team definition' using errcode='22023'; end if;
 req:=jsonb_build_array(p_actor,p_name,p_purpose);
 perform pg_advisory_xact_lock(hashtextextended(tenant::text||':'||p_request::text,241304));
 select * into prior from public.jd_workforce_provision_requests where school_id=tenant and request_id=p_request;
 if found then if prior.operation<>'team.create' or prior.request<>req then raise exception 'Request identifier reused' using errcode='40001'; end if; return prior.receipt; end if;
 perform pg_advisory_xact_lock(hashtextextended(tenant::text||':'||lower(trim(p_name)),241301));
 select id into tid from public.jd_workforce_teams where school_id=tenant and lower(name)=lower(trim(p_name)) and retired_at is null;
 if tid is not null then receipt:=jsonb_build_object('team_id',tid,'existing',true); insert into public.jd_workforce_provision_requests values(tenant,p_request,p_actor,'team.create',req,receipt,clock_timestamp()); return receipt; end if;
 insert into public.jd_workforce_teams(school_id,name,purpose,created_by) values(tenant,trim(p_name),trim(p_purpose),p_actor) returning id into tid;
 receipt:=jsonb_build_object('team_id',tid,'lifecycle_state','active','existing',false);
 insert into public.jd_workforce_provision_requests values(tenant,p_request,p_actor,'team.create',req,receipt,clock_timestamp());
 insert into public.jd_audit_events(school_id,actor_id,event_type,event_json) values(tenant,p_actor,'workforce.team.created',receipt||jsonb_build_object('request_id',p_request));
 return receipt;
end; $$;

create function public.jd_workforce_team_membership(p_actor uuid,p_request uuid,p_team uuid,p_employee uuid,p_action text,p_member_role text default 'member')
returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid; team_state text; employee_state text; old public.jd_workforce_team_members%rowtype; req jsonb; prior public.jd_workforce_provision_requests%rowtype; receipt jsonb;
begin
 select school_id into tenant from public.profiles where id=p_actor and role in ('owner','admin');
 if tenant is null then raise exception 'Workspace administrator required' using errcode='42501'; end if;
 if p_request is null or p_action not in ('add','remove') or p_member_role not in ('lead','member') then raise exception 'Invalid membership request' using errcode='22023'; end if;
 req:=jsonb_build_array(p_actor,p_team,p_employee,p_action,p_member_role);
 perform pg_advisory_xact_lock(hashtextextended(tenant::text||':'||p_request::text,241305));
 select * into prior from public.jd_workforce_provision_requests where school_id=tenant and request_id=p_request;
 if found then if prior.operation<>('team.member.'||p_action) or prior.request<>req then raise exception 'Request identifier reused' using errcode='40001'; end if; return prior.receipt; end if;
 select lifecycle_state into team_state from public.jd_workforce_teams where id=p_team and school_id=tenant for update;
 select lifecycle_state into employee_state from public.jd_workforce_employees where id=p_employee and school_id=tenant for share;
 if team_state is null or employee_state is null then raise exception 'Team or employee unavailable' using errcode='P0002'; end if;
 if p_action='add' then
  if team_state<>'active' or employee_state<>'active' then raise exception 'Only active employees can join active teams' using errcode='40001'; end if;
  insert into public.jd_workforce_team_members(school_id,team_id,employee_id,member_role,left_at)
  values(tenant,p_team,p_employee,p_member_role,null)
  on conflict(team_id,employee_id) do update set member_role=excluded.member_role,joined_at=clock_timestamp(),left_at=null;
 else
  update public.jd_workforce_team_members set left_at=clock_timestamp() where school_id=tenant and team_id=p_team and employee_id=p_employee and left_at is null;
  if not found then raise exception 'Active membership not found' using errcode='P0002'; end if;
 end if;
 receipt:=jsonb_build_object('team_id',p_team,'employee_id',p_employee,'action',p_action,'confirmed',true);
 insert into public.jd_workforce_provision_requests values(tenant,p_request,p_actor,'team.member.'||p_action,req,receipt,clock_timestamp());
 insert into public.jd_audit_events(school_id,actor_id,event_type,event_json) values(tenant,p_actor,'workforce.team.'||p_action,receipt||jsonb_build_object('request_id',p_request));
 return receipt;
end; $$;

revoke all on function public.jd_workforce_set_employee_budget(uuid,uuid,uuid,integer,bigint,bigint) from public,anon,authenticated;\ngrant execute on function public.jd_workforce_set_employee_budget(uuid,uuid,uuid,integer,bigint,bigint) to service_role;\nrevoke all on function public.jd_workforce_create_employee(uuid,uuid,text,text,integer,text,text) from public,anon,authenticated;
revoke all on function public.jd_workforce_create_team(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.jd_workforce_team_membership(uuid,uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.jd_workforce_create_employee(uuid,uuid,text,text,integer,text,text) to service_role;
grant execute on function public.jd_workforce_create_team(uuid,uuid,text,text) to service_role;
grant execute on function public.jd_workforce_team_membership(uuid,uuid,uuid,uuid,text,text) to service_role;
