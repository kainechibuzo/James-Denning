-- Rollback of 20261124090000_jd_workforce_assignments.sql
drop function if exists public.jd_read_workforce_assignments(uuid,int);
drop table if exists public.jd_workforce_assignments;
drop function if exists public.jd_forbid_workforce_assignment_mutation();
