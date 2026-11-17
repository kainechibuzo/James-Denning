-- Emergency disable, not restoration of the known-broken NULL assignment.
-- Leave task/run/audit/checkpoint records untouched. Disable UI retries first.
-- A reviewed reapply of the migration restores the service-only grant.
revoke all on function public.jd_requeue_failed_execution_job(uuid,uuid) from public,anon,authenticated,service_role;
