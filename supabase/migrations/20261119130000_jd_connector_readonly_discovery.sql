begin;

-- Recompute read-only trust from explicit MCP annotations at the database boundary.
-- The caller is service-role-only, but persisted permission flags must still be
-- derived from the reviewed annotation policy rather than hard-coded false or
-- an untrusted provider-supplied read_only property.
create or replace function public.jd_save_connector_oauth_discovery(
 p_server uuid,
 p_school uuid,
 p_generation integer,
 p_tools jsonb,
 p_protocol text,
 p_info jsonb
) returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
 s public.jd_connector_servers;
 t jsonb;
 safe_read_only boolean;
begin
 select * into s
 from public.jd_connector_servers
 where id=p_server and school_id=p_school
 for update;

 if s.id is null
   or s.oauth_generation<>p_generation
   or not exists (
     select 1 from public.jd_connector_oauth_tokens
     where server_id=s.id and generation=p_generation
   )
 then
   return false;
 end if;

 if jsonb_typeof(p_tools)<>'array' or jsonb_array_length(p_tools)>250 then
   raise exception 'Invalid tool catalogue';
 end if;

 delete from public.jd_connector_tools
 where server_id=s.id and school_id=p_school;

 for t in select * from jsonb_array_elements(p_tools) loop
   safe_read_only :=
     coalesce(t->'annotations'->'readOnlyHint','false'::jsonb)='true'::jsonb
     and coalesce(t->'annotations'->'destructiveHint','false'::jsonb)<>'true'::jsonb
     and coalesce(t->'annotations'->'openWorldHint','false'::jsonb)<>'true'::jsonb
     and lower(coalesce(t->>'name',''))<>'run_secret_scanning'
     and (
       coalesce(s.oauth_provider_id,'') not in ('github','token:github')
       or lower(coalesce(t->>'name','')) in (
         'get_commit','get_file_contents','get_label','get_latest_release','get_me',
         'get_release_by_tag','get_tag','get_team_members','get_teams','issue_read',
         'list_branches','list_commits','list_issue_fields','list_issue_types','list_issues',
         'list_pull_requests','list_releases','list_repository_collaborators','list_tags',
         'pull_request_read','search_code','search_commits','search_issues',
         'search_pull_requests','search_repositories','search_users','ui_get'
       )
     );

   insert into public.jd_connector_tools(
     school_id,server_id,name,description,input_schema,annotations,read_only
   )
   values(
     s.school_id,
     s.id,
     t->>'name',
     coalesce(t->>'description',''),
     coalesce(t->'input_schema','{}'::jsonb),
     coalesce(t->'annotations','{}'::jsonb),
     safe_read_only
   );
 end loop;

 update public.jd_connector_servers
 set status='connected',
     last_error_code=null,
     last_connected_at=now(),
     protocol_version=p_protocol,
     server_info=p_info,
     updated_at=now()
 where id=s.id and school_id=p_school;

 return true;
end;
$$;

-- Reclassify existing OAuth-discovered tools using their stored MCP annotations.
-- Only explicitly read-only, non-destructive, non-open-world tools are trusted.
update public.jd_connector_tools t
set read_only =
  coalesce(t.annotations->'readOnlyHint','false'::jsonb)='true'::jsonb
  and coalesce(t.annotations->'destructiveHint','false'::jsonb)<>'true'::jsonb
  and coalesce(t.annotations->'openWorldHint','false'::jsonb)<>'true'::jsonb
  and lower(coalesce(t.name,''))<>'run_secret_scanning'
  and (
    coalesce(s.oauth_provider_id,'') not in ('github','token:github')
    or lower(coalesce(t.name,'')) in (
      'get_commit','get_file_contents','get_label','get_latest_release','get_me',
      'get_release_by_tag','get_tag','get_team_members','get_teams','issue_read',
      'list_branches','list_commits','list_issue_fields','list_issue_types','list_issues',
      'list_pull_requests','list_releases','list_repository_collaborators','list_tags',
      'pull_request_read','search_code','search_commits','search_issues',
      'search_pull_requests','search_repositories','search_users','ui_get'
    )
  )
from public.jd_connector_servers s
where s.id=t.server_id
  and s.school_id=t.school_id
  and s.oauth_provider_id is not null;

revoke all on function public.jd_save_connector_oauth_discovery(uuid,uuid,integer,jsonb,text,jsonb)
 from public,anon,authenticated;
grant execute on function public.jd_save_connector_oauth_discovery(uuid,uuid,integer,jsonb,text,jsonb)
 to service_role;

commit;
