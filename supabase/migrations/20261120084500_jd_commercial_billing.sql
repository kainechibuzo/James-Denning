-- Commercial SaaS billing foundation.
-- Storage and idempotency primitives only: no checkout, invoice issuance, charge,
-- subscription activation, or automatic employee billing is enabled by this migration.
-- All amounts are USD minor units unless a column explicitly says microdollars.

create table public.jd_billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null unique references public.schools(id) on delete restrict,
  provider text not null default 'paystack' check (provider = 'paystack'),
  plan_key text not null default 'platform_monthly_v1',
  status text not null default 'trialing'
    check (status in ('trialing','checkout_required','active','past_due','cancelled','expired','incomplete')),
  currency text not null default 'USD' check (currency = 'USD'),
  amount_minor bigint not null default 1900 check (amount_minor >= 0),
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  provider_customer_code text,
  provider_plan_code text,
  provider_subscription_code text,
  next_payment_at timestamptz,
  last_payment_at timestamptz,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (trial_ends_at is null or trial_started_at is not null and trial_ends_at > trial_started_at),
  unique(provider, provider_subscription_code)
);

create table public.jd_billing_invoices (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  invoice_number text not null,
  idempotency_key uuid not null,
  currency text not null default 'USD' check (currency = 'USD'),
  status text not null default 'draft'
    check (status in ('draft','open','paid','past_due','void','uncollectible')),
  period_start timestamptz,
  period_end timestamptz,
  issued_at timestamptz,
  due_at timestamptz,
  subtotal_minor bigint not null default 0 check (subtotal_minor >= 0),
  tax_minor bigint not null default 0 check (tax_minor >= 0),
  total_minor bigint not null default 0 check (total_minor >= 0),
  paid_minor bigint not null default 0 check (paid_minor >= 0 and paid_minor <= total_minor),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(school_id, invoice_number),
  unique(school_id, idempotency_key),
  check (period_end is null or period_start is not null and period_end > period_start)
);

create table public.jd_billing_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  invoice_id uuid not null references public.jd_billing_invoices(id) on delete restrict,
  line_type text not null check (line_type in ('platform_subscription','employee_usage','adjustment')),
  description text not null check (length(trim(description)) between 1 and 500),
  quantity_micros bigint not null default 1 check (quantity_micros >= 0),
  unit_amount_micros bigint not null default 0 check (unit_amount_micros >= 0),
  amount_minor bigint not null check (amount_minor >= 0),
  source_usage_job_id uuid,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  check ((line_type = 'employee_usage' and source_usage_job_id is not null) or line_type <> 'employee_usage')
);
create unique index jd_billing_one_usage_line_per_job
  on public.jd_billing_invoice_lines(school_id, source_usage_job_id)
  where source_usage_job_id is not null;
create index jd_billing_invoice_lines_invoice
  on public.jd_billing_invoice_lines(school_id, invoice_id);

create table public.jd_billing_payments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  invoice_id uuid references public.jd_billing_invoices(id) on delete restrict,
  provider text not null default 'paystack' check (provider = 'paystack'),
  provider_reference text not null,
  request_id uuid not null,
  checkout_url text,
  checkout_expires_at timestamptz,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null default 'USD' check (currency = 'USD'),
  status text not null default 'pending'
    check (status in ('pending','succeeded','failed','reversed','refunded')),
  provider_customer_code text,
  paid_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, provider_reference),
  unique(school_id, request_id)
);
create index jd_billing_payments_invoice on public.jd_billing_payments(school_id, invoice_id, created_at desc);

create table public.jd_billing_webhook_receipts (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'paystack' check (provider = 'paystack'),
  event_key text not null,
  event_type text not null,
  provider_reference text,
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'received' check (status in ('received','processed','ignored','failed')),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error_code text,
  unique(provider, event_key)
);
create index jd_billing_webhook_pending
  on public.jd_billing_webhook_receipts(status, received_at)
  where status in ('received','failed');

create table public.jd_billing_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  request_id uuid not null default gen_random_uuid(),
  source_webhook_receipt_id uuid references public.jd_billing_webhook_receipts(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  event_json jsonb not null default '{}'::jsonb check (jsonb_typeof(event_json) = 'object'),
  created_at timestamptz not null default now()
);
create unique index jd_billing_events_request on public.jd_billing_events(school_id, request_id);
create unique index jd_billing_events_webhook_receipt
  on public.jd_billing_events(source_webhook_receipt_id)
  where source_webhook_receipt_id is not null;
create index jd_billing_events_scope on public.jd_billing_events(school_id, created_at desc);

-- One-time 3-day trial. A tenant can never restart or extend it by replaying requests.
create function public.jd_billing_start_trial(p_actor_id uuid, p_request_id uuid)
returns jsonb
language plpgsql security invoker set search_path='' as $billing$
declare
  tenant uuid;
  s public.jd_billing_subscriptions%rowtype;
  prior public.jd_billing_events%rowtype;
  affected integer := 0;
  result jsonb;
  event_name text;
  now_at timestamptz := clock_timestamp();
begin
  if p_actor_id is null or p_request_id is null then
    raise exception 'Actor and request identifiers are required' using errcode='22023';
  end if;
  select school_id into tenant from public.profiles
    where id=p_actor_id and role in ('owner','admin');
  if tenant is null then
    raise exception 'Workspace owner permission required' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(tenant::text,20261120));
  select * into prior from public.jd_billing_events
    where school_id=tenant and request_id=p_request_id;
  if found then return prior.event_json; end if;

  insert into public.jd_billing_subscriptions
    (school_id,provider,plan_key,status,currency,amount_minor,trial_started_at,trial_ends_at)
  values
    (tenant,'paystack','platform_monthly_v1','trialing','USD',1900,now_at,now_at+interval '3 days')
  on conflict (school_id) do nothing;
  get diagnostics affected = row_count;
  select * into s from public.jd_billing_subscriptions where school_id=tenant;
  if not found then raise exception 'Billing subscription state unavailable' using errcode='40001'; end if;

  event_name := case when affected=1 then 'subscription.trial_started' else 'subscription.trial_start_reused' end;
  result := jsonb_build_object(
    'created',affected=1,
    'status',case when s.status='trialing' and s.trial_ends_at<=now_at then 'checkout_required' else s.status end,
    'plan_key',s.plan_key,'currency',s.currency,'amount_minor',s.amount_minor,
    'trial_started_at',s.trial_started_at,'trial_ends_at',s.trial_ends_at,
    'next_payment_at',s.next_payment_at,'charged',false
  );
  insert into public.jd_billing_events(school_id,actor_id,request_id,event_type,event_json)
    values(tenant,p_actor_id,p_request_id,event_name,result);
  return result;
end;
$billing$;

create function public.jd_billing_immutable_event() returns trigger
language plpgsql set search_path='' as $$
begin
  raise exception 'Billing events are immutable' using errcode='55000';
end;
$$;
create trigger jd_billing_event_immutable
  before update or delete on public.jd_billing_events
  for each row execute function public.jd_billing_immutable_event();

alter table public.jd_billing_subscriptions enable row level security;
alter table public.jd_billing_invoices enable row level security;
alter table public.jd_billing_invoice_lines enable row level security;
alter table public.jd_billing_payments enable row level security;
alter table public.jd_billing_webhook_receipts enable row level security;
alter table public.jd_billing_events enable row level security;

revoke all on public.jd_billing_subscriptions, public.jd_billing_invoices,
  public.jd_billing_invoice_lines, public.jd_billing_payments,
  public.jd_billing_webhook_receipts, public.jd_billing_events
  from public, anon, authenticated;
grant select, insert, update, delete on public.jd_billing_subscriptions,
  public.jd_billing_invoices, public.jd_billing_invoice_lines,
  public.jd_billing_payments, public.jd_billing_webhook_receipts,
  public.jd_billing_events to service_role;
revoke update, delete on public.jd_billing_events from service_role;

revoke all on function public.jd_billing_immutable_event() from public, anon, authenticated, service_role;
revoke all on function public.jd_billing_start_trial(uuid,uuid) from public, anon, authenticated;
grant execute on function public.jd_billing_start_trial(uuid,uuid) to service_role;

comment on table public.jd_billing_subscriptions is
  'Tenant SaaS subscription state. Initial USD 19/month and 3-day trial are product defaults; status is not activated by a browser callback.';
comment on table public.jd_billing_invoices is
  'Immutable-in-practice invoice records; issue/void transitions must be server-authorised and idempotent.';
comment on table public.jd_billing_invoice_lines is
  'Invoice lines in USD cents. Employee usage lines require a source job and must be derived only from trusted, reconciled usage.';
comment on table public.jd_billing_payments is
  'Paystack payment references verified server-to-server; browser success redirects are never proof of payment.';
comment on table public.jd_billing_webhook_receipts is
  'Webhook idempotency receipts; raw card/payment payloads are intentionally not retained.';
comment on table public.jd_billing_events is
  'Append-only tenant-scoped audit trail for subscription, invoice and payment lifecycle events.';
