-- Fee Refunds + section/class on bills
CREATE TABLE IF NOT EXISTS fee_refunds (
  id BIGSERIAL PRIMARY KEY,
  bill_id BIGINT NOT NULL REFERENCES fee_bills(id) ON DELETE CASCADE,
  payment_id BIGINT REFERENCES fee_payments(id) ON DELETE SET NULL,
  student_id TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  reason TEXT NOT NULL,
  refunded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  refund_date TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE fee_bills ADD COLUMN IF NOT EXISTS section_id BIGINT REFERENCES sections(id) ON DELETE SET NULL;
ALTER TABLE fee_bills ADD COLUMN IF NOT EXISTS class_id BIGINT REFERENCES classes(id) ON DELETE SET NULL;
