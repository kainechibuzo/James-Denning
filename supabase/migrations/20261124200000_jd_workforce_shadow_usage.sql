-- Record observed employee-attributed execution time in shadow accounting only.
create or replace function public.jd_workforce_record_employee_usage(
  p_actor uuid,p_assignment uuid,p_source_event uuid,p_active_microseconds bigint,p_evidence jsonb
) returns jsonb
language plpgsql security definer set search_path='' as $function$
declare
  v_school uuid;
  v_assignment public.jd_workforce_assignments%rowtype;
  v_budget public.jd_workforce_employee_budgets%rowtype;
  v_usage public.jd_workforce_employee_usage%rowtype;
  v_amount bigint;
  v_overrun boolean;
  v_status text;
  v_evidence jsonb;
  v_receipt jsonb;
begin
  select school_id into v_school from public.profiles
  where id=p_actor and role in ('owner','admin') for share;
  if v_school is null then raise exception 'Workspace administrator required' using errcode='42501'; end if;
  if p_assignment is null or p_source_event is null or p_source_event<>p_assignment or p_active_microseconds is null
     or p_active_microseconds not between 0 and 3600000000
     or jsonb_typeof(coalesce(p_evidence,'{}'::jsonb)) is distinct from 'object'
     or pg_column_size(coalesce(p_evidence,'{}'::jsonb))>16384 then
    raise exception 'Invalid employee usage evidence' using errcode='22023';
  end if;
  select * into v_assignment from public.jd_workforce_assignments
  where id=p_assignment and school_id=v_school and employee_id is not null for share;
  if not found then raise exception 'Employee-attributed assignment not found' using errcode='P0002'; end if;
  select * into v_budget from public.jd_workforce_employee_budgets
  where school_id=v_school and employee_id=v_assignment.employee_id for update;
  if not found then raise exception 'Employee shadow budget is missing' using errcode='P0002'; end if;

  select * into v_usage from public.jd_workforce_employee_usage
  where school_id=v_school and assignment_id=p_assignment
    and employee_id=v_assignment.employee_id and source_event_id=p_source_event;
  if found then
    return jsonb_build_object(
      'usage_id',v_usage.id,'employee_id',v_usage.employee_id,'assignment_id',v_usage.assignment_id,
      'rate_micros_per_hour',v_usage.rate_micros_per_hour,
      'active_microseconds',v_usage.active_microseconds,'amount_micros',v_usage.amount_micros,
      'reconciliation_status',v_usage.reconciliation_status,'charged',false,'replayed',true
    );
  end if;

  v_amount:=floor((v_budget.rate_micros_per_hour::numeric*p_active_microseconds::numeric)/3600000000)::bigint;
  v_overrun:=v_budget.budget_micros>0
    and (v_budget.accrued_micros+v_budget.reserved_micros+v_amount)>v_budget.budget_micros;
  v_status:=case when v_overrun then 'disputed' else 'observed' end;
  v_evidence:=coalesce(p_evidence,'{}'::jsonb)||jsonb_build_object(
    'run_id',v_assignment.run_id,'employee_id',v_assignment.employee_id,
    'team_id',v_assignment.team_id,'assignment_status',v_assignment.status,
    'billing_mode','shadow_only','charged',false
  );
  insert into public.jd_workforce_employee_usage(
    school_id,employee_id,assignment_id,source_event_id,rate_micros_per_hour,
    active_microseconds,amount_micros,reconciliation_status,evidence
  ) values(
    v_school,v_assignment.employee_id,p_assignment,p_source_event,v_budget.rate_micros_per_hour,
    p_active_microseconds,v_amount,v_status,v_evidence
  ) on conflict(school_id,assignment_id,employee_id,source_event_id) do nothing
  returning * into v_usage;
  if not found then
    select * into v_usage from public.jd_workforce_employee_usage
    where school_id=v_school and assignment_id=p_assignment
      and employee_id=v_assignment.employee_id and source_event_id=p_source_event;
    return jsonb_build_object(
      'usage_id',v_usage.id,'employee_id',v_usage.employee_id,'assignment_id',v_usage.assignment_id,
      'rate_micros_per_hour',v_usage.rate_micros_per_hour,
      'active_microseconds',v_usage.active_microseconds,'amount_micros',v_usage.amount_micros,
      'reconciliation_status',v_usage.reconciliation_status,'charged',false,'replayed',true
    );
  end if;

  update public.jd_workforce_employee_budgets
  set accrued_micros=accrued_micros+v_amount,version=version+1,updated_at=clock_timestamp()
  where school_id=v_school and employee_id=v_assignment.employee_id;

  v_receipt:=jsonb_build_object(
    'usage_id',v_usage.id,'employee_id',v_usage.employee_id,'assignment_id',v_usage.assignment_id,
    'rate_micros_per_hour',v_usage.rate_micros_per_hour,
    'active_microseconds',v_usage.active_microseconds,'amount_micros',v_usage.amount_micros,
    'reconciliation_status',v_usage.reconciliation_status,'budget_overrun',v_overrun,
    'charged',false,'billing_mode','shadow_only','replayed',false
  );
  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
  values(v_school,p_actor,v_assignment.run_id,'workforce.employee.usage_observed',v_receipt);
  return v_receipt;
end;
$function$;
revoke all on function public.jd_workforce_record_employee_usage(uuid,uuid,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.jd_workforce_record_employee_usage(uuid,uuid,uuid,bigint,jsonb) to service_role;
