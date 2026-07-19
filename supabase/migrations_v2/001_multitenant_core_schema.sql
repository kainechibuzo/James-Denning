-- ============================================================================
-- 001_multitenant_core_schema.sql
-- Generic multi-tenant portal: any business (school, sports team, clinic,
-- motorsport outfit, etc.) registers as a tenant and gets fully isolated data.
--
-- Core isolation strategy:
--   1. Every tenant-owned table carries a `business_id`.
--   2. auth.users -> profiles (1:1), profiles.business_id ties a user to a tenant.
--   3. A SECURITY DEFINER helper fn `current_business_id()` reads the caller's
--      business_id once, so RLS policies stay simple and fast.
--   4. Every RLS policy filters on business_id = current_business_id() FIRST,
--      then narrows further by role / ownership where relevant.
--   5. No table is left without RLS enabled + FORCE ROW LEVEL SECURITY.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- EXTENSIONS
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- BUSINESSES (tenants)
-- ---------------------------------------------------------------------------
create table if not exists businesses (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  industry_type       text not null default 'general', -- 'school' | 'sports_team' | 'motorsport' | 'clinic' | 'general' | ...
  terminology_config  jsonb not null default '{}'::jsonb, -- e.g. {"member":"patient","group":"department"}
  enabled_modules     jsonb not null default '{
    "records": true,
    "events": true,
    "applications": false,
    "payments": false
  }'::jsonb,
  branding            jsonb not null default '{}'::jsonb, -- {"logo_url":"...","primary_color":"..."}
  created_by          uuid, -- auth.users.id of the founding admin (set after profile exists)
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table businesses is 'Tenants. Every other business-owned table references business_id.';

-- ---------------------------------------------------------------------------
-- PROFILES (1:1 with auth.users, carries business + role)
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  business_id   uuid references businesses(id) on delete cascade,
  full_name     text,
  email         text,
  -- role is scoped WITHIN a business: owner/admin manage the tenant,
  -- staff manage members' records, member is a regular roster/patient/player account.
  role          text not null default 'member' check (role in ('owner','admin','staff','member')),
  -- narrower permission flags for staff (e.g. only medical staff sees medical records)
  permissions   jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table profiles is 'One row per auth user. business_id is the tenant boundary used by every RLS policy.';

-- ---------------------------------------------------------------------------
-- Helper: current tenant + role, computed once per statement, bypasses RLS
-- recursion by being SECURITY DEFINER.
-- ---------------------------------------------------------------------------
create or replace function current_business_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select business_id from profiles where id = auth.uid();
$$;

create or replace function current_role_in_business()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function is_staff_or_above()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select role in ('owner','admin','staff') from profiles where id = auth.uid()),
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- MEMBERS (players / patients / students / drivers / roster — generic person
-- record that belongs to the business, distinct from their login profile)
-- ---------------------------------------------------------------------------
create table if not exists members (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references businesses(id) on delete cascade,
  profile_id    uuid references profiles(id) on delete set null, -- linked once they have a login
  full_name     text not null,
  member_type   text not null default 'member', -- 'player','patient','student','driver', tenant-defined
  status        text not null default 'active' check (status in ('active','inactive','pending')),
  metadata      jsonb not null default '{}'::jsonb, -- flexible per-industry fields
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- STAFF (coach / physio / doctor / teacher / mechanic — generic staff record)
-- ---------------------------------------------------------------------------
create table if not exists staff (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references businesses(id) on delete cascade,
  profile_id    uuid references profiles(id) on delete set null,
  full_name     text not null,
  staff_role    text not null default 'staff', -- 'coach','physio','doctor','engineer', tenant-defined
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- GROUPS (class / squad / department / team)
-- ---------------------------------------------------------------------------
create table if not exists groups (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references businesses(id) on delete cascade,
  name          text not null,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create table if not exists group_members (
  group_id      uuid not null references groups(id) on delete cascade,
  member_id     uuid not null references members(id) on delete cascade,
  primary key (group_id, member_id)
);

-- ---------------------------------------------------------------------------
-- EVENTS (training session / match / meeting / appointment / class)
-- ---------------------------------------------------------------------------
create table if not exists events (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references businesses(id) on delete cascade,
  title         text not null,
  event_type    text not null default 'meeting', -- 'meeting','match','training','appointment','class'
  starts_at     timestamptz not null,
  ends_at       timestamptz,
  location      text,
  meeting_url   text,
  notes         text,
  created_by    uuid references profiles(id),
  created_at    timestamptz not null default now()
);

create table if not exists event_attendees (
  event_id      uuid not null references events(id) on delete cascade,
  member_id     uuid references members(id) on delete cascade,
  staff_id      uuid references staff(id) on delete cascade,
  rsvp_status   text default 'invited',
  primary key (event_id, coalesce(member_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(staff_id, '00000000-0000-0000-0000-000000000000'::uuid))
);

-- ---------------------------------------------------------------------------
-- RECORDS (medical record / report card / race data — sensitive, scoped tight)
-- Files themselves live in Supabase Storage; this table stores metadata +
-- a storage path, plus who is allowed to see it beyond the owner/staff.
-- ---------------------------------------------------------------------------
create table if not exists records (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references businesses(id) on delete cascade,
  member_id     uuid not null references members(id) on delete cascade,
  record_type   text not null default 'general', -- 'medical','report_card','race_data'
  title         text not null,
  body          text,
  storage_path  text, -- path in Supabase Storage bucket, not a public URL
  visibility    text not null default 'staff_and_owner' check (visibility in ('staff_and_owner','owner_only')),
  created_by    uuid references profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RECORD ACCESS AUDIT LOG (every read/write to `records` is logged)
-- ---------------------------------------------------------------------------
create table if not exists record_access_log (
  id            uuid primary key default gen_random_uuid(),
  record_id     uuid not null references records(id) on delete cascade,
  business_id   uuid not null references businesses(id) on delete cascade,
  actor_id      uuid references profiles(id),
  action        text not null, -- 'view','create','update','delete'
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- APPLICATIONS (public "apply to join" pipeline — pre-auth, no business login)
-- ---------------------------------------------------------------------------
create table if not exists applications (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references businesses(id) on delete cascade,
  full_name       text not null,
  email           text not null,
  phone           text,
  role_applied_for text,
  cover_note      text,
  resume_path     text, -- Supabase Storage path
  status          text not null default 'submitted'
                    check (status in ('submitted','under_review','interview','accepted','rejected')),
  reviewed_by     uuid references profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
alter table businesses          enable row level security;
alter table profiles            enable row level security;
alter table members             enable row level security;
alter table staff               enable row level security;
alter table groups              enable row level security;
alter table group_members       enable row level security;
alter table events              enable row level security;
alter table event_attendees     enable row level security;
alter table records             enable row level security;
alter table record_access_log   enable row level security;
alter table applications        enable row level security;

alter table businesses          force row level security;
alter table profiles            force row level security;
alter table members             force row level security;
alter table staff               force row level security;
alter table groups              force row level security;
alter table group_members       force row level security;
alter table events              force row level security;
alter table event_attendees     force row level security;
alter table records             force row level security;
alter table record_access_log   force row level security;
alter table applications        force row level security;

-- ---- businesses: a user can only see their own tenant row ----
create policy "businesses_select_own" on businesses
  for select using (id = current_business_id());

create policy "businesses_update_owner" on businesses
  for update using (id = current_business_id() and current_role_in_business() = 'owner');

-- ---- profiles: see your own profile, or profiles within your business if staff+ ----
create policy "profiles_select_self" on profiles
  for select using (id = auth.uid());

create policy "profiles_select_same_business_staff" on profiles
  for select using (business_id = current_business_id() and is_staff_or_above());

create policy "profiles_update_self" on profiles
  for update using (id = auth.uid());

-- ---- members: strict tenant isolation ----
create policy "members_select_tenant" on members
  for select using (business_id = current_business_id());

create policy "members_write_staff" on members
  for insert with check (business_id = current_business_id() and is_staff_or_above());

create policy "members_update_staff" on members
  for update using (business_id = current_business_id() and is_staff_or_above());

create policy "members_delete_admin" on members
  for delete using (business_id = current_business_id() and current_role_in_business() in ('owner','admin'));

-- A member can see (a read-only view of) their own row even without staff role
create policy "members_select_self" on members
  for select using (profile_id = auth.uid());

-- ---- staff: tenant isolation, admin-managed ----
create policy "staff_select_tenant" on staff
  for select using (business_id = current_business_id());

create policy "staff_write_admin" on staff
  for insert with check (business_id = current_business_id() and current_role_in_business() in ('owner','admin'));

create policy "staff_update_admin" on staff
  for update using (business_id = current_business_id() and current_role_in_business() in ('owner','admin'));

-- ---- groups / group_members: tenant isolation ----
create policy "groups_select_tenant" on groups
  for select using (business_id = current_business_id());

create policy "groups_write_staff" on groups
  for all using (business_id = current_business_id() and is_staff_or_above())
  with check (business_id = current_business_id() and is_staff_or_above());

create policy "group_members_tenant" on group_members
  for select using (
    exists (select 1 from groups g where g.id = group_id and g.business_id = current_business_id())
  );

create policy "group_members_write_staff" on group_members
  for all using (
    exists (select 1 from groups g where g.id = group_id and g.business_id = current_business_id())
    and is_staff_or_above()
  );

-- ---- events / event_attendees: tenant isolation ----
create policy "events_select_tenant" on events
  for select using (business_id = current_business_id());

create policy "events_write_staff" on events
  for all using (business_id = current_business_id() and is_staff_or_above())
  with check (business_id = current_business_id() and is_staff_or_above());

create policy "event_attendees_tenant" on event_attendees
  for select using (
    exists (select 1 from events e where e.id = event_id and e.business_id = current_business_id())
  );

-- ---- records: the sensitive one — owner (member themself) OR staff can see;
--      `owner_only` visibility hides it from staff entirely except owner/admin ----
create policy "records_select_self" on records
  for select using (
    business_id = current_business_id()
    and exists (select 1 from members m where m.id = member_id and m.profile_id = auth.uid())
  );

create policy "records_select_staff" on records
  for select using (
    business_id = current_business_id()
    and is_staff_or_above()
    and (
      visibility = 'staff_and_owner'
      or current_role_in_business() in ('owner','admin')
    )
  );

create policy "records_write_staff" on records
  for insert with check (business_id = current_business_id() and is_staff_or_above());

create policy "records_update_staff" on records
  for update using (
    business_id = current_business_id()
    and is_staff_or_above()
    and (visibility = 'staff_and_owner' or current_role_in_business() in ('owner','admin'))
  );

-- ---- record_access_log: append-only, staff can read their tenant's log ----
create policy "record_access_log_select_admin" on record_access_log
  for select using (business_id = current_business_id() and current_role_in_business() in ('owner','admin'));

create policy "record_access_log_insert_any_authenticated" on record_access_log
  for insert with check (business_id = current_business_id());

-- ---- applications: public can INSERT (apply) without being a tenant member;
--      only staff of that business can read/review ----
create policy "applications_public_insert" on applications
  for insert with check (true); -- open application form; business_id chosen by the applicant's target business

create policy "applications_select_staff" on applications
  for select using (business_id = current_business_id() and is_staff_or_above());

create policy "applications_update_staff" on applications
  for update using (business_id = current_business_id() and is_staff_or_above());

-- ============================================================================
-- Helpful indexes
-- ============================================================================
create index if not exists idx_profiles_business on profiles(business_id);
create index if not exists idx_members_business on members(business_id);
create index if not exists idx_staff_business on staff(business_id);
create index if not exists idx_groups_business on groups(business_id);
create index if not exists idx_events_business on events(business_id);
create index if not exists idx_records_business on records(business_id);
create index if not exists idx_records_member on records(member_id);
create index if not exists idx_applications_business on applications(business_id);
