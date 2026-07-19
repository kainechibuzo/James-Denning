-- ── STUDENT REQUESTS (teacher-submitted, requires admin approval) ──────────
CREATE TABLE IF NOT EXISTS student_requests (
  id              SERIAL PRIMARY KEY,
  submitted_by    TEXT NOT NULL,          -- teacher staff_id or name
  teacher_name    TEXT,
  first_name      TEXT NOT NULL,
  middle_name     TEXT,
  last_name       TEXT NOT NULL,
  email           TEXT,
  gender          TEXT DEFAULT 'Male',
  dob             DATE,
  age             INT,
  class_id        INT REFERENCES classes(id) ON DELETE SET NULL,
  admission_year  TEXT,
  source          TEXT DEFAULT 'manual'   CHECK (source IN ('manual','bulk')),
  status          TEXT DEFAULT 'pending'  CHECK (status IN ('pending','approved','rejected')),
  admin_note      TEXT,
  reviewed_at     TIMESTAMPTZ,
  reviewed_by     TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
