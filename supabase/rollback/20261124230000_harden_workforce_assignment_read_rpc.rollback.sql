-- Rollback restores the prior browser-role grants. Apply only if the
-- application has been updated to authenticate and authorize this RPC safely.
begin;
grant execute on function public.jd_read_workforce_assignments(uuid, integer) to authenticated;
grant execute on function public.jd_read_workforce_assignments(uuid, integer) to anon;
alter function public.jd_forbid_workforce_assignment_mutation() reset search_path;
commit;
