-- Persist the production scalar-subquery policy rewrites.
-- Predicates are preserved; auth helpers are evaluated as initPlans.
BEGIN;
DROP POLICY IF EXISTS "Admins can manage sections" ON public.sections;
CREATE POLICY "Admins can manage sections" ON public.sections AS PERMISSIVE FOR ALL TO public
USING (((SELECT auth.jwt()) ->> 'user_role') = 'admin' OR EXISTS (
  SELECT 1 FROM public.profiles
  WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = 'admin'
));
DROP POLICY IF EXISTS "Authenticated users can read sections" ON public.sections;
CREATE POLICY "Authenticated users can read sections" ON public.sections AS PERMISSIVE FOR SELECT TO public
USING ((SELECT auth.role()) = 'authenticated');
DROP POLICY IF EXISTS user_permissions_self_or_school_admin_read ON public.user_permissions;
CREATE POLICY user_permissions_self_or_school_admin_read ON public.user_permissions AS PERMISSIVE FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()) OR (
  (SELECT public.auth_role()) = 'admin' AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = user_permissions.user_id AND p.school_id = (SELECT public.auth_school_id())
  )
));
DROP POLICY IF EXISTS permission_audit_log_school_admin_insert ON public.permission_audit_log;
CREATE POLICY permission_audit_log_school_admin_insert ON public.permission_audit_log AS PERMISSIVE FOR INSERT TO authenticated
WITH CHECK ((SELECT public.auth_role()) = 'admin'
  AND admin_id = ((SELECT auth.uid())::text)
  AND EXISTS (SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid()) AND p.school_id = (SELECT public.auth_school_id()) AND p.role = 'admin'
  )
);
DROP POLICY IF EXISTS sp_self ON public.student_profiles;
CREATE POLICY sp_self ON public.student_profiles AS PERMISSIVE FOR SELECT TO public
USING (profile_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles AS PERMISSIVE FOR SELECT TO public
USING (id = (SELECT auth.uid()) OR (
  (SELECT public.auth_role()) = 'admin' AND school_id = (SELECT public.auth_school_id())
));
DROP POLICY IF EXISTS profiles_insert ON public.profiles;
CREATE POLICY profiles_insert ON public.profiles AS PERMISSIVE FOR INSERT TO public
WITH CHECK (id = (SELECT auth.uid()) OR (SELECT public.auth_role()) = 'admin');
DROP POLICY IF EXISTS profiles_update ON public.profiles;
CREATE POLICY profiles_update ON public.profiles AS PERMISSIVE FOR UPDATE TO public
USING (id = (SELECT auth.uid()) OR (
  (SELECT public.auth_role()) = 'admin' AND school_id = (SELECT public.auth_school_id())
))
WITH CHECK (id = (SELECT auth.uid()) OR (
  (SELECT public.auth_role()) = 'admin' AND school_id = (SELECT public.auth_school_id())
));
COMMIT;
