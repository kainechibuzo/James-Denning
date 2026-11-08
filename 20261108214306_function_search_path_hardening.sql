-- function_search_path_hardening
alter function public.update_updated_at_column() set search_path = public, pg_temp;
