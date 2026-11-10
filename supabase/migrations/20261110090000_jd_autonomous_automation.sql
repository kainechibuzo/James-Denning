-- JD autonomous automation control plane.
-- Tenant ownership is derived from profiles.school_id; clients cannot choose a tenant.
create extension if not exists pgcrypto;

create table if not exists public.jd_conversations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New conversation',
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.jd_messages (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  conversation_id uuid not null references public.jd_conversations(id) on delete cascade,
  sender_id uuid references auth.users(id) on delete set null,
  role text not null check (role in ('user','assistant','system','tool')),
  content text not null,
  content_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.jd_automation_runs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  conversation_id uuid references public.jd_conversations(id) on delete set null,
  requested_by uuid not null references auth.users(id) on delete cascade,
  trigger_type text not null default 'chat' check (trigger_type in ('chat','upload','schedule','event','manual')),
  status text not null default 'queued' check (status in ('queued','planning','awaiting_approval','running','completed','partially_completed','failed','cancelled')),
  autonomy_mode text not null default 'autonomous' check (autonomy_mode in ('assisted','autonomous')),
  scope text not null default 'organisation',
  request_text text not null,
  plan_json jsonb not null default '[]'::jsonb,
  result_json jsonb not null default '{}'::jsonb,
  idempotency_key text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, idempotency_key)
);

create table if not exists public.jd_automation_steps (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  run_id uuid not null references public.jd_automation_runs(id) on delete cascade,
  step_index integer not null,
  tool_key text not null,
  risk_level text not null check (risk_level in ('low','medium','high','critical')),
  status text not null default 'pending' check (status in ('pending','awaiting_approval','running','completed','skipped','failed')),
  input_json jsonb not null default '{}'::jsonb,
  output_json jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (run_id, step_index)
);

create table if not exists public.jd_approvals (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  run_id uuid not null references public.jd_automation_runs(id) on delete cascade,
  step_id uuid references public.jd_automation_steps(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  decided_by uuid references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','expired','cancelled')),
  reason text not null,
  decision_note text,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.jd_audit_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  run_id uuid references public.jd_automation_runs(id) on delete set null,
  event_type text not null,
  event_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists jd_conversations_school_updated_idx on public.jd_conversations(school_id, updated_at desc);
create index if not exists jd_messages_conversation_created_idx on public.jd_messages(conversation_id, created_at);
create index if not exists jd_runs_school_status_created_idx on public.jd_automation_runs(school_id, status, created_at desc);
create index if not exists jd_steps_run_idx on public.jd_automation_steps(run_id, step_index);
create index if not exists jd_approvals_school_status_idx on public.jd_approvals(school_id, status, created_at desc);
create index if not exists jd_audit_school_created_idx on public.jd_audit_events(school_id, created_at desc);

alter table public.jd_conversations enable row level security;
alter table public.jd_messages enable row level security;
alter table public.jd_automation_runs enable row level security;
alter table public.jd_automation_steps enable row level security;
alter table public.jd_approvals enable row level security;
alter table public.jd_audit_events enable row level security;

-- A user can see records only inside their authenticated profile's workspace.
create policy jd_conversations_select on public.jd_conversations for select to authenticated
using (school_id = (select p.school_id from public.profiles p where p.id = (select auth.uid())));
create policy jd_conversations_insert on public.jd_conversations for insert to authenticated
with check (created_by = (select auth.uid()) and school_id = (select p.school_id from public.profiles p where p.id = (select auth.uid())));
create policy jd_conversations_update on public.jd_conversations for update to authenticated
using (school_id = (select p.school_id from public.profiles p where p.id = (select auth.uid())))
with check (school_id = (select p.school_id from public.profiles p where p.id = (select auth.uid())));

create policy jd_messages_select on public.jd_messages for select to authenticated
using (school_id = (select p.school_id from public.profiles p where p.id = (select auth.uid())));
create policy jd_messages_insert on public.jd_messages for insert to authenticated
with check (sender_id = (select auth.uid()) and school_id = (select p.school_id from public.profiles p where p.id = (select auth.uid())));

create policy jd_runs_select on public.jd_automation_runs for select to authenticated
using (school_id = (select p.school_id from public.profiles p where p.id = (select auth.uid())));
create policy jd_runs_insert on public.jd_automation_runs for insert to authenticated
with check (requested_by = (select auth.uid()) and school_id = (select p.school_id from public.profiles p where p.id = (select auth.uid())));

create policy jd_steps_select on public.jd_automation_steps for select to authenticated
using (school_id = (select p.school_id from public.profiles p where p.id = (select auth.uid())));
create policy jd_approvals_select on public.jd_approvals for select to authenticated
using (school_id = (select p.school_id from public.profiles p where p.id = (select auth.uid())));
create policy jd_audit_select on public.jd_audit_events for select to authenticated
using (school_id = (select p.school_id from public.profiles p where p.id = (select auth.uid())));

grant select, insert, update on public.jd_conversations to authenticated;
grant select, insert on public.jd_messages to authenticated;
grant select, insert on public.jd_automation_runs to authenticated;
grant select on public.jd_automation_steps, public.jd_approvals, public.jd_audit_events to authenticated;
