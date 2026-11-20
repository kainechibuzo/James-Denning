-- Roll back only the atomic finalisation routine; preserve billing data.
drop index if exists public.jd_billing_invoice_lines_one_platform_per_invoice;
revoke all on function public.jd_billing_finalize_payment(uuid,text,bigint,text,timestamptz,text,uuid,uuid)
  from public, anon, authenticated, service_role;
drop function public.jd_billing_finalize_payment(uuid,text,bigint,text,timestamptz,text,uuid,uuid);
