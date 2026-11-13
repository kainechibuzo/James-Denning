const migration = Deno.readTextFileSync("supabase/migrations/20261112084827_jd_workflow_versioned_drafts.sql");

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

Deno.test("workflow persistence is tenant-scoped and browser-inaccessible", () => {
  assert(migration.includes("school_id uuid not null references public.schools(id)"), "tenant key required");
  assert(migration.includes("alter table public.jd_workflows enable row level security"), "workflow RLS enabled");
  assert(migration.includes("alter table public.jd_workflow_versions enable row level security"), "version RLS enabled");
  assert(migration.includes("revoke all on public.jd_workflows, public.jd_workflow_versions from anon, authenticated"), "browser roles revoked");
});

Deno.test("workflow versions are immutable to service-role API writes", () => {
  assert(migration.includes("revoke update, delete on public.jd_workflow_versions from service_role"), "version mutation revoked");
  assert(migration.includes("grant select, insert on public.jd_workflow_versions to service_role"), "version insert/select only");
  assert(migration.includes("unique (workflow_id, version_no)"), "version numbers unique per workflow");
});

Deno.test("draft save enforces manager role and optimistic version checks", () => {
  assert(migration.includes("p.role in ('admin','manager')"), "server-side role check required");
  assert(migration.includes("v_workflow.latest_version_no <> coalesce(p_expected_version,-1)"), "stale writes rejected");
  assert(migration.includes("jsonb_array_length(p_definition->'nodes') not between 2 and 100"), "node count bounded");
  assert(migration.includes("jsonb_array_length(p_definition->'edges') > 200"), "edge count bounded");
});

Deno.test("review proposal binds immutable version id and definition hash", () => {
  assert(migration.includes("'workflow_id',v_workflow.id,'version_id',v_version.id"), "proposal includes exact workflow/version");
  assert(migration.includes("'definition_hash',v_version.definition_hash"), "proposal includes definition hash");
  assert(migration.includes("v_version.version_no <> v_workflow.latest_version_no"), "only latest version may be reviewed");
  assert(migration.includes("proposal_hash = v_proposal_hash"), "duplicate review submission is idempotent");
});

Deno.test("activation requires admin, approved review and unchanged latest version", () => {
  assert(migration.includes("where p.id = p_actor_id and p.role = 'admin'"), "admin activation gate required");
  assert(migration.includes("v_approval.status <> 'approved'"), "approval decision required");
  assert(migration.includes("v_version.definition_hash <> v_expected_hash"), "definition hash must match approval");
  assert(migration.includes("v_approval.proposal_hash <> encode(public.digest"), "proposal envelope hash verified");
  assert(migration.includes("v_version.version_no <> v_workflow.latest_version_no"), "stale approved versions cannot activate");
});

Deno.test("all privileged workflow RPCs are service-role-only", () => {
  for (const signature of [
    "public.jd_save_workflow_draft(uuid,uuid,integer,jsonb)",
    "public.jd_submit_workflow_review(uuid,uuid,uuid)",
    "public.jd_activate_approved_workflow(uuid,uuid)",
  ]) {
    assert(migration.includes(`revoke all on function ${signature} from public,anon,authenticated`), `public execute revoked: ${signature}`);
    assert(migration.includes(`grant execute on function ${signature} to service_role`), `service role granted: ${signature}`);
  }
});
