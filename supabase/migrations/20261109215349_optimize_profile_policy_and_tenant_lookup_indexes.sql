-- Restrict profile reads to the signed-in user and same-school admins.
-- Remove anonymous profile reads and index tenant lookup predicates.
begin;
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or (
      (select public.auth_role()) = 'admin'
      and school_id = (select public.auth_school_id())
    )
  );
revoke select on table public.profiles from anon;
grant select on table public.profiles to authenticated;
create index if not exists idx_payments_school_student
  on public.payments (school_id, student_id);
create index if not exists idx_uploaded_files_student
  on public.uploaded_files (student_id);
commit;
