# Conversation backend deployment and recovery

The owner authorized applying the migration and deploying the two functions after PR #135 merged. Target: existing James-Denning project `thklwiybjuhrjqrrxyid`.

## Database

Applied `20261121100000_jd_conversation_interactions.sql` via the Supabase migration connector. Supabase recorded version `20261121084947`, name `jd_conversation_interactions`; the connector generated a version instead of retaining the filename timestamp. Do not blindly apply it again because those timestamps differ.

Both unique indexes exist. The submission routine is SECURITY DEFINER, service_role can execute it, and anon/authenticated cannot. Database, REST and auth health checks passed.

## Function deployment and recovery

The initial connector updates returned ACTIVE metadata but failed public startup checks with BOOT_ERROR (503). The exact cause was not confirmed. The first CLI API deployment attempts failed because the Supabase Management API credential was rejected; the owner subsequently updated the credential securely and reran the deployment.

GitHub Actions run [44887008509, attempt 2](https://github.com/kainechibuzo/James-Denning/actions/runs/44887008509) successfully deployed local source for `jd-execution-worker` and `jd-automation`. Its checked-out commit `4321c4fb1bce4e7d6036b9abc006c078a23118da` differs from merged commit `5ef9e3e2ae7e293a72cb6eb5f743422b7f74963b` only in the release workflow and this incident document, not function source or configuration.

Supabase reports worker v27 ACTIVE with verify_jwt=false and automation v20 ACTIVE with verify_jwt=true. The run's public smoke checks passed: automation OPTIONS 200 and unauthenticated POST 401; worker unauthenticated POST 401 and GET 405. These confirm startup and the tested rejection paths, not authenticated conversation, model/provider, integration, approval, or execution end-to-end behavior. No business test actions were submitted.

The migration is additive and remains applied; see `jd-conversation-rollout.md` for rollback SQL and functional test limitations.
