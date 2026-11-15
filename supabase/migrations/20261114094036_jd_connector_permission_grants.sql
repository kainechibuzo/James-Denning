-- Per-provider access grants for JD Connect.
create table if not exists public.jd_connector_grants (
  server_id uuid primary key references public.jd_connector_servers(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  access_level text not null default 'read_only' check (access_level in ('read_only','read_write','full_control')),
  granted_by uuid not null references auth.users(id),
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  check (expires_at is null or expires_at > granted_at)
);
create index if not exists jd_connector_grants_school_idx on public.jd_connector_grants(school_id,access_level);
alter table public.jd_connector_grants enable row level security;
revoke all on public.jd_connector_grants from anon, authenticated;
grant select,insert,update,delete on public.jd_connector_grants to service_role;
