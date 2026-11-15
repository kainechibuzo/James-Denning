-- Add covering indexes for foreign keys on JD's active operational tables.
-- Existing composite indexes already cover the school_id leading columns where applicable.
create index if not exists jd_automation_steps_school_id_fk_idx on public.jd_automation_steps (school_id);
create index if not exists jd_messages_school_id_fk_idx on public.jd_messages (school_id);
create index if not exists jd_messages_sender_id_fk_idx on public.jd_messages (sender_id);
create index if not exists jd_automation_runs_conversation_id_fk_idx on public.jd_automation_runs (conversation_id);
create index if not exists jd_automation_runs_requested_by_fk_idx on public.jd_automation_runs (requested_by);
create index if not exists jd_execution_jobs_requested_by_fk_idx on public.jd_execution_jobs (requested_by);
create index if not exists jd_conversations_created_by_fk_idx on public.jd_conversations (created_by);
create index if not exists jd_approvals_decided_by_fk_idx on public.jd_approvals (decided_by);
create index if not exists jd_approvals_requested_by_fk_idx on public.jd_approvals (requested_by);
create index if not exists jd_approvals_step_id_fk_idx on public.jd_approvals (step_id);
create index if not exists jd_operational_tasks_assigned_to_fk_idx on public.jd_operational_tasks (assigned_to);
create index if not exists jd_operational_tasks_created_by_fk_idx on public.jd_operational_tasks (created_by);
