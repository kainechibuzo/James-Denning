-- Candidate migration: apply only to separately approved isolated staging.
-- Shadow accounting ONLY. No invoice/payment/subscription changes or execution grants.
-- Depends on the existing execution-job and audit ledgers; never creates a second queue.
create table public.jd_usage_accounts (
 school_id uuid primary key references public.schools(id),
 budget_micros bigint not null check (budget_micros between 0 and 1000000000000),
 reserved_micros bigint not null default 0 check (reserved_micros >= 0),
 accrued_micros bigint not null default 0 check (accrued_micros >= 0),
 version integer not null default 1,
 check (reserved_micros + accrued_micros <= budget_micros)
);
create table public.jd_usage_runs (
 job_id uuid primary key references public.jd_execution_jobs(id),
 school_id uuid not null references public.jd_usage_accounts(school_id),
 authorised_by uuid not null references auth.users(id),
 subject_reference text not null check (length(subject_reference) between 1 and 120),
 reservation_micros bigint not null check (reservation_micros between 1 and 1000000000),
 status text not null default 'open' check (status in ('open','settled','review_required')),
 phase text not null default 'idle' check (phase in ('idle','active','external_wait','approval_wait','paused','closed')),
 sequence integer not null default 0,
 active_microseconds bigint not null default 0 check (active_microseconds >= 0),
 estimate_micros bigint not null default 0 check (estimate_micros between 0 and reservation_micros),
 observed_at timestamptz,
 deadline timestamptz,
 lease_token uuid,
 uncertain boolean not null default false,
 created_at timestamptz not null default clock_timestamp(),
 closed_at timestamptz
);
create table public.jd_usage_events (
 id uuid primary key default gen_random_uuid(),
 school_id uuid not null references public.jd_usage_accounts(school_id),
 request_id uuid not null,
 job_id uuid references public.jd_usage_runs(job_id),
 kind text not null check (kind in ('configure','reserve','observe','reconcile')),
 request jsonb not null,
 receipt jsonb not null,
 created_at timestamptz not null default clock_timestamp(),
 unique(school_id,request_id)
);
create index jd_usage_runs_scope on public.jd_usage_runs(school_id,status);
create unique index jd_usage_one_open_subject on public.jd_usage_runs(school_id,subject_reference) where status='open';
create index jd_usage_events_scope on public.jd_usage_events(school_id,created_at desc);

create function public.jd_usage_immutable_event() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Usage events are immutable' using errcode='55000'; end; $$;
create trigger jd_usage_event_immutable before update or delete on public.jd_usage_events
 for each row execute function public.jd_usage_immutable_event();

-- All writes, and reads containing private worker fencing tokens, are RPC-only.
-- Service role receives SELECT but no direct mutation grants.
alter table public.jd_usage_accounts enable row level security;
alter table public.jd_usage_runs enable row level security;
alter table public.jd_usage_events enable row level security;
create policy internal_service_only_deny_client_roles on public.jd_usage_accounts as permissive for all to anon, authenticated using (false) with check (false);
create policy internal_service_only_deny_client_roles on public.jd_usage_runs as permissive for all to anon, authenticated using (false) with check (false);
create policy internal_service_only_deny_client_roles on public.jd_usage_events as permissive for all to anon, authenticated using (false) with check (false);
revoke all on public.jd_usage_accounts,public.jd_usage_runs,public.jd_usage_events from public,anon,authenticated,service_role;
grant select on public.jd_usage_accounts,public.jd_usage_runs,public.jd_usage_events to service_role;

create function public.jd_usage_actor_tenant(p_actor_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare tenant uuid;
begin
 select school_id into tenant from public.profiles where id=p_actor_id and role in ('owner','admin');
 if tenant is null then raise exception 'Workspace administrator required' using errcode='42501'; end if;
 return tenant;
end; $$;

create function public.jd_configure_usage(p_actor_id uuid,p_request_id uuid,p_expected_version integer,p_budget_micros bigint,p_policy text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid; a public.jd_usage_accounts%rowtype; e public.jd_usage_events%rowtype; req jsonb; result jsonb;
begin
 tenant:=public.jd_usage_actor_tenant(p_actor_id);
 if p_request_id is null or p_expected_version is null or p_expected_version<0 or p_budget_micros is null or p_budget_micros<0 or p_budget_micros>1000000000000 or p_policy is distinct from 'employee-active-v1-shadow' then
  raise exception 'Explicit shadow usage policy and valid budget required' using errcode='22023'; end if;
 -- Tenant lock also serialises first account creation. Every usage RPC uses job -> tenant order.
 perform pg_advisory_xact_lock(hashtextextended(tenant::text,171200));
 req:=jsonb_build_array(p_actor_id,p_expected_version,p_budget_micros,p_policy);
 select * into e from public.jd_usage_events where school_id=tenant and request_id=p_request_id;
 if found then
  if e.kind<>'configure' or e.request<>req then raise exception 'Usage request conflict' using errcode='40001'; end if;
  return e.receipt;
 end if;
 select * into a from public.jd_usage_accounts where school_id=tenant for update;
 if (not found and p_expected_version<>0) or (a.school_id is not null and a.version<>p_expected_version) then raise exception 'Usage version conflict' using errcode='40001'; end if;
 if a.school_id is null then
  insert into public.jd_usage_accounts(school_id,budget_micros) values(tenant,p_budget_micros) returning * into a;
 else
  if p_budget_micros<a.reserved_micros+a.accrued_micros then raise exception 'Budget below existing exposure' using errcode='22023'; end if;
  update public.jd_usage_accounts set budget_micros=p_budget_micros,version=version+1 where school_id=tenant returning * into a;
 end if;
 result:=jsonb_build_object('mode','shadow','charged',false,'version',a.version,'budget_micros',a.budget_micros,'policy',p_policy,'hourly_micros',1000000,'platform_subscription','unchanged');
 insert into public.jd_usage_events(school_id,request_id,kind,request,receipt) values(tenant,p_request_id,'configure',req,result);
 insert into public.jd_audit_events(school_id,actor_id,event_type,event_json) values(tenant,p_actor_id,'usage.shadow_configured',result);
 return result;
end; $$;

create function public.jd_reserve_usage(p_actor_id uuid,p_request_id uuid,p_job_id uuid,p_subject_reference text,p_max_micros bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid; j public.jd_execution_jobs%rowtype; a public.jd_usage_accounts%rowtype; e public.jd_usage_events%rowtype; req jsonb; result jsonb;
begin
 tenant:=public.jd_usage_actor_tenant(p_actor_id);
 if p_request_id is null or p_subject_reference is null or length(trim(p_subject_reference)) not between 1 and 120 or p_max_micros is null or p_max_micros not between 1 and 1000000000 then raise exception 'Invalid usage reservation' using errcode='22023'; end if;
 select * into j from public.jd_execution_jobs where id=p_job_id and school_id=tenant for update;
 if not found then raise exception 'Execution job unavailable' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(tenant::text,171200));
 req:=jsonb_build_array(p_actor_id,p_job_id,p_subject_reference,p_max_micros);
 select * into e from public.jd_usage_events where school_id=tenant and request_id=p_request_id;
 if found then
  if e.kind<>'reserve' or e.request<>req then raise exception 'Usage request conflict' using errcode='40001'; end if;
  return e.receipt;
 end if;
 if j.status<>'queued' then raise exception 'Reserve usage before execution starts' using errcode='40001'; end if;
 if not exists(select 1 from public.jd_automation_runs r join public.profiles p on p.id=j.requested_by where r.id=j.run_id and r.school_id=tenant and r.requested_by=j.requested_by and p.school_id=tenant) then raise exception 'Job tenant linkage invalid' using errcode='42501'; end if;
 if exists(select 1 from public.jd_usage_runs where job_id=p_job_id) then raise exception 'Job already has a usage reservation' using errcode='40001'; end if;
 select * into a from public.jd_usage_accounts where school_id=tenant for update;
 if not found or p_max_micros>a.budget_micros-a.reserved_micros-a.accrued_micros then raise exception 'Shadow usage budget unavailable' using errcode='54000'; end if;
 if exists(select 1 from public.jd_usage_runs where school_id=tenant and subject_reference=trim(p_subject_reference) and status='open') then raise exception 'Subject already has an open usage reservation' using errcode='40001'; end if;
 insert into public.jd_usage_runs(job_id,school_id,authorised_by,subject_reference,reservation_micros) values(p_job_id,tenant,p_actor_id,trim(p_subject_reference),p_max_micros);
 update public.jd_usage_accounts set reserved_micros=reserved_micros+p_max_micros where school_id=tenant;
 result:=jsonb_build_object('job_id',p_job_id,'sequence',0,'reservation_micros',p_max_micros,'mode','shadow','charged',false,'execution_authorised',false,'subject_verified',false);
 insert into public.jd_usage_events(school_id,request_id,job_id,kind,request,receipt) values(tenant,p_request_id,p_job_id,'reserve',req,result);
 insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json) values(tenant,p_actor_id,j.run_id,'usage.reserved',result);
 return result;
end; $$;

-- Worker-only observation. No caller timestamps, durations, prices or charge amounts.
-- A live execution lease is required; an old lease may only replay its exact prior receipt.
create function public.jd_observe_usage(p_job_id uuid,p_lease_token uuid,p_request_id uuid,p_expected_sequence integer,p_phase text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.jd_execution_jobs%rowtype; u public.jd_usage_runs%rowtype; e public.jd_usage_events%rowtype;
 req jsonb; result jsonb; t timestamptz; elapsed bigint:=0; next_deadline timestamptz;
begin
 if p_request_id is null or p_lease_token is null or p_expected_sequence is null or p_expected_sequence<0 or p_phase is null or p_phase not in ('idle','active','external_wait','approval_wait','paused','closed') then raise exception 'Invalid usage observation' using errcode='22023'; end if;
 select * into j from public.jd_execution_jobs where id=p_job_id for update;
 if not found then raise exception 'Execution job unavailable' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(j.school_id::text,171200));
 select * into u from public.jd_usage_runs where job_id=p_job_id and school_id=j.school_id for update;
 if not found then raise exception 'No explicit usage reservation' using errcode='42501'; end if;
 req:=jsonb_build_array(p_job_id,p_lease_token,p_expected_sequence,p_phase);
 select * into e from public.jd_usage_events where school_id=j.school_id and request_id=p_request_id;
 if found then
  if e.kind<>'observe' or e.request<>req then raise exception 'Usage request conflict' using errcode='40001'; end if;
  return e.receipt;
 end if;
 t:=clock_timestamp();
 if j.status<>'running' or j.lease_token is distinct from p_lease_token or j.lease_expires_at<=t then raise exception 'Live worker lease required' using errcode='42501'; end if;
 if u.status<>'open' or u.sequence<>p_expected_sequence then raise exception 'Usage sequence or terminal conflict' using errcode='40001'; end if;
 if not exists(select 1 from public.profiles where id=u.authorised_by and school_id=u.school_id and role in ('owner','admin')) then raise exception 'Usage authority revoked' using errcode='42501'; end if;
 if u.phase='active' then
  if u.lease_token is distinct from p_lease_token or u.deadline is null or t>u.deadline or t<u.observed_at then
   -- Never infer billable time across crashes, lease replacement or missed deadlines.
   u.uncertain:=true;
  else elapsed:=floor(extract(epoch from (t-u.observed_at))*1000000)::bigint;
  end if;
 end if;
 u.active_microseconds:=u.active_microseconds+elapsed;
 -- $1/hour: ceiling once over cumulative confirmed microseconds (one microdollar / 3600us).
 u.estimate_micros:=(u.active_microseconds+3599)/3600;
 if u.estimate_micros>u.reservation_micros then raise exception 'Usage reservation exceeded' using errcode='54000'; end if;
 if u.uncertain or u.estimate_micros=u.reservation_micros then p_phase:='closed'; end if;
 if p_phase='active' then
  next_deadline:=least(j.lease_expires_at,t+interval '30 seconds',t+((u.reservation_micros*3600-u.active_microseconds)::double precision*interval '1 microsecond'));
 end if;
 u.sequence:=u.sequence+1;
 if p_phase='closed' then
  u.status:=case when u.uncertain then 'review_required' else 'settled' end;
  update public.jd_usage_accounts set reserved_micros=reserved_micros-u.reservation_micros,accrued_micros=accrued_micros+u.estimate_micros where school_id=u.school_id;
 end if;
 update public.jd_usage_runs set sequence=u.sequence,status=u.status,phase=p_phase,active_microseconds=u.active_microseconds,estimate_micros=u.estimate_micros,uncertain=u.uncertain,observed_at=t,deadline=next_deadline,lease_token=p_lease_token,closed_at=case when p_phase='closed' then t else null end where job_id=p_job_id;
 result:=jsonb_build_object('job_id',p_job_id,'sequence',u.sequence,'status',u.status,'phase',p_phase,'observed_at',t,'deadline',next_deadline,'active_microseconds',u.active_microseconds,'estimate_micros',u.estimate_micros,'uncertain',u.uncertain,'mode','shadow','charged',false);
 insert into public.jd_usage_events(school_id,request_id,job_id,kind,request,receipt) values(u.school_id,p_request_id,p_job_id,'observe',req,result);
 insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json) values(u.school_id,j.requested_by,j.run_id,'usage.observed',result);
 return result;
end; $$;

-- Human reconciliation of terminal jobs only. Never reconstruct missing active time.
create function public.jd_reconcile_usage(p_actor_id uuid,p_job_id uuid,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid; j public.jd_execution_jobs%rowtype; u public.jd_usage_runs%rowtype; e public.jd_usage_events%rowtype; req jsonb; result jsonb;
begin
 tenant:=public.jd_usage_actor_tenant(p_actor_id);
 if p_request_id is null then raise exception 'Request identifier required' using errcode='22023'; end if;
 select * into j from public.jd_execution_jobs where id=p_job_id and school_id=tenant for update;
 if not found then raise exception 'Execution job unavailable' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(tenant::text,171200));
 req:=jsonb_build_array(p_actor_id,p_job_id);
 select * into e from public.jd_usage_events where school_id=tenant and request_id=p_request_id;
 if found then
  if e.kind<>'reconcile' or e.request<>req then raise exception 'Usage request conflict' using errcode='40001'; end if;
  return e.receipt;
 end if;
 if j.status not in ('completed','partially_completed','failed','cancelled') then raise exception 'Only terminal jobs can be reconciled' using errcode='40001'; end if;
 select * into u from public.jd_usage_runs where job_id=p_job_id and school_id=tenant for update;
 if not found or u.status<>'open' then raise exception 'Open usage reservation unavailable' using errcode='40001'; end if;
 update public.jd_usage_accounts set reserved_micros=reserved_micros-u.reservation_micros,accrued_micros=accrued_micros+u.estimate_micros where school_id=tenant;
 update public.jd_usage_runs set status='review_required',phase='closed',uncertain=true,sequence=sequence+1,deadline=null,lease_token=null,closed_at=clock_timestamp() where job_id=p_job_id;
 result:=jsonb_build_object('job_id',p_job_id,'status','review_required','estimate_micros',u.estimate_micros,'discarded_unconfirmed_time',true,'mode','shadow','charged',false);
 insert into public.jd_usage_events(school_id,request_id,job_id,kind,request,receipt) values(tenant,p_request_id,p_job_id,'reconcile',req,result);
 insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json) values(tenant,p_actor_id,j.run_id,'usage.reconciled',result);
 return result;
end; $$;

create function public.jd_usage_snapshot(p_actor_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare tenant uuid; a public.jd_usage_accounts%rowtype; reserved bigint; accrued bigint; runs jsonb;
begin
 tenant:=public.jd_usage_actor_tenant(p_actor_id);
 perform pg_advisory_xact_lock(hashtextextended(tenant::text,171200));
 select * into a from public.jd_usage_accounts where school_id=tenant;
 select coalesce(sum(reservation_micros) filter(where status='open'),0),coalesce(sum(estimate_micros) filter(where status<>'open'),0) into reserved,accrued from public.jd_usage_runs where school_id=tenant;
 select coalesce(jsonb_agg(x order by created_at desc),'[]'::jsonb) into runs from (
  select job_id,subject_reference,status,phase,sequence,reservation_micros,estimate_micros,active_microseconds,uncertain,created_at,closed_at
  from public.jd_usage_runs where school_id=tenant order by created_at desc,job_id limit 50
 ) x;
 return jsonb_build_object('configured',a.school_id is not null,'mode','shadow','charged',false,'invoice_created',false,'platform_subscription','unchanged','policy','employee-active-v1-shadow','hourly_micros',1000000,'version',coalesce(a.version,0),'budget_micros',coalesce(a.budget_micros,0),'reserved_micros',coalesce(a.reserved_micros,0),'accrued_micros',coalesce(a.accrued_micros,0),'balanced',reserved=coalesce(a.reserved_micros,0) and accrued=coalesce(a.accrued_micros,0),'runs',runs,'run_limit',50);
end; $$;

revoke all on function public.jd_usage_immutable_event(),public.jd_usage_actor_tenant(uuid),public.jd_configure_usage(uuid,uuid,integer,bigint,text),public.jd_reserve_usage(uuid,uuid,uuid,text,bigint),public.jd_observe_usage(uuid,uuid,uuid,integer,text),public.jd_reconcile_usage(uuid,uuid,uuid),public.jd_usage_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.jd_configure_usage(uuid,uuid,integer,bigint,text),public.jd_reserve_usage(uuid,uuid,uuid,text,bigint),public.jd_observe_usage(uuid,uuid,uuid,integer,text),public.jd_reconcile_usage(uuid,uuid,uuid),public.jd_usage_snapshot(uuid) to service_role;
comment on table public.jd_usage_runs is 'Shadow usage reservations for existing jobs. Subject references are unverified labels, not hired employees. No execution or spending authority.';
comment on table public.jd_usage_events is 'Append-only server observations and replay receipts. Estimates are not invoice lines or actual charges.';
