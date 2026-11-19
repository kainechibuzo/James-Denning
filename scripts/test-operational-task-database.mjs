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
const actors = { owner: id(10), admin: id(11), manager: id(12), staff: id(13), otherStaff: id(14), finance: id(15), outsider: id(16), viewer: id(17), hr: id(18), contractor: id(19) };
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
  await db.exec(read("20261119151000_jd_task_provenance_atomic.sql").split("create or replace function")[0]);
  await db.exec(tableDDL("20261111085143_jd_autonomous_automation.sql", "jd_audit_events"));
  // Apply all definitions of the transition and creation RPCs in migration order, not just the original
  // admin/manager-only definition. Discover uppercase/lowercase CREATE equally.
  let definitions = 0;
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = read(file);
    const pattern = /create or replace function public\.(?:jd_transition_operational_task|jd_create_operational_task|jd_assign_operational_task)\s*\([\s\S]*?\bas\s+(\$[a-z_]*\$)[\s\S]*?\1\s*;/gi;
    for (const match of sql.matchAll(pattern)) {
      await db.exec(match[0]);
      definitions++;
    }
    for (const grant of sql.matchAll(/^(?:grant|revoke)[^\n]*on function public\.(?:jd_transition_operational_task|jd_create_operational_task|jd_assign_operational_task)[^\n]*;/gmi)) {
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

async function createTask(actor=actors.manager,patch={},role="service_role") {
  const task={title:"Synthetic creation",description:"Test only",department:"Operations",due:null,priority:"normal",key:"creation-test-request",...patch};
  await db.exec(`set role ${role}`);
  try{return (await db.query("select public.jd_create_operational_task($1,$2,$3,$4,$5,$6,$7) as result",[actor,task.title,task.description,task.department,task.due,task.priority,task.key])).rows[0].result;}
  finally{await db.exec("reset role");}
}
for(const role of ["owner","admin","manager"]){
 test(`${role}: creation replay persists one task and returns the original audit`,async()=>{
  const first=await createTask(actors[role]);const second=await createTask(actors[role]);
  assert.equal(first.reused,false);assert.equal(second.reused,true);assert.equal(second.task.id,first.task.id);assert.equal(second.auditId,first.auditId);assert.equal(second.auditRecorded,true);assert.equal(first.task.created_by_agent,true);assert.equal(second.task.created_by_agent,true);
  const rows=await db.query("select id from public.jd_operational_tasks where idempotency_key='creation-test-request'");assert.equal(rows.rows.length,1);
  const audits=await db.query("select id,event_json from public.jd_audit_events where event_type='operational_task.created'");assert.equal(audits.rows.length,1);assert.equal(audits.rows[0].id,first.auditId);assert.equal(audits.rows[0].event_json.task_id,first.task.id);
 });
}
test("creation key reuse with different payload is rejected without another task/audit",async()=>{
 const first=await createTask();for(const patch of [{title:"Different"},{description:"Different"},{department:"Different"},{priority:"urgent"},{due:"2026-11-17T00:00:00Z"}])await assert.rejects(createTask(actors.manager,patch),{code:"22023"});
 assert.equal((await createTask()).task.id,first.task.id);assert.equal((await db.query("select id from public.jd_audit_events")).rows.length,1);
});
test("identical creation keys are isolated by tenant",async()=>{
 const first=await createTask(),other=await createTask(actors.outsider);assert.notEqual(first.task.id,other.task.id);assert.equal(first.task.school_id,orgA);assert.equal(other.task.school_id,orgB);
});
for(const role of ["staff","finance","viewer"]){test(`${role}: creation rejected without a task or audit`,async()=>{
 await assert.rejects(createTask(actors[role]),{code:"42501"});assert.equal((await db.query("select id from public.jd_audit_events")).rows.length,0);assert.equal((await db.query("select id from public.jd_operational_tasks")).rows.length,1);
});}
for(const role of ["anon","authenticated"]){test(`${role}: cannot forge creation actor through the service-only RPC`,async()=>{
 await assert.rejects(createTask(actors.owner,{},role),{code:"42501"});
});}
test("audit failure rolls back creation, allowing safe retry with the same identity",async()=>{
 await db.exec("alter table public.jd_audit_events add constraint force_create_audit_failure check (event_type <> 'operational_task.created')");
 try {await assert.rejects(createTask(),{code:"23514"});assert.equal((await db.query("select id from public.jd_operational_tasks where idempotency_key='creation-test-request'")).rows.length,0);}
 finally{await db.exec("alter table public.jd_audit_events drop constraint force_create_audit_failure");}
 assert.equal((await createTask()).auditRecorded,true);
});
test("legacy reused task without original creation audit does not manufacture audit evidence",async()=>{
 await db.exec("update public.jd_operational_tasks set title='Synthetic creation',description='Test only',department='Operations',idempotency_key='creation-test-request'");
 const result=await createTask();assert.equal(result.reused,true);assert.equal(result.task.created_by_agent,true);assert.equal(result.auditRecorded,false);assert.equal(result.auditId,null);assert.equal((await db.query("select id from public.jd_audit_events")).rows.length,0);
});

const assignmentSignature = 'public.jd_assign_operational_task(uuid,uuid,uuid,uuid,timestamptz)';
async function assignmentSnapshot(){
 // PostgreSQL text retains microseconds; JS Date would truncate the CAS version.
 const {rows}=await db.query('select assigned_to,updated_at::text from public.jd_operational_tasks where id=$1',[taskId]);
 return {task:rows[0],audits:(await db.query('select * from public.jd_audit_events order by id')).rows};
}
async function assignTask(actor=actors.manager,patch={},role='service_role'){
 const observed=(await assignmentSnapshot()).task;
 const args={taskId,assignee:actors.otherStaff,expected:observed.assigned_to,version:observed.updated_at,...patch};
 await db.exec(`set role ${role}`);
 try{return(await db.query('select public.jd_assign_operational_task($1,$2,$3,$4,$5) as result',[actor,args.taskId,args.assignee,args.expected,args.version])).rows[0].result;}
 finally{await db.exec('reset role');}
}
async function assignmentDenied(actor,code,patch={},role='service_role'){
 const before=await assignmentSnapshot();await assert.rejects(assignTask(actor,patch,role),{code});assert.deepEqual(await assignmentSnapshot(),before);
}
for(const role of ['owner','admin','manager'])test(`${role}: assignment and matching audit commit atomically`,async()=>{
 const before=await assignmentSnapshot();const ack=await assignTask(actors[role]);const after=await assignmentSnapshot();
 assert.equal(ack.task.assigned_to,actors.otherStaff);assert.equal(ack.auditRecorded,true);assert.equal(ack.changed,true);
 assert.notEqual(after.task.updated_at,before.task.updated_at);assert.equal(after.audits.length,1);assert.equal(after.audits[0].id,ack.auditId);
 assert.equal(after.audits[0].actor_id,actors[role]);assert.equal(after.audits[0].school_id,orgA);
 assert.equal(after.audits[0].event_type,'operational_task.assigned');assert.equal(after.audits[0].event_json.from_assignee_id,actors.staff);assert.equal(after.audits[0].event_json.to_assignee_id,actors.otherStaff);
});
for(const role of ['staff','finance','viewer'])test(`${role}: cannot assign`,()=>assignmentDenied(actors[role],'42501'));
test('assignment rejects unknown actor',()=>assignmentDenied(id(999),'42501'));
test('assignment cannot address a cross-tenant task',()=>assignmentDenied(actors.outsider,'P0002'));
for(const assignee of [actors.outsider,actors.viewer,id(999)])test(`assignment rejects ineligible assignee ${assignee}`,()=>assignmentDenied(actors.manager,'42501',{assignee}));
for(const role of ['anon','authenticated'])test(`${role}: cannot forge assignment actor`,()=>assignmentDenied(actors.owner,'42501',{},role));
test('assignment rejects changed assignee and changed version independently',async()=>{
 await assignmentDenied(actors.manager,'40001',{expected:null});
 await assignmentDenied(actors.manager,'40001',{version:'2000-01-01T00:00:00Z'});
});
test('assignment replay after lost response cannot duplicate audit',async()=>{
 const initial=(await assignmentSnapshot()).task;await assignTask();await assignmentDenied(actors.manager,'40001',{expected:initial.assigned_to,version:initial.updated_at});assert.equal((await assignmentSnapshot()).audits.length,1);
});
test('assignment uses microsecond versions and prevents ABA overwrite',async()=>{
 await db.exec("update public.jd_operational_tasks set updated_at='2099-01-01T00:00:00.123456Z'");
 const initial=(await assignmentSnapshot()).task;await assignTask();await assignTask(actors.manager,{assignee:actors.staff});
 await assignmentDenied(actors.manager,'40001',{expected:initial.assigned_to,version:initial.updated_at});
 assert.match((await assignmentSnapshot()).task.updated_at,/123458/);
});
test('unassigned task assignment uses explicit null expected value',async()=>{
 await db.exec('update public.jd_operational_tasks set assigned_to=null');const result=await assignTask();assert.equal(result.task.assigned_to,actors.otherStaff);
 assert.equal((await assignmentSnapshot()).audits[0].event_json.from_assignee_id,null);
});
test('same-assignee confirmation advances version and records changed false',async()=>{
 const initial=(await assignmentSnapshot()).task;const ack=await assignTask(actors.manager,{assignee:actors.staff});assert.equal(ack.changed,false);assert.notEqual((await assignmentSnapshot()).task.updated_at,initial.updated_at);
 await assignmentDenied(actors.manager,'40001',{assignee:actors.staff,version:initial.updated_at});
});
test('audit failure rolls back assignment and version',async()=>{
 await db.exec("alter table public.jd_audit_events add constraint force_assignment_audit_failure check(event_type <> 'operational_task.assigned')");
 try{await assignmentDenied(actors.manager,'23514');}finally{await db.exec('alter table public.jd_audit_events drop constraint force_assignment_audit_failure');}
});
test('assignment requires expected version and valid IDs',async()=>{
 for(const patch of [{version:null},{assignee:null},{taskId:null}])await assignmentDenied(actors.manager,'22023',patch);
});
test('assignment remains service-only with empty search path',async()=>{
 const {rows}=await db.query("select has_function_privilege('anon',$1,'EXECUTE') as anon,has_function_privilege('authenticated',$1,'EXECUTE') as authenticated,has_function_privilege('service_role',$1,'EXECUTE') as service",[assignmentSignature]);
 assert.deepEqual(rows[0],{anon:false,authenticated:false,service:true});
 const {rows:f}=await db.query('select prosecdef,proconfig from pg_proc where oid=$1::regprocedure',[assignmentSignature]);assert.equal(f[0].prosecdef,true);assert.ok(f[0].proconfig.includes('search_path=""'));
});
for(const role of ['owner','admin','manager','staff','finance','hr','contractor'])test(`${role}: eligible tenant member can be assigned`,async()=>{
 const result=await assignTask(actors.manager,{assignee:actors[role]});assert.equal(result.task.assigned_to,actors[role]);assert.equal(result.auditRecorded,true);
});
test('assignment rollback removes executable RPC without deleting existing records/audits; reviewed reapply restores service-only grants',async()=>{
 await assignTask();const snapshot=await assignmentSnapshot();
 const rollback=readFileSync(new URL('../supabase/rollback/20261116203000_jd_atomic_task_assignment.rollback.sql',import.meta.url),'utf8');
 await db.exec(rollback);assert.deepEqual(await assignmentSnapshot(),snapshot);
 await assert.rejects(assignTask(),{code:'42883'});
 await db.exec(read('20261116203000_jd_atomic_task_assignment.sql'));
 assert.deepEqual(await assignmentSnapshot(),snapshot);
 const {rows}=await db.query("select has_function_privilege('authenticated',$1,'EXECUTE') as allowed",[assignmentSignature]);assert.equal(rows[0].allowed,false);
});
