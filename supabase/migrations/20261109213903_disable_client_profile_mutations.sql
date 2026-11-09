-- Account/profile writes must flow through trusted server-side account actions.
-- Edge Functions use service_role; browser roles remain read-only.
begin;
revoke insert, update, delete on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
commit;