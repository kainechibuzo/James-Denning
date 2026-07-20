-- ============================================================================
-- 000b_permissions_tables_RECONSTRUCTED.sql
--
-- Same story as schools: `role_permissions` and `user_permissions` are used
-- throughout src/supabaseClient.js but never created in any tracked
-- migration — hand-built in the dashboard, never exported.
--
-- Note: the old migration files (005/009) seed role_permissions using
-- `ON CONFLICT (role, page_id)` — a 2-column unique constraint. But the
-- LIVE app code (supabaseClient.js: setRolePermission) upserts using
-- `onConflict:'school_id,role,page_id'` — a 3-column constraint including
-- school_id. Those two disagree, meaning the real table was altered by hand
-- after those migrations were written. This reconstruction follows the
-- live app code, since that's what actually has to keep working, and adds
-- school_id as nullable so the old 2-column seed INSERTs (which don't pass
-- school_id) still succeed.
-- ============================================================================

create table if not exists role_permissions (
  id          uuid primary key default gen_random_uuid()
);

alter table role_permissions add column if not exists school_id  uuid references schools(id) on delete cascade;
alter table role_permissions add column if not exists role       text not null;
alter table role_permissions add column if not exists page_id    text not null;
alter table role_permissions add column if not exists allowed    boolean not null default false;
alter table role_permissions add column if not exists updated_at timestamptz not null default now();

-- Only ONE real constraint: per-school uniqueness on (school_id, role, page_id),
-- matching what the live app's setRolePermission() actually needs. A global
-- (role, page_id) constraint was considered but rejected — it would let only
-- ONE school in the whole database ever have a given role+page permission
-- row, breaking multi-tenancy the moment a second school signs up. The old
-- seed migrations' `ON CONFLICT (role, page_id)` clauses are patched
-- (see below in this same combined run) to a bare `ON CONFLICT DO NOTHING`
-- instead, which doesn't require a matching column list.
create unique index if not exists uq_role_permissions_school_role_page
  on role_permissions (school_id, role, page_id);

create table if not exists user_permissions (
  id uuid primary key default gen_random_uuid()
);

alter table user_permissions add column if not exists user_type   text not null;
alter table user_permissions add column if not exists user_id     uuid not null;
alter table user_permissions add column if not exists page_id     text not null;
alter table user_permissions add column if not exists allowed     boolean not null default false;
alter table user_permissions add column if not exists updated_at  timestamptz not null default now();

create unique index if not exists uq_user_permissions_type_user_page
  on user_permissions (user_type, user_id, page_id);

alter table role_permissions enable row level security;
alter table user_permissions enable row level security;

drop policy if exists "role_permissions_all" on role_permissions;
create policy "role_permissions_all" on role_permissions for all using (true); -- TODO: tighten

drop policy if exists "user_permissions_all" on user_permissions;
create policy "user_permissions_all" on user_permissions for all using (true); -- TODO: tighten
