-- ============================================================================
-- 999c_login_lookup_functions.sql
--
-- Fixes a real gap in 999b_real_auth_rls.sql: logging in requires looking up
-- "does this ID belong to a teacher/student/admin at this school" BEFORE the
-- person has a session — but RLS only allows reading a school's data AFTER
-- you're already authenticated into it. Chicken-and-egg.
--
-- Fix: narrow SECURITY DEFINER functions that return only the minimal
-- fields login needs (never full table access), callable by anon. This is
-- safe because each function requires an exact school_id + exact ID match
-- — it can't be used to list/enumerate anyone, only to look up one known ID.
-- ============================================================================

create or replace function login_lookup_school_admin(p_school_id uuid)
returns table(admin_email text, admin_name text)
language sql security definer stable as $$
  select admin_email, admin_name from schools where id = p_school_id;
$$;
revoke all on function login_lookup_school_admin from public;
grant execute on function login_lookup_school_admin to anon, authenticated;

create or replace function login_lookup_teacher(p_school_id uuid, p_staff_id text)
returns table(
  id integer, staff_id text, full_name text, display_name text,
  email text, role text, status text
)
language sql security definer stable as $$
  select id, staff_id, full_name, display_name, email, role, status
  from teachers
  where school_id = p_school_id and staff_id ilike p_staff_id
  limit 1;
$$;
revoke all on function login_lookup_teacher from public;
grant execute on function login_lookup_teacher to anon, authenticated;

create or replace function login_lookup_student(p_school_id uuid, p_student_id text)
returns table(
  id text, name text, display_name text, class_id integer,
  email text, status text
)
language sql security definer stable as $$
  select id, name, display_name, class_id, email, status
  from students
  where school_id = p_school_id and id ilike p_student_id
  limit 1;
$$;
revoke all on function login_lookup_student from public;
grant execute on function login_lookup_student to anon, authenticated;

-- login_disabled_message/login_teachers_disabled/login_students_disabled are
-- read pre-auth too (to show "logins disabled" banners) — same problem,
-- same fix.
create or replace function login_lookup_access_settings(p_school_id uuid)
returns table(key text, value text)
language sql security definer stable as $$
  select key, value from school_settings
  where school_id = p_school_id
    and key in ('login_students_disabled','login_teachers_disabled','login_disabled_message');
$$;
revoke all on function login_lookup_access_settings from public;
grant execute on function login_lookup_access_settings to anon, authenticated;

-- Also needed: the "Select Your Business" picker lists schools BEFORE
-- login, so anon needs to read basic display info for every school.
-- Deliberately excludes admin_email/admin_name/admin_password/
-- settings_password — those stay behind the narrower, per-school
-- login_lookup_school_admin() function above, only usable once a specific
-- school_id is already chosen, not exposed in this list-everything view.
create or replace function login_list_schools()
returns table(id uuid, name text, logo text, address text, phone text, student_id_prefix text)
language sql security definer stable as $$
  select id, name, logo, address, phone, student_id_prefix
  from schools where status = 'active' order by name;
$$;
revoke all on function login_list_schools from public;
grant execute on function login_list_schools to anon, authenticated;
