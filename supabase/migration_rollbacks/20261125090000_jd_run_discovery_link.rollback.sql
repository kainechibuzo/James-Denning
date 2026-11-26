-- Rollback of 20261125090000_jd_run_discovery_link.sql
drop function public.jd_start_discovery(uuid,uuid,text,jsonb,text,uuid);
create function public.jd_start_discovery(p_actor uuid,p_request uuid,p_idea text,p_plan jsonb,p_mode text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid;old public.jd_skill_requests%rowtype;req jsonb;result jsonb;sid uuid;autonomy_row public.jd_workspace_autonomy%rowtype;
 skill_item jsonb;entry jsonb;
begin
 tenant:=public.jd_skills_tenant(p_actor);
 select * into autonomy_row from public.jd_workspace_autonomy where school_id=tenant;
 if p_mode is distinct from coalesce(autonomy_row.mode,'assisted') then
  raise exception 'Discovery must run in the workspace autonomy mode' using errcode='22023';
 end if;
 if p_idea is null or length(coalesce(trim(p_idea),''))<10 or length(p_idea)>4000
    or p_plan is null or jsonb_typeof(p_plan)<>'object'
    or length(coalesce(p_plan->>'objective',''))<10
    or not (jsonb_typeof(p_plan->'skills')='array' and jsonb_array_length(p_plan->'skills') between 0 and 6)
    or not (jsonb_typeof(p_plan->'roles')='array' and jsonb_array_length(p_plan->'roles') between 1 and 4)
    or coalesce((p_plan->>'estimated_seconds')::int,0) not between 60 and 86400 then
  raise exception 'A bounded idea and a valid discovery plan are required' using errcode='22023';
 end if;
 for skill_item in select * from jsonb_array_elements(p_plan->'skills') loop
  if skill_item->>'id' !~ '^[a-z0-9][a-z0-9-]{1,60}$' or coalesce((skill_item->>'expected_seconds')::int,0) not between 60 and 86400 then
   raise exception 'Discovery plan skill entries are invalid' using errcode='22023';
  end if;
 end loop;
 for entry in select * from jsonb_array_elements(p_plan->'roles') loop
  if entry#>>'{}' not in ('business_advisor','research_analyst','finance_analyst','operations_planner','product_designer','software_engineer','security_reviewer','quality_assurance') then
   raise exception 'Discovery plan roles must be known specialist roles' using errcode='22023';
  end if;
 end loop;
 req:=jsonb_build_array('discovery.start',p_actor,p_idea,p_plan,p_mode);
 select * into old from public.jd_skill_requests where school_id=tenant and request_id=p_request;
 if found then if old.request<>req then raise exception 'Request conflict' using errcode='40001';end if;return old.receipt;end if;
 insert into public.jd_discovery_sessions(school_id,requested_by,idea,status,plan)
  values(tenant,p_actor,trim(p_idea),case when p_mode='autonomous' then 'proceeding' else 'proposed' end,p_plan)
  returning id into sid;
 result:=jsonb_build_object('session_id',sid,'status',case when p_mode='autonomous' then 'proceeding' else 'proposed' end,
  'mode',p_mode,'estimated_seconds',p_plan->>'estimated_seconds','hiring_enabled',false,'execution_enabled',false,'billing_enabled',false);
 insert into public.jd_skill_requests values(tenant,p_request,req,result);
 insert into public.jd_audit_events(school_id,actor_id,event_type,event_json) values(tenant,p_actor,'discovery.started',result);
 return result;
end; $$;

revoke all on function public.jd_start_discovery(uuid,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.jd_start_discovery(uuid,uuid,text,jsonb,text) to service_role;
drop index if exists public.jd_discovery_sessions_run;
alter table public.jd_discovery_sessions drop column if exists run_id;
