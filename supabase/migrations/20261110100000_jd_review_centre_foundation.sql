-- JD Review Centre foundation: persist reviewable proposals and decision/execution state.
-- This is additive to the existing jd_approvals control-plane table.
alter table public.jd_approvals
  add column if not exists title text,
  add column if not exists action_key text,
  add column if not exists risk_level text not null default 'high'
    check (risk_level in ('low','medium','high','critical')),
  add column if not exists proposal_json jsonb not null default '{}'::jsonb,
  add column if not exists audience_text text,
  add column if not exists execution_status text not null default 'not_executed'
    check (execution_status in ('not_executed','queued','running','completed','failed','cancelled')),
  add column if not exists execution_result_json jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists jd_approvals_review_queue_idx
  on public.jd_approvals (school_id, status, created_at desc);

create index if not exists jd_approvals_run_idx
  on public.jd_approvals (run_id, created_at desc);

-- A proposal is reviewable only within its own workspace. The service role writes
-- proposals and decisions; authenticated clients receive read-only access via RLS.
drop policy if exists jd_approvals_select on public.jd_approvals;
create policy jd_approvals_select on public.jd_approvals
  for select to authenticated
  using (
    school_id = (select p.school_id from public.profiles p where p.id = (select auth.uid()))
  );

grant select on public.jd_approvals to authenticated;
revoke insert, update, delete on public.jd_approvals from authenticated;

-- Record the decision/execution lifecycle as append-only audit events.
create index if not exists jd_audit_events_run_type_idx
  on public.jd_audit_events (school_id, run_id, event_type, created_at desc);
