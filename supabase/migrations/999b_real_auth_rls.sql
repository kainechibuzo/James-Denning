-- ============================================================================
-- 998_real_auth_rls.sql
--
-- Activates real, per-school, per-role RLS. The ORIGINAL schema already had
-- the right design (profiles -> auth.users, auth_role()/auth_student_id()/
-- auth_teacher_id() helpers) — it just predates multi-tenancy, so none of
-- it checks school_id, and it was never actually connected to a real login
-- (the app did custom plaintext comparison instead of supabase.auth).
--
-- This file: (1) adds school scoping to the identity layer, (2) tightens
-- every "using (true)" placeholder — both the original single-tenant ones
-- and the ones I left as TODOs in tonight's reconstructions — to check
-- school_id, now that auth.uid() will actually be populated by real logins.
--
-- Run this AFTER 999_column_audit_PATCH.sql (needs every table's school_id
-- column to already exist).
-- ============================================================================

-- ── Identity: which school does this authenticated user belong to? ────────
alter table profiles add column if not exists school_id uuid references schools(id) on delete cascade;

create or replace function auth_school_id()
returns uuid language sql security definer stable as $$
  select school_id from profiles where id = auth.uid();
$$;

-- ── Tighten the ORIGINAL single-tenant policies from 001 ──────────────────
-- These predate school_id existing at all, so admin at School A could read
-- School B's data. Drop and recreate every one, scoped.

drop policy if exists "sessions_read" on sessions;
drop policy if exists "sessions_write" on sessions;
create policy "sessions_read"  on sessions for select using (school_id = auth_school_id());
create policy "sessions_write" on sessions for all    using (school_id = auth_school_id() and auth_role() = 'admin');

drop policy if exists "terms_read" on terms;
drop policy if exists "terms_write" on terms;
create policy "terms_read"  on terms for select using (school_id = auth_school_id());
create policy "terms_write" on terms for all    using (school_id = auth_school_id() and auth_role() = 'admin');

drop policy if exists "classes_read" on classes;
drop policy if exists "classes_write" on classes;
create policy "classes_read"  on classes for select using (school_id = auth_school_id());
create policy "classes_write" on classes for all    using (school_id = auth_school_id() and auth_role() = 'admin');

drop policy if exists "subjects_read" on subjects;
drop policy if exists "subjects_write" on subjects;
create policy "subjects_read"  on subjects for select using (school_id = auth_school_id());
create policy "subjects_write" on subjects for all    using (school_id = auth_school_id() and auth_role() = 'admin');

drop policy if exists "class_subjects_read" on class_subjects;
drop policy if exists "class_subjects_write" on class_subjects;
create policy "class_subjects_read"  on class_subjects for select using (school_id = auth_school_id());
create policy "class_subjects_write" on class_subjects for all    using (school_id = auth_school_id() and auth_role() = 'admin');

drop policy if exists "grading_schema_read" on grading_schema;
drop policy if exists "grading_schema_write" on grading_schema;
create policy "grading_schema_read"  on grading_schema for select using (school_id = auth_school_id());
create policy "grading_schema_write" on grading_schema for all    using (school_id = auth_school_id() and auth_role() = 'admin');

drop policy if exists "fee_structures_read" on fee_structures;
drop policy if exists "fee_structures_write" on fee_structures;
create policy "fee_structures_read"  on fee_structures for select using (school_id = auth_school_id());
create policy "fee_structures_write" on fee_structures for all    using (school_id = auth_school_id() and auth_role() = 'admin');

drop policy if exists "teachers_read" on teachers;
drop policy if exists "teachers_write" on teachers;
create policy "teachers_read"  on teachers for select using (school_id = auth_school_id());
create policy "teachers_write" on teachers for all    using (school_id = auth_school_id() and auth_role() = 'admin');

drop policy if exists "ct_read" on class_teachers;
drop policy if exists "ct_write" on class_teachers;
create policy "ct_read"  on class_teachers for select
  using (exists (select 1 from classes c where c.id = class_id and c.school_id = auth_school_id()));
create policy "ct_write" on class_teachers for all
  using (exists (select 1 from classes c where c.id = class_id and c.school_id = auth_school_id()) and auth_role() = 'admin');

drop policy if exists "ts_read" on teacher_subjects;
drop policy if exists "ts_write" on teacher_subjects;
create policy "ts_read"  on teacher_subjects for select
  using (exists (select 1 from teachers t where t.id = teacher_id and t.school_id = auth_school_id()));
create policy "ts_write" on teacher_subjects for all
  using (exists (select 1 from teachers t where t.id = teacher_id and t.school_id = auth_school_id()) and auth_role() in ('admin','teacher'));

drop policy if exists "students_admin" on students;
drop policy if exists "students_self" on students;
create policy "students_admin" on students for all
  using (school_id = auth_school_id() and auth_role() = 'admin');
create policy "students_self"  on students for select
  using (id = auth_student_id());

drop policy if exists "sp_admin" on student_profiles;
drop policy if exists "sp_self" on student_profiles;
create policy "sp_admin" on student_profiles for all
  using (exists (select 1 from students s where s.id = student_id and s.school_id = auth_school_id()) and auth_role() = 'admin');
create policy "sp_self"  on student_profiles for select using (profile_id = auth.uid());

-- profiles: keep original self/admin logic but scope admin's "all" to same school
drop policy if exists "profiles_select" on profiles;
drop policy if exists "profiles_insert" on profiles;
drop policy if exists "profiles_update" on profiles;
create policy "profiles_select" on profiles for select
  using (id = auth.uid() or (auth_role() = 'admin' and school_id = auth_school_id()));
create policy "profiles_insert" on profiles for insert
  with check (id = auth.uid() or auth_role() = 'admin');
create policy "profiles_update" on profiles for update
  using (id = auth.uid() or (auth_role() = 'admin' and school_id = auth_school_id()));

-- ── Tighten every "using (true)" placeholder from tonight's reconstructions ─
-- (role_permissions, user_permissions, and the big 001b batch of 23 tables)
do $$
declare tbl text;
begin
  foreach tbl in array array[
    'role_permissions','user_permissions','academic_calendar','admin_audit_log',
    'cae_traits','cae_ratings','cae_structures','cae_components','portal_cae_results',
    'email_queue','manual_transcripts','manual_transcript_subjects','transcript_drafts',
    'notifications','permission_audit_log','promotion_runs','promotion_decisions',
    'recycle_bin','report_card_publish','school_settings','section_subjects',
    'subject_access_grants','subject_access_requests','timetable_periods','timetable_slots'
  ]
  loop
    -- only tables with a school_id column can be scoped this way; skip
    -- platform_admins (cross-tenant by design) and anything without it.
    if exists (select 1 from information_schema.columns where table_name = tbl and column_name = 'school_id') then
      execute format('drop policy if exists "%s_all" on %I', tbl, tbl);
      execute format('drop policy if exists "%s_school_scoped" on %I', tbl, tbl);
      execute format(
        'create policy "%s_school_scoped" on %I for all using (school_id = auth_school_id())',
        tbl, tbl
      );
    end if;
  end loop;
end $$;

-- platform_admins: cross-tenant by design (your own super-admin access, not
-- school-scoped) — leave as service-role-only, no anon/authenticated policy
-- at all, so it's reachable only via a server-side Edge Function.
drop policy if exists "platform_admins_all" on platform_admins;
alter table platform_admins force row level security;
-- (intentionally: no policy = no access for anon/authenticated roles)

-- schools: a user should only see/update their own school
drop policy if exists "schools_select_own" on schools;
drop policy if exists "schools_update_own" on schools;
create policy "schools_select_own" on schools for select using (id = auth_school_id());
create policy "schools_update_own" on schools for update using (id = auth_school_id() and auth_role() = 'admin');
