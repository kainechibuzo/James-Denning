-- ============================================================================
-- 019_email_login.sql
--
-- Email-based login (Phase 6): find every business (school/org) a person can
-- manage from a single email address, so the app can show a business picker
-- after login.
--
-- Matches the exact deterministic synthetic-auth-email logic used by the
-- client (AppDemo authLogin) and the manage-account edge function:
--   admin   -> the school's real admin_email
--   teacher -> 'staff-' || clean(staff_id) || '--' || school_id || '@login.internal'
--   student -> 'student-' || clean(id)     || '--' || school_id || '@login.internal'
-- where clean(x) = lowercase(x) with all non [a-z0-9] chars removed.
--
-- Purely additive: one SECURITY DEFINER function, no tables, no changes to
-- existing objects. Same revoke/grant pattern as 999c_login_lookup_functions.
-- ============================================================================

create or replace function login_lookup_by_email(p_email text)
returns table(
  school_id     uuid,
  school_name   text,
  role          text,          -- 'admin' | 'teacher' | 'student'
  display_name  text,
  local_id      text,          -- staff_id for teachers, id for students, 'admin'
  auth_email    text,          -- the Supabase Auth email for this identity
  student_status text          -- students.status (null for admin/teacher)
)
language sql security definer stable as $$
  with e as (select lower(trim(p_email)) as email)
  select s.id, s.name, 'admin'::text, s.admin_name,
         'admin'::text, s.admin_email, null::text
  from schools s, e
  where lower(s.admin_email) = e.email
  union all
  select s.id, s.name, 'teacher'::text, t.display_name,
         t.staff_id::text,
         'staff-' || regexp_replace(lower(t.staff_id), '[^a-z0-9]', '', 'g')
           || '--' || s.id || '@login.internal',
         null::text
  from teachers t join schools s on s.id = t.school_id, e
  where lower(t.email) = e.email
  union all
  select s.id, s.name, 'student'::text, st.display_name,
         st.id::text,
         'student-' || regexp_replace(lower(st.id), '[^a-z0-9]', '', 'g')
           || '--' || s.id || '@login.internal',
         st.status::text
  from students st join schools s on s.id = st.school_id, e
  where lower(st.email) = e.email
$$;
revoke all on function login_lookup_by_email(text) from public;
grant execute on function login_lookup_by_email(text) to anon, authenticated;

-- ============================================================================
-- END 019_email_login.sql
-- ============================================================================
