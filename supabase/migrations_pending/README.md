# Pending Supabase migrations

All 8 migrations previously staged in this directory were audited against live schema contracts, rehearsed in isolated PGlite (forward, rollback, and re-apply), applied to `thklwiybjuhrjqrrxyid` on 2026-11-26, and moved to `supabase/migrations/` under their exact `supabase_migrations.schema_migrations` version prefixes.

Keep any future unapplied or candidate SQL migrations in this directory until they have been individually reviewed, rehearsed in an isolated database, and explicitly approved for release. See `supabase/migrations/README.md` for full reconciliation details and deployment discipline.
