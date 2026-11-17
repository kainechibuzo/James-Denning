# Offline cancellation acceptance-evidence harness

**This harness does not execute staging tests.** It prepares a not-run case register and checks exported observations locally. There is no network, authentication, SQL execution, provisioning, deployment or approval-setting mode. Current authorisation remains local-only; the shipping checked-cancellation gates remain disabled.

It addresses a narrower problem: evidence must not pass merely because an endpoint returned 200, an empty fixture was invisible, or somebody set a `passed` flag. The same record assertions also run against actual repository SQL in local PGlite tests.

## Commands

```sh
# After a separately reviewed candidate commit, create a NEW bundle.
# .cache is ignored; do not put credentials or real personal data here.
node scripts/jd-cancellation-acceptance.mjs --init .cache/jd-cancellation/rehearsal-001

# Inspect after collecting evidence. This is entirely offline.
node scripts/jd-cancellation-acceptance.mjs --check .cache/jd-cancellation/rehearsal-001

# Local regression tests (also included in CI's test:execution).
node --test scripts/test-cancellation-acceptance.mjs
npm run test:execution
```

`--init` refuses an existing directory. It writes `plan.json` and `PROCEDURE.md`. Every case/gate starts **not-run** and the environment starts **unconfigured**. It captures HEAD, whether the working tree is dirty, and SHA-256 hashes of selected cancellation sources and the evaluator. The full commit and independent deployed dependency/schema review remain necessary; the selected hashes are not a complete runtime dependency lock.

`--check` reads only local files. Exit **2** means blocked/invalid. Exit **0** means only **ready-for-independent-review**, never approved, deployed or live-verified. Both `liveAcceptanceVerified` and `productionApproved` are always false. Dirty/drifted sources, pending/failed cases or review gates, and local/unconfigured evidence keep the result blocked.

A source change requires a fresh bundle. Do not edit hashes to relabel an old run as a new candidate. Keep earlier failed bundles rather than overwriting them. Reports are printed without raw observations or arbitrary error text; this is not a comprehensive secret scanner. Sanitize evidence before ingestion and review it before committing any artifacts.

## Observation cases (18)

| Cases | Required observation |
|---|---|
| `owner-queued`, `admin-retry-wait` | HTTP 200, correct actor/tenant, observed version, both job/run cancelled, later matching completion timestamps, exactly one matching transactional audit and receipt; preserve all other job/run/step/audit evidence |
| `manager-denied`, `staff-denied`, `viewer-denied`, `finance-denied`, `hr-denied`, `contractor-denied` | HTTP 403 and unchanged persisted snapshots |
| `outside-tenant` | Known real job/run in the other synthetic tenant; HTTP 404, unchanged snapshots |
| `missing-session` | No authenticated actor; HTTP 401, unchanged snapshots |
| `stale-version` | Genuinely different timestamp down to microseconds; HTTP 409, unchanged snapshots |
| `audit-rollback`, `run-rollback` | Scoped staging fault injection; HTTP 500 plus observed SQLSTATE 23514 and unchanged snapshots |
| `duplicate-replay` | Previously cancelled job/run and exactly one prior cancellation audit; HTTP 409, unchanged snapshots |
| `running-job`, `terminal-run` | Running job/running run or queued job/completed run; HTTP 409, unchanged snapshots |
| `legacy-client-checked-server`, `checked-client-legacy-server` | Incompatible release action; HTTP 409 and no mutation |

The missing-session observation uses privileged **independent fixture read-back**, not data returned to an unauthenticated caller. Rejections must not acknowledge a cancellation/audit. Snapshots are normalized by row ID, so ordering differences are harmless but duplicate IDs and missing tables fail. Existing effects, result JSON, steps, checkpoints, attempts and queue-message identities cannot disappear on a successful cancellation.

These are representative executable assertions, not exhaustive live test coverage. All terminal states, forged identities, expired leases and multi-session behaviour are also required in the review gates below.

## After separate staging authorisation: collection protocol

Follow [the cancellation release procedure](JD_CANCELLATION_RELEASE.md) first. A separately reviewed checked-mode candidate and genuine isolated project are prerequisites. This harness does **not** bypass the current compatibility release planner's prohibition on early checked-mode activation.

1. Have an authorised operator independently establish project isolation, exact deployed source/dependencies, actual migration history/constraints and synthetic fixtures. Record that evidence before attempting writes. Never use production or an unrelated project.
2. Prepare a fresh clean-source plan. Set its `environment` to `{"kind":"isolated-staging","projectRef":"<actual independently verified 20-letter ref>"}`. This field is an operator declaration, not isolation proof. Known production/legacy refs are rejected. Local test bundles use `{"kind":"local-simulation","projectRef":null}` and remain blocked.
3. For each case, authenticate the required real session, observe the job's exact timestamp, and capture full **synthetic-fixture** job/run/step/audit rows before the attempt. Include the target plus unrelated sentinel rows to expose unintended writes. Do not export the whole tenant/database or live personal data.
4. Make exactly the intended request through the deployed endpoint (the harness does not send it). Retain a redacted request ID, status/body, relevant SQLSTATE and independently queried after-snapshot. Do not infer audit persistence from the HTTP body alone. Fault injection requires separate scoped permission and removal checks.
5. Store one JSON observation per case, matching the shape below. Attach redacted request/SQL/worker logs as supporting files. Use relative paths within the bundle, regular files only, at most 1 MiB per file and at most 12 attachments per entry. No symlinks, traversal, absolute paths or credential files.
6. Compute SHA-256 from the final bytes (`sha256sum <file>`). Set the case `outcome` to `recorded`, its `observation` to `{ "path": "owner-queued.json", "sha256": "<64 lowercase hex>" }`, and `attachments` to an array of the same path/hash objects. Use `failed` when the intended test failed; retain the evidence. Do not replace failures with a `passed` claim—this value is invalid.
7. Complete each manual review gate with `outcome: "recorded"`, an actual ISO timestamp, a substantive `actual` result (20–4000 characters), and hashed supporting attachments. Record failures rather than hiding them. The checker verifies presence/integrity only, not the truth or sufficiency of these statements.
8. Run `--check`, retain its output, and present the source-identified evidence and **every failure** to the owner. Even all-consistent staging-labelled files require independent authenticity, concurrency, queue and lifecycle review. No production approval is implied.

### Observation JSON shape

Use actual synthetic-fixture UUIDs and raw database timestamps, not these explanatory placeholders. `jobs`, `runs`, `audits`, `steps` contain full persisted synthetic rows; empty target fixtures are rejected.

```json
{
  "caseId": "owner-queued",
  "sourceSha": "<exact reviewed 40-character commit>",
  "environment": "isolated-staging",
  "projectRef": "<actual staging ref>",
  "observedAt": "<actual ISO timestamp>",
  "request": {
    "role": "owner",
    "actorId": "<authenticated UUID>",
    "actorSchoolId": "<authenticated tenant UUID>",
    "jobId": "<fixture UUID>",
    "runId": "<fixture UUID>",
    "expectedUpdatedAt": "<raw observed timestamp including microseconds>",
    "action": "execution.job.cancel_checked"
  },
  "response": {"status": 200, "body": "<replace with actual response object>"},
  "before": {"jobs": [], "runs": [], "audits": [], "steps": []},
  "after": {"jobs": [], "runs": [], "audits": [], "steps": []}
}
```

For missing-session, `role`, `actorId`, `actorSchoolId` are null. For rollback cases add `"sqlstate":"23514"` only when that error was actually observed. The tests illustrate complete **local synthetic** objects; do not relabel them as deployed evidence.

## Eight mandatory independent live-review gates

The generated procedure gives the expected evidence for:

1. Isolation, schema/dependency/source identity and checked release configuration.
2. Sessions, grants, RLS, role/tenant boundaries and identity forgery.
3. Concurrent worker claim/cancel in **separate PostgreSQL sessions**, including profile changes, duplicate attempts, lock waits and timeouts/deadlocks.
4. Real pgmq delivery/redelivery and retry exhaustion with correlated worker logs.
5. Scoped fault injection, rollback persistence and removed fault hooks.
6. Lost acknowledgement, UI repeat blocking, refresh and **new-session** audit read-back.
7. Full state/version/client-server compatibility matrix.
8. Emergency revocation, in-flight reconciliation and reviewed reapplication.

**Limitations:** files, timestamps, project/source labels and manual statements can be fabricated. Hashes detect altered bytes relative to the manifest; they do not authenticate the producer. A consistent bundle is not a signature, an independent review, proof of real concurrency, or release authority. The harness never writes `JD_BACKEND_RELEASE_APPROVED_SHA`, changes a checklist to verified, enables the feature, or changes production approval.
