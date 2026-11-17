# Legacy schema notes

JAMES-DENNING was built on top of an earlier school-portal codebase. All school
features (students, teachers, classes, sections, subjects, results, grading, report
cards, transcripts, timetables, attendance, fees/billing, promotions, academic
sessions/terms, the dedicated mobile school app and the PIN-based pre-auth login)
were removed from the application in the `chore/prune-education-module` change.

The **database was not migrated**. Removing columns or tables is a separate,
reviewed migration, because existing tenants and the JD business tables still use
some legacy names.

## Names the application still uses

These names are load-bearing and must not be renamed without a migration that
updates the database, RLS policies, edge functions and the client together.

| Name | Meaning today |
|---|---|
| `schools` table | Organisations (tenants) |
| `school_id` column | Organisation / tenant id on every tenant-scoped table |
| `school_settings` table | Per-organisation key/value settings |
| `school_name` setting key | Organisation display name |
| `student_id_prefix` column | Unused by the app; still passed positionally to `db.setSchool` |
| `db.setSchool()` / `db._schoolId` | Sets the active organisation for `db.*` queries |
| `register_school` action (`manage-account`) | Creates a new organisation and invites its owner |
| `createSchoolSignup()` | Client wrapper for `register_school` |
| `auth_school_id()` SQL function | Resolves the caller's organisation in RLS policies |
| `profiles.role` values `teacher`, `student`, `bursar` | Legacy roles; the app now recognises only `admin` (owner) and `manager` |
| `org_presets.key = 'school_management'` | Retired preset; hidden from the UI and rejected by `register_school` |

## Tables no longer used by the application

`academic_calendar`, `attendance`, `cae_*`, `class_subjects`, `class_teachers`,
`classes`, `fee_*`, `grading_schema`, `login_lookup_*`, `login_list_schools`,
`manual_transcript*`, `payments`, `portal_cae_results`, `portal_results`,
`promotion_*`, `recycle_bin`, `report_card_publish`, `report_templates`,
`result_approvals`, `section_subjects`, `sections`, `sessions`, `signatures`,
`student_profiles`, `student_requests`, `students`, `subject_access_*`, `subjects`,
`teacher_subjects`, `teachers`, `terms`, `timetable_*`, `transcript_drafts`.

`platform_admins` (plaintext PIN) is also no longer read by the client.

## Remote resources still deployed

These edge functions were deleted from the repository but may still be deployed to
the Supabase project. Undeploy them from the Supabase dashboard (or
`supabase functions delete <name>`) once you have confirmed nothing else calls them:

- `preauth-lookup` (legacy school/student/teacher PIN login lookup)
- `verify-payment` (legacy school-fees Paystack verification)

## Follow-up migration plan

1. Export any tenant data you still need from the tables listed above.
2. Revoke and drop the `login_lookup_*` / `login_list_schools` RPCs and the
   `platform_admins` table first (they expose legacy authentication paths).
3. Drop the unused academic and fee tables in one reviewed migration with a
   rollback script under `supabase/rollback/`.
4. Rename `schools` → `organizations` and `school_id` → `organization_id` behind
   compatibility views, update RLS, edge functions and `src/supabaseClient.js`,
   then remove the views.
5. Regenerate `src/types/database.types.ts`.
