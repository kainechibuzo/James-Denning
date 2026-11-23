-- Team-level shadow budget controls. This is an aggregate ceiling over employee-attributed
-- usage for assignments attached to a team; it never authorises execution or charges.
create table public.jd_workforce_team_budgets (
 school_id uuid not null references public.schools(id),
 team_id uuid not null,
 budget_micros bigint not null check (budget_micros between 0 and 1000000000000),
 accrued_micros bigint not null default 0 check (accrued_micros >= 0),
 version integer not null default 1,
 updated_at timestamptz not null default clock_timestamp(),
 primary key (school_id,team_id),
 foreign key (school_id,team_id) references public.jd_workforce_teams(school_id,id),
 check (budget_micros=0 or accrued_micros<=budget_micros)
);
create table public.jd_workforce_team_budget_requests (
 school_id uuid not null references public.schools(id),
 request_id uuid not null,
 actor_id uuid not null references auth.users(id),
 request jsonb not null,
 receipt jsonb not null,
 created_at timestamptz not null default clock_timestamp(),
 primary key (school_id,request_id)
);
alter table public.jd_workforce_team_budgets enable row level security;
alter table public.jd_workforce_team_budget_requests enable row level security;
revoke all on public.jd_workforce_team_budgets,public.jd_workforce_team_budget_requests from public,anon,authenticated,service_role;
grant select on public.jd_workforce_team_budgets to service_role;

create function public.jd_workforce_set_team_budget(
 p_actor uuid,p_request uuid,p_team uuid,p_expected_version integer,p_budget_micros bigint
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare
 v_school uuid;
 v_budget public.jd_workforce_team_budgets%rowtype;
 v_prior public.jd_workforce_team_budget_requests%rowtype;
 v_request jsonb;
 v_receipt jsonb;
begin
 select school_id into v_school from public.profiles
 where id=p_actor and role in ('owner','admin') for share;
 if v_school is null then raise exception 'Workspace administrator required' using errcode='42501'; end if;
 if p_request is null or p_team is null or p_expected_version is null or p_expected_version<0
   or p_budget_micros is null or p_budget_micros not between 0 and 1000000000000 then
   raise exception 'Invalid team budget request' using errcode='22023';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(v_school::text||':'||p_request::text,241306));
 v_request:=jsonb_build_array(p_actor,p_team,p_expected_version,p_budget_micros);
 select * into v_prior from public.jd_workforce_team_budget_requests
 where school_id=v_school and request_id=p_request;
 if found then
   if v_prior.request<>v_request then raise exception 'Request identifier reused' using errcode='40001'; end if;
   return v_prior.receipt||jsonb_build_object('replayed',true);
 end if;
 perform 1 from public.jd_workforce_teams where school_id=v_school and id=p_team for update;
 if not found then raise exception 'Team not found' using errcode='P0002'; end if;
 select * into v_budget from public.jd_workforce_team_budgets
 where school_id=v_school and team_id=p_team for update;
 if not found then
   if p_expected_version<>0 then raise exception 'Team budget version changed' using errcode='40001'; end if;
   insert into public.jd_workforce_team_budgets(school_id,team_id,budget_micros)
   values(v_school,p_team,p_budget_micros) returning * into v_budget;
 else
   if v_budget.version<>p_expected_version then raise exception 'Team budget version changed' using errcode='40001'; end if;
   if p_budget_micros>0 and p_budget_micros<v_budget.accrued_micros then
     raise exception 'Team budget is below accrued shadow usage' using errcode='22023';
   end if;
   update public.jd_workforce_team_budgets set budget_micros=p_budget_micros,
    version=version+1,updated_at=clock_timestamp()
   where school_id=v_school and team_id=p_team returning * into v_budget;
 end if;
 v_receipt:=jsonb_build_object(
  'team_id',p_team,'budget_micros',v_budget.budget_micros,
  'accrued_micros',v_budget.accrued_micros,'version',v_budget.version,
  'mode','shadow','charged',false
 );
 insert into public.jd_workforce_team_budget_requests(school_id,request_id,actor_id,request,receipt)
 values(v_school,p_request,p_actor,v_request,v_receipt);
 insert into public.jd_audit_events(school_id,actor_id,event_type,event_json)
 values(v_school,p_actor,'workforce.team.budget_set',v_receipt||jsonb_build_object('request_id',p_request));
 return v_receipt;
end;
$function$;
revoke all on function public.jd_workforce_set_team_budget(uuid,uuid,uuid,integer,bigint) from public,anon,authenticated;
grant execute on function public.jd_workforce_set_team_budget(uuid,uuid,uuid,integer,bigint) to service_role;

create function public.jd_workforce_apply_team_usage_budget()
returns trigger language plpgsql security definer set search_path='' as $function$
declare
 v_team uuid;
 v_budget public.jd_workforce_team_budgets%rowtype;
 v_next bigint;
begin
 select team_id into v_team from public.jd_workforce_assignments
 where id=new.assignment_id and school_id=new.school_id;
 if v_team is null then return new; end if;
 select * into v_budget from public.jd_workforce_team_budgets
 where school_id=new.school_id and team_id=v_team for update;
 if not found then return new; end if;
 v_next:=v_budget.accrued_micros+new.amount_micros;
 update public.jd_workforce_team_budgets set accrued_micros=v_next,
  updated_at=clock_timestamp()
 where school_id=new.school_id and team_id=v_team;
 if v_budget.budget_micros>0 and v_next>v_budget.budget_micros then
   update public.jd_workforce_employee_usage set reconciliation_status='disputed'
   where id=new.id and school_id=new.school_id;
 end if;
 return new;
end;
$function$;
create trigger jd_workforce_team_usage_budget_after_insert
after insert on public.jd_workforce_employee_usage
for each row execute function public.jd_workforce_apply_team_usage_budget();
