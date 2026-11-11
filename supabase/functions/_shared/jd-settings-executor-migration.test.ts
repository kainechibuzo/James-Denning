const migration = await Deno.readTextFile(new URL("../../migrations/20261111160000_jd_approved_settings_executor.sql", import.meta.url));
function assert(condition: unknown, message: string) { if (!condition) throw new Error(message); }

Deno.test("executor requires an approved hash-bound settings proposal", () => {
  assert(migration.includes("v_approval.status <> 'approved'"), "approval status enforced");
  assert(migration.includes("v_approval.action_key <> 'settings.apply'"), "action type enforced");
  assert(migration.includes("digest(convert_to(v_approval.proposal_json::text, 'UTF8'), 'sha256')"), "exact stored proposal hash recomputed");
  assert(migration.includes("for update"), "approval row locked during each step");
});

Deno.test("executor limits writes to registered keys and revalidates values", () => {
  assert(migration.includes("'workspace_type'"), "registered key allowlist exists");
  assert(migration.includes("v_change->>'approval_required'"), "step must be approval-required");
  assert(migration.includes("Invalid boolean setting value"), "boolean validation exists");
  assert(migration.includes("Invalid score maximum"), "numeric score validation exists");
  assert(migration.includes("Invalid workspace type"), "workspace type validation exists");
});

Deno.test("executor checks stale before-values and verifies persisted values", () => {
  assert(migration.includes("STALE_PROPOSAL"), "stale proposals are recorded as conflicts");
  assert(migration.includes("Current setting changed after proposal review"), "conflict explains stale value");
  assert(migration.includes("Settings read-after-write verification failed"), "read-after-write verification exists");
});

Deno.test("execution steps are idempotent and separately audited", () => {
  assert(migration.includes("unique (approval_id, step_index)"), "one record per proposal step");
  assert(migration.includes("already_completed"), "completed steps are never applied twice");
  assert(migration.includes("settings.step_completed"), "each completed step is audited");
  assert(migration.includes("settings.step_conflict"), "conflicts are audited");
  assert(migration.includes("settings.proposal_completed"), "final completion is audited");
});

Deno.test("database executor is service-role only", () => {
  assert(migration.includes("from public, anon, authenticated"), "browser and public execute grants revoked");
  assert(migration.includes("to service_role"), "service role receives execute");
});
