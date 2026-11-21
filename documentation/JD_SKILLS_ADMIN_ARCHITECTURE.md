# JD Skills Admin Dashboard — Architecture Proposal

**Status:** Proposed architecture  
**Scope:** Design document only; no application code, database migrations, Storage buckets, or deployments are changed by this document.  
**Repository:** `kainechibuzo/James-Denning`

## 1. Purpose

Give authorised JD administrators a secure dashboard where they can upload a skills package as a ZIP, inspect what it contains, validate compatibility, and publish approved skills for JD's specialist workforce to discover and use.

The dashboard should reduce friction when expanding JD's specialist capabilities without creating a second agent system or weakening the existing Agent Registry, approval, tenant-isolation, or execution-authority controls.

## 2. Core product principles

1. **Upload is not execution approval.** A ZIP upload creates an import candidate. It does not publish a skill, create an agent, grant tools, or authorise external actions.
2. **Review before publication.** Every package passes scanning, parsing, compatibility checks, dependency and licence review, and an administrator's explicit publish action.
3. **Skills are capability instructions, not unrestricted code.** Markdown instructions and reference material may be loaded into an agent's context. Scripts and executable assets are inert by default and are never run merely because they were included in a ZIP.
4. **Existing JD controls remain authoritative.** A skill cannot grant permissions, approve its own actions, bypass human approval, hire agents, spend money, deploy software, or write to customer systems.
5. **Tenant boundaries are enforced server-side.** Browser visibility is not an authorisation boundary. Every read, upload, review, publish, assignment, and download is checked by trusted backend code.
6. **Provenance and auditability are mandatory.** Record source, package hash, version, licence, importer, reviewer, validation results, publication history, and every lifecycle transition.

## 3. Proposed user experience

Add a **Skills** area to the existing authenticated administration experience.

### Dashboard overview

Show:
- Total imported packages
- Published and available skills
- Skills awaiting review
- Failed or blocked imports
- Recently updated skills
- Compatibility and licence warnings

### ZIP import flow

1. Administrator opens Skills and selects **Upload ZIP**.
2. The browser uploads the package to a private quarantine location using a short-lived, authorised upload flow.
3. The backend creates an import record and computes a cryptographic package hash.
4. A trusted importer inspects the archive without executing its contents.
5. The importer produces a structured manifest, file inventory, compatibility report, dependency report, and licence/provenance report.
6. The dashboard displays a review screen with detected skills, warnings, errors, and proposed metadata.
7. An administrator can reject the package, request corrections, or approve it for publication.
8. Approved skills become discoverable by JD's specialist selection layer according to their publication scope and assignment policy.

### Skill detail view

Each skill should have:
- Name, description, category, tags, and intended specialist role
- Source repository or provider and original author, where known
- Package version and content hash
- Licence identifier and attribution requirements
- Compatibility status and supported format
- Included files and references
- Dependencies and declared tools
- Validation history
- Publication status and visibility
- Assigned organisations or workspaces, where applicable
- Version history, reviewer, and audit trail

### Lifecycle states

`uploaded → quarantined → scanning → needs_review | rejected | validation_failed → approved → published → deprecated | revoked`

A published skill can be revoked immediately. Revocation prevents new discovery and loading; active runs should be handled according to a documented safe-stop policy.

## 4. Package format and compatibility

The first release should support a clearly defined, conservative format rather than claiming universal compatibility.

### Initial supported content

- `SKILL.md` with YAML frontmatter where present
- Markdown instruction and reference files
- Plain-text documentation
- JSON or YAML metadata that passes schema validation
- Static assets that are safe to store and reference

### Compatibility processing

The importer should:
- Validate archive structure and file paths.
- Reject path traversal, absolute paths, duplicate/conflicting paths, symlinks, and suspicious archive entries.
- Enforce upload, decompressed-size, file-count, and per-file limits.
- Detect unsupported or ambiguous formats.
- Parse frontmatter and validate required fields.
- Normalise names, descriptions, tags, and role metadata.
- Build a deterministic manifest and content hash.
- Identify declared dependencies and external service requirements.
- Record licence information and flag missing or incompatible licences.
- Scan text and metadata for prompt-injection patterns and instructions that attempt to override JD's system or security policies.
- Produce actionable errors and warnings rather than silently rewriting package contents.

### Scripts and executable files

Scripts, binaries, and install hooks are **not executed** during import, validation, preview, or normal skill loading. Initially they should be recorded and flagged as unsupported or inert attachments. Any future execution capability requires a separate sandbox design, explicit allowlisting, resource limits, security review, and independent approval.

## 5. Runtime architecture

The dashboard is an administration surface over a shared Skills Catalog and JD's existing specialist workforce.

```text
Administrator
    |
    v
JD Skills Admin UI
    |
    v
Authenticated Skills API (server-side role checks)
    |
    +----> Private quarantine storage
    |
    +----> ZIP inspection and validation worker
    |          |
    |          +----> Package manifest
    |          +----> Compatibility report
    |          +----> Licence / provenance report
    |          +----> Security findings
    |
    v
Review and publication service
    |
    v
Skills Catalog (versioned, auditable)
    |
    v
Skill discovery and matching layer
    |
    v
JD Agent Architect / specialist workforce
    |
    v
Existing Agent Registry + execution authority + approvals
```

### Main components

**Skills Admin UI**
- Upload, progress, preview, review, publish, revoke, and version-history screens.
- Uses the existing authenticated application shell.
- Never contains service-role credentials or trusts client-supplied roles.

**Skills API**
- Authenticates the user and checks platform-level or workspace-level permissions.
- Issues short-lived upload permissions for a specific quarantine object.
- Creates import jobs and exposes status and reports.
- Enforces tenant scope and lifecycle transitions.

**Importer and validator**
- Processes archives in an isolated worker.
- Does not execute package code.
- Applies archive-bomb and path-traversal protections.
- Produces a normalised manifest and validation report.

**Skills Catalog**
- Stores canonical skill metadata, versions, content hashes, source provenance, licence data, validation reports, and publication state.
- Keeps immutable versions; updates create new versions rather than overwriting published content.

**Discovery layer**
- Matches a task to eligible skills using descriptions, tags, role compatibility, and administrator assignments.
- Loads only the selected skill instructions and explicitly approved reference assets.
- Returns the skill identity and version to the run record for traceability.

**Agent workforce**
- Continues to use JD's existing agent definitions, evaluator controls, tool allowlists, execution authority, and approval lifecycle.
- A skill may guide how an agent performs an allowed task; it cannot expand what that agent is authorised to do.

## 6. Data model proposal

Names below are illustrative and should be reconciled with the current production schema before writing migrations.

| Entity | Purpose |
|---|---|
| `jd_skill_packages` | One imported ZIP and its source/provenance metadata |
| `jd_skill_imports` | Import job, status, actor, package hash, and processing timestamps |
| `jd_skills` | Canonical skill identity and descriptive metadata |
| `jd_skill_versions` | Immutable version, manifest, content hash, and compatibility result |
| `jd_skill_files` | File inventory and private object-storage references |
| `jd_skill_reviews` | Reviewer decisions, notes, and evidence |
| `jd_skill_assignments` | Which organisations/workspaces may discover a skill |
| `jd_skill_run_references` | Skill version loaded for a given agent/task run |
| `jd_skill_audit_events` | Append-only lifecycle and administrative events |

All tenant-owned rows must include and enforce tenant scope. Global catalog records must be explicitly distinguished from tenant-owned records; do not use nullable tenant IDs as an informal access-control mechanism.

## 7. Access control and security

### Administrator access

- Use the application's established authentication and trusted role model.
- The backend must independently verify the user's authority for every privileged operation.
- Do not use the legacy `platform_admins` PIN table as a login mechanism.
- Define whether the dashboard is for platform operators, organisation owners/admins, or both. These are different authority levels and must not be conflated.

### Storage

- Use private storage buckets only.
- Keep uploaded ZIPs in quarantine until validation completes.
- Store extracted content privately; do not expose public object URLs.
- Use short-lived signed access only where required.
- Apply retention and deletion policies to rejected uploads and temporary extraction data.

### ZIP and content safety

- Defend against path traversal, symlinks, decompression bombs, oversized files, excessive file counts, malformed archives, and MIME/type spoofing.
- Never trust filenames, metadata, frontmatter, or package-provided URLs.
- Do not fetch arbitrary URLs or install dependencies during import.
- Treat all skill text as untrusted input. It must not override system instructions, tenant isolation, tool policy, or approval requirements.
- Keep import processing idempotent so retries cannot create duplicate package versions or duplicate publication events.

### Audit events

Record at least:
- Upload initiated and completed
- Import started, passed, failed, or quarantined
- Validation findings
- Review requested, approved, or rejected
- Skill published, assigned, deprecated, or revoked
- Skill selected and loaded for a run
- Actor, tenant/platform scope, timestamp, package/version ID, and correlation ID

## 8. Integration with the existing Agent Registry

The Skills Catalog is a source of specialist knowledge and task procedures. The Agent Registry remains the source of agent identity, versioning, evaluation, and execution authority.

Recommended relationship:
- A specialist definition may declare compatible skill IDs or categories.
- The discovery layer selects skills at task time based on the request and the specialist's allowed scope.
- A run records the exact skill version it loaded.
- Skill publication does not publish an agent definition.
- Agent publication does not automatically approve every skill.
- Skills cannot add tools to an agent's allowlist or change execution authority.
- Existing approval gates remain in place for external actions and consequential writes.

## 9. Global versus organisation-private library

**Decision still required.** The earlier product discussion raised two possible visibility models. The architecture should not silently assume one.

### Option A — Global platform catalogue

A platform administrator imports and curates skills once. Approved skills can be made available to multiple organisations. Organisations may still enable or disable individual skills for their own workspace.

Advantages:
- One curated source of truth
- Less duplicate importing and maintenance
- Consistent versioning and security review

Requirements:
- Separate platform-admin permissions from organisation-admin permissions
- Explicit publication and assignment records
- Clear handling of licence restrictions and organisation-specific exclusions

### Option B — Private organisation libraries

Each organisation imports and manages its own skills. Skills and files are tenant-isolated and cannot be discovered by other organisations.

Advantages:
- Strong customer control and separation
- Easier handling of private/internal procedures
- Organisation-specific review and lifecycle

Trade-offs:
- Duplicate imports and reviews
- More maintenance across organisations
- No shared curated catalogue by default

### Recommended direction

Use a **curated global catalogue with explicit per-organisation enablement**, while allowing private organisation-owned skills as a separate scope. This gives JD reusable specialist capabilities without making every uploaded skill automatically visible to every customer. Platform-wide availability must require platform review; private skills remain tenant-scoped.

This recommendation is a proposal, not an approved product decision.

## 10. API/action outline

Illustrative actions; exact routes and payload schemas should be designed against the current Edge Function conventions.

- `skills.import.create` — create a quarantined import and upload target
- `skills.import.status` — read import progress and findings
- `skills.import.validate` — run or retry safe validation idempotently
- `skills.package.preview` — retrieve the manifest and review report
- `skills.review.approve` — record an authorised approval
- `skills.review.reject` — reject with a reason
- `skills.publish` — publish an approved immutable version
- `skills.assign` — enable a global skill for an organisation/workspace
- `skills.revoke` — revoke or disable a published skill
- `skills.catalog.search` — search only the skills visible to the caller/runtime
- `skills.resolve` — resolve an eligible skill and immutable version for a task

All writes should be tenant- or platform-scoped, idempotent where retried, permission-checked server-side, and audited.

## 11. Delivery phases

### Phase 1 — Foundation
- Confirm global/private visibility policy and admin roles.
- Finalise package format and compatibility schema.
- Inspect current database, Storage policies, Edge Functions, and Agent Registry integration points.
- Design migrations, RLS, private buckets, audit events, and rollback strategy.

### Phase 2 — Secure import pipeline
- Implement authorised ZIP upload to quarantine.
- Implement safe archive inspection and deterministic manifest generation.
- Implement validation, provenance, licence, and compatibility reports.
- Add import status and retry handling.

### Phase 3 — Admin dashboard
- Add Skills navigation and access-controlled dashboard.
- Add upload, import progress, preview, review, publish, revoke, and version-history experiences.
- Add clear error messages and audit history.

### Phase 4 — Runtime discovery
- Add skill catalogue search and task-to-skill matching.
- Integrate with Agent Architect and specialist selection.
- Load only approved skill content and record exact versions in run history.
- Keep existing agent permissions and approval gates unchanged.

### Phase 5 — Verification and rollout
- Test malicious ZIPs, archive limits, invalid manifests, licence gaps, cross-tenant access, unauthorised roles, duplicate retries, revocation, and version pinning.
- Test end-to-end: upload → validate → review → publish → discover → load → audit.
- Verify that skills cannot grant tools or perform external actions.
- Roll out behind server-side feature flags and monitor import failures and runtime selection.

## 12. Acceptance criteria

The feature is ready only when:
- An unauthorised user cannot access upload, review, publish, assignment, or revoke operations.
- A ZIP upload cannot execute code or create an active agent.
- Unsafe archives are rejected safely.
- Every published skill has a validated immutable version, content hash, provenance, and licence status.
- Organisation users can discover only global skills assigned to them and their own private skills.
- A skill cannot bypass JD's system policy, tool allowlists, tenant boundaries, approvals, or execution authority.
- A task run records the exact skill IDs and versions loaded.
- Revocation prevents future use and is auditable.
- End-to-end tests cover both permitted and denied paths.

## 13. Open decisions

1. Confirm the recommended global catalogue plus per-organisation enablement, or choose private libraries only.
2. Confirm which trusted role(s) count as platform Skills Administrators.
3. Decide whether private organisation uploads are included in the first release or follow later.
4. Set ZIP size, decompressed size, file-count, and retention limits.
5. Approve the initial supported package format and explicit policy for script files.
6. Decide whether external skill sources may be imported by URL later; ZIP upload remains the initial path.

---

**Important:** This document describes the proposed design. It does not mean the Skills Admin Dashboard, importer, database schema, Storage policies, or runtime discovery integration have been implemented or deployed.
