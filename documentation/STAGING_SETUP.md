# Staging & Safe Testing

Two layers of safety for testing changes before they reach the real schools (RGS / Heyday).

---

## 1. Sandbox school — available now (zero cost)

A hidden test tenant lives **inside the production database**, isolated by `school_id`.
Everything you do in it (promotions, deletes, edits) touches only its own test data — never
RGS or Heyday, because every query is scoped by school.

**How to enter it:**
`https://portal.renaissancegardenschools.com?school=sandbox`

- It is **suspended**, so it never appears in the normal school picker — only this link reaches it.
- Admin login → **User ID:** `admin` · **Password:** `sandbox`
- A purple **🧪 STAGING SANDBOX** banner shows across the top so you always know where you are.

**What's seeded:**
- Section: *Test Section*
- Classes with a progression map already set: **Test JR 1 → Test JR 2 → Test JR 3 → Graduate**
- Session **2025/2026** with 3 terms (3rd = promotion term)
- 6 students: TEST/001–002 (JR 1), TEST/003–004 (JR 2), TEST/005–006 (JR 3)

**Use it to safely rehearse:** the whole Promotions flow (Arm → Commit → Undo), bulk actions,
deletes, bill generation, report cards — anything you'd be nervous to try on live data.

**Reset the sandbox** to its starting state at any time by re-running
`documentation/sql/reset_sandbox.sql` (or ask Claude to reseed it).

**Limit:** it shares the *production database instance*. It's perfect for testing **feature
behaviour**, but it can't test **schema migrations** or **deploys** in isolation — for that,
see layer 2.

---

## 2. Full separate environment — when you want deploy/migration isolation

This gives a completely separate staging site + database, so you can test migrations and
deploys before they touch production. It needs a few steps only you can do (Vercel dashboard +
a database choice). Claude does all the code side.

### A. Staging database (pick one)
- **Supabase branch** (easiest, needs Pro plan): in the Supabase dashboard enable Branching and
  create a `staging` branch — it clones the schema automatically. Cost: Pro plan + branch compute.
- **Separate Supabase project** (free tier): create a new project, then replicate the schema with
  `supabase db dump` (from prod) → restore into the new project via the Supabase CLI. Free, but
  a bit more manual.

### B. Point a staging build at it
1. Create a `staging` git branch: `git checkout -b staging` and push it.
2. In **Vercel → Project → Settings → Environment Variables**, add — scoped to the **Preview**
   environment (the `staging` branch) — your staging Supabase values:
   - `VITE_SUPABASE_URL` = staging project URL
   - `VITE_SUPABASE_ANON_KEY` = staging anon key
   - `VITE_SUPABASE_SERVICE_ROLE_KEY` = staging service key
   - `VITE_APP_ENV` = `staging`
3. Vercel auto-builds the `staging` branch to a preview URL. That URL now runs against staging data.

> Note: today `supabaseClient.js` falls back to the hardcoded production keys if env vars are
> absent. Before wiring staging, Claude should switch it to read strictly from env (no prod
> fallback) and surface `VITE_APP_ENV` as a global banner — say the word and that's a 15-minute change.

### C. Workflow
Work on a feature branch → merge to `staging` → test on the staging URL → when happy, merge
`staging` → `master`, which auto-deploys to production.

---

## Cleanup
To remove the sandbox entirely: delete the school row `f0000000-0000-4000-8000-000000000001`
(its classes, students, sessions, terms, settings cascade or are removed with it), and drop the
`sandbox:` entry from `SCHOOL_SLUGS` in `src/AppDemo.jsx`.
