-- 1) The browser (anon) role never needs direct table writes: every write policy depends on auth_school_id()/auth_role(), which anon cannot execute.
--    Verified before applying: no policy allows anon writes without an auth_* check.
-- 2) school_settings: anon cannot evaluate its policy, so remove all anon access (login page should use preauth-lookup access_settings).
-- 3) Neutralise the legacy school-admin password path: the plaintext admin_password / admin_password_hash columns may never hold a value.
--    All existing rows were NULL when this ran (0 of 3 schools had either set).
-- ROLLBACK:
--   grant insert, update, delete, truncate on all tables in schema public to anon;
--   grant select on public.school_settings to anon;
--   alter table public.schools drop constraint schools_no_legacy_admin_password;
revoke insert, update, delete, truncate, references, trigger on all tables in schema public from anon;
revoke all on public.school_settings from anon;

update public.schools set admin_password = null, admin_password_hash = null
 where admin_password is not null or admin_password_hash is not null;

alter table public.schools
  add constraint schools_no_legacy_admin_password
  check (admin_password is null and admin_password_hash is null);
