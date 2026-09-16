# Promotion & Session Rollover — Build Spec

_Status: proposed / not yet built. Author: design discussion, 12 Jul 2026._

Standardises terms, adds an admin-driven end-of-session promotion, and auto-drafts the
next session. No teacher involvement, no auto-promotion rule: **everyone in a class is
promoted by default via a preset map; the admin marks the exceptions.**

---

## 1. Goals & non-goals

**Goals**
- One-time **class progression map** (JSS 1 → JSS 2, SS 2 → SS 3, SS 3 → Graduate).
- End-of-session promotion that defaults every active student to *Promote*, lets the admin
  flip exceptions to *Repeat*, and auto-*Graduates* terminal classes.
- A deliberate **arm → review draft → commit** flow with a single, **reversible** commit.
- Standardised terms (order 1/2/3) so app logic stops guessing term position from names.
- Auto-create the next session as an **inactive draft** (shell + 3 terms) during commit.

**Non-goals (explicitly out of scope)**
- No promotion rule / auto-computation from scores.
- No teacher involvement (no per-subject or form-teacher toggles).
- No auto-*activation* of the next session — admin activates it separately.

---

## 2. Invariants (must always hold)

1. **Promotion only ever changes a student's *current* class** (`students.class_id`) and, for
   graduates, `students.status`. It must **never** rewrite `class_id` on historical
   `portal_results` rows. Past results stay frozen with the class they were earned in — this
   is what keeps transcripts & report cards truthful across sessions.
2. **All term-position logic keys off `terms.term_order`, never the term name.** Names remain
   editable display labels. (Replaces the fragile regex name-matching in
   `transcript.jsx` `termPos()` and anywhere results are grouped by term.)
3. The promotion **commit is gated**: it is only enabled when the session has been explicitly
   *armed* for promotion (see §5). Default ≠ automatic.

---

## 3. Data model changes

### 3.1 `terms` — add stable order
- Add `term_order SMALLINT NOT NULL` (1, 2, 3). Unique per `(school_id, session_id)`.
- `name` stays free-text/editable ("First Term", or a school's custom label).
- **Promotion term = the term with the highest `term_order` in the session** (normally 3).
- Migration: backfill `term_order` for existing terms by inferring from current names
  (first/1st→1, second/2nd→2, third/3rd→3); flag any that can't be inferred for manual fix.

### 3.2 `classes` — the progression map
- Add `promotes_to_class_id BIGINT NULL REFERENCES classes(id)`.
- `NULL` = **terminal class** → students graduate.
- Managed on the Promotions page (§6.1). Set once, reused every year.

### 3.3 `students` — new status
- Add `graduated` as a valid status value (distinct from `left`, so alumni are
  identifiable). Graduated students are excluded from active rosters but retained.

### 3.4 `promotion_runs` — one row per session rollover
| column | type | notes |
|---|---|---|
| id | bigint pk | |
| school_id | uuid | tenant |
| from_session_id | bigint | session being closed |
| to_session_id | bigint null | the draft session created at commit |
| promotion_term_id | bigint | the armed term (highest order in from_session) |
| status | text | `armed` \| `committed` \| `reverted` |
| armed_by / armed_at | text / timestamptz | |
| committed_by / committed_at | text / timestamptz | |
| created_at | timestamptz | |

Only one non-reverted run per `(school_id, from_session_id)`.

### 3.5 `promotion_decisions` — one row per student in a run
| column | type | notes |
|---|---|---|
| id | bigint pk | |
| run_id | bigint fk → promotion_runs | |
| school_id | uuid | |
| student_id | text/bigint | |
| from_class_id | bigint | class at time of run (for revert) |
| to_class_id | bigint null | target when `promote`; null for repeat/graduate |
| decision | text | `promote` \| `repeat` \| `graduate` |
| created_at / updated_at | timestamptz | |

---

## 4. DB helper methods (supabaseClient.js, service-key pattern like existing code)

- `getPromotionMap()` / `setPromotesTo(classId, toClassId|null)` — the class map.
- `getActivePromotionRun(fromSessionId)` — current armed/committed run + decisions.
- `armPromotionRun(fromSessionId)` — create run (`armed`), snapshot active students into
  `promotion_decisions` defaulted (promote→mapped, terminal→graduate), set promotion_term_id.
- `updatePromotionDecision(id, {decision, to_class_id})` — edit an exception in the draft.
- `commitPromotionRun(runId, {nextSessionName, copySubjects, copyFeeTemplates})` — see §5.3.
- `revertPromotionRun(runId)` — see §5.4.

---

## 5. The promotion-term indicator & lifecycle

### 5.1 Arm (deliberate, per session)
Admin opens Promotions, picks the session to close, confirms the system-selected promotion
term (highest `term_order`), and clicks **Arm Promotion**. This creates the `promotion_run`
in `armed` status and snapshots the draft decisions. The dashboard shows a reminder while a
run is armed.

### 5.2 Review draft
Active students listed grouped by class, each defaulted:
- normal class → **Promote → mapped class**,
- terminal class (no `promotes_to`) → **Graduate**.
Admin flips the school's "do-not-promote" list to **Repeat** (stays in same class). All edits
are draft-only; nothing has moved. Soft warning shown if the promotion term's results aren't
yet approved (interlock) — **warn, don't hard-block**.

### 5.3 Commit (single, reversible)
On **Commit Promotions**:
1. For each decision: `promote` → set `students.class_id = to_class_id`; `repeat` → no change;
   `graduate` → set `students.status = 'graduated'`.
2. Write one `admin_audit_log` row per student (old→new class / status).
3. **Auto-create the next session as a draft**: `is_active = false`, name auto-suggested by
   incrementing the year pattern ("2025/2026"→"2026/2027") but **editable**; create its 3
   terms with `term_order` 1/2/3 and default names, dates blank. Optionally copy subjects
   and/or fee templates from the closing session (admin checkboxes — default off).
4. Set run `status = committed`, record `to_session_id`, `committed_by/at`.

Session is **created, not activated.** Admin sets term dates and activates it separately when
the new year begins.

### 5.4 Undo
**Revert Promotion Run** reverses every change as a batch: restore `class_id` from
`from_class_id`, restore graduated students to `active`, delete the draft next session **iff**
it was never activated. Set run `status = reverted`. (The current bulk tool has no undo — this
replaces it.)

---

## 6. Promotions page — UI flow

### 6.1 Setup tab — Progression Map
List every class with a "promotes to →" dropdown (or "Graduate" = leave blank). Saved to
`classes.promotes_to_class_id`. One-time; persists across years.

### 6.2 Run tab — Arm / Review / Commit
- If no armed run: session picker + **Arm Promotion** button (shows which term is the
  promotion term).
- If armed: draft table grouped by class with per-student Promote/Repeat/Graduate control;
  counts (X promote, Y repeat, Z graduate); interlock warning if results unapproved;
  **Commit** (with next-session name field + copy checkboxes) and **Discard** (delete run).
- If committed: summary + **Revert** + links to printable lists; panel to review/activate the
  drafted next session.

### 6.3 Printable outputs
Promotion list, Repeaters list, Graduates list (per class / whole session).

---

## 7. Ripple benefits beyond promotion
- `term_order` lets `transcript.jsx`, report cards, and results grouping stop guessing term
  position from names — removes a real fragility.
- Correct per-session class history (written by promotion) is exactly what the multi-session
  transcript reads to show the right class per year.

---

## 8. Build order (suggested)
1. Migrations: `terms.term_order` (+backfill), `classes.promotes_to_class_id`,
   `students.status` graduated, `promotion_runs`, `promotion_decisions`.
2. Refactor term-position logic to use `term_order` (transcript/results/report cards).
3. DB helpers (§4).
4. Promotions page: Setup (map) → Run (arm/review/commit/revert) → printable lists.
5. Draft-session rollover inside commit; separate activate step on the session page.
6. Dashboard "promotion armed" reminder.
7. Update CLAUDE.md + PROJECT_NOTES.md.

## 9. Open items to confirm before build
- Session-name auto-increment pattern: assume `YYYY/YYYY+1`? (editable fallback covers others.)
- Copy subjects / fee templates on rollover: default off, admin opt-in — confirm.
- Interlock on results approval: soft warning (agreed) vs hard block.
