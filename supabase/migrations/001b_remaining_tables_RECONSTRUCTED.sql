-- ============================================================================
-- 000c_remaining_tables_RECONSTRUCTED.sql
--
-- 23 more tables used throughout src/supabaseClient.js and src/pages/*.jsx
-- but never created in any tracked migration — same "hand-built in the
-- dashboard, never exported" problem as schools/role_permissions/
-- user_permissions. Reconstructed column-by-column from every actual
-- .insert()/.upsert()/.select() call site in the code.
--
-- Columns marked "best-effort" are inferred from usage but the code never
-- reveals a definitive type/constraint — safe defaults chosen so nothing
-- crashes; tighten later if you learn the real original definition.
-- ============================================================================

-- ── ACADEMIC CALENDAR ────────────────────────────────────────────────────
create table if not exists academic_calendar (
  id          bigint generated always as identity primary key,
  school_id   uuid not null references schools(id) on delete cascade,
  session_id  bigint,
  term_id     bigint,
  title       text,
  start_date  date,
  end_date    date,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_academic_calendar_school on academic_calendar(school_id);

-- ── ADMIN AUDIT LOG ──────────────────────────────────────────────────────
create table if not exists admin_audit_log (
  id            bigint generated always as identity primary key,
  school_id     uuid references schools(id) on delete cascade,
  action        text not null,
  entity_type   text,
  entity_id     text,
  entity_name   text,
  old_value     text,
  new_value     text,
  performed_by  text not null default 'admin',
  notes         text,
  performed_at  timestamptz not null default now()
);
create index if not exists idx_admin_audit_school on admin_audit_log(school_id);

-- ── CAE (Character Assessment / Effort) SYSTEM ───────────────────────────
create table if not exists cae_traits (
  id          bigint generated always as identity primary key,
  school_id   uuid references schools(id) on delete cascade,
  section_id  bigint,
  category    text,
  name        text,
  is_active   boolean not null default true,
  sort_order  integer default 0,
  created_at  timestamptz not null default now()
);

create table if not exists cae_ratings (
  id          bigint generated always as identity primary key,
  school_id   uuid references schools(id) on delete cascade,
  section_id  bigint,
  label       text,
  symbol      text,
  sort_order  integer default 0,
  created_at  timestamptz not null default now()
);

create table if not exists cae_structures (
  id           bigint generated always as identity primary key,
  school_id    uuid references schools(id) on delete cascade,
  section_id   bigint,
  name         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists cae_components (
  id            bigint generated always as identity primary key,
  cae_id        bigint references cae_structures(id) on delete cascade,
  name          text,
  display_order integer default 0,
  created_at    timestamptz not null default now()
);

create table if not exists portal_cae_results (
  id          bigint generated always as identity primary key,
  school_id   uuid references schools(id) on delete cascade,
  student_id  text not null,
  class_id    bigint,
  term_id     bigint,
  session_id  bigint,
  trait_id    bigint references cae_traits(id) on delete cascade,
  rating_id   bigint references cae_ratings(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists uq_portal_cae_results
  on portal_cae_results (student_id, class_id, term_id, session_id, trait_id);

-- ── EMAIL QUEUE (background batch send) ──────────────────────────────────
create table if not exists email_queue (
  id             bigint generated always as identity primary key,
  batch_id       text not null,
  school_id      uuid references schools(id) on delete cascade,
  to_email       text not null,
  subject        text,
  html           text,
  attachments    jsonb not null default '[]'::jsonb,
  status         text not null default 'pending', -- pending|sending|sent|failed
  metadata       jsonb not null default '{}'::jsonb,
  error_message  text,
  processed_at   timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists idx_email_queue_batch on email_queue(batch_id);
create index if not exists idx_email_queue_school on email_queue(school_id);

-- ── MANUAL TRANSCRIPTS (hand-entered, not derived from portal_results) ───
create table if not exists manual_transcripts (
  id               bigint generated always as identity primary key,
  school_id        uuid references schools(id) on delete cascade,
  student_id       text,
  student_name     text not null,
  student_number   text,
  class_name       text,
  section_name     text,
  gender           text,
  dob              date,
  academic_year    text,
  notes            text,
  structure_id     bigint,
  structure_name   text,
  transcript_type  text not null default 'legacy', -- 'legacy' | 'multi_period'
  class_periods    jsonb, -- JSON-stringified array for multi_period type
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_manual_transcripts_school on manual_transcripts(school_id);
create index if not exists idx_manual_transcripts_student on manual_transcripts(student_id);

create table if not exists manual_transcript_subjects (
  id                bigint generated always as identity primary key,
  transcript_id     bigint not null references manual_transcripts(id) on delete cascade,
  subject_name      text not null,
  component_scores  jsonb, -- JSON-stringified scores for structure-based subjects
  t1_ca             numeric, t1_exam numeric, t1_total numeric,
  t2_ca             numeric, t2_exam numeric, t2_total numeric,
  t3_ca             numeric, t3_exam numeric, t3_total numeric,
  display_order     integer default 0
);
create index if not exists idx_manual_transcript_subjects_transcript on manual_transcript_subjects(transcript_id);

-- ── TRANSCRIPT DRAFTS (in-progress work, shareable across staff) ────────
create table if not exists transcript_drafts (
  id                bigint generated always as identity primary key,
  school_id         uuid references schools(id) on delete cascade,
  student_id        text,
  student_name      text,
  class_name        text,
  session_ids       jsonb default '[]'::jsonb,
  score_overrides   jsonb default '{}'::jsonb,
  missing_fields    jsonb default '[]'::jsonb,
  status            text not null default 'draft', -- 'draft' | 'generated'
  note              text,
  generated_at      timestamptz,
  created_by_name   text,
  updated_by_name   text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_transcript_drafts_school on transcript_drafts(school_id);
create index if not exists idx_transcript_drafts_student on transcript_drafts(student_id);

-- ── NOTIFICATIONS ─────────────────────────────────────────────────────────
create table if not exists notifications (
  id              bigint generated always as identity primary key,
  school_id       uuid not null references schools(id) on delete cascade,
  recipient_id    text not null, -- a user id, or literal 'admin'
  recipient_role  text,
  title           text not null,
  body            text,
  type            text default 'info',
  event_type      text,
  link_page       text,
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists idx_notifications_school_recipient on notifications(school_id, recipient_id);

-- ── PERMISSION AUDIT LOG ─────────────────────────────────────────────────
create table if not exists permission_audit_log (
  id               bigint generated always as identity primary key,
  admin_id         text,
  action           text not null,
  target_role      text,
  target_user_id   text,
  page_id          text,
  old_value        text,
  new_value        text,
  created_at       timestamptz not null default now()
);

-- ── PLATFORM ADMINS (super-admin, cross-tenant) ──────────────────────────
create table if not exists platform_admins (
  id             uuid primary key default gen_random_uuid(),
  email          text unique,
  password_hash  text,
  last_login     timestamptz,
  created_at     timestamptz not null default now()
);

-- ── PROMOTION / ROLLOVER ──────────────────────────────────────────────────
create table if not exists promotion_runs (
  id                 bigint generated always as identity primary key,
  school_id          uuid references schools(id) on delete cascade,
  from_session_id    bigint not null,
  promotion_term_id  bigint,
  status             text not null default 'armed', -- 'armed' | 'committed' | 'reverted'
  armed_by           text,
  committed_at       timestamptz,
  created_at         timestamptz not null default now()
);
create index if not exists idx_promotion_runs_school_session on promotion_runs(school_id, from_session_id);

create table if not exists promotion_decisions (
  id             bigint generated always as identity primary key,
  run_id         bigint not null references promotion_runs(id) on delete cascade,
  school_id      uuid references schools(id) on delete cascade,
  student_id     text not null,
  from_class_id  bigint,
  to_class_id    bigint,
  decision       text not null, -- 'promote' | 'graduate' | 'repeat' | ...
  updated_at     timestamptz not null default now()
);
create index if not exists idx_promotion_decisions_run on promotion_decisions(run_id);

-- ── RECYCLE BIN (soft-delete staging before hard delete) ─────────────────
create table if not exists recycle_bin (
  id           bigint generated always as identity primary key,
  school_id    uuid not null references schools(id) on delete cascade,
  record_type  text not null,
  record_id    text not null,
  record_data  jsonb not null,
  deleted_by   text default 'admin',
  deleted_at   timestamptz not null default now(),
  expires_at   timestamptz not null
);
create index if not exists idx_recycle_bin_school on recycle_bin(school_id);
create index if not exists idx_recycle_bin_expires on recycle_bin(expires_at);

-- ── REPORT CARD PUBLISH (gate on releasing results to students/parents) ─
create table if not exists report_card_publish (
  id          bigint generated always as identity primary key,
  school_id   uuid not null references schools(id) on delete cascade,
  class_id    bigint,
  term_id     bigint,
  session_id  bigint,
  published   boolean not null default false, -- kept for compat; see is_published below
  is_published boolean not null default false,
  updated_at  timestamptz not null default now()
);
create unique index if not exists uq_report_card_publish
  on report_card_publish (school_id, class_id, term_id, session_id);

-- ── SCHOOL SETTINGS (generic key/value store, per school) ───────────────
create table if not exists school_settings (
  id          bigint generated always as identity primary key,
  school_id   uuid references schools(id) on delete cascade,
  key         text not null,
  value       text,
  updated_at  timestamptz not null default now()
);
-- Plain-column constraint matching setSetting()'s onConflict:'school_id,key'
-- exactly (an expression index here would hit the same ON CONFLICT mismatch
-- error role_permissions had — Postgres requires an exact column-list match).
create unique index if not exists uq_school_settings_school_key
  on school_settings (school_id, key);

-- ── SECTION SUBJECTS (subjects scoped to a school section) ──────────────
create table if not exists section_subjects (
  id          bigint generated always as identity primary key,
  school_id   uuid references schools(id) on delete cascade,
  section_id  bigint,
  name        text not null,
  code        text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_section_subjects_school on section_subjects(school_id);
create index if not exists idx_section_subjects_section on section_subjects(section_id);

-- ── SUBJECT ACCESS GRANTS / REQUESTS (teacher access to teach a subject) ─
-- Named FK constraints matter here: the frontend selects via
-- `teachers!subject_access_grants_teacher_id_fkey(...)` etc, which relies
-- on Postgres's default auto-generated constraint name for a plain
-- `references teachers(id)` column — so keep these as simple inline
-- references rather than named constraints, so the default name matches.
create table if not exists subject_access_grants (
  id          bigint generated always as identity primary key,
  school_id   uuid references schools(id) on delete cascade,
  teacher_id  integer references teachers(id) on delete cascade,
  class_id    integer references classes(id) on delete cascade,
  subject_id  bigint references section_subjects(id) on delete cascade,
  granted_by  integer references teachers(id),
  created_at  timestamptz not null default now()
);
create unique index if not exists uq_subject_access_grants
  on subject_access_grants (teacher_id, class_id, subject_id);

create table if not exists subject_access_requests (
  id            bigint generated always as identity primary key,
  school_id     uuid references schools(id) on delete cascade,
  teacher_id    integer references teachers(id) on delete cascade,
  class_id      integer references classes(id) on delete cascade,
  subject_ids   jsonb not null default '[]'::jsonb,
  status        text not null default 'pending', -- 'pending' | 'approved' | 'rejected'
  reviewed_by   integer references teachers(id),
  admin_note    text,
  requested_at  timestamptz not null default now(),
  reviewed_at   timestamptz
);
create index if not exists idx_subject_access_requests_school on subject_access_requests(school_id);

-- ── TIMETABLE ─────────────────────────────────────────────────────────────
create table if not exists timetable_periods (
  id           bigint generated always as identity primary key,
  school_id    uuid not null references schools(id) on delete cascade,
  name         text,
  start_time   time,
  end_time     time,
  is_break     boolean not null default false,
  order_index  integer default 0
);
create index if not exists idx_timetable_periods_school on timetable_periods(school_id);

create table if not exists timetable_slots (
  id           bigint generated always as identity primary key,
  school_id    uuid not null references schools(id) on delete cascade,
  class_id     bigint,
  period_id    bigint references timetable_periods(id) on delete cascade,
  subject_id   bigint references section_subjects(id),
  teacher_id   integer references teachers(id),
  day_of_week  integer not null, -- 0=Sunday..6=Saturday
  term_id      bigint,
  session_id   bigint
);
create unique index if not exists uq_timetable_slots
  on timetable_slots (school_id, class_id, period_id, day_of_week, term_id, session_id);

-- ============================================================================
-- Enable RLS with permissive placeholder policies on everything above.
-- These are NOT production-ready — they exist so the tables aren't wide
-- open with RLS disabled entirely, but every policy here is `using (true)`.
-- Tighten per-table once you decide the real access model (this mirrors
-- the same TODO left on role_permissions/user_permissions/schools).
-- ============================================================================
do $$
declare tbl text;
begin
  foreach tbl in array array[
    'academic_calendar','admin_audit_log','cae_traits','cae_ratings','cae_structures',
    'cae_components','portal_cae_results','email_queue','manual_transcripts',
    'manual_transcript_subjects','transcript_drafts','notifications','permission_audit_log',
    'platform_admins','promotion_runs','promotion_decisions','recycle_bin',
    'report_card_publish','school_settings','section_subjects','subject_access_grants',
    'subject_access_requests','timetable_periods','timetable_slots'
  ]
  loop
    execute format('alter table %I enable row level security', tbl);
    execute format('drop policy if exists "%s_all" on %I', tbl, tbl);
    execute format('create policy "%s_all" on %I for all using (true)', tbl, tbl);
  end loop;
end $$;
