-- Capture live production hardening applied on 2026-11-12.
-- Narrow pre-auth lookup RPCs remain available to anon for login flows,
-- but are no longer callable by authenticated clients.
REVOKE EXECUTE ON FUNCTION public.login_list_schools() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.login_lookup_access_settings(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.login_lookup_school_admin(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.login_lookup_student(uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.login_lookup_teacher(uuid, text) FROM authenticated;

-- Identical duplicate of jd_approvals_review_queue_idx; keep the latter.
DROP INDEX IF EXISTS public.jd_approvals_school_status_idx;
