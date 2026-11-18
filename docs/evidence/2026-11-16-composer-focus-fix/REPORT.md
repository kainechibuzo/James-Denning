# Composer browser-layout failure: focus/caret race fix

**Local-verification checkpoint: reproduced and fixed locally; remote CI had not yet run.**

Branch: `arena/6b45099a-james-denning`, based on merge commit `0bd17c4243ffb8358240d91ac52e1729bd215929` (PR #112). The evidence directory uses the session-supplied date, 2026-11-16. At this local-verification checkpoint, no commit, push, PR, merge or deployment had been performed for the follow-up. The user subsequently authorized PR creation and merge; the PR's check and merge records track that release step.

## Original CI and diagnostic limit

The failing Web CI run is [44186304540](https://github.com/kainechibuzo/James-Denning/actions/runs/44186304540), source `77912453a6274636c9d991954841afcc4b597dd4`. GitHub's job metadata confirms the failure in **Test chat, settings and SaaS agent layouts in Chromium**. See `original-ci-status.json`.

The run-log storage download still returns EOF from this sandbox. Its exact assertion is unavailable, so this report does not claim to have recovered it or prove that it was the only failure. The other CI runs passed the same source, consistent with an intermittent defect. The full layout command also passed once locally before the repeated test exposed the problem.

## Reproduced failure

Running the unchanged `scripts/test-composer-connectors-layout.mjs` repeatedly failed on the **fifth run** at the assertion following `Please @People` selection:

```text
Expected: /^Please Give me an overview of people/
Actual:   Summarise billing, payments and outstanding balances. Please Give me an overview of people, teams and outstanding people-related work.
```

See `intermittent-before.log`. Earlier Billing text survived what should have been a complete draft replacement.

### Cause

`ComposerTools` used `requestAnimationFrame` to focus the textarea and set its caret after selecting a prompt. A subsequent input replacement can select all existing text before that callback runs. The stale callback then collapses the selection, so the next text insertion appends instead of replacing. Similarly, a delayed close/Escape callback can steal focus after the user moves to another field.

This is a real UI ordering bug, not an assertion to remove or an external connector failure.

## Fix

- `src/chat/ComposerTools.jsx`: stage a one-shot focus/caret restoration in a ref, then apply it in `useLayoutEffect` with the React commit, before the next browser input event. A text-match guard avoids applying a caret to a different draft. No delayed focus callbacks remain in this component.
- `scripts/test-composer-focus-layout.mjs`: deterministic regression using the real React component. Hold animation-frame callbacks, select all, then flush the queued callbacks before inserting replacement text. This fails on the old component with `Review billing. Please @People`, and passes with the fix.
- The regression covers menu Enter, menu click, mention Enter, mention Tab, committed caret position, Escape/close focus return, later focus retention, and zero submission/navigation/service access.
- `package.json`: run the regression from `test:connectors`, already included in `test:chat-layout` in both CI workflows.

No existing assertions were removed, no sleeps/retries were added to make them pass, and no permission or service behavior was changed. Repeated testing below is a diagnostic stress run, not a retry policy in CI.

## Verification

Local environment: Node **v22.22.3**, Chromium **153.0.8010.0**.

| Check | Result | Evidence |
| --- | --- | --- |
| Deterministic regression against original component | **Expected failure**, retained Billing prompt | `deterministic-before.log` |
| Same regression after fix | **4 selection paths passed**, plus dismissal/caret/no-execution checks | `deterministic-after.log` |
| Original connector layout suite repeated after fix | **10 consecutive passes**, 36 theme states per run (360 total) | `repeated-connector-layouts.log` |
| Complete `npm run test:chat-layout`, including new regression | **Passed** | `all-layout-tests.log` |
| All non-layout Node suites | **1,234 passed; 0 failed/skipped** | `node-tests.log` |
| Production web build/asset verification | **Passed**, existing configuration/large-chunk warnings retained | `build-verification.log` |
| Safety verification guards | **43 passed** | `verification-guards.log` |
| npm audit | **0 vulnerabilities reported** | `dependency-audit.log` |
| Diff whitespace check | **Passed** | `git diff --check` |

The repeated connector runs and full layout command also ran concurrently, with the Node suites/build overlapping their start. All completed successfully. No backend, production service, connector execution, grant change or workflow dispatch was involved. These browser tests are synthetic UI tests, not live business acceptance.

## Reproduce

```sh
npm ci
# Point CHROMIUM_EXECUTABLE_PATH at an installed Chromium/Chrome if needed.
node scripts/test-composer-focus-layout.mjs
npm run test:chat-layout
npm run verify:web
node --experimental-strip-types --test $(find scripts -maxdepth 1 -name 'test-*.mjs' ! -name '*layout*' ! -name 'test-verification-guards.mjs' | sort)
npm run test:guards
npm audit --audit-level=high
```

The sandbox used temporary `@sparticuz/chromium` tooling under `.cache/browser`, with `CHROMIUM_EXECUTABLE_PATH=/tmp/chromium`, `LD_LIBRARY_PATH=/tmp/lib`, and `FONTCONFIG_PATH=/tmp/fonts`. Those files are not application dependencies and are not persisted evidence. There are no dependency-version or lockfile changes.

## Remaining release check

The reproduced defect is fixed and the complete local CI layout command is green. **A fresh remote CI run is still required before claiming the hosted CI failure is resolved.** The original failed run remains historical evidence; this work does not turn it green retroactively or establish production deployment.
