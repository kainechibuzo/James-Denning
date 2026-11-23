-- Private specialist conversations are independent from assignments.
-- Messages are append-only; the service derives tenant and actor from auth.

create table public.jd_workforce_agent_threads (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  employee_id uuid not null references public.jd_workforce_employees(id),
  created_by uuid not null references auth.users(id),
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (school_id,id),
  unique (school_id,employee_id,created_by)
);
alter table public.jd_workforce_agent_threads enable row level security;
revoke all on public.jd_workforce_agent_threads from public,anon,authenticated;
grant select,insert,update on public.jd_workforce_agent_threads to service_role;

create table public.jd_workforce_agent_messages (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  thread_id uuid not null references public.jd_workforce_agent_threads(id),
  employee_id uuid not null references public.jd_workforce_employees(id),
  sender_kind text not null check (sender_kind in ('user','agent')),
  sender_id uuid not null references auth.users(id),
  content text not null check (length(content) between 1 and 12000),
  request_id uuid,
  reply_to_message_id uuid references public.jd_workforce_agent_messages(id),
  model_name text,
  usage_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  unique (school_id,id)
);
alter table public.jd_workforce_agent_messages enable row level security;
revoke all on public.jd_workforce_agent_messages from public,anon,authenticated;
grant select,insert on public.jd_workforce_agent_messages to service_role;

create unique index jd_workforce_agent_user_request_once
  on public.jd_workforce_agent_messages(school_id,thread_id,sender_id,request_id)
  where sender_kind='user' and request_id is not null;
create unique index jd_workforce_agent_reply_once
  on public.jd_workforce_agent_messages(school_id,reply_to_message_id)
  where sender_kind='agent' and reply_to_message_id is not null;
create index jd_workforce_agent_messages_thread_recent
  on public.jd_workforce_agent_messages(school_id,thread_id,created_at);

create or replace function public.jd_forbid_workforce_agent_message_mutation()
returns trigger language plpgsql as $function$
begin
  raise exception 'Private specialist messages are append-only' using errcode='55000';
end;
$function$;
create trigger jd_workforce_agent_messages_immutable
  before update or delete on public.jd_workforce_agent_messages
  for each row execute function public.jd_forbid_workforce_agent_message_mutation();

