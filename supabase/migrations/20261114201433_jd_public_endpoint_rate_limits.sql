create table if not exists public.public_endpoint_rate_limits (
  bucket_key text primary key,
  window_started_at timestamptz not null,
  request_count integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.public_endpoint_rate_limits enable row level security;
revoke all on table public.public_endpoint_rate_limits from anon, authenticated, public;
grant all on table public.public_endpoint_rate_limits to service_role;
create or replace function public.consume_public_endpoint_rate_limit(p_bucket_key text,p_limit integer,p_window_seconds integer)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_count integer;
begin
 if p_bucket_key is null or length(p_bucket_key)<16 or p_limit<1 or p_window_seconds<1 or p_window_seconds>3600 then return false; end if;
 insert into public.public_endpoint_rate_limits(bucket_key,window_started_at,request_count,updated_at)
 values(p_bucket_key,now(),1,now())
 on conflict(bucket_key) do update set
 request_count=case when public.public_endpoint_rate_limits.window_started_at<now()-make_interval(secs=>p_window_seconds) then 1 else public.public_endpoint_rate_limits.request_count+1 end,
 window_started_at=case when public.public_endpoint_rate_limits.window_started_at<now()-make_interval(secs=>p_window_seconds) then now() else public.public_endpoint_rate_limits.window_started_at end,
 updated_at=now()
 returning request_count into v_count;
 return v_count<=p_limit;
end; $$;
revoke all on function public.consume_public_endpoint_rate_limit(text,integer,integer) from public,anon,authenticated;
grant execute on function public.consume_public_endpoint_rate_limit(text,integer,integer) to service_role;