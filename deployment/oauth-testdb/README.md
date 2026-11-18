# Direct deployment to the owner-confirmed test database

The owner explicitly authorized deployment, declined separate staging, and confirmed `thklwiybjuhrjqrrxyid` is the intended test database. This is a scoped exception for this OAuth rollout, not a change to the existing production/staging workflow or its default safeguards.

`manifest.json` records the reviewed application commit, original local module hashes, bundle hashes and unchanged JWT settings. The seven ESM bundles contain application source only, **no credentials**. They are retained in Git as the immutable release artifact. The initial connector single-body API attempt used pinned remote imports but returned `BOOT_ERROR`; that method is not suitable for this rollout and must not be repeated. The successful release checked out bundle commit `8b51d63089623042caf859afbbabd3afcead7311`, placed each bundle into its own function directory, and used Supabase CLI 3.2.0 `functions deploy --use-api --remote=thklwiybjuhrjqrrxyid --yes` to compile/upload the functions. The deployed functions do not import these bundles from GitHub at runtime. Remote npm/HTTPS dependencies remain as declared by the original source and are not fully locked by these local hashes.

Reproduce from the manifest's source commit using:

```
npm install --prefix .cache/deploy-tools --no-save esbuild@0.25.12
node scripts/prepare-oauth-testdb-release.mjs
node --test scripts/test-oauth-deployment-bundles.mjs
```

The preparation script resolves the worker's special `./_shared` layout to the canonical shared modules and rejects uncommitted application edits. It does not deploy, apply migrations or read secrets. The bundle tests verify source hashes and unauthenticated request rejection with mocked external libraries, not provider interoperability.

Rollout: migrations for selected native services, connector OAuth and native refresh leases; matching gateway/business callback/business API/runtime consumers; missing MCP OAuth callback. Do not run an unrestricted migration push or deploy unrelated functions. Preserve existing encryption and worker secrets. Provider registrations and their client credentials are a separate readiness requirement.

The existing deployment API's get-function response contains a large ESZIP decoded as text and was truncated; it is **not a usable complete rollback backup**. Prior deployed versions/hashes are recorded as metadata only. Never roll back ownership-enforcing handlers while private connector histories exist. Do not remove the additive columns as a speculative rollback.
