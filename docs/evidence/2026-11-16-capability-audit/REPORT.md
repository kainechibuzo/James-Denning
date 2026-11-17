# How capable is JD actually?

Audited source: `524a2b6a0d4d48914f168981466febc3f13a1fe6` (merged PR #110).
Working branch: `arena/7e55cba8-james-denning`.

## Bottom line

**JD is a working, bounded organisation-operations assistant with real background execution and persisted records. It is not yet a functioning autonomous employee marketplace or end-to-end SaaS factory.** Its strongest evidenced abilities are inspecting internal records, summarising operations, retaining business context, preparing proposals and executing a narrow approved organisation-setup action. Its potential external reach is much larger than its currently connected reach.

This assessment separates registered source capabilities, existing production records and independently tested outcomes. It does not assign a fabricated completion percentage or benchmark intelligence score.

## Evidence gathered in this audit

- Read the actual runtime registry, worker, approval dispatcher, connector gateway, agent architect, foundation/registry/usage services and release switches.
- Used Supabase read-only metadata/aggregate SELECTs and the Edge Function inventory. Did not retrieve conversation text, customer records, credentials or business-memory contents.
- Checked Vercel production deployment metadata and GitHub workflow/job conclusions. No deployments or workflow dispatches were triggered.
- Ran **567 targeted local tests: all passed**, covering capability boundaries, agent designs, registry/database/UI contracts, business foundation, execution/cancellation, usage and assignment release behaviour. See `targeted-tests.log`. These are local/synthetic tests, not hosted acceptance.
- Retained a minimal non-personal aggregate snapshot in `live-observations.json`, source counts in `source-inventory.json`, and recent GitHub conclusions in `recent-workflows.json`.

## What the live records establish

| Observation | Meaning | What it does not establish |
|---|---|---|
| 36 completed execution jobs; 1 failed; no other job statuses returned | The background execution system has been used and has recorded terminal outcomes | A 97% business success rate, output correctness or a load-tested SLA |
| 120 completed tool steps across 20 distinct tool names | JD has actually exercised internal tools, not just displayed tool cards | That every registered tool works, or that a completed read returned useful data |
| One approved department-provisioning action recorded completed | There is an evidenced narrow approval-to-execution path | An ability to execute arbitrary approved requests |
| 11 approved `unclassified_request` approvals remain `not_executed`; their runs remain `awaiting_approval` | A real gap between approval and executable action | That these should be automatically retried or that approval authorises unspecified actions |
| 4 saved business-memory records | Persistent organisation context is being used | Unlimited memory or retrieval quality |
| 33 task records: 20 completed, 3 in progress, 10 queued | Task tracking is populated | That JD autonomously performed those tasks; status labels are not outcome evidence |
| Zero JD connector servers, discovered tools or connector executions | JD Connect currently has no configured external tool reach in this project | That Arena's connected apps are disconnected; they are a separate system |
| Zero recurring schedule records and zero saved business-document records | Those paths have no retained examples in these tables at inspection | That source implementations cannot work, or that deleted historical examples never existed |

The counts are project-wide aggregates, not a performance benchmark or per-tenant permission test. Source-created and manually entered records are not assumed equivalent.

## Capability assessment

### 1. Internal operations: genuinely implemented and used

The source registry declares **30 native tools, including the capability-inventory tool**. The inventory response itself excludes that self-inspection entry and can therefore report 29 before role filtering. This is not 30 unrestricted actions for every user.

Observed completed tool types include workspace overview, people/performance/operations intelligence, billing snapshot, hiring pipeline, department lookup, activity/email records, settings catalogue, expense anomalies, memory read/write, organisation and vacancy previews, capability inventory and connector discovery. Discovery can complete successfully with zero connections.

JD can help organise and interpret available business data. Native chat tools are narrower than every CRUD/API action implemented by the wider portal: an operations screen or backend endpoint does not automatically give the model a callable tool for it.

### 2. Execution engine: real, but bounded

`supabase/functions/_shared/jd-agent-runtime.ts` implements a model/tool loop, parallel tool calls, streaming, usage collection and checkpoints. Source bounds include eight tool rounds, 6,144 requested output tokens per model request and up to two eligible continuations. File creation is limited to one file per tool round.

`supabase/functions/jd-execution-worker/index.ts` has durable jobs, leases, heartbeats, checkpoint/resume, retries, terminal-state handling and dispatch handoff. It caps a worker invocation at four jobs and a 105-second work budget. These are code limits, not throughput measurements.

Recent background-dispatch workflows passed, but a successful dispatcher can process zero jobs. Zero schedule records means unattended recurring business work has not been established by the current retained schedule inventory.

### 3. Approvals: the largest observed execution gap

The `unclassified_request` path explicitly saves `execution_enabled:false`. `approvals.decide` records a decision but only automatically provisions departments for its recognised department action; settings have a separate explicit reviewed apply path. It does not turn generic high-impact requests into runnable work.

The **11 approved-but-unexecuted requests** match that design limitation. This explains a class of experiences where JD asks for approval but does not then do the requested work. Correct remediation is typed, narrowly authorised action handlers with verified execution receipts—not disabling approval or telling the user the work completed.

Sources: `supabase/functions/jd-automation/index.ts` (`approvals.decide` and `unclassified_request` branches).

### 4. AI employees and Software Factory: design-stage, not operational

The actual catalogue generator returns:

- **16 draft definitions**;
- **0 operationally evaluated**;
- **0 hireable**;
- publication and employee billing disabled;
- 400 evaluated employees is a target, not an existing workforce.

The SaaS architect creates tailored role definitions, requested tool permissions, handoffs, evaluation criteria and approval checkpoints. Its output explicitly says `agentsCreated:false`, execution not started, zero authorised spend and unbound tools. The generator itself is deterministic; chat can call it through the model loop.

Source files can be saved through the private draft-file tool, but that is not a repository-edit/build/test/deploy sandbox. There is no demonstrated end-to-end autonomous SaaS build here.

Sources: `jd-agent-architect.mjs`, `jd-business-foundation.mjs`, `jd-agent-registry-service.ts`, `documentation/JD_SAAS_AGENT_STUDIO.md`.

### 5. External integrations and research: infrastructure exists; operational reach is absent/unproven

JD Connect implements remote MCP discovery/execution, scoped credentials/grants, approval records and execution history. **Its live tables currently contain zero servers, tools and execution records.** Connecting Supabase/Vercel/Drive to this Arena conversation does not connect those services inside JD.

The gateway supports read-only, read/write and full-control grants. Importantly, runtime descriptions currently say write tools always request approval, while the gateway can execute writes under elevated grants and can waive additional destructive/open-world approval under full control. This source-contract inconsistency should be reconciled before granting elevated external access. No grants were created during the audit.

The research-provider implementation is release gated, and the production `jd_research_attempts` table is absent. New live research was not demonstrated.

### 6. Models, memory and scale: not benchmarked

All 36 completed runs with recorded models used `:free` model identifiers, spanning **10 distinct model IDs**. The source defaults to `openrouter/free`, with optional fast/reasoning model overrides. Secret configuration was not inspected, so historical model IDs are not a claim about the current exact routing configuration. Variation can make output quality inconsistent; no controlled task-quality, latency, concurrency or cost benchmark was run. Free routing does not by itself establish low quality.

The runtime loads up to 40 recent memory records, clipped to 1,200 characters each. The worker retrieves the first 100 chronological conversation messages, then takes the last 20 from that subset and clips each to 12,000 characters. **Beyond 100 messages this can omit the newest context**; this is a source-level long-conversation defect, not proof that a particular production conversation was affected. Memory is bounded organisation context, not unlimited recall.

Sources: `jd-agent-runtime.ts`, `jd-agent-routing.ts`, `jd-execution-worker/index.ts`.

## Deployment and verification gap

- Vercel reports the production deployment **READY** at the exact audited commit `524a2b6…`. This establishes frontend deployment identity, not authenticated application correctness.
- The connected JD Supabase project reports `ACTIVE_HEALTHY`; 20 Edge Functions are listed active. Active does not mean every action path is current or healthy.
- Production is missing `jd_foundation_documents`, `jd_research_attempts`, `jd_agent_definitions` and `jd_usage_accounts`. The corresponding newer source features cannot use their designed persistence paths on this schema. Exact deployed Edge Function source parity was not established.
- Agent registry, research release and usage shadow accounting have explicit release flags. No secret values were retrieved; the flags' current values were not inferred from UI labels.
- Task assignment remains deliberately `legacy` in source, without the checked mode's atomic compare-and-swap/audit guarantees.
- The latest inspected staging verification run **44103633325** failed the required-secrets presence check; its cross-tenant test job was skipped. GitHub API job/step conclusions and checked-in workflow establish this. The raw log download was blocked by sandbox network restrictions. No production-as-staging workaround was attempted.
- Passing local tests and deployment checks does not close live role/RLS, adversarial tenant-isolation, failure-recovery or business-outcome acceptance gates.

## Recommended next steps, in order

1. **Resolve the approval dead ends:** inspect intended actions with the owner, classify supported versus unsupported requests, build one bounded executor, require exact approval, and show persisted execution/read-back. Do not auto-replay the 11 old requests.
2. **Reconcile backend releases safely:** establish genuinely isolated staging and apply/rehearse reviewed schema/backend changes there, including denial/error paths and rollback. Production deployment is a separate decision.
3. **Give JD one useful external capability:** explicitly authorise a least-privilege connector, verify discovery/read calls, then test a narrowly approved reversible write. Do not infer access from Arena connections.
4. **Make one employee real before expanding the catalogue:** bind tools and budgets to one scoped role, run operational evaluations, retain failed cases, require independent review and only then permit limited work. Start with a verifiable internal role rather than autonomous legal/financial commitments.
5. **Fix context selection and benchmark model routing:** use recent conversation context, evaluate representative tasks with expected outcomes, and measure latency, retries, tool correctness and actual cost before selecting models or promising scale.

No code behaviour, production settings, data, permissions, approvals, infrastructure or deployment was changed by this audit. Only audit evidence files were added to the working branch.
