# JAMES-DENNING — Project Notes

> Rebranded 20 Aug 2026 as a business operations platform. The UI defaults to neutral business terminology and monochrome branding; legacy school-compatible database names and education workflows remain intact. See `documentation/PROJECT_NOTES.md` for the canonical, full notes.
_Last updated: 1 Sep 2026 (v32.94 — Phase 6: public landing page + email login + business picker)_

---

## Phase 5 — General-purpose Business Dashboard (1 Sep 2026, v32.93)

The product is now a **business-first dashboard for all business types** by default:

- `education_module_enabled` defaults to **false** (was true); education UI is an explicit
  per-tenant opt-in via Settings → Workspace Profile (toggle off by default).
- Business-mode nav hides school-specific items (`classes`, `subjects`, `sections`,
  `timetable`, `broadsheet`, `assignments`, `results`, `report-cards`, `transcript`,
  `academic-summary`, `report-card-settings`, `grading`, `attendance`, `my-classes`,
  `results-teach`, `my-results`, `my-bill`) via the `eduOnly` set in `AppDemo.jsx`. Education
  mode restores the full academic nav via `EDUCATION_NAV_LABELS`.
- New general-purpose modules (migration `018_business_modules.sql`, **pending apply**):
  - `customers` — CRM (contacts & companies, status, notes)
  - `projects` + `project_tasks` — projects with status, dates, customer link; tasks with
    status flow (todo → in_progress → done/blocked), due dates
  - `invoices` + `invoice_items` — business invoices with line items, status flow
    (draft → sent → paid/overdue/cancelled)
  - All school-scoped RLS (`school_id = auth_school_id()`), same 999b pattern (not FORCE).
- New pages `src/pages/business.jsx` (`CustomersPage`, `ProjectsPage`, `InvoicesPage`), nav
  routes `customers`/`projects`/`invoices` under Administration, `db.*` methods added.
- Zero behavior change for existing tenants: education data intact, hidden until opt-in.
  Hiring Phases 1–3 unchanged.

## Phase 6 — Landing page + email auth + business picker (1 Sep 2026, v32.94)

- **Public landing page** at `/` (`src/pages/landing.jsx`, `LandingPage`): marketing page
  (hero, 8 features, how-it-works, CTA band, footer) — business-neutral JAMES-DENNING. `App()`
  in AppDemo.jsx renders it for the `/` path (same SPA pattern as `/apply/`); everything else
  (e.g. `/app`) renders the application. PWA `start_url` moved to `/app`.
- **Email-first login** (`src/pages/auth.jsx`, `EmailAuthPage`): one email + password →
  `db.loginLookupByEmail` → `login_lookup_by_email` RPC (migration `019_email_login.sql`,
  pending apply) returns every business the email belongs to (admin via schools.admin_email,
  staff via teachers.email, member via students.email) plus each identity's deterministic
  synthetic auth email. The client authenticates against Supabase Auth (same password) and
  shows a **business picker** (deduped per school; admin > teacher > student). Picking a
  business opens that workspace — same checks as `authLogin` (student status, login-disabled
  settings), no page reload.
- Classic "organization + ID" login remains fully available via the link on the email page
  (`authMode === "classic"`), including Register New Business (OrgSignupModal) and Platform
  Admin login.
- Migration 019 is purely additive (one SECURITY DEFINER function, no tables).

## CI/CD (1 Sep 2026)

`.github/workflows/deploy.yml` — "Supabase Deploy": on push to `master` touching
`supabase/**` (or manual dispatch) it runs `supabase link` →
`supabase db push` (migrations) → `supabase functions deploy` (all edge
functions). Needs repo secrets `SUPABASE_ACCESS_TOKEN` + `SUPABASE_DB_PASSWORD`.

## How to Use This File

Read **`CLAUDE.md`** first (code rules + pitfalls), then this file (full product reference).
Together they replace reading any code to get up to speed.

## Hiring Phase 1 (1 Sep 2026, v32.91)

Org creation with business-type presets — the first phase of the hiring feature area. New
`src/pages/hiring.jsx` (routes `org-create` / `org-create-details` + `OrgSignupModal` replacing
the old `SchoolSignupModal`), new `db.*` methods (`getOrgPresets`, `getOrgSubmission`,
`getOrgTools`, `setOrgTool`), and migration `supabase/migrations/016_org_presets.sql`
(`org_presets` seeded catalog, `org_submissions`, `org_tools`, nullable `schools.preset_key` +
`schools.onboarding_step`). **Zero behavior change for existing tenants (preset_key NULL)** —
schema is purely additive. Preset seeding is server-side in `manage-account register_school`
(redeploy the edge function for it to take effect). Migration NOT yet applied; hiring Phases 2+
(postings + landing pages, chat, quota tracking) build on `org_tools`. See
`documentation/PROJECT_NOTES.md` for the full write-up.

## Hiring Phases 2–3 (1 Sep 2026, v32.92)

Postings → auto-generated ad-ready landing pages → applications/negotiation → hires with
owner-defined quota tracking. The differentiator is **push**: the org owner runs their own ad
spend/targeting; JAMES-DENNING generates and hosts the mobile-first destination page.

- **Public landing page** at `/apply/<slug>`: no auth, no portal chrome. `App()` in AppDemo.jsx
  checks `window.location.pathname.startsWith("/apply/")` and renders `PublicHireLanding`
  (imported from `src/pages/hiring.jsx`) instead of the portal shell. `?t=<token>` turns it into
  the applicant's private thread view (15s polling). Served by the existing Vite SPA + Vercel
  rewrite — no build-config change.
- **Public access model**: anon has NO table grants. All public reads/writes go through 4
  SECURITY DEFINER RPCs in `017_hiring_roles.sql` (same pattern as `999c_login_lookup_*`):
  `hiring_public_role(p_slug)`, `hiring_public_submit_application(...)` (validates role +
  name/email, inserts application with a `gen_random_bytes(24)` bearer token, inserts an in-app
  notification via the existing `notifications` table), `hiring_get_thread(p_token)`,
  `hiring_post_message(p_token, ...)`.
- **Admin UI**: `HiringPage` (nav `hiring`, Administration group, admin role). Tabs: Roles
  (CRUD, publish/unpublish, copy landing link, close; delete is interlocked when applications
  exist), Applications (status flow new→reviewing→negotiating→hired/rejected/closed + negotiation
  thread), Hires & Quota (hire creates the quota definition — metric, unit, target, period,
  measure-method all set by the owner — progress bars, quota entry log, internal chat continuing
  the thread, end-hire). 30s polling while modals are open.
- **Notifications**: new applications notify the admin in-app (RPC insert) + email via
  `db.sendAdminAlert` + `buildAlertEmail` (ZeptoMail/SES edge function — the existing path; no
  second notification system). Applicants get a confirmation email via `sendPortalEmail` +
  `buildEmailHtml`.
- **Quota language is descriptive only**: "At 60% of quota — 24 of 40 tickets logged".
  JAMES-DENNING records and displays; it never calculates or promises pay.
- Migration `017_hiring_roles.sql` — **NOT yet applied**; it is purely additive (5 new tables,
  new RPCs, no changes to existing tables).

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

**Ad-hoc migrations applied via Supabase MCP (not in migration files):**
- `last_login timestamptz` added to `students` and `teachers`
- `permission_audit_log` table created
- `role text NOT NULL DEFAULT 'teacher'` added to `teachers`

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
- **ZeptoMail hard bounces (28 Apr 2026):** 143 student records identified with invalid parent email addresses (5.1.1 — account does not exist). Full list produced (see session transcript). Corrections in progress — follow up expected ~9 May 2026. Until fixed, these addresses will continue bouncing on every bulk email send (onboarding, report cards, reminders). Notable patterns: siblings sharing one dead email, placeholder addresses like `daniel2@gmail.com`, `tina@gmail.com`, `amie@gmail.com`.

---

## TODOs / Next Steps

- [ ] Confirm AWS SES production access — check email from AWS
- [ ] Rotate AWS IAM access keys (`rgs-portal-ses`)
- [ ] Add Paystack live key to Vercel env vars
- [ ] Verify `action:manage_attendance` permission works end-to-end
- [ ] Test all RBAC permission toggles (especially student report view + download)
- [ ] Test student deletion interlock end-to-end (fee payments + published cards)
- [ ] Update 143 student records with corrected parent email addresses (ZeptoMail hard bounces — corrections expected ~9 May 2026)
- [ ] After email corrections: send a test email to each updated address before next bulk send to verify deliverability

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
