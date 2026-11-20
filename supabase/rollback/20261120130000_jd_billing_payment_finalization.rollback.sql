-- Roll back only the atomic finalisation routine; preserve billing data.
revoke all on function public.jd_billing_finalize_payment(uuid,text,bigint,text,timestamptz,text,uuid,uuid)
  from public, anon, authenticated, service_role;
drop function public.jd_billing_finalize_payment(uuid,text,bigint,text,timestamptz,text,uuid,uuid);
