# Staging & Safe Testing

Use a genuinely separate Supabase project (or an isolated Supabase branch where supported) for staging. A test tenant inside production is not a substitute for migration, deployment, or security testing.

## 1. Staging Supabase environment

Choose one:

- **Supabase Branching:** create a staging branch in the Supabase dashboard if your plan supports it.
- **Separate Supabase project:** create a separate project and apply the repository's reviewed migrations to it. Do not copy production user data or secrets into staging.

## 2. Vercel Preview environment variables

In **Vercel → Project → Settings → Environment Variables**, scope these variables to Preview (or the dedicated staging environment):

- `VITE_SUPABASE_URL`: staging project URL.
- `VITE_SUPABASE_ANON_KEY`: staging anon/publishable key only.
- `VITE_APP_ENV`: `staging` (if consumed by the UI/runtime).

**Never add `VITE_SUPABASE_SERVICE_ROLE_KEY` or any service-role secret to Vercel frontend variables.** Vite embeds `VITE_*` values in browser assets. A Supabase service-role key bypasses Row Level Security and must remain exclusively in server-side Edge Function secrets or another trusted server runtime.

The application intentionally throws if `VITE_SUPABASE_SERVICE_ROLE_KEY` is present in its frontend environment. If a staging Edge Function needs privileged access, configure `SUPABASE_SERVICE_ROLE_KEY` as a server-side Supabase Function secret for the staging project.

The frontend client requires `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` and fails closed when either is missing. It does not fall back to production credentials.

## 3. Safe staging workflow

1. Create a feature branch from the current `master`.
2. Apply and review migrations against the staging database first.
3. Deploy staging Edge Functions with staging-only secrets.
4. Set the Vercel Preview variables above and deploy the staging branch.
5. Verify authentication, tenant isolation, RLS, Edge Function permissions, and critical user journeys against staging.
6. Promote to production only after checks pass and the production migration/deployment plan is reviewed.

## 4. Test-data rules

- Use synthetic test accounts and synthetic organisation data.
- Never publish shared default credentials in documentation.
- Do not use a production tenant as a migration sandbox.
- Do not run reset, delete, or reseed scripts against production.
- Keep service-role credentials out of browser bundles, source control, issue comments, and logs.

## 5. Automated staging verification safety gate

`node scripts/verify-jd-business-staging.mjs` **attempts a cross-tenant write**. It is not a read-only probe. Do not run it against production, even with synthetic tenants.

Before running it, independently verify the target project's identity, isolation, synthetic fixture ownership and staging-only integrations. Then configure:

- `SUPABASE_URL`: the isolated project's canonical `https://<project-ref>.supabase.co` URL (custom/proxy URLs are intentionally refused).
- `JD_STAGING_PROJECT_REF`: the same isolated project reference; this is an explicit allowlist, not a value automatically inferred from the URL.
- `JD_STAGING_ALLOW_WRITES`: exactly `true`, only after authorising the synthetic fixture test.
- `SUPABASE_ANON_KEY` and the tenant A/B fixture credentials listed in the script. Use a secret manager; never put values in source, shell history or evidence files.

For `.github/workflows/jd-business-staging-verify.yml`, set `JD_STAGING_PROJECT_REF` and `JD_STAGING_ALLOW_WRITES` as GitHub Actions **repository variables**; retain the existing `JD_STAGING_*` credentials as **secrets**. Until configured, the test fails closed rather than skipping.

The script rejects known production/legacy project refs, mismatched URLs, non-HTTPS targets, credentials/paths/queries/fragments in URLs and nonstandard ports **before authentication or any network request**. Requests refuse redirects. These guards reduce accidental production writes; they do not prove that an operator-selected project is isolated or replace review when production project identities change.

Use `npm run test:guards` to exercise these refusal paths with stubbed networking. Use `npm run test:tasks` for the isolated task client/PostgreSQL regression tests; those tests need no remote environment or credentials and do not connect to Supabase. Neither command is live staging acceptance.

## 6. Recovery

If a service-role key was ever added to a `VITE_*` variable or otherwise exposed to a browser build, remove the variable, rotate the affected service-role key in Supabase, update trusted server-side secrets, and redeploy. Treat it as compromised; deleting the frontend variable alone does not invalidate an exposed key.

## 7. Scoped JD backend compatibility releases

Use the [reviewed JD backend release procedure](JD_BACKEND_RELEASE.md) for the three runtime consumers. The manual deployment workflow now defaults to preparing an exact-source artifact and does not apply SQL or deploy unrelated functions. Its independent approval/project variables and same-SHA staging marker are mandatory; they do not provision staging or replace real review. Never use the retired broad deploy-all/migration-push procedure.
