-- Rollback of the database-side dispatch heartbeat.
do $do$
begin
  if exists(select 1 from cron.job where jobname='jd-dispatch-tick') then
    perform cron.unschedule('jd-dispatch-tick');
  end if;
end
$do$;
drop function if exists public.jd_dispatch_tick();
drop extension if exists pg_net;
drop extension if exists pg_cron;
