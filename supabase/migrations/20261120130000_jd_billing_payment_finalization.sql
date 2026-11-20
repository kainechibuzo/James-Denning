-- Make Paystack payment finalisation atomic across payment, subscription and audit state.
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

  update public.jd_billing_payments set
    status='succeeded',
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

  return jsonb_build_object('verified',true,'status','succeeded','reused',false,'reference',p_reference,'paid_at',effective_paid_at);
end;
$billing$;

revoke all on function public.jd_billing_finalize_payment(uuid,text,bigint,text,timestamptz,text,uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.jd_billing_finalize_payment(uuid,text,bigint,text,timestamptz,text,uuid)
  to service_role;
