# Supabase migration history reconciliation

Project: `thklwiybjuhrjqrrxyid`

The migration directory is aligned to the production `supabase_migrations.schema_migrations` history. Do not rename production-applied migrations back to their earlier local timestamps: Supabase CLI uses the filename prefix as the migration version.

## Reconciliation notes

- JD migration files use the exact version identifiers already recorded in production (the 14 JD migration versions from `20261111085143` through `20261112084827`).
- `000a`, `000b`, and `001b` are reconstructed baseline schema files. Their expected tables, columns, indexes, and tenant-scoped RLS state were verified in production before their versions were recorded as applied. They were not replayed because their original placeholder policies could weaken the hardened policy state.
- `999b_real_auth_rls.sql` is safe to re-run: its policy loop removes both the original `*_all` placeholder and any prior `*_school_scoped` policy before recreating the tenant-scoped policy.
- `999c_login_lookup_functions.sql` contains the narrow pre-auth login lookup functions.
- `999d_secure_auth_definer_function_search_paths.sql` pins `search_path = public, pg_temp` on the six auth/login SECURITY DEFINER functions.

## Deployment discipline

Before any future production migration push:
1. Fetch `supabase_migrations.schema_migrations` from the target project.
2. Compare the version prefixes in this directory against the remote versions.
3. Inspect any new migration against the live schema and data before applying it.
4. Do not replay reconstructed baseline migrations or alter remote history merely to make a CLI diff disappear.
5. After applying, verify the recorded version and inspect Supabase security/performance advisors.
