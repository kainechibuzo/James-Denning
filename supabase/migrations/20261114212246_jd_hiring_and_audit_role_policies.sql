-- Tighten hiring + audit access by business role.
-- Before: any signed-in member of a business had full ALL access to hiring tables (applicant data).
-- ROLLBACK: restore from public.jd_policy_backup_20261114 rows for these tables (cmd/qual/with_check), and re-grant anon SELECT if needed.
insert into public.jd_policy_backup_20261114 (schemaname, tablename, policyname, cmd, qual, with_check)
select schemaname, tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename in ('hiring_applications','hiring_messages','hiring_roles','jd_audit_events');

-- Hiring tables: owner/admin/hr manage; manager read-only; everyone else none.
drop policy if exists hiring_apps_school_scoped on public.hiring_applications;
drop policy if exists hiring_msgs_school_scoped on public.hiring_messages;
drop policy if exists hiring_roles_school_scoped on public.hiring_roles;

create policy hiring_apps_manage on public.hiring_applications for all to authenticated
  using (school_id = auth_school_id() and auth_role() = any (array['owner'::text,'admin'::text,'hr'::text]))
  with check (school_id = auth_school_id() and auth_role() = any (array['owner'::text,'admin'::text,'hr'::text]));
create policy hiring_apps_manager_read on public.hiring_applications for select to authenticated
  using (school_id = auth_school_id() and auth_role() = 'manager'::text);

create policy hiring_msgs_manage on public.hiring_messages for all to authenticated
  using (school_id = auth_school_id() and auth_role() = any (array['owner'::text,'admin'::text,'hr'::text]))
  with check (school_id = auth_school_id() and auth_role() = any (array['owner'::text,'admin'::text,'hr'::text]));
create policy hiring_msgs_manager_read on public.hiring_messages for select to authenticated
  using (school_id = auth_school_id() and auth_role() = 'manager'::text);

create policy hiring_roles_manage on public.hiring_roles for all to authenticated
  using (school_id = auth_school_id() and auth_role() = any (array['owner'::text,'admin'::text,'hr'::text]))
  with check (school_id = auth_school_id() and auth_role() = any (array['owner'::text,'admin'::text,'hr'::text]));
create policy hiring_roles_manager_read on public.hiring_roles for select to authenticated
  using (school_id = auth_school_id() and auth_role() = 'manager'::text);

-- Audit log: owner/admin and read-only viewer (auditor).
drop policy if exists jd_audit_select on public.jd_audit_events;
create policy jd_audit_select on public.jd_audit_events for select to authenticated
  using (school_id = auth_school_id() and auth_role() = any (array['owner'::text,'admin'::text,'viewer'::text]));

-- Anonymous users never need direct table access here (public careers uses the edge function).
revoke all on public.hiring_applications, public.hiring_messages, public.hiring_roles, public.jd_audit_events from anon;
