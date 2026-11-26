const approvalSql = await Deno.readTextFile("supabase/migrations/20261119193606_jd_approval_expiration_lifecycle.sql");
const taskSql = await Deno.readTextFile("supabase/migrations/20261119193608_jd_task_provenance_atomic.sql");

Deno.test("approval expiry migration expires both pending queues and writes audit evidence", () => {
  if (!approvalSql.includes("public.jd_approvals") || !approvalSql.includes("public.jd_connector_approvals")) {
    throw new Error("Both workspace and connector approval queues must be covered");
  }
  if ((approvalSql.match(/status = 'pending' and expires_at <= v_now/g) || []).length !== 2) {
    throw new Error("Both approval queues must expire only stale pending records");
  }
  for (const event of ["approval.expired", "connector.approval.expired"]) {
    if (!approvalSql.includes(event)) throw new Error("Missing expiry audit event: " + event);
  }
  if (!approvalSql.includes("revoke all on function public.jd_expire_stale_approvals() from public, anon, authenticated")) {
    throw new Error("Expiry RPC must not be callable by public client roles");
  }
  if (!approvalSql.includes("grant execute on function public.jd_expire_stale_approvals() to service_role")) {
    throw new Error("Expiry RPC must be service-role only");
  }
});

Deno.test("task creation migration persists agent provenance in the atomic idempotent insert", () => {
  if (!taskSql.includes("add column if not exists created_by_agent boolean not null default false")) {
    throw new Error("Legacy task tables must receive the provenance column safely");
  }
  if (!taskSql.includes("role in ('owner','admin','manager')")) {
    throw new Error("Task creator role matrix must preserve owner, admin and manager");
  }
  if (!taskSql.includes("school_id,created_by,created_by_agent,title")) {
    throw new Error("Task provenance must be part of the original insert");
  }
  if (!taskSql.includes("v_school,p_actor_id,true,btrim(p_title)")) {
    throw new Error("New task records must persist created_by_agent=true atomically");
  }
  if (!taskSql.includes("on conflict (school_id,idempotency_key) do nothing")) {
    throw new Error("Task idempotency behavior must remain intact");
  }
});
