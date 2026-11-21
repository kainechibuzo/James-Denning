# Agent Execution Engine evidence — 2026-11-21

## Scope

Implemented in source on `arena/b529496d-james-denning` (base `d60d9e0`). No migration was applied to any hosted project, no edge function was deployed and no staging/production acceptance was performed. The execution engine stays release-gated (`JD_AGENT_WORKFORCE_ENABLED`, `JD_AGENT_REGISTRY_ENABLED`) and both gates fail closed.

## Delivered

- `supabase/functions/_shared/jd-agent-workforce.ts` — pure planning contracts: frozen read-only grant allowlist, plan validation bounds, per-agent tool resolution, specialist instruction builder, bounded audit payloads, conservative registry-definition mapping.
- `supabase/functions/_shared/jd-agent-runtime.ts` — `deploy_specialist_workforce` tool, `runWorkforceDeployment` orchestrator, `runAgentAssignment` isolated executor, `propose_agent_definition` Agent Factory tool, silent sub-agent model calls, workforce operating instructions, `workforce.deployed` audit event.
- `supabase/migrations/20261121180000_jd_agent_execution_engine.sql` (+ rollback) — per-agent execution authority with independent review, evidence pinning, expiry, version-reset trigger and revocation; registry read service extended.
- `supabase/functions/_shared/jd-agent-registry-service.ts` + `jd-automation/index.ts` — `registry.execution.*` actions and generic-decision guard; `runs.list` workforce summaries; capability contract classification (incl. pre-existing `delegate_to_specialist_agent` gap fixed).
- UI — Agent registry execution-authority panel (`AgentRegistry.jsx`, `agent-registry-client.mjs`, fixture), Automation runs workforce cards (`RunMonitor.jsx`, `run-history.mjs`).
- Tests — `npm run test:workforce` (35 tests across 4 suites), Deno executor tests in `jd-agent-runtime.test.ts`, CI/verify wiring.

## Local verification (all pass, logs attached)

| Gate | Result | Log |
|---|---|---|
| test-workforce | exit 0 | test-workforce.log |
| test-registry | exit 0 | test-registry.log |
| test-capabilities | exit 0 | test-capabilities.log |
| test-execution | exit 0 | test-execution.log |
| test-usage | exit 0 | test-usage.log |
| test-history | exit 0 | test-history.log |
| test-agents | exit 0 | test-agents.log |
| test-backend-release | exit 0 | test-backend-release.log |
| test-navigation | exit 0 | test-navigation.log |
| test-checklist | exit 0 | test-checklist.log |
| test-guards | exit 0 | test-guards.log |
| verify-web | exit 0 | verify-web.log |
| build-mobile | exit 0 | build-mobile.log |

Not runnable in this sandbox: `deno check`/`deno test` (CI runs them) and the Playwright registry layout pass (no Chromium). Node strip-type imports of the full runtime and workforce modules execute in `test-workforce.log`.

## Boundary reminders

- Contract/operational evaluation separation is unchanged; synthetic evaluator fixtures are not employee evaluations.
- No production deployment, migration push or live acceptance is authorised by this evidence.
