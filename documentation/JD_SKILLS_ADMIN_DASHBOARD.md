# JD Skills Admin Dashboard — secure import pipeline and catalogue (phases 1–3)

Implementation status for the architecture in `documentation/JD_SKILLS_ADMIN_ARCHITECTURE.md`.
Delivered in source on the skills branch; **release-gated off** (`JD_SKILLS_ENABLED`, default absent → closed), migration not yet applied to staging, no production deployment. Phases 4–5 (runtime discovery wiring into the workforce executor and staged rollout) are specified below but deliberately not enabled in this release.

## What is implemented

### 1. Package inspection without execution (`supabase/functions/_shared/jd-skills-package.ts`)

Pure, dependency-free ZIP inspector used by the trusted backend service only — the browser never parses or reports packages.

- EOCD + central-directory parse; rejects encrypted entries, zip64, symlinks, path traversal, absolute paths, duplicate paths, unsupported compression, oversized archives/entries and decompression bombs (`SKILL_PACKAGE_LIMITS`: 20 MiB archive, 40 MiB total uncompressed, 400 files, 8 MiB/file, ratio 200, path 512, instructions 32 000 chars). CRC-32 is verified for every entry.
- Frontmatter (`name`, `description`, `version` semver, `license` SPDX/`UNLICENSED`; optional bounded `category`, `tags`, `specialist_roles` descriptive only) parsed into a canonical manifest with per-file sha256. Manifest hash = sha256 of canonical (sorted-keys) manifest JSON; package hash = sha256 of archive bytes. Both are provenance, never authority.
- All skill text is untrusted input: credential-like patterns reject (`validation_failed`); prompt-injection patterns record findings and force `needs_review`. Scripts/binaries are flagged `role:"inert_asset", executed:false` and are never executed or installed. No package URL fetching, no dependency installation.
- Statuses: `validated` → treated as needs review anyway by the pipeline (review is mandatory before publication), `needs_review`, `validation_failed`.

### 2. Storage and database (`supabase/migrations/20261122120000_jd_skills_catalog.sql`, rollback in `supabase/rollback/`)

- Private bucket `jd-skill-packages` (ZIP only, 20 MiB cap). The browser uploads once to a short-lived signed URL created by the service; it can never read anything back. All reads happen server-side.
- Tables `jd_skill_packages`, `jd_skill_imports`, `jd_skills`, `jd_skill_versions`, `jd_skill_reviews`, `jd_skill_run_references`, `jd_skill_requests`. RLS enabled; all grants are service-role only; tenant scoping is enforced inside the RPCs via `jd_skills_tenant` (profile-derived, advisory-locked), never from the browser.
- `jd_skill_versions`, `jd_skill_reviews` and `jd_skill_request` receipts are immutable (before update/delete triggers raise `55000`). Every mutating RPC is idempotent under a `request_id` with a full request hash — replays return the original receipt, conflicting requests raise `40001`.
- Lifecycle: import create → complete (records report + manifest, version `n+1` per lower(name), skill to `needs_review`) → independent `jd_skills_decide` (approve/reject; reviewer must differ from the version importer) → `jd_skills_publish` (requires approved current version + recorded independent review) → `jd_skills_lifecycle` (revoke/deprecate). Failed inspections record evidence but create no skill or version.
- Discovery: `jd_skills_resolve` returns published tenant skills as **metadata only** (name, description, tags, score) — never instruction text. Loading: `jd_skills_load` returns the bounded instruction text of the current published version, `treated_as:"untrusted_task_data_never_authority"`, `tools_granted:false`, and records the exact skill version on the run (`jd_skill_run_references`). Revocation removes the skill from discovery and blocks loading immediately.
- Scope stays `tenant_private` (`private`); the schema accepts a `global` scope but has **no write path** in this release — global curation remains a separate reviewed decision (open decision #1).

### 3. Backend service (`supabase/functions/_shared/jd-skills-service.ts`, wired into `jd-automation`)

- `skills.*` actions (`skills.read`, `skills.import.create`, `skills.import.complete`, `skills.decide`, `skills.publish`, `skills.lifecycle`, `skills.resolve`, `skills.load`), administrator-gated (resolve/load also allow managers). Release-gated by `JD_SKILLS_ENABLED`; closed with `releaseEnabled:false, releaseFlag:"JD_SKILLS_ENABLED"` when unset.
- `skills.import.complete` downloads the quarantined archive itself, inspects it in memory (never executing any entry), and hands the report + manifest to `jd_complete_skill_import`. The browser cannot choose a report: only the trusted service calls the DB function, which re-validates the report kind, status, manifest schema and hash.
- Receipts are checked for `hiring_enabled:false, execution_enabled:false` (and `billing_enabled:false` on publish); a hostile or malformed receipt fails the call closed (`502`).

### 4. Admin dashboard (`src/pages/jd-skills.jsx`, `src/software-factory/skills-client.mjs`)

- New admin-only nav entry `jd-skills` (icon `package`), `page:jd-skills` permission, lazy page route in `AppDemo.jsx` (`role==="admin"` gate — navigation is not an authority boundary).
- Flow: choose ZIP → `skills.import.create` → signed upload → `skills.import.complete` → inspection report (status, findings, licence, inert attachments, hashes) → per-skill actions (approve/reject/publish/revoke/deprecate) each requiring a ≥10-char note and a second confirmation, mirroring the agent registry UX.
- `skills-client.mjs` validates every read-back (scope, flags, hashes, status transitions) before the dashboard trusts it; retry after an uncertain result reuses the exact request identifier.

### 5. Tests (all green; `npm run test:skills`)

| Suite | Coverage |
| --- | --- |
| `scripts/test-skills-package.mjs` (10) | ZIP parsing, stored+deflate determinism, traversal/symlink/encryption/bombs, frontmatter validation, injection forces review, credentials reject, licence status, unknown specialist roles never grant access |
| `scripts/test-skills-database.mjs` (13) | Real candidate SQL in PGlite: quarantine target bounds, request idempotency/conflict, tenant isolation, immutable versions, self-review refusal, independence, publication requirements, discovery metadata-only + tenant scope, exact-version run references, validation-failed evidence, immutability triggers, catalog bounds |
| `scripts/test-skills-ui.mjs` (9) | JSDOM: admin gate, boundary copy, signed-upload flow, failed inspection, uncertain-retry request identity, note-gated approve→publish, inert attachment labelling, revoke, metadata-only discovery |
| `scripts/test-skills-service.mjs` (9) | Release gate fail-closed, allowlist/admin gating, mandatory confirm/request id, signed upload target, failed-inspection hand-off, load/discovery receipt validation, hostile receipt rejection |

CI runs `test:skills` in Web CI, verify and deploy workflows. `deno check` passes for `jd-automation` and `jd-execution-worker` including the new service.

## Release sequence (phases 4–5, not yet performed)

1. Apply migration `20261122120000_jd_skills_catalog.sql` to staging (rollback script available); run `jd-backend-release` verification.
2. Set `JD_SKILLS_ENABLED=true` as a Supabase Edge secret after a reviewed backend release; verify the dashboard against staging with two admin accounts (importer ≠ reviewer).
3. Wire `jd_skills_resolve`/`jd_skills_load` into the workforce executor so specialist assignments can discover and load published skills (exact version recorded per run) — this is phase 4 and intentionally not in this release.
4. Rollout decision on a curated global catalogue stays open (architecture doc §13); no write path exists.

## Standing guarantees

- Uploading is never execution approval; review is mandatory before publication.
- Package content is never executed during import, inspection, preview or loading; loaded skill text is untrusted context data that cannot grant tools, bypass approvals, hire, spend or change execution authority.
- Tenant boundaries are enforced server-side; revocation stops discovery and loading immediately; the exact skill version is recorded on runs; versions, reviews and receipts are immutable evidence.
