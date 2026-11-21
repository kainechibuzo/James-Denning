# Conversation deployment incident — incomplete rollout

Owner authorized applying the migration and deploying the two functions after PR #135 merged. Target: existing James-Denning project `thklwiybjuhrjqrrxyid`.

## Database: applied and verified

Applied `20261121100000_jd_conversation_interactions.sql` via Supabase migration connector. Supabase recorded version `20261121084947`, name `jd_conversation_interactions`; the connector generates a version instead of retaining the filename timestamp. Do not blindly apply it again because those timestamps differ.

Both unique indexes exist. The submission routine is SECURITY DEFINER, service_role can execute it, and anon/authenticated cannot. Database, REST and auth health checks passed.

## Functions: startup failure after connector update

The connector reported `jd-execution-worker` v26 and `jd-automation` v19 ACTIVE after receiving immutable imports of merged source commit `5ef9e3e2ae7e293a72cb6eb5f743422b7f74963b`. However, public smoke checks returned BOOT_ERROR (503) for automation OPTIONS and worker GET/POST. Automation unauthenticated POST returned gateway 401, which does not prove handler health.

Inspection showed that the connector's update operation stored plain TypeScript as the function body rather than the ESZIP artifact returned by the previously working version. ACTIVE metadata was therefore insufficient and these updates must not be considered a successful rollout.

## Recovery

A narrow current-branch GitHub workflow attempts the proper CLI API deployment of local source for only worker and automation. The first attempt required CLI `--yes`, which was added for this explicitly authorized operation. The next attempt reached upload but was rejected with `401 Invalid access token`; no CLI deployment succeeded in that run (44886940542). The subsequent attempt using the existing Production environment also failed with the same invalid-token response (run 44887008509). No further credential retries were attempted. The recovery workflow is now manual-only.

If that credential is also invalid, the owner must repair the GitHub Actions Supabase Management API credential through secure settings (not chat) before redeploying/restoring a compiled function artifact. Do not claim live functionality, authenticated E2E tests, or successful rollback on the basis of ACTIVE metadata. No business test actions were submitted.

The migration is additive and remains applied; see `jd-conversation-rollout.md` for its rollback SQL and functional test limitations. Rolling back the SQL alone does not fix the function startup issue.
