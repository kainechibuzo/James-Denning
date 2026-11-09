-- Reconciliation checkpoint for the legacy auth/RLS SQL patches.
-- The original 999b/999c scripts were applied before migration history was
-- consistently maintained. Do NOT replay them: verify the live objects and
-- record this checkpoint without changing data or policy behavior.
DO $$
DECLARE
  required_functions text[] := ARRAY[
    'public.auth_role()',
    'public.auth_school_id()',
    'public.auth_student_id()',
    'public.auth_teacher_id()',
    'public.login_list_schools()',
    'public.login_lookup_access_settings(uuid)',
    'public.login_lookup_school_admin(uuid)',
    'public.login_lookup_student(uuid,text)',
    'public.login_lookup_teacher(uuid,text)'
  ];
  item text;
BEGIN
  FOREACH item IN ARRAY required_functions LOOP
    IF to_regprocedure(item) IS NULL THEN
      RAISE EXCEPTION 'Reconciliation failed: required function % is missing', item;
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profiles' AND policyname='profiles_select') THEN
    RAISE EXCEPTION 'Reconciliation failed: profiles_select policy is missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='schools' AND policyname='schools_select_own') THEN
    RAISE EXCEPTION 'Reconciliation failed: schools_select_own policy is missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='hiring_roles' AND policyname='hiring_roles_school_scoped') THEN
    RAISE EXCEPTION 'Reconciliation failed: hiring_roles_school_scoped policy is missing';
  END IF;
END $$;
