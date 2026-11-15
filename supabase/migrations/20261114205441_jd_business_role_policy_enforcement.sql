-- Step 2: make existing RLS policies recognise business role tiers.
-- Additive widening only: every role that had access before still has it.
-- ROLLBACK: restore each policy from public.jd_policy_backup_20261114 (qual / with_check) with ALTER POLICY.
DO $do$
declare
  r record; q text; w text; stmt text; changed int := 0; total int := 0;
  admin_set text; teacher_set text; fin boolean;
begin
  create table if not exists public.jd_policy_backup_20261114 (
    schemaname text, tablename text, policyname text, cmd text,
    qual text, with_check text, backed_up_at timestamptz default now()
  );
  alter table public.jd_policy_backup_20261114 enable row level security;
  revoke all on public.jd_policy_backup_20261114 from anon, authenticated;

  insert into public.jd_policy_backup_20261114 (schemaname, tablename, policyname, cmd, qual, with_check)
  select schemaname, tablename, policyname, cmd, qual, with_check
  from pg_policies
  where schemaname = 'public' and (qual ilike '%auth_role%' or with_check ilike '%auth_role%');

  for r in
    select * from pg_policies
    where schemaname = 'public' and (qual ilike '%auth_role%' or with_check ilike '%auth_role%')
  loop
    total := total + 1;
    fin := r.tablename like 'fee\_%' or r.tablename = 'payments';
    if fin then
      admin_set   := $s$ANY (ARRAY['owner'::text, 'admin'::text, 'finance'::text])$s$;
      teacher_set := $s$ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'finance'::text, 'teacher'::text])$s$;
    else
      admin_set   := $s$ANY (ARRAY['owner'::text, 'admin'::text])$s$;
      teacher_set := $s$ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'staff'::text, 'teacher'::text])$s$;
    end if;

    q := r.qual;
    w := r.with_check;

    q := replace(q, $s$auth_role() = ANY (ARRAY['admin'::text, 'teacher'::text])$s$, 'auth_role() = ' || teacher_set);
    q := replace(q, $s$auth_role() = 'admin'::text$s$, 'auth_role() = ' || admin_set);
    q := replace(q, $s$AS auth_role) = 'admin'::text$s$, 'AS auth_role) = ' || admin_set);

    w := replace(w, $s$auth_role() = ANY (ARRAY['admin'::text, 'teacher'::text])$s$, 'auth_role() = ' || teacher_set);
    w := replace(w, $s$auth_role() = 'admin'::text$s$, 'auth_role() = ' || admin_set);
    w := replace(w, $s$AS auth_role) = 'admin'::text$s$, 'AS auth_role) = ' || admin_set);

    if q is distinct from r.qual or w is distinct from r.with_check then
      stmt := format('alter policy %I on public.%I', r.policyname, r.tablename);
      if q is not null then stmt := stmt || ' using (' || q || ')'; end if;
      if w is not null then stmt := stmt || ' with check (' || w || ')'; end if;
      execute stmt;
      changed := changed + 1;
    end if;
  end loop;

  raise notice 'policies scanned: %, rewritten: %', total, changed;
end
$do$;
