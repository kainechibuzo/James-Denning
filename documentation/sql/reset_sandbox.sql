-- Reset the STAGING SANDBOX school to its starting state.
-- Safe to run anytime — only touches school_id f0000000-0000-4000-8000-000000000001.
DO $$
DECLARE
  sch uuid := 'f0000000-0000-4000-8000-000000000001';
  c1 int; c2 int; c3 int; ses int;
BEGIN
  SELECT id INTO c1 FROM classes WHERE school_id=sch AND name='Test JR 1';
  SELECT id INTO c2 FROM classes WHERE school_id=sch AND name='Test JR 2';
  SELECT id INTO c3 FROM classes WHERE school_id=sch AND name='Test JR 3';

  -- Clear any promotion runs/decisions (decisions cascade on run delete).
  DELETE FROM promotion_runs WHERE school_id=sch;

  -- Remove any draft sessions created by a commit (keep the original 2025/2026).
  DELETE FROM terms   WHERE school_id=sch AND session_id IN (SELECT id FROM sessions WHERE school_id=sch AND name<>'2025/2026');
  DELETE FROM sessions WHERE school_id=sch AND name<>'2025/2026';

  -- Restore the progression map.
  UPDATE classes SET promotes_to_class_id=c2 WHERE id=c1;
  UPDATE classes SET promotes_to_class_id=c3 WHERE id=c2;
  UPDATE classes SET promotes_to_class_id=NULL WHERE id=c3;

  -- Restore students to their starting classes + active status.
  UPDATE students SET class_id=c1, status='active' WHERE school_id=sch AND id IN ('TEST/001','TEST/002');
  UPDATE students SET class_id=c2, status='active' WHERE school_id=sch AND id IN ('TEST/003','TEST/004');
  UPDATE students SET class_id=c3, status='active' WHERE school_id=sch AND id IN ('TEST/005','TEST/006');
END $$;
