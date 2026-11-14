alter table public.jd_approvals add column if not exists created_by_agent boolean not null default false;
alter table public.jd_automation_runs add column if not exists created_by_agent boolean not null default false;
alter table public.jd_messages add column if not exists created_by_agent boolean not null default false;
alter table public.jd_automation_steps add column if not exists created_by_agent boolean not null default false;
create index if not exists jd_approvals_jd_created_idx on public.jd_approvals(school_id,created_by_agent,created_at desc);
create index if not exists jd_runs_jd_created_idx on public.jd_automation_runs(school_id,created_by_agent,created_at desc);