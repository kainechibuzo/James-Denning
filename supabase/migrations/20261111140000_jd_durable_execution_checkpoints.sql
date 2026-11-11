-- JD-004C: private, lease-fenced model/tool conversation checkpoints for resumable execution.
-- Runtime state can contain prompts and tool outputs; it is deliberately not readable by browser roles.

create table if not exists public.jd_execution_checkpoints (
  job_id uuid primary key references public.jd_execution_jobs(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  runtime_state_json jsonb not null,
  state_version integer not null default 1 check (state_version = 1),
  updated_at timestamptz not null default now(),
  constraint jd_execution_checkpoints_state_size check (pg_column_size(runtime_state_json) <= 524288)
);

create index if not exists jd_execution_checkpoints_school_updated_idx
  on public.jd_execution_checkpoints (school_id, updated_at desc);

alter table public.jd_execution_checkpoints enable row level security;
revoke all on public.jd_execution_checkpoints from public, anon, authenticated;
grant all on public.jd_execution_checkpoints to service_role;

comment on table public.jd_execution_checkpoints is
  'Private resumable JD runtime state. Contains conversation and tool outputs; service-role only.';

create or replace function public.jd_save_execution_checkpoint(
  p_job_id uuid,
  p_lease_token uuid,
  p_runtime_state_json jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school_id uuid;
  v_now timestamptz := now();
begin
  if p_runtime_state_json is null or jsonb_typeof(p_runtime_state_json) <> 'object'
     or pg_column_size(p_runtime_state_json) > 524288 then
    raise exception 'Invalid or oversized execution checkpoint' using errcode = '22023';
  end if;

  select school_id into v_school_id
  from public.jd_execution_jobs
  where id = p_job_id
    and status = 'running'
    and lease_token = p_lease_token
    and lease_expires_at > v_now
  for update;

  if not found then
    return false;
  end if;

  insert into public.jd_execution_checkpoints (
    job_id, school_id, runtime_state_json, state_version, updated_at
  ) values (
    p_job_id, v_school_id, p_runtime_state_json, 1, v_now
  )
  on conflict (job_id) do update
    set runtime_state_json = excluded.runtime_state_json,
        school_id = excluded.school_id,
        state_version = 1,
        updated_at = excluded.updated_at;

  return true;
end;
$$;

revoke all on function public.jd_save_execution_checkpoint(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.jd_save_execution_checkpoint(uuid, uuid, jsonb) to service_role;
