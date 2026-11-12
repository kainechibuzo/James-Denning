# Migration history reconciliation

**Status:** diagnosed and verified - repair commands prepared, not yet run.
**Generated:** 2026-11-12T16:23:30.924Z against project `thklwiybjuhrjqrrxyid`.
**Verdict:** `diverged_version_numbers_same_content` - production and the repo disagree on *version numbers*, not on content.

## Summary

Production has **43** recorded migrations; the repo has **48** files.
Read naively that looks like a lot of missing schema. It is not.

**All 14 migrations recorded in production have a matching file in this repo under a
different version number.** The schema was applied; the timestamps were rewritten at
some point to values that no longer agree with the filenames.

That rewrite created two real risks:

1. `supabase db push` believes all 19 repo migrations are *pending* and would replay them.
2. Ordering by version number produces a sequence that **was never executed** in production.

| Repo version | Production version | Repo file |
|---|---|---|
| `20261110090000` | `20261111085143` | `20261110090000_jd_autonomous_automation.sql` |
| `20261110100000` | `20261111085145` | `20261110100000_jd_review_centre_foundation.sql` |
| `20261111090000` | `20261111085147` | `20261111090000_jd_atomic_approval_decisions.sql` |
| `20261111110000` | `20261111085148` | `20261111110000_jd_private_conversation_rls.sql` |
| `20261111130000` | `20261111085150` | `20261111130000_jd_durable_execution_jobs.sql` |
| `20261111140000` | `20261111085151` | `20261111140000_jd_durable_execution_checkpoints.sql` |
| `20261111150000` | `20261112084412` | `20261111150000_jd_settings_proposal_review.sql` |
| `20261111160000` | `20261112084459` | `20261111160000_jd_approved_settings_executor.sql` |
| `20261111180000` | `20261112084532` | `20261111180000_jd_batch01_organisation_operations_hiring.sql` |
| `20261111184500` | `20261112084602` | `20261111184500_jd_task_collaboration.sql` |
| `20261111190000` | `20261112084629` | `20261111190000_jd_execution_retry_controls.sql` |
| `20261111193000` | `20261112084732` | `20261111193000_jd_recurring_tasks_and_assignment.sql` |
| `20261111200000` | `20261112084827` | `20261111200000_jd_workflow_versioned_drafts.sql` |
| `20261111210000` | `20261112073746` | `20261111210000_jd_business_platform.sql` |

## Verification that nothing is actually missing

Rather than trust the name correlation, every object declared by the 19 repo
files that do not appear in production history was checked against the live database.

| Object type | Referenced | Present | Missing |
|---|---|---|---|
| Tables | 70 | **70** | none |
| Functions (`create or replace function`) | 32 | **32** | none |
| Policies in `999b_real_auth_rls.sql` | 29 | 27 | `profiles_insert`, `profiles_update` |

The two absent policies are **correctly absent**. `20261109213903_disable_client_profile_mutations.sql`
revokes `insert/update/delete` on `public.profiles` from `anon` and `authenticated`, which makes
insert/update policies on that table meaningless, and `20261109215000_remove_duplicate_policy_overlaps.sql`
drops the successor policies `profiles_insert_self` / `profiles_update_self`. The reconstructed
`999b` file predates that hardening. Production is *ahead* of it, not behind.

**Conclusion: all 48 repo migrations describe schema that already exists in production.**
No migration is genuinely unapplied, so nothing needs to be pushed.

## The repair

Tell the CLI that the repo's versions are already applied. This writes rows to
`supabase_migrations.schema_migrations` and changes **no schema**:

```sh
supabase migration repair --status applied 20261110090000
supabase migration repair --status applied 20261110100000
supabase migration repair --status applied 20261111090000
supabase migration repair --status applied 20261111110000
supabase migration repair --status applied 20261111130000
supabase migration repair --status applied 20261111140000
supabase migration repair --status applied 20261111150000
supabase migration repair --status applied 20261111160000
supabase migration repair --status applied 20261111180000
supabase migration repair --status applied 20261111184500
supabase migration repair --status applied 20261111190000
supabase migration repair --status applied 20261111193000
supabase migration repair --status applied 20261111200000
supabase migration repair --status applied 20261111210000
```

Five filenames carry non-numeric versions (`000a`, `001b`, `999b`, ...). `migration repair`
expects numeric versions, so **rename these to timestamped filenames** rather than repairing them:

- `000a_schools_table_RECONSTRUCTED.sql`
- `000b_permissions_tables_RECONSTRUCTED.sql`
- `001b_remaining_tables_RECONSTRUCTED.sql`
- `999b_real_auth_rls.sql`
- `999c_login_lookup_functions.sql`

Then re-run:

```sh
REMOTE_MIGRATIONS="$(supabase migration list --output json)" node scripts/reconcile-migrations.mjs
```

It should report `aligned`. Only then is it safe to consider automating `db push` - the header of
`.github/workflows/deploy.yml` blocks it deliberately until then.

## Why the repair was not run automatically

Rewriting production migration history is bookkeeping, not schema, but it is still a
write to production that changes what future deploys will skip. It is presented as a
reviewed operator action rather than something performed unattended, for the same reason
migrations are excluded from automatic deploy in the first place.

The evidence above is strong but not exhaustive: it proves the declared objects exist,
not that every column default and constraint matches the file. Run the commands above
when you are satisfied the schema is current - the verification makes that a low-risk
call rather than a leap of faith.
