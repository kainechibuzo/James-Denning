# Business foundation — coordinated local implementation

This implements a connected foundation across the repository's expanded product prompt. **It is not completion of the full 21-section autonomous platform.** No production migration, function deployment, provider request, hiring, charges or launch approval occurred during this work.

The user's billing clarification is recorded in both prompt files: **normal platform billing stays; employee usage is additional**. No existing subscription prices, entitlements or payment flows were changed.

Follow-up: the [versioned agent registry](JD_AGENT_REGISTRY.md) adds tenant-specific definition versions, contract-check evidence and independent publication review infrastructure. It does not turn the starter catalogue into evaluated or hireable employees.

## Delivered code paths

### Business DNA, workspace plans and advisory context

Business operations → **Business Builder** accepts explicit business context, industry, target customers, geography, goals and constraints. Six industry profiles produce different module specifications. Retail proposes products/inventory/orders/customers/sales/marketing/revenue/suppliers; logistics and education have different specifications. There are no compulsory departments in this new path.

The preview includes proposed KPIs needing measurable definitions, draft employee recommendations, capability-based integration requirements, a proposed four-checkpoint workflow and a context-only advisory brief. These deterministic templates are **not a new page renderer, executed workflows, live research or personalised model-generated strategy**. Existing legacy organisation department defaults are not silently changed; school tenants and existing data remain intact.

### Persistent versions and human content review

Both business blueprints and SaaS team definitions can be explicitly saved. The service regenerates canonical content from validated inputs rather than trusting a caller's grants/status claims. `jd_save_foundation` creates, in one SQL transaction:

- A tenant-scoped document/current version pointer.
- An immutable content version with hash and idempotency request identity.
- A control-plane automation run and an existing `jd_approvals` row with `action_key=foundation.review`.
- An existing `jd_audit_events` entry.

The client validates the receipt and reads back the exact content/hash/approval linkage before announcing success. Role/profile checks occur on the authenticated HTTP boundary and again in the service-only SQL RPC. Authenticated clients have admin-scoped RLS SELECT only; they cannot invoke privileged writes or directly mutate versions. Tenant writes are serialised in SQL, with an expected-version check; tests demonstrate sequential stale-version rejection, not concurrent Postgres locking acceptance.

Human review uses the existing `approvals.decide` endpoint/RPC. **Approval concerns document content only. It is not an authorisation to hire, execute, bind tools, spend or deploy.** This action has no executor. Restoring an earlier version rebuilds its inputs using current validation and appends a new pending version; it never restores permissions or an old approval. Review expiry uses the existing 24-hour default; expired requests are not treated as approval.

SaaS Agent Studio now has **Save team definition for review**. Edits during that Studio session append new versions after save. After reload, previously saved teams can be inspected/restored in Business Builder; reopening a saved team into all Studio editors is not implemented. The registry stores **definition documents**, not hired runtime workers. Input remains local until explicit save. Leaving clears unsaved input; persisted versions remain.

### Workforce definitions and recommendations

The shared catalogue contains **16 distinct draft definitions**, including the nine software roles and seven business specialists. It exposes responsibilities, capabilities, requested tool scopes, deliverables, limitations, version, evaluation criteria, routing placeholders and proposed additional pricing. Category/capability search is available in the UI. Recommendations are industry-based and the pure recommender can exclude already selected definition IDs.

**0 employees have completed operational evaluations. 0 are hireable.** Publication, hiring and billable execution are disabled. The target of 400+ genuinely evaluated definitions remains; it was not filled with duplicate names. Customer-specific hiring, assignment, pause/resume/release, evaluation records and bounded orchestration still need an actual authorised executor and lifecycle implementation.

### Approved context in JD chat/MCP

Three additions extend the existing tool registry:

- `preview_business_workspace`: validated, no-write blueprint.
- `get_ai_workforce_catalogue`: true starter count and limitations, not hiring.
- `get_approved_business_context`: current human-approved document versions and retained source evidence, scoped to the authenticated tenant with a profile recheck.

A newer pending version prevents the reader from presenting an older approved version as current. Document context is bounded (20 documents scanned; 40,000 content characters; omissions reported). At most five retained research outcomes are returned. Approved input remains customer context, not independently verified facts. Retrieved snippets are untrusted data. No new search, memory promotion or execution is implied. There is no new model self-approval tool.

### SerpApi credential and research path

Owner/admin UI supports key replacement, deletion, redacted status and an explicitly authorised search/test. The key input clears when submitted, including failures; no browser persistence is used. Credentials use the existing AES-GCM helper and the server's `JD_OAUTH_ENCRYPTION_KEY` configuration. The encrypted envelope includes tenant, provider and credential version; a copied envelope fails scope checks.

Only the service role can access the credential table. Credential mutation and audit are transactional. API responses never return the key or ciphertext. Last successful test belongs to the **current** credential version, so replacement cannot inherit stale verification. Deleting JD's copy is not revocation at SerpApi, and cannot undo a request already sent.

Live search defaults **off** unless the server has `JD_RESEARCH_RELEASE_ENABLED=true`. No client flag overrides this. Even then it requires an admin, a valid tenant credential, explicit per-request consent and an atomic SQL reservation. Hard caps are 5 attempts/minute and 20 attempts/rolling 24 hours per tenant; failed/reserved requests count. These are safety caps, not a dollar-budget ledger.

The adapter uses a fixed HTTPS SerpApi Google-search endpoint, no redirects, bounded locale/result inputs, a 10-second deadline and 1 MiB response limit. It returns sanitised status classifications rather than raw provider errors. Source records retain title, safe URL, snippet, query, provider and retrieval time. Secret-like values are scrubbed; source-page fetch and fact verification remain false. The source evidence is persisted before success is returned. Missing storage acknowledgement reports uncertainty and forbids automatic retry.

No automatic retries, provider failover, cache, direct page retrieval or model-based research synthesis are enabled. This avoids silently repeating potentially paid requests. Normalised interface supports future providers, but only SerpApi exists in this pass. Provider cost is unknown, not reported as zero. Provider request logs must also be configured not to capture query-string credentials before a live release. No actual key was configured or provider request executed here; synthetic provider responses are used in tests.

### Additive employee billing

A pure usage-quote function validates identified UTC intervals, deduplicates identical event IDs, rejects conflicting/overlapping intervals, sums active time per employee and excludes queued/idle/approval/external-service waits and pauses. Integer microdollar arithmetic rounds once after aggregation; a proposed $1/hour rate and supplied budget are explicit.

**The foundation's quote function is not billing infrastructure.** A subsequent [employee usage accounting stage](JD_EMPLOYEE_USAGE_LEDGER.md) adds durable **shadow** budgets/reservations/events, terminal reconciliation and default-off instrumentation of the existing worker. It does not create a commercial billing ledger, invoice, charge, platform-plan change or hired-employee identity. Retry/failure/dispute policy, trusted active-time measurement and billing authorisation still need implementation and commercial review. No unannounced model/API surcharge was introduced.

## Local tests and evidence

Run `npm ci`, `npm run test:foundation`, `npm run test:agents`, existing regression suites and the Chromium layout suite (`CHROMIUM_EXECUTABLE_PATH` required). `test:foundation` includes actual migration/RPC execution in isolated PGlite, real handler/client readback, RLS/grant denials, cryptography, rate caps, input/metering/provider tests and mounted React. Real Chromium tests exercise save/review/revise/restore, draft catalogue, credential clearing, release gating and SaaS saves. CI includes both suites.

[Evidence report](../docs/evidence/2026-11-16-business-foundation/REPORT.md) records actual results, synthetic persisted records, screenshots and failures. Synthetic auth/SHA adapters and sequential PGlite tests are **not deployed JWT/RLS/pgcrypto/concurrency proof**. Provider fixtures and a model-readable context tool are not real-provider/model quality evaluations.

## Release gates and recovery

1. Independently review new schema, grants, existing approval dependencies and exact source revision. Do not blindly run `db push --include-all`; migration history diverges and the repository has other unapplied migrations.
2. Apply only the separately approved migration `20261116180000_jd_business_foundation.sql` to a genuinely isolated staging database. It assumes the existing approval/audit schema, auth/profile identity and `extensions.digest` are available. Do not replay historical production SQL.
3. Assemble/review **jd-automation, jd-execution-worker and jd-mcp**, including all shared `.ts` and `.mjs` dependencies. Existing release packaging excludes migrations; schema approval remains a separate gate.
4. Keep research disabled initially. Verify live authenticated role/tenant boundaries, concurrent save/idempotency/reservation behaviour, immutability, review/restore/readback and no existing billing regressions.
5. With explicit provider authorisation, approved budget/usage policy and secure server encryption configuration, test provider errors, redaction, rotation, deletion and limits in isolation. Only then consider enabling the research flag for the approved environment. Never put credentials in chat/Git/client environment variables.
6. Owner independently reviews evidence/failures and explicitly approves the tested production release. No approval is recorded by this implementation.

Recovery: disable the research flag; stop new writes; revert frontend/function versions without deleting retained documents/evidence/keys. The candidate SQL rollback **refuses to drop populated tables**. Data-bearing rollback needs a separately reviewed preservation/migration plan. Existing approvals/audits are not deleted. Key deletion at JD is distinct from provider-side revocation.

## Full feature-sheet status, without inflating completion

| Area | Local implementation in this pass | Not completed |
|---|---|---|
| Business discovery/DNA | Explicit validated profile, saved versions and content review | Conversational discovery quality, automatic validated evolution |
| Business Advisor | Context-only brief and approved-context/evidence read tool | Evaluated research synthesis, goal tracking and advice quality |
| Dynamic workspace | Industry-specific module/KPI specifications, no departments in new path | Activated navigation, generated CRUD pages/modules and permissioned renderer |
| Workforce | 16 draft profiles, search and recommendations | 400+ evaluations/publication, tenant hires, runtime lifecycle |
| Agent Architect | Saved SaaS team-definition documents, immutable versions/readback | Deployable agent configurations, actual tools and isolated execution |
| Workflows | Proposed dependency/checkpoint plan; existing workflow subsystem preserved | New executable workflow compilation, agent delegation, bounded recovery |
| Connectors | Honest capability requirements; existing connections untouched | Verified provider marketplace, connection inspection/recommendation integration |
| Software Factory | Existing design Studio connected to version registry | Generated repositories, sandbox builds, test/security execution and customer previews |
| Memory | Current approved document context, provenance and scoped retrieval | Semantic memory and approved evolution across all business records |
| Monitoring | Existing approval/audit records, research attempts and failure outcomes | Per-agent operational metrics, actual agent-run artifacts and cancellation integration |
| Billing | Platform billing preserved; additional usage policy and quote arithmetic | Executor-linked ledger, budgets/enforcement, invoices/reconciliation/payments |
| Research | Encrypted BYOK, gated server adapter, quota reservations, stored source evidence | Live acceptance, provider abstraction expansion, cache/backoff and complete reports |
| Governance | Auth/RLS checks, immutable versions, explicit document review, secrets separation | Independent staging/production security acceptance and customer deployment verification |

The entire vision remains the target. It cannot truthfully be marked complete from this local pass. The next essential integration is an authorised isolated executor with durable agent/usage records; none of the current document-review approvals can be reused as execution or spending authority.
