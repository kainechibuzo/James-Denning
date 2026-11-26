-- Native Google/Microsoft refresh rotation: same-person lease + credential CAS.
begin;
alter table public.jd_business_oauth_connections add column refresh_lease_id uuid;
alter table public.jd_business_oauth_connections add column refresh_lease_until timestamptz;
create function public.jd_claim_workspace_refresh(p_school uuid,p_actor uuid,p_provider text,p_previous bytea,p_lease uuid) returns boolean
language sql security definer set search_path='' as $$
 with changed as(update public.jd_business_oauth_connections c set refresh_lease_id=p_lease,refresh_lease_until=now()+interval '45 seconds'
 where c.school_id=p_school and c.connected_by=p_actor and c.provider_id=p_provider and c.status='connected' and c.encrypted_credentials=p_previous
 and p_provider in ('google-workspace','microsoft-365') and (c.refresh_lease_until is null or c.refresh_lease_until<now())
 and exists(select 1 from public.profiles p where p.id=p_actor and p.school_id=p_school and p.role in ('owner','admin','manager')) returning 1)
 select exists(select 1 from changed);
$$;
create function public.jd_save_workspace_refresh(p_school uuid,p_actor uuid,p_provider text,p_previous bytea,p_lease uuid,p_bundle bytea,p_expiry timestamptz,p_scopes text[]) returns boolean
language sql security definer set search_path='' as $$
 with changed as(update public.jd_business_oauth_connections c set encrypted_credentials=p_bundle,token_expires_at=p_expiry,scopes=p_scopes,
 refresh_lease_id=null,refresh_lease_until=null,last_error_code=null,last_checked_at=now(),updated_at=now()
 where c.school_id=p_school and c.connected_by=p_actor and c.provider_id=p_provider and c.status='connected' and c.encrypted_credentials=p_previous
 and c.refresh_lease_id=p_lease and c.refresh_lease_until>now() and p_provider in ('google-workspace','microsoft-365')
 and exists(select 1 from public.profiles p where p.id=p_actor and p.school_id=p_school and p.role in ('owner','admin','manager')) returning 1)
 select exists(select 1 from changed);
$$;
revoke all on function public.jd_claim_workspace_refresh(uuid,uuid,text,bytea,uuid),public.jd_save_workspace_refresh(uuid,uuid,text,bytea,uuid,bytea,timestamptz,text[]) from public,anon,authenticated;
grant execute on function public.jd_claim_workspace_refresh(uuid,uuid,text,bytea,uuid),public.jd_save_workspace_refresh(uuid,uuid,text,bytea,uuid,bytea,timestamptz,text[]) to service_role;
commit;
