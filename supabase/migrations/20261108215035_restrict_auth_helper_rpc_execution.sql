-- Restrict identity helper RPCs to signed-in application users.
-- RLS policies still invoke these as the authenticated caller; service-role
-- operations retain explicit access. No public login/hiring RPCs are changed.
REVOKE ALL ON FUNCTION public.auth_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.auth_school_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.auth_student_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.auth_teacher_id() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.auth_role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auth_school_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auth_student_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auth_teacher_id() TO authenticated, service_role;
