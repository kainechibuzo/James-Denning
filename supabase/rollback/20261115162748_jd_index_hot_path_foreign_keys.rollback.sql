-- Rollback for 20261115162748_jd_index_hot_path_foreign_keys.sql
drop index if exists public.jd_automation_steps_school_id_fk_idx;
drop index if exists public.jd_messages_school_id_fk_idx;
drop index if exists public.jd_messages_sender_id_fk_idx;
drop index if exists public.jd_automation_runs_conversation_id_fk_idx;
drop index if exists public.jd_automation_runs_requested_by_fk_idx;
drop index if exists public.jd_execution_jobs_requested_by_fk_idx;
drop index if exists public.jd_conversations_created_by_fk_idx;
drop index if exists public.jd_approvals_decided_by_fk_idx;
drop index if exists public.jd_approvals_requested_by_fk_idx;
drop index if exists public.jd_approvals_step_id_fk_idx;
drop index if exists public.jd_operational_tasks_assigned_to_fk_idx;
drop index if exists public.jd_operational_tasks_created_by_fk_idx;
