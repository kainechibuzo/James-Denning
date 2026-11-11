-- JD Batch 02 tracks 07-20: tenant-scoped multi-industry business operations.
create table if not exists public.jd_business_customers (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 180), customer_type text not null default 'organisation' check(customer_type in ('person','organisation')),
 email text, phone text, company text, status text not null default 'active' check(status in ('lead','active','inactive','archived')),
 consent_status text not null default 'unknown' check(consent_status in ('unknown','granted','withdrawn')), consent_updated_at timestamptz,
 owner_id uuid references public.profiles(id) on delete set null, notes text not null default '' check(length(notes)<=5000),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists jd_business_customers_school_idx on public.jd_business_customers(school_id,status,created_at desc);
create table if not exists public.jd_business_opportunities (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
 customer_id uuid references public.jd_business_customers(id) on delete set null, title text not null check(length(trim(title)) between 1 and 180),
 stage text not null default 'lead' check(stage in ('lead','qualified','proposal','negotiation','won','lost')),
 amount numeric(14,2) not null default 0 check(amount>=0), currency char(3) not null default 'NGN',
 probability smallint not null default 10 check(probability between 0 and 100), expected_close_date date, next_action text,
 owner_id uuid references public.profiles(id) on delete set null, created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists jd_business_opportunities_school_idx on public.jd_business_opportunities(school_id,stage,expected_close_date);
create table if not exists public.jd_business_activities (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
 customer_id uuid references public.jd_business_customers(id) on delete cascade, opportunity_id uuid references public.jd_business_opportunities(id) on delete cascade,
 activity_type text not null check(activity_type in ('note','call','meeting','email','stage_change','support_update')),
 title text not null check(length(trim(title)) between 1 and 180), body text not null default '' check(length(body)<=5000),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create index if not exists jd_business_activities_school_idx on public.jd_business_activities(school_id,created_at desc);
create table if not exists public.jd_business_expenses (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
 category text not null check(length(trim(category)) between 1 and 100), description text not null check(length(trim(description)) between 1 and 300),
 amount numeric(14,2) not null check(amount>0), currency char(3) not null default 'NGN', incurred_on date not null,
 status text not null default 'submitted' check(status in ('draft','submitted','approved','rejected','paid')),
 vendor text, reference text, created_by uuid not null references auth.users(id), approved_by uuid references auth.users(id), approved_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists jd_business_expenses_school_idx on public.jd_business_expenses(school_id,incurred_on desc,status);
create table if not exists public.jd_business_contracts (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
 customer_id uuid references public.jd_business_customers(id) on delete set null, title text not null check(length(trim(title)) between 1 and 180),
 contract_type text not null default 'proposal', status text not null default 'draft' check(status in ('draft','in_review','approved','active','expired','terminated')),
 value numeric(14,2) check(value is null or value>=0), currency char(3) not null default 'NGN', starts_on date, expires_on date,
 renewal_notice_days integer not null default 30 check(renewal_notice_days between 0 and 365),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(expires_on is null or starts_on is null or expires_on>=starts_on)
);
create table if not exists public.jd_business_contract_versions (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
 contract_id uuid not null references public.jd_business_contracts(id) on delete cascade, version_no integer not null check(version_no>0),
 title text not null, body text not null check(length(body)<=50000), content_hash text not null,
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), unique(contract_id,version_no)
);
create table if not exists public.jd_business_documents (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
 title text not null check(length(trim(title)) between 1 and 180), storage_path text not null, mime_type text not null,
 byte_size bigint not null check(byte_size between 1 and 20971520), checksum_sha256 text,
 extraction_status text not null default 'pending' check(extraction_status in ('pending','processing','completed','failed','unsupported')),
 extracted_text text check(extracted_text is null or length(extracted_text)<=100000), summary text check(summary is null or length(summary)<=10000),
 source_metadata jsonb not null default '{}'::jsonb, created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(school_id,storage_path)
);
create table if not exists public.jd_business_support_cases (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
 customer_id uuid references public.jd_business_customers(id) on delete set null, title text not null check(length(trim(title)) between 1 and 180),
 description text not null default '' check(length(description)<=10000), status text not null default 'open' check(status in ('open','in_progress','waiting','resolved','closed')),
 priority text not null default 'normal' check(priority in ('low','normal','high','urgent')), assigned_to uuid references public.profiles(id) on delete set null,
 sla_due_at timestamptz, resolved_at timestamptz, resolution_note text, created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists jd_business_support_cases_school_idx on public.jd_business_support_cases(school_id,status,priority,created_at desc);
create table if not exists public.jd_business_support_notes (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
 case_id uuid not null references public.jd_business_support_cases(id) on delete cascade, body text not null check(length(trim(body)) between 1 and 5000),
 is_internal boolean not null default true, created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create table if not exists public.jd_business_integration_catalog (
 id text primary key, name text not null, category text not null, description text not null default '',
 required_scopes text[] not null default '{}', supported_capabilities text[] not null default '{}', enabled boolean not null default true
);
insert into public.jd_business_integration_catalog(id,name,category,description,required_scopes,supported_capabilities) values
 ('google-workspace','Google Workspace','productivity','Google identity; provider OAuth configuration required.',array['openid','email','profile'],array['identity']),
 ('microsoft-365','Microsoft 365','productivity','Microsoft identity; provider OAuth configuration required.',array['openid','email','profile'],array['identity']),
 ('linkedin','LinkedIn','marketing','Professional network; publishing depends on granted provider access.',array['openid','profile','w_member_social'],array['identity','read_profile','approved_publish']),
 ('paystack','Paystack','payments','Read-only transaction integration; no charge/refund action exposed.',array['transaction:read'],array['read_transactions']),
 ('slack','Slack','communications','Team communications; outbound messages require approval.',array['chat:write'],array['approved_message'])
on conflict(id) do update set name=excluded.name,category=excluded.category,description=excluded.description,required_scopes=excluded.required_scopes,supported_capabilities=excluded.supported_capabilities;
create table if not exists public.jd_business_oauth_connections (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
 provider_id text not null references public.jd_business_integration_catalog(id), status text not null default 'not_connected' check(status in ('pending','connected','expired','revoked','error')),
 scopes text[] not null default '{}', connected_by uuid references auth.users(id), connected_at timestamptz, token_expires_at timestamptz,
 encrypted_credentials bytea, key_version text, last_error_code text, last_checked_at timestamptz, created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), unique(school_id,provider_id),
 check(encrypted_credentials is null or octet_length(encrypted_credentials)<=16384)
);
create table if not exists public.jd_business_oauth_states (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
 provider_id text not null references public.jd_business_integration_catalog(id), actor_id uuid not null references auth.users(id),
 state_hash text not null unique, pkce_verifier_encrypted bytea not null, redirect_uri text not null, expires_at timestamptz not null,
 consumed_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.jd_business_service_checks (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
 provider_id text not null references public.jd_business_integration_catalog(id), status text not null check(status in ('healthy','degraded','down','unknown')),
 latency_ms integer check(latency_ms is null or latency_ms>=0), status_code integer, error_code text, checked_at timestamptz not null default now()
);
create index if not exists jd_business_service_checks_school_idx on public.jd_business_service_checks(school_id,provider_id,checked_at desc);
create table if not exists public.jd_business_reports (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
 title text not null check(length(trim(title)) between 1 and 180), report_type text not null, period_start date not null, period_end date not null,
 status text not null default 'draft' check(status in ('draft','in_review','approved','shared')),
 report_json jsonb not null default '{}'::jsonb, source_metadata jsonb not null default '{}'::jsonb,
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(period_end>=period_start)
);
create table if not exists public.jd_business_cash_transactions (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
 direction text not null check(direction in ('inflow','outflow')), amount numeric(14,2) not null check(amount>0),
 currency char(3) not null default 'NGN', occurred_on date not null, status text not null default 'pending' check(status in ('pending','cleared','void')),
 category text not null, description text not null check(length(trim(description)) between 1 and 300),
 reference text, created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists jd_business_cash_transactions_school_idx on public.jd_business_cash_transactions(school_id,occurred_on desc,status);
do $$
declare t text;
begin foreach t in array array['jd_business_budgets','jd_business_cash_transactions','jd_business_customers','jd_business_opportunities','jd_business_activities','jd_business_expenses','jd_business_contracts','jd_business_contract_versions','jd_business_documents','jd_business_support_cases','jd_business_support_notes','jd_business_oauth_connections','jd_business_oauth_states','jd_business_service_checks','jd_business_reports'] loop
 execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from anon,authenticated',t);execute format('grant select,insert,update,delete on public.%I to service_role',t);
end loop;end $$;
alter table public.jd_business_integration_catalog enable row level security;
revoke all on public.jd_business_integration_catalog from anon,authenticated;grant select on public.jd_business_integration_catalog to service_role;
create or replace function public.jd_business_audit(p_school_id uuid,p_actor_id uuid,p_event_type text,p_event jsonb) returns void language plpgsql security definer set search_path='' as $$
begin if length(p_event_type) not between 1 and 100 then raise exception 'Invalid audit event';end if;insert into public.jd_audit_events(school_id,actor_id,event_type,event_json) values(p_school_id,p_actor_id,p_event_type,coalesce(p_event,'{}'::jsonb));end;$$;
revoke all on function public.jd_business_audit(uuid,uuid,text,jsonb) from public,anon,authenticated;grant execute on function public.jd_business_audit(uuid,uuid,text,jsonb) to service_role;

-- Private document bucket. Access is mediated by short-lived signed upload/download URLs from the authenticated Edge Function.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('jd-business-documents','jd-business-documents',false,20971520,array['application/pdf','text/plain','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict(id) do update set public=false,file_size_limit=20971520,allowed_mime_types=excluded.allowed_mime_types;

-- Budget controls and customer attribution for actual cash receipts.
alter table public.jd_business_cash_transactions add column if not exists customer_id uuid references public.jd_business_customers(id) on delete set null;
create index if not exists jd_business_cash_transactions_customer_idx on public.jd_business_cash_transactions(school_id,customer_id,occurred_on desc);
create table if not exists public.jd_business_budgets (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
 category text not null check(length(trim(category)) between 1 and 100), currency char(3) not null default 'NGN',
 period_start date not null, period_end date not null, budget_amount numeric(14,2) not null check(budget_amount>0),
 alert_threshold_pct smallint not null default 80 check(alert_threshold_pct between 1 and 100),
 status text not null default 'active' check(status in ('active','archived')),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(period_end>=period_start), unique(school_id,category,currency,period_start,period_end)
);
create index if not exists jd_business_budgets_school_idx on public.jd_business_budgets(school_id,status,period_start,period_end);
alter table public.jd_business_budgets enable row level security;
revoke all on public.jd_business_budgets from anon,authenticated;
grant select,insert,update,delete on public.jd_business_budgets to service_role;

-- Consume OAuth state atomically so callbacks cannot be replayed.
create or replace function public.jd_consume_business_oauth_state(p_state_hash text)
returns table(id uuid,school_id uuid,provider_id text,actor_id uuid,pkce_verifier_encrypted bytea,redirect_uri text)
language sql security definer set search_path=''
as $$
 update public.jd_business_oauth_states s set consumed_at=now()
 where s.state_hash=p_state_hash and s.consumed_at is null and s.expires_at>now()
 returning s.id,s.school_id,s.provider_id,s.actor_id,s.pkce_verifier_encrypted,s.redirect_uri;
$$;
revoke all on function public.jd_consume_business_oauth_state(text) from public,anon,authenticated;
grant execute on function public.jd_consume_business_oauth_state(text) to service_role;

-- Retain who recorded customer consent and the basis/source supplied by the operator.
alter table public.jd_business_customers add column if not exists consent_updated_by uuid references auth.users(id) on delete set null;
alter table public.jd_business_customers add column if not exists consent_source text not null default '' check(length(consent_source)<=500);

-- Last-known external provider state for alert deduplication and transition history.
create table if not exists public.jd_business_service_states (
 school_id uuid not null references public.schools(id) on delete cascade,
 provider_id text not null references public.jd_business_integration_catalog(id),
 status text not null check(status in ('healthy','degraded','down','unknown')),
 last_error_code text, last_checked_at timestamptz not null default now(), status_changed_at timestamptz not null default now(),
 primary key(school_id,provider_id)
);
alter table public.jd_business_service_states enable row level security;
revoke all on public.jd_business_service_states from anon,authenticated;
grant select,insert,update,delete on public.jd_business_service_states to service_role;
