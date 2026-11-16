-- Disable assignment in the UI/edge before applying this rollback. Keep the
-- legacy unchecked endpoint retired; never restore silent last-writer-wins.
-- Assignment records and audit history are deliberately preserved.
drop function if exists public.jd_assign_operational_task(uuid,uuid,uuid,uuid,timestamptz);
