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

## 5. Recovery

If a service-role key was ever added to a `VITE_*` variable or otherwise exposed to a browser build, remove the variable, rotate the affected service-role key in Supabase, update trusted server-side secrets, and redeploy. Treat it as compromised; deleting the frontend variable alone does not invalidate an exposed key.
