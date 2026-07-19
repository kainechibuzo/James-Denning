CREATE TABLE IF NOT EXISTS fee_audit_log (
  id BIGSERIAL PRIMARY KEY,
  bill_id BIGINT REFERENCES fee_bills(id) ON DELETE SET NULL,
  student_id TEXT NOT NULL,
  action TEXT NOT NULL,
  amount NUMERIC(12,2),
  details JSONB,
  performed_by TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fee_audit_bill    ON fee_audit_log(bill_id);
CREATE INDEX IF NOT EXISTS idx_fee_audit_student ON fee_audit_log(student_id);
CREATE INDEX IF NOT EXISTS idx_fee_audit_created ON fee_audit_log(created_at DESC);
ALTER TABLE fee_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_fee_audit" ON fee_audit_log FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_fee_audit"     ON fee_audit_log FOR ALL TO anon     USING (true) WITH CHECK (true);
