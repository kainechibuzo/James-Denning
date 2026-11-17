-- Empty-schema rollback ONLY. Never erase accounting or audit evidence.
begin;
lock table public.jd_usage_accounts,public.jd_usage_runs,public.jd_usage_events in access exclusive mode;
do $$ begin
 if exists(select 1 from public.jd_usage_accounts) or exists(select 1 from public.jd_usage_runs) or exists(select 1 from public.jd_usage_events) then
  raise exception 'Usage ledger contains retained records; preservation migration required';
 end if;
end; $$;
drop function public.jd_usage_snapshot(uuid);
drop function public.jd_reconcile_usage(uuid,uuid,uuid);
drop function public.jd_observe_usage(uuid,uuid,uuid,integer,text);
drop function public.jd_reserve_usage(uuid,uuid,uuid,text,bigint);
drop function public.jd_configure_usage(uuid,uuid,integer,bigint,text);
drop function public.jd_usage_actor_tenant(uuid);
drop table public.jd_usage_events;
drop table public.jd_usage_runs;
drop table public.jd_usage_accounts;
drop function public.jd_usage_immutable_event();
commit;
