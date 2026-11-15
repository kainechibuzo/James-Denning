-- Qualify pgcrypto digest calls in exactly three JD functions.
-- No other function logic is changed.
create table if not exists jd_private.authorization_function_backups (
 migration_name text not null,function_name text not null,identity_arguments text not null,
 function_definition text not null,captured_at timestamptz not null default now(),
 primary key(migration_name,function_name,identity_arguments)
);
revoke all on table jd_private.authorization_function_backups from public,anon,authenticated,service_role;
insert into jd_private.authorization_function_backups(migration_name,function_name,identity_arguments,function_definition)
select '20261114221500_jd_qualify_pgcrypto_digest',p.proname,pg_get_function_identity_arguments(p.oid),pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname=any(array['jd_apply_settings_proposal_step','jd_create_organisation_blueprint','jd_submit_settings_proposal']);
do $$ declare v_count integer; begin
 select count(*) into v_count from jd_private.authorization_function_backups where migration_name='20261114221500_jd_qualify_pgcrypto_digest';
 if v_count<>3 then raise exception 'Expected three function backups, got %',v_count; end if;
end $$;
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
     or encode(extensions.digest(convert_to(v_approval.proposal_json::text, 'UTF8'), 'sha256'), 'hex') <> v_approval.proposal_hash then
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
  v_hash := encode(extensions.digest(convert_to(p_blueprint::text,'UTF8'),'sha256'),'hex');
  insert into public.jd_organisation_blueprints(school_id,created_by,title,industry,business_description,blueprint_json,blueprint_hash)
  values(v_school,p_actor_id,trim(p_title),trim(p_industry),trim(p_description),p_blueprint,v_hash)
  returning id into v_id;
  return jsonb_build_object('id',v_id,'school_id',v_school,'status','draft','blueprint_hash',v_hash);
end; $function$
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
  v_proposal_hash := encode(extensions.digest(convert_to(p_proposal_json::text, 'UTF8'), 'sha256'), 'hex');
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
