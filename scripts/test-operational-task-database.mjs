// Execute repository SQL in an isolated in-memory PostgreSQL (PGlite).
// No network, credentials, Supabase connection or production data. This is a
// narrow RPC regression harness, NOT a full Supabase/RLS/migration rehearsal.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const dir = new URL("../supabase/migrations/", import.meta.url);
const read = (name) => readFileSync(new URL(name, dir), "utf8");
const db = new PGlite();
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const orgA = id(1), orgB = id(2), taskId = id(100);
const actors = { owner: id(10), admin: id(11), manager: id(12), staff: id(13), otherStaff: id(14), finance: id(15), outsider: id(16), viewer: id(17) };
const signature = "public.jd_transition_operational_task(uuid,uuid,text,text)";
function tableDDL(file, name) {
  const match = read(file).match(new RegExp(`create table if not exists public\\.${name} \\([\\s\\S]*?\\n\\);`, "i"));
  assert.ok(match, `Missing ${name} table definition`);
  return match[0];
}

before(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users (id uuid primary key);
    create table public.schools (id uuid primary key);
    create table public.profiles (id uuid primary key references auth.users, school_id uuid references public.schools, role text);
    create table public.jd_automation_runs (id uuid primary key);
  `);
  await db.exec(tableDDL("20261112084532_jd_batch01_organisation_operations_hiring.sql", "jd_operational_tasks"));
  await db.exec(tableDDL("20261111085143_jd_autonomous_automation.sql", "jd_audit_events"));
  // Apply all definitions of this RPC in migration order, not just the original
  // admin/manager-only definition. Discover uppercase/lowercase CREATE equally.
  let definitions = 0;
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = read(file);
    const pattern = /create or replace function public\.jd_transition_operational_task\s*\([\s\S]*?\bas\s+(\$[a-z_]*\$)[\s\S]*?\1\s*;/gi;
    for (const match of sql.matchAll(pattern)) {
      await db.exec(match[0]);
      definitions++;
    }
    for (const grant of sql.matchAll(/^(?:grant|revoke)[^\n]*on function public\.jd_transition_operational_task[^\n]*;/gmi)) {
      await db.exec(grant[0]);
    }
  }
  assert.ok(definitions >= 2, "Must include the later owner/staff role-matrix definition");
  await db.query("insert into public.schools values ($1), ($2)", [orgA, orgB]);
  for (const [role, actor] of Object.entries(actors)) {
    await db.query("insert into auth.users values ($1)", [actor]);
    await db.query("insert into public.profiles values ($1,$2,$3)", [actor, role === "outsider" ? orgB : orgA, role === "outsider" ? "manager" : role === "otherStaff" ? "staff" : role]);
  }
});
after(async () => { await db.close(); });
beforeEach(async () => {
  await db.exec("reset role; truncate public.jd_audit_events, public.jd_operational_tasks;");
  await db.query(`insert into public.jd_operational_tasks (id,school_id,created_by,assigned_to,title,idempotency_key)
    values ($1,$2,$3,$4,'Synthetic dispatch task','synthetic-task-100')`, [taskId, orgA, actors.owner, actors.staff]);
});

async function transition(actor, from = "queued", to = "in_progress", role = "service_role") {
  assert.ok(["service_role", "anon", "authenticated"].includes(role));
  await db.exec(`set role ${role}`);
  try {
    const result = await db.query("select public.jd_transition_operational_task($1,$2,$3,$4) as result", [actor, taskId, from, to]);
    return result.rows[0].result;
  } finally { await db.exec("reset role"); }
}
async function snapshot() {
  const tasks = await db.query("select status, completed_at, updated_at from public.jd_operational_tasks where id=$1", [taskId]);
  const audits = await db.query("select id, school_id, actor_id, event_type, event_json from public.jd_audit_events order by created_at");
  return { task: tasks.rows[0], audits: audits.rows };
}
async function denied(actor, code, from = "queued", to = "in_progress", role = "service_role") {
  const before = await snapshot();
  await assert.rejects(transition(actor, from, to, role), { code });
  assert.deepEqual(await snapshot(), before, "Rejected transition must change neither task nor audit");
}

for (const role of ["owner", "admin", "manager", "staff"]) {
  test(`${role}: transition persists with matching audit and completion timestamp`, async () => {
    const started = await transition(actors[role]);
    assert.equal(started.auditRecorded, true);
    assert.equal(started.task.status, "in_progress");
    let persisted = await snapshot();
    assert.equal(persisted.task.status, "in_progress");
    assert.equal(persisted.audits[0].id, started.auditId);
    assert.equal(persisted.audits[0].actor_id, actors[role]);
    assert.equal(persisted.audits[0].school_id, orgA);
    assert.equal(persisted.audits[0].event_type, "operational_task.status_changed");
    assert.deepEqual(persisted.audits[0].event_json, { task_id: taskId, from_status: "queued", to_status: "in_progress" });
    const completed = await transition(actors[role], "in_progress", "completed");
    persisted = await snapshot();
    assert.equal(persisted.task.status, "completed");
    assert.ok(persisted.task.completed_at);
    assert.equal(persisted.audits.length, 2);
    assert.equal(persisted.audits[1].id, completed.auditId);
  });
}
test("unassigned staff cannot change another employee's task", () => denied(actors.otherStaff, "42501"));
test("staff cannot change an unassigned task", async () => {
  await db.exec("update public.jd_operational_tasks set assigned_to=null");
  await denied(actors.staff, "42501");
});
test("staff cannot cancel an assigned task", () => denied(actors.staff, "42501", "queued", "cancelled"));
test("staff cannot requeue a blocked task", async () => {
  await db.exec("update public.jd_operational_tasks set status='blocked'");
  await denied(actors.staff, "42501", "blocked", "queued");
});
test("staff can block and resume an assigned task", async () => {
  await transition(actors.staff);
  await transition(actors.staff, "in_progress", "blocked");
  await transition(actors.staff, "blocked", "in_progress");
  assert.equal((await snapshot()).audits.length, 3);
});
test("cross-tenant manager sees no task and cannot mutate it", () => denied(actors.outsider, "P0002"));
for (const role of ["finance", "viewer"]) test(`${role} cannot transition tasks`, () => denied(actors[role], "42501"));
test("unknown actor cannot transition tasks", () => denied(id(999), "42501"));
test("stale/replayed expected status does not produce a duplicate audit", async () => {
  await transition(actors.manager);
  await denied(actors.manager, "40001");
  assert.equal((await snapshot()).audits.length, 1);
});
test("invalid transition cannot skip directly to completion", () => denied(actors.manager, "22023", "queued", "completed"));
test("terminal tasks cannot be reopened", async () => {
  await transition(actors.manager);
  await transition(actors.manager, "in_progress", "completed");
  await denied(actors.manager, "22023", "completed", "queued");
});
for (const role of ["anon", "authenticated"]) {
  test(`${role} cannot call the SECURITY DEFINER RPC with a forged actor`, () => denied(actors.owner, "42501", "queued", "in_progress", role));
}
test("audit insertion failure rolls back the status and timestamp update", async () => {
  // Simulate an unavailable audit sink with a database constraint, not a mocked RPC.
  await db.exec("alter table public.jd_audit_events add constraint force_audit_failure check (event_type <> 'operational_task.status_changed')");
  try { await denied(actors.owner, "23514"); }
  finally { await db.exec("alter table public.jd_audit_events drop constraint force_audit_failure"); }
});
test("service-only grants and empty search_path survive the role-matrix replacement", async () => {
  const { rows } = await db.query(`select
    has_function_privilege('anon', $1, 'EXECUTE') as anon,
    has_function_privilege('authenticated', $1, 'EXECUTE') as authenticated,
    has_function_privilege('service_role', $1, 'EXECUTE') as service`, [signature]);
  assert.deepEqual(rows[0], { anon: false, authenticated: false, service: true });
  const { rows: functions } = await db.query("select prosecdef, proconfig from pg_proc where oid=$1::regprocedure", [signature]);
  assert.equal(functions[0].prosecdef, true);
  assert.ok(functions[0].proconfig.includes('search_path=""'));
});
