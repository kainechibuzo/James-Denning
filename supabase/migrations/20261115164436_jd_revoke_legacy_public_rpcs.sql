-- Public pre-authentication and careers traffic now goes through bounded Edge Functions.
-- These legacy SECURITY DEFINER RPCs have no remaining application callers.
-- Keep service_role execution for controlled maintenance; revoke exposed API roles.
revoke all on function public.login_list_schools() from public, anon, authenticated;
revoke all on function public.login_lookup_access_settings(uuid) from public, anon, authenticated;
revoke all on function public.login_lookup_school_admin(uuid) from public, anon, authenticated;

revoke all on function public.hiring_get_thread(text) from public, anon, authenticated;
revoke all on function public.hiring_post_message(text, text, text) from public, anon, authenticated;
revoke all on function public.hiring_public_role(text) from public, anon, authenticated;
revoke all on function public.hiring_public_submit_application(text, text, text, text, text, numeric, text) from public, anon, authenticated;

grant execute on function public.login_list_schools() to service_role;
grant execute on function public.login_lookup_access_settings(uuid) to service_role;
grant execute on function public.login_lookup_school_admin(uuid) to service_role;
grant execute on function public.hiring_get_thread(text) to service_role;
grant execute on function public.hiring_post_message(text, text, text) to service_role;
grant execute on function public.hiring_public_role(text) to service_role;
grant execute on function public.hiring_public_submit_application(text, text, text, text, text, numeric, text) to service_role;
