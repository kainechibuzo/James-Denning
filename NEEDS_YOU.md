# Needs You — apply migrations + redeploy edge function

Everything below requires **your** action. The build sandbox has no Supabase
CLI or database credentials, so none of this could be done from here. The code
is complete, committed, and all three builds pass — the feature simply stays
dormant until these steps run.

Project: **JAMES-DENNING** (Supabase project ref: `mcdcwdfdpqzrzsixmrcg`)
Branch: `arena/01a05d6d-rgs-portal-master` (commit `6d1a6a3` = Phase 1, commit `47ae03c` = Phases 2–3)

---

## NEW: GitHub Action — automatic migrations + function deploys

A workflow now exists at **`.github/workflows/deploy.yml`** ("Supabase Deploy").
Once it lands on `master`, it runs on every push that touches `supabase/**`
(migrations, functions, config) and applies migrations + redeploys all 5 edge
functions automatically.

> ⚠️ **Current status: committed locally (commit `8072be4`) but NOT yet on
> GitHub.** Pushing it was blocked because the arena GitHub connection (a
> GitHub App token) lacks the `workflows` permission that GitHub requires for
> files under `.github/workflows/`. To activate: reconnect GitHub in Arena with
> workflow write access and ask the agent to push it — or add the file
> manually via the GitHub web UI (`.github/workflows/deploy.yml` on `master`,
> content is in the repo working tree).

**To activate it you must set 2 repository secrets**
(Settings → Secrets and variables → Actions):

| Secret | Where to get it |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | https://supabase.com/dashboard/account/tokens → Generate new token |
| `SUPABASE_DB_PASSWORD` | Your Supabase project's database password (set at project creation) |

The project ref is already committed in `supabase/config.toml`, so no third
secret is needed.

**What the action does** (in order):
1. `supabase link --project-ref mcdcwdfdpqzrzsixmrcg`
2. `supabase db push` — applies only migrations not yet recorded remotely
   (016, 017, …). Idempotent — no new migrations = no-op.
3. `supabase functions deploy` — deploys ALL functions
   (`manage-account`, `scheduled-digest`, `send-email`, `send-email-batch`,
   `verify-payment`); per-function `verify_jwt` comes from `config.toml`
   (manage-account already has `verify_jwt = false`).

You can also run it manually from the Actions tab ("Run workflow").

> ⚠️ **Once the action is live, prefer it over the SQL editor for future
> migrations** — it keeps the remote migration history consistent. The pending
> 016/017 can either be applied by pushing to `master` (the action runs them),
> or manually right now using the steps below if you don't want to wait.

---

## Step 1 — Apply migration 016 (Hiring Phase 1, org creation presets)

File: `supabase/migrations/016_org_presets.sql`

**Option A — Supabase CLI** (from the repo root):

```bash
npx supabase db push --project-ref mcdcwdfdpqzrzsixmrcg
# if you need to select it explicitly:
npx supabase migration up --project-ref mcdcwdfdpqzrzsixmrcg
```

**Option B — Dashboard SQL editor**: open
https://supabase.com/dashboard/project/mcdcwdfdpqzrzsixmrcg/sql/new,
paste the whole contents of `supabase/migrations/016_org_presets.sql`, run it.

What it does: creates `org_presets` (seeded catalog: `general_business`,
`dev_shop`), `org_submissions`, `org_tools`, and two nullable columns on
`schools` (`preset_key`, `onboarding_step`). **Zero behavior change for existing
tenants** — all pre-existing rows keep `preset_key` NULL.

## Step 2 — Apply migration 017 (Hiring Phases 2–3, roles + landing pages)

File: `supabase/migrations/017_hiring_roles.sql` — same two options as Step 1
(SQL editor paste, or it will be included in the next `db push`).

What it does: creates `hiring_roles`, `hiring_applications`,
`hiring_messages`, `hires`, `hire_quota_entries` (school-scoped RLS,
`auth_school_id()` policies — same as the live 999b pattern), and 4 public
SECURITY DEFINER RPCs that anon may call (no anon table grants):
`hiring_public_role`, `hiring_public_submit_application`, `hiring_get_thread`,
`hiring_post_message`. Purely additive — no existing table is altered.

> ⚠️ **Order matters**: apply 016 before 017 (017 does not depend on 016, but
> both must be in before the Hiring page is used end-to-end).

## Step 3 — Redeploy the `manage-account` edge function (Phase 1 seeding)

The preset seeding for new org registrations lives in `manage-account`
(`register_school`): it validates `presetKey` against `org_presets`, stamps the
school row, seeds `school_settings` from the preset, and inserts
`org_submissions` + `org_tools`. The deployed function still has the old code —
redeploy it:

```bash
npx supabase functions deploy manage-account --project-ref mcdcwdfdpqzrzsixmrcg --no-verify-jwt
```

Until this runs, registrations degrade to classic orgs (existing behavior) and
the preset picker will only show presets once the function supports them.

---

## How to verify (after Steps 1–3)

1. **Admin**: log in → Administration → **Hiring** (nav icon "user-check").
   Click **New Role**, fill the form (title, description, expectations,
   price range), save.
2. **Publish** the role, then click **Copy link** — it looks like
   `https://portal.…/apply/<slug>`.
3. Open that link in a **private/incognito window**: you should see the
   mobile-first landing page (org name, price chip, goals & expectations,
   apply form) with no login wall. The Vercel rewrite `/(.*) → /index.html`
   already serves it — no Vercel config change needed.
4. Submit an application with a real email → you get a confirmation email with
   your private link `/apply/<slug>?t=<token>`; the admin gets a bell
   notification + an email alert (via the existing ZeptoMail/SES path —
   requires the `send-email` edge function to be deployed, which it already is).
5. Admin: open the application → review → **Start negotiation** → send a
   message. Refresh the applicant's private link — the message appears.
6. **Hire…** → define the quota metric, unit, target, period, and how it's
   measured → **Hire & start quota tracking**. Log progress entries; the
   dashboard shows descriptive status only ("At 60% of quota"), never pay math.
7. If the org's preset disabled the hiring tool, the Hiring page shows an
   **Enable hiring** banner — click it (writes `org_tools`).

## Notes / limits

- The public landing page renders inside the existing SPA shell via a pathname
  check in `App()` — no router, no build-config change, no separate entry file.
- Applicant email confirmation uses the new business-neutral
  `buildNeutralEmailHtml` (the old `buildEmailHtml` is school-branded and is
  not used for public-facing mail).
- Quota/pay: JAMES-DENNING only records and displays quota data. Payments
  between org and hire happen outside the platform; JD monetization
  (subscription) is Phase 4 — not built.
