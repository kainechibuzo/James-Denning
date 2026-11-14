-- Persist proposed job positions as first-class JD-owned records.
create table if not exists public.jd_department_roles (
 id uuid primary key default gen_random_uuid(),
 school_id uuid not null references public.schools(id) on delete cascade,
 department_id uuid not null references public.jd_departments(id) on delete cascade,
 title text not null check (length(trim(title)) between 1 and 120),
 created_by uuid references auth.users(id) on delete set null,
 created_by_agent boolean not null default true,
 source_approval_id uuid references public.jd_approvals(id) on delete set null,
 created_at timestamptz not null default now(),
 unique (department_id,title)
);
create index if not exists jd_department_roles_school_idx on public.jd_department_roles(school_id,department_id,title);
alter table public.jd_department_roles enable row level security;
revoke all on public.jd_department_roles from anon,authenticated;
grant select,insert,update,delete on public.jd_department_roles to service_role;

create or replace function public.jd_provision_approved_departments(p_approval_id uuid,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 v_school uuid; v_approval public.jd_approvals%rowtype; v_blueprint jsonb;
 v_blueprint_id uuid; v_count integer:=0; v_roles_count integer:=0;
 v_item jsonb; v_department_id uuid; v_role text;
begin
 select school_id into v_school from public.profiles where id=p_actor_id and role in ('owner','admin');
 if v_school is null then raise exception 'Workspace administrator required' using errcode='42501'; end if;
 select * into v_approval from public.jd_approvals where id=p_approval_id and school_id=v_school for update;
 if not found then raise exception 'Approval request not found' using errcode='P0002'; end if;
 if v_approval.status<>'approved' then raise exception 'Approval must be accepted before provisioning' using errcode='42501'; end if;
 if v_approval.action_key<>'organisation.provision_departments' then raise exception 'This approval is not a department setup request' using errcode='22023'; end if;
 if v_approval.execution_status='completed' then
  return coalesce(v_approval.execution_result_json,'{}'::jsonb)||jsonb_build_object('already_completed',true);
 end if;
 v_blueprint:=v_approval.proposal_json->'blueprint';
 v_blueprint_id:=nullif(v_approval.proposal_json->>'blueprint_id','')::uuid;
 if jsonb_typeof(v_blueprint)<>'object' or jsonb_typeof(v_blueprint->'departments')<>'array' then
  raise exception 'The approved business plan is incomplete' using errcode='22023';
 end if;
 for v_item in select value from jsonb_array_elements(v_blueprint->'departments') loop
  insert into public.jd_departments(school_id,name,purpose,roles,workflows,kpis,created_by,created_by_agent,created_via,source_approval_id,source_blueprint_id)
  values(v_school,trim(v_item->>'name'),coalesce(v_item->>'purpose',''),coalesce(v_item->'roles','[]'::jsonb),coalesce(v_item->'workflows','[]'::jsonb),coalesce(v_item->'kpis','[]'::jsonb),v_approval.requested_by,true,'jd_approval',p_approval_id,v_blueprint_id)
  on conflict(school_id,name) do nothing returning id into v_department_id;
  if v_department_id is not null then v_count:=v_count+1;
  else select id into v_department_id from public.jd_departments where school_id=v_school and name=trim(v_item->>'name'); end if;
  for v_role in select jsonb_array_elements_text(coalesce(v_item->'roles','[]'::jsonb)) loop
   insert into public.jd_department_roles(school_id,department_id,title,created_by,created_by_agent,source_approval_id)
   values(v_school,v_department_id,trim(v_role),v_approval.requested_by,true,p_approval_id)
   on conflict(department_id,title) do nothing;
   if found then v_roles_count:=v_roles_count+1; end if;
  end loop;
  v_department_id:=null;
 end loop;
 if v_blueprint_id is not null then
  update public.jd_organisation_blueprints set status='provisioned',created_by_agent=true,updated_at=now()
  where id=v_blueprint_id and school_id=v_school;
 end if;
 update public.jd_approvals set execution_status='completed',
  execution_result_json=jsonb_build_object('departments_created',v_count,'roles_created',v_roles_count,'created_by_agent',true,'label','Created by JD'),
  updated_at=now()
 where id=p_approval_id and school_id=v_school;
 insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
 values(v_school,p_actor_id,v_approval.run_id,'organisation.departments.provisioned',
  jsonb_build_object('approval_id',p_approval_id,'blueprint_id',v_blueprint_id,'departments_created',v_count,'roles_created',v_roles_count,'created_by_agent',true));
 return jsonb_build_object('departments_created',v_count,'roles_created',v_roles_count,'created_by_agent',true,'label','Created by JD','status','completed');
end; $$;
revoke all on function public.jd_provision_approved_departments(uuid,uuid) from public,anon,authenticated;
grant execute on function public.jd_provision_approved_departments(uuid,uuid) to service_role;
