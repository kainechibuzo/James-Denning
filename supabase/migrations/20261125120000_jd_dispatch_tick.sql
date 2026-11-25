-- Self-healing dispatch heartbeat: a database-side tick that calls the JD task
-- scheduler every minute, independent of GitHub Actions availability. The
-- GitHub dispatcher cron stays enabled as defence in depth; this removes the
-- multi-hour scheduled-run lulls during which retry_wait jobs sat orphaned.
-- The scheduler endpoint cascades on its own: approval expiry, stale-job
-- recovery, due schedule dispatch and the worker wake, so one authenticated
-- POST per minute is sufficient.
-- The worker secret is read from Supabase Vault ('jd_worker_secret', optional
-- 'jd_project_url' override). It is never committed to source control and the
-- tick is a documented no-op until an operator inserts it:
--   select vault.create_secret('<JD_WORKER_SECRET value>', 'jd_worker_secret');
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.jd_dispatch_tick()
returns jsonb language plpgsql security definer set search_path='' as $tick$
declare
  v_secret text;
  v_url text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name='jd_worker_secret' limit 1;
  v_url := coalesce(
    (select decrypted_secret from vault.decrypted_secrets where name='jd_project_url' limit 1),
    'https://thklwiybjuhrjqrrxyid.supabase.co'
  );
  if v_secret is null or length(btrim(v_secret))<32 then
    return jsonb_build_object('tick','skipped','reason','vault secret jd_worker_secret is not configured');
  end if;
  perform net.http_post(
    url => btrim(v_url)||'/functions/v1/jd-task-scheduler',
    headers => jsonb_build_object('Content-Type','application/json','x-jd-worker-secret',btrim(v_secret)),
    body => '{}'::jsonb
  );
  return jsonb_build_object('tick','dispatched');
end;
$tick$;
revoke all on function public.jd_dispatch_tick() from public,anon,authenticated;
grant execute on function public.jd_dispatch_tick() to service_role;

-- Idempotent schedule registration: replace any existing tick, then schedule
-- one dispatch per minute. Run history stays inspectable via cron.job_run_details.
do $do$
begin
  if exists(select 1 from cron.job where jobname='jd-dispatch-tick') then
    perform cron.unschedule('jd-dispatch-tick');
  end if;
  perform cron.schedule('jd-dispatch-tick','* * * * *',$tick$select public.jd_dispatch_tick();$tick$);
end
$do$;
