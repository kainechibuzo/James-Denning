-- OAuth credentials are service-role only. Legacy connector sharing is unchanged;
-- new OAuth connections default to the authorising user's private account.
begin;
alter table public.jd_connector_servers add column oauth_provider_id text;
alter table public.jd_connector_servers add column access_owner_user_id uuid references auth.users(id);
alter table public.jd_connector_servers add column oauth_actor_id uuid references auth.users(id);
alter table public.jd_connector_servers add column oauth_generation integer not null default 0;
create table public.jd_connector_oauth_states (
 state_hash text primary key,server_id uuid not null references public.jd_connector_servers(id) on delete cascade,
 school_id uuid not null references public.schools(id) on delete cascade,actor_id uuid not null references auth.users(id),
 provider_id text not null,generation integer not null,verifier_ciphertext text not null,
 config_hash text not null,redirect_uri text not null,expires_at timestamptz not null,consumed_at timestamptz
);
create table public.jd_connector_oauth_tokens (
 server_id uuid primary key references public.jd_connector_servers(id) on delete cascade,
 school_id uuid not null references public.schools(id) on delete cascade,generation integer not null,
 bundle_ciphertext text not null check(length(bundle_ciphertext)<=140000),expires_at timestamptz,
 lease_id uuid,lease_until timestamptz,updated_at timestamptz not null default now()
);
alter table public.jd_connector_oauth_states enable row level security;
alter table public.jd_connector_oauth_tokens enable row level security;
revoke all on public.jd_connector_oauth_states,public.jd_connector_oauth_tokens from public,anon,authenticated;
grant select,insert,update,delete on public.jd_connector_oauth_states,public.jd_connector_oauth_tokens to service_role;

create function public.jd_begin_connector_oauth(p_actor uuid,p_provider text,p_endpoint text,p_name text,p_shared boolean,p_state_hash text,p_verifier text,p_config_hash text,p_redirect text)
returns uuid language plpgsql security definer set search_path='' as $$
declare p record;s public.jd_connector_servers;host_name text;
begin
 select school_id,role into p from public.profiles where id=p_actor;
 if p.school_id is null or coalesce(p.role,'') not in ('owner','admin','manager') then raise exception 'Workspace permission required';end if;
 if p_shared and coalesce(p.role,'') not in ('owner','admin') then raise exception 'Only owners/admins may share an account';end if;
 host_name:=split_part(split_part(p_endpoint,'://',2),'/',1);
 -- Upsert lock prevents two people acquiring the same workspace/provider slot.
 insert into public.jd_connector_servers(school_id,name,endpoint_url,host,status,created_by,oauth_provider_id,access_owner_user_id,oauth_actor_id)
 values(p.school_id,p_name,p_endpoint,host_name,'disabled',p_actor,p_provider,case when p_shared then null else p_actor end,p_actor)
 on conflict(school_id,host,endpoint_url) do nothing;
 select * into s from public.jd_connector_servers where school_id=p.school_id and endpoint_url=p_endpoint and host=host_name for update;
 if coalesce(s.oauth_actor_id,s.created_by)<>p_actor then raise exception 'Another user owns this connection slot';end if;
 -- Sharing is immutable on a server/history slot: reconnect cannot expose old
 -- private execution results to the organisation.
 if s.access_owner_user_id is distinct from (case when p_shared then null else p_actor end) then raise exception 'Sharing scope cannot change on an existing connection history';end if;
 update public.jd_connector_servers set status='disabled',oauth_provider_id=p_provider,oauth_actor_id=p_actor,
 access_owner_user_id=case when p_shared then null else p_actor end,oauth_generation=oauth_generation+1,last_error_code='OAUTH_PENDING'
 where id=s.id returning * into s;
 delete from public.jd_connector_oauth_tokens where server_id=s.id;
 delete from public.jd_connector_credentials where server_id=s.id;
 delete from public.jd_connector_tools where server_id=s.id;
 delete from public.jd_connector_grants where server_id=s.id;
 update public.jd_connector_approvals set status='expired' where server_id=s.id and status='pending';
 update public.jd_connector_oauth_states set consumed_at=now() where server_id=s.id and consumed_at is null;
 insert into public.jd_connector_oauth_states values(p_state_hash,s.id,p.school_id,p_actor,p_provider,s.oauth_generation,p_verifier,p_config_hash,p_redirect,now()+interval '10 minutes',null);
 return s.id;
end;$$;
create function public.jd_consume_connector_oauth(p_state_hash text) returns setof public.jd_connector_oauth_states
language sql security definer set search_path='' as $$
 update public.jd_connector_oauth_states set consumed_at=now() where state_hash=p_state_hash and consumed_at is null and expires_at>now() returning *;
$$;
create function public.jd_finish_connector_oauth(p_server uuid,p_actor uuid,p_generation integer,p_bundle text,p_expiry timestamptz)
returns boolean language plpgsql security definer set search_path='' as $$
declare s public.jd_connector_servers;p record;
begin
 select * into s from public.jd_connector_servers where id=p_server for update;
 select school_id,role into p from public.profiles where id=p_actor;
 if s.id is null or s.oauth_actor_id<>p_actor or s.oauth_generation<>p_generation or s.last_error_code is distinct from 'OAUTH_PENDING'
 or p.school_id is distinct from s.school_id or coalesce(p.role,'') not in ('owner','admin','manager')
 or (s.access_owner_user_id is null and coalesce(p.role,'') not in ('owner','admin')) then return false;end if;
 insert into public.jd_connector_oauth_tokens(server_id,school_id,generation,bundle_ciphertext,expires_at)
 values(s.id,s.school_id,s.oauth_generation,p_bundle,p_expiry);
 update public.jd_connector_servers set status='error',last_error_code='DISCOVERY_REQUIRED' where id=s.id;
 return true;
end;$$;
create function public.jd_disconnect_connector_oauth(p_server uuid,p_actor uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare s public.jd_connector_servers;p record;
begin
 select * into s from public.jd_connector_servers where id=p_server for update;
 select school_id,role into p from public.profiles where id=p_actor;
 if s.id is null or p.school_id is distinct from s.school_id or coalesce(p.role,'') not in ('owner','admin','manager')
 or (s.access_owner_user_id is not null and s.access_owner_user_id<>p_actor) then return false;end if;
 update public.jd_connector_servers set status='disabled',oauth_generation=oauth_generation+1,last_error_code=null where id=s.id;
 delete from public.jd_connector_oauth_tokens where server_id=s.id;
 delete from public.jd_connector_credentials where server_id=s.id;
 delete from public.jd_connector_tools where server_id=s.id;
 delete from public.jd_connector_grants where server_id=s.id;
 update public.jd_connector_approvals set status='expired' where server_id=s.id and status='pending';
 update public.jd_connector_oauth_states set consumed_at=now() where server_id=s.id and consumed_at is null;
 return true;
end;$$;
-- A refresh lease serializes rotating refresh tokens. CAS completion cannot
-- recreate a credential deleted by disconnect or a newer OAuth generation.
create function public.jd_claim_connector_refresh(p_server uuid,p_school uuid,p_generation integer,p_lease uuid) returns boolean
language sql security definer set search_path='' as $$
 with changed as(update public.jd_connector_oauth_tokens set lease_id=p_lease,lease_until=now()+interval '45 seconds'
 where server_id=p_server and school_id=p_school and generation=p_generation and (lease_until is null or lease_until<now()) returning 1)
 select exists(select 1 from changed);
$$;
create function public.jd_save_connector_refresh(p_server uuid,p_school uuid,p_generation integer,p_lease uuid,p_bundle text,p_expiry timestamptz) returns boolean
language sql security definer set search_path='' as $$
 with changed as(update public.jd_connector_oauth_tokens set bundle_ciphertext=p_bundle,expires_at=p_expiry,lease_id=null,lease_until=null,updated_at=now()
 where server_id=p_server and school_id=p_school and generation=p_generation and lease_id=p_lease and lease_until>now() returning 1)
 select exists(select 1 from changed);
$$;
revoke all on function public.jd_begin_connector_oauth(uuid,text,text,text,boolean,text,text,text,text),public.jd_consume_connector_oauth(text),public.jd_finish_connector_oauth(uuid,uuid,integer,text,timestamptz),public.jd_disconnect_connector_oauth(uuid,uuid),public.jd_claim_connector_refresh(uuid,uuid,integer,uuid),public.jd_save_connector_refresh(uuid,uuid,integer,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.jd_begin_connector_oauth(uuid,text,text,text,boolean,text,text,text,text),public.jd_consume_connector_oauth(text),public.jd_finish_connector_oauth(uuid,uuid,integer,text,timestamptz),public.jd_disconnect_connector_oauth(uuid,uuid),public.jd_claim_connector_refresh(uuid,uuid,integer,uuid),public.jd_save_connector_refresh(uuid,uuid,integer,uuid,text,timestamptz) to service_role;
create function public.jd_save_connector_oauth_discovery(p_server uuid,p_school uuid,p_generation integer,p_tools jsonb,p_protocol text,p_info jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare s public.jd_connector_servers;t jsonb;
begin
 select * into s from public.jd_connector_servers where id=p_server and school_id=p_school for update;
 if s.id is null or s.oauth_generation<>p_generation or not exists(select 1 from public.jd_connector_oauth_tokens where server_id=s.id and generation=p_generation) then return false;end if;
 if jsonb_typeof(p_tools)<>'array' or jsonb_array_length(p_tools)>250 then raise exception 'Invalid tool catalogue';end if;
 delete from public.jd_connector_tools where server_id=s.id;
 for t in select * from jsonb_array_elements(p_tools) loop
  insert into public.jd_connector_tools(school_id,server_id,name,description,input_schema,annotations,read_only)
  values(s.school_id,s.id,t->>'name',coalesce(t->>'description',''),coalesce(t->'input_schema','{}'),coalesce(t->'annotations','{}'),false);
 end loop;
 update public.jd_connector_servers set status='connected',last_error_code=null,last_connected_at=now(),protocol_version=p_protocol,server_info=p_info,updated_at=now() where id=s.id;
 return true;
end;$$;
revoke all on function public.jd_save_connector_oauth_discovery(uuid,uuid,integer,jsonb,text,jsonb) from public,anon,authenticated;
grant execute on function public.jd_save_connector_oauth_discovery(uuid,uuid,integer,jsonb,text,jsonb) to service_role;
commit;
