-- Emergency disable only. First disable checked controls in a reviewed release.
-- Do not delete cancellation/audit records or pretend prior effects are undone.
revoke all on function public.jd_cancel_execution_job_checked(uuid,uuid,uuid,timestamptz) from public,anon,authenticated,service_role;
