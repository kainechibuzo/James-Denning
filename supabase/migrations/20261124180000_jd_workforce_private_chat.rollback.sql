drop trigger if exists jd_workforce_agent_messages_immutable on public.jd_workforce_agent_messages;
drop function if exists public.jd_forbid_workforce_agent_message_mutation();
drop table if exists public.jd_workforce_agent_messages;
drop table if exists public.jd_workforce_agent_threads;
