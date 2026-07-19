-- ============================================================
-- Renaissance Garden Schools — Fees Module
-- Migration: 010_fees_module
-- ============================================================

-- 1. Fee Items (admin-defined line items)
CREATE TABLE IF NOT EXISTS fee_items (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  is_compulsory BOOLEAN DEFAULT TRUE,
  is_active   BOOLEAN DEFAULT TRUE,
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Fee Templates (per class/term/year/student-type)
CREATE TABLE IF NOT EXISTS fee_templates (
  id             BIGSERIAL PRIMARY KEY,
  name           TEXT NOT NULL,
  academic_year  TEXT NOT NULL,
  term           TEXT NOT NULL,
  class_level    TEXT,
  student_type   TEXT NOT NULL DEFAULT 'all' CHECK (student_type IN ('new','old','all')),
  is_active      BOOLEAN DEFAULT FALSE,
  created_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Template Line Items
CREATE TABLE IF NOT EXISTS fee_template_items (
  id           BIGSERIAL PRIMARY KEY,
  template_id  BIGINT NOT NULL REFERENCES fee_templates(id) ON DELETE CASCADE,
  fee_item_id  BIGINT NOT NULL REFERENCES fee_items(id) ON DELETE CASCADE,
  amount       NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_optional  BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Fee Bills (one per student per term)
CREATE TABLE IF NOT EXISTS fee_bills (
  id             BIGSERIAL PRIMARY KEY,
  student_id     TEXT NOT NULL,
  template_id    BIGINT REFERENCES fee_templates(id) ON DELETE SET NULL,
  academic_year  TEXT NOT NULL,
  term           TEXT NOT NULL,
  total_amount   NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount_paid    NUMERIC(12,2) NOT NULL DEFAULT 0,
  balance        NUMERIC(12,2) GENERATED ALWAYS AS (total_amount - amount_paid) STORED,
  status         TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid','partial','paid')),
  due_date       DATE,
  generated_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, academic_year, term)
);

-- 5. Bill Line Items (snapshot at generation time)
CREATE TABLE IF NOT EXISTS fee_bill_items (
  id          BIGSERIAL PRIMARY KEY,
  bill_id     BIGINT NOT NULL REFERENCES fee_bills(id) ON DELETE CASCADE,
  fee_item_id BIGINT REFERENCES fee_items(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_optional BOOLEAN DEFAULT FALSE,
  is_included BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Fee Payments
CREATE TABLE IF NOT EXISTS fee_payments (
  id                BIGSERIAL PRIMARY KEY,
  bill_id           BIGINT NOT NULL REFERENCES fee_bills(id) ON DELETE CASCADE,
  student_id        TEXT NOT NULL,
  amount            NUMERIC(12,2) NOT NULL,
  payment_method    TEXT NOT NULL DEFAULT 'bank_transfer' CHECK (payment_method IN ('paystack','bank_transfer')),
  paystack_reference TEXT,
  bank_reference    TEXT,
  notes             TEXT,
  payment_date      TIMESTAMPTZ DEFAULT NOW(),
  recorded_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_fee_bills_student    ON fee_bills(student_id);
CREATE INDEX IF NOT EXISTS idx_fee_bills_status     ON fee_bills(status);
CREATE INDEX IF NOT EXISTS idx_fee_payments_bill    ON fee_payments(bill_id);
CREATE INDEX IF NOT EXISTS idx_fee_payments_student ON fee_payments(student_id);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE fee_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_templates      ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_bills          ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_bill_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_payments       ENABLE ROW LEVEL SECURITY;

-- Allow service_role full access (used by edge functions & admin supabase client)
CREATE POLICY "service_role_fee_items"          ON fee_items          FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_fee_templates"      ON fee_templates      FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_fee_template_items" ON fee_template_items FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_fee_bills"          ON fee_bills          FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_fee_bill_items"     ON fee_bill_items     FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_fee_payments"       ON fee_payments       FOR ALL TO service_role USING (true) WITH CHECK (true);

-- anon can read (portal uses anon key, auth handled in app layer)
CREATE POLICY "anon_read_fee_items"          ON fee_items          FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_fee_templates"      ON fee_templates      FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_fee_template_items" ON fee_template_items FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_fee_bills"          ON fee_bills          FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_fee_bill_items"     ON fee_bill_items     FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_fee_payments"       ON fee_payments       FOR SELECT TO anon USING (true);
CREATE POLICY "anon_write_fee_bills"         ON fee_bills          FOR ALL    TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_write_fee_bill_items"    ON fee_bill_items     FOR ALL    TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_write_fee_payments"      ON fee_payments       FOR ALL    TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_write_fee_items"         ON fee_items          FOR ALL    TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_write_fee_templates"     ON fee_templates      FOR ALL    TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_write_fee_template_items" ON fee_template_items FOR ALL   TO anon USING (true) WITH CHECK (true);

-- ── Seed a few default fee items ─────────────────────────────
INSERT INTO fee_items (name, description, is_compulsory) VALUES
  ('School Fee',        'Main tuition fee for the term',           true),
  ('Lesson Fee',        'Extra lessons / tutorial fee',            true),
  ('Mid-Day Meal',      'School feeding / lunch fee',              false),
  ('Transport',         'School bus transport (optional)',         false),
  ('Entry Fee',         'One-time admission fee for new students', true),
  ('Books',             'Textbooks and stationery for new students', true),
  ('Junior WAEC Fee',   'BECE examination fee (JSS3)',             true),
  ('Senior WAEC Fee',   'WASSCE examination fee (SS3)',            true),
  ('Development Levy',  'School development and maintenance levy', true),
  ('PTA Levy',          'Parent-Teacher Association levy',         true)
ON CONFLICT DO NOTHING;
