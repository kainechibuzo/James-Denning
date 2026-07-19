-- ============================================================
-- Fix: Allow form teachers to INSERT into result_approvals
-- Migration: 006_fix_ea_insert_policy
-- Problem: ra_teacher_ea only covered UPDATE, but upsert needs
--          INSERT when no record exists yet → 401 Unauthorized
-- ============================================================

-- Allow form teachers to INSERT a result_approval row for their class
CREATE POLICY "ra_teacher_ea_insert" ON result_approvals FOR INSERT
  WITH CHECK (
    auth_role() = 'teacher' AND
    EXISTS (
      SELECT 1 FROM class_teachers ct
      WHERE ct.class_id = result_approvals.class_id
        AND ct.teacher_id = auth_teacher_id()
        AND ct.is_form_teacher = true
    )
  );
