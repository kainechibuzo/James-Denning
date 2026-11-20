-- Make Paystack payment finalisation atomic across payment, subscription, invoice and audit state.
create unique index if not exists jd_billing_invoice_lines_one_platform_per_invoice
  on public.jd_billing_invoice_lines(school_id,invoice_id)
  where line_type='platform_subscription';

-- Only the authenticated billing Edge Functions may invoke this service-role RPC.
create or replace function public.jd_billing_finalize_payment(
  p_school_id uuid,
  p_reference text,
  p_amount_minor bigint,
  p_currency text,
  p_paid_at timestamptz,
  p_customer_code text default null,
  p_actor_id uuid default null,
  p_source_webhook_receipt_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $billing$
declare
  payment public.jd_billing_payments%rowtype;
  subscription public.jd_billing_subscriptions%rowtype;
  invoice public.jd_billing_invoices%rowtype;
  invoice_number text;
  effective_paid_at timestamptz := coalesce(p_paid_at, clock_timestamp());
begin
  if p_school_id is null or p_reference is null or length(trim(p_reference))=0
     or p_amount_minor is null or p_amount_minor<=0
     or p_currency is null or p_currency<>'USD' then
    raise exception 'Invalid verified payment details' using errcode='22023';
  end if;

  select * into payment from public.jd_billing_payments
    where school_id=p_school_id and provider='paystack' and provider_reference=p_reference
    for update;
  if not found then
    raise exception 'Billing payment reference not found' using errcode='P0002';
  end if;

  if payment.amount_minor<>p_amount_minor or payment.currency<>p_currency then
    raise exception 'Verified payment amount or currency mismatch' using errcode='22023';
  end if;

  if payment.status='succeeded' then
    return jsonb_build_object('verified',true,'status','succeeded','reused',true,'reference',p_reference);
  end if;
  if payment.status<>'pending' then
    raise exception 'Payment is not eligible for finalisation' using errcode='55000';
  end if;

  select * into subscription from public.jd_billing_subscriptions
    where school_id=p_school_id for update;
  if not found then
    raise exception 'Billing subscription not found' using errcode='P0002';
  end if;

  if p_source_webhook_receipt_id is not null and not exists (
    select 1 from public.jd_billing_webhook_receipts
      where id=p_source_webhook_receipt_id and provider='paystack'
  ) then
    raise exception 'Webhook receipt not found' using errcode='22023';
  end if;

  invoice_number := 'JD-' || to_char(effective_paid_at at time zone 'UTC','YYYYMM') ||
    '-' || upper(replace(payment.id::text,'-',''));
  insert into public.jd_billing_invoices(
    school_id,invoice_number,idempotency_key,currency,status,
    period_start,period_end,issued_at,due_at,
    subtotal_minor,tax_minor,total_minor,paid_minor
  ) values (
    p_school_id,invoice_number,payment.id,p_currency,'paid',
    effective_paid_at,effective_paid_at+interval '1 month',
    effective_paid_at,effective_paid_at,
    p_amount_minor,0,p_amount_minor,p_amount_minor
  )
  on conflict (school_id,idempotency_key) do nothing
  returning * into invoice;
  if not found then
    select * into invoice from public.jd_billing_invoices
      where school_id=p_school_id and idempotency_key=payment.id;
  end if;
  if invoice.id is null then
    raise exception 'Could not persist the paid invoice' using errcode='40001';
  end if;

  insert into public.jd_billing_invoice_lines(
    school_id,invoice_id,line_type,description,quantity_micros,
    unit_amount_micros,amount_minor,metadata
  ) values (
    p_school_id,invoice.id,'platform_subscription','James-Denning monthly platform subscription',
    1000000,p_amount_minor*10000,p_amount_minor,
    jsonb_build_object('payment_reference',p_reference,'period_start',effective_paid_at,'period_end',effective_paid_at+interval '1 month')
  )
  on conflict do nothing;

  update public.jd_billing_payments set
    status='succeeded',
    invoice_id=invoice.id,
    paid_at=effective_paid_at,
    verified_at=clock_timestamp(),
    provider_customer_code=coalesce(p_customer_code,provider_customer_code),
    updated_at=clock_timestamp()
  where id=payment.id;

  update public.jd_billing_subscriptions set
    status='active',
    provider_customer_code=coalesce(p_customer_code,provider_customer_code),
    current_period_start=effective_paid_at,
    current_period_end=effective_paid_at+interval '1 month',
    last_payment_at=effective_paid_at,
    updated_at=clock_timestamp(),
    version=version+1
  where school_id=p_school_id;

  insert into public.jd_billing_events(
    school_id,actor_id,source_webhook_receipt_id,event_type,event_json
  ) values (
    p_school_id,p_actor_id,p_source_webhook_receipt_id,
    case when p_source_webhook_receipt_id is null then 'payment.verified' else 'payment.webhook_verified' end,
    jsonb_build_object('provider','paystack','reference',p_reference,'amount_minor',p_amount_minor,'currency',p_currency)
  );
  insert into public.jd_billing_events(
    school_id,event_type,event_json
  ) values (
    p_school_id,'invoice.paid',
    jsonb_build_object('invoice_id',invoice.id,'invoice_number',invoice.invoice_number,
      'payment_reference',p_reference,'amount_minor',p_amount_minor,'currency',p_currency)
  );

  return jsonb_build_object('verified',true,'status','succeeded','reused',false,'reference',p_reference,'paid_at',effective_paid_at);
end;
$billing$;

revoke all on function public.jd_billing_finalize_payment(uuid,text,bigint,text,timestamptz,text,uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.jd_billing_finalize_payment(uuid,text,bigint,text,timestamptz,text,uuid,uuid)
  to service_role;

-- Persist a provider-confirmed cancellation and its audit event atomically.
create or replace function public.jd_billing_mark_subscription_cancelled(
  p_school_id uuid,
  p_actor_id uuid,
  p_subscription_code text
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $cancel$
declare
  subscription public.jd_billing_subscriptions%rowtype;
begin
  if p_school_id is null or p_actor_id is null or p_subscription_code is null or length(trim(p_subscription_code))=0 then
    raise exception 'Workspace, actor and subscription identifiers are required' using errcode='22023';
  end if;

  select * into subscription from public.jd_billing_subscriptions
    where school_id=p_school_id for update;
  if not found or subscription.provider_subscription_code is distinct from p_subscription_code then
    raise exception 'Provider subscription does not belong to this workspace' using errcode='42501';
  end if;

  if subscription.status='cancelled' then
    return jsonb_build_object('cancelled',true,'reused',true,'current_period_end',subscription.current_period_end);
  end if;
  if subscription.status not in ('active','past_due') then
    raise exception 'Subscription is not eligible for cancellation' using errcode='55000';
  end if;

  update public.jd_billing_subscriptions set
    status='cancelled',
    cancel_at_period_end=false,
    next_payment_at=null,
    updated_at=clock_timestamp(),
    version=version+1
  where school_id=p_school_id;

  insert into public.jd_billing_events(school_id,actor_id,event_type,event_json)
    values(p_school_id,p_actor_id,'subscription.cancelled',
      jsonb_build_object('provider','paystack','subscription_code',p_subscription_code,
        'access_period_end',subscription.current_period_end));

  return jsonb_build_object('cancelled',true,'reused',false,'current_period_end',subscription.current_period_end);
end;
$cancel$;

revoke all on function public.jd_billing_mark_subscription_cancelled(uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.jd_billing_mark_subscription_cancelled(uuid,uuid,text)
  to service_role;
