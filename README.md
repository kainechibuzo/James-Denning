   # JAMES-DENNING — Organization Operations Workspace

A multi-tenant business operations workspace for organizations of every kind.
It manages people, teams, groups, billing, performance records, approvals, communications,
and reporting while preserving compatibility with existing education tenants.
Built as a single-page React application backed by Supabase.

## Mission and execution roadmap

**JD is the product; departments, records, workflows and dashboards are the systems it operates and humans use to supervise it.**

- [Master execution checklist](docs/JD_MASTER_EXECUTION_CHECKLIST.md) — eight phases, delivery order, evidence gates and the nine-item acceptance scorecard.
- [Reconciled checklist status](docs/JD_CHECKLIST_STATUS.md) — every item mapped to relevant code/evidence, gaps and next actions; no guessed implementation percentage.
- [Assignment integrity and truthful run history](docs/evidence/2026-11-16-checklist-reconciliation/REPORT.md) — current branch validation and required staging/release order.
- [Owner identity and execution reliability](docs/evidence/2026-11-16-owner-execution/REPORT.md) — fail-closed owner access, guarded execution controls and staged retry SQL repair.
- [Capability meaning and mobile chat](docs/evidence/2026-11-17-capability-mobile/REPORT.md) — separate availability, approval and verification; real-browser layout checks and backend release boundaries.
- [Backend compatibility and scoped release preparation](docs/evidence/2026-11-17-backend-compatibility/REPORT.md) — legacy assignment compatibility, source-artifact guards and separately approved backend releases.
- [Atomic cancellation candidate](docs/evidence/2026-11-16-atomic-cancellation/REPORT.md) — local SQL rollback, access-control and acknowledgement evidence; disabled pending isolated staging and owner review.
- [Business settings and JD review/apply](docs/evidence/2026-11-16-business-settings/REPORT.md) — screenshot-driven mobile fixes, education-only settings separation and exact human-reviewed settings changes.
- [SaaS Agent Studio](documentation/JD_SAAS_AGENT_STUDIO.md) — tailored agent-team designs, editable briefs and honest exports; design stage only, not activated agents or autonomous builds. [Local evidence](docs/evidence/2026-11-16-saas-agent-studio/REPORT.md).
- [Offline cancellation evidence harness](documentation/JD_CANCELLATION_ACCEPTANCE.md) — source-pinned case register and persisted-record assertions; cannot grant live acceptance or production approval.
- [Reviewed backend release procedure](documentation/JD_BACKEND_RELEASE.md) — staging, independent approvals, narrow deployment and recovery boundaries.
- [Initial Phase 1 verification report](docs/evidence/2026-11-16-phase-1/REPORT.md) — dated findings, passing checks, unresolved failures and testing limitations.
- [Safe staging setup](documentation/STAGING_SETUP.md) — isolated infrastructure and server-only privileged secrets.

A merged PR or successful assistant response is not acceptance: require tests, persisted records and evidence of the actual outcome.

**Current deployment URL:** https://portal.renaissancegardenschools.com (legacy host retained for compatibility while the new public domain is finalized)
**GitHub:** https://github.com/kainechibuzo/James-Denning (private — `master` is the default branch)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite 5 |
| Database / Auth | Supabase (PostgreSQL + RLS) — project ID `thklwiybjuhrjqrrxyid` |
| Hosting | Vercel (`npm run build:web`) |
| Email | ZeptoMail (primary) → AWS SES (fallback) via Supabase Edge Function |
| Icons | `lucide-react` |
| Payments | Paystack (`VITE_PAYSTACK_PUBLIC_KEY`) |
| Mobile | Capacitor (`npm run android`) — app ID `com.rgsportal.app` |
| Spreadsheets | `xlsx-js-style` for XLS template generation and result upload |

---

## Project Structure

```
rgs-portal/                       ← Repository root
├── src/
│   ├── AppDemo.jsx               ← Main shell, router, RBAC, shared legacy UI
│   ├── pages/                    ← Domain pages (people, billing, performance, etc.)
│   ├── MobileApp.jsx             ← Dedicated Capacitor/mobile workspace
│   ├── components/               ← Shared UI primitives
│   ├── config/product.js         ← JAMES-DENNING identity, terminology, modules
│   ├── config/theme.js           ← Monochrome design tokens
│   ├── contexts/                 ← Workspace, theme, and confirmation providers
│   ├── services/                 ← Email, PDF, report, and platform services
│   ├── supabaseClient.js         ← Database methods, exported as `db`
│   ├── main.jsx                  ← Web React entry point
│   ├── mobile-main.jsx           ← Mobile React entry point
│   └── useInactivityTimeout.js   ← Auto-logout hook
│   ├── supabaseAdmin.js          ← UNUSED legacy file — ignore
│   └── fix_emoji*.js             ← UNUSED legacy one-off scripts — ignore
├── supabase/
│   ├── functions/
│   │   └── send-email/
│   │       └── index.ts          ← ZeptoMail + AWS SES edge function
│   └── migrations/
│       ├── 001_school_portal_full_schema.sql
│       ├── 002_add_sections.sql
│       ├── 003_student_requests.sql
│       ├── 004_students_extra_columns.sql
│       ├── 005_report_workflow.sql
│       ├── 006_fix_ea_insert_policy.sql
│       ├── 007_attendance.sql
│       ├── 008_email_system.sql
│       ├── 009_feature_additions.sql
│       ├── 010_fees_module.sql
│       ├── 011_refunds.sql
│       ├── 012_discounts.sql
│       └── 013_fee_audit_log.sql
├── .env                          ← Local secrets (never commit)
├── .env.example                  ← Template
├── package.json
├── vite.config.js
├── vercel.json
├── README.md                     ← Developer reference (this file)
├── PROJECT_NOTES.md              ← Full product + technical reference
├── CLAUDE.md                     ← AI assistant context
└── UPGRADE_GUIDE.md              ← v15 report workflow upgrade notes (historical)
```

---

## Environment Variables

```env
VITE_SUPABASE_URL=https://thklwiybjuhrjqrrxyid.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
VITE_PAYSTACK_PUBLIC_KEY=<paystack live key>
```

These are set in Vercel Dashboard → Project → Settings → Environment Variables for production.

---

## Build Commands

```bash
npm run dev           # Local dev server (http://localhost:3000)
npm run build         # Capacitor/Android web bundle (base: './')
npm run build:web     # Vercel production build (base: '/')
npm run build:mobile  # Dedicated mobile bundle (dist-mobile/)
npm run test:guards   # Stubbed verification and staging-target safety tests (no network)
npm run test:tasks    # Task recovery, assignment read-back, mounted UI + isolated PostgreSQL RPC tests
npm run test:navigation # Role/layout compatibility, search, mobile focus + mounted switch dialog
npm run android       # Sync + open Android Studio
```

**Before every push:**
```bash
npm run build         # Must pass with zero esbuild errors
git add src/AppDemo.jsx src/supabaseClient.js
git commit -m "..."
git push              # Triggers Vercel auto-deploy via vercel.json
```

> Vercel runs `npm run build:web` (defined in `vercel.json`). Both `package.json` and
> `package-lock.json` must be committed — Vercel runs `npm ci` from the lockfile.

---

## Database

The Supabase schema is fully applied to project `thklwiybjuhrjqrrxyid`.

**Remote migration history currently includes** versions 001–013, 015–017 and 999 (`column_audit_PATCH`). The `999b` and `999c` SQL files are also present in the repository and must be reconciled against the remote migration history before future automated pushes.
- `last_login timestamptz` added to `students` and `teachers`
- `permission_audit_log` table created
- `role text NOT NULL DEFAULT 'teacher'` added to `teachers`

See `PROJECT_NOTES.md` for the full schema reference.

---

## Code Conventions

- **Domain-page architecture** — page logic belongs in the relevant file under `src/pages/`; `AppDemo.jsx` remains the shell/router.
- **Inline styles only** — no CSS modules, no Tailwind. Use the monochrome tokens from `src/config/theme.js` (`C.blue`, `C.orange`, `C.muted`, `C.border`, `C.offWhite`).
- **Presentation/database split** — visible copy is business-neutral by default. Legacy school-compatible table and column names remain unchanged so existing tenants and data continue to work.
- **Workspace profiles** — Admin → Settings → Workspace selects the organization type and enables/disables the optional Education module. Education tenants can restore academic navigation labels without a database migration.
- **`db.*` for all DB calls** — use the exported `db` object from `supabaseClient.js`. Never call `supabase.from(...)` directly in components (a few legacy inline queries exist and are OK to leave).
- **No browser service-role client:** `supabaseClient.js` uses public credentials subject to RLS. Privileged operations belong in authenticated, authorised server-side Edge Functions. Never configure a service-role secret in any `VITE_*` variable; a runtime guard is not a substitute for keeping secrets out of build inputs and browser bundles.
- **Icons:** `<AppIcon name="..."/>` for sidebar/nav; Lucide components directly (`<Settings size={16}/>`) elsewhere. Never use emoji as icons.
- **Routing:** `setPage("page-id")` — SPA with no URL changes.
- **Notifications:** `notify("msg")` or `notify("msg", "error"|"warn"|"success")`.
- **Permissions:** `canAccess("page:id")` or `canAccess("action:id")`.

---

## Deployment

Auto-deploy on push to `master`. Vercel configuration is in `vercel.json`.

Manual deploy via Vercel CLI:
```bash
npx vercel --prod
```

### Mobile (Android)
```bash
npm run build       # Capacitor build
npx cap sync android
npx cap open android
# Then build APK in Android Studio
```

### iOS (PWA only — no native app)
Visit the portal URL in Safari → Share → Add to Home Screen.

---

## Edge Functions

Deploy the account and email functions:
```bash
# Registration is public; the function authenticates every non-registration action itself.
npx supabase functions deploy manage-account --project-ref mcdcwdfdpqzrzsixmrcg --no-verify-jwt
npx supabase functions deploy send-email --project-ref mcdcwdfdpqzrzsixmrcg
```

Secrets are configured in Supabase Dashboard → Settings → Edge Functions → Secrets.
See `PROJECT_NOTES.md` for the full list.

---

## Support

Built for modern organizations of every kind.
Internal use by default — access is role-controlled via Supabase Auth + RBAC.
