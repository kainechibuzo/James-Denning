-- ============================================================================
-- 017_hiring_roles.sql
--
-- Hiring Phases 2 & 3 — job postings, auto-generated public landing pages,
-- applications + negotiation threads, hires, and owner-defined quota tracking.
--
-- Follows the live 999b RLS pattern exactly (999b/999c in production):
--   - school_id on every tenant-owned table
--   - ROW LEVEL SECURITY enabled + school-scoped policies via auth_school_id()
--   - NOT FORCE: like every tenant table (teachers, students, ...), the owner
--     (postgres, i.e. SECURITY DEFINER functions) bypasses RLS so the public
--     RPCs below can read/write on behalf of anon; authenticated sessions are
--     still fully policy-scoped. FORCE would break the definer functions.
--
-- PUBLIC ACCESS MODEL (the differentiator — ad-driven landing pages):
--   Anon NEVER gets table-level access. Public reads/writes go through narrow
--   SECURITY DEFINER functions (same pattern as 999c login_lookup_*):
--     hiring_public_role(p_slug)              — published active role + org name
--     hiring_public_submit_application(...)   — validate role, insert application,
--                                               generate applicant access token,
--                                               notify the org admin in-app
--     hiring_get_thread(p_token)              — applicant's own thread via bearer token
--     hiring_post_message(p_token, ...)       — applicant replies to the thread
--
-- ⚠️ ZERO-BEHAVIOR-CHANGE GUARANTEE for existing tenants:
--   - All five tables are brand new; no existing table is altered.
--   - No triggers, no changes to existing policies/seed data.
--   - Existing code paths never touch these tables; only the new hiring pages,
--     the public landing page entry, and the RPCs below read/write them.
-- ============================================================================

-- ── 1) HIRING ROLES (job postings) ─────────────────────────────────────────
create table if not exists hiring_roles (
  id            bigint generated always as identity primary key,
  school_id     uuid not null references schools(id) on delete cascade,
  slug          text not null unique,           -- public URL slug (/apply/<slug>)
  title         text not null,
  summary       text not null default '',       -- short hero pitch on the landing page
  description   text not null default '',       -- full description
  expectations  text not null default '',       -- quota/goal expectations
  price_min     numeric(14,2),                  -- asking price range
  price_max     numeric(14,2),
  price_note    text not null default '',       -- e.g. "per month", "per project"
  status        text not null default 'active'
                check (status in ('active','paused','closed')),
  is_published  boolean not null default false, -- landing page live when true
  created_by    bigint,                         -- soft ref to teachers.id (no FK)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_hiring_roles_school on hiring_roles(school_id);
create index if not exists idx_hiring_roles_slug on hiring_roles(slug);
alter table hiring_roles enable row level security;
create policy "hiring_roles_school_scoped" on hiring_roles
  for all using (school_id = auth_school_id());

-- ── 2) APPLICATIONS (inquiries from the public landing page) ───────────────
create table if not exists hiring_applications (
  id                bigint generated always as identity primary key,
  school_id         uuid not null references schools(id) on delete cascade,
  role_id           bigint not null references hiring_roles(id) on delete restrict,
  applicant_name    text not null,
  applicant_email   text not null,
  applicant_phone   text not null default '',
  qualifications    text not null default '',
  asking_price      numeric(14,2),               -- applicant's asking price
  asking_price_note text not null default '',
  status            text not null default 'new'
                    check (status in ('new','reviewing','negotiating','hired','rejected','closed')),
  access_token      text not null unique,        -- bearer token for the applicant's thread link
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_hiring_apps_school on hiring_applications(school_id);
create index if not exists idx_hiring_apps_role on hiring_applications(role_id);
create index if not exists idx_hiring_apps_status on hiring_applications(status);
alter table hiring_applications enable row level security;
create policy "hiring_apps_school_scoped" on hiring_applications
  for all using (school_id = auth_school_id());

-- ── 3) MESSAGES (negotiation thread pre-hire; internal chat once hired) ────
create table if not exists hiring_messages (
  id             bigint generated always as identity primary key,
  school_id      uuid not null references schools(id) on delete cascade,
  application_id bigint not null references hiring_applications(id) on delete cascade,
  sender         text not null check (sender in ('owner','applicant')),
  sender_name    text not null,
  body           text not null,
  created_at     timestamptz not null default now()
);
create index if not exists idx_hiring_msgs_school on hiring_messages(school_id);
create index if not exists idx_hiring_msgs_app on hiring_messages(application_id);
alter table hiring_messages enable row level security;
create policy "hiring_msgs_school_scoped" on hiring_messages
  for all using (school_id = auth_school_id());

-- ── 4) HIRES (quota definition set by the owner at hire time) ──────────────
create table if not exists hires (
  id                   bigint generated always as identity primary key,
  school_id            uuid not null references schools(id) on delete cascade,
  application_id       bigint not null references hiring_applications(id) on delete cascade,
  role_id              bigint not null references hiring_roles(id) on delete restrict,
  hire_name            text not null,
  contact_email        text not null default '',
  status               text not null default 'active' check (status in ('active','ended')),
  -- Quota/goal — the metric AND how it is measured are owner-defined at hire
  -- time. The platform only tracks/display data; it never computes payouts.
  quota_metric         text not null,             -- e.g. "Deliverables completed"
  quota_unit           text not null default '',  -- e.g. "tickets"
  quota_target         numeric(14,2) not null default 0, -- target per period
  quota_period         text not null default 'monthly'
                       check (quota_period in ('weekly','monthly','quarterly','custom')),
  quota_measure_method text not null default '',  -- owner's own words: how it is measured
  quota_start          date,                      -- for custom periods
  quota_end            date,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists idx_hires_school on hires(school_id);
create index if not exists idx_hires_app on hires(application_id);
alter table hires enable row level security;
create policy "hires_school_scoped" on hires
  for all using (school_id = auth_school_id());

-- ── 5) QUOTA ENTRIES (values logged toward the metric) ─────────────────────
create table if not exists hire_quota_entries (
  id          bigint generated always as identity primary key,
  school_id   uuid not null references schools(id) on delete cascade,
  hire_id     bigint not null references hires(id) on delete cascade,
  value       numeric(14,2) not null,
  note        text not null default '',
  recorded_by text not null default 'admin',
  recorded_at timestamptz not null default now()
);
create index if not exists idx_quota_school on hire_quota_entries(school_id);
create index if not exists idx_quota_hire on hire_quota_entries(hire_id);
alter table hire_quota_entries enable row level security;
create policy "quota_school_scoped" on hire_quota_entries
  for all using (school_id = auth_school_id());

-- ============================================================================
-- PUBLIC RPCs (anon-accessible, security definer — narrow, validated, no
-- table grants to anon). Same revoke/grant pattern as 999c_login_lookup_functions.
-- ============================================================================

-- ── Public role lookup for the landing page ─────────────────────────────────
create or replace function hiring_public_role(p_slug text)
returns table(
  id bigint, title text, summary text, description text, expectations text,
  price_min numeric, price_max numeric, price_note text, org_name text
)
language sql security definer stable as $$
  select r.id, r.title, r.summary, r.description, r.expectations,
         r.price_min, r.price_max, r.price_note, s.name
  from hiring_roles r
  join schools s on s.id = r.school_id
  where r.slug = p_slug and r.is_published and r.status = 'active';
$$;
revoke all on function hiring_public_role(text) from public;
grant execute on function hiring_public_role(text) to anon, authenticated;

-- ── Public application submission (creates the inquiry + admin notification) ─
create or replace function hiring_public_submit_application(
  p_slug text, p_name text, p_email text, p_phone text,
  p_qualifications text, p_asking_price numeric, p_price_note text
) returns jsonb
language plpgsql security definer as $$
declare
  v_role hiring_roles%rowtype;
  v_token text;
  v_app  hiring_applications%rowtype;
begin
  select * into v_role from hiring_roles
    where slug = p_slug and is_published and status = 'active';
  if not found then
    return jsonb_build_object('ok', false, 'error', 'This role is not accepting applications right now.');
  end if;
  if p_name is null or trim(p_name) = '' or p_email is null or position('@' in p_email) = 0 then
    return jsonb_build_object('ok', false, 'error', 'Name and a valid email address are required.');
  end if;

  v_token := encode(gen_random_bytes(24), 'hex');
  insert into hiring_applications
    (school_id, role_id, applicant_name, applicant_email, applicant_phone,
     qualifications, asking_price, asking_price_note, status, access_token)
  values
    (v_role.school_id, v_role.id, trim(p_name), lower(trim(p_email)), coalesce(trim(p_phone), ''),
     coalesce(p_qualifications, ''), p_asking_price, coalesce(p_price_note, ''), 'new', v_token)
  returning * into v_app;

  -- Reuse the existing in-app notification path (bell → admin) — same table
  -- and shape as db.createNotificationForAdmins().
  insert into notifications
    (school_id, recipient_id, recipient_role, title, body, type, event_type, link_page)
  values
    (v_role.school_id, 'admin', 'admin',
     'New application',
     'New application for ' || v_role.title || ' from ' || v_app.applicant_name,
     'info', 'hiring_application', 'hiring');

  return jsonb_build_object('ok', true, 'id', v_app.id, 'token', v_token);
end; $$;
revoke all on function hiring_public_submit_application(text, text, text, text, text, numeric, text) from public;
grant execute on function hiring_public_submit_application(text, text, text, text, text, numeric, text) to anon, authenticated;

-- ── Applicant's own thread (bearer token) ───────────────────────────────────
create or replace function hiring_get_thread(p_token text)
returns jsonb
language plpgsql security definer as $$
declare
  v_app  hiring_applications%rowtype;
  v_role hiring_roles%rowtype;
  v_msgs jsonb;
begin
  if p_token is null or p_token = '' then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  select * into v_app from hiring_applications where access_token = p_token;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  select * into v_role from hiring_roles where id = v_app.role_id;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', m.id, 'sender', m.sender, 'sender_name', m.sender_name,
      'body', m.body, 'created_at', m.created_at) order by m.id), '[]'::jsonb)
    into v_msgs
    from hiring_messages m where m.application_id = v_app.id;
  return jsonb_build_object('ok', true,
    'application', jsonb_build_object(
      'id', v_app.id, 'status', v_app.status, 'applicant_name', v_app.applicant_name,
      'asking_price', v_app.asking_price, 'asking_price_note', v_app.asking_price_note),
    'role', jsonb_build_object('title', v_role.title, 'slug', v_role.slug),
    'messages', v_msgs);
end; $$;
revoke all on function hiring_get_thread(text) from public;
grant execute on function hiring_get_thread(text) to anon, authenticated;

-- ── Applicant reply (bearer token) ──────────────────────────────────────────
create or replace function hiring_post_message(p_token text, p_sender_name text, p_body text)
returns jsonb
language plpgsql security definer as $$
declare
  v_app hiring_applications%rowtype;
  v_msg hiring_messages%rowtype;
begin
  if p_token is null or p_token = '' then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if p_body is null or trim(p_body) = '' then
    return jsonb_build_object('ok', false, 'error', 'Message cannot be empty.');
  end if;
  select * into v_app from hiring_applications where access_token = p_token;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  insert into hiring_messages
    (school_id, application_id, sender, sender_name, body)
  values
    (v_app.school_id, v_app.id, 'applicant',
     coalesce(nullif(trim(p_sender_name), ''), v_app.applicant_name), trim(p_body))
  returning * into v_msg;
  return jsonb_build_object('ok', true, 'message', jsonb_build_object(
    'id', v_msg.id, 'sender', v_msg.sender, 'sender_name', v_msg.sender_name,
    'body', v_msg.body, 'created_at', v_msg.created_at));
end; $$;
revoke all on function hiring_post_message(text, text, text) from public;
grant execute on function hiring_post_message(text, text, text) to anon, authenticated;
