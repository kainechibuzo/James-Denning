-- Extend the existing tenant-scoped private thread/message tables.
-- Message writes remain behind the authenticated, tenant-scoped workforce service.
alter table public.jd_workforce_agent_threads
  add column status text not null default 'active'
    check (status in ('active','archived'));

alter table public.jd_workforce_agent_messages
  add column employee_id uuid,
  add column request_id uuid,
  add column reply_to_message_id uuid,
  add column model_name text,
  add column usage_json jsonb not null default '{}'::jsonb;

update public.jd_workforce_agent_messages m
set employee_id=t.employee_id
from public.jd_workforce_agent_threads t
where t.school_id=m.school_id and t.id=m.thread_id and m.employee_id is null;

alter table public.jd_workforce_agent_messages
  alter column employee_id set not null,
  add constraint jd_workforce_agent_messages_employee_tenant_fk
    foreign key(school_id,employee_id)
    references public.jd_workforce_employees(school_id,id),
  add constraint jd_workforce_agent_messages_reply_fk
    foreign key(reply_to_message_id)
    references public.jd_workforce_agent_messages(id);

create unique index jd_workforce_agent_user_request_once
  on public.jd_workforce_agent_messages(school_id,thread_id,sender_id,request_id)
  where sender_kind='user' and request_id is not null;
create unique index jd_workforce_agent_reply_once
  on public.jd_workforce_agent_messages(school_id,reply_to_message_id)
  where sender_kind='agent' and reply_to_message_id is not null;

create or replace function public.jd_forbid_workforce_agent_message_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  raise exception 'Private specialist messages are append-only' using errcode='55000';
end;
$function$;
revoke all on function public.jd_forbid_workforce_agent_message_mutation() from public, anon, authenticated, service_role;
create trigger jd_workforce_agent_messages_immutable
  before update or delete on public.jd_workforce_agent_messages
  for each row execute function public.jd_forbid_workforce_agent_message_mutation();

grant select,insert,update on public.jd_workforce_agent_threads to service_role;
grant select,insert on public.jd_workforce_agent_messages to service_role;
revoke update,delete on public.jd_workforce_agent_messages from service_role;
