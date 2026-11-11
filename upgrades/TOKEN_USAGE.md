# AI Token Usage Ledger

This file defines token accounting for AI work on James-Denning. It is an auditable ledger, not a place to guess model consumption.

## Accounting rules

1. Record usage from the model provider's response metadata (for example, the API `usage` object) whenever available.
2. Capture input and output tokens separately. Capture cached and reasoning tokens only if the provider reports them as distinct fields.
3. Record provider-reported total tokens if supplied. If not supplied, leave total as `unknown` rather than silently calculating a potentially incompatible total.
4. Record cost only when the provider reports a reliable cost value or a documented billing endpoint supplies it. Include currency and source.
5. If usage metadata is absent, record `unknown`. Do not estimate from text length, model context limits or number of tool calls.
6. A tool call is not automatically a model call. Record each model API request separately where possible and associate it with a run/upgrade ID.
7. Never store API keys, authorization headers, OAuth tokens, raw private prompts, private documents or unnecessary personal data in this ledger.
8. Provider billing dashboards remain authoritative for invoices. This ledger is operational telemetry and may not include all provider-side charges.

## Fields

| Field | Meaning |
|---|---|
| timestamp_utc | Time of the model request |
| upgrade_id | Related upgrade ID, or `GENERAL` |
| run_id | Non-secret application run/request identifier |
| provider | e.g. OpenRouter |
| model | Exact provider model slug |
| input_tokens | Provider-reported input tokens or `unknown` |
| output_tokens | Provider-reported output tokens or `unknown` |
| cached_tokens | Provider-reported cached tokens or `unknown` |
| reasoning_tokens | Provider-reported reasoning tokens or `unknown` |
| total_tokens | Provider-reported total or `unknown` |
| cost | Provider-reported cost or `unknown` |
| currency | Cost currency or `unknown` |
| usage_source | Response metadata, usage endpoint, or `unavailable` |
| notes | Non-sensitive purpose or error note |

## Ledger

No provider usage records have been supplied for initialising this file. **No token totals or costs are claimed.** Append one row per model API request using the CSV header below.

```csv
timestamp_utc,upgrade_id,run_id,provider,model,input_tokens,output_tokens,cached_tokens,reasoning_tokens,total_tokens,cost,currency,usage_source,notes
```

## Implementation requirement

The JD server runtime should persist provider usage metadata per model request, not only once per user conversation. Store it in a tenant-scoped operational table with restricted access and aggregate it for authorised admins. The app should display provider/model, period, input/output/total usage, cached/reasoning usage when available, and reported cost. Missing values must remain visibly unknown. Do not expose raw prompts or credentials in admin usage screens.


### JD-004 design work — 2026-11-11

Provider/model: unknown. Input/output/cached/reasoning/total tokens: unknown. Cost: unknown. Usage source: unavailable. No provider response metadata was supplied for this design session; no token or cost estimate is recorded.


### JD-004A implementation work — 2026-11-11

Provider/model: unknown. Input/output/cached/reasoning/total tokens: unknown. Cost: unknown. Usage source: unavailable. No provider response metadata was supplied for this implementation session; no token or cost estimate is recorded.


### JD-004B implementation work — 2026-11-11

Provider/model: unknown. Input/output/cached/reasoning/total tokens: unknown. Cost: unknown. Usage source: unavailable. No provider response metadata was supplied for this repository implementation; no token or cost estimate is recorded.
