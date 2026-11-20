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
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null default 'USD' check (currency = 'USD'),
  status text not null default 'pending'
    check (status in ('pending','succeeded','failed','reversed','refunded')),
  provider_customer_code text,
  paid_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, provider_reference)
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
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  event_json jsonb not null default '{}'::jsonb check (jsonb_typeof(event_json) = 'object'),
  created_at timestamptz not null default now()
);
create index jd_billing_events_scope on public.jd_billing_events(school_id, created_at desc);

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
