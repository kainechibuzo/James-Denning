-- Pin the trigger function search path; the function uses no unqualified objects.
create or replace function public.jd_workforce_forbid_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
 raise exception 'Workforce control events are append-only' using errcode='55000';
end;
$$;
