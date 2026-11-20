-- Roll back only an empty commercial billing foundation.
do $$
begin
  if exists(select 1 from public.jd_billing_events limit 1)
    or exists(select 1 from public.jd_billing_webhook_receipts limit 1)
    or exists(select 1 from public.jd_billing_payments limit 1)
    or exists(select 1 from public.jd_billing_invoice_lines limit 1)
    or exists(select 1 from public.jd_billing_invoices limit 1)
    or exists(select 1 from public.jd_billing_subscriptions limit 1) then
    raise exception 'Refusing to drop populated billing records; preserve and migrate data first';
  end if;
end $$;
drop function public.jd_billing_start_trial(uuid,uuid);
drop table public.jd_billing_events;
drop table public.jd_billing_webhook_receipts;
drop table public.jd_billing_payments;
drop table public.jd_billing_invoice_lines;
drop table public.jd_billing_invoices;
drop table public.jd_billing_subscriptions;
drop function public.jd_billing_immutable_event();
