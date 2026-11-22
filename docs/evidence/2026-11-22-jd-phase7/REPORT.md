JD phase 7 evidence — 2026-11-22 — autonomy dial + discovery agent + agentic-time billing

Branch: arena/d828b8ba-james-denning from master e7fad27cc61d511ee4b8f754c80f2e0bdffa2af3.

Owner decisions recorded before build:
  - Skills are the product: capabilities present as "already there"; acquisition automatic and invisible.
  - Autonomous mode (per-workspace setting) removes the prompts, not the receipts.
  - Billing per actual agent work time; card-on-file flow with ceiling; charging stays behind the
    platform release flag this phase.

Delivered:
  1. jd_workspace_autonomy (mode/ceiling/rate) + jd_read/set_workspace_autonomy (admin, audited, idempotent)
  2. Discovery agent service + jd_discovery_sessions: plan (offline, deterministic, allowlisted skills +
     real roles) → assisted proposal (independent decide, requester≠decider) → autonomous proceed
     (acquire via phase-6 pipeline + bind specialist playbooks + completion receipt; stop-on-failure)
  3. jd_agent_playbooks (instruction-only role bindings) + jd_bind_agent_playbook
  4. Spend ceiling enforced at jd_autonomous_cost_authorize AND jd_confirm_run_skill_cost (54000 boundary);
     jd_autonomous_cost_authorize = autonomous standing authorisation (basis autonomous_preauthorized)
  5. jd_read_billing_summary: measured actual seconds, confirmed estimates, ceiling headroom,
     due-at-settlement at the recorded rate; pricing policy agentic-seconds-v1; charging_enabled=false
  6. UI: Settings Agent Autonomy tab; Billing agent work-time card; Skills page "Included capabilities —
     already there" + "Describe the work — JD cooks it" panel; upload relabelled advanced
  7. BILLING_RELEASE.agenticTimeChargingEnabled:false + AGENTIC_TIME_PRICE defaults in src/config/billing.mjs

Gate results (local): discovery 7/7 · skills 61/61 · billing 21 · usage 104 · settings 51 ·
navigation 93 · checklist 13 · approvals 8 · backend-release 82 · guards ok · deno check clean ·
runtime deno 20 ok · verify:web ok · build ok. CI: new step "Test workspace autonomy, discovery agent
and agentic-time billing" (npm run test:discovery).

Boundaries preserved: nothing executed at any stage; packages never grant tools or authority (playbooks
are instruction text only; assignments flow through existing workforce allowlists); hiring/execution/
billing flags false in every receipt; tenant scope server-enforced; ceiling is a hard stop even in
autonomous mode; queued/waiting time never billable; charging explicitly disabled until the owner
flips the release flag.
