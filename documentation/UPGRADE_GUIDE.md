# Historical v15 Upgrade Guide — JAMES-DENNING
## Report Workflow, Approvals, Signatures & Templates

---

## Files Changed

| File | Status | Notes |
|------|--------|-------|
| `src/AppDemo.jsx` | ✅ Updated | Main app — all UI changes |
| `src/supabaseClient.js` | ✅ Updated | New DB helper methods |
| `supabase/migrations/005_report_workflow.sql` | ✅ New | Run this migration first |

---

## Step 1 — Run the Migration

In your Supabase dashboard → **SQL Editor**, paste and run the full contents of `005_report_workflow.sql`.

This creates:
- `result_approvals` table (EA/MA per class + term + session)
- `signatures` table (reusable signature images)
- `report_templates` table (saved report card configurations)
- New columns on `report_card_publish` (section toggles, signature refs, publisher)
- RLS policies for all new tables
- Seeds new permissions into `role_permissions`

---

## Step 2 — Create the Storage Bucket (for signatures)

In Supabase → **Storage** → **New bucket**:
- Name: `school-assets`
- Public: **Yes** (so signature images render in PDFs)

Set this bucket policy to allow authenticated uploads:
```sql
CREATE POLICY "authenticated upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'school-assets');

CREATE POLICY "public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'school-assets');
```

---

## Step 3 — Replace App Files

Replace your existing files:
```
src/AppDemo.jsx       ← from outputs/rgs-portal-v15/AppDemo.jsx
src/supabaseClient.js ← from outputs/rgs-portal-v15/supabaseClient.js
```

---

## What's New — Feature Summary

### 1. Report Card Publishing Control
- Reports are **not** automatically visible after results are uploaded
- Only Admin or users with `action-publish-reports` permission can publish
- Unpublish button immediately hides cards from students/parents
- Published per **class + term + session**

### 2. Report Card Customisation
New **Customise** button on the Report Cards page opens a modal with:
- ✅ Toggle: Character & Affective Evaluation (CAE)
- ✅ Toggle: Class Teacher's Comment
- ✅ Toggle: School Principal's Comment
- ✅ Toggle: Parent / Guardian Acknowledgement
- ✅ Toggle: Student Position in Class
- ✅ Toggle: Next Term Begins (with date input)
- Text fields for class teacher and principal comments
- Signature selectors (see feature 3)
- Template loader (see feature 4)

### 3. Signatures
**Admin → ✍️ Signatures** (new nav item):
- Upload signature images (PNG/JPG)
- Assign a name and role label (e.g. "Mr. Okon — Class Teacher")
- Activate/deactivate signatures
- Select a teacher signature and principal signature when customising a report
- Signatures appear in the PDF (replacing the blank "Signature & Stamp" line)
- All signatures are reusable across any class/term

### 4. Report Templates
**Admin → 📑 Report Templates** (new nav item):
- Save a named configuration: which sections are enabled, default comments, signature selections, next-term date
- Mark one template as **Default** — it is pre-selected when customising any report
- Apply a template instantly from the Customise modal

### 5. Student Position (Fixed)
- Position is now **automatically calculated** from average score within the class
- Displays as `3 / 25` (rank / total students)
- Shown in the preview header and in the PDF
- Can be toggled off via the Customise modal / template

### 6. Result Completion Check
On the Report Cards page (filter card area):
- **Green badge**: "✅ Results Complete" — all students have all subjects
- **Red badge**: "⚠️ Incomplete Results" — with a list of each student and their missing subjects
- The system warns before publishing incomplete results (but does not block it)

Also visible on the **Result Approvals** page per class.

### 7 & 8. Approval Workflow (EA + MA)

#### EA — Educator Approval
- Available on **Upload Results** page for teachers
- Available on **Result Approvals** page for admins
- Once EA is given: teachers can no longer save results (they see "🔐 EA Approved")
- EA can be revoked by admin (unlocks teacher editing)

#### MA — Manager Approval
- Available on **Report Cards** page header button (admin only by default)
- Available on **Result Approvals** page per class
- Requires EA to be approved first
- Once MA is given: results are **fully locked** — no one can edit
- MA can be revoked by admin

#### Result Approvals Page (new)
**Admin → 🔏 Result Approvals**:
- Filter by session + term
- See all classes in a grid with:
  - Completeness status (complete / N missing)
  - EA status badge
  - MA status badge
  - Approve/Revoke EA button
  - Approve/Revoke MA button (disabled if EA not yet done)
  - Expandable detail: who approved, when, any notes
- This is the **bulk approval interface** — one action per class, not per student or subject

### 9. New Permissions
The following action permissions are now visible in **Settings → Permissions → Teacher Action Controls**:

| Permission ID | Label | Default |
|---------------|-------|---------|
| `action-publish-reports` | Publish Report Cards | Denied |
| `action-educator-approval` | Give Educator Approval (EA) | Allowed |
| `action-manager-approval` | Give Manager Approval (MA) | Denied |
| `action-manage-signatures` | Manage Signatures | Denied |
| `action-manage-templates` | Manage Report Templates | Denied |
| `action-view-all-reports` | View All Report Cards | Denied |

Admins can grant any of these to individual teachers via **Settings → Permissions → User Overrides**.

### 10. Workflow Summary
The full intended flow:
1. Teachers upload student results → **Upload Results** page
2. System checks completeness → visible on Report Cards + Result Approvals pages
3. Form teacher gives **EA** → results locked for teacher editing
4. Admin/manager gives **MA** → results fully locked
5. Admin customises report layout → **Customise** button (toggles, comments, signatures, template)
6. Admin publishes report cards → **Publish Cards** button
7. Students and parents can now view their report cards
8. Admin can **Unpublish** at any time (hides immediately)

---

## Notes for Admins

- **Students cannot see any report card until it is explicitly published**, even if results exist. This is enforced at the UI level (student `my-results` page checks `is_published`).
- The **Result Approvals page** is designed for efficient bulk approval — one click per class, not per student or subject.
- Templates are optional — you can customise each term manually if preferred.
- Signature images are stored in Supabase Storage (`school-assets` bucket). The bucket must be public for images to appear in printed PDFs.
