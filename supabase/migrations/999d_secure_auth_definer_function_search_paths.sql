-- Pin a trusted search_path on the auth/login SECURITY DEFINER functions.
-- These functions are intentionally callable by authenticated users (and
-- selected login lookup functions by anon); a fixed search_path prevents
-- object-shadowing attacks during SECURITY DEFINER execution.

alter function public.auth_school_id() set search_path = public, pg_temp;
alter function public.login_list_schools() set search_path = public, pg_temp;
alter function public.login_lookup_access_settings(uuid) set search_path = public, pg_temp;
alter function public.login_lookup_school_admin(uuid) set search_path = public, pg_temp;
alter function public.login_lookup_student(uuid, text) set search_path = public, pg_temp;
alter function public.login_lookup_teacher(uuid, text) set search_path = public, pg_temp;
