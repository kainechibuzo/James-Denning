test:skills exit=0
test:navigation exit=0
test:registry exit=0
test:workforce exit=0
test:capabilities exit=0
test:backend-release exit=0
test:usage exit=0
test:history exit=0
test:agents exit=0
test:guards exit=0
test:checklist exit=0
verify:web exit=0
build:mobile exit=0
deno check exit=0
deno runtime tests exit=0
skills: # tests 50
skills: # pass 50
skills: # fail 0

## Scope

JD Skills phase 4 + starter catalogue:
- Starter catalogue: six curated skill packages vendored from Anthropic's public
  skills repository (github.com/anthropics/skills, Apache-2.0) under public/skills/
  — instruction/reference text only, upstream executable scripts intentionally
  omitted (JD never executes package content). Verified offline by
  scripts/test-starter-skills.mjs via the secure import inspector.
- Runtime discovery wiring (phase 4): loadAssignmentSkillContext in
  jd-agent-runtime.ts — release-gated (JD_SKILLS_ENABLED), run-recorded only,
  exact expected version, hostile-receipt-proof, untrusted banner, bounded
  skill reference on workforce cards. No instruction text leaves the backend.

## Gate summary

- test:skills 50/50 (inspection 10, PGlite SQL 13, UI 10, service 9, starter 8)
- history 25, workforce 36, registry 92, capabilities 58, backend-release 82,
  usage 104, agents 63, navigation, guards, checklist, verify:web,
  build:mobile, deno check, deno runtime tests (20 + gemini 4) — all exit 0.

## Guarantees exercised

- Starter import uses the identical quarantine pipeline; review is still required.
- Skill loading is release-gated, recorded on the run, and banner-marked untrusted.
- Workforce cards show only name+version; instruction text never reaches the browser.
