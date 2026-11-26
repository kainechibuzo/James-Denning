import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const migration = readFileSync("supabase/migrations/20261119193606_jd_approval_expiration_lifecycle.sql", "utf8");
const ids = {
  school: "00000000-0000-4000-8000-000000000001",
  actor: "00000000-0000-4000-8000-000000000002",
  run: "00000000-0000-4000-8000-000000000003",
  server: "00000000-0000-4000-8000-000000000004",
  businessExpired: "00000000-0000-4000-8000-000000000010",
  businessFresh: "00000000-0000-4000-8000-000000000011",
  businessApproved: "00000000-0000-4000-8000-000000000012",
  connectorExpired: "00000000-0000-4000-8000-000000000020",
  connectorFresh: "00000000-0000-4000-8000-000000000021",
  connectorDenied: "00000000-0000-4000-8000-000000000022",
};

before(async () => {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create table public.jd_approvals (
      id uuid primary key, school_id uuid not null, requested_by uuid not null,
      run_id uuid not null, status text not null, expires_at timestamptz not null,
      updated_at timestamptz not null default now()
    );
    create table public.jd_connector_approvals (
      id uuid primary key, school_id uuid not null, requested_by uuid not null,
      server_id uuid not null, tool_name text not null, status text not null,
      expires_at timestamptz not null, resolved_at timestamptz
    );
    create table public.jd_audit_events (
      id bigint generated always as identity primary key,
      school_id uuid not null, actor_id uuid, run_id uuid, event_type text not null,
      event_json jsonb not null, created_at timestamptz not null default now()
    );
  `);
  await db.exec(migration);
  await db.query(`
    insert into public.jd_approvals(id,school_id,requested_by,run_id,status,expires_at)
    values
      ($1,$2,$3,$4,'pending',now()-interval '1 minute'),
      ($5,$2,$3,$4,'pending',now()+interval '1 hour'),
      ($6,$2,$3,$4,'approved',now()-interval '1 minute')
  `, [ids.businessExpired,ids.school,ids.actor,ids.run,ids.businessFresh,ids.businessApproved]);
  await db.query(`
    insert into public.jd_connector_approvals(id,school_id,requested_by,server_id,tool_name,status,expires_at)
    values
      ($1,$2,$3,$4,'create_branch','pending',now()-interval '1 minute'),
      ($5,$2,$3,$4,'create_branch','pending',now()+interval '1 hour'),
      ($6,$2,$3,$4,'create_branch','denied',now()-interval '1 minute')
  `, [ids.connectorExpired,ids.school,ids.actor,ids.server,ids.connectorFresh,ids.connectorDenied]);
});
after(async () => { await db.close(); });

test("expires only stale pending approvals in both queues and records system audit events", async () => {
  const result = await db.query("select public.jd_expire_stale_approvals() as result");
  assert.equal(result.rows[0].result.workspace_approvals_expired, 1);
  assert.equal(result.rows[0].result.connector_approvals_expired, 1);

  const business = await db.query("select id,status from public.jd_approvals order by id");
  assert.deepEqual(Object.fromEntries(business.rows.map(row=>[row.id,row.status])), {
    [ids.businessExpired]:"expired",
    [ids.businessFresh]:"pending",
    [ids.businessApproved]:"approved",
  });
  const connector = await db.query("select id,status,resolved_at from public.jd_connector_approvals order by id");
  const connectorRows = Object.fromEntries(connector.rows.map(row=>[row.id,row]));
  assert.equal(connectorRows[ids.connectorExpired].status,"expired");
  assert.ok(connectorRows[ids.connectorExpired].resolved_at);
  assert.equal(connectorRows[ids.connectorFresh].status,"pending");
  assert.equal(connectorRows[ids.connectorDenied].status,"denied");

  const audit = await db.query("select actor_id,event_type,event_json from public.jd_audit_events order by id");
  assert.equal(audit.rows.length,2);
  assert.deepEqual(audit.rows.map(row=>row.event_type),["approval.expired","connector.approval.expired"]);
  assert.ok(audit.rows.every(row=>row.actor_id===null));
  assert.ok(audit.rows.every(row=>row.event_json.expired_by==="system"));
});

test("approval expiry is idempotent and does not duplicate audit events", async () => {
  const result = await db.query("select public.jd_expire_stale_approvals() as result");
  assert.equal(result.rows[0].result.workspace_approvals_expired, 0);
  assert.equal(result.rows[0].result.connector_approvals_expired, 0);
  const audit = await db.query("select count(*)::int as count from public.jd_audit_events");
  assert.equal(audit.rows[0].count,2);
});

test("approval expiry RPC is restricted to service_role", async () => {
  const result = await db.query(`
    select
      has_function_privilege('anon','public.jd_expire_stale_approvals()','EXECUTE') as anon,
      has_function_privilege('authenticated','public.jd_expire_stale_approvals()','EXECUTE') as authenticated,
      has_function_privilege('service_role','public.jd_expire_stale_approvals()','EXECUTE') as service
  `);
  assert.deepEqual(result.rows[0],{anon:false,authenticated:false,service:true});
});
