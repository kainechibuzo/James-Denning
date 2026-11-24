-- Durable specialist assignment lifecycle, lease fencing and team routing.
-- This is additive to the immutable assignment history. It is not a production release.
create table public.jd_workforce_assignment_lifecycle (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  run_id uuid not null references public.jd_automation_runs(id),
  employee_id uuid,
  team_id uuid,
  agent_kind text not null check (agent_kind in ('builtin','registry')),
  agent_ref text not null,
  task_hash text not null,
  status text not null default 'queued' check (status in ('queued','claimed','running','report_returned','failed','cancellation_requested','cancelled')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 5),
  worker_id text,
  lease_token uuid,
  lease_expires_at timestamptz,
  worker_acknowledged_at timestamptz,
  cancel_requested_at timestamptz,
  cancel_acknowledged_at timestamptz,
  cancel_acknowledged_by text,
  outcome jsonb not null default '{}'::jsonb,
  outcome_certainty text not null default 'not_started' check (outcome_certainty in ('not_started','known','unknown')),
  last_heartbeat_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (school_id,run_id,task_hash)
);
alter table public.jd_workforce_assignment_lifecycle enable row level security;
revoke all on public.jd_workforce_assignment_lifecycle from public,anon,authenticated;
grant select,insert,update on public.jd_workforce_assignment_lifecycle to service_role;
create index jd_workforce_lifecycle_queue on public.jd_workforce_assignment_lifecycle(school_id,status,created_at);
create index jd_workforce_lifecycle_employee_active on public.jd_workforce_assignment_lifecycle(school_id,employee_id,status);

create function public.jd_workforce_assignment_enqueue(
 p_actor uuid,p_run uuid,p_employee uuid,p_team uuid,p_agent_kind text,p_agent_ref text,p_task_hash text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_school uuid; v_row public.jd_workforce_assignment_lifecycle%rowtype;
begin
 select school_id into v_school from public.profiles where id=p_actor and role in ('owner','admin');
 if v_school is null then raise exception 'Workspace administrator required' using errcode='42501'; end if;
 if p_run is null or p_task_hash is null or length(p_task_hash)>80 or p_agent_kind not in ('builtin','registry') or p_agent_ref is null then
  raise exception 'Invalid assignment identity' using errcode='22023';
 end if;
 if not exists(select 1 from public.jd_automation_runs where id=p_run and school_id=v_school) then
  raise exception 'Run not found in workspace' using errcode='P0002';
 end if;
 if p_employee is not null and not exists(select 1 from public.jd_workforce_employees where id=p_employee and school_id=v_school and lifecycle_state='active') then
  raise exception 'Employee is not active in this workspace' using errcode='42501';
 end if;
 if p_team is not null and not exists(select 1 from public.jd_workforce_teams where id=p_team and school_id=v_school and lifecycle_state='active') then
  raise exception 'Team is not active in this workspace' using errcode='42501';
 end if;
 if p_team is not null and p_employee is not null and not exists(
  select 1 from public.jd_workforce_team_members where school_id=v_school and team_id=p_team and employee_id=p_employee and left_at is null
 ) then raise exception 'Employee is not an active member of this team' using errcode='42501'; end if;
 insert into public.jd_workforce_assignment_lifecycle(school_id,run_id,employee_id,team_id,agent_kind,agent_ref,task_hash)
 values(v_school,p_run,p_employee,p_team,p_agent_kind,p_agent_ref,p_task_hash)
 on conflict(school_id,run_id,task_hash) do nothing;
 select * into v_row from public.jd_workforce_assignment_lifecycle where school_id=v_school and run_id=p_run and task_hash=p_task_hash for update;
 if v_row.employee_id is distinct from p_employee or v_row.team_id is distinct from p_team or v_row.agent_kind<>p_agent_kind or v_row.agent_ref<>p_agent_ref then
  raise exception 'Assignment idempotency key reused with different payload' using errcode='40001';
 end if;
 return jsonb_build_object('assignment_id',v_row.id,'status',v_row.status,'replayed',v_row.created_at<>v_row.updated_at);
end; $$;
revoke all on function public.jd_workforce_assignment_enqueue(uuid,uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.jd_workforce_assignment_enqueue(uuid,uuid,uuid,uuid,text,text,text) to service_role;

create function public.jd_workforce_assignment_claim(p_assignment uuid,p_worker text,p_lease_seconds integer default 300)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.jd_workforce_assignment_lifecycle%rowtype; v_token uuid;
begin
 if p_worker is null or length(p_worker)<3 or length(p_worker)>120 then raise exception 'Invalid worker identity' using errcode='22023'; end if;
 select * into v from public.jd_workforce_assignment_lifecycle where id=p_assignment for update;
 if not found then raise exception 'Assignment not found' using errcode='P0002'; end if;
 if v.status not in ('queued','claimed','running') or (v.status in ('claimed','running') and v.lease_expires_at>clock_timestamp()) then
  return jsonb_build_object('claimed',false,'status',v.status);
 end if;
 if v.status='running' and v.lease_expires_at<=clock_timestamp() then
  -- A running model/tool sequence may have partially executed. Never replay it blindly.
  update public.jd_workforce_assignment_lifecycle set status='failed',worker_id=null,lease_token=null,lease_expires_at=null,
   outcome=jsonb_build_object('error_code','worker_lease_expired','outcome','unknown','automatic_retry',false),
   outcome_certainty='unknown',updated_at=clock_timestamp()
  where id=p_assignment;
  return jsonb_build_object('claimed',false,'status','failed','outcome_certainty','unknown');
 end if;
 if v.attempt_count>=5 then
  update public.jd_workforce_assignment_lifecycle set status='failed',outcome=jsonb_build_object('error_code','attempt_limit_reached'),updated_at=clock_timestamp() where id=p_assignment;
  return jsonb_build_object('claimed',false,'status','failed');
 end if;
 v_token:=gen_random_uuid();
 update public.jd_workforce_assignment_lifecycle set status='claimed',attempt_count=attempt_count+1,
  worker_id=p_worker,lease_token=v_token,lease_expires_at=clock_timestamp()+make_interval(secs=>least(greatest(coalesce(p_lease_seconds,300),30),900)),
  last_heartbeat_at=clock_timestamp(),updated_at=clock_timestamp()
 where id=p_assignment;
 return jsonb_build_object('claimed',true,'assignment_id',p_assignment,'worker_id',p_worker,'lease_token',v_token,'attempt_count',v.attempt_count+1,'status','claimed');
end; $$;
revoke all on function public.jd_workforce_assignment_claim(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.jd_workforce_assignment_claim(uuid,text,integer) to service_role;

create function public.jd_workforce_assignment_ack_started(p_assignment uuid,p_worker text,p_token uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 update public.jd_workforce_assignment_lifecycle set status='running',worker_acknowledged_at=clock_timestamp(),outcome_certainty='known',updated_at=clock_timestamp()
 where id=p_assignment and status='claimed' and worker_id=p_worker and lease_token=p_token and lease_expires_at>clock_timestamp();
 return found;
end; $$;
revoke all on function public.jd_workforce_assignment_ack_started(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.jd_workforce_assignment_ack_started(uuid,text,uuid) to service_role;

create function public.jd_workforce_assignment_heartbeat(p_assignment uuid,p_worker text,p_token uuid,p_lease_seconds integer default 300)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 update public.jd_workforce_assignment_lifecycle set last_heartbeat_at=clock_timestamp(),
  lease_expires_at=clock_timestamp()+make_interval(secs=>least(greatest(coalesce(p_lease_seconds,300),30),900)),updated_at=clock_timestamp()
 where id=p_assignment and status='running' and worker_id=p_worker and lease_token=p_token and lease_expires_at>clock_timestamp();
 return found;
end; $$;
revoke all on function public.jd_workforce_assignment_heartbeat(uuid,text,uuid,integer) from public,anon,authenticated;
grant execute on function public.jd_workforce_assignment_heartbeat(uuid,text,uuid,integer) to service_role;

create function public.jd_workforce_assignment_may_continue(p_assignment uuid,p_worker text,p_token uuid)
returns boolean language sql security definer set search_path='' as $$
 select exists(select 1 from public.jd_workforce_assignment_lifecycle where id=p_assignment and status='running'
 and worker_id=p_worker and lease_token=p_token and lease_expires_at>clock_timestamp());
$$;
revoke all on function public.jd_workforce_assignment_may_continue(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.jd_workforce_assignment_may_continue(uuid,text,uuid) to service_role;

create function public.jd_workforce_assignment_request_cancel(p_actor uuid,p_assignment uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_school uuid;v public.jd_workforce_assignment_lifecycle%rowtype;
begin
 select school_id into v_school from public.profiles where id=p_actor and role in ('owner','admin');
 if v_school is null then raise exception 'Workspace administrator required' using errcode='42501'; end if;
 select * into v from public.jd_workforce_assignment_lifecycle where id=p_assignment and school_id=v_school for update;
 if not found then raise exception 'Assignment not found' using errcode='P0002'; end if;
 if v.status='queued' then
  update public.jd_workforce_assignment_lifecycle set status='cancelled',outcome=jsonb_build_object('cancelled_before_claim',true),outcome_certainty='known',cancel_requested_at=clock_timestamp(),cancel_acknowledged_at=clock_timestamp(),cancel_acknowledged_by='not_claimed',updated_at=clock_timestamp() where id=p_assignment;
 elsif v.status in ('claimed','running') then
  update public.jd_workforce_assignment_lifecycle set status='cancellation_requested',cancel_requested_at=coalesce(cancel_requested_at,clock_timestamp()),updated_at=clock_timestamp() where id=p_assignment;
 elsif v.status in ('cancellation_requested','cancelled') then null;
 else raise exception 'Terminal assignment cannot be cancelled' using errcode='40001';
 end if;
 select * into v from public.jd_workforce_assignment_lifecycle where id=p_assignment;
 return jsonb_build_object('assignment_id',v.id,'status',v.status,'worker_acknowledged',v.cancel_acknowledged_at is not null,'outcome_certainty',v.outcome_certainty);
end; $$;
revoke all on function public.jd_workforce_assignment_request_cancel(uuid,uuid) from public,anon,authenticated;
grant execute on function public.jd_workforce_assignment_request_cancel(uuid,uuid) to service_role;

create function public.jd_workforce_assignment_ack_cancel(p_assignment uuid,p_worker text,p_token uuid,p_outcome_unknown boolean default false)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 update public.jd_workforce_assignment_lifecycle set status='cancelled',cancel_acknowledged_at=clock_timestamp(),cancel_acknowledged_by=p_worker,
  lease_token=null,lease_expires_at=null,worker_id=null,outcome_certainty=case when p_outcome_unknown then 'unknown' else 'known' end,
  outcome=outcome||jsonb_build_object('cancel_acknowledged',true,'outcome_unknown',p_outcome_unknown),updated_at=clock_timestamp()
 where id=p_assignment and status='cancellation_requested' and worker_id=p_worker and lease_token=p_token;
 return found;
end; $$;
revoke all on function public.jd_workforce_assignment_ack_cancel(uuid,text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.jd_workforce_assignment_ack_cancel(uuid,text,uuid,boolean) to service_role;

create function public.jd_workforce_assignment_finish(p_assignment uuid,p_worker text,p_token uuid,p_terminal text,p_outcome jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_terminal not in ('report_returned','failed') then raise exception 'Invalid terminal state' using errcode='22023'; end if;
 update public.jd_workforce_assignment_lifecycle set status=p_terminal,outcome=coalesce(p_outcome,'{}'::jsonb),outcome_certainty='known',
  lease_token=null,lease_expires_at=null,worker_id=null,updated_at=clock_timestamp()
 where id=p_assignment and status='running' and worker_id=p_worker and lease_token=p_token and lease_expires_at>clock_timestamp();
 return found;
end; $$;
revoke all on function public.jd_workforce_assignment_finish(uuid,text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.jd_workforce_assignment_finish(uuid,text,uuid,text,jsonb) to service_role;

create function public.jd_workforce_assignment_recover(p_limit integer default 100)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_requeued integer:=0;v_failed integer:=0;v_cancel_pending integer:=0;
begin
 -- Claimed-but-not-started work can safely return to the queue. Running work is
 -- marked unknown rather than replayed: a model/tool may have partially run.
 with stale as (
  select id,status from public.jd_workforce_assignment_lifecycle
  where status in ('claimed','running') and lease_expires_at<=clock_timestamp()
  order by lease_expires_at for update skip locked limit least(greatest(coalesce(p_limit,100),1),500)
 ), changed as (
  update public.jd_workforce_assignment_lifecycle a set
   status=case when stale.status='claimed' and a.attempt_count<5 then 'queued' else 'failed' end,
   worker_id=null,lease_token=null,lease_expires_at=null,
   outcome=case when stale.status='claimed' and a.attempt_count<5 then a.outcome
     else jsonb_build_object('error_code','worker_lease_expired','outcome','unknown','automatic_retry',false) end,
   outcome_certainty=case when stale.status='claimed' and a.attempt_count<5 then 'not_started' else 'unknown' end,
   updated_at=clock_timestamp()
  from stale where a.id=stale.id returning a.status
 ) select count(*) filter(where status='queued'),count(*) filter(where status='failed') into v_requeued,v_failed from changed;
 select count(*) into v_cancel_pending from public.jd_workforce_assignment_lifecycle
 where status='cancellation_requested' and lease_expires_at<=clock_timestamp();
 -- A stale cancellation request remains cancellation_requested. Lease fencing
 -- prevents the old worker continuing, but no false worker acknowledgement is written.
 update public.jd_workforce_assignment_lifecycle set worker_id=null,lease_token=null,lease_expires_at=null,
  outcome_certainty='unknown',outcome=outcome||jsonb_build_object('worker_lease_expired_during_cancel',true,'stop_confirmed',false),updated_at=clock_timestamp()
 where status='cancellation_requested' and lease_expires_at<=clock_timestamp();
 return jsonb_build_object('requeued_claims',v_requeued,'failed_unknown',v_failed,'cancellation_pending_unacknowledged',v_cancel_pending);
end; $$;
revoke all on function public.jd_workforce_assignment_recover(integer) from public,anon,authenticated;
grant execute on function public.jd_workforce_assignment_recover(integer) to service_role;

create function public.jd_workforce_choose_team_member(p_actor uuid,p_team uuid,p_agent_kind text,p_agent_ref text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_school uuid;v_employee uuid;
begin
 select school_id into v_school from public.profiles where id=p_actor and role in ('owner','admin');
 if v_school is null then raise exception 'Workspace administrator required' using errcode='42501'; end if;
 if p_agent_kind not in ('builtin','registry') then raise exception 'Invalid specialist kind' using errcode='22023'; end if;
 select e.id into v_employee
 from public.jd_workforce_employees e
 join public.jd_workforce_team_members m on m.employee_id=e.id and m.school_id=e.school_id and m.team_id=p_team and m.left_at is null
 left join lateral (
  select count(*)::integer as active_count from public.jd_workforce_assignment_lifecycle l
  where l.school_id=e.school_id and l.employee_id=e.id and l.status in ('queued','claimed','running','cancellation_requested')
 ) load on true
 where e.school_id=v_school and e.lifecycle_state='active' and e.agent_kind=p_agent_kind and e.agent_ref=p_agent_ref
 and exists(select 1 from public.jd_workforce_teams t where t.id=p_team and t.school_id=v_school and t.lifecycle_state='active')
 order by load.active_count,e.id limit 1;
 if v_employee is null then raise exception 'No eligible active employee is available in this team' using errcode='P0002'; end if;
 return v_employee;
end; $$;
revoke all on function public.jd_workforce_choose_team_member(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.jd_workforce_choose_team_member(uuid,uuid,text,text) to service_role;

create function public.jd_read_workforce_assignment_lifecycle(p_actor uuid,p_limit integer default 100)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_school uuid;v_limit integer;
begin
 select school_id into v_school from public.profiles where id=p_actor and role in ('owner','admin');
 if v_school is null then raise exception 'Workspace administrator required' using errcode='42501'; end if;
 v_limit:=least(greatest(coalesce(p_limit,100),1),500);
 return coalesce((select jsonb_agg(to_jsonb(x)) from (
  select id,run_id,employee_id,team_id,agent_kind,agent_ref,task_hash,status,attempt_count,
   worker_acknowledged_at,cancel_requested_at,cancel_acknowledged_at,cancel_acknowledged_by,
   outcome,outcome_certainty,last_heartbeat_at,created_at,updated_at
  from public.jd_workforce_assignment_lifecycle where school_id=v_school order by created_at desc limit v_limit
 ) x),'[]'::jsonb);
end; $$;
revoke all on function public.jd_read_workforce_assignment_lifecycle(uuid,integer) from public,anon,authenticated;
grant execute on function public.jd_read_workforce_assignment_lifecycle(uuid,integer) to service_role;
