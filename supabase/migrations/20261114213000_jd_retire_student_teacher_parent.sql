-- Retire student/teacher/parent. Verified before applying: 0 students, 0 teachers, 1 profile (admin).
-- Functions are revoked, not dropped, so this is reversible.
-- ROLLBACK:
--   grant execute on function public.login_lookup_student(uuid, text) to anon;  -- check actual signatures with \df
--   grant execute on function public.login_lookup_teacher(uuid, text) to anon;
--   alter table public.profiles drop constraint profiles_role_check;
--   alter table public.profiles add constraint profiles_role_check check (role = any (array['owner','admin','manager','finance','hr','staff','contractor','viewer','teacher','student','parent']::text[]));
do $do$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('login_lookup_student', 'login_lookup_teacher')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
end
$do$;

alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role = any (array[
  'owner','admin','manager','finance','hr','staff','contractor','viewer'
]::text[]));
