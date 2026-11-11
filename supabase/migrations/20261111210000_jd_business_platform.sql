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

create table if not exists public.jd_business_service_alerts (
 id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id) on delete cascade,
 provider_id text not null references public.jd_business_integration_catalog(id),
 status text not null check(status in ('degraded','down','recovered')),error_code text,
 opened_at timestamptz not null default now(),resolved_at timestamptz,last_notified_at timestamptz
);
create index if not exists jd_business_service_alerts_school_idx on public.jd_business_service_alerts(school_id,opened_at desc);
alter table public.jd_business_service_alerts enable row level security;
revoke all on public.jd_business_service_alerts from anon,authenticated;
grant select,insert,update,delete on public.jd_business_service_alerts to service_role;

-- SLA policy, reliable alert delivery, statement reconciliation and forecast evaluation.
create table if not exists public.jd_business_sla_policies (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
 priority text not null check(priority in ('low','normal','high','urgent')),
 first_response_minutes integer not null check(first_response_minutes between 1 and 43200),
 resolution_minutes integer not null check(resolution_minutes between 1 and 129600),
 escalation_after_minutes integer not null check(escalation_after_minutes between 1 and 129600),
 notify_email text, notify_phone text,
 enabled boolean not null default true, created_by uuid references auth.users(id), created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), unique(school_id,priority)
);
create table if not exists public.jd_business_sla_events (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
 case_id uuid not null references public.jd_business_support_cases(id) on delete cascade,
 event_type text not null check(event_type in ('first_response_due','resolution_due','escalation')),
 due_at timestamptz not null, created_at timestamptz not null default now(), unique(case_id,event_type)
);
create table if not exists public.jd_business_notification_outbox (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
 event_key text not null, channel text not null check(channel in ('email','sms')),
 recipient text not null, subject text not null default '', body text not null,
 payload jsonb not null default '{}'::jsonb, status text not null default 'queued' check(status in ('queued','sent','failed')),
 attempts smallint not null default 0 check(attempts between 0 and 10), last_error text,
 next_attempt_at timestamptz not null default now(), sent_at timestamptz,
 created_at timestamptz not null default now(), unique(school_id,event_key,channel,recipient)
);
create index if not exists jd_business_notification_queue_idx on public.jd_business_notification_outbox(status,next_attempt_at,created_at);
create table if not exists public.jd_business_cash_statement_imports (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
 file_name text not null, currency char(3) not null, row_count integer not null default 0,
 imported_by uuid not null references auth.users(id), imported_at timestamptz not null default now()
);
create table if not exists public.jd_business_cash_statement_rows (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
 import_id uuid not null references public.jd_business_cash_statement_imports(id) on delete cascade,
 occurred_on date not null, direction text not null check(direction in ('inflow','outflow')),
 amount numeric(14,2) not null check(amount>0), currency char(3) not null, reference text, description text not null default '',
 row_fingerprint text not null, reconciliation_status text not null default 'unmatched' check(reconciliation_status in ('unmatched','suggested','matched','ignored')),
 matched_transaction_id uuid references public.jd_business_cash_transactions(id) on delete set null,
 matched_by uuid references auth.users(id), matched_at timestamptz, created_at timestamptz not null default now(),
 unique(import_id,row_fingerprint)
);
create index if not exists jd_business_cash_statement_rows_match_idx on public.jd_business_cash_statement_rows(school_id,currency,occurred_on,amount,reconciliation_status);
create table if not exists public.jd_business_forecast_evaluations (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
 currency char(3) not null, evaluated_at timestamptz not null default now(), training_periods integer not null,
 holdout_periods integer not null, mae numeric(14,4), mape numeric(8,4), baseline_method text not null,
 metrics jsonb not null default '{}'::jsonb, limitations text[] not null default '{}', created_by uuid references auth.users(id)
);
do $$
declare t text;
begin foreach t in array array['jd_business_sla_policies','jd_business_sla_events','jd_business_notification_outbox','jd_business_cash_statement_imports','jd_business_cash_statement_rows','jd_business_forecast_evaluations'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant select,insert,update,delete on public.%I to service_role',t);
end loop;end $$;
create or replace function public.jd_claim_business_notification_batch(p_limit integer default 25)
returns setof public.jd_business_notification_outbox language sql security definer set search_path=''
as $$
 with picked as (
  select id from public.jd_business_notification_outbox
  where status in ('queued','failed') and attempts<10 and next_attempt_at<=now()
  order by created_at for update skip locked limit greatest(1,least(coalesce(p_limit,25),100))
 )
 update public.jd_business_notification_outbox n set attempts=n.attempts+1,status='queued'
 from picked where n.id=picked.id returning n.*;
$$;
revoke all on function public.jd_claim_business_notification_batch(integer) from public,anon,authenticated;
grant execute on function public.jd_claim_business_notification_batch(integer) to service_role;
-- Enable scanned-image uploads; external OCR remains explicitly opt-in at the worker secret layer.
update storage.buckets set allowed_mime_types=array['application/pdf','text/plain','application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/png','image/jpeg','image/tiff']
where id='jd-business-documents';

alter table public.jd_business_support_cases add column if not exists first_response_at timestamptz;
create index if not exists jd_business_support_sla_idx on public.jd_business_support_cases(school_id,status,priority,created_at);

create unique index if not exists jd_business_cash_statement_one_match_idx
 on public.jd_business_cash_statement_rows(school_id,matched_transaction_id)
 where matched_transaction_id is not null;
create or replace function public.jd_reconcile_business_cash_row(p_school_id uuid,p_actor_id uuid,p_statement_row_id uuid,p_transaction_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare s public.jd_business_cash_statement_rows%rowtype; t public.jd_business_cash_transactions%rowtype;
begin
 select * into s from public.jd_business_cash_statement_rows where id=p_statement_row_id and school_id=p_school_id for update;
 if not found then raise exception 'Statement row not found'; end if;
 select * into t from public.jd_business_cash_transactions where id=p_transaction_id and school_id=p_school_id for update;
 if not found then raise exception 'Cash transaction not found'; end if;
 if s.reconciliation_status='matched' or s.matched_transaction_id is not null then raise exception 'Statement row already matched'; end if;
 if exists(select 1 from public.jd_business_cash_statement_rows where school_id=p_school_id and matched_transaction_id=p_transaction_id) then raise exception 'Cash transaction already matched'; end if;
 if s.direction<>t.direction or s.currency<>t.currency or s.amount<>t.amount or abs(s.occurred_on-t.occurred_on)>3 then raise exception 'Statement and cash transaction do not match'; end if;
 update public.jd_business_cash_statement_rows set reconciliation_status='matched',matched_transaction_id=p_transaction_id,matched_by=p_actor_id,matched_at=now() where id=p_statement_row_id;
 update public.jd_business_cash_transactions set status='cleared',updated_at=now() where id=p_transaction_id and school_id=p_school_id;
end;
$$;
revoke all on function public.jd_reconcile_business_cash_row(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.jd_reconcile_business_cash_row(uuid,uuid,uuid,uuid) to service_role;

create table if not exists public.jd_business_report_shares (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
 report_id uuid not null references public.jd_business_reports(id) on delete cascade,
 token_hash text not null unique, expires_at timestamptz not null, revoked_at timestamptz,
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 check(expires_at>created_at)
);
create index if not exists jd_business_report_shares_report_idx on public.jd_business_report_shares(school_id,report_id,expires_at desc);
alter table public.jd_business_report_shares enable row level security;
revoke all on public.jd_business_report_shares from anon,authenticated;
grant select,insert,update,delete on public.jd_business_report_shares to service_role;
