-- Expire pending workspace and connector approvals in one auditable service-only operation.
create or replace function public.jd_expire_stale_approvals()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_business_count integer := 0;
  v_connector_count integer := 0;
begin
  with expired as (
    update public.jd_approvals
    set status = 'expired', updated_at = v_now
    where status = 'pending' and expires_at <= v_now
    returning id, school_id, requested_by, run_id, expires_at
  ), audited as (
    insert into public.jd_audit_events(school_id, actor_id, run_id, event_type, event_json)
    select school_id, requested_by, run_id, 'approval.expired',
      jsonb_build_object('approval_id', id, 'expired_at', expires_at, 'expired_by', 'system')
    from expired
    returning id
  )
  select count(*)::integer into v_business_count from expired;

  with expired as (
    update public.jd_connector_approvals
    set status = 'expired', resolved_at = v_now
    where status = 'pending' and expires_at <= v_now
    returning id, school_id, requested_by, server_id, tool_name, expires_at
  ), audited as (
    insert into public.jd_audit_events(school_id, actor_id, event_type, event_json)
    select school_id, requested_by, 'connector.approval.expired',
      jsonb_build_object('approval_id', id, 'server_id', server_id, 'tool_name', tool_name, 'expired_at', expires_at, 'expired_by', 'system')
    from expired
    returning id
  )
  select count(*)::integer into v_connector_count from expired;

  return jsonb_build_object(
    'workspace_approvals_expired', v_business_count,
    'connector_approvals_expired', v_connector_count,
    'expired_at', v_now
  );
end;
$$;

revoke all on function public.jd_expire_stale_approvals() from public, anon, authenticated;
grant execute on function public.jd_expire_stale_approvals() to service_role;
