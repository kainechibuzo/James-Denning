-- JD Connect: tenant-scoped remote MCP registry, credentials, approvals and execution audit.
create table if not exists public.jd_connector_servers (
 id uuid primary key default gen_random_uuid(),
 school_id uuid not null references public.schools(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 100),
 endpoint_url text not null check(length(endpoint_url) between 10 and 2048),
 host text not null check(length(host) between 1 and 253),
 status text not null default 'connected' check(status in ('connected','disabled','error')),
 server_info jsonb not null default '{}'::jsonb,
 protocol_version text,
 last_connected_at timestamptz,
 last_error_code text,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(school_id,host,endpoint_url)
);
create table if not exists public.jd_connector_credentials (
 server_id uuid primary key references public.jd_connector_servers(id) on delete cascade,
 school_id uuid not null references public.schools(id) on delete cascade,
 encrypted_bearer_token text,
 key_version text not null default 'aes-gcm-v1',
 updated_at timestamptz not null default now(),
 check(encrypted_bearer_token is null or length(encrypted_bearer_token)<=16384)
);
create table if not exists public.jd_connector_tools (
 id uuid primary key default gen_random_uuid(),
 school_id uuid not null references public.schools(id) on delete cascade,
 server_id uuid not null references public.jd_connector_servers(id) on delete cascade,
 name text not null check(length(name) between 1 and 128),
 description text not null default '' check(length(description)<=4000),
 input_schema jsonb not null default '{}'::jsonb,
 annotations jsonb not null default '{}'::jsonb,
 read_only boolean not null default false,
 discovered_at timestamptz not null default now(),
 unique(server_id,name)
);
create index if not exists jd_connector_tools_server_idx on public.jd_connector_tools(school_id,server_id,name);
create table if not exists public.jd_connector_approvals (
 id uuid primary key default gen_random_uuid(),
 school_id uuid not null references public.schools(id) on delete cascade,
 server_id uuid not null references public.jd_connector_servers(id) on delete cascade,
 requested_by uuid not null references auth.users(id),
 tool_name text not null,
 arguments_ciphertext text not null check(length(arguments_ciphertext)<=65536),
 status text not null default 'pending' check(status in ('pending','approved','denied','executed','failed','expired')),
 resolved_by uuid references auth.users(id),
 resolved_at timestamptz,
 expires_at timestamptz not null default (now()+interval '15 minutes'),
 execution_id uuid,
 created_at timestamptz not null default now()
);
create index if not exists jd_connector_approvals_pending_idx on public.jd_connector_approvals(school_id,status,created_at desc);
create table if not exists public.jd_connector_executions (
 id uuid primary key default gen_random_uuid(),
 school_id uuid not null references public.schools(id) on delete cascade,
 server_id uuid not null references public.jd_connector_servers(id) on delete cascade,
 approval_id uuid references public.jd_connector_approvals(id) on delete set null,
 requested_by uuid not null references auth.users(id),
 tool_name text not null,
 status text not null check(status in ('running','succeeded','failed')),
 result_json jsonb,
 error_code text,
 duration_ms integer check(duration_ms is null or duration_ms>=0),
 created_at timestamptz not null default now(),
 completed_at timestamptz
);
create index if not exists jd_connector_executions_recent_idx on public.jd_connector_executions(school_id,created_at desc);
do $$
declare t text;
begin
 foreach t in array array['jd_connector_servers','jd_connector_credentials','jd_connector_tools','jd_connector_approvals','jd_connector_executions'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant select,insert,update,delete on public.%I to service_role',t);
 end loop;
end $$;
