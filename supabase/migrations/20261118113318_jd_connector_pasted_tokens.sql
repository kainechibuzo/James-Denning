-- Pasted credentials reuse encrypted, generation-checked OAuth token storage.
-- token:<provider> distinguishes manually rotated credentials without changing
-- consumers: no expiry/refresh token means no automatic OAuth refresh.
begin;
create function public.jd_save_connector_pasted_token(p_actor uuid,p_provider text,p_bundle text)
returns table(server_id uuid,generation integer) language plpgsql security definer set search_path='' as $$
declare p record;s public.jd_connector_servers;endpoint text;display_name text;host_name text;
begin
 select school_id,role into p from public.profiles where id=p_actor;
 if p.school_id is null or coalesce(p.role,'') not in ('owner','admin','manager') then raise exception 'Workspace permission required';end if;
 select e.url,e.name into endpoint,display_name from (values
 ('github','https://api.githubcopilot.com/mcp/','GitHub'),
 ('linear','https://mcp.linear.app/mcp/readonly','Linear'),
 ('airtable','https://mcp.airtable.com/mcp','Airtable'),
 ('resend','https://mcp.resend.com/mcp','Resend'),
 ('apify','https://mcp.apify.com','Apify'),
 ('context7','https://mcp.context7.com/mcp','Context7')
 ) as e(provider,url,name) where e.provider=p_provider;
 if endpoint is null then raise exception 'Unsupported token provider';end if;
 if p_bundle is null or length(p_bundle)<20 or length(p_bundle)>140000 then raise exception 'Invalid encrypted credentials';end if;
 host_name:=split_part(split_part(endpoint,'://',2),'/',1);
 insert into public.jd_connector_servers(school_id,name,endpoint_url,host,status,created_by,oauth_provider_id,access_owner_user_id,oauth_actor_id)
 values(p.school_id,display_name,endpoint,host_name,'disabled',p_actor,'token:'||p_provider,p_actor,p_actor)
 on conflict(school_id,host,endpoint_url) do nothing;
 select * into s from public.jd_connector_servers where school_id=p.school_id and endpoint_url=endpoint and host=host_name for update;
 if s.access_owner_user_id is distinct from p_actor or coalesce(s.oauth_actor_id,s.created_by) is distinct from p_actor then raise exception 'Connection slot belongs to another user or has shared history';end if;
 update public.jd_connector_servers set status='error',oauth_provider_id='token:'||p_provider,oauth_actor_id=p_actor,
 oauth_generation=oauth_generation+1,last_error_code='DISCOVERY_REQUIRED',updated_at=now() where id=s.id returning * into s;
 delete from public.jd_connector_oauth_tokens where jd_connector_oauth_tokens.server_id=s.id;
 delete from public.jd_connector_credentials where jd_connector_credentials.server_id=s.id;
 delete from public.jd_connector_tools where jd_connector_tools.server_id=s.id;
 delete from public.jd_connector_grants where jd_connector_grants.server_id=s.id;
 update public.jd_connector_approvals set status='expired' where jd_connector_approvals.server_id=s.id and status='pending';
 update public.jd_connector_oauth_states set consumed_at=now() where jd_connector_oauth_states.server_id=s.id and consumed_at is null;
 insert into public.jd_connector_oauth_tokens(server_id,school_id,generation,bundle_ciphertext,expires_at)
 values(s.id,s.school_id,s.oauth_generation,p_bundle,null);
 return query select s.id,s.oauth_generation;
end;$$;
revoke all on function public.jd_save_connector_pasted_token(uuid,text,text) from public,anon,authenticated;
grant execute on function public.jd_save_connector_pasted_token(uuid,text,text) to service_role;
commit;
