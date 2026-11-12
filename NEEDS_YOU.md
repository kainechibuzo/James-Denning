## Bundled JD random secrets (single setting)

The random worker-authentication strings and OAuth encryption key are now read from one Supabase Edge Function secret named `JD_SECRETS_JSON`. Set its value to the complete JSON object generated for this project. The same JSON object is used as the single JD credential secret in GitHub Actions. The code extracts each named value at runtime; do not commit the JSON file or individual values.

This bundle covers only the generated random strings:
- `JD_WORKER_SECRET`
- `JD_BUSINESS_MONITOR_WORKER_SECRET`
- `JD_DOCUMENT_WORKER_SECRET`
- `JD_BUSINESS_OPS_WORKER_SECRET`
- `JD_OAUTH_ENCRYPTION_KEY`

External provider credentials (OpenRouter, OAuth client IDs/secrets, Resend, Twilio, OCR.space, Paystack) are separate integrations and are not part of this random-secret bundle. Supabase's built-in URL and service-role credentials remain provided by the Supabase runtime.

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

The repository now includes a PKCE OAuth start/callback flow for Google Workspace, Microsoft 365, LinkedIn and Slack. The callback uses one-time 10-minute state, PKCE S256 and AES-GCM encryption for stored token bundles. **The migration and functions were deployed directly to the connected project on 2026-11-12. OAuth remains non-operational until provider credentials and callback secrets are configured and the provider round-trip is tested.**

Add these as Supabase Edge Function secrets for the target environment (do not put them in GitHub files or paste them into chat):

- `JD_OAUTH_ENCRYPTION_KEY`: base64 encoding of exactly 32 random bytes. Generate locally with `openssl rand -base64 32`.
- `JD_OAUTH_CALLBACK_URL`: `https://thklwiybjuhrjqrrxyid.supabase.co/functions/v1/jd-business-oauth-callback` for the current production project, or the equivalent URL for staging.
- `JD_OAUTH_SUCCESS_REDIRECT`: the HTTPS James Denning Business Platform integrations page.
- `JD_OAUTH_GOOGLE_CLIENT_ID` and `JD_OAUTH_GOOGLE_CLIENT_SECRET`.
- `JD_OAUTH_MICROSOFT_CLIENT_ID` and `JD_OAUTH_MICROSOFT_CLIENT_SECRET`.
- `JD_OAUTH_LINKEDIN_CLIENT_ID` and `JD_OAUTH_LINKEDIN_CLIENT_SECRET`.

Register the exact callback URL in each provider developer console. Deploy `jd-business-platform` and `jd-business-oauth-callback` only after applying the migration in a staging project and verifying the callback. Slack uses the OAuth callback. Paystack uses a separate read-only encrypted API-key connection from the integrations panel; no payment, refund or transfer operation is exposed. Token refresh and live verification are implemented for the supported OAuth providers. Google and Slack remote revocation are implemented; Microsoft remote session revocation requires User.RevokeSessions.All; LinkedIn remote revocation remains unsupported and must be handled through LinkedIn account/app settings.


## JD Business Platform — scheduled external service monitoring

The repository now includes a bounded monitoring worker and a 15-minute GitHub Actions schedule. It checks only fixed public provider health URLs for integrations marked connected, records latency/status history, and records status transitions. It does **not** validate OAuth tokens or provider SLAs. Status transitions are queued for email/SMS by the scheduled operations worker when Resend/Twilio secrets and workspace recipients are configured.

Configure these GitHub Actions repository secrets:

- `JD_MONITOR_FUNCTION_URL`: `https://thklwiybjuhrjqrrxyid.supabase.co/functions/v1/jd-business-monitor-worker` for the current production project, or the equivalent staging function URL.
- `JD_BUSINESS_MONITOR_WORKER_SECRET`: a random secret of at least 32 characters. Configure the same value as a Supabase Edge Function secret. Never commit it.

The worker is configured with `verify_jwt = false` and protects itself with the dedicated bearer secret. The worker is deployed directly to the connected project. The scheduled workflow safely skips when secrets are absent; live monitoring remains unverified until the GitHub and Supabase secrets are configured.


## JD Business Platform — scheduled document extraction

The repository includes a server-secret protected document worker and a ten-minute GitHub Actions dispatcher. It atomically claims pending documents, extracts plain text, DOCX and embedded PDF text, computes a checksum and creates a bounded extractive summary. Scanned PDF/image OCR is opt-in through OCR.space and requires explicit external-processing approval plus a server API key. Since 2026-11-12 the upload path also runs a server-side signature screen (magic-byte match to the declared type, rejection of executables/scripts/OLE2/macro-enabled OOXML and embedded PE/ELF polyglots) at upload-confirm and again before extraction; files failing the screen are deleted or marked failed with error_code malware_suspected. This is a signature gate, not a commercial antivirus engine; no third-party AV integration exists yet. AI-generated summaries are not implemented.

Configure GitHub Actions repository secrets:

- `JD_DOCUMENT_FUNCTION_URL`: `https://thklwiybjuhrjqrrxyid.supabase.co/functions/v1/jd-business-document-worker` for production, or the equivalent staging URL.
- `JD_DOCUMENT_WORKER_SECRET`: a random secret of at least 32 characters. Configure the same value as a Supabase Edge Function secret. Never commit it.

The scheduled workflow fails visibly when these secrets are absent. The worker is deployed directly to the connected project and the private bucket exists. The dispatcher still requires matching GitHub/Supabase secrets; external OCR remains opt-in.


## JD Business Platform — document extraction worker

The repository includes a server-secret protected document worker and a ten-minute GitHub Actions dispatcher. It atomically claims pending documents, extracts plain text, DOCX and embedded PDF text using pinned Deno npm parser dependencies, computes a checksum and creates a bounded extractive summary. Scanned-image OCR and AI-generated summaries are not implemented; PDFs without embedded text are marked `ocr_required`. A server-side signature screen now blocks executable/macro/polyglot uploads at upload-confirm and before extraction (see the previous section); it is not a commercial antivirus engine, and the upload feature must remain treated as untrusted until a real AV integration and staging verification exist.

Configure GitHub Actions repository secrets:

- `JD_DOCUMENT_FUNCTION_URL`: `https://thklwiybjuhrjqrrxyid.supabase.co/functions/v1/jd-business-document-worker` for production, or the equivalent staging URL.
- `JD_DOCUMENT_WORKER_SECRET`: a random secret of at least 32 characters. Configure the same value as a Supabase Edge Function secret. Never commit it.

Deploy the worker and verify private bucket access in staging before enabling the schedule in production.


## JD Business Platform — additional batch implementation

The current branch now includes these code paths. None are live until the correct Supabase project is confirmed, the migration is applied to staging, and the required secrets are configured.

### Scanned-document OCR

- The document worker can send scanned PDF/image files to OCR.space only when JD_OCR_SPACE_API_KEY is configured and JD_OCR_ALLOW_EXTERNAL_PROCESSING=true.
- This is an external data-processing service: documents leave the Supabase project for OCR processing. Enable it only after the workspace owner has approved that data-sharing arrangement and checked applicable privacy requirements.
- Without the opt-in and API key, image-only/scanned documents fail explicitly with ocr_required; they are not reported as successfully extracted.
- Plain text, DOCX and embedded-text PDF extraction continue to work without the external OCR provider.

### OAuth provider checks and revocation

- Live verification actions now call the relevant provider identity endpoint for Google Workspace, Microsoft 365, LinkedIn and Slack.
- Google and Slack remote token revocation are implemented before local encrypted credentials are erased.
- Microsoft remote session revocation requires the Microsoft Graph User.RevokeSessions.All permission and a work/school account. It can invalidate sessions for other apps too, so grant it only after admin review. The provider documents that revocation can take several minutes.
- LinkedIn token inspection can check token state, but this branch does not claim a verified remote revoke API. Disconnect is blocked until the LinkedIn app grant is revoked through LinkedIn account/app settings; the local token is retained rather than falsely reporting remote revocation.
- Configure JD_OAUTH_SLACK_CLIENT_ID and JD_OAUTH_SLACK_CLIENT_SECRET alongside the existing Google/Microsoft/LinkedIn credentials. Register the same callback URL in Slack's app configuration.

### Paystack read-only integration

- The Business Platform accepts a Paystack secret or restricted key through the authenticated integrations UI, verifies it against Paystack, and stores it only as an AES-GCM encrypted server-side credential bundle.
- Transaction sync imports successful Paystack transactions as statement rows for manual reconciliation. It does not initiate charges, refunds or transfers.
- Use a restricted key limited to transaction-read permissions where possible. Never put a Paystack secret in Vite/client environment variables, source code or GitHub commits.

### SLA, notifications and integration incidents

Configure the Supabase Edge Function secrets for jd-business-ops-worker:
- JD_BUSINESS_OPS_WORKER_SECRET: random value of at least 32 characters.
- RESEND_API_KEY and JD_ALERT_EMAIL_FROM for email delivery.
- JD_TWILIO_ACCOUNT_SID, JD_TWILIO_AUTH_TOKEN, and JD_TWILIO_FROM_NUMBER for SMS delivery.

Configure the matching GitHub Actions repository secrets:
- JD_BUSINESS_OPS_FUNCTION_URL: the target environment's jd-business-ops-worker URL.
- JD_BUSINESS_OPS_WORKER_SECRET: the same value as the Edge Function secret.

Workspace admins configure response/resolution/escalation thresholds and notification recipients in the SLA Policies panel. The scheduled worker queues deduplicated SLA and integration incident notifications. Messages remain queued until the relevant delivery provider credentials are configured.

### Cash statement reconciliation and report export

- Import CSV/XLSX bank statement rows in Cash Flow. JD suggests matches using direction, currency, amount and a three-day date window; a manager must confirm the match.
- Matching is performed by a database function in one transaction and prevents a cash transaction from being matched twice.
- Executive reports can be exported as JSON or CSV. Exports remain scoped to the authenticated workspace and are audit logged.

### Predictive baseline evaluation

- The descriptive trailing-mean baseline now has rolling-origin historical backtesting and records MAE/MAPE when there are at least three training periods and three holdout periods.
- The output still does not claim a validated cash forecast: the inputs are won opportunity values and approved expenses, not reconciled cash receipts. Insufficient history is labelled accordingly.

### Authenticated staging verification

A manual workflow and script are available:
- .github/workflows/jd-business-staging-verify.yml
- scripts/verify-jd-business-staging.mjs

Configure GitHub Actions secrets:
- JD_STAGING_SUPABASE_URL
- JD_STAGING_SUPABASE_ANON_KEY
- JD_STAGING_TENANT_A_EMAIL, JD_STAGING_TENANT_A_PASSWORD
- JD_STAGING_TENANT_B_EMAIL, JD_STAGING_TENANT_B_PASSWORD
- JD_STAGING_TENANT_A_FIXTURE_CUSTOMER_ID

The workflow checks authenticated Business Platform endpoints and verifies that a second tenant cannot read or update a known first-tenant fixture. Run it only against a disposable staging environment with two test tenants.

### Deployment and verification update — 2026-11-12

The repository owner instructed direct deployment to the connected project rather than creating a Supabase staging branch.

- Target ref: `thklwiybjuhrjqrrxyid` (the connected Supabase account labels it `RGS-PORTAL-master`).
- Applied migration: `20261112073746_jd_business_platform`.
- Created 25 `jd_business_*` tables. All have RLS enabled; direct `anon`/`authenticated` table grants are absent, and server-side access uses `service_role`.
- Confirmed private `jd-business-documents` storage bucket.
- Deployed six Edge Functions at version 2: platform API, document worker, monitor worker, OAuth callback, operations worker and report-share.
- Latest master CI build passed. The full Deno test/type-check suite passed on the same integrated source before direct master update.
- Business customer, document and report tables are empty. The project currently has one Auth account and three school records; do not describe it as an empty database.
- No authenticated two-tenant end-to-end test was run. Only one Auth account is present, and no disposable test accounts/tenant fixtures were created.
- External provider workflows remain gated on secrets and provider-side configuration listed above. OCR must remain disabled until external document processing is explicitly approved.
- Dependency vulnerabilities previously reported as 3 critical, 18 high, 7 moderate and 1 low are RESOLVED on branch arena/e6cc942c-james-denning (2026-11-12): npm audit now reports 0 vulnerabilities. The npm `xlsx` package was removed (unpatched SheetJS advisories) and the statement import was migrated to a lazy-loaded ExcelJS/CSV parser that explicitly rejects legacy .xls files. Vite was upgraded 5 → 8.3.8 and sharp/@capacitor/assets/@vitejs/plugin-react/uuid were updated; `npm run verify:web` passes. CI should be re-run on the branch before merge; the production build still pins whatever master contains until it merges.

Do not claim OAuth, OCR, email/SMS, live monitoring, Paystack sync or tenant-isolation E2E as fully verified until the required credentials and authenticated tests pass.
