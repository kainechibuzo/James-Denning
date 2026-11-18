# Direct deployment to the owner-confirmed test database

The owner explicitly authorized deployment, declined separate staging, and confirmed `thklwiybjuhrjqrrxyid` is the intended test database. This is a scoped exception for this OAuth rollout, not a change to the existing production/staging workflow or its default safeguards.

`manifest.json` records the reviewed application commit, original local module hashes, bundle hashes and unchanged JWT settings. The seven ESM bundles contain application source only, **no credentials**. They are retained in Git because the connected deployment API accepts one source body rather than a multi-file upload. Each deployed body imports its bundle using an immutable GitHub commit URL. Supabase resolves that module during deployment; no mutable branch URL is used. Remote npm/HTTPS dependencies remain as declared by the original source and are not fully locked by these local hashes.

Reproduce from the manifest's source commit using:

```
npm install --prefix .cache/deploy-tools --no-save esbuild@0.25.12
node scripts/prepare-oauth-testdb-release.mjs
node --test scripts/test-oauth-deployment-bundles.mjs
```

The preparation script resolves the worker's special `./_shared` layout to the canonical shared modules and rejects uncommitted application edits. It does not deploy, apply migrations or read secrets. The bundle tests verify source hashes and unauthenticated request rejection with mocked external libraries, not provider interoperability.

Rollout: migrations for selected native services, connector OAuth and native refresh leases; matching gateway/business callback/business API/runtime consumers; missing MCP OAuth callback. Do not run an unrestricted migration push or deploy unrelated functions. Preserve existing encryption and worker secrets. Provider registrations and their client credentials are a separate readiness requirement.

The existing deployment API's get-function response contains a large ESZIP decoded as text and was truncated; it is **not a usable complete rollback backup**. Prior deployed versions/hashes are recorded as metadata only. Never roll back ownership-enforcing handlers while private connector histories exist. Do not remove the additive columns as a speculative rollback.
