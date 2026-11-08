-- close_unprotected_finance_and_requests
alter function public.update_updated_at_column() set search_path = public, pg_temp;
create policy fee_refunds_school_admin_access
  on public.fee_refunds for all to authenticated
  using (school_id = public.auth_school_id() and public.auth_role() = 'admin')
  with check (school_id = public.auth_school_id() and public.auth_role() = 'admin');
create policy student_requests_school_admin_access
  on public.student_requests for all to authenticated
  using (school_id = public.auth_school_id() and public.auth_role() = 'admin')
  with check (school_id = public.auth_school_id() and public.auth_role() = 'admin');
