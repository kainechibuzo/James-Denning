# Guided token popup — implementation and deployment evidence

## Request and outcome

The user explicitly requested switching to user-pasted API tokens, with Connect opening a popup that links to the credential page and explains how to get/paste the token. This supersedes the earlier no-PAT requirement for supported services.

Implemented the popup for **GitHub, Linear, Airtable, Resend, Apify and Context7**. Each has a provider-specific credential page, least-privilege guidance, masked field, consent, readiness check, loading/error handling, and replacement/disconnect instructions. Native OAuth-only services and unverified/self-hosted catalogue entries are not mislabeled as token-compatible. No managed-provider subscription was created.

Application source: `3dbacea77a6773f06559f36272784f5b3f633acf`.
PR: https://github.com/kainechibuzo/James-Denning/pull/118.

## Backend deployment completed

Target: the owner's already-confirmed test database **thklwiybjuhrjqrrxyid**. No separate staging project.

- Applied only the new `jd_connector_pasted_tokens` migration, recorded as **20261118113318** (repository filename timestamp **20261118120000**). No unrelated migration push. Mapping must be reconciled before future bulk migration automation.
- Read-back SQL fingerprint matches repository file exactly: MD5 `0d31faa48936ba751d026c0c558bea87`. Fingerprint is a comparison aid, not independent attestation. An initial comparison used Python `.strip()` whereas SQL `trim()` removes spaces, not trailing newlines; reading back the applied SQL and using the complete file resolved that comparison mismatch without reapplying anything.
- Verified the new security-definer RPC's empty search path and service-role-only execution; anon/authenticated cannot invoke it directly.
- Deployed only **jd-connect v13**, preserving platform JWT setting `false` and handler-enforced human JWT checks. Supabase reports ACTIVE, deployed code hash `431bc0cb4d179830c616ee4111407a0c6007d98dc81c7e2d1f00dfebf89e6db4`.
- Source-pinned Supabase CLI 3.2.0 `--use-api` deployment succeeded in [run 44295806961](https://github.com/kainechibuzo/James-Denning/actions/runs/44295806961). Unlike the earlier OAuth rollout, this uploads/compiles source directly, not a remote-import wrapper.
- **5 live credential-free HTTP smoke checks passed:** method denial, CORS preflight, unauthenticated setup/start and invalid-JWT start. These prove startup/denial, not authenticated provider connectivity.
- The temporary deployment trigger was removed; the remaining workflow is manual, read-only HTTP verification with no deployment secret.

Exact receipts/request IDs and applied migration identity: `receipts.json`. Workflow run/job and HTTP records: `deployment-run.json`, `deployment-watch.log`, `deployment-annotations.json`, `http-smoke.json`.

## Security behaviour

No new credential store: the existing encrypted/generation-checked token store and discovery/disconnect RPCs are reused. `token:<provider>` identifies manually rotated tokens with no refresh token/expiry; existing consumers already support this bundle form and ownership checks.

New persistence is atomic and rechecks current actor membership. It locks the unique workspace/endpoint slot, refuses another person's or shared history, removes old credentials, invalidates pending OAuth state and approvals, clears grants/tool trust, increments the generation and saves only ciphertext. The HTTP API refuses service-role starts, caller-provided endpoints and unsupported providers. Failed discovery clears only its own generation's credentials, never a newer replacement. Existing human approval requirements remain; no broad grant is enabled by connecting.

The six fixed reviewed HTTPS endpoints are explicitly allowed by code; the custom-host/operator allowlist gate remains for arbitrary/other endpoints. No global allowlist or secret was overwritten. No provider token was read from existing settings, requested in chat, created, logged or used for a real provider action. No authorised worker, purchase, Actor run, email send, or deployment tool was invoked as a test.

## Tests and visual evidence

- **278 targeted Node/PostgreSQL/handler tests passed**, including private ownership, encrypted bundle contents, fixed destinations, malformed tokens, service-role rejection, cross-tenant isolation, generation replacement/disconnect fencing and sanitised failures (`tests.log`).
- **24 token popup layout states passed** at 320, 393 and 1280 pixels in light/dark themes, with contrast checks, keyboard Tab trapping/Escape, focus restoration, clearing input on failed submit/close, replacement, readiness failure and viewer denial (`browser.log`, `browser-results.json`). All network/credentials synthetic.
- **72 existing composer/connector states passed**, retaining non-token OAuth and public/native paths (`connector-regression.log`).
- **60 mobile polish states passed**, including tours and focus (`mobile-regression.log`). The tour focus assertion now waits for effect cleanup before checking the same required focus target; no application tour behaviour was changed.
- Production web build and verifier passed; existing large spreadsheet chunk warning remains (`build.log`). `npm ci` reported no audit vulnerabilities.
- Screenshots: `token-ready-dark-393.png` and `token-ready-light-393.png`, plus failed/readiness/connected states. They depict a synthetic fixture, not a real provider account.

## Failures encountered and corrected

- Local dependencies were absent; installed from the lockfile. Chromium was absent; used the npm-distributed Chromium binary and its supplied libraries locally (no repository runtime dependency added).
- Native dialog alone did not cycle Tab from the last link in this browser; explicit first/last focus cycling was added and verified. Rendering the native dialog within the existing theme tree retains dark/light tokens while the browser's top layer handles the overlay.
- An old OAuth-only UI regression expected GitHub's sign-in page; moved that coverage to Notion and added separate token coverage rather than removing OAuth tests.
- A case-sensitive fixture service label was corrected. The retained tour focus check initially raced React cleanup; now waits for the correct button title/focus before assertion.
- A proposed GitHub documentation subpage was 404; replaced with the verified official remote-server README anchor before deployment.

## Remaining acceptance boundary

No real user PAT/API key was supplied or tested. End-to-end access must be confirmed by the user through the secured popup with an appropriately scoped, non-expired token; provider organisation approvals and plan limits can still block access. Hosted API support is documented, not an assertion that every tool works with every token. Tokens do not refresh automatically, and deleting them locally cannot recall in-flight requests or revoke the original provider token. This change does not make all 78 catalogue entries connectable.

The frontend is released through the normal PR/merge hosting pipeline; backend deployment is separately evidenced above. Provider documentation is linked in `docs/CONNECTOR_TOKEN_SETUP.md`. Service-generated dates are preserved as returned rather than used as the session's current date.
