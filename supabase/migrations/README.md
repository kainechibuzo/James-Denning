# Supabase migration history reconciliation

Project: `thklwiybjuhrjqrrxyid` (James-Denning, production)

Reconciled against the live `supabase_migrations.schema_migrations` history on 2026-11-26.

## Rules

- Only forward migrations belong directly in `supabase/migrations/`.
- A forward migration's filename prefix must exactly equal the version recorded in the target project's `schema_migrations` table when that migration has already been applied.
- Do not rename a pending migration to an already-applied version, fabricate placeholder SQL, or edit remote migration history to make the lists appear aligned.
- Files not confirmed as applied are kept in `supabase/migrations_pending/`; they are deliberately excluded from normal Supabase CLI migration discovery.
- Rollback scripts are kept in `supabase/migration_rollbacks/`; they are manual recovery references, never forward migrations.
- Before applying any pending migration, inspect its full SQL and dependencies against the live schema, rehearse it in an isolated database, then explicitly approve the production release.

## Reconciliation result

- Remote production migration records: 122
- Local forward migration files retained in the active migration directory: 112
- Pending/unapplied migration files moved out of the active directory: 8
- Rollback scripts moved out of the active directory: 13
- Remote migration records without a matching local forward SQL file: 10

## Filename corrections

The following SQL files were already represented in production history under a different version prefix. Their SQL bytes were preserved; only their filenames were changed to the exact recorded production version.

- `20261117130000_jd_agent_registry.sql` → `20261121194612_jd_agent_registry.sql`
- `20261118080000_jd_workspace_read_services.sql` → `20261118105244_jd_workspace_read_services.sql`
- `20261118100000_jd_connector_oauth.sql` → `20261118105306_jd_connector_oauth.sql`
- `20261118100001_jd_workspace_refresh_leases.sql` → `20261118105315_jd_workspace_refresh_leases.sql`
- `20261118120000_jd_connector_pasted_tokens.sql` → `20261118113318_jd_connector_pasted_tokens.sql`
- `20261119120000_jd_connector_outcome_unknown.sql` → `20261119055738_jd_connector_outcome_unknown.sql`
- `20261119150000_jd_approval_expiration_lifecycle.sql` → `20261119193606_jd_approval_expiration_lifecycle.sql`
- `20261119151000_jd_task_provenance_atomic.sql` → `20261119193608_jd_task_provenance_atomic.sql`
- `20261120084500_jd_commercial_billing.sql` → `20261124135133_jd_commercial_billing.sql`
- `20261121100000_jd_conversation_interactions.sql` → `20261121084947_jd_conversation_interactions.sql`
- `20261121150000_jd_approved_execution_release.sql` → `20261123094028_jd_approved_execution_release.sql`
- `20261121180000_jd_agent_execution_engine.sql` → `20261121194615_jd_agent_execution_engine.sql`
- `20261122120000_jd_skills_catalog.sql` → `20261122073215_jd_skills_catalog.sql`
- `20261122210000_jd_skills_autonomous.sql` → `20261122190743_jd_skills_autonomous.sql`
- `20261122220000_jd_discovery_autonomy.sql` → `20261122222208_jd_discovery_autonomy.sql`
- `20261124090000_jd_workforce_assignments.sql` → `20261123133630_jd_workforce_assignments.sql`
- `20261124110000_jd_workforce_control_centre.sql` → `20261123164820_jd_workforce_control_centre.sql`
- `20261124130000_jd_specialist_run_approval_billing.sql` → `20261124135136_jd_specialist_run_approval_billing.sql`
- `20261124130000_jd_workforce_lifecycle_and_employee_budgets.sql` → `20261123164824_jd_workforce_lifecycle_and_employee_budgets.sql`
- `20261124150000_harden_workforce_event_trigger.sql` → `20261123164842_harden_workforce_event_trigger.sql`
- `20261124170000_jd_approved_workforce_activation.sql` → `20261124175434_jd_approved_workforce_activation.sql`
- `20261124170000_jd_specialist_quote_only_estimates.sql` → `20261124175427_jd_specialist_quote_only_estimates.sql`
- `20261125090000_jd_run_discovery_link.sql` → `20261123141255_jd_run_discovery_link.sql`
- `20261125110000_jd_finish_error_details.sql` → `20261124184202_jd_finish_error_details.sql`

## Pending migrations

These files have no matching applied migration version in production. They remain preserved under `supabase/migrations_pending/` and must not be included in an automatic production push:

- `20261116203000_jd_atomic_task_assignment.sql`
- `20261116210000_jd_retry_run_integrity.sql`
- `20261117120000_jd_usage_ledger.sql`
- `20261117220000_jd_atomic_execution_cancel.sql`
- `20261120130000_jd_billing_payment_finalization.sql`
- `20261121170000_jd_execution_retry_cancel_recovery.sql`
- `20261124180000_jd_workforce_private_chat.sql`
- `20261124195000_jd_workforce_specialist_catalogue.sql`

A missing version record is not proof that a migration is safe or necessary to apply. Some pending migrations overlap later implementations; others correspond to database objects that are currently absent. Review each one independently.

Live checks during this reconciliation confirmed:
- Missing: `jd_assign_operational_task`, `jd_cancel_execution_job_checked`, `jd_billing_finalize_payment`, and `jd_list_workforce_specialists`.
- Missing: `jd_usage_accounts`, `jd_usage_runs`, and `jd_usage_events`.
- Existing workforce chat tables do not yet contain the newer private-chat columns described by the pending migration.
- Existing retry-related functions are not, by themselves, proof that the pending SQL migration was applied exactly.

## Production-applied versions without local forward SQL

The following versions exist in production history but have no matching forward SQL file in this repository snapshot. Their SQL was not reconstructed or invented during this cleanup:

- `20261121170702` — `jd_execution_retry_recovery_message_actions`
- `20261124072310` — `harden_workforce_assignment_rpc_and_trigger_search_path`
- `20261124104630` — `harden_auth_identity_helpers_search_path`
- `20261124180657` — `explicit_deny_policies_for_internal_tables`
- `20261124195540` — `jd_business_foundation_backfill`
- `20261124195549` — `jd_employee_assignment_attribution_backfill`
- `20261124195605` — `jd_workforce_shadow_usage_backfill`
- `20261124195625` — `jd_workforce_team_budgets_backfill`
- `20261124195801` — `jd_workforce_assignment_lifecycle_backfill`
- `20261124195807` — `harden_workforce_assignment_read_rpc_backfill`

Recover the original SQL from trusted release artifacts or database change records before attempting a future rollback or rebuilding a complete historical migration archive.

## Deployment discipline

1. Re-fetch production migration history immediately before every release.
2. Compare exact version prefixes, not approximate filenames or migration names alone.
3. Check live objects and dependencies before applying pending SQL.
4. Apply only an explicitly reviewed release set; never push the entire pending folder blindly.
5. Deploy dependent Edge Functions only after their required database objects exist.
6. Verify the recorded migration versions, function versions, logs, and security/performance advisors after release.
