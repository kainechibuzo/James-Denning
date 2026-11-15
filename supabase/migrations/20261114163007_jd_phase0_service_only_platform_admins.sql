-- JD Phase 0: platform_admins has RLS enabled but no policies. Remove direct browser-role table privileges; service_role retains backend access.
REVOKE ALL PRIVILEGES ON TABLE public.platform_admins FROM anon, authenticated;
