
DROP POLICY IF EXISTS sections_visibility ON public.sections;
CREATE POLICY sections_visibility ON public.sections FOR SELECT TO public
  USING (((SELECT auth.role()) = 'authenticated') OR is_active = true);

DROP POLICY IF EXISTS sections_admin_insert ON public.sections;
CREATE POLICY sections_admin_insert ON public.sections FOR INSERT TO public
  WITH CHECK (((SELECT auth.jwt()) ->> 'user_role' = 'admin') OR EXISTS (
    SELECT 1 FROM public.profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = 'admin'
  ));

DROP POLICY IF EXISTS sections_admin_update ON public.sections;
CREATE POLICY sections_admin_update ON public.sections FOR UPDATE TO public
  USING (((SELECT auth.jwt()) ->> 'user_role' = 'admin') OR EXISTS (
    SELECT 1 FROM public.profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = 'admin'
  ))
  WITH CHECK (((SELECT auth.jwt()) ->> 'user_role' = 'admin') OR EXISTS (
    SELECT 1 FROM public.profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = 'admin'
  ));

DROP POLICY IF EXISTS sections_admin_delete ON public.sections;
CREATE POLICY sections_admin_delete ON public.sections FOR DELETE TO public
  USING (((SELECT auth.jwt()) ->> 'user_role' = 'admin') OR EXISTS (
    SELECT 1 FROM public.profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = 'admin'
  ));
