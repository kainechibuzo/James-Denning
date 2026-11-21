begin;
drop function if exists public.jd_set_chat_response_style(uuid,uuid,text);
drop function if exists public.jd_release_approved_execution(uuid,uuid);
commit;
