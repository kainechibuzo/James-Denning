-- Add missing columns to students table that the app uses
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS first_name      TEXT,
  ADD COLUMN IF NOT EXISTS middle_name     TEXT,
  ADD COLUMN IF NOT EXISTS last_name       TEXT,
  ADD COLUMN IF NOT EXISTS email           TEXT,
  ADD COLUMN IF NOT EXISTS age             INT,
  ADD COLUMN IF NOT EXISTS class_id        INT REFERENCES classes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS password_hash   TEXT;

-- Back-fill first_name/last_name from name where missing
UPDATE students
  SET first_name = split_part(name, ' ', 1),
      last_name  = CASE WHEN array_length(string_to_array(name,' '),1) > 1
                        THEN split_part(name, ' ', array_length(string_to_array(name,' '),1))
                        ELSE split_part(name, ' ', 1) END
  WHERE first_name IS NULL AND name IS NOT NULL;

-- Seed default role_permissions for teacher pages (allow=true by default)
INSERT INTO role_permissions (role, page_id, allowed, updated_at)
VALUES
  ('teacher', 'add-students', true, NOW())
ON CONFLICT (role, page_id) DO NOTHING;
