# CLAUDE.md — JAMES-DENNING Project Context
_Last updated: 1 Sep 2026._

## Rebrand / Workspace Model (20 Aug 2026)

The product is now branded **JAMES-DENNING — Business Operations Platform**. The default UI is
business-neutral and uses a restrained monochrome design system. Existing database tables,
columns, route IDs, role values, local-storage keys, and tenant data retain their legacy school-
compatible names so current education tenants continue to work without a migration.

- Product identity and copy lives in `src/config/product.js`.
- Theme tokens live in `src/config/theme.js`; legacy token names (`C.blue`, `C.orange`, etc.)
  remain as compatibility aliases for the existing page components.
- Admin → Settings → Workspace stores `workspace_type` and `education_module_enabled` in the
  existing `school_settings` table. Business is the default; Education restores the academic
  navigation labels through the optional module.
- Brand assets are `public/jd-mark.svg`, `public/jd-logo.svg`, and the regenerated PWA/Capacitor
  icons. The old Apex/RGS logo asset is no longer referenced.
- `mobile.html` was added because `vite.mobile.config.js` expects it; both web and mobile builds
  must pass before a change is considered complete.
- **Phase 5 — General-purpose Business Dashboard (1 Sep 2026, v32.93)** — the shell is now
  business-first by default for ALL tenants. `education_module_enabled` defaults **false**;
  education UI/labels are an explicit per-tenant opt-in (Settings → Workspace Profile).
  Business-mode nav hides school-specific items (classes, subjects, sections, timetable,
  broadsheet, assignments, results, report-cards, transcript, academic-summary,
  report-card-settings, grading, attendance, my-classes, results-teach, my-results, my-bill)
  via the `eduOnly` set in `AppDemo.jsx`; education mode restores the full academic nav via
  `EDUCATION_NAV_LABELS`. New general-purpose modules (migration `018_business_modules.sql`,
  **pending apply** — school-scoped RLS, same 999b pattern): `customers` (CRM contacts &
  companies), `projects` + `project_tasks`, `invoices` + `invoice_items`. New pages in
  `src/pages/business.jsx` (`CustomersPage`, `ProjectsPage`, `InvoicesPage`) wired at nav
  routes `customers`/`projects`/`invoices` under Administration; `db.*` methods
  (`getCustomers`/`upsertCustomer`/`deleteCustomer`, `getProjects`/`upsertProject`/`deleteProject`,
  `getProjectTasks`/`upsertProjectTask`/`deleteProjectTask`, `getInvoices`/`getInvoice`/`upsertInvoice`/
  `deleteInvoice`, `upsertInvoiceItem`/`deleteInvoiceItem`). Invoices reuse the neutral billing
  concept (education fees module remains untouched for education opt-in). Zero behavior change
  for existing tenants: education data intact, hidden until opt-in. Hiring Phases 1–3 unchanged.
- **Hiring Phases 2–3 (1 Sep 2026, v32.92)** — postings + auto-generated landing pages,
  applications/negotiation, hires & owner-defined quota tracking. Migration
  `017_hiring_roles.sql` (**pending apply**) adds 5 school-scoped tables
  (`hiring_roles`, `hiring_applications`, `hiring_messages`, `hires`, `hire_quota_entries`; RLS enabled + school-scoped policies per 999b, NOT FORCE — the public definer functions must bypass RLS like 999c) and
  **4 public SECURITY DEFINER RPCs** (`hiring_public_role`, `hiring_public_submit_application`,
  `hiring_get_thread`, `hiring_post_message`) — anon never gets table grants; the public landing
  page at `/apply/<slug>` (rendered by `PublicHireLanding` when `App()` sees the `/apply/` path,
  no router needed — Vite SPA + Vercel rewrite serves it) reads/writes only through those RPCs.
  Admin UI is `HiringPage` (nav route `hiring`, under Administration; tabs Roles / Applications /
  Hires & Quota). Quota metric + how-it's-measured are **owner-defined at hire time**; the
  dashboard is descriptive only ("at 60% of quota") and **never calculates pay**. New-application
  alerts reuse the existing in-app notification + `db.sendAdminAlert` email path (high-water mark
  `hiring_alerted_upto` in `school_settings`); applicant confirmation email via `sendPortalEmail`.
  Scope guards still apply: no page builder, no ad-buying/tracking, no payroll/payout math.
- Hiring Phase 1 (1 Sep 2026, v32.91) — org creation + business-type presets. New
  `src/pages/hiring.jsx` (routes `org-create` → preset grid, `org-create-details` → org form;
  `OrgSignupModal` replaces the old AppDemo `SchoolSignupModal`). Tables (migration
  `016_org_presets.sql` — **pending apply**): `org_presets` (seeded catalog: `general_business`,
  `dev_shop`; anon-readable, service-role-write), `org_submissions` + `org_tools` (school-scoped
  RLS, FORCE RLS), plus nullable `schools.preset_key` / `schools.onboarding_step`.
  **Zero-behavior-change rule: existing tenants keep `preset_key` NULL and are never touched by
  the preset path** — no defaults, no triggers, no policy changes on existing tables. Preset
  seeding happens server-side in `manage-account` `register_school` (validate `presetKey` against
  `org_presets` FIRST, stamp schools row, seed `school_settings` from `settings_seed`, insert
  `org_submissions` + `org_tools`). The edge function needs redeploying for the seeding to work;
  until then registrations degrade to classic orgs, which is existing behavior. `db.*` methods:
  `getOrgPresets()`, `getOrgSubmission()`, `getOrgTools()`, `setOrgTool()` (upsert
  `onConflict:'school_id,tool_key'`). Hiring Phases 2+ (postings, landing pages, chat, quotas)
  will build on `org_tools`; keep the scope guards: no page builder, no ad platform, no
  payroll/tax/payout logic, and never auto-calculate payouts from quota data.
- Public organization registration uses `manage-account` with `verify_jwt = false` at the Edge
  Function boundary; the function itself protects every non-registration action. The client keeps
  a temporary fallback for the legacy deployed `clever-processor` slug and exposes the server's
  actual registration error when a request fails.


**PITFALL — preview automation & PDF/print buttons:** clicking any button that opens the
in-portal PDF viewer (`ctx.showPDF` / `openHtmlDoc`, e.g. the fees.jsx "PDF" buttons) reliably
hangs the Claude Preview browser-automation tool (looks like a `window.open`/print-dialog
interaction the headless remote can't resolve). This is an automation-environment limitation,
not a portal bug — reproduced twice. When you need to verify PDF-report content, don't click
through in the preview; instead simulate the row/HTML-template logic in Node with sample data,
or ask the user to click-test it live post-deploy.

**Fee Statistics (fees.jsx `FeeStatisticsPage`) — Items tab conventions:**
- `allItems` is driven ONLY by `usedNames` (what's actually on bills this period) — never
  intersect with the `fee_items` master list again; bills routinely include one-off custom
  items (e.g. "Additional payment on graduation") never added to that table, and 22 such names
  were confirmed silently hidden in RGS's live data before this was fixed.
- Any per-student/per-item report should consider a "not billed"/"never happened" case, not
  just success/fail — a `not_billed` status was added alongside paid/partial/unpaid for exactly
  this reason (previously those students were invisible).
- Status filtering uses `itemStatusFilter` as a `Set` (multi-select checkboxes via the shared
  `StatusMultiSelect` component) — always reset with `new Set()`, not `""`.
- Row highlighting: `rowBg(r,i)` tints partial rows amber, unpaid rows red.
- All ~14 report generators (PDF/CSV) funnel through one `pdfWrap()` — that's the single choke
  point for cross-cutting report behavior (Privacy Mode masking, watermarks, etc.).
- `db.getFeeItems()` correctly filters by `_schoolId` now (previously leaked all schools' item
  names together) — always verify `school_id` filtering on `get*` methods before trusting them.

**Promotions & session rollover** (see `documentation/PROMOTION_ROLLOVER_SPEC.md` + PROJECT_NOTES):
term position keys off `terms.term_order` (1/2/3), never the name — `upsertTerm` auto-derives
it. Promotion must only change a student's CURRENT class/status, never historical
`portal_results.class_id`. Fee carry-over keys on `student_id` so it survives promotion
automatically; the one gap is graduated students (never billed again) — the Promotions page
warns before commit via `db.getOutstandingBalancesForStudents`.

**Dashboard health-check "Fix →"** deep-links via a generic `ctx.pageParam` channel
(AppDemo.jsx): `setPageParam({filter:...})` before `setPage(...)`; target page reads + clears it
once. Reuse this pattern for other health-check "Fix" buttons rather than a bare `setPage`.

**Testing:** a hidden sandbox tenant (`?school=sandbox`, admin pw `sandbox`, school_id
`f0000000-0000-4000-8000-000000000001`, status `suspended`) lets you safely test destructive
flows — isolated by `school_id`. Reset via `documentation/sql/reset_sandbox.sql`. See
`documentation/STAGING_SETUP.md`.

**UI conventions:** global font lives in `index.html` on `html/body` AND form controls — don't
reintroduce Times New Roman via unstyled elements. Prefer `TableSkeleton` over `Spinner`,
`EmptyState` over plain "no rows" text.

**PITFALL:** the service worker (`public/sw.js`) can pin browsers to stale builds — it no longer
registers in dev (`import.meta.env.PROD` gate in `main.jsx`); when preview testing behaves
stale, unregister SWs and clear CacheStorage.

---

## How to Use This File

**Read `CLAUDE.md` + `documentation/PROJECT_NOTES.md` at the start of every session** to get fully up to speed.
- `CLAUDE.md` → code conventions, pitfalls, architecture rules (read first) — stays in project root
- `documentation/PROJECT_NOTES.md` → full product reference: features, schema, services, recent changes

## Session Rules — Follow These Every Time

1. **Never push to GitHub unless the user explicitly says to push.** Do not include `git push` in any workflow unless instructed. Commit locally, confirm the build passes, and stop there.
2. **Update docs after every change.** After every code change, bug fix, or feature addition, update `CLAUDE.md` + `documentation/PROJECT_NOTES.md` before the session ends. Do not skip this step even for small changes.

---

## Documentation Rule

**After every code change or feature addition, update the docs before closing the session:**
1. Update `documentation/PROJECT_NOTES.md` → add to "Recent Changes" section, update any affected tables/schema/feature list
2. Update `CLAUDE.md` → update "Known Issues", "TODOs", or add any new conventions/pitfalls discovered
3. Update the `_Last updated` date at the top of both files

This keeps the next session fully informed without needing to re-read code.

---

## Project Summary

**JAMES-DENNING** — a multi-tenant business operations platform for organizations of every kind.
Built as a single-page React app. Page components live in `src/pages/` (one file per domain).
`src/AppDemo.jsx` is the main shell — router, context providers, platform admin, RBAC, and shared
UI. `src/supabaseClient.js` holds all DB methods. **Do not add page logic to `AppDemo.jsx`** —
new features go in the relevant `src/pages/` file. Existing education workflows remain available
through the optional Education workspace module.

**Current deployment URL:** https://portal.renaissancegardenschools.com (legacy host retained during rebrand)
**GitHub:** https://github.com/Ossytrikz/RGS-PORTAL (private, `master` branch auto-deploys to Vercel)

---

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | React 18 + Vite 5 |
| Database / Auth | Supabase (PostgreSQL) — project ID `mcdcwdfdpqzrzsixmrcg` |
| Hosting | Vercel (`npm run build:web`) |
| Email | ZeptoMail (primary) → AWS SES fallback via Supabase Edge Function `send-email` |
| Icons | `lucide-react` — **never use emoji or text labels as icons** |
| Payments | Paystack (`VITE_PAYSTACK_PUBLIC_KEY` in `.env`) |
| Mobile | Capacitor (`npm run android`) — app ID `com.rgsportal.app` |
| Spreadsheets | `xlsx-js-style` for XLS template generation and result upload |

**Build commands:**
- `npm run dev` — local dev
- `npm run build` (base `./`) → Capacitor / Android
- `npm run build:web` (base `/`) → Vercel production
- `npm run build:mobile` → dedicated mobile entry (`mobile.html`, `dist-mobile/`)

---

## File Map

```
src/
  AppDemo.jsx       ← Main shell + platform admin + shared UI components (~5.3k lines). Imports ALL page components from src/pages/. No page logic lives here.
  pages/            ← ALL page components (migration fully complete). Sole source of truth for app pages.
  supabaseClient.js ← ALL DB methods (~900 lines, exported as `db`)
  main.jsx          ← Entry point, mounts <App/>
  App.jsx           ← Thin shell that renders <AppInnerWrapper/>
  supabaseAdmin.js  ← Unused legacy file
  useInactivityTimeout.js ← Inactivity logout hook
supabase/
  functions/send-email/index.ts  ← ZeptoMail+SES edge function
  migrations/001–013_*.sql       ← Applied DB migrations
```

---

## Code Style & Conventions

- **Page architecture:** All page components live in `src/pages/`. `AppDemo.jsx` is the main shell only — it contains the router, context providers, platform admin pages, and shared UI components (`Card`, `Btn`, `Modal`, etc.). **Do not add page logic to `AppDemo.jsx`.** When building a new feature:
  1. Add the component to the relevant `src/pages/` file (e.g. fees → `pages/fees.jsx`, results → `pages/results.jsx`)
  2. Export it from that file
  3. Import it in `AppDemo.jsx` and add a route in the `<main>` switch and a nav entry in `ALL_NAV`
  If no existing pages/ file fits, create a new one following the same import pattern as the others.
- **Inline styles only** — no CSS modules, no Tailwind. Colours come from `src/config/theme.js`; legacy token names such as `C.blue` and `C.orange` remain available as monochrome compatibility aliases.
- **Business-neutral presentation** — use the terminology and identity helpers in `src/config/product.js` for new copy. Do not rename legacy database keys or route IDs. The optional Education module is controlled by `workspace_type` and `education_module_enabled` in `school_settings`.
- **`db.*` for all DB calls** — never call `supabase.from(...)` or `supabaseSrv.from(...)` directly in components or pages/ files. Always use the exported `db` object from `supabaseClient.js`. If the method you need doesn't exist, add it to `supabaseClient.js` (use `supabaseSrv` + filter by `this._schoolId`). The anon `supabase` client has zero RLS access — direct calls will silently return empty or fail.
- **`supabaseSrv`** (service role) is used inside `supabaseClient.js` for ALL operations — every method must use `supabaseSrv` + filter by `this._schoolId`. Never import `supabaseSrv` into `AppDemo.jsx`; instead add a method to `db`.
- **Icons:** Use `<AppIcon name="...\" size={n}/>` for sidebar/nav icons. Use Lucide components directly (`<Settings size={16}/>`) everywhere else.
- **Page routing:** `setPage("page-id")` — SPA with no URL changes. All routes are listed in `ALL_NAV` and the main `<main>` switch block.
- **Notifications:** `notify("message")` or `notify("message","error"/"warn"/"success")`.
- **Permission checks:** `canAccess("page:id")` or `canAccess("action:id")` — always use the `page:` / `action:` prefix format. See RBAC section below.
- **Pagination:** Supabase caps SELECT at 1000 rows by default. Use `.range()` in batches for any query that may exceed 1000 rows. `getResults()` and `getResultsCompleteness()` already paginate.
- **Filter comparisons:** Always wrap ID/phone fields in `String(val||"")` before calling `.toLowerCase()`. Student IDs can be text (`"HLDS/01"`) or integers — raw `.toLowerCase()` on an integer throws a TypeError that silently empties the filtered list.
- **Pagination clamp:** When filters change, use synchronous `safePage = Math.min(page, Math.max(0, totalPages-1))` computed at render time instead of an async `setPage(0)` in a `useEffect`. The async approach causes one render where `paged` slices an out-of-bounds range (empty list flash).
- **Multi-tenant rule:** Every new `db.*` method added to `supabaseClient.js` MUST use `supabaseSrv` AND filter every query with `.eq('school_id', this._schoolId)`. Missing either causes cross-school data leakage. This applies to `select`, `insert` (inject key), `update`, `delete`, and `upsert` (include in conflict target).
- **Interlock messages:** Use format `🔒 Interlock — Cannot delete "X"\nReason: ...\nFix: ...` via `notify(..., "error")`.
- **Cross-chunk free variables — CRITICAL:** Page files in `src/pages/` are lazy-loaded Vite chunks. Any constant or function defined in one chunk (e.g. `dashboard.jsx`) is NOT available as a free variable in another chunk (e.g. `permissions.jsx`), even if it was a global in the original monolithic `AppDemo.jsx`. If you add a new RBAC constant, shared helper, or config object that is needed across multiple page files — define and export it from `AppDemo.jsx` (the main always-loaded bundle) and import it explicitly wherever needed. **The three existing RBAC constants (`PERM_ROLE_DEFAULTS`, `PERM_GROUPS`, `RBAC_ROLES`) already live in `AppDemo.jsx` for this reason — do not move them.**
- **`Map` constructor:** Never use `new Map()` in component scope — Lucide exports a `Map` icon that shadows the global. Use plain object `{}` for key-value deduplication.
- **`File` constructor:** Never use `new File(...)` in module scope — Lucide exports a `File` icon that shadows the global. Use `new window.File(...)` instead.
- **Android mobile inputs (controlled vs uncontrolled):** For `<input>` and `<textarea>` where the user types free-form text (especially multi-line), use `defaultValue` + `key` instead of `value` (controlled). Android IME delivers backspace via composition events — React's controlled input reconciliation cancels them, making backspace appear broken. Use a counter key (`msgKey`) that increments when programmatic content injection is needed (template apply, post-send reset). See `MailComposePage` for the pattern.

---

## Platform Admin Console

A super-admin layer sits above all school portals, accessible from the School Select screen (PIN login).

**Login:** Single 8-digit PIN stored in `platform_admins.password_hash` (plaintext). No email required.

**Components in AppDemo.jsx:**
- `SchoolSelectPage` — shows PIN input + "Change PIN" link
- `ChangePinModal` — current → new → confirm, validates + saves via `db.updatePlatformAdminPin()`
- `PlatformDashboardPage` — tabs: Schools | Audit Log | Platform Settings
- `DeleteSchoolModal` — type school name to confirm before `db.deleteSchool()`

**`db` methods:**
```js
db.getPlatformAdmin()                 // {admin} — note: not {data}
db.updatePlatformAdminPin(id, newPin)
db.updateSchoolPlan(id, plan)
db.deleteSchool(id)
db.getAllPlatformAuditLog()
db.logPlatformAction(adminId, schoolId, action, details)
```

**`platform_admins` table:** `id, email, password_hash, created_at`

---

## Active Feature Modules

| Module | Page IDs | Notes |
|---|---|---|
| Dashboard | `dashboard` | Role-specific: Admin, Teacher, Manager, Student |
| Members | `members` | Admin + Manager. Last login column. Role change (teacher↔manager) |
| Students | `students`, `approvals` | Bulk ops, duplicate detection, onboarding emails |
| Teachers | `teachers` | CRUD, class assignment |
| Report Cards | `report-cards`, `my-results` | Publish flow, PDF gen, email to parent |
| Results | `results-admin`, `results-teach`, `result-approvals` | EA/MA approval workflow |
| Fees | `fee-items`, `fee-templates`, `fee-generate`, `fee-tracker`, `fee-stats` | Paystack + manual bank |
| Student Finance | `my-bill`, `my-payments` | Student-facing |
| Attendance | `attendance` | Teacher records |
| Announcements | `announce` | All roles |
| Email | `mail-compose`, `mail-logs` | ZeptoMail via edge function |
| Transcript | `transcript` | PDF generation |
| Settings | `settings` | **Full page** (not panel). Tabs: School Info, Sessions/Terms, Academic, Security, Portal, Permissions |
| Org presets (Hiring Ph.1) | `org-create`, `org-create-details` | Admin-only. Preset grid → org registration form; `OrgSignupModal` for pre-auth signup |
| Permissions | embedded in Settings | RBAC matrix UI |
| Grading | `grading` | Grade schema + CAE traits |
| Academic Calendar | `calendar` | Month grid + list view, CRUD events (admin), read for teachers |
| Timetable | `timetable` | Period setup + class grid (admin), personal weekly view (teacher) |
| Data Export | `export` | 5 xlsx download cards: students, staff, results, bills, attendance |
| Login Activity | `activity` | Last-login table, 5 buckets, admin only |
| Recycle Bin | `recycle-bin` | Soft-delete store with TTL + restore/permanent-delete |
| Audit Log | `audit-log` | Admin action history |

---

## RBAC System

### Roles
| Role | `teachers.role` value | Notes |
|---|---|---|
| Admin | N/A (special) | Always full access; `canAccess` returns `true` |
| Teacher | `"teacher"` | Default for all staff |
| Manager | `"manager"` | Finance officer; was previously "Bursar" |
| Student | N/A | Via `students` table |

- **No parent role** (removed). Students are always students (no role change).
- Teachers can be converted to Managers via Members page ⋮ menu → "Change to Manager".

### `canAccess(permId)` — how it works
Defined in `AppInner`. Checks in order:
1. Admin → always `true`
2. `userPerms` (DB `user_permissions` table) — user-specific override
3. `rolePerms` (DB `role_permissions` table) — role-wide setting
4. `PERM_ROLE_DEFAULTS[role]` — hardcoded defaults for actions/pages
5. `ALL_NAV` entry — if role is in `n.roles`, allow

**ID format:** Always `"page:page-id"` or `"action:action_name"`. The function normalises bare IDs (adds `"page:"` prefix automatically).

### Correct action IDs at call sites
```js
canAccess("action:edit_students")      // edit student profiles
canAccess("action:publish_results")    // publish report cards
canAccess("action:approve_ma")         // manager approval
canAccess("action:approve_ea")         // educator approval
canAccess("action:download_reports")   // download PDF reports
canAccess("action:manage_attendance")  // manage attendance
canAccess("action:send_email")         // send emails
canAccess("page:mail-logs")            // view email logs
```

### DB Tables
- `role_permissions(role, page_id, allowed)` — per-role on/off
- `user_permissions(user_id, page_id, allowed)` — per-user override
- `permission_audit_log` — every permission change logged
- `school_settings` key `permission_templates` — JSON templates

---

## DB Schema Highlights

### Key tables
- `students` — `id` can be **integer or text** depending on school (e.g. Heyday uses `"HLDS/01"`). Always `String(id)` when comparing. Fields: `first_name, last_name, class_id, status, last_login, admission_number, school_id, ...`. **Actual status values in DB: `'active'`, `'left'`, `'suspended'`** (docs previously said `'withdrawn'`/`'graduated'` — those do not exist).
- `platform_admins` — `id, email, password_hash (plaintext PIN), created_at`
- `teachers` — `id (uuid), staff_id, full_name, role ('teacher'|'manager'), last_login, section_id, school_id, ...`
- `sessions`, `terms` — academic calendar
- `portal_results` — `student_id, subject_id, term_id, session_id, ca_score, exam_score, total_score, component_scores(JSON)` — UNIQUE on `(student_id, class_id, subject_id, term_id, session_id)`
- `result_approvals` — `school_id, class_id, term_id, session_id, ea_status, ma_status` — **no student_id** (class-level). Conflict target: `(school_id, class_id, term_id, session_id)`.
- `report_card_publish` — `school_id, class_id, term_id, session_id, is_published, show_position, show_cae, ...`. Conflict target: `(school_id, class_id, term_id, session_id)`.
- `attendance_records` — `school_id, student_id, date`. Conflict target: `(school_id, student_id, date)`.
- `class_subjects` — links classes to `section_subjects`; ghost entries cause corrupt uploads
- `fee_bills`, `fee_payments`, `fee_items`, `fee_templates` — fees module
- `fee_payments` — `student_id (text), amount, is_refunded (bool)` — **active payment table**
- `payments` — legacy payment table (older records, also has `student_id text`)
- `attendance_records` — per student per date

### Applied migrations (014 total)
001 full schema · 002 sections · 003 student requests · 004 student extras · 005 report workflow · 006 EA policy fix · 007 attendance · 008 email · 009 feature additions · 010 fees · 011 refunds · 012 discounts · 013 fee audit log · 014 next_student_id RPC

**Ad-hoc migrations applied via Supabase MCP (not in migration files):**
- `last_login timestamptz` added to `students` and `teachers`
- `permission_audit_log` table created
- `role text NOT NULL DEFAULT 'teacher'` added to `teachers`

---

## Email System

- Edge function: `supabase/functions/send-email/index.ts`
- Primary: **ZeptoMail** (`ZEPTO_API_KEY` secret in Supabase)
- Fallback: **AWS SES** (SigV4 signing, no SDK)
- Sender: `noreply@renaissancegardenschools.com`
- AWS SES status: **Sandbox** (production access pending since 14 Mar 2026 — verify if approved)
- Supports HTML body + base64 PDF attachments

---

## Report Card PDF System

- `openReportCardPrintWindow(...)` — builds full HTML, opens in new tab for print/PDF
- For email/storage path: viewport `width=device-width` + JS scaler (zooms down on narrow screens, never up)
- `generateOnePDF(student)` reads opts from `publishInfo` (DB source of truth), not `pubOptions` (UI state)
- Storage bucket: `report-cards` (private, 7-day signed URLs)
- pg_cron cleans files older than 7 days nightly at 2am

---

## Transcript PDF System

Two builders, both in `AppDemo.jsx`:

### `buildMultiPeriodTranscriptHTML` (new default)
- Subjects as rows; class/year combos as column groups (1st/2nd/3rd Term + AVG + GRD per group)
- Periods chunk into groups of max 3 — extra groups render as stacked tables with "Continued" label
- Color palette: navy `#1e3a5f`, medium blue `#3b6fa8`, gold accents `#f0c040`, light blue tints on alternating rows and AVG/GRD cells — professional, print-friendly
- **Print button:** `position:fixed` navy bar at top of page — always visible. Hides `.no-print` before `window.print()`, restores after. Hidden via `@media print { display:none!important }`.
- Print CSS: `@page { size: A4 landscape; margin: 10mm }`
- Logo: reads from `logoBase64` param (passed from `TranscriptPage` via `useSection().schoolLogo`) — falls back to initials if none

### `buildTranscriptHTML` (legacy)
- Old flat 9-col layout (T1 CA/Exam/Total × 3) or custom structure columns
- Used when `transcript_type === "legacy"` on a `manual_transcripts` record

### Data model
- `manual_transcripts.transcript_type`: `"multi_period"` | `"legacy"`
- `manual_transcripts.class_periods`: `[{class_name, academic_year}]` JSON
- `manual_transcript_subjects.component_scores`:
  - multi_period: `{type:"multi_period", periods:[{t1,t2,t3}]}`
  - legacy+structure: `{[colName]: value}`

### Logo key
`TranscriptPage` uses `const {schoolLogo:logoBase64}=useSection()` — this reads `portal_logo_base64` from `school_settings` via `SectionCtx`. **Do not use `settings?.school_logo`** — that key does not exist.

---

## Interlock System

Hard stops that prevent destructive actions when data is linked. Pattern:
```js
notify(`🔒 Interlock — Cannot delete "${name}"\nReason: ...\nFix: ...`, "error");
return;
```

### Current interlocks
| Action | Blocks if |
|---|---|
| Delete class | Students enrolled, results exist, or published cards |
| Remove subject from class | Results exist for subject+class |
| Bulk deselect class subjects | Results exist for that class |
| Delete signature | Signature referenced in a report template |
| Delete report template | Template is marked as default |
| Delete student (single) | Unrefunded `fee_payments` exist OR class has published cards |
| Delete students (bulk) | Batch pre-screen — blocked students skipped; if all blocked, abort |

---

## Internet Connectivity Overlay

In `AppInnerWrapper`:
```js
const [isOnline, setIsOnline] = useState(() => navigator.onLine);
const [justReconnected, setJustReconnected] = useState(false);
// online/offline event listeners → full-screen WifiOff overlay when offline
// Wifi toast for 4 seconds on reconnect
```
Lucide imports required: `WifiOff, Wifi`

---

## Result Upload System

### Key facts
- Student IDs are integers in DB but come back as strings from XLS → always compare with `String(s.id) === String(row.stuId)`
- Deduplication: use plain object `{}` not `new Map()` (Lucide `Map` icon collision)
- Zero scores are valid — never skip on `if(!totalScore)`
- `getResults()` and `getResultsCompleteness()` paginate in 1000-row batches (Supabase default cap)
- Template generates students per-class: `db.getStudents(null, {class_id: cls.id})`
- Ghost `class_subjects` assignments cause wrong subjects in templates → delete ghost rows before re-upload

---

## Known Issues / Watchlist

- **Report cards must render only results for the student's _current_ class.** `portal_results` rows from a previous class (e.g. student moved mid-session) will otherwise appear as duplicate subject rows or phantom 0/F entries. Two layers enforce this (fixed 21 Apr 2026, v32.37):
  1. Every per-student `db.getResults({student_id,...})` call site that feeds a report card MUST pass `class_id` (use the student's current `class_id`). Transcript/history paths are the only exception.
  2. `openReportCardPrintWindow` has a renderer-level safety net that (a) filters out results whose `class_id !== cls.id` and (b) dedupes by `subject_id` keeping the highest `total_score`. This catches any future regressions at the rendering layer.
- **`portal_results.subject_id` is NOT NULL** (enforced 20 Apr 2026, migration 015). Any bulk upload path that fails to resolve a subject name to a `section_subjects.id` will be rejected by Postgres. Client-side upload paths (`ResultsAdmin.save`, multi-sheet XLS bulk upload) now pre-filter rows with null/NaN `subject_id` and surface a warning ("row skipped — unresolved subject") rather than attempting the insert. If you introduce a new upload/insert path, include the same filter. Historical phantom "extra subject" rows on report cards (e.g. 18 instead of 17) were caused by rows with `subject_id=NULL` coming from ghost `class_subjects` or blank template columns.
- **`fee_bills.balance` is a GENERATED column** (`GENERATED ALWAYS AS (total_amount - amount_paid) STORED`). Never include `balance` in an UPDATE/UPSERT payload to `fee_bills` — Postgres returns 400 Bad Request. Only write `total_amount`, `amount_paid`, `status`; `balance` recomputes automatically. Historical offenders were `recalcBillTotals`, `markBillsPaid`, and the `toggleOptional` path (fixed v32.26).
- **`recalcBillTotals` must be called after every discount operation** — if skipped, `total_amount` stays at the pre-discount value and the generated `balance` is wrong. `FeeStatsPage` and the CSV export now compute live balance from embedded `fee_bill_items` minus `fee_discounts` as a safety net. A one-off DB repair was run (5 Jun 2026) to fix all stale bills.


- **AWS SES still in sandbox** — emails only go to verified addresses until production access approved
- **AWS IAM keys should be rotated** — keys were shared in chat history
- **Paystack live key** must be added to Vercel env vars
- `supabaseAdmin.js` is legacy and unused; ignore it
- `fix_emoji*.js` files in root are legacy one-off scripts; ignore them
- ~~`SignaturesPage` component exists but returns `null` (placeholder)~~ — Removed (v32.75)
- **ZeptoMail shared IP** can trigger Yahoo TSS04 soft bounces — monitor ZeptoMail dashboard; consider dedicated IP if recurring
- **`public.profiles` table is empty** — `auth_role()` DB function reads from it and always returns `NULL`. This means the anon Supabase client (`supabase`) has **zero RLS access to `fee_bills`** and likely other fee tables. All fee operations must use `supabaseSrv` via `db.*` methods. Do not delete `profiles` — other policies may reference it.
- **Platform admin PIN is plaintext** — stored as plaintext in `platform_admins.password_hash`. Acceptable for internal tool but do not expose this column publicly or log it.
- **Multi-tenant stability audit completed (19 Apr 2026)** — All Tier 1–5 issues resolved. See PROJECT_NOTES.md for full change log. Remaining architectural debts (service role in browser, plaintext passwords, no rate limiting) are pre-existing design decisions deferred to a dedicated security sprint.

---

## TODOs / Next Steps

- [ ] Confirm AWS SES production access (check email) → test bulk email sending
- [ ] Add Paystack live key to Vercel env vars (`VITE_PAYSTACK_PUBLIC_KEY`)
- [ ] Rotate AWS IAM access keys (were shared in chat history)
- [ ] Verify `action:manage_attendance` permission works end-to-end (newly added)
- [ ] Test all RBAC permission toggles (especially student report view + download)
- [x] `SignaturesPage` removed (v32.75)
- [ ] Test student deletion interlock end-to-end (fee payments + published cards checks)
- [ ] Investigate whether `public.profiles` table should stay empty or be populated; it controls `auth_role()` used in fee-related RLS policies — currently all fee ops must go through `supabaseSrv`
- [ ] Add `plan` column to `schools` table if not already present (used by `db.updateSchoolPlan()`)
- [ ] Teacher password reset: currently sends to `teacher.email` — verify every teacher record has a valid email before relying on this in production
- [x] Email corrections: Nursery ✓, JS ✓ (52 updated), SS ✓ (41 updated) — 5 Jun 2026
- [ ] Primary section email corrections — awaiting file from school
- [x] Mark RGS/500 (Bassey Elijah) + RGS/490 (Gift Udeogu) as `left` — done 5 Jun 2026
- [ ] After next bulk email: cross-reference new bounce report against 13 still-unresolved students (6 JS + 7 SS)
- [x] Notification event hooks — Tier A complete (v32.75): role change, failed logins, PIN change, refund, large payment, report publish, access request. Tier B/C (scheduled digest) complete (v32.78): `scheduled-digest` edge function deployed, pg_cron job `scheduled-digest-hourly` runs every hour, settings UI in Notifications tab.
- [x] Cross-chunk free-variable audit complete (v32.77) — all 19 page files clean. RBAC constants anchored in AppDemo.jsx.
- [ ] Timetable: admin class grid uses current session/term — add session/term selector to view historical timetables
- [x] **pages/ migration fully complete** — all components migrated, orphaned code removed. AppDemo.jsx 28k→5.3k lines (81% reduction).
  - MyProfilePage → pages/members.jsx
  - SectionsPage → pages/classes.jsx
  - ResultApprovalsPage → pages/results.jsx
- [ ] Force-change-password flow after password reset (currently just sends temp password with no enforcement)

---

## Deployment Checklist

```bash
# Always do before pushing:
npm run build      # must pass with zero errors (esbuild treats duplicate CSS keys as errors)
git add src/AppDemo.jsx src/supabaseClient.js
git commit -m "..."
git push           # triggers Vercel auto-deploy
```

Vercel uses `npm run build:web` (set in vercel.json). Both `package.json` and `package-lock.json` must be committed — Vercel runs `npm ci` from the lockfile.

---

## Supabase MCP

Available in this session as `mcp__8c361969...`. Use it to:
- `execute_sql` — run queries / inspect schema
- `apply_migration` — apply named SQL migrations
- `get_logs` — check edge function errors

Project ref: `mcdcwdfdpqzrzsixmrcg`
