# Versioned agent registry and evaluation evidence

## Delivered scope

Business Builder → **Agent registry** now lets tenant owners/admins customise an existing specialist, save immutable versions, run actual **contract checks**, inspect retained evidence and use a separately gated human publication workflow.

This implements the recommended next registry stage, **not the entire employee platform**. The starter catalogue remains 16 draft templates, zero operationally evaluated/hireable employees. No new operational evaluator, hired employee, executable tool binding, generated workspace, SaaS deployment or billing charge is created by this release.

The hybrid model is explicit: `definitionFromTemplate()` derives from the existing `workforceCatalogue()` (including its SaaS specialists); customer-specific definitions are versioned data, not independently generated executable programs. SaaS Studio and the static starter catalogue remain unchanged. This is not yet automatic conversational Agent Architect orchestration.

[Actual local validation/evidence](../docs/evidence/2026-11-16-agent-registry/REPORT.md).

## Definitions, versions and invalidation

The canonical definition contains its template identity, name, responsibility, instructions, requested capabilities, deliverables, limitations, proposed provider/model, step/time limits and evaluation cases. Unknown fields, obvious credential patterns, invalid limits and missing/duplicate cases are rejected by the shared validator. Five operational categories are mandatory:

- Role task quality, using the starter specialist's responsibilities/criteria.
- Tool and prompt-injection safety.
- Tenant isolation.
- Budget stop behaviour.
- Cancellation behaviour.

Capabilities and model names are proposals, not connected tools or execution grants. Registry step/time values are saved requirements; this stage does not bind them to an employee runner. No code in a definition is executed.

Every save appends a version with a server-generated SHA-256 of its JSONB content. It resets the agent to `draft`, clears current evaluation/review pointers and invalidates any earlier publication eligibility—even an identical re-save requires a new evaluation. Content and evidence cannot be edited/deleted through the service role. Old versions/results/approval records remain historical evidence, not reusable authority.

The editor can copy older content into a local draft. Saving that copy creates a new version; it does not restore old approvals. Strict client read-back checks prevent claiming a successful save when content, version, scope or hashes do not match. Uncertain retry submissions reuse the same request identity; stale acknowledgements cannot silently replace newer records.

## Contract checks versus operational evaluations

### Runnable now: `contract-v1`

The server executes a deterministic validator with three retained results: definition schema, evaluation-plan coverage and absence of authority-bearing fields. It records pass/fail/blocked results with hashes and timestamps. **It does not invoke an LLM, run the role tasks, bind tools or test real-world quality.** Passing it never unlocks publication.

The browser can only request this contract runner. Caller-supplied runner, kind, results, model receipts and pass flags cannot convert it into an operational evaluation. There is no browser/model endpoint to finish evaluations.

### Operational evaluation infrastructure, not a deployed evaluator

The service-only start/finish RPCs support an operational evidence path for a future reviewed evaluator. `jd_agent_evaluators` is an **empty-by-default allowlist** of runner source/release identifiers. No application RPC can insert or enable entries; only a separately reviewed deployment/database operator can register an evaluator. A definition must have a proposed provider/model before an operational run can start.

An accepted report must come through the trusted service path, identify the allowlisted runner, include every pinned case exactly once and retain bounded observed evidence. Overall outcome is derived from case results: any failure wins, otherwise any blocked case blocks a pass. The report is immutable and content-hashed. A run has a one-hour completion window; accepted passing operational reports expire for publication eligibility after 30 days. Revoking an evaluator invalidates eligibility.

**Trust limitation:** an allowlisted hash is an identifier, not remote attestation that its code actually ran. SQL cannot establish the truth or quality of a trusted evaluator's reported observations. No real operational runner/provider adapter has been implemented or exercised in this stage. The future evaluator must execute the pinned configuration in isolation, retain reproducible model/tool/fixture provenance and genuine outcomes, and undergo independent security/quality review. Do not insert an allowlist row and upload invented passes to bypass that work.

Tests seed an explicitly synthetic evaluator to verify persistence and publication security. Those fixtures are not employee evaluations or deployable evaluator approval.

## Publication lifecycle and review

Stored states: `draft → testing → draft (results recorded) → review_pending → reviewed → published`, with rejection returning to draft and explicit suspension available to administrators. A new version/evaluation removes prior review eligibility. Failed, blocked, expired, revoked or stale-version reports cannot unlock publication.

`request_review` creates an **existing `jd_approvals`** entry with `action_key=agent.publication.review`, its automation run and audit linkage. The proposal pins the exact definition hash/version, evaluation ID and report hash. Approval/rejection uses the existing `jd_decide_approval` RPC atomically with the registry transition.

- Reviewer must be a current owner/admin in the same tenant and differ from **both** the version author and evaluation requester.
- Approval and publication compare the expected evaluation and approval IDs, not just the definition version. A concurrent same-version evaluation/review replacement cannot be approved using an old screen.
- Publishing requires the exact current approved review, an eligible operational report and a still-authorised reviewer. The approval must not have expired before publication.
- The generic Review Centre decision route directs this action to Agent registry rather than approving evidence it has not pinned. Direct generic approval alone cannot advance registry state to reviewed/published.
- Publication is **tenant-private definition publication**, not global marketplace publication, hiring, execution, permission granting, deployment or spending. Existing approval execution status remains `not_executed`.
- `publication_current` is recomputed on reads, including evaluator/report/reviewer validity. Stored `state='published'` is history, not proof of current eligibility. Hiring/execution/billing flags remain false in every response.

A single-admin tenant cannot independently review its own authored/evaluation-requested definition. This is an intentional separation-of-duties boundary, not something JD may bypass.

## API and database boundaries

`JD_AGENT_REGISTRY_ENABLED=true` is required; default off. No browser flag overrides it.

| `jd-automation` action | Effect |
|---|---|
| `registry.read` | Tenant-scoped list, or selected version/evaluation/review history |
| `registry.save` | Canonically validate and append a draft version |
| `registry.evaluate` | Execute/persist **contract-v1 only** |
| `registry.request_review` | Request independent review after genuine operational evidence prerequisites |
| `registry.approve` / `registry.reject` | Independent decision on exact current evidence |
| `registry.publish` | Explicit tenant-private publication after reviewed state |
| `registry.suspend` | Stop current definition publication eligibility |

Mutations require explicit confirmation, request UUID and expected version. Publication actions also carry expected evaluation/review IDs and a bounded review note. Reads return at most 50 agents or 10 versions/evaluations for a selected agent; limits are disclosed, not presented as total catalogue counts.

Authentication/profile scope is derived server-side, then rechecked inside service-only SQL functions. Anonymous/authenticated roles have no direct table or RPC access. The service role can read private tables but cannot directly mutate definitions, evidence or evaluator allowlist. SQL writes use tenant locking, optimistic version/evidence checks and replay-safe requests. Audit failure rolls back the associated transition.

Retrieved definitions and observed outputs remain untrusted data. Obvious credential formats are rejected, but pattern checks are not comprehensive redaction. Only approved synthetic/non-secret evaluation data should be retained until a separately reviewed operational evidence retention/redaction policy exists.

## Migration, release and recovery

Candidate migration: `20261117130000_jd_agent_registry.sql`. It depends on the existing auth/profile/school, automation-run, approval/review columns, audit, `extensions.digest` and `jd_decide_approval` schema. It does not replay historical migrations or deploy functions.

1. Independently review the candidate and retention constraints. Do not blindly push divergent migration history.
2. Apply only the reviewed candidate in a genuinely isolated staging project with synthetic data.
3. Release the reviewed automation/worker/MCP artifact through existing packaging, including `.ts` and `.mjs` shared/nested files. Keep the registry flag off until schema and backend are verified together.
4. Test real JWT/PostgREST scope, concurrent saves/reviews/role revocation, malformed requests, ledger persistence and failure recovery. PGlite fixture tests do not prove hosted concurrency or production acceptance.
5. With explicit staging approval, enable the registry for synthetic contract checks. Keep the operational evaluator allowlist empty until a real evaluator is implemented, tested and independently reviewed.
6. Production release and evaluator publication require separate owner acceptance. No release approval is recorded by the implementation or its tests.

Rollback SQL refuses populated definitions/evidence/evaluator records. Disable the registry API flag to stop new registry operations, preserve evidence and revert reviewed frontend/function artifacts as needed. Foreign-key retention can prevent destructive tenant/user cleanup; a reviewed retention/redaction/deletion procedure is needed before live use. Never drop evidence to manufacture a clean rollout.

## Still next

A reviewed operational evaluator with genuine model/tool/task evidence is needed before any employee can earn an evaluation pass. Then implement tenant-specific hiring/permission binding and bounded isolated employee execution, link verified employee identities to metering, and proceed to activated generated workspaces, end-to-end SaaS delivery and commercial invoicing. This registry does not substitute for those stages or the 400+ evaluated workforce target.
