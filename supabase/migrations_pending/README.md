# Pending Supabase migrations

These SQL files are intentionally outside `supabase/migrations/` because their version identifiers are not recorded as applied in the James-Denning production database as of 2026-11-26.

Do not move files back into the active migration directory or apply them as a batch. Each requires an individual dependency review and an isolated rehearsal.

- `20261116203000_jd_atomic_task_assignment.sql`
- `20261116210000_jd_retry_run_integrity.sql`
- `20261117120000_jd_usage_ledger.sql`
- `20261117220000_jd_atomic_execution_cancel.sql`
- `20261120130000_jd_billing_payment_finalization.sql`
- `20261121170000_jd_execution_retry_cancel_recovery.sql`
- `20261124180000_jd_workforce_private_chat.sql`
- `20261124195000_jd_workforce_specialist_catalogue.sql`

Some migrations may be superseded or overlap later implementations. The root migration README records the live-object checks and release discipline.
