-- Rollback for 20261115164436_jd_revoke_legacy_public_rpcs.sql
grant execute on function public.login_list_schools() to anon;
grant execute on function public.login_lookup_access_settings(uuid) to anon;
grant execute on function public.login_lookup_school_admin(uuid) to anon;
grant execute on function public.hiring_get_thread(text) to anon, authenticated;
grant execute on function public.hiring_post_message(text, text, text) to anon, authenticated;
grant execute on function public.hiring_public_role(text) to anon, authenticated;
grant execute on function public.hiring_public_submit_application(text, text, text, text, text, numeric, text) to anon, authenticated;
