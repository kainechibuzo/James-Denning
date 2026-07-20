-- ============================================================
-- Renaissance Garden Schools — Student Attendance System
-- Migration: 007_attendance
-- ============================================================

CREATE TABLE IF NOT EXISTS attendance (
  id            SERIAL PRIMARY KEY,
  school_id     UUID REFERENCES schools(id) ON DELETE CASCADE,
  student_id    TEXT REFERENCES students(id) ON DELETE CASCADE,
  class_id      INT  REFERENCES classes(id)  ON DELETE CASCADE,
  date          DATE NOT NULL,
  status        TEXT NOT NULL DEFAULT 'present'
                CHECK (status IN ('present','absent','late','excused')),
  term_id       INT  REFERENCES terms(id)    ON DELETE CASCADE,
  session_id    INT  REFERENCES sessions(id) ON DELETE CASCADE,
  recorded_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  -- Was UNIQUE(student_id, date) — missing school_id entirely, and didn't
  -- match the app's upsertAttendance() onConflict:'school_id,student_id,date'.
  UNIQUE(school_id, student_id, date)
);

ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "open_all_attendance" ON attendance
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON attendance TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE attendance_id_seq TO anon, authenticated;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_attendance_updated_at ON attendance;
CREATE TRIGGER trg_attendance_updated_at
  BEFORE UPDATE ON attendance
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
