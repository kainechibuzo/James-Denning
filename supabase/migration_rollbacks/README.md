# Supabase rollback scripts

These files are manual rollback references, not forward migrations. They are stored outside `supabase/migrations/` so the Supabase CLI cannot mistake their timestamp prefixes for additional forward migrations.

Never run a rollback automatically. Inspect the paired forward migration, current production schema and data, dependencies, and recovery plan before using one.

- `20261122210000_jd_skills_autonomous.rollback.sql`
- `20261122220000_jd_discovery_autonomy.rollback.sql`
- `20261124090000_jd_workforce_assignments.rollback.sql`
- `20261124130000_jd_specialist_run_approval_billing.rollback.sql`
- `20261124170000_jd_approved_workforce_activation.rollback.sql`
- `20261124180000_jd_workforce_private_chat.rollback.sql`
- `20261124190000_jd_employee_assignment_attribution.rollback.sql`
- `20261124195000_jd_workforce_specialist_catalogue.rollback.sql`
- `20261124200000_jd_workforce_shadow_usage.rollback.sql`
- `20261124210000_jd_workforce_team_budgets.rollback.sql`
- `20261125090000_jd_run_discovery_link.rollback.sql`
- `20261125110000_jd_finish_error_details.rollback.sql`
- `20261125120000_jd_dispatch_tick.rollback.sql`
