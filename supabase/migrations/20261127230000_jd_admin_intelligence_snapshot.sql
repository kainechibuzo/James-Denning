-- Admin intelligence read model: workspace-scoped requests, execution logs and observed feature activity.
create table if not exists public.jd_feature_usage_events (
 id uuid primary key default gen_random_uuid(),
 school_id uuid not null references public.schools(id) on delete cascade,
 actor_id uuid not null references auth.users(id) on delete cascade,
 feature_key text not null check (feature_key in ('admin-dashboard','jd-chat','jd-operations','jd-skills','billing','hiring','mail-logs','notifications','permissions','settings','admin-tools','org-create')),
 created_at timestamptz not null default clock_timestamp()
);
create index if not exists jd_feature_usage_events_school_feature_created_idx
 on public.jd_feature_usage_events(school_id,feature_key,created_at desc);
alter table public.jd_feature_usage_events enable row level security;
revoke all on public.jd_feature_usage_events from public,anon,authenticated;

create or replace function public.jd_record_feature_usage(p_feature_key text)
returns void language plpgsql security definer set search_path='' as $fn$
declare v_actor uuid:=auth.uid(); v_school uuid;
begin
 if v_actor is null or p_feature_key is null or p_feature_key not in ('admin-dashboard','jd-chat','jd-operations','jd-skills','billing','hiring','mail-logs','notifications','permissions','settings','admin-tools','org-create') then
  raise exception 'Invalid feature usage event' using errcode='22023';
 end if;
 select school_id into v_school from public.profiles where id=v_actor;
 if v_school is null then raise exception 'Workspace membership required' using errcode='42501'; end if;
 insert into public.jd_feature_usage_events(school_id,actor_id,feature_key) values(v_school,v_actor,p_feature_key);
end; $fn$;
revoke all on function public.jd_record_feature_usage(text) from public,anon;
grant execute on function public.jd_record_feature_usage(text) to authenticated;

-- Request payloads and receipts are intentionally reduced to metadata to avoid exposing secrets or private content.
create or replace function public.jd_admin_intelligence_snapshot(p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := auth.uid();
  v_school uuid;
  v_limit integer := greatest(10, least(coalesce(p_limit,50),100));
  v_result jsonb;
begin
  select p.school_id into v_school
  from public.profiles p
  where p.id=v_actor and p.role='admin';

  if v_actor is null or v_school is null then
    raise exception 'Workspace administrator required' using errcode='42501';
  end if;

  with
  run_counts as (
    select count(*)::integer total,
      count(*) filter(where status in ('queued','planning','awaiting_approval','running'))::integer active,
      count(*) filter(where status='completed')::integer completed,
      count(*) filter(where status='partially_completed')::integer partial,
      count(*) filter(where status='failed')::integer failed,
      count(*) filter(where status='cancelled')::integer cancelled
    from public.jd_automation_runs where school_id=v_school
  ),
  job_counts as (
    select count(*)::integer total,
      count(*) filter(where status in ('queued','running','retry_wait'))::integer active,
      count(*) filter(where status='failed')::integer failed,
      count(*) filter(where status='cancelled')::integer cancelled
    from public.jd_execution_jobs where school_id=v_school
  ),
  approval_counts as (
    select count(*)::integer total,
      count(*) filter(where status in ('pending','awaiting_approval'))::integer pending,
      count(*) filter(where status='approved')::integer approved,
      count(*) filter(where status='rejected')::integer rejected
    from public.jd_approvals where school_id=v_school
  ),
  request_rows as (
    select 'agent_registry'::text source, request_id, null::text operation, receipt->>'status' status,
      receipt->>'agent_id' subject_id, null::text actor_id, null::timestamptz created_at,
      case when jsonb_typeof(coalesce(request,'{}'::jsonb))='object' then (select coalesce(array_agg(key),'{}') from jsonb_object_keys(coalesce(request,'{}'::jsonb)) as keys(key)) when jsonb_typeof(request)='array' then array['array_payload']::text[] else '{}'::text[] end request_fields
    from public.jd_agent_registry_requests where school_id=v_school
    union all
    select 'skill_request',request_id,null,receipt->>'status',receipt->>'skill_id',null,null,
      case when jsonb_typeof(coalesce(request,'{}'::jsonb))='object' then (select coalesce(array_agg(key),'{}') from jsonb_object_keys(coalesce(request,'{}'::jsonb)) as keys(key)) when jsonb_typeof(request)='array' then array['array_payload']::text[] else '{}'::text[] end
    from public.jd_skill_requests where school_id=v_school
    union all
    select 'workforce_provision',request_id,operation,receipt->>'status',receipt->>'employee_id',actor_id::text,created_at,
      case when jsonb_typeof(coalesce(request,'{}'::jsonb))='object' then (select coalesce(array_agg(key),'{}') from jsonb_object_keys(coalesce(request,'{}'::jsonb)) as keys(key)) when jsonb_typeof(request)='array' then array['array_payload']::text[] else '{}'::text[] end
    from public.jd_workforce_provision_requests where school_id=v_school
    union all
    select 'team_budget',request_id,'team_budget',receipt->>'status',null,actor_id::text,created_at,
      case when jsonb_typeof(coalesce(request,'{}'::jsonb))='object' then (select coalesce(array_agg(key),'{}') from jsonb_object_keys(coalesce(request,'{}'::jsonb)) as keys(key)) when jsonb_typeof(request)='array' then array['array_payload']::text[] else '{}'::text[] end
    from public.jd_workforce_team_budget_requests where school_id=v_school
    union all
    select 'usage',request_id,kind,receipt->>'status',job_id::text,null,created_at,
      case when jsonb_typeof(coalesce(request,'{}'::jsonb))='object' then (select coalesce(array_agg(key),'{}') from jsonb_object_keys(coalesce(request,'{}'::jsonb)) as keys(key)) when jsonb_typeof(request)='array' then array['array_payload']::text[] else '{}'::text[] end
    from public.jd_usage_events where school_id=v_school
    union all
    select 'specialist_proposal',request_id,specialist_role,status,run_id::text,requested_by::text,created_at,
      array['specialist_role','task','allocated_seconds','spend_cap_seconds']::text[]
    from public.jd_specialist_run_proposals where school_id=v_school
    union all
    select 'approval',id,action_key,status,run_id::text,requested_by::text,created_at,
      array['title','action_key','risk_level','execution_status']::text[]
    from public.jd_approvals where school_id=v_school
    union all
    select 'discovery',id,'discovery',status,run_id::text,requested_by::text,created_at,
      array['idea','plan']::text[]
    from public.jd_discovery_sessions where school_id=v_school
  ),
  requests_json as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'source',source,'request_id',request_id,'operation',operation,'status',status,
      'subject_id',subject_id,'actor_id',actor_id,'created_at',created_at,'request_fields',request_fields
    ) order by created_at desc nulls last), '[]'::jsonb) data
    from (select * from request_rows order by created_at desc nulls last limit v_limit) q
  ),
  audit_rows as (
    select 'jd'::text source,id::text id,event_type event,actor_id::text actor_id,run_id::text subject_id,created_at,
      case when jsonb_typeof(coalesce(event_json,'{}'::jsonb))='object' then (select coalesce(array_agg(key),'{}') from jsonb_object_keys(coalesce(event_json,'{}'::jsonb)) as keys(key)) else '{}'::text[] end detail_fields
    from public.jd_audit_events where school_id=v_school
    union all
    select 'admin'::text,id::text,action,performed_by::text,entity_id,performed_at,
      array['entity_type','entity_name','notes']::text[]
    from public.admin_audit_log where school_id=v_school
    union all
    select 'execution'::text,id::text,'execution.job.'||status,requested_by::text,run_id::text,created_at,
      array_remove(array['attempt_count','last_error_code','last_error_message'],null)::text[]
    from public.jd_execution_jobs where school_id=v_school
  ),
  audit_json as (
    select coalesce(jsonb_agg(to_jsonb(q) order by created_at desc),'[]'::jsonb) data
    from (select * from audit_rows order by created_at desc limit v_limit) q
  ),
  connector_json as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',id,'tool_name',tool_name,'status',status,'error_code',error_code,
      'duration_ms',duration_ms,'created_at',created_at,'completed_at',completed_at
    ) order by created_at desc),'[]'::jsonb) data
    from (select * from public.jd_connector_executions where school_id=v_school order by created_at desc limit v_limit) q
  ),
  top_tools as (
    select tool_name,count(*)::integer uses,
      count(*) filter(where status='failed')::integer failures
    from public.jd_connector_executions
    where school_id=v_school and tool_name is not null
    group by tool_name order by uses desc,tool_name asc limit 12
  ),
  top_features as (
    select feature_key,count(*)::integer views,count(distinct actor_id)::integer unique_users
    from public.jd_feature_usage_events where school_id=v_school
    group by feature_key order by views desc,feature_key asc limit 12
  ),
  top_events as (
    select event_type,count(*)::integer uses
    from public.jd_audit_events where school_id=v_school
    group by event_type order by uses desc,event_type asc limit 12
  ),
  message_counts as (
    select count(*)::integer messages,
      count(*) filter(where role='user')::integer user_messages,
      count(*) filter(where role='assistant')::integer assistant_messages
    from public.jd_messages where school_id=v_school
  ),
  conversation_counts as (
    select count(*)::integer conversations from public.jd_conversations where school_id=v_school
  )
  select jsonb_build_object(
    'generated_at',clock_timestamp(),
    'workspace_id',v_school,
    'runs',(select to_jsonb(run_counts) from run_counts),
    'jobs',(select to_jsonb(job_counts) from job_counts),
    'approvals',(select to_jsonb(approval_counts) from approval_counts),
    'messages',(select to_jsonb(message_counts) from message_counts),
    'conversations',(select to_jsonb(conversation_counts) from conversation_counts),
    'requests',(select data from requests_json),
    'audit_logs',(select data from audit_json),
    'connector_logs',(select data from connector_json),
    'most_used_tools',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from top_tools t),
    'most_used_features',(select coalesce(jsonb_agg(to_jsonb(f)),'[]'::jsonb) from top_features f),
    'most_active_event_types',(select coalesce(jsonb_agg(to_jsonb(e)),'[]'::jsonb) from top_events e),
    'telemetry_note','Feature rankings count recorded workspace route openings; tool rankings count recorded connector executions. These are observed navigation events, not time-on-screen or unique sessions.'
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.jd_admin_intelligence_snapshot(integer) from public, anon;
grant execute on function public.jd_admin_intelligence_snapshot(integer) to authenticated, service_role;
