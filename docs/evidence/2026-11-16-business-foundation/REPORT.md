# Business foundation — coordinated local implementation evidence

**Outcome: a connected foundation is implemented and tested locally. The full autonomous platform is NOT complete or production-accepted.**

Branch: `arena/b6f2b101-james-denning`

Base: `17a16ae00541d8dbf43fb0dc399619a346e0c7da`

Product authority: `prompts/arena/prompts.md`, `prompts/arena/JD-FEATURE-SHEET.md`, plus the user's clarification that normal platform billing remains and AI employee usage is additional.

No cloud resource, production write, real provider search, actual credential configuration, employee hiring, billable work, migration application, function deployment, PR, merge or owner release approval was performed in this implementation pass. All database/provider evidence here is synthetic/local. Source and artifact hashes identify the tested working tree, not a deployed revision.

## Implemented

- Business Builder inside existing Business operations: validated Business DNA, six industry-specific module specifications without automatic departments, proposed KPIs/workflows, workforce recommendations, connector capability needs and a clearly labelled context-only advisory brief.
- **16 distinct draft employee definitions**, searchable by role/category/capability, with permissions, limitations, proposed pricing and evaluation criteria. **0 evaluated; 0 hireable; billing disabled.** The 400+ evaluated target is not represented as delivered.
- Versioned business/SaaS definition documents with canonical server validation, service-only SQL writes, RLS SELECT for tenant owners/admins, optimistic version checks, replay-safe save requests, immutable content hashes, retained restoration provenance and atomic approval/run/audit creation.
- Human content review through the existing approval endpoint/RPC. No execution permissions are granted. Restoring old input creates a new pending version; old approvals do not carry forward.
- SaaS Studio's explicit save action with persisted-content read-back and subsequent same-session revisions, plus saved-version inspection/restore in Business Builder.
- Chat/MCP tools for preview, truthful draft catalogue inspection and reading **current approved** blueprint/evidence records. Pending current revisions do not fall back to stale approved versions. Reader and tool availability remain tenant/role scoped.
- Encrypted tenant-bound SerpApi credential configuration/replacement/deletion; no browser storage or secret read-back. Server-only, default-disabled research; explicit request consent; atomic quota reservations; bounded adapter and sanitised provenance stored before success is acknowledged.
- Additive employee usage **quote arithmetic**, not a billing ledger or charge path. Deduplication/conflict checks, active-only interval aggregation, UTC validation, conservative microdollar rounding and budget comparison. Normal platform billing remains unchanged.
- Candidate migration and guarded rollback, CI suites, real-browser flows, documentation and retained failure evidence.

## Actual validation results

| Command | Result | Evidence |
|---|---:|---|
| `npm run test:foundation` | **91 passed** | `test-foundation.log` |
| `npm run test:agents` | 63 passed | `test-agents.log` |
| `npm run test:settings` | 57 passed | `test-settings.log` |
| `npm run test:capabilities` | 58 passed | `test-capabilities.log` |
| `npm run test:execution` | 276 passed | `test-execution.log` |
| `npm run test:tasks` | 250 passed | `test-tasks.log` |
| `npm run test:navigation` | 106 passed | `test-navigation.log` |
| `npm run test:history` | 23 passed | `test-history.log` |
| `npm run test:backend-release` | 82 passed | `test-backend-release.log` |
| `npm run test:checklist` | 13 passed; no live acceptance advanced | `test-checklist.log` |
| **Node total** | **1,019 passed, 0 failed** | Logs above |
| `npm run test:guards` | 43 guard checks passed | `test-guards.log` |
| `npm run test:chat-layout` | Chat 6 + settings 4 + SaaS Studio 4 + foundation 4 viewport flows passed | `browser.log` |
| `npm run verify:web` | Passed build and web verification | `verify-web.log` |
| `npm run build:mobile` | Passed | `build-mobile.log` |
| `npm run build` | Passed | `build.log` |
| Deno checks of collected automation/worker/MCP entrypoints | Passed | `deno-check.log` |
| `npm audit --audit-level=high` | 0 vulnerabilities reported | `npm-audit.log` |

Node 22.22.3 and Chromium 153.0.8010.0. npm dependencies installed from the lockfile. Deno used its separate dependency cache with `--no-lock --node-modules-dir=none`. Existing release collection assembled both `.ts` and `.mjs` shared modules, including the worker's nested layout; this is not a signed/approved deployment artifact.

## Database and endpoint evidence

`synthetic-persisted-records.json` contains actual local PGlite records from the tested chain: authenticated synthetic owner → actual HTTP handler → actual save RPC → immutable version + pending existing approval + run/audit → actual human approval RPC/endpoint → read-back with **execution not performed**.

The migration and tests cover:

- Invalid/untrusted design contracts, unauthorised profile roles and direct anon/authenticated calls to privileged RPCs.
- Actual RLS reads for tenant owner, other-tenant owner and staff; no direct authenticated mutation or credential-table access.
- Same-request replay, conflicting request reuse, stale revision rejection and cross-tenant edit/read/restore denial.
- Trigger-enforced immutable content; audit failure rolling back document/version/approval/run creation.
- Restore as a new pending version with source-version provenance, keeping the previous approved record intact.
- Credential encryption/decryption, transactional metadata/audit, deletion, wrong-tenant envelopes and credential-version-scoped reservations.
- Per-minute and rolling-day limits, including failed and reserved attempts.
- Empty-schema rollback/reapply and populated-schema rollback refusal.
- Current approved context only; stale previous approvals are not promoted when a new revision awaits review.

**Limitations:** synthetic `auth.uid()`/profiles and a PostgreSQL SHA wrapper stand in for live Supabase JWT/pgcrypto. PGlite tests are sequential, not proof of concurrent locking, live RLS gateway behaviour, production migration order or hosted performance. Existing control-plane DDL and the real `jd_decide_approval` function are extracted for the fixture; the entire historical schema is not replayed.

## Research and billing evidence

Provider tests use injected synthetic fetch responses, not the internet or real keys. Tested: missing credentials, invalid queries/locale/count, success and empty outcomes, invalid/revoked-key responses, quota/rate/provider errors, malformed/oversized bodies, timeouts/network exceptions, source metadata, unsafe links and secret redaction. No automatic provider retries or fallback occur. Searches require the server release gate, explicit admin consent and a reserved quota slot. A successful provider result is not a verified business fact.

Credential values do not appear in API status responses or browser storage; a synthetic configured key clears from the form even on failure. Prior-key success is not proof a replacement key works. Real provider/reverse-proxy log redaction, actual revoked keys, costs and provider acceptance remain unverified. No paid query was sent.

Usage tests validate active-only additive estimates, exact-event deduplication, rejection of overlaps/conflicting IDs/invalid times, simultaneous employees counting separately and budget comparisons. **There are no durable employee usage records, invoices or charges.** The quote cannot authorise an executor or alter platform subscription pricing.

## Browser evidence

Actual React components/CSS run in Chromium with synthetic service responses; **not the deployed site**. Four widths: 360, 393, 708 and 1280px. The foundation flows include:

1. Industry-specific preview and save/read-back, including double-click locking.
2. Explicit human content approval confirmation; no decision sent before confirmation.
3. Revision and restore to a new pending version.
4. Catalogue filtering with all hiring buttons blocked.
5. Credential-input clearing, disabled research release gate and explicit key deletion confirmation.
6. Identity reset and persisted SaaS definition saves/revisions.

No page errors or horizontal overflow observed (`browser-results.json`). `builder-393.png`, `builder-1280.png`, `workforce-393.png` and `workforce-1280.png` show actual synthetic fixture states. Mounted React tests additionally cover late-response suppression on workspace switch, role downgrade, invalid backend receipts and failed previews.

## Failures found and corrected

- Initial packaged Deno check found a union-type narrowing error for business versus SaaS document titles. Corrected by discriminating the returned object's properties. Original failure: `deno-initial-failure.log`; final checks pass.
- Browser checks exposed unstable accessible names on the Industry selector and populated goals textarea. Added explicit accessible labels for selector and textareas; all four flows then passed. Originals: `browser-label-failure-1.log`, `browser-label-failure-2.log`.
- The first actual approval-route fixture rejected the existing endpoint's scoped run lookup because the fixture allowlist omitted `jd_automation_runs`. Added that read to the test adapter; actual approval/read-back and tenant denial pass. Original: `approval-fixture-failure.log`.
- Existing build large-chunk and Node module-type warnings remain; they did not fail checks and are not claimed fixed.

## What “apply everything” has NOT completed

This branch is a substantial foundation pass, not all acceptance criteria. The following are still implementation gaps—not simply deployment toggles:

- 400+ evaluated/published employees, operational evaluation records and tenant hiring/lifecycle management.
- An isolated, authorised code/agent runner, actual tool bindings, bounded multi-agent orchestration and executable new workflows.
- Activated generated pages/navigation/modules; legacy organisation-builder fixed department defaults remain elsewhere.
- Verified connector-provider marketplace and integration with actual connected/discovered tool inventory.
- End-to-end software generation, repositories, builds/security evidence, customer preview deployment and post-deploy verification.
- Research caching/backoff/provider expansion, retrieved-page inspection and evaluated Business Advisor synthesis/goal tracking.
- Executor-linked usage ledger, currency budgets/enforcement, commercial retry/failure/dispute policies, invoices/reconciliation and payments.
- Live JWT/RLS/concurrency/provider validation, independent isolated staging, deployment and explicit owner acceptance.

No existing checklist item was marked production-verified. No secrets, actual employee charges, new billable infrastructure or production approval were introduced. Migration and backend releases remain separate reviewed gates; never run blind `db push --include-all` against the divergent history.

See [implementation/release guide and full area map](../../../documentation/JD_BUSINESS_FOUNDATION.md). Source hashes cover changed source/tests/docs; artifact hashes cover this evidence bundle. The next implementation must not treat a `foundation.review` approval as hiring, execution, spending or deployment authority.
