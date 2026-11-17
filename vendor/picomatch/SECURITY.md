# Temporary local picomatch security backport

**This is a locally maintained patch, not an upstream release or an upstream security certification.** The user explicitly selected a local patch while no fixed npm release was available.

## Provenance and scope

- Upstream: `picomatch@4.0.7`, MIT, https://github.com/micromatch/picomatch.
- Advisory: GHSA-fc5q-39xc-vjpf / CVE-2026-112366, https://github.com/advisories/GHSA-fc5q-39xc-vjpf.
- Registry tarball: https://registry.npmjs.org/picomatch/-/picomatch-4.0.7.tgz. Integrity and original/patched file hashes are recorded in `PROVENANCE.json`.
- `LICENSE` and `UPSTREAM-README.md` are retained unchanged. `PATCH.diff` contains the only runtime change, in `lib/parse.js`. Package metadata identifies `4.0.7-jd.1`, is private, and omits upstream development-only dependencies/scripts.

The upstream repeated-extglob analysis misses a single wildcard branch such as `+(*)` or `+(*a)`. The generated nested quantifiers can backtrack exponentially. The backport detects unescaped, unquoted wildcard stars (including within nested expressions) and reuses the existing risky-extglob literalization for `+(...)` and `*(...)`. Escaped stars and bracket/quoted literals remain literal. Existing safe flattening of nested single-character extglobs remains available. This new guard cannot be disabled by `maxExtglobRecursion:false`; that option still controls the upstream recursion policy, not this wildcard protection.

This is conservative: dangerous repeated-wildcard extglobs match their literal spelling instead of their previous wildcard language. The unmodified upstream suite records **1,979 passing / 4 failing** test cases with this patch; the four expect this deliberately removed behavior (`+(*)c`, `*(a*|b)`, and `*/*(W*, *)*`, with `+(*)c` asserted in two cases). Do not describe upstream compatibility as fully passing. Standard Vite path globs, safe extglobs and the application build/layout suites are checked separately. This does not claim to eliminate every possible regex complexity issue or change the safety of caller-supplied raw regular expressions.

## Installation and security gates

The root devDependency uses `file:vendor/picomatch`; the `$picomatch` override routes Vite, tinyglobby and fdir to the same reviewed copy. `.npmrc` uses `install-links=true` so npm installs a packed copy consistently, including on clean CI machines. Run `npm ci` after changing this directory; existing `node_modules` contents are not automatically refreshed.

**npm audit does not independently assess a local backport.** A zero registry-advisory result must not be presented as upstream remediation. Both CI workflows first run `npm run test:dependency-security`, checking installed file hashes, dependency resolution, bounded child-process advisory payloads and normal glob semantics; then run the unchanged `npm audit --audit-level=high`. No advisory allowlist, `--omit=dev`, `continue-on-error`, registry alias or audit-output filtering is used.

The regression tests cover the public, POSIX and internal matcher entrypoints, default/capture/windows/fastpath options and the recursion-limit opt-out. Child processes are forcibly terminated on timeout so a regression cannot hang CI indefinitely.

## Removal / ownership

The repository maintainers own this temporary backport. Check upstream releases/advisory updates during dependency maintenance. When a released version fixes the advisory:

1. Test the upstream version against the security and application suites, including the advisory payloads. Do not trust the version number alone.
2. Remove the local devDependency override, this vendor directory and the local-hash assertions, replacing them with tests for the fixed upstream dependency resolution and payload behavior. Keep the audit gates.
3. Regenerate the lockfile with npm and run a clean `npm ci`, both audits, all Node/browser tests, and web/mobile builds. Review any restored wildcard behavior explicitly.
4. Record evidence in the replacement PR. Do not silently allow the vendor copy and a vulnerable registry copy to coexist.
