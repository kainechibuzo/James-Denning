# Remaining Supabase setup — JAMES-DENNING

Project: **JAMES-DENNING**  
Supabase project ref: `thklwiybjuhrjqrrxyid`  
Region: `eu-west-1`

## Production work already completed

- Database migrations `016` (org presets), `017` (hiring roles), and `018` (fee/email security) are present in the remote migration history.
- Production access-control migrations are applied: `20261108214118`, `20261108214306`, `20261108214334`, and `20261108215035`.
- Reconciliation checkpoint `20261109070611` verified the live legacy auth/RLS functions and key policies, then recorded that state without replaying legacy SQL.
- All 69 public base tables have RLS enabled.
- Five active Edge Functions are deployed: `manage-account` v5, `scheduled-digest` v2, `send-email` v2, `send-email-batch` v3, and `verify-payment` v3.
- Generated database types in `src/types/database.types.ts` match the live project exactly.
- The three applied security migration files have been placed in the canonical `supabase/migrations/` directory. Do not apply them again manually.

## One account-level blocker: Supabase Auth dashboard configuration

The GitHub workflow `.github/workflows/configure-supabase-auth.yml` is ready and supports manual dispatch. Its last run failed because the repository secret `SUPABASE_ACCESS_TOKEN` was rejected by the Supabase Management API with HTTP 401.

To finish this step:

1. In the Supabase account, create a personal access token scoped to this project with `auth_config_write` and `project_admin_write`.
2. In GitHub → repository Settings → Secrets and variables → Actions, replace `SUPABASE_ACCESS_TOKEN` with that token.
3. Open Actions → **Configure production Supabase Auth** → Run workflow.

The workflow will set the production Site URL to:

`https://james-denning-james-projects-57651351.vercel.app`

It will remove localhost and the obsolete `rgs-portal-master.vercel.app` URL from the redirect allowlist, retain other valid entries, and enable leaked-password protection. It verifies the resulting settings. **Do not paste the token into chat or commit it to the repository.**

## Remaining verification

- Security Advisor still reports nine public `SECURITY DEFINER` RPCs for pre-auth login and public hiring flows. These are intentionally callable before login; inspect their function bodies and input/output limits before changing grants.
- `platform_admins` has RLS enabled and no client policies by design; access should remain server-side only.
- Performance Advisor reports unindexed foreign keys and multiple permissive-policy notices. Review query patterns and existing indexes before adding indexes or combining policies.
- Run browser end-to-end checks for registration, invitations, sign-in, password recovery, hiring application flow, email delivery, and payment verification. A successful build is not proof those external flows work.
- No live test accounts, emails, or payments were created during the hardening work.

## Migration-history note

The remote history has no version `014`; the repository has no corresponding `014` migration. Do not invent or replay one. The legacy files `999b_real_auth_rls.sql` and `999c_login_lookup_functions.sql` describe database objects that are already present; the new reconciliation checkpoint verifies representative objects without replaying those scripts. `supabase/migrations_v2/` is a separate legacy experiment and is not part of the production migration stream.


## JD Business Platform — OAuth provider setup

The repository now includes a PKCE OAuth start/callback flow for Google Workspace, Microsoft 365 and LinkedIn. The callback uses one-time 10-minute state, PKCE S256 and AES-GCM encryption for stored token bundles. **It is not live until provider credentials and the callback secrets are configured and the migration/functions are deployed.**

Add these as Supabase Edge Function secrets for the target environment (do not put them in GitHub files or paste them into chat):

- `JD_OAUTH_ENCRYPTION_KEY`: base64 encoding of exactly 32 random bytes. Generate locally with `openssl rand -base64 32`.
- `JD_OAUTH_CALLBACK_URL`: `https://thklwiybjuhrjqrrxyid.supabase.co/functions/v1/jd-business-oauth-callback` for the current production project, or the equivalent URL for staging.
- `JD_OAUTH_SUCCESS_REDIRECT`: the HTTPS James Denning Business Platform integrations page.
- `JD_OAUTH_GOOGLE_CLIENT_ID` and `JD_OAUTH_GOOGLE_CLIENT_SECRET`.
- `JD_OAUTH_MICROSOFT_CLIENT_ID` and `JD_OAUTH_MICROSOFT_CLIENT_SECRET`.
- `JD_OAUTH_LINKEDIN_CLIENT_ID` and `JD_OAUTH_LINKEDIN_CLIENT_SECRET`.

Register the exact callback URL in each provider developer console. Deploy `jd-business-platform` and `jd-business-oauth-callback` only after applying the migration in a staging project and verifying the callback. Slack and Paystack are not enabled in this OAuth flow; they require separate provider-specific API credential handling. Token refresh and remote revocation are not implemented yet, so do not use these connections for unattended long-lived production automation.


## JD Business Platform — scheduled external service monitoring

The repository now includes a bounded monitoring worker and a 15-minute GitHub Actions schedule. It checks only fixed public provider health URLs for integrations marked connected, records latency/status history, and records status transitions. It does **not** validate OAuth tokens or provider SLAs and does not send email/SMS alerts.

Configure these GitHub Actions repository secrets:

- `JD_MONITOR_FUNCTION_URL`: `https://thklwiybjuhrjqrrxyid.supabase.co/functions/v1/jd-business-monitor-worker` for the current production project, or the equivalent staging function URL.
- `JD_BUSINESS_MONITOR_WORKER_SECRET`: a random secret of at least 32 characters. Configure the same value as a Supabase Edge Function secret. Never commit it.

The worker is configured with `verify_jwt = false` and protects itself with the dedicated bearer secret. Deploy it only after staging migration and smoke tests. The scheduled workflow safely skips when secrets are absent.


## JD Business Platform — scheduled document extraction

The repository includes a server-secret protected document worker and a ten-minute GitHub Actions dispatcher. It atomically claims pending documents, extracts **plain text only**, computes a checksum and creates a bounded extractive summary. PDF and DOCX are marked unsupported; OCR, PDF/DOCX parsing, malware scanning and AI-generated summaries are not claimed as implemented.

Configure GitHub Actions repository secrets:

- `JD_DOCUMENT_FUNCTION_URL`: `https://thklwiybjuhrjqrrxyid.supabase.co/functions/v1/jd-business-document-worker` for production, or the equivalent staging URL.
- `JD_DOCUMENT_WORKER_SECRET`: a random secret of at least 32 characters. Configure the same value as a Supabase Edge Function secret. Never commit it.

The scheduled workflow fails visibly when these secrets are absent. Deploy the worker and verify private bucket access in staging before enabling the schedule in production.


## JD Business Platform — document extraction worker

The repository includes a server-secret protected document worker and a ten-minute GitHub Actions dispatcher. It atomically claims pending documents, extracts plain text, DOCX and embedded PDF text using pinned Deno npm parser dependencies, computes a checksum and creates a bounded extractive summary. Scanned-image OCR, malware scanning and AI-generated summaries are not implemented; PDFs without embedded text are marked `ocr_required`.

Configure GitHub Actions repository secrets:

- `JD_DOCUMENT_FUNCTION_URL`: `https://thklwiybjuhrjqrrxyid.supabase.co/functions/v1/jd-business-document-worker` for production, or the equivalent staging URL.
- `JD_DOCUMENT_WORKER_SECRET`: a random secret of at least 32 characters. Configure the same value as a Supabase Edge Function secret. Never commit it.

Deploy the worker and verify private bucket access in staging before enabling the schedule in production.
