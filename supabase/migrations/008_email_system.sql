-- ============================================================
-- Renaissance Garden Schools — Internal Email / Mailing System
-- Migration: 008_email_system
-- ============================================================

CREATE TABLE IF NOT EXISTS email_templates (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  subject     TEXT NOT NULL,
  body        TEXT NOT NULL,
  description TEXT,
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_logs (
  id              SERIAL PRIMARY KEY,
  template_id     INT  REFERENCES email_templates(id) ON DELETE SET NULL,
  sent_by         UUID REFERENCES profiles(id) ON DELETE SET NULL,
  subject         TEXT NOT NULL,
  body            TEXT NOT NULL,
  recipients      JSONB NOT NULL DEFAULT '[]',
  recipient_count INT  NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'sent'
                  CHECK (status IN ('sent','failed','partial')),
  error_message   TEXT,
  metadata        JSONB DEFAULT '{}',
  sent_at         TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs       ENABLE ROW LEVEL SECURITY;

CREATE POLICY "open_all_email_templates" ON email_templates
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "open_all_email_logs" ON email_logs
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON email_templates TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON email_logs       TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE email_templates_id_seq TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE email_logs_id_seq       TO anon, authenticated;

DROP TRIGGER IF EXISTS trg_et_updated_at ON email_templates;
CREATE TRIGGER trg_et_updated_at
  BEFORE UPDATE ON email_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
