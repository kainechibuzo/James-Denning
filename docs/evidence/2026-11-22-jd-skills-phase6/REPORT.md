JD Skills phase 6 evidence — 2026-11-22 — autonomous acquisition + agentic-time metering

Branch: arena/606fa17a-james-denning from master 67010d254b256d7b74f5ff77f3584b6d38293291.

Owner decisions recorded before build (ask_user):
  - review policy: fully autonomous (JD publishes validated acquisitions; independent
    two-admin review is retired for auto-acquired skills, by owner decision)
  - billing: confirm before each billable run (estimate + explicit confirmation)

Delivered:
  1. skills.search  — offline allowlist index (anthropics/skills, 18 entries, curated)
  2. skills.acquire — pinned-commit fetch (api.github.com + codeload.github.com only),
     text-only selection, frontmatter completion, in-memory zip, same quarantine
     inspector, auto-publish under policy jd-autonomous-v1 with immutable provenance
  3. jd_confirm_run_skill_cost + jd_skills_load billable-run gate + terminal-run
     actual-seconds trigger (jd_agent_time_ledger; pricing not_computed_in_this_release)
  4. Migration 20261122210000_jd_skills_autonomous.sql + rollback
  5. Dashboard "Ask JD to find a skill" panel + skills-client read-back contract
  6. Contract fix: validated imports recorded as needs_review (starter imports unblocked)

Gate results (local, exact counts):
  test:skills 61/61 (incl. 11 new) · usage 104 · registry 92 · agents 63 ·
  execution 276+2 · backend-release 82 · history 25 · navigation 93 · workforce 36 ·
  checklist 13 · approvals 8 · foundation 91+21 · billing 21 · guards ok ·
  deno check 0 errors · deno runtime 20 ok · verify:web ok · build ok

Boundaries preserved: nothing executed at any stage; skill text untrusted only;
no tools granted; hiring/execution/billing flags false in every receipt; tenant
scope server-enforced; revocation immediate; per-run cost confirmation required
for acquired skills; hostile/off-allowlist sources refused at the RPC boundary.
