-- Split admin/teacher write privileges from read policies to avoid
-- multiple permissive policies for the same role/command while preserving
-- school and record ownership boundaries.
begin;

drop policy if exists profiles_insert_self on public.profiles;
drop policy if exists profiles_update_self on public.profiles;

drop policy if exists payments_admin_school on public.payments;
drop policy if exists payments_student_own on public.payments;
create policy payments_school_read on public.payments for select to authenticated
  using (school_id = public.auth_school_id() and (public.auth_role() = 'admin' or student_id = public.auth_student_id()));
create policy payments_admin_insert on public.payments for insert to authenticated
  with check (school_id = public.auth_school_id() and public.auth_role() = 'admin');
create policy payments_admin_update on public.payments for update to authenticated
  using (school_id = public.auth_school_id() and public.auth_role() = 'admin')
  with check (school_id = public.auth_school_id() and public.auth_role() = 'admin');
create policy payments_admin_delete on public.payments for delete to authenticated
  using (school_id = public.auth_school_id() and public.auth_role() = 'admin');

drop policy if exists results_admin_school on public.portal_results;
drop policy if exists results_student_own on public.portal_results;
drop policy if exists results_teacher_assigned on public.portal_results;
create policy results_school_read on public.portal_results for select to authenticated
  using (school_id = public.auth_school_id() and (
    public.auth_role() = 'admin'
    or student_id = public.auth_student_id()
    or (public.auth_role() = 'teacher' and exists (
      select 1 from public.teacher_subjects ts
      where ts.teacher_id = public.auth_teacher_id()
        and ts.class_id = portal_results.class_id
        and ts.subject_id = portal_results.subject_id
    ))
  ));
create policy results_staff_insert on public.portal_results for insert to authenticated
  with check (school_id = public.auth_school_id() and (
    public.auth_role() = 'admin'
    or (public.auth_role() = 'teacher' and exists (
      select 1 from public.teacher_subjects ts where ts.teacher_id = public.auth_teacher_id()
        and ts.class_id = portal_results.class_id and ts.subject_id = portal_results.subject_id
    ))
  ));
create policy results_staff_update on public.portal_results for update to authenticated
  using (school_id = public.auth_school_id() and (
    public.auth_role() = 'admin'
    or (public.auth_role() = 'teacher' and exists (
      select 1 from public.teacher_subjects ts where ts.teacher_id = public.auth_teacher_id()
        and ts.class_id = portal_results.class_id and ts.subject_id = portal_results.subject_id
    ))
  ))
  with check (school_id = public.auth_school_id() and (
    public.auth_role() = 'admin'
    or (public.auth_role() = 'teacher' and exists (
      select 1 from public.teacher_subjects ts where ts.teacher_id = public.auth_teacher_id()
        and ts.class_id = portal_results.class_id and ts.subject_id = portal_results.subject_id
    ))
  ));
create policy results_staff_delete on public.portal_results for delete to authenticated
  using (school_id = public.auth_school_id() and (
    public.auth_role() = 'admin'
    or (public.auth_role() = 'teacher' and exists (
      select 1 from public.teacher_subjects ts where ts.teacher_id = public.auth_teacher_id()
        and ts.class_id = portal_results.class_id and ts.subject_id = portal_results.subject_id
    ))
  ));

drop policy if exists report_templates_school_read on public.report_templates;
drop policy if exists report_templates_school_admin_write on public.report_templates;
create policy report_templates_school_read on public.report_templates for select to authenticated
  using (school_id = public.auth_school_id());
create policy report_templates_admin_insert on public.report_templates for insert to authenticated
  with check (school_id = public.auth_school_id() and public.auth_role() = 'admin');
create policy report_templates_admin_update on public.report_templates for update to authenticated
  using (school_id = public.auth_school_id() and public.auth_role() = 'admin')
  with check (school_id = public.auth_school_id() and public.auth_role() = 'admin');
create policy report_templates_admin_delete on public.report_templates for delete to authenticated
  using (school_id = public.auth_school_id() and public.auth_role() = 'admin');

drop policy if exists result_approvals_school_admin on public.result_approvals;
drop policy if exists result_approvals_form_teacher_read on public.result_approvals;
drop policy if exists result_approvals_form_teacher_insert on public.result_approvals;
drop policy if exists result_approvals_form_teacher_update on public.result_approvals;
create policy result_approvals_school_read on public.result_approvals for select to authenticated
  using (school_id = public.auth_school_id() and (
    public.auth_role() = 'admin'
    or (public.auth_role() = 'teacher' and exists (
      select 1 from public.class_teachers ct where ct.class_id = result_approvals.class_id
        and ct.teacher_id = public.auth_teacher_id() and ct.is_form_teacher = true
    ))
  ));
create policy result_approvals_staff_insert on public.result_approvals for insert to authenticated
  with check (school_id = public.auth_school_id() and (
    public.auth_role() = 'admin'
    or (public.auth_role() = 'teacher' and exists (
      select 1 from public.class_teachers ct where ct.class_id = result_approvals.class_id
        and ct.teacher_id = public.auth_teacher_id() and ct.is_form_teacher = true
    ))
  ));
create policy result_approvals_staff_update on public.result_approvals for update to authenticated
  using (school_id = public.auth_school_id() and (
    public.auth_role() = 'admin'
    or (public.auth_role() = 'teacher' and exists (
      select 1 from public.class_teachers ct where ct.class_id = result_approvals.class_id
        and ct.teacher_id = public.auth_teacher_id() and ct.is_form_teacher = true
    ))
  ))
  with check (school_id = public.auth_school_id() and (
    public.auth_role() = 'admin'
    or (public.auth_role() = 'teacher' and exists (
      select 1 from public.class_teachers ct where ct.class_id = result_approvals.class_id
        and ct.teacher_id = public.auth_teacher_id() and ct.is_form_teacher = true
    ))
  ));
create policy result_approvals_admin_delete on public.result_approvals for delete to authenticated
  using (school_id = public.auth_school_id() and public.auth_role() = 'admin');

drop policy if exists signatures_school_read on public.signatures;
drop policy if exists signatures_school_admin_write on public.signatures;
create policy signatures_school_read on public.signatures for select to authenticated
  using (school_id = public.auth_school_id());
create policy signatures_admin_insert on public.signatures for insert to authenticated
  with check (school_id = public.auth_school_id() and public.auth_role() = 'admin');
create policy signatures_admin_update on public.signatures for update to authenticated
  using (school_id = public.auth_school_id() and public.auth_role() = 'admin')
  with check (school_id = public.auth_school_id() and public.auth_role() = 'admin');
create policy signatures_admin_delete on public.signatures for delete to authenticated
  using (school_id = public.auth_school_id() and public.auth_role() = 'admin');

drop policy if exists uploaded_files_school_admin on public.uploaded_files;
drop policy if exists uploaded_files_student_own on public.uploaded_files;
create policy uploaded_files_school_read on public.uploaded_files for select to authenticated
  using (exists (
    select 1 from public.students s where s.id = uploaded_files.student_id
      and s.school_id = public.auth_school_id()
      and (public.auth_role() = 'admin' or uploaded_files.student_id = public.auth_student_id())
  ));
create policy uploaded_files_admin_insert on public.uploaded_files for insert to authenticated
  with check (public.auth_role() = 'admin' and exists (
    select 1 from public.students s where s.id = uploaded_files.student_id and s.school_id = public.auth_school_id()
  ));
create policy uploaded_files_admin_update on public.uploaded_files for update to authenticated
  using (public.auth_role() = 'admin' and exists (
    select 1 from public.students s where s.id = uploaded_files.student_id and s.school_id = public.auth_school_id()
  ))
  with check (public.auth_role() = 'admin' and exists (
    select 1 from public.students s where s.id = uploaded_files.student_id and s.school_id = public.auth_school_id()
  ));
create policy uploaded_files_admin_delete on public.uploaded_files for delete to authenticated
  using (public.auth_role() = 'admin' and exists (
    select 1 from public.students s where s.id = uploaded_files.student_id and s.school_id = public.auth_school_id()
  ));

drop policy if exists announcements_school_read on public.announcements;
drop policy if exists announcements_school_staff_write on public.announcements;
create policy announcements_school_read on public.announcements for select to authenticated
  using (school_id = public.auth_school_id());
create policy announcements_staff_insert on public.announcements for insert to authenticated
  with check (school_id = public.auth_school_id() and public.auth_role() in ('admin','teacher'));
create policy announcements_staff_update on public.announcements for update to authenticated
  using (school_id = public.auth_school_id() and public.auth_role() in ('admin','teacher'))
  with check (school_id = public.auth_school_id() and public.auth_role() in ('admin','teacher'));
create policy announcements_staff_delete on public.announcements for delete to authenticated
  using (school_id = public.auth_school_id() and public.auth_role() in ('admin','teacher'));

commit;