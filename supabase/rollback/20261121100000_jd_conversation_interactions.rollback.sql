-- Roll the edge handler back together with this routine. Retain all existing
-- conversations, structured response snapshots, user answers and audit events.
revoke all on function public.jd_submit_chat_request(uuid,uuid,uuid,text,text,text,jsonb,jsonb,text) from public,anon,authenticated,service_role;
drop function public.jd_submit_chat_request(uuid,uuid,uuid,text,text,text,jsonb,jsonb,text);
drop index if exists public.jd_messages_client_request;
drop index if exists public.jd_messages_interaction_answer;
