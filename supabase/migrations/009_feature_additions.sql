-- ============================================================
-- Renaissance Garden Schools — Feature Additions
-- Migration: 009_feature_additions
-- Adds: show_attendance to report_card_publish,
--       new role permissions for attendance/email
-- ============================================================

ALTER TABLE report_card_publish
  ADD COLUMN IF NOT EXISTS show_attendance BOOLEAN DEFAULT FALSE;

INSERT INTO role_permissions (role, page_id, allowed, updated_at) VALUES
  ('teacher', 'attendance',        true,  NOW()),
  ('teacher', 'manage-attendance', true,  NOW()),
  ('teacher', 'send-emails',       false, NOW()),
  ('teacher', 'view-email-logs',   false, NOW())
ON CONFLICT (role, page_id) DO NOTHING;
