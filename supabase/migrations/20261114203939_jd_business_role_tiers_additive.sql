-- Additive only: allow business role tiers alongside legacy roles. No data or policy changes.
-- ROLLBACK: alter table public.profiles drop constraint profiles_role_check; alter table public.profiles add constraint profiles_role_check check (role = any (array['admin','teacher','student','parent']));
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role = any (array[
  'owner','admin','manager','finance','hr','staff','contractor','viewer',
  'teacher','student','parent'
]::text[]));
