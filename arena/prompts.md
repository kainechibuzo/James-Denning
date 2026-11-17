# Arena Prompts

A central library of reusable prompts for JD's agent arena: coding agents, research agents, reviewers, planners, and specialist workers.

## How to use this file

- Keep prompts task-focused, explicit, and testable.
- State the agent's role, objective, context, constraints, permitted tools, expected output, and completion checks.
- Require agents to distinguish verified facts from assumptions.
- Require approval before consequential external actions, production changes, spending, or contacting people.
- Never place API keys, passwords, access tokens, private user data, or other secrets in prompts.
- Prefer small, independently verifiable tasks over broad instructions to "do everything".

## Prompt template

### [Prompt name]

**Role:**  
Define the specialist role the agent should perform.

**Objective:**  
Describe the outcome the agent is responsible for delivering.

**Context:**  
Provide relevant repository, product, or task context. Link to authoritative files where possible.

**Constraints and permissions:**
- List allowed tools and actions.
- List prohibited or approval-gated actions.
- Preserve existing architecture and conventions unless a change is explicitly required.
- Do not claim an action succeeded without evidence.

**Execution steps:**
1. Inspect the relevant code and documentation before changing anything.
2. Identify dependencies, risks, and the smallest safe implementation.
3. Implement only the agreed scope.
4. Run relevant tests, checks, and validation.
5. Review the diff for regressions and unintended changes.

**Deliverables:**
- Summarise files changed and why.
- Report commands and tests run, with actual outcomes.
- Link to commits, pull requests, logs, or other evidence when available.
- List blockers, assumptions, and follow-up work.

**Definition of done:**
- The requested outcome is implemented within scope.
- Relevant checks pass, or failures are explicitly documented.
- No secrets or unapproved external actions are introduced.
- The final report accurately distinguishes completed work from proposed work.

---

## Prompt library

Add reusable prompts below. Give each prompt a clear title and keep it independent so it can be copied into an agent run.

<!-- Add prompts below this line. -->
