# Renaissance Garden Schools — Portal (v30)

Internal school management portal for Renaissance Garden Schools, Abuja.
Built as a single-page React application backed by Supabase.

**Live URL:** https://portal.renaissancegardenschools.com
**GitHub:** https://github.com/Ossytrikz/RGS-PORTAL (private — `master` branch auto-deploys to Vercel)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite 5 |
| Database / Auth | Supabase (PostgreSQL + RLS) — project ID `mcdcwdfdpqzrzsixmrcg` |
| Hosting | Vercel (`npm run build:web`) |
| Email | ZeptoMail (primary) → AWS SES (fallback) via Supabase Edge Function |
| Icons | `lucide-react` |
| Payments | Paystack (`VITE_PAYSTACK_PUBLIC_KEY`) |
| Mobile | Capacitor (`npm run android`) — app ID `com.rgsportal.app` |
| Spreadsheets | `xlsx-js-style` for XLS template generation and result upload |

---

## Project Structure

```
rgs-v27/                          ← Working directory (internal name; project is v30)
├── src/
│   ├── AppDemo.jsx               ← ALL UI components (~19 k lines, ~100 functions)
│   ├── supabaseClient.js         ← ALL DB methods (~900 lines, exported as `db`)
│   ├── main.jsx                  ← React entry point, mounts <App/>
│   ├── App.jsx                   ← Thin shell rendering <AppInnerWrapper/>
│   ├── useInactivityTimeout.js   ← Auto-logout hook
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
VITE_SUPABASE_URL=https://mcdcwdfdpqzrzsixmrcg.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
VITE_PAYSTACK_PUBLIC_KEY=<paystack live key>
```

These are set in Vercel Dashboard → Project → Settings → Environment Variables for production.

---

## Build Commands

```bash
npm run dev           # Local dev server (http://localhost:3000)
npm run build         # Capacitor/Android build (base: './')
npm run build:web     # Vercel production build (base: '/')
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

The Supabase schema is fully applied to project `mcdcwdfdpqzrzsixmrcg`.

**13 migrations applied** (001–013). Additional ad-hoc changes applied via Supabase MCP:
- `last_login timestamptz` added to `students` and `teachers`
- `permission_audit_log` table created
- `role text NOT NULL DEFAULT 'teacher'` added to `teachers`

See `PROJECT_NOTES.md` for the full schema reference.

---

## Code Conventions

- **Single-file architecture** — all page components, modals, hooks in `AppDemo.jsx`. Do not create new files unless explicitly asked.
- **Inline styles only** — no CSS modules, no Tailwind. Colours from the `C` constant (`C.blue`, `C.orange`, `C.muted`, `C.border`, `C.offWhite`).
- **`db.*` for all DB calls** — use the exported `db` object from `supabaseClient.js`. Never call `supabase.from(...)` directly in components (a few legacy inline queries exist and are OK to leave).
- **`supabaseSrv`** (service role) lives inside `supabaseClient.js` for RLS bypass ops. Never import it into `AppDemo.jsx`.
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

Deploy the `send-email` function:
```bash
npx supabase functions deploy send-email --project-ref mcdcwdfdpqzrzsixmrcg
```

Secrets are configured in Supabase Dashboard → Settings → Edge Functions → Secrets.
See `PROJECT_NOTES.md` for the full list.

---

## Support

Built for Renaissance Garden Schools, Abuja, Nigeria.
Internal use only — access is role-controlled via Supabase Auth + RBAC.
