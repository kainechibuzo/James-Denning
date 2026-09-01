# JAMES-DENNING — Project Notes
_Last updated: 1 Sep 2026 — Phase 6: landing page + email login + business picker (v32.94)_

---

## Rebrand and Workspace Profiles (20 Aug 2026)

The product identity is now **JAMES-DENNING — Business Operations Platform**. The default
presentation is business-neutral and uses a monochrome charcoal design system. The existing
Supabase schema remains unchanged: legacy school-compatible table names, column names, route IDs,
role values, and tenant data are intentionally preserved for backwards compatibility.

### Product layer

- `src/config/product.js` contains the product identity, industry choices, business terminology,
  and optional Education navigation labels.
- `src/config/theme.js` contains the monochrome light/dark tokens. Existing token names remain
  available so the feature pages do not need a risky visual rewrite.
- `src/contexts/section.jsx` loads `workspace_type` and `education_module_enabled` from the
  existing `school_settings` table and exposes the active terminology to the app shell.
- Admin → Settings → Workspace lets an organization choose General business, Professional
  services, Retail and commerce, Nonprofit, Health and wellness, Education, or Other.
- Business is the default. Enabling Education restores academic labels/navigation while keeping
  the same database and all existing workflows.

### Branding/assets

- Default web/mobile identity: JAMES-DENNING with a monochrome JD mark.
- Assets: `public/jd-mark.svg`, `public/jd-logo.svg`, regenerated PWA icons, and Capacitor assets.
- The legacy Apex logo is no longer referenced.
- `mobile.html` was added to satisfy `vite.mobile.config.js` and make the dedicated mobile build
  reproducible.
- The current deployment host remains `portal.renaissancegardenschools.com` until a new public
  domain is selected; this is a deployment compatibility detail, not the product name.

### Registration reliability fix

The public organization-registration flow now invokes the canonical `manage-account` Edge Function
first and falls back to the legacy `clever-processor` slug only when the canonical function is
absent. Function errors now surface the server's actual message instead of only showing the generic
Supabase non-2xx error. `supabase/config.toml` disables JWT verification at the function boundary
because only the `register_school` action is public; every other account-management action still
verifies the caller inside the function. New organizations seed their identity, workspace type, and
Education-module settings server-side with the service-role client before the success response.

---

## Recent Changes (1 Sep 2026) — CI/CD: auto deploy migrations + functions

**`.github/workflows/deploy.yml`** ("Supabase Deploy") — applies Supabase
migrations and redeploys edge functions automatically. Triggers on pushes to
`master` touching `supabase/**` (migrations, functions, config) or the workflow
file, plus manual `workflow_dispatch`. Steps: `supabase link --project-ref
mcdcwdfdpqzrzsixmrcg` → `supabase db push` (only unapplied migrations) →
`supabase functions deploy` (all 5 functions; per-function `verify_jwt` from
`config.toml`, e.g. `manage-account` is `false`). Requires repo secrets
`SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD`. Once live, prefer it over
the SQL editor for migrations so remote history stays consistent.

---

## Recent Changes (1 Sep 2026) — v32.94 Phase 6: Landing page + Email Auth + Business Picker

### Public landing page

- `src/pages/landing.jsx` (`LandingPage`) — business-neutral marketing page: sticky nav
  (Features, How it works, Log in), hero ("One calm workspace for running your organization"),
  8 feature cards (workspace, CRM, projects, invoices, hiring landing pages, quota tracking,
  communication, multi-business), 3-step how-it-works, dark CTA band, footer. All CTAs point
  to `/app`; if a session exists the button reads "Open my workspace".
- Routing: `App()` in AppDemo.jsx renders `LandingPage` for `/` (and empty path) — same SPA
  pathname pattern as `/apply/`; everything else (`/app`, …) renders the application.
  `public/manifest.json` `start_url` moved to `/app` so installed PWAs skip the landing page.

### Email-first auth + business picker

- `src/pages/auth.jsx` (`EmailAuthPage`) — log in with **one email + password**; then see
  **every business you can manage** and pick one:
  1. `db.loginLookupByEmail(email)` → RPC `login_lookup_by_email` (migration
     `019_email_login.sql`, NOT yet applied) — unions `schools.admin_email`, `teachers.email`,
     `students.email`, returning per match: school_id, school_name, role, display_name,
     local_id, and the **deterministic synthetic auth email** (identical logic to the client's
     `syntheticEmail` and the manage-account edge function: admin → real admin_email;
     teacher → `staff-<clean>--<schoolId>@login.internal`; student →
     `student-<clean>--<schoolId>@login.internal`).
  2. The client tries `supabase.auth.signInWithPassword` per identity (same password) until
     one succeeds — real Supabase Auth, no client-side password handling.
  3. Business picker: cards with org name + role badge (Admin/Staff/Member); deduped per
     school with priority admin > teacher > student; auto-enters when there's exactly one.
  4. Picking re-authenticates that identity if needed, runs the same checks as `authLogin`
     (student status messages, login-disabled settings), then
     `onLoginSuccess(user, school)` in AppDemo sets the selected school + session (no reload).
- Classic flow intact: "Use organization + ID login" link switches `authMode` to `"classic"`
  (SchoolSelectPage → LoginPage); "Register a new organization" switches to classic and opens
  the OrgSignupModal. Platform Admin login still on the classic screen.
- Graceful fallback: if migration 019 hasn't been applied, email login shows a message and
  points to the classic login.

### Migration `supabase/migrations/019_email_login.sql` (NOT yet applied)

- `login_lookup_by_email(p_email text)` — SECURITY DEFINER, `language sql stable`; returns the
  union above; `revoke all … from public; grant execute to anon, authenticated` (999c pattern).
  No tables, no changes to existing objects.

---

## Recent Changes (1 Sep 2026) — v32.93 Phase 5: General-purpose Business Dashboard

The product is now a **business-first dashboard for all business types** by default.

### Defaults flip

- `education_module_enabled` now defaults to **false** (was true). Existing education tenants
  keep their data — they simply see the neutral business shell until they re-enable the
  education module in Settings → Workspace Profile (toggle now off by default, matching the
  new default). `settings.jsx` reads `=== "true"` for the toggle; `section.jsx` defaults to
  `false`.

### Business-first navigation

- Business mode (the default) hides school-specific items via the `eduOnly` set in
  `AppDemo.jsx`: `classes`, `subjects`, `sections`, `timetable`, `broadsheet`, `assignments`,
  `results`, `report-cards`, `transcript`, `academic-summary`, `report-card-settings`,
  `grading`, `attendance`, `my-classes`, `results-teach`, `my-results`, `my-bill`.
- The nav is now a general-purpose business workspace: Overview, Team, People, Billing,
  Communication, Hiring, Administration (+ new Customers/Projects/Invoices).
- Education mode (opt-in) restores the full academic nav via `EDUCATION_NAV_LABELS`.

### New general-purpose modules — migration `supabase/migrations/018_business_modules.sql` (NOT yet applied)

Purely additive; school-scoped RLS (`school_id = auth_school_id()`), same 999b pattern (not FORCE):

- `customers` — CRM: name, kind (`contact`|`company`), email, phone, company, status
  (`active`|`lead`|`inactive`), notes
- `projects` — name, description, status (`active`|`paused`|`completed`|`archived`),
  `customer_id` FK, start/end dates
- `project_tasks` — project_id FK, title, description, status
  (`todo`|`in_progress`|`done`|`blocked`), due date
- `invoices` — number, customer_id FK, status (`draft`|`sent`|`paid`|`overdue`|`cancelled`),
  issue/due dates, total, notes
- `invoice_items` — invoice_id FK, description, quantity, unit_price, amount

New pages in `src/pages/business.jsx` (`CustomersPage`, `ProjectsPage`, `InvoicesPage`), nav
routes `customers`/`projects`/`invoices` under Administration, `db.*` methods:
`getCustomers`/`upsertCustomer`/`deleteCustomer`, `getProjects`/`upsertProject`/`deleteProject`,
`getProjectTasks`/`upsertProjectTask`/`deleteProjectTask`,
`getInvoices`/`getInvoice`/`upsertInvoice`/`deleteInvoice`, `upsertInvoiceItem`/`deleteInvoiceItem`.

### Guarantees

Zero behavior change for existing tenants (education data intact, hidden until opt-in);
hiring Phases 1–3 unchanged; all existing routes/tables stay; three builds pass.

---

## Recent Changes (1 Sep 2026) — v32.92 Hiring Phases 2–3: postings + landing pages + applications + quota

The **push-model hiring loop** is now implemented end-to-end: org owner posts a role →
JAMES-DENNING auto-generates a mobile-first, shareable landing page at `/apply/<slug>` (the
ad-click destination) → applicants submit qualifications + asking price → owner reviews and
negotiates over a private thread → on hire, the owner defines the quota metric and tracking
starts; once hired the thread becomes the internal chat.

### Public landing pages (the differentiator)

- `PublicHireLanding` (in `src/pages/hiring.jsx`): rendered by `App()` in `AppDemo.jsx` whenever
  `window.location.pathname` starts with `/apply/` — no router, no portal shell, no auth. The
  existing Vite SPA build + Vercel rewrite serve it, so there is no build-config change.
- Role page: org name header, title, price-range chip, description, goals & expectations,
  mobile-first apply form (name/email/phone/qualifications/asking price + note). Success state
  shows the applicant's **private thread link** (`/apply/<slug>?t=<token>`) with a copy button,
  and a confirmation email is sent via the existing `sendPortalEmail` path.
- Thread view (`?t=<token>`): status badge, negotiation chat, 15s polling. The token is a
  48-hex-char bearer token (`gen_random_bytes(24)`) — unguessable, no accounts needed.

### Public access model — anon gets RPCs only, never tables

Migration `supabase/migrations/017_hiring_roles.sql` (NOT yet applied; purely additive):

- Tables (all `school_id`, RLS enabled + policy `school_id = auth_school_id()`, same as 999b — **not FORCE**, because the public SECURITY DEFINER RPCs need the owner-bypass the 999c functions rely on):
  - `hiring_roles` — title, summary, description, expectations, price_min/max numeric(14,2),
    price_note, `status` active|paused|closed, `is_published` (landing page live flag),
    unique `slug` (the public URL slug)
  - `hiring_applications` — applicant name/email/phone, qualifications, asking_price,
    `status` new|reviewing|negotiating|hired|rejected|closed, unique `access_token`;
    FK to role is `on delete restrict` (role delete blocked once applications exist)
  - `hiring_messages` — `sender` owner|applicant, sender_name, body
  - `hires` — hire_name, contact_email, `status` active|ended, and the **owner-defined quota**:
    `quota_metric`, `quota_unit`, `quota_target`, `quota_period`
    weekly|monthly|quarterly|custom, `quota_measure_method` (owner's own words),
    `quota_start`/`quota_end` for custom periods
  - `hire_quota_entries` — value, note, recorded_by, recorded_at
- 4 SECURITY DEFINER RPCs (revoke all, grant execute to anon + authenticated — the `999c`
  pattern):
  - `hiring_public_role(p_slug)` → published + active role joined with org name
  - `hiring_public_submit_application(p_slug, p_name, p_email, p_phone, p_qualifications,
    p_asking_price, p_price_note)` → validates, inserts the application + token, and inserts an
    in-app notification (`recipient_id 'admin'`, `event_type 'hiring_application'`,
    `link_page 'hiring'`) via the existing `notifications` table
  - `hiring_get_thread(p_token)` → application + role + messages jsonb
  - `hiring_post_message(p_token, p_sender_name, p_body)` → applicant reply

### Admin UI — `HiringPage` (nav route `hiring`, Administration, admin)

- Roles tab: create/edit (title, pitch, description, expectations, price range + note), slug
  auto-generated and de-duplicated; publish/unpublish toggles the landing page; copy-link and
  open-landing actions; close (landing goes offline) and delete (**interlocked**: cannot delete a
  role with applications — close instead; DB `on delete restrict` backs this up).
- Applications tab: status flow new → reviewing → negotiating → hired/rejected/closed, applicant
  details (email/phone/asking price/qualifications) and the negotiation thread (owner replies
  right/blue, applicant left). New-application email alerts batch via `db.sendAdminAlert` +
  `buildAlertEmail` with the `hiring_alerted_upto` high-water mark in `school_settings` — the
  existing ZeptoMail/SES path, no second notification system.
- Hires & Quota tab: hire modal is where the owner defines the metric/unit/target/period and how
  it is measured; hire detail shows the quota definition, a **descriptive-only** progress bar
  ("At 60% of quota — 24 of 40 tickets logged"), a progress log, and the internal chat that
  continues the negotiation thread. End-hire keeps history. No payout math anywhere.
- Tool gating: orgs whose preset disabled `hiring` see a banner with an Enable button
  (`org_tools`).
- Refresh model: 30s polling for open modals + hires tab; applicant thread polls at 15s.

### Client API (`src/supabaseClient.js`)

`getHiringRoles`, `upsertHiringRole`, `deleteHiringRole`, `getHiringRolesWithCounts`,
`getHiringApplications` (joins role), `getHiringApplication`, `setHiringApplicationStatus`,
`addHiringMessage`, `getHiringMessages`, `createHire` (inserts hire + flips app to `hired`),
`getHires`, `getHire` (joins role + application), `updateHire`, `addHireQuotaEntry`,
`getHireQuotaEntries`, `deleteHireQuotaEntry`, `hiringRoleUrl`, and RPC wrappers
`publicGetRoleBySlug`, `publicSubmitApplication`, `publicGetThread`, `publicPostMessage`.

### Scope guards (unchanged)

No page builder, no ad-buying/targeting/tracking integration, no payroll/payout calculation —
the org owner runs their own ads and pays their hire outside the platform. Monetization for JD
is Phase 4 (subscription) — not started.

---

## Recent Changes (1 Sep 2026) — v32.91 Hiring Phase 1: org creation + presets

The first phase of the **hiring feature area** (push-style hiring — org posts a role, the platform
generates a shareable ad-destination landing page; Phases 2+ build postings/landing pages, chat,
and quota tracking). Phase 1 is org creation with business-type presets only — **no hiring,
no payment, no landing pages yet**.

### Schema — migration `supabase/migrations/016_org_presets.sql` (NOT yet applied)

- `org_presets` — platform-seeded preset catalog (`key`, `name`, `description`, `modules_json`,
  `settings_seed`). Readable by anon + authenticated (registration needs it pre-auth); writes are
  service-role only. Seeded with 2 presets: `general_business` and `dev_shop` (dev shop adds
  `quotas` tool). Future presets are data additions, not code.
- `schools` — two additive nullable columns: `preset_key`, `onboarding_step`. **Existing rows
  (preset_key NULL) are untouched — zero behavior change for classic tenants.** No defaults,
  no triggers, no policy changes on existing tables.
- `org_submissions` — one row per registered org (org_name, contact, preset_key, status),
  school-scoped RLS (`FORCE ROW LEVEL SECURITY` + `auth_school_id()`), same as the live 999b
  pattern. Anon cannot insert (registration writes happen server-side in the edge function).
- `org_tools` — per-org tool toggles seeded from the preset's `modules_json`
  (`unique (school_id, tool_key)`), school-scoped RLS. `db.setOrgTool` upserts on
  `onConflict:'school_id,tool_key'` (plain-column unique constraint — matches the
  `school_settings` lesson from 001b).

### Server-side registration (`manage-account` edge function)

`register_school` now accepts `presetKey`; validates it against `org_presets` (400 on unknown key,
before creating anything), stamps `schools.preset_key` + `onboarding_step='complete'`, seeds the
preset's `settings_seed` rows into `school_settings`, inserts the `org_submissions` row, and seeds
`org_tools` — all with the service-role client (same reasoning as the existing school_settings
seeding: the browser is unauthenticated at that point). **The edge function must be redeployed for
preset seeding to take effect; until then registrations fall back to classic (preset-less) orgs —
existing behavior, no breakage.**

### Frontend

- **New `src/pages/hiring.jsx`** (hiring domain) exporting:
  - `OrgPresetSelectPage` — nav route `org-create` (admin-only, under Administration). Preset
    card grid; choosing one goes to `org-create-details` via the `ctx.pageParam` channel.
  - `OrgCreatePage` — nav route `org-create-details`; org form bound to the chosen preset;
    success → `clearSession()` + `clearSelectedSchool()` + reload (lands on school-select so the
    new admin signs in to the fresh org).
  - `OrgSignupModal` — pre-auth two-step modal (preset → details) that **replaces the old
    `SchoolSignupModal` in AppDemo.jsx** (both call sites: SchoolSelectPage + PlatformDashboard
    "Add School").
  - `TOOL_LABELS` map — presentation labels for tool keys (`core`, `people`, `billing`, `comms`,
    `performance`, `hiring`, `quotas`, `education`).
- `src/supabaseClient.js` — new `db.*` methods: `getOrgPresets()` (global catalog — no school_id
  column, pre-auth safe), `getOrgSubmission()`, `getOrgTools()`, `setOrgTool(key, enabled)`
  (all `supabaseSrv` + `_schoolId`-filtered). `createSchoolSignup` now forwards `preset_key`.
- AppDemo.jsx shell changes are the standard three: import, `ALL_NAV` entry, two render lines.

### Guards honored

- No page builder, no ad platform, no payroll/tax/payout logic anywhere in Phase 1.
- Business-neutral copy; legacy DB names untouched.
- All three builds pass (`npm run build`, `build:web`, `build:mobile`).

---

## Recent Changes (16 Jul 2026) — Partial/unpaid row highlighting in the item-analysis PDF

Follow-up to the on-screen highlighting added earlier today: the same orange/red row tinting
now also appears in the generated **item-analysis PDF** (the "PDF" button in Statistics → Items).

- Added `tr.row-partial td{background:#fef3c7!important}` /
  `tr.row-unpaid td{background:#fee2e2!important}` to `pdfWrap`'s stylesheet, next to the
  existing `.badge-*` rules. Needed `!important` + a `td`-level selector because the print CSS
  already sets `tbody tr:nth-child(even) td{background:#f8fafc}` — a background set on the `tr`
  alone would be painted over by that rule on even rows.
- Each row in the item-analysis table now gets `class="row-partial"` / `class="row-unpaid"`
  (or none) based on `r.billStatus`.

**Verification note:** clicking the actual "PDF" button in the sandbox reliably hung the
preview browser-automation tooling (looks like a `window.open`/print-dialog interaction the
headless remote can't resolve) — confirmed this is an automation-environment limitation, not a
functional bug, by reproducing it twice. Verified correctness instead by (a) running the exact
row-template logic in Node with paid/partial/unpaid sample rows and confirming the right
`class="row-partial"` / `class="row-unpaid"` / `class=""` output, and (b) reusing the identical
`!important`/class-override CSS pattern already proven in this file's `.badge-*` rules.
**Recommend a manual click-through in the real browser once deployed**, since this path wasn't
eyeballed live.

---

## Recent Changes (16 Jul 2026) — Items tab: checkbox status filter + orange/red row highlighting

**Ask:** select more than one status at once (was a single-select dropdown), and highlight
partial-owing rows in orange, full-owing (unpaid) rows in red.

- New `StatusMultiSelect` component (src/pages/fees.jsx, defined just above `BillDetailModal`) —
  a button that opens a checkbox dropdown (Fully Paid / Partial / Unpaid / Not Billed), each
  checkbox tinted its status color, with a "N statuses selected" label and a Clear link.
- `itemStatusFilter` changed from a string to a `Set` — both filter predicates (flat table +
  grouped-by-class table) updated to `itemStatusFilter.size>0 && itemStatusFilter.has(status)`.
  All existing reset call-sites (switching item/search) updated to `new Set()`.
- New `rowBg(r,i)` helper: partial rows get a translucent amber background
  (`${C.amber}18`), unpaid rows a translucent red (`${C.red}18`); paid/not-billed rows keep the
  normal zebra striping. Applied to both item-view tables.

**Verified in the sandbox:** seeded one paid, one partial, one unpaid bill for the same item;
confirmed via computed style that partial/unpaid rows render the correct tinted
`rgba(...)` backgrounds, and that selecting "Partial" + "Unpaid" together in the new checkbox
dropdown correctly filters to just those two rows. Cleaned up test data after.

---

## Recent Changes (15 Jul 2026) — Fee Statistics: Not Billed bucket, item-list fix, Privacy Mode

### 1. "Not billed" students were invisible in the Items tab (src/pages/fees.jsx, FeeStatisticsPage)

**Bug reported:** selecting a fee item under Statistics → Items only ever showed students who
had a bill containing that item (paid/partial/unpaid) — students who were never billed for it
at all were silently omitted, with no way to see who was missing.

**Fix:** compute the full active-student population (same section/class scoping as the rest of
the page) and diff it against who's actually billed for the selected item. Anyone left over is
added as a **`not_billed`** row — a new 4th status alongside paid/partial/unpaid, shown with:
- a **"Not Billed"** stat tile in the summary bar,
- a **"Not Billed"** option in the status filter dropdown,
- a grey **"Not Billed"** badge (distinct from red "Unpaid" so the two are never confused),
- `—` in place of ₦0 for the money columns (a real zero vs. "never billed" look identical
  otherwise),
- included in the CSV export and the item-analysis PDF, and the per-class "billed vs not billed"
  header counts.
Collection-rate math (`clsRate`, `iRate`) still divides by **billed** students only — not-billed
students don't get folded into that stat, since it isn't meaningful for someone never billed.

### 2. Root cause of a related, worse bug: items disappearing entirely from the picker

While testing #1 in the sandbox, discovered the Items dropdown was **also** silently hiding
entire fee items — not just the students. `allItems` required an item's name to exist in the
site-wide `fee_items` master list before it would even appear as a selectable item. Real bills
routinely include **one-off/custom items** (e.g. "Additional payment on graduation", "Uniform",
"Labcoat") that were never added to that master list — confirmed **22 such item names in RGS's
live billing data** that would never have shown up in this view at all.

**Fix:** `allItems` is now derived purely from `usedNames` (what's actually on bills this
period) — the master-list intersection was removed entirely. The master `fee_items` table's
role is template/config for Bill Generation, not a gate on what's visible in Statistics.

**Also fixed while there:** `db.getFeeItems()` had **no `school_id` filter at all** — every
school's fee item names were being fetched together, a real multi-tenant leak (used only for
this intersection, but worth fixing regardless of #2 making the intersection moot).

**Verified in the sandbox:** seeded a bill with a custom item ("Excursion Fee") for one student
in a 2-student class; before the fix the item didn't appear in the picker at all; after, it
shows correctly with 1 Fully Paid / 5 Not Billed, and the classmate shows "Not Billed" with `—`
across the money columns. Cleaned up after.

### 3. Privacy Mode for generated reports (src/pages/fees.jsx)

**Ask:** some Fee Statistics reports get handed to non-essential staff — fees and figures need
to stay private in that case.

**Fix:** a **Privacy Mode** toggle (🔒/🔓) in the Fee Statistics header, off by default each
session (a deliberate per-use choice, not a silent default). All ~14 report generators funnel
through one shared `pdfWrap()` function, so masking is applied there in a single place: any
`₦<digits>` text (the exact, distinctive output of the `fmt()` currency formatter) is replaced
with `₦•••••` before the report HTML is rendered — verified via regex test that this only ever
touches currency text, never CSS/layout (e.g. `width:100%` is untouched). When active, the PDF's
print bar and cover page both show a **"🔒 Privacy Mode"** indicator so recipients know figures
are intentionally hidden, not missing/broken. The item-analysis CSV export is masked the same
way. Names, classes, statuses, and student counts remain visible — only ₦ amounts are hidden.

**Scope note:** percentages (e.g. "72% collected") are intentionally left unmasked — masking
them safely would require touching each of the 14 generators individually (a blind regex on
"NN%" risks corrupting inline CSS like `width:100%`), so this was left out rather than done
riskily. Flagged as a possible future extension if needed.

---

## Recent Changes (12 Jul 2026) — Dashboard health-check "Fix →" now filters, not just navigates

**Bug reported:** the "1 active student has no email address" health check's **Fix →** button
just did `setPage("students")` — dumped the admin on the full unfiltered student list with no
indication of who was missing an email.

**Fix — a small generic `pageParam` channel, not a one-off hack:**
- `AppInner` (AppDemo.jsx) gained `pageParam`/`setPageParam` state, exposed via `ctx`. Any
  page can set `{filter:...}` alongside a `setPage(...)` navigation; the target page reads it
  once (via a `useEffect` keyed on `pageParam`) and clears it, so it never "sticks" on a later
  unrelated visit.
- Dashboard's `students_no_email` health check now carries `param:{filter:"no_email"}`; the
  "Fix →" button calls `setPageParam(h.param)` before `setPage(h.page)`.
- `StudentsPage` consumes it: adds a `noEmailOnly` filter (active students with no email),
  wired into the existing `filtered` memo, `Clear` button, and page-reset effect. Renders an
  amber banner while active — *"Showing only active students with no email address — from the
  dashboard health check"* with a **Show all students** link — so the filter is never silent.

**Verified in the sandbox:** clicking Fix → landed on Students with the banner shown and all
6 (email-less) sandbox students listed; "Show all students" correctly cleared it. No console
errors.

**Reusable pattern:** any other health check that deep-links to a page can now pass a `param`
the same way — worth doing for `noFormTeacher`/`noSubjects` if they get the same complaint.

---

## How to Use This File

Read **`CLAUDE.md`** first (code rules + pitfalls), then this file (full product reference).
Together they replace reading any code to get up to speed.

## Documentation Rule

**Every code change must be documented before the session ends:**
- Add an entry to the "Recent Changes" section below (date + what changed + why)
- Update any affected section in this file (schema, feature list, interlock table, known issues, TODOs)
- Update the `_Last updated` date at the top of this file and `CLAUDE.md`

---

## Project Overview

**JAMES-DENNING** business operations platform — manages people, staff, performance records, billing, attendance, reports, and communications.

| | |
|---|---|
| **Live URL** | https://portal.renaissancegardenschools.com |
| **GitHub** | https://github.com/Ossytrikz/RGS-PORTAL (private) |
| **Auto-deploy** | Push to `master` → Vercel builds & deploys automatically |
| **Build command (Vercel)** | `npm run build:web` |
| **Android build** | `npm run build` then `npx cap sync android` |
| **Supabase project** | `mcdcwdfdpqzrzsixmrcg` |
| **Supabase URL** | `https://mcdcwdfdpqzrzsixmrcg.supabase.co` |
| **Supabase region** | `eu-north-1` (Europe – Stockholm) |

---

## Service Accounts

| Service | Account / Detail |
|---|---|
| Supabase | Project ID `mcdcwdfdpqzrzsixmrcg` |
| Vercel | Connected to GitHub repo, auto-deploys `master` |
| GitHub | `Ossytrikz/RGS-PORTAL` (private) |
| Namecheap | Domain: `renaissancegardenschools.com` |
| AWS | IAM user `rgs-portal-ses`, region `eu-north-1` |
| ZeptoMail | Primary transactional email (API key in Supabase secrets) |
| Zoho Mail | `info@renaissancegardenschools.com` |
| Paystack | Live key in Vercel env var `VITE_PAYSTACK_PUBLIC_KEY` |

---

## DNS Configuration (Namecheap BasicDNS)

### Vercel (portal)
| Type | Host | Value |
|------|------|-------|
| A | `@` | `76.76.21.21` |
| CNAME | `www` | `cname.vercel-dns.com` |

### AWS SES DKIM Records
| Type | Host | Value |
|------|------|-------|
| CNAME | `joq3hzf5fte73yr733kr4p4pso4m2x3s._domainkey` | `joq3hzf5fte73yr733kr4p4pso4m2x3s.dkim.amazonses.com` |
| CNAME | `5idrxuu25wdrny6yo6tznv64gtdzjhlp._domainkey` | `5idrxuu25wdrny6yo6tznv64gtdzjhlp.dkim.amazonses.com` |
| CNAME | `raqrrsk4alhugtkwmc3dnvfnphajzvai._domainkey` | `raqrrsk4alhugtkwmc3dnvfnphajzvai.dkim.amazonses.com` |

### Zoho Mail (standard MX records — already configured)

---

## Supabase Edge Function Secrets

All set in: Supabase Dashboard → Project → Settings → Edge Functions → Secrets

| Secret | Value / Status |
|---|---|
| `ZEPTO_API_KEY` | ZeptoMail API key ✅ |
| `AWS_ACCESS_KEY_ID` | IAM user `rgs-portal-ses` ✅ ⚠️ rotate recommended |
| `AWS_SECRET_ACCESS_KEY` | IAM user `rgs-portal-ses` ✅ ⚠️ rotate recommended |
| `AWS_REGION` | `eu-north-1` ✅ |
| `SES_FROM_EMAIL` | `noreply@renaissancegardenschools.com` ✅ |
| `SUPABASE_URL` | ✅ |
| `SUPABASE_ANON_KEY` | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ |
| `SUPABASE_DB_URL` | ✅ |

---

## Email System

- **Edge function:** `supabase/functions/send-email/index.ts`
- **Primary:** ZeptoMail (API key → `ZEPTO_API_KEY`)
- **Fallback:** AWS SES with SigV4 signing (no SDK required)
- **Sender address:** `noreply@renaissancegardenschools.com`
- **AWS SES status:** Sandbox (production access requested 14 Mar 2026 — verify if approved)
- **Capabilities:** HTML body + base64 PDF attachments

### How it works
The portal calls the edge function with:
```json
{
  "to": "parent@example.com",
  "subject": "Subject line",
  "html": "<p>Email body HTML</p>",
  "attachments": [{ "name": "report.pdf", "content": "<base64>" }]
}
```
ZeptoMail is tried first. If it fails (e.g. API key invalid), SES is used as fallback.

### SES Sandbox Warning
Until production access is approved, emails only go to verified addresses. Once approved, bulk emails to any address are supported.

---

## RBAC System

### Roles

| Role | Source | Notes |
|---|---|---|
| Admin | Special flag (not in `teachers.role`) | Always full access; `canAccess()` always returns `true` |
| Teacher | `teachers.role = 'teacher'` | Default role for all staff accounts |
| Manager | `teachers.role = 'manager'` | Finance/approvals; was previously called "Bursar" |
| Student | `students` table | No role change allowed |

There is no Parent role (removed). Students are always students.

Teachers can be promoted to Manager via Members page → ⋮ menu → "Change to Manager".

### `canAccess(permId)` — evaluation order
1. Admin → always `true`
2. `user_permissions` table — per-user override
3. `role_permissions` table — per-role setting
4. `PERM_ROLE_DEFAULTS[role]` — hardcoded fallback defaults
5. `ALL_NAV` entry — if role is listed in `n.roles`, allow

**Permission ID format:** always `"page:page-id"` or `"action:action_name"`. The function automatically prefixes bare IDs with `"page:"`.

### Known action permission IDs
```
action:edit_students       — edit student profiles
action:publish_results     — publish report cards
action:approve_ma          — give Manager Approval
action:approve_ea          — give Educator Approval
action:download_reports    — download PDF reports
action:manage_attendance   — manage attendance records
action:send_email          — send emails from the portal
page:mail-logs             — view email send logs
```

### RBAC DB Tables
| Table | Purpose |
|---|---|
| `role_permissions(role, page_id, allowed)` | Per-role on/off switch |
| `user_permissions(user_id, page_id, allowed)` | Per-user override |
| `permission_audit_log` | Every permission change logged |
| `school_settings` key `permission_templates` | JSON templates for bulk permission sets |

---

## Feature Modules

| Module | Page IDs | Roles | Notes |
|---|---|---|---|
| Dashboard | `dashboard` | All | Role-specific stats cards |
| Members | `members` | Admin, Manager | Staff list, last login, role change |
| Students | `students`, `approvals` | Admin, Manager | Bulk ops, duplicate detection, onboarding email |
| Teachers | `teachers` | Admin | CRUD, class assignment |
| Report Cards | `report-cards`, `my-results` | Admin / Student | Publish flow, PDF gen, email to parent |
| Results (Admin) | `results-admin` | Admin | View/edit all results |
| Results (Teacher) | `results-teach` | Teacher | Upload via XLS, score entry |
| Result Approvals | `result-approvals` | Admin, Manager | EA/MA two-step approval workflow |
| Fees (Admin) | `fee-items`, `fee-templates`, `fee-generate`, `fee-tracker`, `fee-stats` | Admin, Manager | Full fee lifecycle |
| Fees (Student) | `my-bill`, `my-payments` | Student | View bill, pay via Paystack |
| Attendance | `attendance` | Teacher | Daily attendance records |
| Announcements | `announce` | All | Read-only for students |
| Email | `mail-compose`, `mail-logs` | Admin | ZeptoMail via edge function |
| Transcript | `transcript` | Admin, Student | PDF generation |
| Settings | `settings` | Admin | Tabs: School Info, Sessions/Terms, Academic, Security, Portal, Permissions |
| Grading | `grading` | Admin | Grade schema + CAE traits |
| Audit Log | `audit-log` | Admin | Admin action history |
| Signatures | `signatures` | Admin | Upload/manage signature images for report cards |
| Report Templates | `report-templates` | Admin | Saved report card configurations |

---

## Result Upload System (XLS)

Teachers download a class-specific XLS template and upload it with scores.

### Template generation
- Admin/teacher selects a class (or whole section)
- Template is generated per-class from `db.getStudents(null, {class_id: cls.id})`
- Only students assigned to that specific class are included
- Subjects come from `class_subjects` → `section_subjects` for that class only

### Upload processing (`saveBulkResults`)
1. Parse XLS file — one sheet per class
2. Per sheet: fetch students for that class from DB (`db.getStudents(null, {class_id: sheet.classId})`)
3. Match student rows by ID: `String(s.id) === String(row.stuId)` (handles integer vs string)
4. Deduplicate rows using plain object keyed on `student_id|subject_id` (last value wins)
5. Duplicate rows are treated as **warnings** (amber notices), not errors
6. Zero scores are valid and saved (not skipped)
7. Upsert to `portal_results` with conflict resolution on `(student_id, class_id, subject_id, term_id, session_id)`

### Common pitfalls
- **Ghost class_subjects:** If a class has stale `class_subjects` assignments (e.g. from a bad migration), wrong subjects appear in the template and upload to wrong subject IDs. Fix: delete ghost rows from `class_subjects` and re-upload.
- **Supabase 1000-row cap:** `getResults()` and `getResultsCompleteness()` paginate in batches of 1000 to handle large classes.
- **`Map` shadowed by Lucide icon:** Lucide exports a `Map` icon — using `new Map()` in a component scope fails. Use plain object `{}` instead for deduplication.

---

## Report Card PDF System

- **`openReportCardPrintWindow(...)`** — builds full HTML, opens in new browser tab for print/save-as-PDF
- For email/storage: viewport `width=device-width` + JS scaler (zooms down on narrow screens, never up)
- **`generateOnePDF(student)`** reads publish options from `publishInfo` (DB) not `pubOptions` (UI state)
- **Storage bucket:** `report-cards` (private, 7-day signed URLs)
- **Auto-cleanup:** `pg_cron` job runs nightly at 2 AM, deletes files older than 7 days

### Report card publish flow
1. Teacher uploads results → Upload Results page
2. System checks completeness (every student has every subject)
3. Form teacher gives **EA (Educator Approval)** → results locked for teacher editing
4. Admin/Manager gives **MA (Manager Approval)** → results fully locked, no one can edit
5. Admin customises report layout (toggles, comments, signatures, template)
6. Admin publishes → students and parents can now view their report cards
7. Admin can unpublish at any time (immediately hides from students)

### `result_approvals` table
Per-class approval record. Columns: `class_id, term_id, session_id, ea_status, ea_approved_by, ea_approved_at, ma_status, ma_approved_by, ma_approved_at`.
Note: there is **no `student_id`** — approvals are class-wide, not per-student.

---

## Fees Module

### Admin pages
| Page | Purpose |
|---|---|
| `fee-items` | Create/edit individual fee line items (compulsory / optional) |
| `fee-templates` | Bundle fee items into templates per class, term, student type |
| `fee-generate` | Bulk generate bills from a template (idempotent — skips existing bills) |
| `fee-tracker` | Track payments, record manual bank transfers, send reminders |
| `fee-stats` | Dashboard: daily inflow chart, collection rate, method breakdown, defaulters |

### Student pages
| Page | Purpose |
|---|---|
| `my-bill` | View bill, opt out of optional items, pay via Paystack |
| `my-payments` | Payment history |

### Fee tables
| Table | Purpose |
|---|---|
| `fee_items` | Individual fee definitions |
| `fee_templates` | Templates per class/term/session |
| `fee_template_items` | Items within a template |
| `fee_bills` | Generated bills per student (has `student_id`, `class_id`, `status`, `amount_paid`) |
| `fee_bill_items` | Line items on a bill |
| `fee_payments` | Actual payments received (`student_id`, `amount`, `is_refunded`) |
| `payments` | Legacy payment table (older records) |

---

## Interlock System

The portal enforces "interlocks" — hard stops that prevent destructive operations when linked data exists. When blocked, users see:

```
🔒 Interlock — Cannot delete "X"
Reason: <specific cause>
Fix: <actionable solution>
```

### Current interlocks

| Action | Hard Block (prevents) | Soft Warn (confirms) |
|---|---|---|
| Delete class | Students enrolled in class | — |
| Delete class | Results exist for class | — |
| Delete class | Published report cards for class | — |
| Remove subject from class | Results exist for that subject+class | — |
| Bulk deselect class subjects | Results exist for that class | — |
| Delete signature | Signature used in a report template | — |
| Delete report template | Template is marked as default | — |
| Delete student (single) | Unrefunded `fee_payments` exist | Result records exist |
| Delete student (single) | Class has published report cards | Legacy payment records |
| Delete students (bulk) | Any selected student has unrefunded payments | Informs how many skipped |
| Delete students (bulk) | Any selected student's class has published cards | Informs how many skipped |

**Bulk delete interlock behaviour:** blocked students are skipped (not deleted); eligible students proceed. If all selected are blocked, the operation is aborted entirely.

---

## Internet Connectivity Overlay

When the browser loses internet connection (`navigator.onLine` / `online` / `offline` events):
- A full-screen blurred overlay appears with a pulsing `WifiOff` icon and "No Internet Connection" message
- All portal functionality is suspended visually
- On reconnect: overlay disappears, a green toast with `Wifi` icon appears for 4 seconds

---

## Inactivity Auto-Logout

`useInactivityTimeout.js` hook — logs user out after a configured period of inactivity.
Timeout duration is configurable in Settings → Security.

---

## DB Schema — Key Tables

```
students
  id (integer PK, also used as admission_number)
  first_name, middle_name, last_name
  class_id (FK → classes)
  status ('active' | 'graduated' | 'withdrawn')
  gender, email, phone, dob, age
  admission_year
  last_login (timestamptz) — ad-hoc migration
  password_hash

teachers
  id (uuid PK)
  staff_id, full_name
  role ('teacher' | 'manager') — ad-hoc migration
  section_id (FK → sections)
  last_login (timestamptz) — ad-hoc migration

sections
  id, name, code (e.g. 'Primary', 'JSS', 'SSS')

classes
  id, name, section_id

class_subjects
  class_id, subject_id (FK → section_subjects)
  ← Links a class to the subjects it studies

section_subjects
  id, name, section_id, order_index

sessions
  id, name, is_active

terms
  id, name, session_id, is_active

portal_results
  student_id, class_id, subject_id, term_id, session_id
  ca_score, exam_score, total_score
  component_scores (JSON)
  UNIQUE (student_id, class_id, subject_id, term_id, session_id)

result_approvals
  class_id, term_id, session_id
  ea_status, ea_approved_by, ea_approved_at, ea_notes
  ma_status, ma_approved_by, ma_approved_at, ma_notes

report_card_publish
  class_id, term_id, session_id
  is_published (boolean)
  published_at, published_by
  show_cae, show_position, show_teacher_comment, show_principal_comment
  show_attendance, show_next_term, show_parent_ack
  class_teacher_comment, principal_comment
  next_term_begins (date)
  teacher_signature_id, principal_signature_id (FK → signatures)
  template_id (FK → report_templates)

signatures
  id, name, role_label, image_url, is_active

report_templates
  id, name, is_default, config (JSON)

fee_bills
  id, student_id (text), class_id, section_id
  template_id, academic_year, term
  total_amount, amount_paid, balance, status
  due_date, generated_by

fee_payments
  id, bill_id, student_id (text)
  amount, payment_method
  paystack_reference, bank_reference
  payment_date, recorded_by, is_refunded

fee_items
  id, name, amount, category, is_compulsory, is_active

fee_templates
  id, name, section_id, class_id, session_id, term_id
  student_type, is_active

attendance_records
  student_id, class_id, date, status ('present'|'absent'|'late')

role_permissions
  role, page_id, allowed (boolean)

user_permissions
  user_id, page_id, allowed (boolean)

permission_audit_log   ← ad-hoc migration
  id, changed_by, target_user, page_id, old_value, new_value, changed_at

school_settings
  key, value (JSON) — stores school name, logo, session/term config, permission templates
```

---

## Applied Migrations

| # | File | Summary |
|---|---|---|
| 001 | `001_school_portal_full_schema.sql` | Full initial schema |
| 002 | `002_add_sections.sql` | Sections support |
| 003 | `003_student_requests.sql` | Student change requests |
| 004 | `004_students_extra_columns.sql` | Extra student fields |
| 005 | `005_report_workflow.sql` | EA/MA approvals, signatures, templates, `report_card_publish` |
| 006 | `006_fix_ea_insert_policy.sql` | RLS policy fix |
| 007 | `007_attendance.sql` | Attendance module |
| 008 | `008_email_system.sql` | Email logs table |
| 009 | `009_feature_additions.sql` | Misc feature additions |
| 010 | `010_fees_module.sql` | Full fees module |
| 011 | `011_refunds.sql` | Payment refunds |
| 012 | `012_discounts.sql` | Fee discounts |
| 013 | `013_fee_audit_log.sql` | Fee audit trail |
| 015 | `015_portal_results_subject_id_not_null.sql` | `portal_results.subject_id` NOT NULL |
| 016 | `016_org_presets.sql` | **Hiring Phase 1 — org_presets, org_submissions, org_tools, schools preset columns (PENDING APPLY)** |
| 017 | `017_hiring_roles.sql` | **Hiring Phases 2–3 — hiring_roles, hiring_applications, hiring_messages, hires, hire_quota_entries + 4 public SECURITY DEFINER RPCs (PENDING APPLY)** |
| 018 | `018_business_modules.sql` | **Phase 5 — customers, projects, project_tasks, invoices, invoice_items (PENDING APPLY)** |
| 019 | `019_email_login.sql` | **Phase 6 — login_lookup_by_email RPC for email login + business picker (PENDING APPLY)** |

**Ad-hoc migrations applied via Supabase MCP (not in migration files):**
- `last_login timestamptz` added to `students` and `teachers`
- `permission_audit_log` table created
- `role text NOT NULL DEFAULT 'teacher'` added to `teachers`

**Hiring Phase 1 tables (migration 016):**
- `org_presets(key unique, name, description, modules_json, settings_seed)` — platform catalog, seeded (`general_business`, `dev_shop`), RLS: public read, service-role write
- `org_submissions(school_id, preset_key, org_name, contact_name, contact_email, phone, status)` — RLS: `school_id = auth_school_id()`, FORCE RLS
- `org_tools(school_id, tool_key, is_enabled, unique(school_id, tool_key))` — RLS: `school_id = auth_school_id()`, FORCE RLS
- `schools.preset_key` + `schools.onboarding_step` — nullable, **NULL for all pre-existing rows (zero behavior change)**

**Hiring Phases 2–3 tables (migration 017):**
- `hiring_roles(school_id, slug unique, title, summary, description, expectations, price_min/max, price_note, status, is_published, created_by)` — RLS `school_id = auth_school_id()`, RLS enabled (999b pattern — not FORCE)
- `hiring_applications(school_id, role_id FK restrict, applicant_name/email/phone, qualifications, asking_price, asking_price_note, status, access_token unique)` — RLS same, RLS enabled (999b pattern — not FORCE)
- `hiring_messages(school_id, application_id FK cascade, sender owner|applicant, sender_name, body)` — RLS same, RLS enabled (999b pattern — not FORCE)
- `hires(school_id, application_id FK cascade, role_id FK restrict, hire_name, contact_email, status, quota_metric, quota_unit, quota_target, quota_period, quota_measure_method, quota_start/end)` — RLS same, RLS enabled (999b pattern — not FORCE)
- `hire_quota_entries(school_id, hire_id FK cascade, value, note, recorded_by)` — RLS same, RLS enabled (999b pattern — not FORCE)
- Public RPCs (security definer, anon + authenticated execute): `hiring_public_role(text)`, `hiring_public_submit_application(text,text,text,text,text,numeric,text)`, `hiring_get_thread(text)`, `hiring_post_message(text,text,text)`

**Phase 5 business-module tables (migration 018):**
- `customers(school_id, name, kind contact|company, email, phone, company, status active|lead|inactive, notes)` — RLS `school_id = auth_school_id()`, RLS enabled (999b pattern — not FORCE)
- `projects(school_id, name, description, status active|paused|completed|archived, customer_id FK set null, start_date, end_date, created_by)` — RLS same
- `project_tasks(school_id, project_id FK cascade, title, description, status todo|in_progress|done|blocked, due_date)` — RLS same
- `invoices(school_id, number, customer_id FK set null, status draft|sent|paid|overdue|cancelled, issue_date, due_date, total, notes)` — RLS same
- `invoice_items(school_id, invoice_id FK cascade, description, quantity, unit_price, amount)` — RLS same

---

## Dashboard Stats (Admin)

| Stat Card | Source | Notes |
|---|---|---|
| Total Students | `students` count where `status='active'` | |
| Total Teachers | `teachers` count | |
| EA Approved | `result_approvals` where `ea_status='approved'` for active term/session | Uses `countEAApprovedActive()` — no row cap |
| Fees Collected | `fee_payments` sum | |

---

## `supabaseClient.js` — Key `db` Methods

```js
// Students
db.getStudents(sectionId, filters)     // filters: {class_id, status, ...}
db.upsertStudent(data)
db.deleteStudent(id)
db.cancelStudentBills(studentId)
db.nextStudentId(prefix)

// Results — fully paginated (batches of 1000)
db.getResults(filters)
db.getResultsCompleteness(filters)
db.upsertResult(data)
db.countResultsByClass(classId)           // COUNT only — no row cap
db.countResultsBySubjectClass(classId, subjectId)

// Approvals
db.getResultApprovals(filters)
db.upsertResultApproval(data)
db.countEAApprovedActive()               // Active term/session EA count

// Report cards
db.getReportPublish(filters)
db.upsertReportPublish(data)

// Fees
db.getFeeBills(filters)
db.getFeeBill(id)
db.upsertFeeBill(data, id)
db.deleteFeeBill(id)
db.checkExistingBill(studentId, academicYear, term)  // service-role check — RLS-safe
db.getFeePayments(filters)
db.insertFeePayment(data)
db.cancelStudentBills(studentId)

// Signatures / Templates
db.getSignatures()
db.upsertSignature(data)
db.deleteSignature(id)
db.getReportTemplates()
db.upsertReportTemplate(data)
db.deleteReportTemplate(id)

// Settings
db.getSchoolSettings()
db.upsertSchoolSetting(key, value)

// Interlock helpers — school-scoped, use supabaseSrv
db.checkDeleteStudent(studentId, classId=null)
  // → { blocks:[{msg,fix}], warnings:[string] }
db.checkDeleteClass(classId)
  // → warnings:[string]
db.checkDeleteTeacher(teacherId)
  // → warnings:[string]
db.checkDeleteSection(sectionId)
  // → warnings:[string]
db.batchCountLinked(table, column, ids, extraFilters={})
  // → number (total count across all IDs, chunked in 200)

// Platform admin (super-admin console)
db.getPlatformAdmin()                        // → { admin }
db.updatePlatformAdminPin(id, newPin)
db.updateSchoolPlan(id, plan)
db.deleteSchool(id)
db.getAllPlatformAuditLog()
db.logPlatformAction(adminId, schoolId, action, details)
```

---

## Known Issues / Watchlist

- **AWS SES still in sandbox** — bulk email only works to verified addresses until production access is approved. Check AWS email for approval status.
- **AWS IAM keys should be rotated** — old keys were shared in chat history. Generate new keys in IAM → Users → rgs-portal-ses → Security credentials, then update Supabase secrets.
- **Paystack live key** must be set in Vercel env vars (`VITE_PAYSTACK_PUBLIC_KEY`) for real payments.
- **`supabaseAdmin.js`** is legacy and unused — ignore it.
- **`fix_emoji*.js`** files in root are legacy one-off scripts — ignore them.
- **ZeptoMail hard bounces — email correction progress (updated 5 Jun 2026):**
  - **Nursery:** ✅ Done
  - **Junior Secondary:** ✅ Done (5 Jun 2026) — 52 emails updated. 2 students skipped (left school: RGS/500 Bassey Elijah, RGS/490 Gift Udeogu — consider marking `withdrawn`). 6 skipped (bad = correct in spreadsheet, still unresolved: RGS/483, RGS/348, RGS/361, RGS/353, RGS/366, RGS/430).
  - **Senior Secondary:** ✅ Done (5 Jun 2026) — 41 emails updated. 7 skipped (bad = correct in spreadsheet, still unresolved: RGS/658, RGS/684, RGS/570, RGS/572, RGS/577, RGS/543, RGS/545). RGS/577 (Amarachi Okoro Angel) still has placeholder `amie@gmail.com`.
  - **Primary:** ⏳ Pending — correction file not yet provided.
  - **Next step:** After next bulk email send, generate new ZeptoMail bounce report and cross-reference against the 13 still-unresolved students to get real corrections.

---

## TODOs / Next Steps

- [ ] Confirm AWS SES production access — check email from AWS
- [ ] Rotate AWS IAM access keys (`rgs-portal-ses`)
- [ ] Add Paystack live key to Vercel env vars
- [ ] Verify `action:manage_attendance` permission works end-to-end
- [ ] Test all RBAC permission toggles (especially student report view + download)
- [ ] Test student deletion interlock end-to-end (fee payments + published cards)
- [x] Update student email addresses — Nursery, JS, SS done (5 Jun 2026). 93 records updated total.
- [ ] Primary section email corrections — awaiting correction file from school
- [x] Mark RGS/500 (Bassey Elijah) and RGS/490 (Gift Udeogu) as `left` — done 5 Jun 2026
- [ ] After next bulk email send: generate new ZeptoMail bounce report and fix the 13 still-unresolved emails (6 JS + 7 SS)

---

## Deployment Checklist

```bash
# 1. Build must pass with zero errors
npm run build

# 2. Stage and commit
git add src/AppDemo.jsx src/supabaseClient.js
git commit -m "feat: description of change"

# 3. Push — Vercel auto-deploys
git push
```

Monitor Vercel deployment at: https://vercel.com/dashboard

---

## AWS SES Billing

- ~$0.10 per 1,000 emails
- Expected usage: under $1/month
- Set up billing alert at $5/month threshold in AWS Console → Billing → Budgets

---

## History / Version Notes

| Version | Date | Notable Changes |
|---|---|---|
| v1–v14 | 2025 | Initial build, students, teachers, results, announcements |
| v15 | Early 2026 | Report workflow: EA/MA approvals, signatures, templates, publish flow |
| v19 | Feb 2026 | Fees module, ZeptoMail integration, PDF attachments, duplicate detection |
| v20 | Feb 2026 | Fee refunds, discounts, audit log |
| v27–v30 | Mar–Apr 2026 | Result upload XLS fixes, pagination (1000-row cap fix), interlock system, internet overlay, dashboard EA stat, section result clear tool |
| v31 | Apr 2026 | Multi-tenant SaaS audit, platform admin console, PIN login, filter/pagination fixes |

---

## Recent Changes (12 Jul 2026) — Promotions: graduate owing-check + fee carry-over review

**Fee carry-over review (no code change needed):** carry-forward is keyed on `student_id`
(stable through promotion), so a promoted student's unpaid balance automatically rolls into
their new class's bill at next-session generation — promotion never breaks it. Two gaps the
promotion feature exposes: (1) **graduated students** — their debt has nowhere to carry (they
won't be billed again); (2) **sequencing** — generate the new session's bills *after* committing
promotion so students are billed on their new class's fee template.

**Built: graduate owing-check (tools.jsx Promotions page + supabaseClient.js):**
- New `db.getOutstandingBalancesForStudents(ids)` — batch map of student_id → outstanding
  balance (`fee_bills` where `carried_forward=false`, `status≠paid`, summed).
- The Run tab loads balances for the run's students and shows:
  - a **red warning** when graduating students still owe ("N owe ₦X — won't carry forward");
  - an **"owes ₦…" chip** on any student row (promote or graduate) with a balance;
  - a **Balance column** on every printable list + a dedicated "Graduates with Outstanding
    Balances" list.
- **Verified end-to-end in the sandbox:** seeded a graduate (TEST/005, ₦40k) + a promoting
  student (TEST/001, ₦30k) → arm showed the warning, the row chips, and the printable list
  correctly; cleaned up after. Also smoke-tested Members/Students/Teachers/Classes/Transcript —
  no console errors (only the benign dev-only Vite "stream externalized" warning).

---

## Recent Changes (12 Jul 2026) — Staging sandbox tenant

A hidden test tenant for safely rehearsing risky changes (see `documentation/STAGING_SETUP.md`).

- **Sandbox school** `f0000000-0000-4000-8000-000000000001` seeded in the production DB,
  status `suspended` so it never shows in the school picker. Reach it via `?school=sandbox`
  (added to `SCHOOL_SLUGS` in AppDemo.jsx). Admin password `sandbox`.
- Seeded: *Test Section*; classes **Test JR 1 → JR 2 → JR 3 → Graduate** (map pre-set);
  session 2025/2026 + 3 terms; 6 students (TEST/001–006).
- **Purple STAGING banner** renders across the top whenever the sandbox tenant is selected
  (AppDemo.jsx, gated on `selectedSchool.id===SCHOOL_SLUGS.sandbox`).
- Isolated by `school_id`, so Commit/Undo and other destructive flows only touch test data.
- Reset script: `documentation/sql/reset_sandbox.sql`.

**Verified the full promotion round-trip in the sandbox** (couldn't be done on prod before):
Arm → Commit (JR1→JR2, JR2→JR3, JR3→graduated; draft 2026/2027 session created inactive with
3 terms) → Undo (all restored, draft session removed, run reverted). All confirmed via SQL.

**Limit:** shares the prod DB instance — good for feature testing, not migration/deploy
isolation. STAGING_SETUP.md documents the full separate-environment path (Supabase branch or
separate project + Vercel staging branch/env vars) for when that's wanted.

---

## Recent Changes (12 Jul 2026) — Promotions & Session Rollover (built)

Implements `documentation/PROMOTION_ROLLOVER_SPEC.md`. Everyone in a class promotes by
default via a preset map; the admin marks exceptions. No teachers, no auto-rule.

**DB (migrations applied to production):**
- `terms.term_order` (1/2/3, backfilled from names) + `terms.start_date` / `end_date`.
- `classes.promotes_to_class_id` (null = terminal → graduate).
- `promotion_runs` + `promotion_decisions` tables (RLS enabled, service-key access).
- New student status value `graduated` (no schema change — status is text).

**DB helpers (supabaseClient.js):** `setPromotesTo`, `getActivePromotionRun`,
`armPromotionRun` (snapshots active students, defaults promote/graduate from the map),
`updatePromotionDecision`, `discardPromotionRun`, `commitPromotionRun` (grouped batch
updates + creates the next session as an **inactive draft** with 3 terms),
`revertPromotionRun` (restores classes/status, deletes the draft session if not activated).

**Term-order refactor:** term-position logic now keys off `terms.term_order`, not the name.
`transcript.jsx` `buildTCM` prefers `term_order` (name-guessing kept only as a fallback);
`getResults` join exposes `term_order`; `upsertTerm` auto-derives `term_order` from the name
so every term-creation path sets it. Retires the fragile regex name-matching.

**Promotions page (tools.jsx `BulkPromotionPage`, route `bulk-promote`, relabelled
"Promotions"):** two tabs —
- *Progression Map*: per-class "promotes to → [class] / Graduate", saved to `promotes_to_class_id`.
- *Run Promotion*: pick session → warns about unmapped (terminal) classes → **Arm** →
  review grouped by class with per-student Promote/Repeat/Graduate toggles → enter next
  session name (auto-suggested `YYYY/YYYY+1`, editable) → **Commit** → **Undo**. Printable
  Promotion / Repeaters / Graduates lists via `ctx.showPDF`.

**Invariant honoured:** promotion only changes a student's *current* class/status — never the
`class_id` on historical `portal_results`. This is what keeps multi-session transcripts truthful.

**Not yet built / deferred:** optional copy of subjects/fee-templates into the draft session;
a dashboard "promotion armed" reminder. **UI not yet visually verified** (admin login required).

---

## Recent Changes (12 Jul 2026) — Transcripts: per-session class + class-roster picker

### 1. Multi-session transcript now shows the correct class per session

**Flaw:** a student can sit in a different class each academic year (JSS1 → JSS2 → …), but the multi-session transcript printed the *same* class on every year's page. `buildMultiSessionTranscriptHTML` (services/pdf/transcript.js) used a single top-level `className` for all pages; `transcript.jsx` derived it from `portalResults[0]` (arbitrary session).

**Fix:** the data was already correct — each `portal_results` row carries the `class_id` for that session. Now:
- `transcript.jsx` `buildPortalTranscriptHTML` derives `className`/`sectionName` **per session** from that session's result rows and passes them in each `pdfSessions` entry.
- `buildMultiSessionTranscriptHTML`'s `buildPage` prefers `sess.className`/`sess.sectionName`, falling back to the top-level value (backward compatible).
- `getResults` join extended with `classes(...,sections(id,name))` so the per-session section name is available too.

(No multi-session result data exists yet — only 2025/2026 — so this was latent; it activates as soon as a second year of results is entered.)

### 2. Select a class → see its student roster (transcript.jsx, portal tab)

Previously the class dropdown only filtered the *search* results; you still had to type a name to see anyone. Now selecting a class (with no student chosen) renders a clickable roster of that class's students (avatar + name + ID), so you can pick straight from the list. Search still works and further narrows the roster.

---

## Recent Changes (12 Jul 2026) — Student Profile Academic tab: compute Grade + Remark

### Grade/Remark were always "—" (src/pages/members.jsx, StudentProfileModal)

The Academic tab rendered `r.grade` / `r.remark` straight from the `results` row, but those columns are typically empty in the DB (grade is derived at report-card time, not stored per result). So every subject showed "—" even though the total score was present.

**Fix:** the modal now fetches the school's grading schema (`db.getGradingSchema(cls?.section_id, 'grades')`) alongside the other profile data, and computes the grade/remark from `total_score` via the shared `getGrade`/`getRemark` helpers (utils/grades.js) whenever the stored value is missing. A stored `r.grade`/`r.remark` still wins if present. Verified against the live RGS schema (90 A / 80 B+ / 70 B / 60 C+ / 50 C / 40 D / 0 F).

---

## Recent Changes (12 Jul 2026) — UI/UX Foundation Pass

### Global typography, focus, scrollbars (index.html)

- **Fixed the Times New Roman leak.** There was no global font set anywhere; every element and native form control fell back to the browser default serif. Any text that didn't have an inline `fontFamily` (e.g. "Welcome back", "Select Your School") rendered in Times New Roman. Added a global system sans stack (`--font-sans`) on `html/body/#root` **and on `button, input, select, textarea`** (form controls don't inherit font-family — this was the real root cause). Verified live: all text now resolves to the sans stack.
- **Keyboard focus ring** via `:focus-visible` (only shows for keyboard users, never on mouse click) — accessibility + polish, no visual noise for pointer users.
- **Custom thin themed scrollbars** (webkit + firefox) replacing chunky OS bars.
- **Font smoothing** (`-webkit-font-smoothing:antialiased`) and `prefers-reduced-motion` support.
- **`skeletonShimmer` keyframe** added for content-shaped loaders.

### New shared components (src/components/ui.jsx)

- **`Skeleton`, `TableSkeleton`, `CardSkeleton`** — content-shaped loading placeholders (shimmer) to use instead of `<Spinner/>`. Feel dramatically faster than a centred spinner even at the same load time.
- **`Th` gains a `sticky` prop** — keeps the table header pinned while a long table scrolls (default off, no layout change for existing tables).

### Rolled out to the main list pages

Applied the pattern (`<Spinner/>` → `<TableSkeleton/>` while loading; plain "no rows" text → `<EmptyState/>` with icon + contextual message + action) to the high-traffic list tables:

- **teachers.jsx** — teacher list (reference implementation, with "Add Teacher" action)
- **students.jsx** — all-students list (TableSkeleton + EmptyState)
- **members.jsx** — unified members list (TableSkeleton; kept existing empty state)
- **fees.jsx** — invoices tab empty state upgraded to `EmptyState`

**Pattern for the table skeleton** (header stays visible, body swaps to shimmer):
```jsx
<table>
  <thead>…</thead>
  {loading ? <TableSkeleton rows={8} cols={N}/> : (
    <tbody>{rows.map(…)}
      {!rows.length && <tr><td colSpan={N}><EmptyState …/></td></tr>}
    </tbody>
  )}
</table>
```

**Deliberately NOT converted:** spinners that wrap complex multi-tab/multi-section fragments (e.g. fees.jsx outer loading, results.jsx, schedule.jsx, dashboard.jsx) — those stand in for more than a single table and blind restructuring on large files risks layout regressions. Convert them one at a time with visual verification. `PageHeader` and `EmptyState` already existed in ui.jsx but were under-used across pages.

---

## Recent Changes (10 Jul 2026) — School Deep-Link (?school=) + Service Worker Fixes

### ?school= query param auto-selects the school (src/AppDemo.jsx)

School websites now link directly to their own portal:
- RGS: `https://portal.renaissancegardenschools.com?school=rgs`
- Heyday: `https://portal.renaissancegardenschools.com?school=heyday`

A `useEffect` in `AppInner` reads the param on load, resolves it through a hardcoded `SCHOOL_SLUGS` slug→school_id map, clears any existing login session (prevents cross-school session carry-over), selects the school, and cleans the URL via `replaceState`. If the school is already selected, nothing happens.

### Service worker fixes (src/main.jsx + public/sw.js)

**Problem found while verifying the above:** the SW was registered in dev too, where its cache-first branch cached `/src/*.jsx` modules — the dev server then served *stale code* even after edits (`.jsx` doesn't match the `looksLikeModule` regex, so it fell into the cache-first path). The same mechanism let production users stay pinned to old builds.

**Fixes:**
1. `main.jsx` — SW registration now gated behind `import.meta.env.PROD`; never registers in dev.
2. `sw.js` — `CACHE_VERSION` bumped `rgs-v3` → `rgs-v4`, purging every user's stale cache on their next visit.

**Pitfall for future sessions:** when testing in the local preview browser and code changes seem to have no effect, unregister service workers and clear CacheStorage first (`navigator.serviceWorker.getRegistrations()` + `caches.keys()`).

---

## Recent Changes (9 Jul 2026) — Teacher Subject Assignment UI

### TeacherSubjectAssignModal added (src/pages/teachers.jsx + src/supabaseClient.js)

**Problem:** Assigning subjects to a teacher required doing it class-by-class from a separate screen — extremely tedious for teachers who cover many classes.

**Solution:** Added a `TeacherSubjectAssignModal` triggered by a green `BookOpen` button on each teacher row. Two tabs:

1. **Bulk Assign tab** — two-column checklist: subjects (left) × classes (right). "Select All" toggles for each column. When subjects and classes are both selected, a combination preview ("3 subjects × 2 classes = 6 combinations") appears with an "Apply & View Matrix →" button that stages all combinations and switches to the Matrix tab.

2. **Matrix View tab** — grid with subjects as rows and section classes as columns. Each cell is a checkbox pre-populated from existing assignments. Cells turn green (adding) or red (removing) to show pending changes. An "All" column header lets you toggle an entire subject row across all classes. Changes are diffed against the original state — only inserts new and removes unchecked.

**Single Save button** in the footer applies the full diff (`assignTeacherSubjectBulk` for additions, `removeTeacherSubjectBulk` for removals).

**New DB methods added:**
- `assignTeacherSubjectBulk(teacherId, entries[])` — upsert with `ON CONFLICT DO NOTHING`
- `removeTeacherSubjectBulk(ids[])` — delete by id array

---

## Recent Changes (9 Jul 2026) — Student Profile: Unified Activity Log

### Activity tab now shows all logs (src/pages/members.jsx + src/supabaseClient.js)

**Problem:** The Activity tab in the student profile modal only showed fee-related events (`fee_audit_log`). Status changes (active → left, etc.) were not logged at all, and even if they were, the actor (who made the change) wasn't surfaced.

**Fixes:**
1. **`logAdminAction` / `getAdminAuditLog` fixed** — both were using the anon `supabase` client which has zero RLS access; changed to `supabaseSrv`. Status change logs were silently failing before this fix.
2. **`logAdminActionBatch` added** (`supabaseClient.js`) — batch insert for bulk status changes; logs one `admin_audit_log` row per student (not one combined row) so each student's profile shows their own log entry.
3. **`getAdminAuditLogByStudent` added** (`supabaseClient.js`) — fetches `admin_audit_log` rows where `entity_type='student'` and `entity_id=studentId`.
4. **Bulk status logging fixed** (`applyBulkStatus` in `members.jsx`) — now logs per-student entries with old/new status and actor name instead of one opaque combined entry.
5. **Activity tab unified** (`StudentProfileModal` in `members.jsx`) — merges `fee_audit_log` + `admin_audit_log` into one timeline sorted newest-first. Each entry shows:
   - Colour-coded action label + source badge ("Fees" / "Admin")
   - For status changes: old status → new status with colour pills
   - Timestamp + **"by [actor name]"** for all events
   - Tab count reflects total (fee + admin events)

---

## Recent Changes (1 Jul 2026) — No-Email Warning on Student Registration & Approval

### Email address warning added (src/pages/students.jsx)

Email remains optional, but users are now warned whenever they proceed without one.

**Three touch-points:**
1. **Admin add student** (`save()` in `StudentsPage`) — confirm dialog fires before `doSave()` if `form.email` is blank. "Add Without Email" continues; cancel returns to form.
2. **Teacher submit student** (`submitManual()` in `TeacherAddStudentsPage`) — same confirm dialog ("Submit Without Email") before the request is posted. `useConfirm` hook added to this component.
3. **Admin approval modal** (`ApprovalsPage`) — when approving a request where the student has no email, an orange `⚠️` banner appears inside the Approve modal: *"This student has no email address — they won't receive report cards, fee reminders, or login links by email."* Non-blocking; admin can still confirm.

---

## Recent Changes (30 Jun 2026) — Transcript Page Improvements

### Student picker redesigned: class → student → year flow (src/pages/transcript.jsx)

Selection is now a 3-step inline flow (all in one card, each step appearing once the previous is set):
1. **Class dropdown** — lists all distinct classes from the student roster; selecting one clears student/session/results
2. **Student search** — appears after class selected; search input that filters the class's students as you type (up to 15 results); selected student shows as a chip with ✕ to change
3. **Academic Year + Load** — appears after student selected; same dropdown + Load button as before

**Previous picker** was a free-text combobox over the entire school roster; switching to class-first avoids scrolling through hundreds of students.

### Multi-session transcript generation (src/pages/transcript.jsx)

Academic year picker replaced with toggleable session chips — user clicks one or more sessions to select them (active = blue filled chip, inactive = outlined). Selecting a new session clears any loaded results.

- **Single session selected**: same flat T1/T2/T3 per-subject table as before; generates legacy PDF
- **Multiple sessions selected**: grouped table with one column block per session (T1 Total / T2 Total / T3 Total / Session Avg / Grade), plus an Overall Avg and Grade column; generates multi-period PDF using `buildMultiPeriodTranscriptHTML`
- `selSession` (string) replaced by `selSessions` (string[])
- `loadPortalResults` loads all selected sessions in parallel via `Promise.all`; results stored in `portalResultsMap {[sessionId]: data[]}` and also flattened into `portalResults`
- `portalSubjectRows` useMemo handles both modes; subjects are unioned across sessions for multi-mode

### Inline score editing (src/pages/transcript.jsx)

Added "✎ Edit Scores" toggle button in the results card header. When enabled:
- Single session: all 9 score cells (T1 CA/Exam/Total, T2, T3) become number inputs; cells with null values get an orange background hint
- Multi session: T1/T2/T3 total cells per session become inputs
- Edits stored in `scoreOverrides {[sessionId-subject-field]: value}` state and merged into `portalSubjectRows` via `withOv()`
- Badge in header shows count of edited cells ("3 edited")
- Overrides flow through to the PDF — `genPortalPDF` uses `portalSubjectRows` which already has overrides applied
- Overrides reset on student change, class change, or new Load

### PDF transcript scores bug fixed (src/pages/transcript.jsx genPortalPDF)

**Bug:** "Generate Transcript PDF" produced a valid PDF but all score cells showed "—" even though scores were visible in the portal results table.

**Root cause:** `genPortalPDF` passed `portalSubjectRows` directly to `buildTranscriptHTML`. `portalSubjectRows` stores scores as flat properties (`t1_ca`, `t1_exam`, `t1_total`, etc.) but `buildTranscriptHTML` expects `scores:{"T1 CA":…,"T1 Total":…}` keyed by column name. The format mismatch meant `s.scores` was always `undefined`, so every score rendered as `"—"`.

**Fix:** Added a `pdfSubjects` mapping in `genPortalPDF` that converts each row to `{name, scores:{"T1 CA":..., ...}}` before passing to the PDF builder. Also added `logoBase64` (was missing from the portal PDF call).

### Term column mapping — fixed

**Bug:** `portalSubjectRows` was assigning results positionally — the first unique `term_id` found became `t1` regardless of which term it actually was. A student with only Second Term results would have those results placed in the First Term column.

**Root cause:** The old sort-then-destructure pattern (`const [tid1,tid2,tid3] = sortedTermIds`) means if a student has results for only 1–2 terms, the assignment shifts left.

**Fix:** Each `term_id` is now mapped to its correct column (1/2/3) by matching its `name` string against "first"/"1st", "second"/"2nd", "third"/"3rd". Results that don't match any pattern are skipped rather than placed in the wrong column. Order of which terms the student has results for no longer matters.

### Section name blank on PDF — fixed

`getResults` joins `classes` without nesting `sections`, so `portalResults[0]?.classes?.sections?.name` was always `undefined`. Fixed by preferring `selStu.classes.sections.name` (from `getStudents` which does include the section join) before falling back to the results chain.

### Draft notes, missing-score indicator, email transcript (src/pages/transcript.jsx, src/supabaseClient.js)

**Draft notes:** `transcript_drafts.note` is now exposed in the UI — a text input under the student card lets whoever saves a draft leave a message for the next person ("T3 Maths still pending HOD"). Shown on the draft card in the In Progress panel. Prefilled when resuming a draft.

**Missing-score indicator:** New `transcript_drafts.missing_fields text[]` column. `computeMissingFields()` scans `portalSubjectRows` for null T1/T2/T3 totals (single or multi-session) and is computed at save time. Draft cards show up to 4 missing entries plus a "+N more" count, so the next person sees exactly which gaps to fill without reloading data first.

**Email Transcript:** New button next to "Generate Transcript PDF" (disabled if the student has no email on file). Builds the same HTML as the PDF path via the new shared `buildPortalTranscriptHTML()` helper, converts it to a PDF with `htmlToPdfBase64`, and sends it as an attachment via `sendPortalEmail` wrapped in the standard `buildEmailHtml` template. Logs the send the same way PDF generation does (`logTranscriptGenerated`).

### Transcript drafts, history & classless search (src/pages/transcript.jsx, src/supabaseClient.js)

**New DB table: `transcript_drafts`** — stores both in-progress drafts (status='draft') and PDF generation history (status='generated'). Fields: school_id, student_id, student_name, class_name, session_ids[], score_overrides jsonb, status, note, created_by_name, updated_by_name, generated_at.

**Save Draft flow:** "Save Draft" button available as soon as a student is selected. Saves student, sessions, and all score overrides to the DB. Any staff member with transcript access can see the draft in the "In Progress" panel and resume it. Resuming loads student + sessions + overrides and auto-fetches base results.

**In Progress panel:** Orange-bordered card above the picker. Shows all open drafts — student name, ID, session(s), how many score overrides, who saved it and when. Actions: Resume (loads the draft state), Delete.

**Transcript History panel:** Blue-bordered card at the bottom of the Portal tab. Shows all generated transcripts (status='generated') — student, sessions, who generated it, date. Visible to all staff (not just admin). Auto-logs whenever "Generate Transcript PDF" is clicked.

**Auto-log on generate:** `genPortalPDF` calls `logTranscriptGenerated()` after opening the PDF. If a draft was active, it's promoted to 'generated'; otherwise a new history record is created.

**Classless student search:** Class dropdown is now optional ("Filter by Class"). Student search input is always visible. Dropdown shows result's class name alongside the name. Search works across all students in the school; class filter just narrows the list. Typing is required to see results (no empty-state dropdown flood).

### Multi-session PDF: orphan footer pages fixed (src/services/pdf/transcript.js buildMultiSessionTranscriptHTML)

**Bug:** Printing a 2-session transcript produced 4 pages (pages 2 and 4 were blank except the signature footer).

**Root cause:** The page wrapper div had `min-height:100vh`, forcing each session's div to fill at least one full viewport height. With 17 subjects, content filled most of the page and the footer overflowed to a second printed page.

**Fix:** Removed `min-height:100vh` and compacted the entire `buildPage` template:
- Outer padding: `28px 32px` → `14px 22px`
- Base font: `11px` → `9px` (table rows at `8.5px`)
- Session badge, header border, student info cells, table header/row padding — all tightened
- Student info grid changed from 2-row 3-col to single-row 6-col layout (saves ~40px)
- Summary cards: changed from fixed-width boxes to flex-fill strip
- Stamp circle: `80px` → `60px`; signature blank height: `32px` → `22px`
- Table row cells: padding `5px/6px` → `3px/4px`; font `10px` → `8.5px`

---

## Recent Changes (19 Jun 2026) — UI Polish

### Shared component improvements (src/components/ui.jsx)

- **`StatCard` count-up animation** — numeric `value` props now animate from 0 to the target over 650ms (ease-out cubic) on mount and on value change. Non-numeric values (strings, formatted currency) render as-is, unchanged.
- **`TRow` click support** — added optional `onClick` prop. When provided, cursor changes to `pointer` automatically. Backward-compatible (no change when `onClick` is omitted).
- **`PageHeader` component (new export)** — reusable gradient banner for page tops. Props: `icon` (string name or Lucide element), `title`, `subtitle`, `action` (right-side slot), `gradient` (override). Use instead of ad-hoc header divs.
- **`EmptyState` component (new export)** — centered placeholder for no-data states. Props: `icon`, `title`, `message`, `action` (CTA button slot). Default icon: `Inbox`.

### Sidebar active item (src/AppDemo.jsx)

- Active nav item background changed from flat `rgba(255,255,255,.14)` to `linear-gradient(90deg, orange28, transparent)` — a warm orange left-fade that reads clearly on the dark sidebar.
- Left indicator bar widened from 3px → 4px and given an orange glow (`box-shadow`).

---

## Recent Changes (17 Jun 2026) — HLDS Grading Schema + Score Structure

### Copied RGS grade bands and score structure to Heyday LDS

HLDS had no grading schema (0 rows in `grading_schema`) and empty `result_ca_max` / `result_exam_max` settings, so grading was non-functional for HLDS teachers.

**What was done (direct DB writes via Supabase MCP):**
- Inserted 7 grade bands (A/B+/B/C+/C/D/F) for all 4 HLDS sections (36=Primary, 37=Senior Secondary, 38=Junior Secondary, 39=Nursery) — 28 rows total, `schema_type='grades'`
- Set `result_ca_max = 40` and `result_exam_max = 60` in `school_settings` for HLDS (`dcd5c5e5-19a3-4f5c-b30d-90667f4373ab`)

**Grade bands copied:**
| Grade | Min | Max | Remark |
|-------|-----|-----|--------|
| A     | 90  | 100 | Outstanding |
| B+    | 80  | 89  | Excellent |
| B     | 70  | 79  | Very Good |
| C+    | 60  | 69  | Good |
| C     | 50  | 59  | Average |
| D     | 40  | 49  | Satisfactory |
| F     | 0   | 39  | Fail |

---

## Recent Changes (17 Jun 2026) — Primary Section Email Corrections

### Student email corrections — Primary ✓ (54 updated, 1 skipped)

Applied email corrections from `Correctedemails.xlsx` for RGS Primary 1–6 students.
- 54 students updated
- 1 skipped: RGS/312 Chisomebi Ojechi — invalid email `ojechinnamdi@.co.uk` in spreadsheet (user investigating)

---

## Recent Changes (11 Jun 2026) — iOS Print Fix + Audit Log school_id Filter + DB Cleanup

### Fee invoice/receipt: iOS print clipping fixed
**Problem:** On iOS Safari, the right side of the printed invoice was clipped (amounts and billing period columns missing).
**Root cause:** iOS ignores `@page { size: A4 }` and uses the device viewport width. `width:210mm` on `.a4` overflowed the viewport and was clipped by `overflow:hidden`.
**Fix** in `@media print` inside `src/services/pdf/billing.js`:
- Changed `.a4` from `width:210mm` → `width:100%`
- Added `overflow:visible; height:auto` to `html,body` so iOS doesn't clip the content
- Android/Windows unaffected — their print engines honour `@page { size: A4 }` so `width:100%` still equals 210mm

### `getFeeAuditLogByStudent` missing school_id filter
**Problem:** The query in `supabaseClient.js` did not filter by `school_id`, so students at one school could surface audit records from other schools sharing the same `student_id` value.
**Fix:** Added `.eq('school_id', this._schoolId)` to `getFeeAuditLogByStudent()`.
**File:** `src/supabaseClient.js`

### DB cleanup — 947 orphaned fee_audit_log rows deleted
**Problem:** During March–April 2026 testing, fake student IDs (RGS/01, RGS/07, etc.) were used. The test fee bills were later deleted but the `fee_audit_log` rows remained. These orphaned rows showed up in the real students' activity tabs (e.g. RGS/01 showed 51 records instead of ~4).
**Fix:** Direct DB cleanup — deleted all `fee_audit_log` rows for school `5f8d21ae-...` where the referenced `bill_id` no longer exists in `fee_bills`.
**SQL used:**
```sql
DELETE FROM fee_audit_log fal
WHERE fal.school_id = '5f8d21ae-bb54-4528-bd01-0a21f180709d'
  AND NOT EXISTS (SELECT 1 FROM fee_bills fb WHERE fb.id = fal.bill_id);
```
**Result:** 947 rows deleted. Verified 0 orphans remain.

---

## Recent Changes (11 Jun 2026) — Fee Invoice/Receipt Redesign

### Invoice and receipt PDF now use the Refined Navy design
**Problem:** The old PDF looked tiny/minified on A4 — cramped padding, small fonts, no visual hierarchy.
**Fix:** Rewrote `src/services/pdf/billing.js` with the new navy design (from handoff zip):
- Full-width navy gradient header with logo slot (shows school logo if available, initials if not)
- Prominent status band with coloured pill badge + large balance amount on the right (paid=green, partial=amber, unpaid=red)
- Generous body padding (22px vs old 9px), 16px gaps between sections
- Items table rows enlarged (11px padding per row), font sizes bumped to 13px
- Totals section: grand total at 22px bold, coloured by status
- Footer: 3-col grid — QR+bank details | contextual note | stamped circle
- Dark navy footer bar at bottom with school name + ref
- `schoolLogo` parameter added to `buildPDF()` (optional, base64 data URI)
- `FeeTrackerPage` and `MyBillPage` updated to pass `schoolLogo` from `useSection()`
**Files:** `src/services/pdf/billing.js`, `src/pages/fees.jsx`

---

## Recent Changes (5 Jun 2026) — Fee Report Discount Bug Fix

### Discounted students showing as owing in fee reports

**Bug:** Students with discounts were appearing in the defaulters/owing list on the Fee Statistics page and in the CSV export, even when their discounted balance was zero.

**Root cause:** `recalcBillTotals` was not being called for some older discount operations, leaving `fee_bills.total_amount` at the original (pre-discount) value. The generated `balance = total_amount - amount_paid` was therefore inflated. `FeeStatsPage` used raw `b.balance` from the DB rather than computing a live balance from embedded items/discounts — unlike `FeeTrackerPage` which already had a `liveBillStatus()` helper.

**Fixes (two layers):**
1. **`FeeStatsPage.useEffect`** — After loading, enrich each bill with live-computed `total_amount`, `balance`, and `status` from embedded `fee_bill_items` minus `fee_discounts`. All downstream stats (defaulters, totalOutstanding, leaderboard, PDFs) now use correct values automatically.
2. **`FeeTrackerPage.exportCSV`** — CSV export rows now compute live balance/status instead of using raw DB values.
3. **DB repair** — One-off SQL fixed all 50+ stale `fee_bills` where `total_amount` didn't reflect applied discounts. Verified: 0 stale bills remain.

---

## Recent Changes (5 Jun 2026) — Email Corrections

### Student email corrections — Nursery ✓, Junior Secondary ✓, Senior Secondary ✓

**What:** Bulk-updated invalid/bouncing parent email addresses in the `students` table, section by section, using correction spreadsheets provided by the school.

**How:** Direct SQL `UPDATE students SET email = '...' WHERE id = 'RGS/XXX' AND school_id = '...'` via Supabase MCP. No code changes.

**Results:**
- Nursery: done (previous session)
- Junior Secondary: 52 updated, 2 skipped (left school), 6 skipped (no correction available)
- Senior Secondary: 41 updated, 7 skipped (no correction available)
- **Total updated: 93 records**

**Skipped / still bouncing (13 total):** RGS/483, RGS/348, RGS/361, RGS/353, RGS/366, RGS/430 (JS), RGS/658, RGS/684, RGS/570, RGS/572, RGS/577, RGS/543, RGS/545 (SS). Bad and correct email were identical in the spreadsheet — school could not provide a fix. Cross-reference against next bounce report after next bulk send.

**Left the school (JS):** RGS/500 (Bassey Elijah), RGS/490 (Gift Udeogu) — email not updated. Mark as `withdrawn` when confirmed.

**Primary section:** Pending — correction file not yet provided.

---

## Recent Changes (4 May 2026) — v32.89

### Mobile App UI — Native shell (bottom tabs, gradient header, module hub, profile screen)

**Problem:** On mobile the app was rendering the full desktop sidebar + top header, which is cramped, scroll-heavy, and not native-feeling.

**Solution:** `AppInner` now detects `isMobile` and renders a completely different layout shell:

**`MobileAppHeader`** (replaces desktop top bar on mobile)
- Full-width gradient header (`#1A4FA0 → #0d2d6e` light, dark-mode aware)
- Left: user avatar initials + first name + role subtitle + time-aware greeting
- Right: dark mode toggle (Sun/Moon icons) + bell with orange unread dot
- When navigating to a sub-screen: shows back arrow + page title instead of user info
- Top padding `52px` clears iOS status bar / Dynamic Island

**`MobileTabBar`** (replaces sidebar on mobile)
- 5-tab role-specific bottom navigation, all Lucide SVG icons (no emojis)
- Admin: Home · Students · Fees · Results · More
- Teacher: Home · Attendance · Results · Timetable · Profile
- Manager: Home · Tracker · Stats · Notices · Profile
- Student: Home · Results · My Bill · Notices · Profile
- Active tab: primary blue indicator bar at bottom + bold label
- Safe-area-inset padding for iPhone home bar

**`AdminMorePage`** (new virtual page `mobile-more`)
- 3-column CSS grid of 15 module tiles — all screens accessible from one hub
- Each tile: tinted icon container (color per module) + label + subtitle
- Tap-scale animation on press
- Modules: Members, Announcements, Calendar, Settings, Email, Report Cards, Grading, Timetable, Audit Log, Export, Recycle Bin, Activity, Approvals, Fee Stats, My Profile

**`MobileProfilePage`** (new virtual page `mobile-profile`)
- Gradient header with large avatar + name + role + school name
- Dark mode toggle pill with animated thumb
- Settings rows: Edit Profile, Change Password, Notifications, Help, About
- App version badge
- Red sign-out button

**Back navigation:** Sub-screens (reached via More or direct `setPage()`) show back arrow in header → returns to dashboard. Tab-root pages never show back arrow.

**Virtual page IDs added to `ALL_NAV`:** `mobile-more`, `mobile-profile`

**Files changed:** `src/AppDemo.jsx`

---

## Recent Changes (4 May 2026) — v32.88

### Fee Stats PDF — real school name, logo, confidentiality message

**Root cause:** `FeeStatsPage.pdfWrap` was using `ctx?.user?.schoolName||"Your School"` — the `ctx.user` object does not carry `schoolName`, so all PDFs showed the placeholder "Your School".

**Fix:**
- Added `const {schoolName:_sectionName, schoolLogo:_sectionLogo} = useSection()` at the top of `FeeStatsPage`
- `schoolName` now resolves from `useSection()` (reads `portal_logo_base64` + school name from `school_settings`), same pattern used by `FeeTrackerPage` and `MyBillPage`
- `schoolLogo` (base64) displayed as `<img>` above the school name on the cover if present; hidden if no logo set
- Confidentiality footer added to every PDF: *"This document is confidential and intended solely for the use of authorised personnel of [School Name]. Do not distribute or reproduce without written permission."*
- Footer also shows school name + report type + year

**Files changed:** `src/pages/fees.jsx`, `src/AppDemo.jsx`

---

## Recent Changes (4 May 2026) — v32.87

### Fee Stats PDF — Save as PDF button + Portrait/Landscape toggle

**Save as PDF button:** Every PDF opened from Fee Statistics now has a fixed blue bar at the top of the document with a "⬇ Save as PDF" button that triggers `window.print()` (browser saves as PDF) and a "✕" close button. Bar hides during actual printing via `@media print`. No more manual Ctrl+P.

**Portrait/Landscape toggle:** Two-button pill toggle added to the page header ("◻ Portrait" / "▭ Landscape"). Selected orientation is stored in `pdfOrientation` state and flows into every `pdfWrap()` call:
- Portrait: A4, `font-size:11pt`, 4-column stat grid, standard padding
- Landscape: `A4 landscape`, `font-size:10pt`, 8-column stat grid, compact padding — wider tables fit more columns without wrapping
- Orientation label shown in the print bar and in the document footer

**Files changed:** `src/pages/fees.jsx`, `src/AppDemo.jsx`

---

## Recent Changes (4 May 2026) — v32.86

### Fee Stats PDF — two bugs fixed

**Bug 1 — Blank first page:** All class sections in Item Analysis PDF had `class="section pb"` (page-break-before). The first section immediately page-broke after the one-line metadata, leaving page 1 almost empty and the table starting on page 2. Fix: `pb` class now only applied from index 1 onward (`sIdx > 0`).

**Bug 2 — Collection rate > 100% (e.g. 313%):** Rate was computed as `amountPaid ÷ itemAmount` — where `amountPaid` is the student's *total bill* collected (all items) and `itemAmount` is just *this one item*. A student billed ₦87,000 for Mid Day Meal who paid their full ₦272,500 bill shows 313%. Fix: rate is now `fullyPaidStudents ÷ totalStudents × 100` — a clean "% of students who cleared their bill", capped at 100%. Applied consistently in on-screen stats bar, grouped class view, and PDF output.

**Files changed:** `src/pages/fees.jsx`, `src/AppDemo.jsx`

---

## Recent Changes (4 May 2026) — v32.85

### Fee Statistics — PDF export for all new sections

Every new card from v32.84 now has a dedicated PDF export button plus all sections are included in the Full Report PDF:

| Section | Export |
|---|---|
| Class Collection Leaderboard | "Leaderboard PDF" button on card |
| At-Risk Students | "At-Risk PDF" button on card |
| Refunds | "Refunds PDF" button on card |
| Discounts | "Discounts PDF" + summary-by-type section + full detail list |
| Student Ledger Modal | "PDF" button in modal header — exports full bill history with payments, discounts, refunds per term |
| Full Report PDF | Now includes all 4 new sections appended after existing sections |

**Files changed:** `src/pages/fees.jsx`, `src/AppDemo.jsx`

---

## Recent Changes (4 May 2026) — v32.84

### Fee Statistics — 6 deep-dive features

**1. Class Collection Leaderboard** — full-width table ranked worst-to-best by collection rate, with inline progress bars. Clicking a row filters the entire page to that class. Footer shows school-wide totals.

**2. Class Filter** — dropdown below section pills filters all computed stats, charts, defaulters, and new cards to a single class. Resets when section pill changes.

**3. Refunds Card** — shows total refunded (₦), count, and a scrollable list of recent refunds with student name (clickable), reason, and date. Reads from `fee_refunds` embedded in bills.

**4. Discounts Card** — shows total discounts waived, breakdown by label (e.g. "Scholarship", "Sibling"), and a recent-discounts list. Reads from `fee_discounts` embedded in bills.

**5. At-Risk Students** — partial bills where last payment was 30+ days ago. Shows days since last payment (red if 60+ days). Clickable "View all" opens existing drill-down panel.

**6. Student Payment Ledger Modal** — click ANY student name anywhere on the stats page to open a full-screen modal showing their entire payment history: every bill across all terms, every payment (with method), every refund, every discount. Summary row shows total paid / outstanding / refunded / discounted at a glance.

**Files changed:** `src/pages/fees.jsx`, `src/AppDemo.jsx`

---

## Recent Changes (4 May 2026) — v32.83

### Cross-chunk crash audit: 3 more missing imports fixed

Proactive audit of all `src/pages/*.jsx` files for components exported in one chunk but used in another without imports. Found and fixed:

| Component | Defined in | Used in | Fix |
|---|---|---|---|
| `EmailProgressModal` | `comms.jsx` | `fees.jsx` | Added import |
| `EmailProgressModal` | `comms.jsx` | `members.jsx` | Added import |
| `AutoBillModal` | `students.jsx` | `members.jsx` | Added import |
| `BulkUploadBillingModal` | `students.jsx` | `members.jsx` | Added import |

**Files changed:** `src/pages/fees.jsx`, `src/pages/members.jsx`, `src/AppDemo.jsx`

These would have caused `X is not defined` runtime crashes when those pages loaded in production.

---

## Recent Changes (2 May 2026) — v32.82

### Cross-chunk crash: BulkProgressModal not defined in fees.jsx

`BulkProgressModal` is defined and exported from `students.jsx` but `fees.jsx` was using it as a free variable (no import). Added:
```js
import { BulkProgressModal } from "./students.jsx";
```
to the top of `fees.jsx`. Used at lines 1402 and 3821 in that file.

---

## Recent Changes (2 May 2026) — v32.81

### Digest — fees/payments missing + categorisation rewrite

**Root cause:** The digest was only querying `admin_audit_log`, which contains no fee data. Fees are in `fee_audit_log` (separate table). Also, `admin_audit_log` uses generic actions (`create`, `edit`, `delete`) combined with `entity_type` — not the specific named actions originally assumed.

**Actual `admin_audit_log` action values:** `login_success`, `login_failed`, `logout_kicked`, `logout_idle`, `page_view`, `create`, `edit`, `delete`, `bulk_delete`, `status_change`, `role_change`, `setting_change`, `report_card_generate`, `report_card_print`, `report_card_print_bulk`, `report_card_view`, `broadsheet_export`, `data_export`

**Actual `admin_audit_log` entity_type values:** `auth`, `page`, `student`, `teacher`, `educator`, `member`, `setting`, `report_card`, `broadsheet`, `dataset`

**Actual `fee_audit_log` action values:** `bill_generated`, `bill_deleted`, `payment_recorded`, `refund_processed`, `discount_applied`, `item_added`, `item_removed`, `discount_removed`

**`fee_audit_log` columns:** `id, bill_id, student_id, action, amount, details, performed_by, created_at, school_id`

**Changes to `scheduled-digest/index.ts`:**
- Now queries both `admin_audit_log` (columns: `action, entity_type, entity_name, performed_by, performed_at`) and `fee_audit_log` (columns: `action, performed_by, amount, student_id, created_at`)
- Results merged into unified `EventRow[]` and sorted by time desc
- `categorise(action, entity_type)` function replaces old prefix-matching approach — uses `entity_type` as the primary discriminator for generic actions
- Fee rows shown with `₦amount` in the Actor column
- `rowMatchesFilter` maps `access` filter key → `logins` category (since page_view is grouped there)

---

## Recent Changes (2 May 2026) — v32.80

### Digest 500 fix — wrong audit log column names

The `admin_audit_log` table uses different column names than assumed when writing the edge function. Fixed in `scheduled-digest/index.ts`:

| Was (wrong) | Correct |
|---|---|
| `actor_name` | `performed_by` |
| `actor_role` | `actor_type` |
| `target` | `entity_name` |
| `created_at` | `performed_at` |

Also updated the `select`, filter (`performed_at gte`), and `order` params in the pgQuery call accordingly. HTML table now renders correct column values.

**Note for future:** Always verify `admin_audit_log` column names from the schema before referencing them. Actual columns: `id, action, entity_type, entity_id, entity_name, old_value, new_value, performed_by, performed_at, notes, school_id, actor_type, actor_email, actor_id, session_id, ip_address, user_agent, summary`.

---

## Recent Changes (2 May 2026) — v32.79

### Digest bug fixes

**406 on Notifications tab load** — `getSetting()` in `supabaseClient.js` was calling `.single()` which PostgREST requires exactly one row for — returns 406 when the `notif_digest_config` key doesn't exist yet. Fixed to `.maybeSingle()` (returns `null` for missing rows). Also silently fixed `getNotifConfig()` which calls the same function.

**500 from `scheduled-digest` edge function** — Cold-start failure caused by `import { createClient } from "https://esm.sh/..."`. No boot logs appeared at all (the tell for an import-level crash). Rewrote using thin `pgGet` / `pgQuery` / `pgUpsert` helpers that call Supabase REST API directly via `fetch` — same pattern as `send-email`. No external imports, instant cold start.

---

## Recent Changes (2 May 2026) — v32.78

### Scheduled Activity Digest

**What:** Admins can now receive a scheduled email digest of all portal activity (or a filtered subset) at a preset time each day or week. Configured from **Settings → Notifications → Scheduled Digest**.

**Frontend (`settings.jsx` + `supabaseClient.js`):**
- New `digestConfig` state + `DEFAULT_DIGEST` shape loaded from `db.getDigestConfig()` on tab open
- Full UI section in Notifications tab:
  - Blue enable/disable toggle
  - Recipient email (falls back to alert email if blank)
  - Frequency segmented button: Daily | Weekly
  - Day-of-week pill selector (Mon–Sun, weekly only)
  - 24-hour time dropdown showing both UTC and WAT (`06:00 UTC (07:00 WAT)`)
  - Last sent timestamp
  - Event filter: "All Events" toggle + 7 individual category checkboxes (logins, students, staff, results, fees, settings, access)
  - "Send Now" button (immediate trigger) + "Save" button
- `supabaseClient.js` new methods: `getDigestConfig()`, `saveDigestConfig()`, `triggerDigestNow()`
- Config stored as JSON in `school_settings` key `notif_digest_config`

**Backend (`supabase/functions/scheduled-digest/index.ts`):**
- Reads `notif_digest_config` from `school_settings`
- Time-gates: checks UTC hour match, day-of-week match (weekly), and same-hour dedup via `last_sent_at`
- `force: true` bypasses all time gates (used by "Send Now")
- Queries `admin_audit_log` for the configured window (last 24h or last 7d)
- Filters rows by event category using action prefix matching
- Builds a polished HTML email: gradient header, per-category summary cards with counts, full event log table with WAT timestamps and colour-coded category badges
- Sends via ZeptoMail (primary) or AWS SES (fallback) — same pattern as `send-email`
- Updates `last_sent_at` in `notif_digest_config` after successful send
- `verify_jwt: false` — authenticated by the cron function via anon key

**Database:**
- `pg_net` extension enabled (`extensions` schema)
- `public.trigger_scheduled_digests()` SQL function: iterates all schools with digest enabled, calls `net.http_post` to the edge function for each
- pg_cron job `scheduled-digest-hourly` runs `0 * * * *` (every hour at :00 UTC)

**Config shape:**
```json
{
  "enabled": true,
  "recipient": "admin@school.com",
  "utc_hour": 6,
  "frequency": "daily",
  "day_of_week": 1,
  "events": null,
  "last_sent_at": "2026-05-02T06:00:00.000Z"
}
```
`events: null` = all categories; object with booleans = individual filter.

---

## Recent Changes (2 May 2026) — v32.76 / v32.77

### Production crash fix: PERM_ROLE_DEFAULTS / PERM_GROUPS / RBAC_ROLES not defined

**Bug:** Any non-admin user login (teacher, manager, student) would crash the portal with `ReferenceError: PERM_ROLE_DEFAULTS is not defined`. A second latent crash (`PERM_GROUPS`, `RBAC_ROLES` not defined) would have hit any user who opened the Permissions page before ever visiting the Dashboard.

**Root cause:** When the codebase was split into lazy-loaded domain chunks, three RBAC constants ended up in the wrong files:
- `PERM_ROLE_DEFAULTS` — defined in `dashboard.jsx` (lazy chunk), used by `canAccess()` in `AppDemo.jsx` and `PermissionsPage`
- `PERM_GROUPS` — defined in `dashboard.jsx`, used only in `permissions.jsx`
- `RBAC_ROLES` — same

All three are referenced as free variables before the lazy chunks load, causing `ReferenceError` at runtime.

**Fix:**
- All three constants exported from `AppDemo.jsx` (main bundle — always loaded)
- `permissions.jsx` imports all three from `AppDemo.jsx`
- Dead duplicate definitions removed from `dashboard.jsx`

**Full audit performed:** All 19 page files scanned for free-variable references to AppDemo-level globals. Every other flagged symbol (`notify`, `fmtDate`, `buildEmailHtml`, `Pagination`) confirmed safe — received via `ctx` prop or locally defined within the component.

**Rule going forward:** Any constant needed by `canAccess()` or `PermissionsPage` must be defined and exported from `AppDemo.jsx` (main bundle). See CLAUDE.md for the permanent pitfall entry.

### ZeptoMail hard bounce investigation

Analysed ZeptoMail send log CSV (28 Apr 2026 export). Found 180 unique hard bounce addresses in total; after filtering test/placeholder addresses, **143 student records** matched with invalid parent emails (Google SMTP 5.1.1 — account does not exist). Full list broken down by class and section was produced. Corrections being gathered from school — follow-up expected ~9 May 2026.

---

## Recent Changes (1 May 2026) — v32.75

### Automated Email Notification Alerts (Tier A), SignaturesPage removed, Timetable upgrades

**Automated notifications (Tier A immediate alerts):**
- New **Settings → Notifications** tab with: admin email address, per-event on/off toggles, failed-login threshold, "Send Test" button
- `db.getNotifConfig()` / `db.saveNotifConfig(cfg)` — stored in `school_settings` key `notif_config` as JSON
- `db.sendAdminAlert({subject, html, eventKey, config})` — fire-and-forget, checks event toggle before sending
- `buildAlertEmail(title, rows, severity, schoolName)` — compact branded HTML template in `services/email/index.js`
- Alert hooks wired at: role change (members.jsx), admin password change (settings.jsx), report cards published (reportcards.jsx), fee refund issued (fees.jsx), large payment ≥ ₦100k (fees.jsx), access request submitted (access.jsx), multiple failed logins threshold crossed (AppDemo.jsx via localStorage counter)

**Timetable upgrades (v32.74 batch):**
- Per-section period schedules: `timetable_periods.section_id` column added (migration `timetable_periods_add_section_id`)
- Grid loads only periods for the selected class's section; Manage Periods modal has section tabs
- Auto-match teacher from `teacher_subjects` on subject selection in slot modal (green/orange banner)
- Teacher clash detection: blocks saving a slot if teacher is already assigned to another class at same period/day/term/session (`db.checkTeacherClash`)
- Stuck-period fix: orange "← required" on class dropdown, step-by-step empty state; period inline-edit pencil icon on grid rows

**Other (v32.75 batch):**
- `SignaturesPage` stub fully removed (AppDemo.jsx import, lazy.js entry, reportcards.jsx function + stray commented block)
- Version bumped to v32.75

---

## Recent Changes (21 Apr 2026) — v32.38

### Unified audit trail v1 — see everyone's actions

First phase of the "automatic mails + audit trail" request. Email notifications will layer on top of this in v32.39+.

**What landed:**
- **Actor context on every session.** `db.setUser(user)` now builds an `_actor` ({id, email, role, type, displayName, sessionId via `crypto.randomUUID`, userAgent}) so every subsequent mutation auto-stamps who did it. SessionId is preserved across repeat calls.
- **Auto-logging wired into the hot mutation paths** (`upsertStudent`, `deleteStudent`, `upsertTeacher` incl. role-change detection, `deleteTeacher`, `upsertResult` batch summary, `setSetting`, `setSettings`). Each fetches a `before` snapshot, diffs, and writes a minimal before/after payload to `admin_audit_log`. Failures are swallowed — audit can't break the primary op.
- **Login / logout events.** `AppDemo.login` logs `login_success` / `login_failed` (failed rows stamped `actor_type:'anonymous'`). `doLogout` logs `logout` / `logout_kicked` / `logout_idle` before clearing the session.
- **`AuditLogPage` rewritten.** Filter bar (search, actor, action, entity, from/to date, clear-all), server-side date filtering, paginated 50/page with First/Prev/Next/Last, expandable rows showing Actor/Session/Target/When grid + side-by-side Before/After JSON panels. CSV export now includes `actor_email`, `actor_type`, `ip_address`, `session_id`. Icons/labels/colors extended for all new action types.
- **`db.getAdminAuditLog(filters)`** paginates in 1000-row batches (up to 5000 default cap) and supports `{action, actor_type, actor_id, performed_by, from, to}`.

**Follow-ups (v32.39+):**
- Automated email notifications — Tier A immediate (role/permission change, ≥5 failed logins in 10min, PIN change, student delete, refund, large payment, report publish, edge function failure), Tier B daily 7am digest, Tier C weekly Mon 7am digest.
- Settings → Notifications UI with per-event toggles, thresholds, test-send.
- Additional audit wiring: report publish/unpublish, email sends (unify with `email_logs`), fee actions (unify with `fee_audit_log`).

---

## Recent Changes (21 Apr 2026) — v32.37

### Report cards no longer render stale cross-class results
**Reported:** Precious Eloho (RGS/695, JSS 1 / class 31) report card showed 18 subjects — 3 duplicates (Agricultural Science, Basic Science and Technology, Literature in English) each appearing a second time with 0/F because they had stale `portal_results` rows tagged to `class_id=33` (a previous class) from early uploads on 12–13 Apr.

**Scope audit:** 9 stale cross-class result rows total across 3 students (RGS/695, RGS/625, RGS/696). 7 were pure zero-score junk, 2 held real prior-class scores for RGS/625 (left intact for admin review).

**Data fix:** Deleted the 7 zero-score stale rows.

**Code fixes (two defensive layers):**
1. **MyResults (student self-view) — `AppDemo.jsx` ~12808:** the per-student fetch now passes `class_id:+user.class_id` alongside `term_id`/`session_id`, so only current-class rows are returned. All admin-facing report card fetches already passed `class_id`; only the student self-view path was missing it.
2. **`openReportCardPrintWindow` — `AppDemo.jsx` ~24741:** renderer-level safety net added. Before computing totals/grades it (a) drops any result row where `r.class_id !== cls.id` and (b) dedupes by `subject_id`, keeping the highest-scoring row. This catches any future regression at the render step, regardless of how results were fetched.

**New convention (added to CLAUDE.md):** every per-student `db.getResults` call site feeding a report card must pass `class_id`. Transcripts (cross-class by design) are exempt.

---

## Recent Changes (20 Apr 2026) — v32.36

### Phantom-subject fix: `portal_results.subject_id` NOT NULL + upload guards
**Reported:** Chikamso Chukwukezie (RGS/215) report card showed 18 subjects instead of 17.

**Root cause:** An XLS bulk upload on 13 Apr wrote `portal_results` rows with `subject_id = NULL` (ca/exam/total all 0, empty `component_scores`). The report card builder renders one row per result, so the NULL row became a phantom 18th "subject". 15 such orphan rows existed across classes 26 (8), 27 (2), 28 (5). Likely triggered by a ghost `class_subjects` row or a template column whose header didn't map to any `section_subjects` — the upload wrote the row anyway because the path tolerated a null `subject_id`.

**Fix (data):** `DELETE FROM portal_results WHERE subject_id IS NULL` — 15 rows removed.

**Fix (structural):** Migration `015_portal_results_subject_id_not_null.sql` — `ALTER TABLE portal_results ALTER COLUMN subject_id SET NOT NULL`. Any future write with a null subject_id is rejected at the DB layer.

**Fix (app-side):** Two batch paths in `src/AppDemo.jsx` now pre-filter out records with null/NaN `subject_id` and surface a warning instead of letting Postgres reject the whole batch:
- `ResultsAdmin.save` (per-student grid)
- Bulk multi-sheet XLS upload (pushes a warning per affected class: "N row(s) skipped — unresolved subject (ghost class-subject or unmatched template column)")

**New convention:** Any new result upsert path must filter `subject_id != null && !Number.isNaN(+subject_id)` before the insert. Added to CLAUDE.md pitfalls.

---

## Recent Changes (19 Apr 2026) — v32.28

### Add custom line items to existing fee bills
**Location:** `BillDetailModal` in `src/AppDemo.jsx` (~line 16469).

Admins/managers opening Bill Details can now add an ad-hoc line item (e.g. late fee, extra materials) without rebuilding the bill from a template. Also added a remove-X on every compulsory/optional item so mistakes are one click away.

- New inline "Add Custom Item" form: name + amount + optional checkbox → `db.insertFeeBillItems([{bill_id, name, amount, is_optional, is_included:true}])`
- After insert: `db.recalcBillTotals([bill.id])` regenerates `total_amount` (balance auto-recomputes as a generated column), `db.logFeeAction({action:"item_added"})` records it, then `db.getFeeBill(bill.id)` fetches the fresh snapshot and pushes it to parent via `onBillChange`
- Remove button per item calls `db.deleteFeeBillItems([id])` + same recalc/log/refresh flow; guarded by `useConfirm`
- No schema changes — `fee_bill_items` already supports arbitrary rows

---

## Recent Changes (19 Apr 2026) — v32.27

### Teacher class-access restriction flags

**Bug:** "Report Cards — Restrict to Form Class Only" was inverted. The read used `!== "false"`, but the UI stores `"true"` when ON. Net effect: toggle ON behaved like OFF and toggle OFF hid subject-teacher classes entirely. Fixed by comparing against `"true"` so the semantics match the label (ON = form only; OFF/default = form + subject).

**New feature — `teacher_subject_class_students`:** mirror toggle on the Students page in Settings → Portal Restrictions. When ON, teachers only see students in their form class. When OFF (default), they see students in both their form class and subject-teacher classes. Implemented in `StudentsPage.load()` with the same `getTeacherSubjects` + `getAllFormTeachers` pattern used on the report cards page. Admin/manager views are unaffected.

---

## Recent Changes (19 Apr 2026) — v32.26

### Fee bill updates: stop writing the generated `balance` column

**Bug:** Removing a discount from a bill produced `PATCH /fee_bills?id=eq.<id> 400 (Bad Request)`. Same error latent in bulk carry-forward ("mark paid") and in the optional-item toggle path.

**Root cause:** `fee_bills.balance` is declared `GENERATED ALWAYS AS (total_amount - amount_paid) STORED` in migration `010_fees_module.sql`. Postgres rejects any UPDATE containing a generated column.

**Fix (3 call sites):**
- `recalcBillTotals` (`supabaseClient.js`) — dropped `balance` from the update payload. Status/total_amount still written; `balance` is now recomputed by the DB.
- `markBillsPaid` (`supabaseClient.js`) — dropped `balance:0`; setting `status:'paid'` is enough (balance is already 0 when amount_paid≥total_amount, otherwise forcing it is wrong anyway).
- `toggleOptional` in `BillDetailsModal` (`AppDemo.jsx`) — `db.upsertFeeBill({...})` no longer includes `balance`.

**Convention added to CLAUDE.md:** never write `balance` to `fee_bills` — only `total_amount`, `amount_paid`, `status`.

---

## Recent Changes (19 Apr 2026)

### Multi-Tenant Stability Audit — Full Tier 1–5 Fix (supabaseClient.js + AppDemo.jsx)

**Tier 1 — Active data corruption (15 methods fixed):**
- `clearNewEnrolleeOnTermChange` — now scoped to current school (was updating all schools)
- `deleteEmailLog / deleteEmailLogs / deleteEmailLogsBefore` — switched to `supabaseSrv` + `school_id` filter
- `deleteOrphanedBills` — both student and bill queries now school-scoped; added early guard if no school context
- `getFeeItems`, `getTemplateBillCounts`, `getItemBillCounts`, `getFeeAuditLog`, `getOwingBillsForStudents` — all missing school_id filters added
- `getUserPermissions`, `setUserPermission`, `removeUserPermission`, `logPermissionChange`, `getPermissionAuditLog` — permissions no longer leak across schools

**Tier 2 — Upsert UPDATE paths (20 methods fixed):**
- All `upsertX(data, id)` methods now scope the UPDATE to current school: `upsertSection/Class/Subject/SectionSubject/Student/Teacher/Session/Term/Grade/CaeTrait/CaeRating/Fee/Payment/Announcement/FeeItem/FeeTemplate`
- Double-UPDATE methods (`setActiveSession`, `setActiveTerm`, `setDefaultTemplate`, `setActiveTemplate`) — the enabling pass now also filters by `school_id`

**Tier 3 — Anon client → service role (10 methods fixed):**
- `countResultsByClass / countResultsBySubjectClass` — deletion interlocks were always returning 0 due to RLS blocking anon client
- `getStudentRequests / submitStudentRequest / submitStudentRequestsBulk / reviewStudentRequest`
- `getEmailLogs`, `getManualTranscripts`, `saveManualTranscript`
- `logAdminAction / getAdminAuditLog` — also fixed hardcoded `'admin'` → `_performedBy`

**Tier 4 — White-screen guards (.catch added):**
- Dashboard, MyResultsPage (nested CAE chain + results load), ResultsTeacherPage, ResultApprovalsPage

**Tier 5 — Conflict targets + stale dep + race conditions:**
- DB migrations applied: `result_approvals`, `portal_results`, `portal_cae_results` unique constraints now include `school_id`
- `upsertResult` conflict target updated to `school_id,student_id,class_id,subject_id,term_id,session_id`
- `upsertCaeResult` conflict target updated to `school_id,student_id,class_id,term_id,session_id,trait_id`
- `approveEA/revokeEA/approveMA/revokeMA` conflict targets updated to `school_id,class_id,term_id,session_id`
- `ResultApprovalsPage`: removed `students` from both useEffect dep arrays (stale dep / latent infinite loop)
- `ResultsAdminPage` + `ResultsTeachPage`: cancellation flags (`let cancelled`) added to all class/student/approval useEffects — fixes stale async responses on rapid selector changes

### Fee Discount & Bill Fixes (v32.18–v32.25)
- `buildPDF`: computes `totalAfterDiscounts` live from items − discounts (was using stale `bill.total_amount`)
- `recalcBillTotals`: now fetches and subtracts `fee_discounts` before writing `total_amount/balance/status` to DB
- `MyBillPage`: all balance/status display uses IIFE-computed live vars — never reads stale DB fields
- `FeeTrackerPage`: `liveBillStatus()` helper used in filters and stat cards; discount tag chip shown on rows with discounts
- `BillDetailModal`: discounts are now removeable (X button per row → `db.deleteFeeDiscount` → `recalcBillTotals`)
- `applyDiscount`: now calls `recalcBillTotals` instead of manual upsert
- `db.setUser()`: sets `_performedBy` so every audit log entry captures the real actor
- `getStudentOutstandingBalance`: computes live from items − discounts − paid (no stale DB fields)

### Owing Callout Fix (v32.24–v32.25)
- "Outstanding Balances from Previous Terms" banner now compares term IDs rather than string names
- Excludes bills from the active term and any future terms — only genuinely past terms appear
- Bill generation carry-forward prompt (`getOwingBillsForStudents`) unchanged — still prompts when generating future-term bills

---

## Recent Changes (Apr 2026)

### Result Upload Fixes
- Template now generates students per-class using `db.getStudents(null, {class_id})` — no more all-school student lists
- Upload matches student IDs with `String(s.id) === String(row.stuId)` — fixes integer vs string type mismatch
- Duplicate XLS rows treated as warnings (amber "Notices" section), not errors — last value wins
- Zero scores are valid and saved (no longer silently skipped)
- Deduplication uses plain object `{}` instead of `new Map()` — fixes Lucide `Map` icon name collision

### Pagination Fix
- `getResults()` and `getResultsCompleteness()` now paginate in 1000-row batches — fixes students 1001+ appearing to have no results on the approval page

### Ghost Data Cleanup (JSS 3B)
- Removed ghost `class_subjects` assignments pointing to Primary-section subjects
- Removed associated `portal_results` ghost records
- Cause: bad early upload that mixed section IDs

### Dashboard EA Approved Stat
- Replaced "Result Entries" card (capped at 1000, meaningless) with "EA Approved" count
- Uses `countEAApprovedActive()` — resolves active session+term internally, returns exact count

### Interlock System
- Class deletion: blocks if students enrolled, results exist, or report cards published
- Subject removal (single + bulk): blocks if results exist for that subject+class
- Signature deletion: blocks if signature used in any template
- Report template deletion: blocks if template is marked as default
- Student deletion (single): blocks if unrefunded `fee_payments` exist or class has published cards
- Student deletion (bulk): batch pre-screens all selected students; skips blocked ones, deletes eligible

### Internet Connectivity Overlay
- `navigator.onLine` + `online`/`offline` event listeners
- Full-screen blurred overlay with pulsing `WifiOff` icon when offline
- Green `Wifi` reconnected toast (4 seconds) on recovery

### Clear Section Results
- "Clear Section Results" button made self-contained with inline section dropdown
- No longer requires sidebar `ctx.selectedSection` to be set

---

## Recent Changes (3 Apr 2026)

### Mobile Backspace Fix — Mail Compose (subject + body)
**Problem:** On Android WebView (Capacitor app) and Chrome PWA, pressing backspace or delete in the mail compose Subject input and Body textarea had no effect after typing.

**Root cause:** Android IME (virtual keyboard) delivers backspace via composition events (`compositionupdate` / `deleteContentBackward`) rather than standard `input` events. React's controlled inputs (`value={state}`) re-set the DOM value to match state on every render, cancelling the backspace mid-keystroke.

**Fix (`src/AppDemo.jsx` — `MailComposePage`):**
- Added `msgKey` state counter (integer, starts at 0)
- Subject `<input>` and Body `<textarea>` converted from **controlled** (`value={...}`) to **uncontrolled** (`defaultValue={...}`) with `key={`subj-${msgKey}`}` / `key={`body-${msgKey}`}`
- `msgKey` increments whenever content is set programmatically:
  - `applyTemplate()` (template selector)
  - Quick Fill panel click handlers
  - Post-send reset (inside `send()` after success)
- `onChange` handlers remain unchanged — state still updates in real time for validation and send payload
- This pattern ensures: free typing with working backspace, AND programmatic content injection (templates) still works correctly

### Student Registration 409 Conflict Fix (3 Apr 2026)
**Problem:** Registering a new student intermittently gave a 409 Conflict error.

**Root cause 1 — DB row cap:** `nextStudentId()` fetched all student IDs with `.range(0,9999)` but Supabase PostgREST caps client reads at **1,000 rows**. With 1,488 students in the DB, the function only saw ~1,000 of them (in arbitrary order), computed a max from that subset, and generated an ID that already existed → 409 on insert.

**Root cause 2 — Double-click race:** `disabled={saving}` on the Save button relies on React re-rendering before the second click lands. If the user double-clicks faster than one render cycle, both clicks fire `saveStu()` simultaneously, both call `nextStudentId()` and get the same value, and the second insert gets 409.

**Fix (`src/supabaseClient.js`):**
- Added Supabase DB function `get_next_student_id(prefix)` (migration 014) — uses `MAX(CAST(...))` SQL-side, immune to row caps
- Rewrote `nextStudentId()` and `nextStudentIds()` to call `supabase.rpc('get_next_student_id')` instead of fetching all rows

**Fix (`src/AppDemo.jsx`):**
- Added `if(saving)return;` guard at top of `saveStu()` and `saveTea()` — synchronous early exit prevents double-click race before re-render

**DB state confirmed:** Hodo-Anne Sam Okoro does NOT exist in DB (409 was a clean failure — no ghost). She can be safely registered. Next valid ID is `RGS/1494`.

**Migration applied:** `014_next_student_id_rpc` — creates `get_next_student_id(prefix TEXT)` RPC function.

---

### Yahoo Soft Bounce — ZeptoMail Deliverability (3 Apr 2026)
**Observed:** Email to `hodosam13@yahoo.com` soft-bounced with error:
```
TSS04 — Messages from 136.143.188.240 temporarily deferred due to unexpected volume or user complaints
```
**Cause:** ZeptoMail's shared sending IP (`136.143.188.240`) was temporarily flagged by Yahoo's MTA. This is a shared IP reputation issue — other senders on the same IP pool may have triggered it.

**Status:** Soft bounce = temporary. ZeptoMail queues retries automatically. Check ZeptoMail Dashboard → Mail Logs to confirm eventual delivery.

---

## Recent Changes (13 Apr 2026) — v31.7

### 7 New Feature Modules

#### 1. Academic Calendar (`calendar` page)
- Full month-grid view + list view toggle
- Admin CRUD: create/edit/delete events with title, event type (holiday/exam/event/deadline/other), colour picker, date range, session/term tags
- Teachers see calendar (read-only, or edit if admin grants access)
- DB table: `academic_calendar` (migration 016)
- `db` methods: `getCalendarEvents`, `upsertCalendarEvent`, `deleteCalendarEvent`
- Nav: Academic group → visible to admin + teacher

#### 2. Timetable Management (`timetable` page)
- Admin view: period setup modal (add/edit/delete period slots — name, start time, end time, type), then a day × period grid for each class showing subject + teacher
- Teacher view: personal weekly timetable showing only their assigned slots
- DB tables: `timetable_periods`, `timetable_slots` (migration 017)
- `db` methods: `getTimetablePeriods`, `upsertTimetablePeriod`, `deleteTimetablePeriod`, `getTimetableSlots`, `getTimetableForTeacher`, `upsertTimetableSlot`, `clearTimetableSlot`
- Nav: Academic group → visible to admin + teacher

#### 3. Teacher Task Dashboard (TeacherDashboard component)
- Added "Action Items" panel below the quick-action cards
- Shows one "Upload results — [Class Name]" item per class they teach, each linking to results-teach page
- Shows count of pending student enrolment requests if any exist, linking to add-students page
- Shows "No assignments yet" placeholder if teacher has no subject assignments
- High-priority items get an amber dot indicator

#### 4. Notification Center
- `NotificationBell` component in the header (bell icon, unread count badge)
- Polls every 60 seconds for new unread notifications
- Dropdown shows recent notifications with title, body, time ago, mark-read button
- Click a notification navigates to its `link_page`
- "Mark all read" button in dropdown header
- Admin notified automatically when a teacher submits a student enrolment request
- DB table: `notifications` (migration 018)
- `db` methods: `createNotification`, `createNotificationForAdmins`, `getNotifications`, `getAdminNotifications`, `markNotificationRead`, `markAllNotificationsRead`, `getUnreadNotificationCount`

#### 5. Data Export (`export` page)
- 5 export cards: Students (all or by class), Staff/Teachers, Results (by class/term/session), Fee Bills, Attendance Records
- Downloads as `.xlsx` via `xlsx-js-style` with styled headers
- Export runs entirely client-side — no server involvement
- Nav: Administration group → admin only

#### 6. Password Reset (LoginPage)
- "Forgot your password?" link below the login form
- Forgot-password modal: enter staff ID or student ID
- System generates an 8-character random temporary password
- Updates `password_hash` in `teachers` or `students` table
- Sends the temp password to the user's email via the existing `send-email` edge function
- User must change password on next login (social contract — no forced-change enforcement yet)
- `db` method: `_resetPassword(table, userId, newPassword, schoolId)`

#### 7. Login Activity (`activity` page)
- Shows all teachers and students with their `last_login` timestamp
- Tab toggle: Staff vs Students
- 5 summary buckets: Today / This Week / This Month / Over 30 days / Never
- Search by name or ID
- `db` method: `getLoginActivity()` — returns `{students, teachers}` with last_login
- Nav: Administration group → admin only

### DB Migrations Applied
| Migration | Tables Created |
|---|---|
| 016_academic_calendar | `academic_calendar` |
| 017_timetable | `timetable_periods`, `timetable_slots` |
| 018_notifications | `notifications` |

### Router Wiring
All 4 new pages wired in `AppInner` main switch: `calendar` → `AcademicCalendarPage`, `timetable` → `TimetablePage`, `export` → `DataExportPage`, `activity` → `ActivityPage`

### Icon Map
Added `timetable: TableProperties`, `export: Download` to `ICON_MAP`

---

## Recent Changes (13 Apr 2026) — v31

### Platform Admin Console (Super-Admin Portal)

A platform-level super-admin console was added for managing all schools on the SaaS instance. It sits _outside_ any school's portal and is accessed via the School Select screen.

**Login flow:**
- Single 8-digit PIN (default: `50142222`, stored in `platform_admins.password_hash` as plaintext)
- PIN-only — no email/password
- Large digit-spaced PIN input on the School Select page (`SchoolSelectPage`)
- "Change PIN" option available from the Platform Dashboard → Platform Settings tab

**`ChangePinModal` component:**
- Enter current PIN → new PIN → confirm new PIN
- Validates current PIN against `db.getPlatformAdmin()` before saving
- Saves via `db.updatePlatformAdminPin(id, newPin)`

**`PlatformDashboardPage` — full rewrite with three tabs:**

| Tab | Content |
|---|---|
| **Schools** | Table of all schools. Add School (→ `SchoolSignupModal`). Per-school: Plan dropdown, Setup Done badge, Delete button |
| **Audit Log** | Searchable log of all platform-level admin actions. Columns: date, school, action, details |
| **Platform Settings** | Admin account info, Change PIN, platform stats (total schools, by-plan breakdown), danger zone |

**Plan management:**
- Each school has a `plan` field (`'free' \| 'starter' \| 'pro' \| 'enterprise'`)
- Inline dropdown in Schools tab → calls `db.updateSchoolPlan(id, plan)`

**Delete School:**
- `DeleteSchoolModal` — type school name to confirm
- Calls `db.deleteSchool(id)`, logs via `db.logPlatformAction()`

**New `db` methods in `supabaseClient.js`:**
```js
db.getPlatformAdmin()                        // returns {admin} (fixed from {data})
db.updatePlatformAdminPin(id, newPin)
db.updateSchoolPlan(id, plan)
db.deleteSchool(id)
db.getAllPlatformAuditLog()
db.logPlatformAction(adminId, schoolId, action, details)
```

**`platform_admins` DB table:**
- `id, email, password_hash (plaintext PIN), created_at`
- PIN is stored as plaintext (not bcrypt) — acceptable for internal tool; do not expose publicly

---

### Multi-Tenant SaaS Audit — Full Scope Fix (13 Apr 2026)

A comprehensive audit identified 25+ DB query methods in `supabaseClient.js` that were using the anon Supabase client (`supabase`) without `school_id` scoping, or were missing `school_id` in conflict-resolution targets. All have been corrected.

**Core rule enforced:** Every query in `supabaseClient.js` must:
1. Use `supabaseSrv` (service role, bypasses RLS)
2. Filter by `this._schoolId` on every `select`, `insert`, `update`, `delete`
3. Include `school_id` in any `onConflict` target for upserts

**Methods migrated (`supabase` → `supabaseSrv` + school_id added):**

| Method | Change |
|---|---|
| `getClassSubjects` | `supabaseSrv` + `.eq('school_id', this._schoolId)` |
| `setFormTeacher` | `supabaseSrv` + school_id on insert + conflict target |
| `removeTeacherSubject` | `supabaseSrv` + school_id filter |
| `getCaeResults` | `supabaseSrv` + school_id filter |
| `upsertCaeResult` | Injects school_id into data array (handles single obj + array) |
| `getReportPublish` | `supabaseSrv` + school_id filter |
| `upsertReportPublish` | Conflict target updated: `school_id,class_id,term_id,session_id` |
| `getResultApprovals` | Removed broken `profiles` join (table is empty → RLS failure); `supabaseSrv` + school_id |
| `getResultApproval` | `supabaseSrv` + school_id |
| `upsertResultApproval` | Conflict target updated: `school_id,class_id,term_id,session_id` |
| `countEAApprovedActive` | All three sub-queries (session, term, approvals) now school-scoped |
| `getAttendance` | `supabaseSrv` + school_id |
| `upsertAttendance` | Conflict target: `school_id,student_id,date` |
| `getAttendanceSummary` | `supabaseSrv` + school_id |
| `getEmailTemplates` | `supabaseSrv` + school_id |
| `upsertEmailTemplate` | school_id injected + conflict target includes school_id |
| `deleteEmailTemplate` | `supabaseSrv` + school_id |
| `getCaeStructures` | `supabaseSrv` + school_id |
| `getCaeStructureBySectionId` | `supabaseSrv` + school_id |
| `upsertCaeStructure` | school_id injected |
| `deleteCaeStructure` | `supabaseSrv` + school_id |
| `getCaeComponents` | `supabaseSrv` + school_id |
| `upsertCaeComponent` | school_id injected |
| `deleteCaeComponent` | `supabaseSrv` + school_id |
| `replaceCaeComponents` | `supabaseSrv` + school_id on delete + inject on insert |
| `updateManualTranscript` | `supabaseSrv` + school_id |
| `deleteManualTranscript` | `supabaseSrv` + school_id |
| `approveAndCreateStudent` | Dynamic prefix via `this._studentIdPrefix`; school_id injected into student record |

**New interlock `db` methods (replacing unscoped module-level helpers):**

The old module-level functions (`checkDeleteStudent`, `checkDeleteClass`, `checkDeleteTeacher`, `checkDeleteSection`, `batchCountLinked`) in `AppDemo.jsx` used the anon `supabase` client with no school_id. These were removed and replaced with properly scoped methods on `db`:

```js
db.checkDeleteStudent(studentId, classId=null)
  // Checks: unrefunded fee_payments (hard block), published report cards (hard block),
  //         result records (soft warn), legacy payments (soft warn)
  // Returns: { blocks: [{msg, fix}], warnings: [string] }

db.checkDeleteClass(classId)
  // Checks: students enrolled, results exist
  // Returns: warnings: [string]

db.checkDeleteTeacher(teacherId)
  // Checks: class_teachers assignments, teacher_subjects assignments
  // Returns: warnings: [string]

db.checkDeleteSection(sectionId)
  // Checks: classes in section, subjects in section
  // Returns: warnings: [string]

db.batchCountLinked(table, column, ids, extraFilters={})
  // Batched IN() count across table/column for a list of IDs (chunks of 200)
  // All queries scoped to school_id via supabaseSrv
  // Returns: total count (number)
```

All 4 call sites in `AppDemo.jsx` updated:
- `checkDeleteSection(id)` → `db.checkDeleteSection(id)` (Settings → Sections delete)
- `checkDeleteStudent(id, stu?.class_id)` → `db.checkDeleteStudent(id, stu?.class_id)` (Students page delete)
- `checkDeleteTeacher(id)` → `db.checkDeleteTeacher(id)` (Teachers page delete)
- `batchCountLinked(...)` × 4 → `db.batchCountLinked(...)` (Members bulk delete pre-screen)

Old module-level definitions (lines 221–289) removed from `AppDemo.jsx`.

---

### Filter / Search Fixes (13 Apr 2026)

**Problem:** Searching/filtering on Members, Teachers, Students, Fees, and other list pages returned zero results on schools where student IDs are text strings (e.g. `"HLDS/01"`) rather than integers.

**Root cause:** Filter predicates called `.toLowerCase()` on raw ID fields. When the ID is an integer (or a text ID stored as something other than a plain string), this throws a `TypeError: Cannot read properties of undefined` or `TypeError: x.toLowerCase is not a function`, which silently caused the entire filter to return empty.

**Fix:** All ID comparisons in filter callbacks now wrap the value in `String(id||"")` before calling `.toLowerCase()`:
```js
// Before (breaks on integer IDs):
m._id.toLowerCase().includes(q)

// After (safe for any type):
String(m._id||"").toLowerCase().includes(q)
```
Applied to: member `_id`, `phone`; student `id`; all other field comparisons that could be non-string.

---

### Students Page Pagination Fix (13 Apr 2026)

**Problem:** Applying a class filter while on page 2+ of the students list returned an empty page (no students shown) even though matching students existed.

**Root cause:** The class-filter `useEffect` dispatched `setPage(0)` asynchronously. By the time the next render computed the paged slice, `page` was still the old value — so `paged` sliced an out-of-bounds range and came back empty.

**Fix:** Replaced async `setPage(0)` approach with a synchronous `safePage` clamp calculated at render time:
```js
const safePage = Math.min(page, Math.max(0, totalPages - 1));
const paged = filtered.slice(safePage * PER_PAGE, (safePage + 1) * PER_PAGE);
```
All pagination controls now reference `safePage` instead of `page`. This eliminates the flash-of-empty-content between renders.

**No code change was made** — this is a delivery infrastructure issue.

**Mitigation options (if recurring):**
- Upgrade to ZeptoMail dedicated IP (eliminates shared reputation risk)
- Verify SPF, DKIM, DMARC are all passing (check via mail-tester.com)
- Monitor ZeptoMail dashboard for bounce rate trends

---

## Recent Changes (4 Apr 2026)

### Onboarding Modal Auto-Open on Single Student/Teacher Registration (4 Apr 2026)
**Problem:** When registering a single student (or teacher) with an email address, the "Send Login Details?" modal never appeared. It only showed during bulk XLS upload.

**Root cause:** `saveStu()` called `setLastRegistered({count:1, entries:[...]})` but never called `setShowOnboarding(true)`. Same issue in `saveTea()` for teacher registration.

**Fix (`src/AppDemo.jsx`):**
- In `saveStu()`: after `setLastRegistered(...)`, added `setShowOnboarding(true)` — modal now auto-opens on single registration if email is present
- In `saveTea()`: after `setLastRegistered(...)`, added `setShowTeacherOnboarding(true)` — same fix for teacher registration

---

### Refund "Linked Payment Could Not Be Verified" Error (4 Apr 2026)
**Problem:** Processing a refund on a second bill raised: *"The linked payment record could not be verified. Clear the payment reference and try again."*

**Root cause:** `refundForm.payment_id` was a field in `refundForm` state. When the first refund modal was closed (by cancelling, or after success), `refundForm` was NOT reset. The stale `payment_id` from the first bill carried over when the second bill's refund modal opened, causing the verification to find a payment ID from a different bill — mismatch → error.

**Fix (`src/AppDemo.jsx` — `FeeTrackerPage`):**
- Modal `onClose` handler now resets `refundForm` to blank state
- Cancel button `onClick` handler now resets `refundForm` to blank state
- Reset values: `{amount:"", reason:"", payment_id:"", refund_date: today}`

---

### Bill Generation Only Showing 2 of 5 Students — RLS Root Cause Fix (4 Apr 2026)
**Problem:** Generating bills for a class of 5 students reported "5 generated" but only 2 appeared in the Payment Tracker.

**Root cause — `public.profiles` table is empty:**
- The DB has an RLS policy on `fee_bills` using a custom `auth_role()` function
- `auth_role()` reads from `public.profiles` — which is **empty** (never populated)
- `auth_role()` therefore always returns `NULL` when called with the anon key
- The anon Supabase client (`supabase`) has **zero RLS access** to `fee_bills`

**Two bugs in the generation loop that this caused:**
1. **Existence check** used `supabase.from('fee_bills')` — always returned `null` (no access) so duplicate bills were never detected, allowing duplicate inserts for already-billed students
2. **Rollback on items-insert failure** used `supabase.from('fee_bills').delete()` — always silently failed (no access), leaving orphan bill records with no items

**Fix (`src/AppDemo.jsx` — `FeeGeneratePage` generate loop):**
- Existence check changed to `db.checkExistingBill(student.id, template.academic_year, template.term)` — uses `supabaseSrv` (service role), bypasses RLS
- Rollback changed to `db.deleteFeeBill(bill.id)` — uses `supabaseSrv`, rollback now actually works
- Added null-bill guard: if bill insert returns data but `bill` is falsy → log error, skip student
- Added `console.error` logging at every failure point for easier diagnosis

---

### Dark Mode — Site-Wide Contrast Fixes (6 Apr 2026)
**Summary:** Comprehensive audit and fix of all hardcoded hex color values that broke in dark mode.

**Key changes (`src/AppDemo.jsx`):**
- `DARK` palette: `white`/`offWhite` contrast improved; `border` brightened to `#2E4258`; `muted`/`light` raised for WCAG AA
- All 22+ table rows: `i%2===0?"#fff":C.offWhite` → `i%2===0?C.white:C.offWhite` (even rows were pure white in dark mode)
- Members table hover: hardcoded `"#EFF6FF"` → `C.bluePale`; SimpleTable TRow hover → `C.bluePale`
- ClassMultiSelect trigger, Members sort select: hardcoded pale backgrounds → `C.white`/`C.orangePale`
- Confirm dialog, offline overlay, document viewer tip bar, fee info boxes, green info boxes, attendance/mail status badges: all switched to `C.*` tokens
- `background:"#e8edf4"` (document viewer) → `C.offWhite`

---

### Multi-Period Transcript System (6 Apr 2026)

**Feature:** Completely new transcript type — subjects as rows, class/year combinations as column groups (each with 1st/2nd/3rd Term, Average, Grade sub-columns), matching standard Nigerian school transcript format.

#### DB Migrations applied (via Supabase MCP):
**`manual_transcript_score_structure`:**
```sql
ALTER TABLE manual_transcripts
  ADD COLUMN IF NOT EXISTS structure_id integer REFERENCES cae_structures(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS structure_name text;
ALTER TABLE manual_transcript_subjects
  ADD COLUMN IF NOT EXISTS component_scores jsonb;
```

**`manual_transcript_multi_period`:**
```sql
ALTER TABLE manual_transcripts
  ADD COLUMN IF NOT EXISTS transcript_type text DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS class_periods jsonb;
```

#### Data model:
- `manual_transcripts.transcript_type`: `"multi_period"` (new default) | `"legacy"`
- `manual_transcripts.class_periods`: JSON array `[{class_name, academic_year}, ...]`
- `manual_transcript_subjects.component_scores`:
  - multi_period: `{type:"multi_period", periods:[{t1,t2,t3}, ...]}`
  - legacy+structure: `{[colName]: value}`

#### UI (Create Manual Transcript modal):
- Transcript type toggle (Multi-Period / Legacy)
- **Multi-period:** Add/remove class periods (class name + academic year); subject rows each have T1/T2/T3 inputs per period; period columns chunk into groups of 3 (extra periods render as a second stacked table with "Continued" label)
- **Legacy:** Optional score structure selector (loads from `cae_structures` via `db.getCaeStructures()` + `db.getCaeComponents()`); falls back to default T1 CA/Exam/Total × 3 grid

#### PDF builder — `buildMultiPeriodTranscriptHTML`:
- **Header:** school logo circle + school name + "Official Academic Transcript" badge + generated date
- **Student info band:** 4-column grid (Name, ID, Gender/DOB, Class/Section)
- **Score tables:** 3-level headers — Class (navy) → Year (lighter navy, italic) → Term cols (medium blue) + AVG/GRD (navy with gold text). Alternating white/#f4f7fb rows. AVG/GRD cells have a light blue tint. Periods chunk into groups of max 3; each extra chunk renders as a separate stacked table with a blue "Continued" label.
- **Summary row:** 7 cards (Subjects Taken, Passed, Failed, Periods; then Overall Average/Grade/Remark in navy with gold values)
- **Footer:** Class Teacher signature | stamp circle | Principal signature
- **Watermark:** Faint diagonal "OFFICIAL" text (`rgba(30,58,95,.04)`)
- **Color palette:** Navy `#1e3a5f` / medium blue `#3b6fa8` / gold `#f0c040` / light blue tints — professional and print-friendly
- **Print button:** `position:fixed` navy top bar with gold "🖨️ Print / Save PDF" button + Close button + landscape hint. Hides itself before `window.print()` and restores after (same pattern as report cards). Hidden via `display:none!important` in `@media print`.
- **Print CSS:** `@page { size: A4 landscape; margin: 10mm }`

#### Logo source fix:
`TranscriptPage` now reads `const {schoolLogo:logoBase64}=useSection()` — the correct key (`portal_logo_base64` in `school_settings`). Both PDF builders accept `logoBase64` and fall back to initials circle if no logo is set.

---

### Onboarding / Product Tour System (6 Apr 2026)
**Feature:** Dynamic role-based onboarding tour with spotlight highlighting, step-by-step tooltips, and persistence.

**Implementation (`src/AppDemo.jsx`):**
- `TOUR_STEPS_CONFIG` — module-level array of 17 step objects covering all roles (admin, manager, teacher, student). Each step has: `id, title, content, target` (CSS selector), `page, placement, roles, perms` fields.
- `TourSystem` component — mounted inside `AppInner`. Props: `userId, role, canAccess, setPage, isMobile, show, onClose`. Renders via `ReactDOM.createPortal` to `document.body`.
- Spotlight: four `position:fixed` strips around the target element create the dim overlay. A highlight ring with `animation:tourPulse` marks the target.
- Tooltip: gradient progress bar, step dots (clickable), Back/Skip/Next/Finish controls. Positioned above/below/right of target element based on `placement` field. Falls back to centered for `target:null` steps.
- Auto-navigation: on step change, calls `setPage()` then waits 500ms for render before calling `el.scrollIntoView()` and measuring `getBoundingClientRect()`.
- Persistence: `localStorage` key `rgs_tour_done_${userId}`. Auto-starts 1800ms after login if key is absent. Key is set on tour close/finish.
- Trigger button: `<HelpCircle>` icon button added to header (visible to all roles) with `data-tour="tour-trigger"`.
- `data-tour` attributes: added to all sidebar nav item buttons (`data-tour="nav-${n.id}"`) and settings button (`data-tour="settings-btn"`).
- CSS animations: `@keyframes tourFadeIn` and `@keyframes tourPulse` added to global `<style>` tag.

**Fix (`src/supabaseClient.js`):**
- Added new method `db.checkExistingBill(studentId, academicYear, term)` — uses `supabaseSrv`, returns `{data, error}` with `maybeSingle()` result

**Note on `public.profiles` table:** The table is empty and appears to be legacy infrastructure from an earlier auth approach. The `auth_role()` function relies on it. All `fee_bills` DB operations should use `supabaseSrv` (not the anon `supabase` client) to be safe. Do **not** delete the `profiles` table — other RLS policies may reference it.

---
