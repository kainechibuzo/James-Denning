-- ============================================================================
-- 016_org_presets.sql
--
-- Phase 1 — org creation + business-type presets (hiring feature area).
--
-- Adds a preset catalog (seeded, read-only), an org submission record for
-- every registered organization, and per-org tool toggles derived from the
-- chosen preset. Follows the live 999b RLS pattern exactly:
--   - school_id on every tenant-owned table
--   - FORCE ROW LEVEL SECURITY
--   - school-scoped policies via auth_school_id()
--
-- ⚠️ ZERO-BEHAVIOR-CHANGE GUARANTEE for existing tenants:
--   - Only additive, nullable columns are added to `schools`
--     (preset_key NULL, onboarding_step NULL for every pre-existing row).
--   - No triggers, no defaults that touch existing rows, no policies on
--     existing tables, no changes to existing seed data.
--   - The three new tables are read by no existing code path; the app only
--     queries them in the new Phase 1 pages and the new edge-function path.
-- ============================================================================

-- ── 1) PRESET CATALOG (platform-owned, read-only after seeding) ───────────
create table if not exists org_presets (
  id             bigint generated always as identity primary key,
  key            text not null unique,            -- 'general_business' | 'dev_shop'
  name           text not null,
  description    text not null default '',
  modules_json   jsonb not null default '{}',     -- {"core":true,"hiring":true,...}
  settings_seed  jsonb not null default '{}',     -- default school_settings rows
  created_at     timestamptz not null default now()
);
alter table org_presets enable row level security;
alter table org_presets force row level security;
-- Public catalog: anon can read it pre-auth (registration flow needs it);
-- writes are service-role-only (no insert/update/delete policy exists).
create policy "org_presets_public_read" on org_presets
  for select to anon, authenticated using (true);

-- ── 2) ORG: additive preset columns on schools (nullable, no defaults) ────
-- Existing rows keep preset_key = NULL / onboarding_step = NULL, i.e. they
-- are treated exactly as they are today ("classic" orgs). Only newly
-- registered orgs get these set by manage-account's register_school action.
alter table schools add column if not exists preset_key text;
alter table schools add column if not exists onboarding_step text;

-- ── 3) ORG SUBMISSIONS — one row per registered org ───────────────────────
-- Kept separate from `schools` so a public registration can be recorded
-- without widening RLS on the core table; only the org's own admin (or the
-- service role) can read/update its row.
create table if not exists org_submissions (
  id            bigint generated always as identity primary key,
  school_id     uuid not null references schools(id) on delete cascade,
  preset_key    text not null,
  org_name      text not null,
  contact_name  text not null default '',
  contact_email text not null default '',
  phone         text not null default '',
  status        text not null default 'active',
  created_at    timestamptz not null default now()
);
create index if not exists idx_org_submissions_school on org_submissions(school_id);
alter table org_submissions enable row level security;
alter table org_submissions force row level security;
create policy "org_submissions_school_scoped" on org_submissions
  for all using (school_id = auth_school_id());

-- ── 4) ORG TOOLS — per-org module toggles seeded from the preset ──────────
create table if not exists org_tools (
  id          bigint generated always as identity primary key,
  school_id   uuid not null references schools(id) on delete cascade,
  tool_key    text not null,                 -- 'core','people','billing','comms','performance','hiring','quotas','education'
  is_enabled  boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (school_id, tool_key)
);
create index if not exists idx_org_tools_school on org_tools(school_id);
alter table org_tools enable row level security;
alter table org_tools force row level security;
create policy "org_tools_school_scoped" on org_tools
  for all using (school_id = auth_school_id());

-- ── 5) SEED DATA — the starting preset set (2 presets; more later) ────────
insert into org_presets (key, name, description, modules_json, settings_seed) values
  (
    'general_business',
    'General business',
    'A flexible workspace for any organization — people, billing, communication, and performance records.',
    '{"core":true,"people":true,"billing":true,"comms":true,"performance":true,"hiring":true,"education":false}',
    '{"workspace_type":"business","education_module_enabled":"false"}'
  ),
  (
    'dev_shop',
    'Dev & code shop',
    'Software teams and agencies — project-oriented people and billing, plus quota tracking for performance-based engagements.',
    '{"core":true,"people":true,"billing":true,"comms":true,"performance":true,"hiring":true,"quotas":true,"education":false}',
    '{"workspace_type":"business","education_module_enabled":"false"}'
  )
on conflict (key) do update set
  name        = excluded.name,
  description = excluded.description,
  modules_json = excluded.modules_json,
  settings_seed = excluded.settings_seed;
