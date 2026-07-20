-- ============================================================================
-- 999_column_audit_PATCH.sql
--
-- Full audit: every table's real columns cross-referenced against every
-- .eq()/.order()/.insert()/.upsert() call site in src/supabaseClient.js.
-- Root cause found: the ORIGINAL 001_school_portal_full_schema.sql was
-- written single-tenant — school_id doesn't exist on almost any table.
-- Multi-school support was clearly bolted on by hand later (same
-- never-exported-to-a-migration problem as everything else tonight).
--
-- Runs LAST (after every CREATE TABLE), using ADD COLUMN IF NOT EXISTS so
-- it's safe regardless of what order things were created in.
-- ============================================================================

do $$
declare tbl text;
begin
  foreach tbl in array array[
    'announcements','class_subjects','class_teachers','classes','email_logs',
    'email_templates','fee_audit_log','fee_bills','fee_discounts','fee_items',
    'fee_payments','fee_refunds','fee_structures','fee_templates','grading_schema','payments',
    'portal_results','report_templates','result_approvals','sections','sessions',
    'signatures','student_requests','students','subjects','teacher_subjects',
    'teachers','terms'
  ]
  loop
    execute format(
      'alter table %I add column if not exists school_id uuid references schools(id) on delete cascade',
      tbl
    );
    execute format('create index if not exists idx_%s_school on %I(school_id)', tbl, tbl);
  end loop;
end $$;

-- Other specific missing columns found by the audit:
alter table class_subjects  add column if not exists section_subject_id bigint references section_subjects(id) on delete cascade;
alter table fee_bill_items  add column if not exists is_carry_forward   boolean not null default false;
alter table fee_bill_items  add column if not exists source_bill_id     integer references fee_bills(id) on delete set null;
alter table fee_bills       add column if not exists carried_forward    boolean not null default false;
alter table fee_payments    add column if not exists is_refunded        boolean not null default false;
alter table fee_structures  add column if not exists section_id         integer references sections(id) on delete set null;
alter table fee_templates   add column if not exists template_type      text;
alter table grading_schema  add column if not exists schema_type        text;
alter table students        add column if not exists status             text not null default 'active';
alter table students        add column if not exists class_id           integer references classes(id) on delete set null;
alter table students        add column if not exists is_new_enrollee    boolean not null default false;
alter table students        add column if not exists phone              text;
alter table students        add column if not exists display_name       text;
alter table students        add column if not exists guardian_name      text;

-- teachers: password_hash/role/status/updated_at are all written via
-- .update() calls in supabaseClient.js but were never added by any
-- migration (students got the equivalent via 004_students_extra_columns.sql,
-- teachers never did — same never-exported-to-code gap as everything else).
alter table teachers add column if not exists password_hash text;
alter table teachers add column if not exists role           text not null default 'teacher';
alter table teachers add column if not exists status          text not null default 'active';
alter table teachers add column if not exists display_name    text;
alter table teachers add column if not exists updated_at      timestamptz not null default now();

-- report_card_publish: app uses is_published, my earlier reconstruction
-- named it `published` — already fixed at the source in
-- 001b_remaining_tables_RECONSTRUCTED.sql, but ADD COLUMN IF NOT EXISTS
-- here too in case this patch ever runs against an older version of that file.
alter table report_card_publish add column if not exists is_published boolean not null default false;
