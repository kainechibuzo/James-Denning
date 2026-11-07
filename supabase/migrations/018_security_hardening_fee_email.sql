-- Production security hardening: fee data and email operations.
-- Anonymous users must never read or mutate financial or mail data.
-- Authenticated users are constrained to their school; student visibility is own-bill only.

begin;

-- Fee bills: students can read their own bills; school staff can read/manage school bills.
drop policy if exists anon_read_fee_bills on public.fee_bills;
drop policy if exists anon_write_fee_bills on public.fee_bills;
create policy fee_bills_read_scoped on public.fee_bills
  for select to authenticated
  using (
    school_id = public.auth_school_id()
    and (
      public.auth_role() in ('admin','teacher')
      or (public.auth_role() = 'student' and student_id = public.auth_student_id())
    )
  );
create policy fee_bills_staff_write on public.fee_bills
  for all to authenticated
  using (school_id = public.auth_school_id() and public.auth_role() = 'admin')
  with check (school_id = public.auth_school_id() and public.auth_role() = 'admin');

-- Payments: students can see their own payment history; only server/service role
-- writes verified online payments. Admins may record offline payments.
drop policy if exists anon_read_fee_payments on public.fee_payments;
drop policy if exists anon_write_fee_payments on public.fee_payments;
create policy fee_payments_read_scoped on public.fee_payments
  for select to authenticated
  using (
    school_id = public.auth_school_id()
    and (
      public.auth_role() in ('admin','teacher')
      or (public.auth_role() = 'student' and student_id = public.auth_student_id())
    )
  );
create policy fee_payments_admin_write on public.fee_payments
  for all to authenticated
  using (school_id = public.auth_school_id() and public.auth_role() = 'admin')
  with check (school_id = public.auth_school_id() and public.auth_role() = 'admin');
create unique index if not exists fee_payments_paystack_reference_uidx
  on public.fee_payments (paystack_reference)
  where paystack_reference is not null and paystack_reference <> '';

-- Fee catalogue and templates are visible only inside the caller's school.
-- Mutations are restricted to school administrators.
drop policy if exists anon_read_fee_items on public.fee_items;
drop policy if exists anon_write_fee_items on public.fee_items;
create policy fee_items_read_scoped on public.fee_items
  for select to authenticated
  using (school_id = public.auth_school_id());
create policy fee_items_admin_write on public.fee_items
  for all to authenticated
  using (school_id = public.auth_school_id() and public.auth_role() = 'admin')
  with check (school_id = public.auth_school_id() and public.auth_role() = 'admin');

drop policy if exists anon_read_fee_templates on public.fee_templates;
drop policy if exists anon_write_fee_templates on public.fee_templates;
create policy fee_templates_read_scoped on public.fee_templates
  for select to authenticated
  using (school_id = public.auth_school_id());
create policy fee_templates_admin_write on public.fee_templates
  for all to authenticated
  using (school_id = public.auth_school_id() and public.auth_role() = 'admin')
  with check (school_id = public.auth_school_id() and public.auth_role() = 'admin');

-- Child rows are scoped through their parent bill/template/item.
drop policy if exists anon_read_fee_bill_items on public.fee_bill_items;
drop policy if exists anon_write_fee_bill_items on public.fee_bill_items;
create policy fee_bill_items_read_scoped on public.fee_bill_items
  for select to authenticated
  using (exists (
    select 1 from public.fee_bills b
    where b.id = fee_bill_items.bill_id
      and b.school_id = public.auth_school_id()
      and (public.auth_role() in ('admin','teacher')
        or (public.auth_role() = 'student' and b.student_id = public.auth_student_id()))
  ));
create policy fee_bill_items_admin_write on public.fee_bill_items
  for all to authenticated
  using (public.auth_role() = 'admin' and exists (
    select 1 from public.fee_bills b where b.id = fee_bill_items.bill_id
      and b.school_id = public.auth_school_id()
  ))
  with check (public.auth_role() = 'admin' and exists (
    select 1 from public.fee_bills b where b.id = fee_bill_items.bill_id
      and b.school_id = public.auth_school_id()
  ));

drop policy if exists anon_read_fee_template_items on public.fee_template_items;
drop policy if exists anon_write_fee_template_items on public.fee_template_items;
create policy fee_template_items_read_scoped on public.fee_template_items
  for select to authenticated
  using (exists (
    select 1 from public.fee_templates t
    where t.id = fee_template_items.template_id and t.school_id = public.auth_school_id()
  ));
create policy fee_template_items_admin_write on public.fee_template_items
  for all to authenticated
  using (public.auth_role() = 'admin' and exists (
    select 1 from public.fee_templates t where t.id = fee_template_items.template_id
      and t.school_id = public.auth_school_id()
  ))
  with check (public.auth_role() = 'admin' and exists (
    select 1 from public.fee_templates t where t.id = fee_template_items.template_id
      and t.school_id = public.auth_school_id()
  ));

drop policy if exists anon_all_fee_discounts on public.fee_discounts;
create policy fee_discounts_read_scoped on public.fee_discounts
  for select to authenticated
  using (school_id = public.auth_school_id()
    and (public.auth_role() in ('admin','teacher')
      or (public.auth_role() = 'student' and student_id = public.auth_student_id())));
create policy fee_discounts_admin_write on public.fee_discounts
  for all to authenticated
  using (school_id = public.auth_school_id() and public.auth_role() = 'admin')
  with check (school_id = public.auth_school_id() and public.auth_role() = 'admin');

drop policy if exists anon_all_fee_audit on public.fee_audit_log;
create policy fee_audit_admin_read on public.fee_audit_log
  for select to authenticated
  using (school_id = public.auth_school_id() and public.auth_role() = 'admin');

-- Email queue processing and template management are admin-only and school-scoped.
drop policy if exists email_queue_school_scoped on public.email_queue;
create policy email_queue_admin_select on public.email_queue
  for select to authenticated
  using (school_id = public.auth_school_id() and public.auth_role() = 'admin');
create policy email_queue_admin_insert on public.email_queue
  for insert to authenticated
  with check (school_id = public.auth_school_id() and public.auth_role() = 'admin');
create policy email_queue_admin_update on public.email_queue
  for update to authenticated
  using (school_id = public.auth_school_id() and public.auth_role() = 'admin')
  with check (school_id = public.auth_school_id() and public.auth_role() = 'admin');
create policy email_queue_admin_delete on public.email_queue
  for delete to authenticated
  using (school_id = public.auth_school_id() and public.auth_role() = 'admin');

drop policy if exists open_all_email_logs on public.email_logs;
create policy email_logs_admin_read on public.email_logs
  for select to authenticated
  using (school_id = public.auth_school_id() and public.auth_role() = 'admin');
create policy email_logs_admin_insert on public.email_logs
  for insert to authenticated
  with check (school_id = public.auth_school_id() and public.auth_role() = 'admin');

drop policy if exists open_all_email_templates on public.email_templates;
create policy email_templates_admin_all on public.email_templates
  for all to authenticated
  using (school_id = public.auth_school_id() and public.auth_role() = 'admin')
  with check (school_id = public.auth_school_id() and public.auth_role() = 'admin');

commit;
