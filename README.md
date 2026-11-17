# JAMES-DENNING

JAMES-DENNING is an idea-to-business platform operated through **JD**, an AI
operations assistant. Users describe outcomes; JD inspects the organisation's data,
plans the work, prepares changes for human review and executes approved actions.
Departments, tasks, workflows, hiring and dashboards are the systems JD operates and
humans use to supervise it.

Built as a React single-page application backed by Supabase.

## Mission and execution roadmap

- [Master execution checklist](docs/JD_MASTER_EXECUTION_CHECKLIST.md) — eight phases, delivery order, evidence gates and the acceptance scorecard.
- [Reconciled checklist status](docs/JD_CHECKLIST_STATUS.md) — every item mapped to code/evidence, gaps and next actions.
- [Business foundation](documentation/JD_BUSINESS_FOUNDATION.md) — versioned Business DNA, SaaS definitions, draft workforce and billing policy.
- [Employee usage ledger](documentation/JD_EMPLOYEE_USAGE_LEDGER.md) — shadow budgets and usage events.
- [SaaS Agent Studio](documentation/JD_SAAS_AGENT_STUDIO.md) — agent-team designs and exports (design stage).
- [Business settings](documentation/JD_BUSINESS_SETTINGS.md) — JD-reviewed settings changes.
- [Backend release procedure](documentation/JD_BACKEND_RELEASE.md) and [cancellation acceptance](documentation/JD_CANCELLATION_ACCEPTANCE.md).
- [Safe staging setup](documentation/STAGING_SETUP.md).
- [Legacy schema notes](docs/LEGACY_SCHEMA.md) — database names inherited from the original codebase and the migration plan.
- Dated verification reports live in [`docs/evidence/`](docs/evidence/).

A merged PR or successful assistant response is not acceptance: require tests,
persisted records and evidence of the actual outcome.

## Product surface

| Area | Page id | Notes |
|---|---|---|
| JD chat | `jd-chat` | Conversation-first workspace, visual blocks, JD Connect tools |
| Operations | `jd-operations` | Departments, tasks, workflows, schedules, business platform |
| Hiring | `hiring` | Roles, public careers pages, applications |
| Mail logs | `mail-logs` | Outbound email history |
| Notifications | `notifications` | Event alerts and digests |
| Permissions | `permissions` | Owner/manager RBAC |
| Settings | `settings` | Workspace, organisation info, security, integrations |
| Audit log / admin tools | `audit-log`, `admin-tools` | Owner only |
| Create organisation | `org-create` | Preset-based organisation creation |

Roles: `admin` (owner) and `manager`. Every page is gated by `canAccess("page:<id>")`.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite |
| Database / Auth | Supabase (PostgreSQL + RLS), project `thklwiybjuhrjqrrxyid` |
| Server logic | Supabase Edge Functions (`supabase/functions/`) |
| AI | OpenRouter (via JD edge functions) |
| Email | ZeptoMail via the `send-email` / `send-email-batch` edge functions |
| Payments | Paystack, configured per organisation in the JD business platform |
| Hosting | Vercel project `james-denning` |
| Mobile | Capacitor Android shell, app id `com.jamesdenning.app` |
| Icons | `lucide-react` |

## Project structure

```
src/
  App.jsx                 Auth, landing page and workspace activation
  AppDemo.jsx             Workspace shell, router, RBAC, sidebar, tour
  chat/                   JD chat and visual workspace
  pages/                  Workspace pages (JD operations, hiring, settings, ...)
  components/             Shared UI primitives and navigation helpers
  config/                 Product identity, theme, navigation, permissions
  contexts/               Organisation, theme and confirmation providers
  services/email/         Email templates and sending helpers
  software-factory/       SaaS Agent Studio
  supabaseClient.js       Database methods, exported as `db`
  main.jsx / mobile-main.jsx  Web and mobile entry points
supabase/
  functions/              Edge functions (jd-*, manage-account, send-email, ...)
  migrations/             SQL migrations
  rollback/               Reviewed rollback scripts
scripts/                  Test suites, verification and release tooling
docs/, documentation/     Checklist, evidence and design notes
upgrades/                 Upgrade registry and history
```

## Environment variables

```env
VITE_SUPABASE_URL=https://thklwiybjuhrjqrrxyid.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable or anon key>
```

Only browser-safe values belong in `VITE_*` variables. Server secrets live in
Supabase Edge Function secrets (see [NEEDS_YOU.md](NEEDS_YOU.md)).

## Commands

```bash
npm run dev            # Local dev server
npm run build:web      # Production web build (used by Vercel)
npm run verify:web     # Build + web verification guards
npm run build:mobile   # Mobile bundle (dist-mobile/)
npm run android        # Build, sync and open Android Studio
npm run test:navigation
npm run test:tasks
npm run test:checklist
# Other suites: test:guards, test:backend-release, test:capabilities,
# test:chat-layout, test:usage, test:foundation, test:agents,
# test:settings, test:execution, test:history
```

CI (`.github/workflows/ci.yml`, `verify.yml`) runs the builds, test suites and Deno
edge-function checks on every pull request.

## Deployment

Pushing to `master` deploys the Vercel project `james-denning` (`vercel.json` runs
`npm run build:web`). The production deployment URL is
`james-denning-james-projects-57651351.vercel.app`, which is behind Vercel
Deployment Protection. No custom domain is attached yet.

Edge functions are deployed with the Supabase CLI, for example:

```bash
npx supabase functions deploy manage-account --project-ref thklwiybjuhrjqrrxyid --no-verify-jwt
npx supabase functions deploy send-email --project-ref thklwiybjuhrjqrrxyid
```

## Code conventions

- Page logic lives in `src/pages/`; `AppDemo.jsx` is the shell and router.
- Inline styles with tokens from `src/config/theme.js`; no CSS frameworks.
- Use the `db` object from `supabaseClient.js` for data access. The browser client
  uses public credentials subject to RLS; privileged work belongs in authenticated
  edge functions. Never put a service-role key in a `VITE_*` variable.
- Some database names (`schools`, `school_id`, `school_settings`) are inherited from
  the original codebase. Do not rename them outside a reviewed migration; see
  [docs/LEGACY_SCHEMA.md](docs/LEGACY_SCHEMA.md).
- Permissions: `canAccess("page:id")` / `canAccess("action:id")`.
- Notifications: `notify("msg")` or `notify("msg", "error"|"warn"|"success")`.
- Icons: `<AppIcon name="..."/>` in navigation, Lucide components elsewhere. No emoji icons.
