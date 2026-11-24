-- Restrict tenant-sensitive assignment read-back to trusted server execution.
-- The SECURITY DEFINER RPC accepts an actor UUID, so browser roles must not be
-- able to supply another administrator's UUID and read tenant assignment data.
begin;
revoke all on function public.jd_read_workforce_assignments(uuid, integer) from public, anon, authenticated;
grant execute on function public.jd_read_workforce_assignments(uuid, integer) to service_role;
alter function public.jd_forbid_workforce_assignment_mutation() set search_path = pg_catalog;
commit;
