-- Prevent clients from setting profile role or school identity columns.
begin;
revoke insert (role, school_id), update (role, school_id) on table public.profiles from anon, authenticated;
grant select (id, email, full_name, role, created_at, school_id) on public.profiles to authenticated;
grant insert (id, email, full_name, created_at) on public.profiles to authenticated;
grant update (email, full_name) on public.profiles to authenticated;
commit;