# Upgrade Registry

This directory is the durable source of truth for JD and James-Denning upgrade work.

## Files

- [`../upgrades.md`](../upgrades.md) — complete product upgrade checklist.
- [`AGENT_INSTRUCTIONS.md`](./AGENT_INSTRUCTIONS.md) — mandatory instructions for AI coding agents.
- [`CHANGELOG.md`](./CHANGELOG.md) — append-only chronological log of upgrade work.
- [`TOKEN_USAGE.md`](./TOKEN_USAGE.md) — token-usage accounting policy and ledger format.
- [`UPGRADE_TEMPLATE.md`](./UPGRADE_TEMPLATE.md) — standard record for each upgrade.

## Rules

1. Read `upgrades.md` and `AGENT_INSTRUCTIONS.md` before starting an upgrade.
2. Give every upgrade a stable ID, e.g. `JD-001`, and log it in `CHANGELOG.md`.
3. Update checklist status only when evidence supports it.
4. Record PR/commit, tests, deployment and migration status separately.
5. Record actual provider token usage in `TOKEN_USAGE.md`; use `unknown` when unavailable. Never estimate or fabricate usage.
6. Keep secrets, API keys, access tokens, personal data and raw sensitive prompts out of logs.
7. Do not mark work complete merely because files were changed. Completion requires tests and the relevant integration/deployment verification.
8. Keep entries chronological and append new records; do not silently rewrite history. Corrections should be appended as corrections.
