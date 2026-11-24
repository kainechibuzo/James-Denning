-- Roll back only the additive workforce assignment lifecycle layer.
drop function if exists public.jd_read_workforce_assignment_lifecycle(uuid,integer);
drop function if exists public.jd_workforce_choose_team_member(uuid,uuid,text,text);
drop function if exists public.jd_workforce_assignment_recover(integer);
drop function if exists public.jd_workforce_assignment_finish(uuid,text,uuid,text,jsonb);
drop function if exists public.jd_workforce_assignment_ack_cancel(uuid,text,uuid,boolean);
drop function if exists public.jd_workforce_assignment_request_cancel(uuid,uuid);
drop function if exists public.jd_workforce_assignment_may_continue(uuid,text,uuid);
drop function if exists public.jd_workforce_assignment_heartbeat(uuid,text,uuid,integer);
drop function if exists public.jd_workforce_assignment_ack_started(uuid,text,uuid);
drop function if exists public.jd_workforce_assignment_claim(uuid,text,integer);
drop function if exists public.jd_workforce_assignment_enqueue(uuid,uuid,uuid,uuid,text,text,text);
drop table if exists public.jd_workforce_assignment_lifecycle;
