const migration = await Deno.readTextFile(new URL("../../migrations/20261111150000_jd_settings_proposal_review.sql", import.meta.url));
function assert(condition: unknown, message: string) { if (!condition) throw new Error(message); }

Deno.test("settings proposal migration binds approvals to immutable content hashes", () => {
  assert(migration.includes("proposal_hash text"), "hash column exists");
  assert(migration.includes("jd_approvals_school_proposal_hash_uidx"), "workspace hash uniqueness exists");
  assert(migration.includes("digest(convert_to(p_proposal_json::text, 'UTF8'), 'sha256')"), "server recomputes canonical JSONB hash");
  assert(migration.includes("p_proposal_hash"), "hash is supplied and checked");
});

Deno.test("settings proposal submission is tenant and admin scoped", () => {
  assert(migration.includes("where id = p_actor_id and role = 'admin'"), "admin role is checked server-side");
  assert(migration.includes("jd_automation_runs"), "proposal run is persisted");
  assert(migration.includes("jd_approvals"), "Review Centre approval is persisted");
  assert(migration.includes("jd_audit_events"), "proposal submission is audited");
});

Deno.test("settings proposal RPC is service-role only and does not execute settings", () => {
  assert(migration.includes("to service_role"), "service role receives execute");
  assert(migration.includes("from anon, authenticated"), "browser roles are revoked");
  assert(migration.includes("'not_executed'"), "proposal remains unexecuted");
  assert(!migration.includes("update public.school_settings"), "no settings write is present");
});
