-- ============================================================================
-- 000_schools_table_RECONSTRUCTED.sql
--
-- ⚠️ This table was NEVER in any tracked migration. It was built by hand in
-- the Supabase dashboard on the original project and its schema was never
-- exported to code — which is why every fresh Supabase project you point
-- this app at is missing columns (admin_password, etc). This file
-- reconstructs it by reading every `.from('schools')` call, every
-- `sa.<column>`, `school?.<column>`, and `schoolData.<column>` reference in
-- src/supabaseClient.js and src/AppDemo.jsx.
--
-- Run this BEFORE any of 001_school_portal_full_schema.sql onward, since
-- those migrations assume `schools` already exists (they reference
-- school_id as a foreign key in several tables).
-- ============================================================================

create extension if not exists "pgcrypto";

create table if not exists schools (
  id uuid primary key default gen_random_uuid()
);

-- CREATE TABLE IF NOT EXISTS silently no-ops if `schools` already exists
-- (e.g. from an earlier partial/manual setup) — it does NOT add missing
-- columns. So every column is added explicitly below, safe to re-run.
alter table schools add column if not exists name                text;
alter table schools add column if not exists address             text default '';
alter table schools add column if not exists state               text default '';
alter table schools add column if not exists phone               text default '';
alter table schools add column if not exists contact_phone       text default '';
alter table schools add column if not exists logo                text;
alter table schools add column if not exists student_id_prefix   text;
alter table schools add column if not exists admin_name          text;
alter table schools add column if not exists admin_email         text;
-- ⚠️ SECURITY: this is read/written as plaintext in createSchoolSignup() —
-- see src/supabaseClient.js. There is no hashing call in that path.
-- Only `admin_password_hash` (set via settings.jsx / setSetting) is
-- treated as a hash anywhere in the code. Storing a live admin password
-- in plaintext next to a hash column strongly suggests admin_password is
-- legacy/duplicate state that should be removed once you confirm nothing
-- still authenticates against it directly. Do NOT ship this as-is.
alter table schools add column if not exists admin_password      text;
alter table schools add column if not exists admin_password_hash text;
alter table schools add column if not exists settings_password   text;
alter table schools add column if not exists status              text not null default 'active';
alter table schools add column if not exists plan                text default 'free';
alter table schools add column if not exists setup_done          boolean not null default false;
alter table schools add column if not exists created_at          timestamptz not null default now();
alter table schools add column if not exists updated_at          timestamptz not null default now();

-- name is required going forward, but don't fail on existing null rows
do $$
begin
  update schools set name = coalesce(name, 'Unnamed School') where name is null;
  alter table schools alter column name set not null;
exception when others then
  raise notice 'Skipping NOT NULL on schools.name: %', sqlerrm;
end $$;

comment on table schools is
  'Reconstructed from code references — the original table was hand-built '
  'in the Supabase dashboard and never captured as a migration. Verify '
  'against production before treating this as authoritative.';

create index if not exists idx_schools_status on schools(status);

-- Minimal RLS so this at least isn't wide open once you enable it. Adjust
-- once you decide whether this table is being kept (old school-specific
-- path) or fully retired in favor of `businesses` from migrations_v2.
alter table schools enable row level security;

create policy "schools_select_own" on schools
  for select using (true); -- TODO: tighten once auth model here is finalized

create policy "schools_update_own" on schools
  for update using (true); -- TODO: tighten — currently anyone authenticated could update any school
