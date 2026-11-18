# OAuth backend — direct test-database deployment

## Outcome

Deployed to **thklwiybjuhrjqrrxyid**, the exact database the owner confirmed is the test target. No separate staging environment was created. Backend deployment and unauthenticated HTTP verification succeeded; **registered-provider OAuth sign-in is not accepted or verified**.

- Reviewed application source: `19ce0114653f01e5e356c77f6ff1c1eba7ee5f10`.
- Immutable, source-hashed seven-function bundle: `8b51d63089623042caf859afbbabd3afcead7311`.
- Successful compiled deployment: [run 44290386627](https://github.com/kainechibuzo/James-Denning/actions/runs/44290386627), workflow source `f69b78a92d852431a0d98a90e7b0eebe52e386f0`.
- Final credential-free HTTP verification: [run 44290986020](https://github.com/kainechibuzo/James-Denning/actions/runs/44290986020), **14/14 passed**, persisted in `http-smoke.json` and check annotations.
- Local targeted tests: **304 passed** (`tests.log`); bundle integrity/mocked unauthenticated tests: **14 passed**, including final rerun (`bundle-final-tests.log`). Mocks are not provider-interoperability evidence.

## Applied scope

Three migrations were applied once. Management-generated history versions differ from repository timestamps; all three trimmed SQL MD5 comparison checks match (`migration-hashes.json`; comparison fingerprints, not cryptographic attestations).

| Migration | Live history version |
|---|---|
| jd_workspace_read_services | 20261118105244 |
| jd_connector_oauth | 20261118105306 |
| jd_workspace_refresh_leases | 20261118105315 |

Read-only SQL inspection confirmed eight required columns, RLS on OAuth state/token tables, no anonymous/authenticated SELECT privileges on those tables, and ten security-definer RPCs with empty search paths and service-role-only execute grants. Query request IDs are preserved in `receipts.json`.

| Function | Observed final version | Platform JWT verification |
|---|---:|---|
| jd-connect-oauth | 3 | false |
| jd-connect | 12 | false |
| jd-business-platform | 13 | true |
| jd-business-oauth-callback | 11 | false |
| jd-automation | 14 | true |
| jd-execution-worker | 20 | false |
| jd-mcp | 11 | false |

JWT settings were preserved; handlers retain their internal authentication. The final metadata/code hashes are in `receipts.json`. Configured `JD_MCP_OAUTH_CALLBACK_URL` to the project's new callback endpoint. Existing encryption keys/worker bundle and other credentials were not read or replaced. No provider registration, permission expansion, new paid service, unrelated migration, or authenticated worker execution was performed. Environment-variable changes can increment metadata versions beyond the seven uploaded functions.

## Verification and limitations

The final fourteen live checks cover gateway GET/POST/OPTIONS, both missing-state callbacks, unauthenticated business API/automation/MCP requests, worker GET/POST denial, OAuth start POST/OPTIONS, and invalid JWT rejection on gateway/OAuth starts. All returned expected 200/400/401/405 statuses; no BOOT_ERROR. The two platform-JWT-protected functions' 401s may occur before their application handlers execute; those checks do not establish authenticated handler health.

Fresh cache-busting GET probes also observed `Invalid sign-in state` on the new callback and method rejection on gateway/worker. Earlier exact-URL fetches continued to show old BOOT_ERROR responses after Actions smoke checks passed; they were not treated as fresh runtime acceptance evidence.

Provider registrations/configuration remain **unverified**. Secret metadata contained no separate MCP client JSON, MCP host allowlist, or Google/Microsoft client-secret variables. Existing `JD_SECRETS_JSON` contents were not retrieved; metadata alone cannot prove all native credentials are absent. Configure/verify operator-owned provider apps securely, then perform explicit human consent and authenticated catalog/discovery/refresh/revoke/owner-isolation checks. Ordinary users should not supply PATs as a substitute. No real provider consent or complete authenticated workflow was exercised here.

Remote npm/HTTPS dependency ranges are unchanged and not completely locked. The deployment is source-hashed, not a fully reproducible external dependency graph. No complete predeployment rollback ESZIP could be obtained; do not revert ownership-enforcing handlers or drop additive schema speculatively. Reconcile the recorded migration history mapping before any future migration automation.

## Failures and recovery

1. The connector's single-body upload with immutable remote imports reported ACTIVE, but live gateway/callback probes returned BOOT_ERROR. This deployment method was rejected after testing. Runtime logs were not obtained, so the exact underlying boot exception is not claimed.
2. A tightly scoped owner-authorized GitHub workflow checked out the immutable bundles and compiled/uploaded them through Supabase CLI 3.2.0 `--use-api`. First trigger skipped because Arena appended a co-author trailer; the condition was corrected. Two subsequent attempts stopped before mutation because CLI 3 required noninteractive `--yes`; redacted diagnostics are retained.
3. Run 44290386627 deployed all seven functions and passed twelve HTTP checks. Subsequent read-only verification, after setting the callback URL, passed fourteen checks including invalid JWTs.
4. Initial per-response annotations hit GitHub's ten-notices-per-step limit. Final verification emits one compact annotation containing all fourteen results; complete bodies remain in the Actions artifact.
5. The one-shot deployment trigger was removed. The current workflow performs **read-only unauthenticated verification**, has no deployment credential, and does not invoke authorized work. Existing staged-production workflow and unrelated default-off gates remain unchanged.

Service receipts contain their own timestamps (some report November 18); they are retained as returned, not used to assert the local current date. Evidence records operational observations, not independent review or production/provider acceptance.
