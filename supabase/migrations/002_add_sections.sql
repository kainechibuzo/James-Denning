-- ============================================================
-- Renaissance Garden Schools — Add Sections
-- Migration: 002_add_sections
-- Adds sections (Nursery, Primary, Secondary, etc.)
-- ============================================================

-- ── SECTIONS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sections (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,   -- e.g. "Nursery", "Primary", "Secondary"
  code        TEXT UNIQUE,            -- e.g. "NUR", "PRI", "SEC"
  description TEXT,
  is_active   BOOLEAN DEFAULT TRUE,
  sort_order  INTEGER DEFAULT 0,     -- For ordering in UI
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Add section_id to existing tables ─────────────────────────────
ALTER TABLE classes 
ADD COLUMN IF NOT EXISTS section_id INT REFERENCES sections(id) ON DELETE SET NULL;

-- ── Create indexes for performance ─────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_classes_section_id ON classes(section_id);
CREATE INDEX IF NOT EXISTS idx_sections_is_active ON sections(is_active);

-- ── Insert default sections ─────────────────────────────────────────
INSERT INTO sections (name, code, description, sort_order) VALUES
('Nursery', 'NUR', 'Nursery School Section', 1),
('Primary', 'PRI', 'Primary School Section', 2),
('Secondary', 'SEC', 'Secondary School Section', 3)
ON CONFLICT (name) DO NOTHING;

-- ── Update existing classes to have sections (assume Primary for existing) ──
UPDATE classes SET section_id = (SELECT id FROM sections WHERE code = 'PRI') 
WHERE section_id IS NULL;

-- ── Enable RLS ───────────────────────────────────────────────────
ALTER TABLE sections ENABLE ROW LEVEL SECURITY;

-- ── RLS Policies ───────────────────────────────────────────────────
-- Allow public read access to active sections
CREATE POLICY "Public can view active sections" ON sections
  FOR SELECT USING (is_active = true);

-- Allow authenticated users to read all sections
CREATE POLICY "Authenticated users can read sections" ON sections
  FOR SELECT USING (auth.role() = 'authenticated');

-- Allow admins to manage sections
CREATE POLICY "Admins can manage sections" ON sections
  FOR ALL USING (
    auth.jwt() ->> 'user_role' = 'admin' OR
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
  );

-- ── Trigger to update updated_at ───────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_sections_updated_at 
    BEFORE UPDATE ON sections 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── Grant permissions ───────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON sections TO authenticated;
GRANT SELECT ON sections TO anon;
