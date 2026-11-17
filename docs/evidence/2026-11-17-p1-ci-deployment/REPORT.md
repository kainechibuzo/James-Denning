# P1-01 / P1-02 / P1-14 — CI coverage and deployment evidence

- **Assessed:** 2026-11-17T13:30Z (read-only)
- **Tested commit:** `753971562cab3c0b2d4bff303cc6dca27b88826f` (master, merge of PR #103)
- **Delivery owner:** Perplexity Computer (verification agent)
- **Independent reviewer:** Kaine Chibuzo (repository owner) — review is given by approving/merging this PR
- **Method:** GitHub Actions and Deployments APIs via `gh`; unauthenticated HTTPS fetches of public production hosts; local `npm ci`, `npm run build:web`, `npm run test:navigation`, `npm run test:tasks`. No writes to production, Supabase, Vercel settings or secrets.

## P1-01 — latest master, GitHub Actions and actual coverage → **verified**

Expected: identify the latest master commit, confirm the checks that ran on it, and document what those checks do and do not cover.

Actual:

| Workflow | Trigger on master | Result for `7539715` | What it covers |
|---|---|---|---|
| Verify application (`verify.yml`) | push to master, PRs to master | **success** (run 44082224020) | guards, navigation, backend-release, capabilities, settings, usage, foundation, agents, chat-layout, checklist, execution, history, tasks, `verify:web`, `build`, 3 Deno suites |
| Web CI (`ci.yml`) | PRs to master; pushes to **non-master** branches only | success on PR #103 head `b2fcd4b` (run 44081804558) | same Node suites + `npm audit --audit-level=high`, mobile build and **34 Deno suites** |
| JD Background Execution Dispatcher | push + schedule | **success** (run 44082224040) | calls deployed worker; validates response shape |
| Scheduled workers (monitor, ops, documents, task scheduler) | `*/5` or `*/10` cron | last 5 runs each **success** | live worker invocations, not tests |
| JD Business Platform Staging Verification | daily cron | **failing 4 consecutive days** (latest 43878348117) | fails deliberately: staging secrets `JD_STAGING_*` are not configured |
| Configure production Supabase Auth | manual | no recent runs | blocked on rejected `SUPABASE_ACCESS_TOKEN` (see NEEDS_YOU.md) |

Local reproduction on the same commit: `build:web` succeeds (one 1.8 MB spreadsheet-vendor chunk warning); navigation 106/106 and tasks 250/250 pass.

Coverage gaps found (limitations, not failures of P1-01):

1. The 34 Deno suites and `npm audit` run only on PR heads, never on the master merge commit itself.
2. Cron schedules of every 5–10 minutes actually execute roughly every 6–9 hours (GitHub schedule throttling). Worker "every 5 minutes" assumptions are false in practice.
3. No CI job exercises authenticated browser flows, live RLS/tenant isolation or Edge Function behaviour; staging verification cannot run until isolated staging exists (P1-15, P7-10).

Raw data: `actions-runs.json`.

## P1-02 — Vercel production identity and live behaviour → **unverified (finding)**

- GitHub Deployments shows Production deployment `7853035983` for `753971562c` with state **success**, URL `james-denning-80nwvjjid-james-projects-57651351.vercel.app`. Identity is confirmed.
- That host and `james-denning-james-projects-57651351.vercel.app` return **302 to Vercel SSO** — production JD is behind Vercel Deployment Protection, so live behaviour cannot be tested without an authorised account.
- **The README's "Current deployment URL" `portal.renaissancegardenschools.com` does not serve JD master.** It returns an app titled **"Apex"** (served from Vercel cache, `age` ≈ 42 h) whose 48 asset chunks have no `AppDemo`, `saas-entry`, `public-landing` or `jd-operations` chunks present in the master build. It is a different/older deployment. Owner decision required: point the domain at the `james-denning` project, or correct the README.

Raw data: `vercel-deployments.json`.

## P1-14 — deployed bundles contain no privileged secrets → **unverified (partial)**

- Scanned all 48 JS chunks reachable from `portal.renaissancegardenschools.com` (hashes in `live-custom-domain-assets.sha256`) for JWTs (decoded `role` claims), `service_role`, `sb_secret_`, Stripe/Paystack secret keys, AWS keys, OpenRouter/OpenAI-style keys, Resend, Slack, GitHub tokens, private-key blocks and `JD_*SECRET*` names.
- Found only **public** keys: a Paystack public key (`pk_live_…`) and a Supabase publishable key (`sb_publishable_…`). Both are designed to be shipped to browsers. No privileged secret found.
- Not verified because the actual JD production bundle is behind Vercel SSO and was not scanned. Next action: scan the protected production deployment with an authorised session, or disable protection on a production alias.

## Not changed

No checklist item other than P1-01 is marked verified. No production data, deployment, migration, secret or domain was changed.
