-- ============================================================
-- Renaissance Garden Schools — Report Workflow & Approvals
-- Migration: 005_report_workflow
-- Features: Approval workflow, signatures, templates,
--           publish controls, position, completion check,
--           extended permissions
-- ============================================================

-- ── RESULT APPROVAL STATE ────────────────────────────────────
-- Tracks EA (Educator Approval) and MA (Manager Approval)
-- per class + term + session
CREATE TABLE IF NOT EXISTS result_approvals (
  id              SERIAL PRIMARY KEY,
  class_id        INT REFERENCES classes(id) ON DELETE CASCADE,
  term_id         INT REFERENCES terms(id) ON DELETE CASCADE,
  session_id      INT REFERENCES sessions(id) ON DELETE CASCADE,

  -- Educator Approval
  ea_status       TEXT NOT NULL DEFAULT 'pending'
                  CHECK (ea_status IN ('pending','approved','revoked')),
  ea_approved_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ea_approved_at  TIMESTAMPTZ,
  ea_notes        TEXT,

  -- Manager Approval
  ma_status       TEXT NOT NULL DEFAULT 'pending'
                  CHECK (ma_status IN ('pending','approved','revoked')),
  ma_approved_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ma_approved_at  TIMESTAMPTZ,
  ma_notes        TEXT,

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(class_id, term_id, session_id)
);

-- ── SIGNATURES ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS signatures (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,            -- e.g. "Mr. Okon - Class Teacher"
  role_label  TEXT,                     -- e.g. "Class Teacher", "Principal"
  image_url   TEXT NOT NULL,            -- Supabase Storage URL
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── REPORT TEMPLATES ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS report_templates (
  id                      SERIAL PRIMARY KEY,
  name                    TEXT NOT NULL,
  description             TEXT,
  -- Section toggles (stored as JSONB booleans)
  show_cae                BOOLEAN DEFAULT TRUE,
  show_teacher_comment    BOOLEAN DEFAULT TRUE,
  show_principal_comment  BOOLEAN DEFAULT TRUE,
  show_parent_ack         BOOLEAN DEFAULT TRUE,
  show_position           BOOLEAN DEFAULT TRUE,
  show_next_term          BOOLEAN DEFAULT TRUE,
  -- Default content
  default_teacher_comment TEXT,
  default_principal_comment TEXT,
  default_next_term_date  DATE,
  -- Signature references
  teacher_signature_id    INT REFERENCES signatures(id) ON DELETE SET NULL,
  principal_signature_id  INT REFERENCES signatures(id) ON DELETE SET NULL,
  -- Meta
  created_by              UUID REFERENCES profiles(id) ON DELETE SET NULL,
  is_default              BOOLEAN DEFAULT FALSE,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- ── EXTEND report_card_publish ───────────────────────────────
-- Add new columns to the existing table
ALTER TABLE report_card_publish
  ADD COLUMN IF NOT EXISTS show_cae               BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS show_teacher_comment   BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS show_principal_comment BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS show_parent_ack        BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS show_position          BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS show_next_term         BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS teacher_signature_id   INT REFERENCES signatures(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS principal_signature_id INT REFERENCES signatures(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS template_id            INT REFERENCES report_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unpublished_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS published_by           UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- ── RLS POLICIES ─────────────────────────────────────────────

ALTER TABLE result_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE signatures        ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_templates  ENABLE ROW LEVEL SECURITY;

-- result_approvals: admin/manager full; teachers read
CREATE POLICY "ra_admin" ON result_approvals FOR ALL
  USING (auth_role() = 'admin');
CREATE POLICY "ra_teacher_read" ON result_approvals FOR SELECT
  USING (auth_role() = 'teacher');
CREATE POLICY "ra_teacher_ea" ON result_approvals FOR UPDATE
  USING (
    auth_role() = 'teacher' AND
    EXISTS (
      SELECT 1 FROM class_teachers ct
      WHERE ct.class_id = result_approvals.class_id
        AND ct.teacher_id = auth_teacher_id()
        AND ct.is_form_teacher = true
    )
  );

-- signatures: admin full; all authenticated read
CREATE POLICY "sig_admin" ON signatures FOR ALL USING (auth_role() = 'admin');
CREATE POLICY "sig_read"  ON signatures FOR SELECT USING (auth.role() = 'authenticated');

-- report_templates: admin full; teacher read
CREATE POLICY "rt_admin"  ON report_templates FOR ALL USING (auth_role() = 'admin');
CREATE POLICY "rt_read"   ON report_templates FOR SELECT USING (auth.role() = 'authenticated');

-- ── UPDATED_AT TRIGGERS ──────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ra_updated_at   ON result_approvals;
DROP TRIGGER IF EXISTS trg_sig_updated_at  ON signatures;
DROP TRIGGER IF EXISTS trg_rt_updated_at   ON report_templates;

CREATE TRIGGER trg_ra_updated_at  BEFORE UPDATE ON result_approvals  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_sig_updated_at BEFORE UPDATE ON signatures         FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_rt_updated_at  BEFORE UPDATE ON report_templates   FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── SEED NEW PERMISSIONS ─────────────────────────────────────
-- Add new action permissions (default denied for teachers)
INSERT INTO role_permissions (role, page_id, allowed, updated_at) VALUES
  ('teacher', 'action-publish-reports',   false, NOW()),
  ('teacher', 'action-manage-templates',  false, NOW()),
  ('teacher', 'action-manager-approval',  false, NOW()),
  ('teacher', 'action-educator-approval', true,  NOW()),
  ('teacher', 'action-view-all-reports',  false, NOW()),
  ('teacher', 'action-manage-signatures', false, NOW())
ON CONFLICT (role, page_id) DO NOTHING;

-- ── GRANT PERMISSIONS ────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON result_approvals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON signatures        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON report_templates  TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE result_approvals_id_seq  TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE signatures_id_seq         TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE report_templates_id_seq   TO authenticated;
