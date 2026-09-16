CREATE TABLE IF NOT EXISTS fee_discounts (
  id BIGSERIAL PRIMARY KEY,
  bill_id BIGINT NOT NULL REFERENCES fee_bills(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL,
  label TEXT NOT NULL,
  discount_type TEXT NOT NULL DEFAULT 'fixed' CHECK (discount_type IN ('fixed','percent')),
  value NUMERIC(12,2) NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  applied_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fee_discounts_bill ON fee_discounts(bill_id);
ALTER TABLE fee_discounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_fee_discounts" ON fee_discounts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_fee_discounts" ON fee_discounts FOR ALL TO anon USING (true) WITH CHECK (true);
