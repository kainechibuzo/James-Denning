JD Skills phase 5 rollout evidence — 2026-11-22

Project: James-Denning (thklwiybjuhrjqrrxyid, eu-west-1, ACTIVE_HEALTHY)
Performed via the Supabase Management API connector (audit ids in-session).

1. Preconditions checked before applying:
   - schools/auth.users/profiles/jd_audit_events/jd_automation_runs/storage.buckets present
   - skills RPCs absent; bucket absent; registry RPCs present (jd_read_agent_registry)
   - migration history matches repo (jd_agent_registry + jd_agent_execution_engine applied)
2. Migration `jd_skills_catalog` applied (create_migration, rollback-on-failure).
3. Post-apply verification (live SQL):
   - skill tables: 7; rls_enabled_tables: 7
   - skill functions: 10; immutable_triggers: 3
   - service_role grant on jd_skills_load: confirmed
   - bucket jd-skill-packages private, 20 MiB cap: confirmed
4. Smoke test (real admin profile, tenant 20968524-17de-47d3-9567-6ac48a4bb0a9):
   - jd_read_skills_catalog -> correct empty catalog; all authority flags false
   - jd_create_skill_import -> import db36635f-5cda-409a-8a88-43e694095ae3 with
     quarantine path 20968524-.../imports/009187e8-...-....zip
   - smoke import subsequently marked rejected with explanatory note; audit trail untouched
5. Secret JD_SKILLS_ENABLED=true created (2026-11-22T07:32:36Z; same value-hash
   pattern as the enabled JD_AGENT_* flags).

Not yet done (requires the reviewed GitHub release workflow + owner-managed vars):
   - jd-automation v24 predates the skills service; deploy via deploy.yml at
     cb34d425623e9da71106b477429d3f0bbe6644aa or later with deploy_functions=true.
   - Live two-admin verification checklist (see documentation/JD_SKILLS_ADMIN_DASHBOARD.md).

Note: the release contract pins thklwiybjuhrjqrrxyid as the production project;
the Supabase organisation has no separate staging project for James-Denning, so
schema + flag went live there directly. No code path is active until the
function release; the skills surface remains fail-closed for users.
