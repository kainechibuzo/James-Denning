-- Rollback for 20261115162914_jd_remove_duplicate_agent_indexes.sql
create index if not exists jd_approvals_jd_created_idx
  on public.jd_approvals using btree (school_id, created_by_agent, created_at desc);
create index if not exists jd_runs_jd_created_idx
  on public.jd_automation_runs using btree (school_id, created_by_agent, created_at desc);
