# CLAUDE.md — JAMES-DENNING agent context

Read this file and [README.md](README.md) at the start of every session.

## Product

JAMES-DENNING is an idea-to-business platform operated through JD, an AI operations
assistant. The roadmap and acceptance gates are in
[docs/JD_MASTER_EXECUTION_CHECKLIST.md](docs/JD_MASTER_EXECUTION_CHECKLIST.md) and
[docs/JD_CHECKLIST_STATUS.md](docs/JD_CHECKLIST_STATUS.md). Upgrade history is in
[upgrades/](upgrades/).

The codebase started life as a school portal. All school features were removed;
only some database names remain. Do not reintroduce school, student, teacher,
grading, fees or academic-term concepts. See [docs/LEGACY_SCHEMA.md](docs/LEGACY_SCHEMA.md).

## Architecture

- `src/App.jsx` — landing, auth (`pages/saas-entry.jsx`) and workspace activation.
- `src/AppDemo.jsx` — workspace shell, router, sidebar, RBAC (`canAccess`), tour.
  Page logic belongs in `src/pages/`, not here.
- `src/config/workspace-navigation.mjs` — sidebar entries; `src/config/permissions.mjs` — RBAC groups and role defaults.
- `src/contexts/organization.jsx` — active organisation (`useOrganization()`).
- `src/supabaseClient.js` — the `db` object. Browser access uses public credentials
  under RLS; privileged work goes through authenticated edge functions.
- `supabase/functions/` — JD edge functions, `manage-account`, email functions.

## Conventions

- Inline styles with tokens from `src/config/theme.js`; no CSS frameworks.
- Lucide icons only; `<AppIcon name="..."/>` for navigation. No emoji icons.
- Every new `db.*` method must filter by `this._schoolId` (the organisation id).
- Page files are separate lazy chunks: shared constants must be exported and imported
  explicitly, never relied on as free variables.
- Do not shadow globals with Lucide imports (`Map`, `File`); use `window.File` if needed.
- Never put server secrets in `VITE_*` variables.
- Roles are `admin` (owner) and `manager`.

## Before pushing

```bash
npm run verify:web
npm run build:mobile
npm run test:navigation && npm run test:checklist   # plus any suite touched
```

Pushing to `master` deploys the Vercel project `james-denning`. Keep
`package-lock.json` in sync with `package.json` (Vercel runs `npm ci`).
