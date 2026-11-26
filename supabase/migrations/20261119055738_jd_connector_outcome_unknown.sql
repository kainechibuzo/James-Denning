-- Preserve ambiguous remote outcomes instead of falsely reporting a clean failure.
-- This prevents automatic retries from duplicating actions that may already have
-- reached a provider when the network or evidence persistence fails.
alter table public.jd_connector_executions
  drop constraint if exists jd_connector_executions_status_check;
alter table public.jd_connector_executions
  add constraint jd_connector_executions_status_check
  check (status in ('running','succeeded','failed','outcome_unknown'));

alter table public.jd_connector_approvals
  drop constraint if exists jd_connector_approvals_status_check;
alter table public.jd_connector_approvals
  add constraint jd_connector_approvals_status_check
  check (status in ('pending','approved','denied','executed','failed','expired','outcome_unknown'));

comment on column public.jd_connector_executions.status is
  'succeeded requires persisted provider result evidence; outcome_unknown means the provider may have acted but JD cannot verify the outcome and must not retry automatically.';
