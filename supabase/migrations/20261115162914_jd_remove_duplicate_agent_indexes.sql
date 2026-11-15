-- Remove exact duplicate indexes; keep the canonical indexes with clearer names.
drop index if exists public.jd_approvals_jd_created_idx;
drop index if exists public.jd_runs_jd_created_idx;
