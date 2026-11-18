-- Explicit app consent; identity-only and historical connections get NO app access.
-- No token is exposed through client RLS. Existing service-role-only policies stay.
begin;
alter table public.jd_business_oauth_connections add column if not exists enabled_read_services text[] not null default '{}';
alter table public.jd_business_oauth_states add column if not exists enabled_read_services text[] not null default '{}';
-- Changing a TABLE return signature needs a drop, inside this transaction.
drop function public.jd_consume_business_oauth_state(text);
create function public.jd_consume_business_oauth_state(p_state_hash text)
returns table(id uuid,school_id uuid,provider_id text,actor_id uuid,pkce_verifier_encrypted bytea,redirect_uri text,enabled_read_services text[])
language sql security definer set search_path='' as $$
 update public.jd_business_oauth_states s set consumed_at=now()
 where s.state_hash=p_state_hash and s.consumed_at is null and s.expires_at>now()
 returning s.id,s.school_id,s.provider_id,s.actor_id,s.pkce_verifier_encrypted,s.redirect_uri,s.enabled_read_services;
$$;
revoke all on function public.jd_consume_business_oauth_state(text) from public,anon,authenticated;
grant execute on function public.jd_consume_business_oauth_state(text) to service_role;
update public.jd_business_integration_catalog set description='Select read-only mail, files, documents, sheets and calendar apps in JD Connect. Provider app configuration and explicit consent required.', supported_capabilities=array['identity','selected_app_reads'] where id='google-workspace';
update public.jd_business_integration_catalog set description='Select read-only mail, files, calendar and Teams metadata in JD Connect. Excel and Word support file discovery, not content editing.', supported_capabilities=array['identity','selected_app_reads'] where id='microsoft-365';
-- Enforce account ownership even if two users finish OAuth concurrently.
create or replace function public.jd_guard_workspace_oauth_owner() returns trigger
language plpgsql set search_path='' as $$
begin
 if old.provider_id in ('google-workspace','microsoft-365') and old.status='connected'
    and new.connected_by is distinct from old.connected_by then
  raise exception 'Disconnect the existing workspace provider account before replacing its owner';
 end if;
 return new;
end;$$;
revoke all on function public.jd_guard_workspace_oauth_owner() from public,anon,authenticated;
create trigger jd_workspace_oauth_owner before update on public.jd_business_oauth_connections
for each row execute function public.jd_guard_workspace_oauth_owner();
commit;
