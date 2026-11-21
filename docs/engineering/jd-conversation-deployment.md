# Owner-authorized conversation backend deployment

The owner authorized applying the migration and deploying the functions after PR #135 merged. Target: existing James-Denning project `thklwiybjuhrjqrrxyid`.

## Applied

- Applied the SQL from `20261121100000_jd_conversation_interactions.sql` through the Supabase migration connector. Supabase recorded it as version `20261121084947`, name `jd_conversation_interactions` (the connector generates the version rather than preserving the filename timestamp). Do not blindly apply the same migration again merely because these version strings differ.
- Verified both unique indexes exist.
- Verified the submission routine is SECURITY DEFINER, service_role can execute, and anon/authenticated cannot execute.
- Updated `jd-execution-worker` to v26, ACTIVE, verify_jwt=false.
- Updated `jd-automation` to v19, ACTIVE, verify_jwt=true.

Functions were deployed through the Supabase connector using immutable entrypoint imports pinned to merged commit `5ef9e3e2ae7e293a72cb6eb5f743422b7f74963b`, including relative shared dependencies at that same revision. This follows the existing deployment's remote-source pattern; it does not refer to a moving branch. Dependency resolution of npm/HTTPS imports is not fully locked.

The first GitHub CLI deployment run failed before the worker version changed; it was not counted as successful. The final branch workflow is read-only smoke verification and contains no deployment credentials or mutation steps.

## Verification boundary

Migration catalog/privilege checks and function ACTIVE/version metadata are verified through Supabase. The branch workflow checks public unauthenticated startup/authentication responses. These checks are not authenticated model, tenant, upload, approval or execution end-to-end testing. No business actions or test conversation records were created. See `jd-conversation-rollout.md` for rollback and remaining functional test limitations.
