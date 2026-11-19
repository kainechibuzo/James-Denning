begin;

-- Restore the prior conservative behaviour: OAuth-discovered tools require approval.
update public.jd_connector_tools t
set read_only=false
from public.jd_connector_servers s
where s.id=t.server_id
  and s.school_id=t.school_id
  and s.oauth_provider_id is not null;

create or replace function public.jd_save_connector_oauth_discovery(
 p_server uuid,p_school uuid,p_generation integer,p_tools jsonb,p_protocol text,p_info jsonb
) returns boolean
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
end;
$$;

revoke all on function public.jd_save_connector_oauth_discovery(uuid,uuid,integer,jsonb,text,jsonb)
 from public,anon,authenticated;
grant execute on function public.jd_save_connector_oauth_discovery(uuid,uuid,integer,jsonb,text,jsonb)
 to service_role;

commit;
