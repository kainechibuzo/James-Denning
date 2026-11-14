-- JD business role authorization matrix.
-- Original definitions are captured before any replacement so rollback is deterministic.
create schema if not exists jd_private authorization postgres;
revoke all on schema jd_private from public, anon, authenticated, service_role;
create table jd_private.authorization_function_backups (
 migration_name text not null,
 function_name text not null,
 identity_arguments text not null,
 function_definition text not null,
 captured_at timestamptz not null default now(),
 primary key(migration_name,function_name,identity_arguments)
);
revoke all on table jd_private.authorization_function_backups from public, anon, authenticated, service_role;
insert into jd_private.authorization_function_backups(migration_name,function_name,identity_arguments,function_definition)
select '20261114213713_jd_authorization_role_matrix',p.proname,pg_get_function_identity_arguments(p.oid),pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname=any(array['jd_activate_approved_workflow','jd_add_task_comment','jd_apply_settings_proposal_step','jd_auto_assign_operational_task','jd_create_operational_task','jd_create_organisation_blueprint','jd_create_task_schedule','jd_decide_approval','jd_dispatch_task_schedule','jd_requeue_failed_execution_job','jd_save_workflow_draft','jd_set_task_assignment_member','jd_submit_settings_proposal','jd_submit_workflow_review','jd_transition_operational_task']);
do $$ declare v_count integer; begin
 select count(*) into v_count from jd_private.authorization_function_backups where migration_name='20261114213713_jd_authorization_role_matrix';
 if v_count<>15 then raise exception 'Expected 15 backed up JD functions, captured %',v_count; end if;
end $$;

CREATE OR REPLACE FUNCTION public.jd_activate_approved_workflow(p_actor_id uuid, p_approval_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_school_id uuid;
  v_approval public.jd_approvals%rowtype;
  v_workflow public.jd_workflows%rowtype;
  v_version public.jd_workflow_versions%rowtype;
  v_expected_hash text;
begin
  select p.school_id into v_school_id
  from public.profiles p
  where p.id = p_actor_id and p.role in ('owner','admin');
  if v_school_id is null then
    raise exception 'Only workspace administrators can activate workflows' using errcode = '42501';
  end if;

  select * into v_approval from public.jd_approvals
  where id = p_approval_id and school_id = v_school_id for update;
  if not found then raise exception 'Workflow approval not found' using errcode = 'P0002'; end if;
  if v_approval.action_key <> 'workflow.activate' or v_approval.status <> 'approved' then
    raise exception 'Workflow activation requires an approved workflow proposal' using errcode = '42501';
  end if;

  v_expected_hash := v_approval.proposal_json->>'definition_hash';
  select * into v_workflow from public.jd_workflows
  where id = (v_approval.proposal_json->>'workflow_id')::uuid
    and school_id = v_school_id for update;
  if not found then raise exception 'Workflow not found' using errcode = 'P0002'; end if;
  select * into v_version from public.jd_workflow_versions
  where id = (v_approval.proposal_json->>'version_id')::uuid
    and workflow_id = v_workflow.id and school_id = v_school_id;
  if not found then raise exception 'Workflow version not found' using errcode = 'P0002'; end if;
  if v_version.version_no <> v_workflow.latest_version_no
     or v_version.definition_hash <> v_expected_hash
     or v_approval.proposal_hash <> encode(public.digest(convert_to(v_approval.proposal_json::text,'UTF8'),'sha256'),'hex') then
    raise exception 'Approved workflow version is stale or has been altered' using errcode = '40001';
  end if;
  if v_workflow.active_version_id = v_version.id then
    return jsonb_build_object('workflow_id',v_workflow.id,'version_id',v_version.id,
      'version_no',v_version.version_no,'status','active','execution_status','completed','duplicate',true);
  end if;

  update public.jd_workflows
  set active_version_id = v_version.id,status = 'active',updated_at = now()
  where id = v_workflow.id and school_id = v_school_id;

  update public.jd_approvals
  set execution_status = 'completed',
      execution_result_json = jsonb_build_object('workflow_id',v_workflow.id,
        'version_id',v_version.id,'version_no',v_version.version_no,
        'definition_hash',v_version.definition_hash,'activated',true),
      updated_at = now()
  where id = v_approval.id;

  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
  values(v_school_id,p_actor_id,v_approval.run_id,'workflow.activated',
    jsonb_build_object('approval_id',v_approval.id,'workflow_id',v_workflow.id,
      'version_id',v_version.id,'version_no',v_version.version_no,
      'definition_hash',v_version.definition_hash));

  return jsonb_build_object('workflow_id',v_workflow.id,'version_id',v_version.id,
    'version_no',v_version.version_no,'status','active','execution_status','completed');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.jd_add_task_comment(p_actor_id uuid, p_task_id uuid, p_body text, p_mentions uuid[] DEFAULT '{}'::uuid[], p_parent_comment_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_school uuid;
  v_task_school uuid;
  v_comment public.jd_task_comments%rowtype;
  v_mentions uuid[] := coalesce(p_mentions, '{}'::uuid[]);
begin
  select school_id into v_school
  from public.profiles
  where id=p_actor_id and role in ('owner','admin','manager');

  if v_school is null then
    raise exception 'Manager permission required' using errcode='42501';
  end if;

  if length(trim(coalesce(p_body,''))) not between 1 and 2000
     or cardinality(v_mentions)>10 then
    raise exception 'Comment body or mention list is invalid' using errcode='22023';
  end if;

  select school_id into v_task_school
  from public.jd_operational_tasks
  where id=p_task_id;

  if v_task_school is distinct from v_school then
    raise exception 'Operational task not found' using errcode='P0002';
  end if;

  if exists (
    select 1 from unnest(v_mentions) as mention(mention_id)
    left join public.profiles p on p.id=mention.mention_id and p.school_id=v_school
    where p.id is null
  ) then
    raise exception 'Every mentioned member must belong to this workspace' using errcode='42501';
  end if;

  if p_parent_comment_id is not null and not exists (
    select 1 from public.jd_task_comments
    where id=p_parent_comment_id and school_id=v_school and task_id=p_task_id
  ) then
    raise exception 'Parent comment not found for this task' using errcode='P0002';
  end if;

  insert into public.jd_task_comments(school_id,task_id,parent_comment_id,author_id,body,mentions)
  values(v_school,p_task_id,p_parent_comment_id,p_actor_id,trim(p_body),v_mentions)
  returning * into v_comment;

  insert into public.jd_audit_events(school_id,actor_id,event_type,event_json)
  values(v_school,p_actor_id,'task.comment.created',jsonb_build_object(
    'task_id',p_task_id,
    'comment_id',v_comment.id,
    'parent_comment_id',p_parent_comment_id,
    'mention_count',cardinality(v_mentions)
  ));

  return jsonb_build_object(
    'id',v_comment.id,
    'task_id',v_comment.task_id,
    'parent_comment_id',v_comment.parent_comment_id,
    'author_id',v_comment.author_id,
    'body',v_comment.body,
    'mentions',to_jsonb(v_comment.mentions),
    'created_at',v_comment.created_at
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.jd_apply_settings_proposal_step(p_approval_id uuid, p_actor_id uuid, p_step_index integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor_school uuid;
  v_approval public.jd_approvals%rowtype;
  v_step public.jd_settings_execution_steps%rowtype;
  v_change jsonb;
  v_key text;
  v_before jsonb;
  v_after jsonb;
  v_current text;
  v_expected text;
  v_target text;
  v_count integer;
  v_done integer;
  v_total integer;
  v_status text;
begin
  select school_id into v_actor_school
  from public.profiles where id = p_actor_id and role in ('owner','admin');
  if v_actor_school is null then
    raise exception 'Only workspace administrators can execute settings proposals' using errcode = '42501';
  end if;

  select * into v_approval
  from public.jd_approvals
  where id = p_approval_id and school_id = v_actor_school
  for update;
  if not found then raise exception 'Approval not found in administrator workspace' using errcode = 'P0002'; end if;
  if v_approval.action_key <> 'settings.apply' or v_approval.status <> 'approved' then
    raise exception 'Settings proposal has not been approved' using errcode = '42501';
  end if;
  if v_approval.proposal_hash is null
     or encode(digest(convert_to(v_approval.proposal_json::text, 'UTF8'), 'sha256'), 'hex') <> v_approval.proposal_hash then
    raise exception 'Stored proposal hash verification failed' using errcode = '22023';
  end if;
  if p_step_index < 0 or p_step_index >= jsonb_array_length(v_approval.proposal_json->'changes') then
    raise exception 'Invalid proposal step index' using errcode = '22023';
  end if;

  select * into v_step from public.jd_settings_execution_steps
  where approval_id = p_approval_id and step_index = p_step_index;
  if found then
    if v_step.status = 'completed' then
      return jsonb_build_object('status','already_completed','step_index',p_step_index,'key',v_step.setting_key,'verified_at',v_step.verified_at);
    end if;
    return jsonb_build_object('status',v_step.status,'step_index',p_step_index,'key',v_step.setting_key,'error',v_step.error_message);
  end if;

  v_change := v_approval.proposal_json->'changes'->p_step_index;
  if coalesce(v_change->>'status','') <> 'proposed' then
    raise exception 'Proposal step is not an actionable change' using errcode = '22023';
  end if;
  v_key := v_change->>'key';
  if v_key not in (
    'workspace_type','education_module_enabled','login_students_disabled','login_teachers_disabled',
    'block_reports_if_owing','result_ca_max','result_exam_max','inactivity_timeout_minutes',
    'recycle_bin_retention_days','name_order','name_case','school_name','school_address',
    'school_phone','school_motto'
  ) then
    raise exception 'Setting key is not registered for execution' using errcode = '22023';
  end if;
  if coalesce((v_change->>'approval_required')::boolean,false) is not true then
    raise exception 'This executor only accepts approval-required changes' using errcode = '22023';
  end if;

  v_before := v_change->'before';
  v_after := v_change->'after';
  select value into v_current from public.school_settings
  where school_id = v_actor_school and key = v_key
  for update;
  if v_before = 'null'::jsonb then
    if found then v_current := '__JD_EXISTING_VALUE__'; end if;
    v_expected := null;
  else
    v_expected := v_before #>> '{}';
  end if;
  if (v_expected is null and v_current is not null)
     or (v_expected is not null and v_current is distinct from v_expected) then
    insert into public.jd_settings_execution_steps(school_id,approval_id,step_index,setting_key,status,before_value,after_value,error_code,error_message)
    values(v_actor_school,p_approval_id,p_step_index,v_key,'conflict',v_before,v_after,'STALE_PROPOSAL','Current setting no longer matches the approved before-value');
    insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
    values(v_actor_school,p_actor_id,v_approval.run_id,'settings.step_conflict',
      jsonb_build_object('approval_id',p_approval_id,'step_index',p_step_index,'key',v_key,'proposal_hash',v_approval.proposal_hash));
    update public.jd_approvals set execution_status='failed',updated_at=now() where id=p_approval_id;
    return jsonb_build_object('status','conflict','step_index',p_step_index,'key',v_key,'error','Current setting changed after proposal review');
  end if;

  v_target := v_after #>> '{}';
  if v_key in ('education_module_enabled','login_students_disabled','login_teachers_disabled','block_reports_if_owing') and v_target not in ('true','false') then
    raise exception 'Invalid boolean setting value' using errcode = '22023';
  elsif v_key in ('result_ca_max','result_exam_max') and (v_target !~ '^[0-9]+(\.[0-9]+)?$' or v_target::numeric < 0 or v_target::numeric > 100) then
    raise exception 'Invalid score maximum' using errcode = '22023';
  elsif v_key = 'inactivity_timeout_minutes' and (v_target !~ '^[0-9]+$' or v_target::integer not between 1 and 1440) then
    raise exception 'Invalid inactivity timeout' using errcode = '22023';
  elsif v_key = 'recycle_bin_retention_days' and (v_target !~ '^[0-9]+$' or v_target::integer not between 1 and 365) then
    raise exception 'Invalid retention period' using errcode = '22023';
  elsif v_key = 'workspace_type' and v_target not in ('business','professional-services','retail','nonprofit','healthcare','education','other') then
    raise exception 'Invalid workspace type' using errcode = '22023';
  elsif v_key = 'name_order' and v_target not in ('FML','LFM') then
    raise exception 'Invalid name order' using errcode = '22023';
  elsif v_key = 'name_case' and v_target not in ('title','upper','lower') then
    raise exception 'Invalid name case' using errcode = '22023';
  elsif v_key in ('school_name','school_address','school_phone','school_motto') and length(trim(coalesce(v_target,''))) = 0 then
    raise exception 'Text setting cannot be empty' using errcode = '22023';
  end if;

  insert into public.school_settings(school_id,key,value,updated_at)
  values(v_actor_school,v_key,v_target,now())
  on conflict (school_id,key) do update set value=excluded.value,updated_at=excluded.updated_at;

  select value into v_current from public.school_settings
  where school_id=v_actor_school and key=v_key;
  if v_current is distinct from v_target then
    raise exception 'Settings read-after-write verification failed' using errcode = '40001';
  end if;

  insert into public.jd_settings_execution_steps(school_id,approval_id,step_index,setting_key,status,before_value,after_value,verified_at)
  values(v_actor_school,p_approval_id,p_step_index,v_key,'completed',v_before,v_after,now());

  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
  values(v_actor_school,p_actor_id,v_approval.run_id,'settings.step_completed',
    jsonb_build_object('approval_id',p_approval_id,'step_index',p_step_index,'key',v_key,'proposal_hash',v_approval.proposal_hash,'verified',true));

  select count(*) into v_total from jsonb_array_elements(v_approval.proposal_json->'changes') c where c->>'status'='proposed' and coalesce((c->>'approval_required')::boolean,false) is true;
  select count(*) into v_done from public.jd_settings_execution_steps es
    join jsonb_array_elements(v_approval.proposal_json->'changes') with ordinality c(value,ord)
      on (c.ord-1)::integer=es.step_index
    where es.approval_id=p_approval_id and es.status='completed' and c.value->>'status'='proposed';
  if v_done=v_total then
    update public.jd_approvals set execution_status='completed',updated_at=now() where id=p_approval_id;
    update public.jd_automation_runs set status='completed',completed_at=now(),updated_at=now() where id=v_approval.run_id;
    insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
    values(v_actor_school,p_actor_id,v_approval.run_id,'settings.proposal_completed',
      jsonb_build_object('approval_id',p_approval_id,'proposal_hash',v_approval.proposal_hash,'completed_steps',v_done));
    v_status := 'completed';
  else
    update public.jd_approvals set execution_status='running',updated_at=now() where id=p_approval_id;
    v_status := 'step_completed';
  end if;
  return jsonb_build_object('status',v_status,'step_index',p_step_index,'key',v_key,'verified',true,'completed_steps',v_done,'total_steps',v_total);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.jd_auto_assign_operational_task(p_actor_id uuid, p_task_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_school uuid; v_task public.jd_operational_tasks%rowtype; v_assignee uuid; v_open integer;
begin
  select school_id into v_school from public.profiles where id=p_actor_id and role in ('owner','admin','manager');
  if v_school is null then raise exception 'Manager permission required' using errcode='42501'; end if;
  select * into v_task from public.jd_operational_tasks
  where id=p_task_id and school_id=v_school for update;
  if not found then raise exception 'Operational task not found' using errcode='P0002'; end if;
  if v_task.status in ('completed','cancelled') then
    raise exception 'Terminal tasks cannot be auto-assigned' using errcode='22023';
  end if;
  if v_task.assigned_to is not null then
    return jsonb_build_object('assigned',true,'task_id',v_task.id,'assignee_id',v_task.assigned_to,'already_assigned',true);
  end if;
  select m.profile_id,count(t.id)::integer into v_assignee,v_open
  from public.jd_task_assignment_members m
  join public.profiles p on p.id=m.profile_id and p.school_id=m.school_id
  left join public.jd_operational_tasks t on t.school_id=m.school_id and t.assigned_to=m.profile_id
    and t.status in ('queued','in_progress','blocked')
  where m.school_id=v_school and lower(m.department)=lower(coalesce(v_task.department,''))
    and m.active=true and p.role in ('owner','admin','manager','staff','finance','hr','contractor')
  group by m.profile_id,m.max_open_tasks,m.last_assigned_at
  having count(t.id)<m.max_open_tasks
  order by count(t.id) asc,m.last_assigned_at asc nulls first,m.profile_id
  limit 1;
  if v_assignee is null then
    return jsonb_build_object('assigned',false,'reason','No active department member has available capacity');
  end if;
  update public.jd_operational_tasks set assigned_to=v_assignee,updated_at=now()
  where id=v_task.id and school_id=v_school;
  update public.jd_task_assignment_members set last_assigned_at=now(),updated_at=now()
  where school_id=v_school and profile_id=v_assignee and lower(department)=lower(coalesce(v_task.department,''));
  insert into public.jd_audit_events(school_id,actor_id,event_type,event_json)
  values(v_school,p_actor_id,'task.auto_assigned',jsonb_build_object('task_id',v_task.id,'assignee_id',v_assignee,'department',v_task.department));
  return jsonb_build_object('assigned',true,'task_id',v_task.id,'assignee_id',v_assignee);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.jd_create_operational_task(p_actor_id uuid, p_title text, p_description text, p_department text, p_due_at timestamp with time zone, p_priority text, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_school uuid;
  v_task public.jd_operational_tasks%rowtype;
  v_audit_id uuid;
  v_reused boolean := false;
begin
  select school_id into v_school
  from public.profiles
  where id=p_actor_id and role in ('owner','admin','manager');

  if v_school is null then
    raise exception 'Manager permission required' using errcode='42501';
  end if;

  if p_title is null or length(btrim(p_title))=0 or length(p_title)>180 then
    raise exception 'Task title is required and must be at most 180 characters' using errcode='22023';
  end if;
  if p_description is not null and length(p_description)>5000 then
    raise exception 'Task description must be at most 5000 characters' using errcode='22023';
  end if;
  if p_department is not null and length(p_department)>120 then
    raise exception 'Task department must be at most 120 characters' using errcode='22023';
  end if;
  if p_priority not in ('low','normal','high','urgent') then
    raise exception 'Invalid task priority' using errcode='22023';
  end if;
  if p_idempotency_key is null or length(btrim(p_idempotency_key))=0 or length(p_idempotency_key)>160 then
    raise exception 'A valid idempotency key is required' using errcode='22023';
  end if;

  insert into public.jd_operational_tasks(
    school_id,created_by,title,description,department,due_at,priority,idempotency_key
  ) values (
    v_school,p_actor_id,btrim(p_title),coalesce(p_description,''),nullif(btrim(p_department),''),p_due_at,p_priority,p_idempotency_key
  )
  on conflict (school_id,idempotency_key) do nothing
  returning * into v_task;

  if not found then
    v_reused := true;
    select * into v_task
    from public.jd_operational_tasks
    where school_id=v_school and idempotency_key=p_idempotency_key
    for update;

    if not found then
      raise exception 'Task idempotency conflict; retry the request' using errcode='40001';
    end if;

    if v_task.title is distinct from btrim(p_title)
      or v_task.description is distinct from coalesce(p_description,'')
      or v_task.department is distinct from nullif(btrim(p_department),'')
      or v_task.due_at is distinct from p_due_at
      or v_task.priority is distinct from p_priority then
      raise exception 'Idempotency key was already used with different task details' using errcode='22023';
    end if;

    select id into v_audit_id
    from public.jd_audit_events
    where school_id=v_school
      and event_type='operational_task.created'
      and event_json->>'task_id'=v_task.id::text
    order by created_at
    limit 1;

    return jsonb_build_object(
      'task',to_jsonb(v_task),
      'reused',true,
      'auditRecorded',v_audit_id is not null,
      'auditId',v_audit_id
    );
  end if;

  insert into public.jd_audit_events(school_id,actor_id,event_type,event_json)
  values(
    v_school,p_actor_id,'operational_task.created',
    jsonb_build_object(
      'task_id',v_task.id,
      'title',v_task.title,
      'department',v_task.department,
      'priority',v_task.priority,
      'due_at',v_task.due_at,
      'status',v_task.status,
      'idempotency_key',p_idempotency_key
    )
  )
  returning id into v_audit_id;

  return jsonb_build_object(
    'task',to_jsonb(v_task),
    'reused',false,
    'auditRecorded',true,
    'auditId',v_audit_id
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.jd_create_organisation_blueprint(p_actor_id uuid, p_title text, p_industry text, p_description text, p_blueprint jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_school uuid; v_id uuid; v_hash text;
begin
  select school_id into v_school from public.profiles where id=p_actor_id and role in ('owner','admin');
  if v_school is null then raise exception 'Workspace administrator required' using errcode='42501'; end if;
  if length(trim(coalesce(p_title,''))) not between 1 and 160
     or length(trim(coalesce(p_industry,''))) not between 1 and 80
     or length(trim(coalesce(p_description,''))) not between 1 and 4000
     or jsonb_typeof(p_blueprint)<>'object' then
    raise exception 'Invalid organisation blueprint' using errcode='22023';
  end if;
  v_hash := encode(digest(convert_to(p_blueprint::text,'UTF8'),'sha256'),'hex');
  insert into public.jd_organisation_blueprints(school_id,created_by,title,industry,business_description,blueprint_json,blueprint_hash)
  values(v_school,p_actor_id,trim(p_title),trim(p_industry),trim(p_description),p_blueprint,v_hash)
  returning id into v_id;
  return jsonb_build_object('id',v_id,'school_id',v_school,'status','draft','blueprint_hash',v_hash);
end; $function$
;

CREATE OR REPLACE FUNCTION public.jd_create_task_schedule(p_actor_id uuid, p_title text, p_description text, p_department text, p_priority text, p_frequency text, p_local_time time without time zone, p_timezone text, p_weekdays smallint[], p_next_run_at timestamp with time zone, p_assigned_to uuid, p_auto_assign boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_school uuid; v_id uuid; v_target_school uuid;
begin
  select school_id into v_school from public.profiles where id=p_actor_id and role in ('owner','admin','manager');
  if v_school is null then raise exception 'Manager permission required' using errcode='42501'; end if;
  if length(trim(coalesce(p_title,''))) not between 1 and 180
     or length(coalesce(p_description,''))>5000
     or length(trim(coalesce(p_department,''))) not between 1 and 120
     or p_priority not in ('low','normal','high','urgent')
     or p_frequency not in ('daily','weekly')
     or p_local_time is null or p_next_run_at<=now()
     or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_timezone)
     or (p_frequency='weekly' and (coalesce(cardinality(p_weekdays),0)=0 or not (p_weekdays <@ array[1,2,3,4,5,6,7]::smallint[]))) then
    raise exception 'Invalid recurring task schedule' using errcode='22023';
  end if;
  if p_assigned_to is not null and coalesce(p_auto_assign,false) then
    raise exception 'Choose a fixed assignee or automatic assignment, not both' using errcode='22023';
  end if;
  if p_assigned_to is not null then
    select school_id into v_target_school from public.profiles where id=p_assigned_to and role in ('owner','admin','manager','staff','finance','hr','contractor');
    if v_target_school is distinct from v_school then raise exception 'Assignee must be an eligible member of this workspace' using errcode='42501'; end if;
  end if;
  insert into public.jd_task_schedules(school_id,created_by,title,description,department,priority,frequency,local_time,timezone,weekdays,next_run_at,assigned_to,auto_assign)
  values(v_school,p_actor_id,trim(p_title),coalesce(p_description,''),trim(p_department),p_priority,p_frequency,p_local_time,p_timezone,
    case when p_frequency='daily' then array[1,2,3,4,5,6,7]::smallint[] else p_weekdays end,
    p_next_run_at,p_assigned_to,coalesce(p_auto_assign,false))
  returning id into v_id;
  insert into public.jd_audit_events(school_id,actor_id,event_type,event_json)
  values(v_school,p_actor_id,'task.schedule.created',jsonb_build_object('schedule_id',v_id,'frequency',p_frequency,'timezone',p_timezone,'next_run_at',p_next_run_at));
  return jsonb_build_object('id',v_id,'active',true,'next_run_at',p_next_run_at);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.jd_decide_approval(p_approval_id uuid, p_actor_id uuid, p_decision text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_school_id uuid;
  v_approval public.jd_approvals%rowtype;
  v_next_status text;
  v_now timestamptz := now();
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Invalid approval decision' using errcode = '22023';
  end if;

  select school_id into v_school_id
  from public.profiles
  where id = p_actor_id and role in ('owner','admin');

  if v_school_id is null then
    raise exception 'Only workspace administrators can decide approvals' using errcode = '42501';
  end if;

  select * into v_approval
  from public.jd_approvals
  where id = p_approval_id and school_id = v_school_id
  for update;

  if not found then
    raise exception 'Approval request not found' using errcode = 'P0002';
  end if;

  if v_approval.status <> 'pending' then
    raise exception 'Approval request has already been decided' using errcode = '40001';
  end if;

  if v_approval.expires_at <= v_now then
    update public.jd_approvals
    set status = 'expired', updated_at = v_now
    where id = p_approval_id;
    return jsonb_build_object('status', 'expired', 'execution_status', v_approval.execution_status);
  end if;

  update public.jd_approvals
  set status = p_decision,
      decided_by = p_actor_id,
      decision_note = left(coalesce(p_note, ''), 2000),
      decided_at = v_now,
      updated_at = v_now
  where id = p_approval_id
  returning * into v_approval;

  insert into public.jd_audit_events (
    school_id, actor_id, run_id, event_type, event_json
  ) values (
    v_school_id, p_actor_id, v_approval.run_id,
    'approval.' || p_decision,
    jsonb_build_object(
      'approval_id', p_approval_id,
      'execution_status', v_approval.execution_status
    )
  );

  return jsonb_build_object(
    'id', v_approval.id,
    'status', v_approval.status,
    'execution_status', v_approval.execution_status,
    'decided_by', v_approval.decided_by,
    'decided_at', v_approval.decided_at,
    'decision_note', v_approval.decision_note
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.jd_dispatch_task_schedule(p_schedule_id uuid, p_expected_run_at timestamp with time zone, p_next_run_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_schedule public.jd_task_schedules%rowtype; v_task_id uuid; v_key text; v_assignee uuid;
begin
  select * into v_schedule from public.jd_task_schedules
  where id=p_schedule_id and active=true for update;
  if not found then return jsonb_build_object('dispatched',false,'reason','inactive_or_missing'); end if;
  if v_schedule.next_run_at<>p_expected_run_at or v_schedule.next_run_at>now() then
    return jsonb_build_object('dispatched',false,'reason','already_processed_or_not_due');
  end if;
  if p_next_run_at<=p_expected_run_at then raise exception 'Next occurrence must be later than the due occurrence' using errcode='22023'; end if;
  v_assignee:=v_schedule.assigned_to;
  if v_assignee is null and v_schedule.auto_assign then
    select m.profile_id into v_assignee
    from public.jd_task_assignment_members m
    join public.profiles p on p.id=m.profile_id and p.school_id=m.school_id
    left join public.jd_operational_tasks t on t.school_id=m.school_id and t.assigned_to=m.profile_id and t.status in ('queued','in_progress','blocked')
    where m.school_id=v_schedule.school_id and lower(m.department)=lower(v_schedule.department) and m.active=true
      and p.role in ('owner','admin','manager','staff','finance','hr','contractor')
    group by m.profile_id,m.max_open_tasks,m.last_assigned_at
    having count(t.id)<m.max_open_tasks
    order by count(t.id) asc,m.last_assigned_at asc nulls first,m.profile_id
    limit 1;
    if v_assignee is not null then
      update public.jd_task_assignment_members set last_assigned_at=now(),updated_at=now()
      where school_id=v_schedule.school_id and profile_id=v_assignee and lower(department)=lower(v_schedule.department);
    end if;
  end if;
  v_key:='schedule:'||v_schedule.id::text||':'||floor(extract(epoch from p_expected_run_at))::bigint::text;
  insert into public.jd_operational_tasks(school_id,created_by,title,description,department,priority,assigned_to,idempotency_key,metadata)
  values(v_schedule.school_id,v_schedule.created_by,v_schedule.title,v_schedule.description,v_schedule.department,v_schedule.priority,
    v_assignee,v_key,jsonb_build_object('source','recurring_schedule','schedule_id',v_schedule.id,'scheduled_for',p_expected_run_at))
  on conflict(school_id,idempotency_key) do nothing
  returning id into v_task_id;
  if v_task_id is null then
    select id into v_task_id from public.jd_operational_tasks where school_id=v_schedule.school_id and idempotency_key=v_key;
  end if;
  update public.jd_task_schedules set next_run_at=p_next_run_at,last_run_at=p_expected_run_at,last_task_id=v_task_id,updated_at=now()
  where id=v_schedule.id;
  insert into public.jd_audit_events(school_id,actor_id,event_type,event_json)
  values(v_schedule.school_id,null,'task.schedule.dispatched',jsonb_build_object('schedule_id',v_schedule.id,'task_id',v_task_id,'scheduled_for',p_expected_run_at,'next_run_at',p_next_run_at));
  return jsonb_build_object('dispatched',true,'schedule_id',v_schedule.id,'task_id',v_task_id,'next_run_at',p_next_run_at);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.jd_requeue_failed_execution_job(p_job_id uuid, p_actor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_job public.jd_execution_jobs%rowtype;
  v_school_id uuid;
  v_message_id bigint;
  v_now timestamptz := now();
begin
  select school_id into v_school_id
  from public.profiles
  where id = p_actor_id and role in ('owner','admin');

  if v_school_id is null then
    raise exception 'Workspace administrator required' using errcode = '42501';
  end if;

  select * into v_job
  from public.jd_execution_jobs
  where id = p_job_id and school_id = v_school_id
  for update;

  if not found then
    raise exception 'Execution job not found' using errcode = 'P0002';
  end if;

  if v_job.status <> 'failed' then
    raise exception 'Only failed jobs can be manually retried' using errcode = '22023';
  end if;

  update public.jd_execution_jobs
  set status = 'queued',
      attempt_count = 0,
      available_at = v_now,
      lease_owner = null,
      lease_token = null,
      lease_expires_at = null,
      heartbeat_at = null,
      last_error_code = null,
      last_error_message = null,
      started_at = null,
      completed_at = null,
      updated_at = v_now
  where id = v_job.id;

  v_message_id := pgmq.send(
    'jd_execution_jobs',
    jsonb_build_object('job_id', v_job.id, 'schema_version', 1)
  );

  update public.jd_execution_jobs
  set queue_message_id = v_message_id, updated_at = now()
  where id = v_job.id;

  update public.jd_automation_runs
  set status = 'queued', completed_at = null, result_json = null, updated_at = now()
  where id = v_job.run_id and school_id = v_school_id;

  insert into public.jd_audit_events (
    school_id, actor_id, run_id, event_type, event_json
  ) values (
    v_school_id, p_actor_id, v_job.run_id, 'execution.manual_retry',
    jsonb_build_object('job_id', v_job.id, 'previous_attempt_count', v_job.attempt_count)
  );

  return jsonb_build_object(
    'job_id', v_job.id, 'run_id', v_job.run_id,
    'status', 'queued', 'queue_message_id', v_message_id
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.jd_save_workflow_draft(p_actor_id uuid, p_workflow_id uuid, p_expected_version integer, p_definition jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_school_id uuid;
  v_workflow public.jd_workflows%rowtype;
  v_version_id uuid;
  v_version_no integer;
  v_hash text;
  v_title text;
  v_description text;
  v_audit_id uuid;
begin
  select p.school_id into v_school_id
  from public.profiles p
  where p.id = p_actor_id and p.role in ('owner','admin','manager');
  if v_school_id is null then
    raise exception 'Workflow manager permission required' using errcode = '42501';
  end if;
  if p_definition is null or jsonb_typeof(p_definition) <> 'object'
     or jsonb_typeof(p_definition->'nodes') is distinct from 'array'
     or jsonb_typeof(p_definition->'edges') is distinct from 'array'
     or length(trim(coalesce(p_definition->>'name',''))) not between 1 and 120
     or length(coalesce(p_definition->>'description','')) > 2000 then
    raise exception 'Invalid workflow definition' using errcode = '22023';
  end if;
  if jsonb_array_length(p_definition->'nodes') not between 2 and 100
     or jsonb_array_length(p_definition->'edges') > 200 then
    raise exception 'Workflow graph exceeds allowed bounds' using errcode = '22023';
  end if;
  v_title := trim(p_definition->>'name');
  v_description := coalesce(p_definition->>'description','');
  v_hash := encode(public.digest(convert_to(p_definition::text,'UTF8'),'sha256'),'hex');

  if p_workflow_id is null then
    if coalesce(p_expected_version,0) <> 0 then
      raise exception 'New workflow expected version must be zero' using errcode = '40001';
    end if;
    insert into public.jd_workflows(school_id,created_by,title,description)
    values(v_school_id,p_actor_id,v_title,v_description)
    returning * into v_workflow;
  else
    select * into v_workflow
    from public.jd_workflows
    where id = p_workflow_id and school_id = v_school_id
    for update;
    if not found then
      raise exception 'Workflow not found' using errcode = 'P0002';
    end if;
    if v_workflow.status = 'archived' then
      raise exception 'Archived workflows cannot be edited' using errcode = '22023';
    end if;
    if v_workflow.latest_version_no <> coalesce(p_expected_version,-1) then
      raise exception 'Workflow version changed; reload before saving' using errcode = '40001';
    end if;
    update public.jd_workflows
    set title = v_title, description = v_description, updated_at = now()
    where id = v_workflow.id
    returning * into v_workflow;
  end if;

  v_version_no := v_workflow.latest_version_no + 1;
  insert into public.jd_workflow_versions(
    school_id,workflow_id,version_no,definition_json,definition_hash,created_by
  ) values (
    v_school_id,v_workflow.id,v_version_no,p_definition,v_hash,p_actor_id
  ) returning id into v_version_id;

  update public.jd_workflows
  set latest_version_no = v_version_no, status = case when active_version_id is null then 'draft' else status end,
      updated_at = now()
  where id = v_workflow.id;

  update public.jd_approvals
  set status = 'cancelled', execution_status = 'cancelled', updated_at = now()
  where school_id = v_school_id and action_key = 'workflow.activate'
    and status = 'pending' and proposal_json->>'workflow_id' = v_workflow.id::text;

  insert into public.jd_audit_events(school_id,actor_id,event_type,event_json)
  values(v_school_id,p_actor_id,'workflow.draft.saved',
    jsonb_build_object('workflow_id',v_workflow.id,'version_id',v_version_id,
      'version_no',v_version_no,'definition_hash',v_hash));

  return jsonb_build_object('workflow_id',v_workflow.id,'version_id',v_version_id,
    'version_no',v_version_no,'definition_hash',v_hash,'status','draft');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.jd_set_task_assignment_member(p_actor_id uuid, p_profile_id uuid, p_department text, p_max_open_tasks integer, p_active boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_school uuid; v_target_school uuid; v_role text; v_row public.jd_task_assignment_members%rowtype;
begin
  select school_id into v_school from public.profiles
  where id=p_actor_id and role in ('owner','admin','manager');
  if v_school is null then raise exception 'Manager permission required' using errcode='42501'; end if;
  if length(trim(coalesce(p_department,''))) not between 1 and 120
     or p_max_open_tasks not between 1 and 500 then
    raise exception 'Invalid assignment pool configuration' using errcode='22023';
  end if;
  select school_id,role into v_target_school,v_role from public.profiles where id=p_profile_id;
  if v_target_school is distinct from v_school or v_role not in ('owner','admin','manager','staff','finance','hr','contractor') then
    raise exception 'Assignment member must be an eligible profile in this workspace' using errcode='42501';
  end if;
  insert into public.jd_task_assignment_members(school_id,profile_id,department,max_open_tasks,active,created_by)
  values(v_school,p_profile_id,trim(p_department),p_max_open_tasks,coalesce(p_active,true),p_actor_id)
  on conflict(school_id,profile_id,department) do update
    set max_open_tasks=excluded.max_open_tasks,active=excluded.active,updated_at=now()
  returning * into v_row;
  insert into public.jd_audit_events(school_id,actor_id,event_type,event_json)
  values(v_school,p_actor_id,'task.assignment_pool.updated',
    jsonb_build_object('profile_id',p_profile_id,'department',trim(p_department),'active',v_row.active,'max_open_tasks',v_row.max_open_tasks));
  return jsonb_build_object('id',v_row.id,'profile_id',v_row.profile_id,'department',v_row.department,'active',v_row.active,'max_open_tasks',v_row.max_open_tasks);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.jd_submit_settings_proposal(p_actor_id uuid, p_title text, p_proposal_json jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_school_id uuid;
  v_run_id uuid;
  v_approval_id uuid;
  v_existing public.jd_approvals%rowtype;
  v_title text := left(trim(coalesce(p_title, 'Settings change proposal')), 160);
  v_proposal_hash text;
begin
  if p_proposal_json is null or jsonb_typeof(p_proposal_json) <> 'object' then
    raise exception 'A proposal object is required' using errcode = '22023';
  end if;
  v_proposal_hash := encode(digest(convert_to(p_proposal_json::text, 'UTF8'), 'sha256'), 'hex');
  if jsonb_typeof(p_proposal_json->'changes') <> 'array'
     or jsonb_array_length(p_proposal_json->'changes') < 1
     or jsonb_array_length(p_proposal_json->'changes') > 20 then
    raise exception 'Proposal must contain between 1 and 20 changes' using errcode = '22023';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(p_proposal_json->'changes') c
    where c->>'approval_required' = 'true'
  ) then
    raise exception 'This proposal does not contain a change requiring Review Centre approval' using errcode = '22023';
  end if;

  select school_id into v_school_id
  from public.profiles
  where id = p_actor_id and role in ('owner','admin');
  if v_school_id is null then
    raise exception 'Only workspace administrators can submit settings proposals' using errcode = '42501';
  end if;

  select * into v_existing
  from public.jd_approvals
  where school_id = v_school_id and proposal_hash = v_proposal_hash
  limit 1;
  if found then
    return jsonb_build_object('id', v_existing.id, 'run_id', v_existing.run_id,
      'status', v_existing.status, 'duplicate', true, 'proposal_hash', v_existing.proposal_hash);
  end if;

  insert into public.jd_automation_runs (
    school_id, requested_by, trigger_type, status, autonomy_mode, scope,
    request_text, plan_json, idempotency_key
  ) values (
    v_school_id, p_actor_id, 'manual', 'awaiting_approval', 'assisted',
    'settings', v_title, jsonb_build_array(p_proposal_json),
    'settings-proposal:' || v_proposal_hash
  ) returning id into v_run_id;

  insert into public.jd_approvals (
    school_id, run_id, requested_by, status, reason, title, action_key,
    risk_level, proposal_json, audience_text, execution_status, proposal_hash
  ) values (
    v_school_id, v_run_id, p_actor_id, 'pending',
    'Settings changes require administrator review',
    v_title, 'settings.apply',
    'high', p_proposal_json,
    'Review the exact proposed settings diff before any changes are applied.',
    'not_executed', v_proposal_hash
  ) returning id into v_approval_id;

  insert into public.jd_audit_events (
    school_id, actor_id, run_id, event_type, event_json
  ) values (
    v_school_id, p_actor_id, v_run_id, 'settings.proposal_submitted',
    jsonb_build_object('approval_id', v_approval_id, 'proposal_hash', v_proposal_hash)
  );

  return jsonb_build_object('id', v_approval_id, 'run_id', v_run_id,
    'status', 'pending', 'duplicate', false, 'proposal_hash', v_proposal_hash,
    'execution_status', 'not_executed');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.jd_submit_workflow_review(p_actor_id uuid, p_workflow_id uuid, p_version_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_school_id uuid;
  v_workflow public.jd_workflows%rowtype;
  v_version public.jd_workflow_versions%rowtype;
  v_run_id uuid;
  v_approval_id uuid;
  v_proposal jsonb;
  v_proposal_hash text;
  v_existing public.jd_approvals%rowtype;
  v_audit_id uuid;
begin
  select p.school_id into v_school_id
  from public.profiles p
  where p.id = p_actor_id and p.role in ('owner','admin','manager');
  if v_school_id is null then
    raise exception 'Workflow manager permission required' using errcode = '42501';
  end if;

  select * into v_workflow from public.jd_workflows
  where id = p_workflow_id and school_id = v_school_id for update;
  if not found then raise exception 'Workflow not found' using errcode = 'P0002'; end if;
  select * into v_version from public.jd_workflow_versions
  where id = p_version_id and workflow_id = v_workflow.id and school_id = v_school_id;
  if not found then raise exception 'Workflow version not found' using errcode = 'P0002'; end if;
  if v_version.version_no <> v_workflow.latest_version_no then
    raise exception 'Only the latest workflow version can be submitted for review' using errcode = '40001';
  end if;
  v_proposal := jsonb_build_object(
    'workflow_id',v_workflow.id,'version_id',v_version.id,
    'version_no',v_version.version_no,'definition_hash',v_version.definition_hash,
    'definition',v_version.definition_json
  );
  v_proposal_hash := encode(public.digest(convert_to(v_proposal::text,'UTF8'),'sha256'),'hex');
  select * into v_existing from public.jd_approvals
  where school_id = v_school_id and proposal_hash = v_proposal_hash;
  if found then
    return jsonb_build_object('approval_id',v_existing.id,'run_id',v_existing.run_id,
      'workflow_id',v_workflow.id,'version_id',v_version.id,'version_no',v_version.version_no,
      'definition_hash',v_version.definition_hash,'status',v_existing.status,
      'execution_status',v_existing.execution_status,'duplicate',true);
  end if;

  insert into public.jd_automation_runs(
    school_id,requested_by,trigger_type,status,autonomy_mode,scope,
    request_text,plan_json,idempotency_key
  ) values (
    v_school_id,p_actor_id,'manual','awaiting_approval','assisted','organisation',
    'workflow activation review: ' || v_workflow.title,
    jsonb_build_array(v_proposal),'workflow-review:' || v_workflow.id::text || ':' || v_version.id::text
  ) returning id into v_run_id;

  insert into public.jd_approvals(
    school_id,run_id,requested_by,status,reason,title,action_key,risk_level,
    proposal_json,audience_text,execution_status,proposal_hash
  ) values (
    v_school_id,v_run_id,p_actor_id,'pending',
    'Activating a workflow requires administrator review of the exact immutable version.',
    'Activate workflow: ' || v_workflow.title,'workflow.activate','high',
    v_proposal,'Review the exact workflow definition and version before activation.',
    'not_executed',v_proposal_hash
  ) returning id into v_approval_id;

  insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
  values(v_school_id,p_actor_id,v_run_id,'workflow.review.submitted',
    jsonb_build_object('approval_id',v_approval_id,'workflow_id',v_workflow.id,
      'version_id',v_version.id,'version_no',v_version.version_no,
      'definition_hash',v_version.definition_hash))
  returning id into v_audit_id;

  return jsonb_build_object('approval_id',v_approval_id,'run_id',v_run_id,
    'workflow_id',v_workflow.id,'version_id',v_version.id,
    'version_no',v_version.version_no,'definition_hash',v_version.definition_hash,
    'status','pending','execution_status','not_executed');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.jd_transition_operational_task(p_actor_id uuid, p_task_id uuid, p_expected_status text, p_next_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_school uuid;
  v_actor_role text;
  v_task public.jd_operational_tasks%rowtype;
  v_audit_id uuid;
begin
  select school_id, role into v_school, v_actor_role
  from public.profiles
  where id=p_actor_id and role in ('owner','admin','manager','staff');

  if v_school is null then
    raise exception 'Manager permission required' using errcode='42501';
  end if;

  select * into v_task
  from public.jd_operational_tasks
  where id=p_task_id and school_id=v_school
  for update;

  if not found then
    raise exception 'Operational task not found' using errcode='P0002';
  end if;

  if v_actor_role = 'staff' then
    if v_task.assigned_to is distinct from p_actor_id
       or p_next_status not in ('in_progress','blocked','completed') then
      raise exception 'Staff may only transition their own assigned task to an allowed status' using errcode='42501';
    end if;
  end if;

  if v_task.status is distinct from p_expected_status then
    raise exception 'Task changed concurrently; reload before retrying' using errcode='40001';
  end if;

  if not (
    (v_task.status='queued' and p_next_status in ('in_progress','cancelled'))
    or (v_task.status='in_progress' and p_next_status in ('blocked','completed','cancelled'))
    or (v_task.status='blocked' and p_next_status in ('queued','in_progress','cancelled'))
  ) then
    raise exception 'Invalid operational task transition' using errcode='22023';
  end if;

  update public.jd_operational_tasks
  set status=p_next_status,
      completed_at=case when p_next_status='completed' then now() else completed_at end,
      updated_at=now()
  where id=v_task.id and school_id=v_school
  returning * into v_task;

  insert into public.jd_audit_events(school_id,actor_id,event_type,event_json)
  values(
    v_school,p_actor_id,'operational_task.status_changed',
    jsonb_build_object(
      'task_id',v_task.id,
      'from_status',p_expected_status,
      'to_status',p_next_status
    )
  )
  returning id into v_audit_id;

  return jsonb_build_object(
    'task',jsonb_build_object(
      'id',v_task.id,
      'status',v_task.status,
      'completed_at',v_task.completed_at,
      'updated_at',v_task.updated_at
    ),
    'auditRecorded',true,
    'auditId',v_audit_id
  );
end;
$function$
;

revoke all on function public.jd_activate_approved_workflow(p_actor_id uuid, p_approval_id uuid) from public, anon, authenticated;
grant execute on function public.jd_activate_approved_workflow(p_actor_id uuid, p_approval_id uuid) to service_role;
revoke all on function public.jd_add_task_comment(p_actor_id uuid, p_task_id uuid, p_body text, p_mentions uuid[], p_parent_comment_id uuid) from public, anon, authenticated;
grant execute on function public.jd_add_task_comment(p_actor_id uuid, p_task_id uuid, p_body text, p_mentions uuid[], p_parent_comment_id uuid) to service_role;
revoke all on function public.jd_apply_settings_proposal_step(p_approval_id uuid, p_actor_id uuid, p_step_index integer) from public, anon, authenticated;
grant execute on function public.jd_apply_settings_proposal_step(p_approval_id uuid, p_actor_id uuid, p_step_index integer) to service_role;
revoke all on function public.jd_auto_assign_operational_task(p_actor_id uuid, p_task_id uuid) from public, anon, authenticated;
grant execute on function public.jd_auto_assign_operational_task(p_actor_id uuid, p_task_id uuid) to service_role;
revoke all on function public.jd_create_operational_task(p_actor_id uuid, p_title text, p_description text, p_department text, p_due_at timestamp with time zone, p_priority text, p_idempotency_key text) from public, anon, authenticated;
grant execute on function public.jd_create_operational_task(p_actor_id uuid, p_title text, p_description text, p_department text, p_due_at timestamp with time zone, p_priority text, p_idempotency_key text) to service_role;
revoke all on function public.jd_create_organisation_blueprint(p_actor_id uuid, p_title text, p_industry text, p_description text, p_blueprint jsonb) from public, anon, authenticated;
grant execute on function public.jd_create_organisation_blueprint(p_actor_id uuid, p_title text, p_industry text, p_description text, p_blueprint jsonb) to service_role;
revoke all on function public.jd_create_task_schedule(p_actor_id uuid, p_title text, p_description text, p_department text, p_priority text, p_frequency text, p_local_time time without time zone, p_timezone text, p_weekdays smallint[], p_next_run_at timestamp with time zone, p_assigned_to uuid, p_auto_assign boolean) from public, anon, authenticated;
grant execute on function public.jd_create_task_schedule(p_actor_id uuid, p_title text, p_description text, p_department text, p_priority text, p_frequency text, p_local_time time without time zone, p_timezone text, p_weekdays smallint[], p_next_run_at timestamp with time zone, p_assigned_to uuid, p_auto_assign boolean) to service_role;
revoke all on function public.jd_decide_approval(p_approval_id uuid, p_actor_id uuid, p_decision text, p_note text) from public, anon, authenticated;
grant execute on function public.jd_decide_approval(p_approval_id uuid, p_actor_id uuid, p_decision text, p_note text) to service_role;
revoke all on function public.jd_dispatch_task_schedule(p_schedule_id uuid, p_expected_run_at timestamp with time zone, p_next_run_at timestamp with time zone) from public, anon, authenticated;
grant execute on function public.jd_dispatch_task_schedule(p_schedule_id uuid, p_expected_run_at timestamp with time zone, p_next_run_at timestamp with time zone) to service_role;
revoke all on function public.jd_requeue_failed_execution_job(p_job_id uuid, p_actor_id uuid) from public, anon, authenticated;
grant execute on function public.jd_requeue_failed_execution_job(p_job_id uuid, p_actor_id uuid) to service_role;
revoke all on function public.jd_save_workflow_draft(p_actor_id uuid, p_workflow_id uuid, p_expected_version integer, p_definition jsonb) from public, anon, authenticated;
grant execute on function public.jd_save_workflow_draft(p_actor_id uuid, p_workflow_id uuid, p_expected_version integer, p_definition jsonb) to service_role;
revoke all on function public.jd_set_task_assignment_member(p_actor_id uuid, p_profile_id uuid, p_department text, p_max_open_tasks integer, p_active boolean) from public, anon, authenticated;
grant execute on function public.jd_set_task_assignment_member(p_actor_id uuid, p_profile_id uuid, p_department text, p_max_open_tasks integer, p_active boolean) to service_role;
revoke all on function public.jd_submit_settings_proposal(p_actor_id uuid, p_title text, p_proposal_json jsonb) from public, anon, authenticated;
grant execute on function public.jd_submit_settings_proposal(p_actor_id uuid, p_title text, p_proposal_json jsonb) to service_role;
revoke all on function public.jd_submit_workflow_review(p_actor_id uuid, p_workflow_id uuid, p_version_id uuid) from public, anon, authenticated;
grant execute on function public.jd_submit_workflow_review(p_actor_id uuid, p_workflow_id uuid, p_version_id uuid) to service_role;
revoke all on function public.jd_transition_operational_task(p_actor_id uuid, p_task_id uuid, p_expected_status text, p_next_status text) from public, anon, authenticated;
grant execute on function public.jd_transition_operational_task(p_actor_id uuid, p_task_id uuid, p_expected_status text, p_next_status text) to service_role;
