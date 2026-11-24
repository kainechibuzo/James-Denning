-- Read-only catalogue of tenant-published, execution-authorised registry agents.
create or replace function public.jd_list_workforce_specialists(p_actor uuid)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare
  v_school uuid;
  v_items jsonb;
begin
  v_school:=public.jd_agent_registry_tenant(p_actor);
  select coalesce(jsonb_agg(x),'[]'::jsonb) into v_items
  from (
    select jsonb_build_object(
      'specialist_kind','registry',
      'specialist_ref',a.id::text,
      'specialist_version',a.current_version,
      'name',v.content->>'name',
      'responsibility',v.content->>'responsibility',
      'capabilities',v.content->'capabilities',
      'deliverables',v.content->'deliverables',
      'limitations',v.content->'limitations'
    ) as x
    from public.jd_agent_definitions a
    join public.jd_agent_definition_versions v
      on v.agent_id=a.id and v.school_id=a.school_id and v.version=a.current_version
    where a.school_id=v_school and a.state='published' and a.execution_authorized is true
    order by lower(v.content->>'name'),a.id
    limit 500
  ) q;
  return jsonb_build_object(
    'specialists',v_items,
    'count',jsonb_array_length(v_items),
    'publication_scope','tenant_private',
    'read_only',true,
    'hiring_enabled',false,
    'billing_enabled',false
  );
end;
$function$;
revoke all on function public.jd_list_workforce_specialists(uuid) from public,anon,authenticated;
grant execute on function public.jd_list_workforce_specialists(uuid) to service_role;
