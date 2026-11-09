-- Tighten profile ownership and tenant boundaries for sensitive school data.
begin;

drop policy if exists profiles_insert on public.profiles;
drop policy if exists profiles_update on public.profiles;
create policy profiles_insert_self on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()) and role = 'student' and school_id is null);
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (
    id = (select auth.uid())
    and role = (select p.role from public.profiles p where p.id = (select auth.uid()))
    and school_id is not distinct from (select p.school_id from public.profiles p where p.id = (select auth.uid()))
  );

drop policy if exists payments_admin on public.payments;
drop policy if exists payments_student on public.payments;
create policy payments_admin_school on public.payments for all to authenticated
  using (school_id = public.auth_school_id() and public.auth_role() = 'admin')
  with check (school_id = public.auth_school_id() and public.auth_role() = 'admin');
create policy payments_student_own on public.payments for select to authenticated
  using (school_id = public.auth_school_id() and student_id = public.auth_student_id());

drop policy if exists results_admin on public.portal_results;
drop policy if exists results_student on public.portal_results;
drop policy if exists results_teacher on public.portal_results;
create policy results_admin_school on public.portal_results for all to authenticated
  using (school_id = public.auth_school_id() and public.auth_role() = 'admin')
  with check (school_id = public.auth_school_id() and public.auth_role() = 'admin');
create policy results_student_own on public.portal_results for select to authenticated
  using (school_id = public.auth_school_id() and student_id = public.auth_student_id());
create policy results_teacher_assigned on public.portal_results for all to authenticated
  using (school_id = public.auth_school_id() and public.auth_role() = 'teacher' and exists (
    select 1 from public.teacher_subjects ts where ts.teacher_id = public.auth_teacher_id()
      and ts.class_id = portal_results.class_id and ts.subject_id = portal_results.subject_id
  ))
  with check (school_id = public.auth_school_id() and public.auth_role() = 'teacher' and exists (
    select 1 from public.teacher_subjects ts where ts.teacher_id = public.auth_teacher_id()
      and ts.class_id = portal_results.class_id and ts.subject_id = portal_results.subject_id
  ));

drop policy if exists rt_admin on public.report_templates;
drop policy if exists rt_read on public.report_templates;
create policy report_templates_school_read on public.report_templates for select to authenticated
  using (school_id = public.auth_school_id());
create policy report_templates_school_admin_write on public.report_templates for all to authenticated
  using (school_id = public.auth_school_id() and public.auth_role() = 'admin')
  with check (school_id = public.auth_school_id() and public.auth_role() = 'admin');

drop policy if exists ra_admin on public.result_approvals;
drop policy if exists ra_teacher_ea on public.result_approvals;
drop policy if exists ra_teacher_ea_insert on public.result_approvals;
drop policy if exists ra_teacher_read on public.result_approvals;
create policy result_approvals_school_admin on public.result_approvals for all to authenticated
  using (school_id = public.auth_school_id() and public.auth_role() = 'admin')
  with check (school_id = public.auth_school_id() and public.auth_role() = 'admin');
create policy result_approvals_form_teacher_read on public.result_approvals for select to authenticated
  using (school_id = public.auth_school_id() and public.auth_role() = 'teacher' and exists (
    select 1 from public.class_teachers ct where ct.class_id = result_approvals.class_id
      and ct.teacher_id = public.auth_teacher_id() and ct.is_form_teacher = true
  ));
create policy result_approvals_form_teacher_insert on public.result_approvals for insert to authenticated
  with check (school_id = public.auth_school_id() and public.auth_role() = 'teacher' and exists (
    select 1 from public.class_teachers ct where ct.class_id = result_approvals.class_id
      and ct.teacher_id = public.auth_teacher_id() and ct.is_form_teacher = true
  ));
create policy result_approvals_form_teacher_update on public.result_approvals for update to authenticated
  using (school_id = public.auth_school_id() and public.auth_role() = 'teacher' and exists (
    select 1 from public.class_teachers ct where ct.class_id = result_approvals.class_id
      and ct.teacher_id = public.auth_teacher_id() and ct.is_form_teacher = true
  ))
  with check (school_id = public.auth_school_id() and public.auth_role() = 'teacher' and exists (
    select 1 from public.class_teachers ct where ct.class_id = result_approvals.class_id
      and ct.teacher_id = public.auth_teacher_id() and ct.is_form_teacher = true
  ));

drop policy if exists sig_admin on public.signatures;
drop policy if exists sig_read on public.signatures;
create policy signatures_school_read on public.signatures for select to authenticated
  using (school_id = public.auth_school_id());
create policy signatures_school_admin_write on public.signatures for all to authenticated
  using (school_id = public.auth_school_id() and public.auth_role() = 'admin')
  with check (school_id = public.auth_school_id() and public.auth_role() = 'admin');

-- uploaded_files has no school_id in the production schema; scope via students.
drop policy if exists uf_admin on public.uploaded_files;
drop policy if exists uf_student on public.uploaded_files;
create policy uploaded_files_school_admin on public.uploaded_files for all to authenticated
  using (public.auth_role() = 'admin' and exists (
    select 1 from public.students s where s.id = uploaded_files.student_id and s.school_id = public.auth_school_id()
  ))
  with check (public.auth_role() = 'admin' and exists (
    select 1 from public.students s where s.id = uploaded_files.student_id and s.school_id = public.auth_school_id()
  ));
create policy uploaded_files_student_own on public.uploaded_files for select to authenticated
  using (student_id = public.auth_student_id() and exists (
    select 1 from public.students s where s.id = uploaded_files.student_id and s.school_id = public.auth_school_id()
  ));

drop policy if exists ann_read on public.announcements;
drop policy if exists ann_write on public.announcements;
create policy announcements_school_read on public.announcements for select to authenticated
  using (school_id = public.auth_school_id());
create policy announcements_school_staff_write on public.announcements for all to authenticated
  using (school_id = public.auth_school_id() and public.auth_role() in ('admin','teacher'))
  with check (school_id = public.auth_school_id() and public.auth_role() in ('admin','teacher'));

commit;