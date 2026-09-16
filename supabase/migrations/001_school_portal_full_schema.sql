-- ============================================================
-- Renaissance Garden Schools — Full Portal Schema
-- Migration: 001_school_portal_full_schema
-- Run this on a fresh Supabase project to recreate the DB
-- ============================================================

-- ── Extensions ──────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── PROFILES (linked to Supabase Auth) ──────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT,
  full_name   TEXT,
  role        TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('admin','teacher','student','parent')),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── SESSIONS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,   -- e.g. "2024/2025"
  is_active   BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── TERMS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS terms (
  id          SERIAL PRIMARY KEY,
  session_id  INT REFERENCES sessions(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,          -- e.g. "1st Term"
  is_active   BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── CLASSES ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS classes (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,   -- e.g. "JSS1A"
  level       TEXT NOT NULL,          -- e.g. "JSS1"
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── SUBJECTS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subjects (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  code        TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── CLASS_SUBJECTS (many-to-many) ───────────────────────────
CREATE TABLE IF NOT EXISTS class_subjects (
  id          SERIAL PRIMARY KEY,
  class_id    INT REFERENCES classes(id) ON DELETE CASCADE,
  subject_id  INT REFERENCES subjects(id) ON DELETE CASCADE,
  UNIQUE(class_id, subject_id)
);

-- ── TEACHERS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teachers (
  id          SERIAL PRIMARY KEY,
  profile_id  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  staff_id    TEXT UNIQUE,
  full_name   TEXT NOT NULL,
  email       TEXT,
  phone       TEXT,
  gender      TEXT DEFAULT 'Male',
  date_joined DATE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── CLASS_TEACHERS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS class_teachers (
  id          SERIAL PRIMARY KEY,
  class_id    INT REFERENCES classes(id) ON DELETE CASCADE,
  teacher_id  INT REFERENCES teachers(id) ON DELETE CASCADE,
  session_id  INT REFERENCES sessions(id) ON DELETE CASCADE,
  UNIQUE(class_id, teacher_id, session_id)
);

-- ── TEACHER_SUBJECTS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teacher_subjects (
  id          SERIAL PRIMARY KEY,
  teacher_id  INT REFERENCES teachers(id) ON DELETE CASCADE,
  class_id    INT REFERENCES classes(id) ON DELETE CASCADE,
  subject_id  INT REFERENCES subjects(id) ON DELETE CASCADE,
  session_id  INT REFERENCES sessions(id) ON DELETE CASCADE,
  UNIQUE(teacher_id, class_id, subject_id, session_id)
);

-- ── STUDENTS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS students (
  id                TEXT PRIMARY KEY,  -- e.g. "STU001"
  name              TEXT NOT NULL,
  admission_number  TEXT UNIQUE NOT NULL,
  gender            TEXT DEFAULT 'Male',
  dob               DATE,
  admission_year    TEXT,
  graduation_year   TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ── STUDENT_PROFILES ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS student_profiles (
  id          SERIAL PRIMARY KEY,
  student_id  TEXT REFERENCES students(id) ON DELETE CASCADE,
  profile_id  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  class_id    INT REFERENCES classes(id) ON DELETE SET NULL,
  UNIQUE(student_id)
);

-- ── PORTAL_RESULTS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS portal_results (
  id          SERIAL PRIMARY KEY,
  student_id  TEXT REFERENCES students(id) ON DELETE CASCADE,
  class_id    INT REFERENCES classes(id) ON DELETE CASCADE,
  subject_id  INT REFERENCES subjects(id) ON DELETE CASCADE,
  term_id     INT REFERENCES terms(id) ON DELETE CASCADE,
  session_id  INT REFERENCES sessions(id) ON DELETE CASCADE,
  ca_score    NUMERIC(5,2) CHECK (ca_score >= 0 AND ca_score <= 40),
  exam_score  NUMERIC(5,2) CHECK (exam_score >= 0 AND exam_score <= 60),
  total_score NUMERIC(5,2) GENERATED ALWAYS AS (COALESCE(ca_score,0) + COALESCE(exam_score,0)) STORED,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, class_id, subject_id, term_id, session_id)
);

-- ── GRADING_SCHEMA ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS grading_schema (
  id          SERIAL PRIMARY KEY,
  min_score   NUMERIC NOT NULL,
  max_score   NUMERIC NOT NULL,
  grade       TEXT NOT NULL,
  remark      TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── FEE_STRUCTURES ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fee_structures (
  id          SERIAL PRIMARY KEY,
  class_id    INT REFERENCES classes(id) ON DELETE SET NULL,  -- NULL = all classes
  session_id  INT REFERENCES sessions(id) ON DELETE CASCADE,
  term_id     INT REFERENCES terms(id) ON DELETE SET NULL,    -- NULL = all terms
  fee_type    TEXT NOT NULL,
  amount      NUMERIC NOT NULL CHECK (amount >= 0),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── PAYMENTS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id                  SERIAL PRIMARY KEY,
  student_id          TEXT REFERENCES students(id) ON DELETE CASCADE,
  session_id          INT REFERENCES sessions(id),
  term_id             INT REFERENCES terms(id),
  amount              NUMERIC NOT NULL,
  fee_type            TEXT,
  payment_reference   TEXT UNIQUE,
  paystack_reference  TEXT,
  payment_status      TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending','success','failed')),
  payment_date        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ── ANNOUNCEMENTS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS announcements (
  id          SERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  audience    TEXT DEFAULT 'all' CHECK (audience IN ('all','students','teachers','parents')),
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── UPLOADED_FILES (from standalone transcript system) ───────
CREATE TABLE IF NOT EXISTS uploaded_files (
  id          TEXT PRIMARY KEY,
  student_id  TEXT REFERENCES students(id) ON DELETE CASCADE,
  filename    TEXT NOT NULL,
  file_url    TEXT,
  doc_type    TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- RLS POLICIES
-- ============================================================

ALTER TABLE profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE terms           ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects        ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_subjects  ENABLE ROW LEVEL SECURITY;
ALTER TABLE teachers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_teachers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE students        ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_results  ENABLE ROW LEVEL SECURITY;
ALTER TABLE grading_schema  ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_structures  ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements   ENABLE ROW LEVEL SECURITY;
ALTER TABLE uploaded_files  ENABLE ROW LEVEL SECURITY;

-- Helper functions
CREATE OR REPLACE FUNCTION auth_role()
RETURNS TEXT LANGUAGE SQL SECURITY DEFINER AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION auth_student_id()
RETURNS TEXT LANGUAGE SQL SECURITY DEFINER AS $$
  SELECT student_id FROM student_profiles WHERE profile_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION auth_teacher_id()
RETURNS INT LANGUAGE SQL SECURITY DEFINER AS $$
  SELECT id FROM teachers WHERE profile_id = auth.uid();
$$;

-- Profiles: users see their own row; admins see all
CREATE POLICY "profiles_select" ON profiles FOR SELECT
  USING (id = auth.uid() OR auth_role() = 'admin');
CREATE POLICY "profiles_insert" ON profiles FOR INSERT
  WITH CHECK (id = auth.uid() OR auth_role() = 'admin');
CREATE POLICY "profiles_update" ON profiles FOR UPDATE
  USING (id = auth.uid() OR auth_role() = 'admin');

-- Reference tables: public read, admin write
DO $$
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['sessions','terms','classes','subjects','class_subjects','grading_schema','fee_structures']
  LOOP
    EXECUTE format('CREATE POLICY "%s_read" ON %I FOR SELECT USING (true)', tbl, tbl);
    EXECUTE format('CREATE POLICY "%s_write" ON %I FOR ALL USING (auth_role() = ''admin'')', tbl, tbl);
  END LOOP;
END$$;

-- Teachers: all roles read; admin writes
CREATE POLICY "teachers_read"  ON teachers FOR SELECT USING (true);
CREATE POLICY "teachers_write" ON teachers FOR ALL USING (auth_role() = 'admin');

-- Class/teacher assignments
CREATE POLICY "ct_read"  ON class_teachers  FOR SELECT USING (true);
CREATE POLICY "ct_write" ON class_teachers  FOR ALL USING (auth_role() = 'admin');
CREATE POLICY "ts_read"  ON teacher_subjects FOR SELECT USING (true);
CREATE POLICY "ts_write" ON teacher_subjects FOR ALL USING (auth_role() IN ('admin','teacher'));

-- Students: admin full access; students see own row
CREATE POLICY "students_admin"   ON students FOR ALL USING (auth_role() = 'admin');
CREATE POLICY "students_self"    ON students FOR SELECT USING (id = auth_student_id());

-- Student profiles: admin full; student own
CREATE POLICY "sp_admin"  ON student_profiles FOR ALL USING (auth_role() = 'admin');
CREATE POLICY "sp_self"   ON student_profiles FOR SELECT USING (profile_id = auth.uid());

-- Results: admin full; teacher their subjects; student own
CREATE POLICY "results_admin"   ON portal_results FOR ALL USING (auth_role() = 'admin');
CREATE POLICY "results_teacher" ON portal_results FOR ALL
  USING (
    auth_role() = 'teacher' AND EXISTS (
      SELECT 1 FROM teacher_subjects ts
      WHERE ts.teacher_id = auth_teacher_id()
        AND ts.class_id = portal_results.class_id
        AND ts.subject_id = portal_results.subject_id
    )
  );
CREATE POLICY "results_student" ON portal_results FOR SELECT
  USING (student_id = auth_student_id());

-- Payments: admin full; student own
CREATE POLICY "payments_admin"   ON payments FOR ALL USING (auth_role() = 'admin');
CREATE POLICY "payments_student" ON payments FOR ALL USING (student_id = auth_student_id());

-- Announcements: admin/teacher write; all read
CREATE POLICY "ann_read"  ON announcements FOR SELECT USING (true);
CREATE POLICY "ann_write" ON announcements FOR ALL USING (auth_role() IN ('admin','teacher'));

-- Uploaded files: admin full; student own
CREATE POLICY "uf_admin"  ON uploaded_files FOR ALL USING (auth_role() = 'admin');
CREATE POLICY "uf_student" ON uploaded_files FOR SELECT USING (student_id = auth_student_id());

-- ============================================================
-- SEED DATA
-- ============================================================

-- Grading schema
INSERT INTO grading_schema (min_score, max_score, grade, remark) VALUES
  (70, 100, 'A', 'Excellent'),
  (60, 69,  'B', 'Very Good'),
  (50, 59,  'C', 'Good'),
  (45, 49,  'D', 'Pass'),
  (40, 44,  'E', 'Fair'),
  (0,  39,  'F', 'Fail')
ON CONFLICT DO NOTHING;

-- Active session
INSERT INTO sessions (name, is_active) VALUES ('2024/2025', TRUE)
ON CONFLICT DO NOTHING;

-- Terms for active session
INSERT INTO terms (session_id, name, is_active)
SELECT id, '1st Term', TRUE  FROM sessions WHERE name = '2024/2025'
ON CONFLICT DO NOTHING;
INSERT INTO terms (session_id, name, is_active)
SELECT id, '2nd Term', FALSE FROM sessions WHERE name = '2024/2025'
ON CONFLICT DO NOTHING;
INSERT INTO terms (session_id, name, is_active)
SELECT id, '3rd Term', FALSE FROM sessions WHERE name = '2024/2025'
ON CONFLICT DO NOTHING;

-- Classes
INSERT INTO classes (name, level) VALUES
  ('JSS 1A','JSS1'),('JSS 1B','JSS1'),
  ('JSS 2A','JSS2'),('JSS 2B','JSS2'),
  ('JSS 3A','JSS3'),('JSS 3B','JSS3')
ON CONFLICT DO NOTHING;

-- Subjects
INSERT INTO subjects (name, code) VALUES
  ('Mathematics',              'MTH'),
  ('English Language',         'ENG'),
  ('Basic Science',            'BSC'),
  ('Basic Technology',         'BTC'),
  ('Social Studies',           'SST'),
  ('Civic Education',          'CIV'),
  ('Agricultural Science',     'AGR'),
  ('Computer Studies',         'CMP'),
  ('Physical & Health Ed.',    'PHE'),
  ('Fine Arts',                'FAR'),
  ('French Language',          'FRN'),
  ('Christian Religious Studies', 'CRS'),
  ('Home Economics',           'HEC'),
  ('Music',                    'MUS')
ON CONFLICT DO NOTHING;

-- Assign all subjects to all JSS classes
INSERT INTO class_subjects (class_id, subject_id)
SELECT c.id, s.id
FROM classes c, subjects s
WHERE c.level LIKE 'JSS%'
ON CONFLICT DO NOTHING;

-- Fee structures
INSERT INTO fee_structures (class_id, session_id, term_id, fee_type, amount)
SELECT c.id, ses.id, t.id, 'Tuition', 120000
FROM classes c, sessions ses, terms t
WHERE ses.name = '2024/2025' AND t.name = '1st Term' AND t.session_id = ses.id
ON CONFLICT DO NOTHING;

INSERT INTO fee_structures (class_id, session_id, term_id, fee_type, amount)
SELECT c.id, ses.id, t.id, 'Development Fee', 15000
FROM classes c, sessions ses, terms t
WHERE ses.name = '2024/2025' AND t.name = '1st Term' AND t.session_id = ses.id
ON CONFLICT DO NOTHING;

INSERT INTO fee_structures (class_id, session_id, term_id, fee_type, amount)
SELECT c.id, ses.id, t.id, 'ICT Fee', 10000
FROM classes c, sessions ses, terms t
WHERE ses.name = '2024/2025' AND t.name = '1st Term' AND t.session_id = ses.id
ON CONFLICT DO NOTHING;

INSERT INTO fee_structures (class_id, session_id, term_id, fee_type, amount)
SELECT NULL, ses.id, t.id, 'Exam Fee', 5000
FROM sessions ses, terms t
WHERE ses.name = '2024/2025' AND t.name = '1st Term' AND t.session_id = ses.id
ON CONFLICT DO NOTHING;
