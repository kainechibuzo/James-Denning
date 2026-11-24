drop trigger if exists jd_workforce_agent_messages_immutable on public.jd_workforce_agent_messages;
drop function if exists public.jd_forbid_workforce_agent_message_mutation();
drop index if exists public.jd_workforce_agent_user_request_once;
drop index if exists public.jd_workforce_agent_reply_once;
alter table public.jd_workforce_agent_messages
  drop constraint if exists jd_workforce_agent_messages_employee_tenant_fk,
  drop constraint if exists jd_workforce_agent_messages_reply_fk,
  drop column if exists employee_id,
  drop column if exists request_id,
  drop column if exists reply_to_message_id,
  drop column if exists model_name,
  drop column if exists usage_json;
alter table public.jd_workforce_agent_threads
  drop column if exists status;
revoke insert,update on public.jd_workforce_agent_threads from service_role;
revoke insert on public.jd_workforce_agent_messages from service_role;
grant select on public.jd_workforce_agent_threads,public.jd_workforce_agent_messages to service_role;
