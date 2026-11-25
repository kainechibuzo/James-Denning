// Static contract for the database-side dispatch heartbeat: a pg_cron tick
// must call the reviewed scheduler endpoint every minute, read the worker
// secret from Vault (never from source control), stay a documented no-op
// without that secret, and be service-role-only. GitHub's dispatcher cron
// remains enabled as defence in depth.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const migration=readFileSync('supabase/migrations/20261125120000_jd_dispatch_tick.sql','utf8');
const rollback=readFileSync('supabase/migrations/20261125120000_jd_dispatch_tick.rollback.sql','utf8');
const dispatch=readFileSync('.github/workflows/jd-worker-dispatch.yml','utf8');
const deploy=readFileSync('.github/workflows/deploy.yml','utf8');
const autoRelease=readFileSync('.github/workflows/auto-release.yml','utf8');

test('heartbeat enables pg_cron and pg_net idempotently',()=>{
  assert.match(migration,/create extension if not exists pg_cron;/);
  assert.match(migration,/create extension if not exists pg_net;/);
  assert.match(rollback,/drop extension if exists pg_net;/);
  assert.match(rollback,/drop extension if exists pg_cron;/);
});

test('the tick reads the worker secret from Vault and never embeds one',()=>{
  assert.match(migration,/from vault\.decrypted_secrets where name='jd_worker_secret'/);
  assert.doesNotMatch(migration,/x-jd-worker-secret','[A-Za-z0-9+/=_-]{32,}'/);
  assert.match(migration,/length\(btrim\(v_secret\)\)<32/);
  assert.match(migration,/jsonb_build_object\('tick','skipped','reason','vault secret jd_worker_secret is not configured'\)/);
});

test('the tick posts to the reviewed scheduler endpoint which cascades worker wake',()=>{
  assert.match(migration,/net\.http_post\(/);
  assert.match(migration,/\/functions\/v1\/jd-task-scheduler/);
  assert.match(migration,/x-jd-worker-secret/);
  assert.doesNotMatch(migration,/jd-execution-worker/,'the scheduler wakes the worker itself; the tick must not duplicate that');
});

test('the schedule is registered idempotently and runs every minute',()=>{
  assert.match(migration,/exists\(select 1 from cron\.job where jobname='jd-dispatch-tick'\)/);
  assert.match(migration,/cron\.unschedule\('jd-dispatch-tick'\)/);
  assert.match(migration,/cron\.schedule\('jd-dispatch-tick','\* \* \* \* \*'/);
  assert.match(rollback,/cron\.unschedule\('jd-dispatch-tick'\)/);
});

test('the tick function is service-role-only and tenant-blind',()=>{
  assert.match(migration,/revoke all on function public\.jd_dispatch_tick\(\) from public,anon,authenticated/);
  assert.match(migration,/grant execute on function public\.jd_dispatch_tick\(\) to service_role/);
  assert.match(migration,/security definer set search_path=''/);
});

test('the GitHub dispatcher cron remains enabled as defence in depth',()=>{
  assert.match(dispatch,/schedule:\s*\n\s*- cron: "\*\/5 \* \* \* \*"/);
});

test('migrations apply only through the reviewed release gates',()=>{
  assert.match(deploy,/apply_migrations:\s*\n\s*description:.*needs SUPABASE_DB_PASSWORD/);
  assert.match(deploy,/default: false\s*\n\s*apply_migrations:/s);
  assert.match(deploy,/supabase db push --remote "\$JD_BACKEND_PROJECT_REF" --password "\$SUPABASE_DB_PASSWORD" --dry-run --skip-vault --yes/);
  assert.match(deploy,/supabase db push --remote "\$JD_BACKEND_PROJECT_REF" --password "\$SUPABASE_DB_PASSWORD" --skip-vault --yes/);
  assert.match(deploy,/needs SUPABASE_ACCESS_TOKEN configured in the release environment/);
  assert.doesNotMatch(deploy,/This workflow does not invoke workers, apply migrations/);
  assert.match(autoRelease,/apply_migrations=true/);
});

test('a missing db password skips loudly and never blocks a function release',()=>{
  assert.match(deploy,/id: migrations\n/);
  assert.match(deploy,/::warning::apply_migrations selected but SUPABASE_DB_PASSWORD is not configured/);
  assert.match(deploy,/migrations=skipped-missing-db-password/);
  assert.match(deploy,/exit 0\n          fi\n          supabase db push/);
  const migrationIdx=deploy.indexOf('Apply reviewed database migrations');
  const functionsIdx=deploy.indexOf('Deploy only the approved compatibility bundle');
  assert.ok(migrationIdx>-1 && functionsIdx>migrationIdx,'schema changes run before function code');
  assert.match(deploy,/Migration apply outcome: \$\{\{ steps\.migrations\.outputs\.migrations \|\| 'not-selected' \}\}/);
});
