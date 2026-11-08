-- 019_access_control_hardening.sql
-- Close legacy public write paths while preserving tenant-scoped application access.
-- Pin search_path on SECURITY DEFINER functions to prevent object-shadowing attacks.

alter function public.auth_role() set search_path = public, pg_temp;
alter function public.auth_school_id() set search_path = public, pg_temp;
alter function public.auth_student_id() set search_path = public, pg_temp;
alter function public.auth_teacher_id() set search_path = public, pg_temp;
alter function public.hiring_get_thread(text) set search_path = public, pg_temp;
alter function public.hiring_post_message(text, text, text) set search_path = public, pg_temp;
alter function public.hiring_public_role(text) set search_path = public, pg_temp;
alter function public.hiring_public_submit_application(text, text, text, text, text, numeric, text) set search_path = public, pg_temp;
alter function public.login_list_schools() set search_path = public, pg_temp;
alter function public.login_lookup_access_settings(uuid) set search_path = public, pg_temp;
alter function public.login_lookup_school_admin(uuid) set search_path = public, pg_temp;
alter function public.login_lookup_student(uuid, text) set search_path = public, pg_temp;
alter function public.login_lookup_teacher(uuid, text) set search_path = public, pg_temp;

drop policy if exists open_all_attendance on public.attendance;
create policy attendance_school_staff_access
  on public.attendance for all to authenticated
  using (school_id = public.auth_school_id() and public.auth_role() in ('admin','teacher'))
  with check (school_id = public.auth_school_id() and public.auth_role() in ('admin','teacher'));

drop policy if exists cae_components_all on public.cae_components;
create policy cae_components_school_staff_access
  on public.cae_components for all to authenticated
  using (
    public.auth_role() in ('admin','teacher')
    and exists (select 1 from public.cae_structures s
      where s.id = cae_components.cae_id and s.school_id = public.auth_school_id())
  )
  with check (
    public.auth_role() in ('admin','teacher')
    and exists (select 1 from public.cae_structures s
      where s.id = cae_components.cae_id and s.school_id = public.auth_school_id())
  );

drop policy if exists manual_transcript_subjects_all on public.manual_transcript_subjects;
create policy manual_transcript_subjects_school_staff_access
  on public.manual_transcript_subjects for all to authenticated
  using (
    public.auth_role() in ('admin','teacher')
    and exists (select 1 from public.manual_transcripts t
      where t.id = manual_transcript_subjects.transcript_id and t.school_id = public.auth_school_id())
  )
  with check (
    public.auth_role() in ('admin','teacher')
    and exists (select 1 from public.manual_transcripts t
      where t.id = manual_transcript_subjects.transcript_id and t.school_id = public.auth_school_id())
  );

drop policy if exists user_permissions_all on public.user_permissions;
create policy user_permissions_self_or_school_admin_read
  on public.user_permissions for select to authenticated
  using (
    user_id = auth.uid()
    or (public.auth_role() = 'admin' and exists (
      select 1 from public.profiles p
      where p.id = user_permissions.user_id and p.school_id = public.auth_school_id()
    ))
  );
create policy user_permissions_school_admin_insert
  on public.user_permissions for insert to authenticated
  with check (
    public.auth_role() = 'admin' and exists (
      select 1 from public.profiles p
      where p.id = user_permissions.user_id and p.school_id = public.auth_school_id()
    )
  );
create policy user_permissions_school_admin_update
  on public.user_permissions for update to authenticated
  using (
    public.auth_role() = 'admin' and exists (
      select 1 from public.profiles p
      where p.id = user_permissions.user_id and p.school_id = public.auth_school_id()
    )
  )
  with check (
    public.auth_role() = 'admin' and exists (
      select 1 from public.profiles p
      where p.id = user_permissions.user_id and p.school_id = public.auth_school_id()
    )
  );
create policy user_permissions_school_admin_delete
  on public.user_permissions for delete to authenticated
  using (
    public.auth_role() = 'admin' and exists (
      select 1 from public.profiles p
      where p.id = user_permissions.user_id and p.school_id = public.auth_school_id()
    )
  );

drop policy if exists permission_audit_log_all on public.permission_audit_log;
create policy permission_audit_log_school_admin_read
  on public.permission_audit_log for select to authenticated
  using (
    public.auth_role() = 'admin' and exists (
      select 1 from public.profiles p
      where p.id::text = permission_audit_log.admin_id
        and p.school_id = public.auth_school_id() and p.role = 'admin'
    )
  );
create policy permission_audit_log_school_admin_insert
  on public.permission_audit_log for insert to authenticated
  with check (
    public.auth_role() = 'admin'
    and admin_id = auth.uid()::text
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.school_id = public.auth_school_id() and p.role = 'admin'
    )
  );
