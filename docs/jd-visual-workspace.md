# JD Visual Workspace

JD chat supports a versioned, bounded structured-UI payload stored on the assistant message's `content_json.visual_workspace` field (or `content_json.ui` for compatibility). The normal assistant text remains the source of truth and is always rendered; visual blocks supplement it.

## Payload contract

```json
{
  "version": 1,
  "blocks": [
    { "type": "checklist", "id": "setup", "title": "Company setup", "items": [
      { "title": "Define services", "description": "Choose the freight segment", "status": "completed" },
      { "title": "Confirm operating budget", "status": "pending" }
    ]},
    { "type": "workflow", "title": "Launch workflow", "status": "running", "steps": [
      { "title": "Business plan", "status": "completed" },
      { "title": "Finance review", "status": "running" },
      { "title": "Operations setup", "status": "pending" }
    ]},
    { "type": "question", "title": "Decision required", "prompt": "Which service should launch first?", "options": [
      { "label": "Local delivery", "value": "local delivery" },
      { "label": "Long-distance freight", "value": "long-distance freight" }
    ]},
    { "type": "timeline", "title": "Execution activity", "events": [
      { "title": "Read company records", "status": "completed", "detail": "Read-only workspace lookup" }
    ]},
    { "type": "departments", "title": "Departments", "items": [
      { "name": "Finance", "metric": "Budget draft", "detail": "Awaiting review", "status": "awaiting_approval" }
    ]},
    { "type": "evidence", "title": "Verification evidence", "status": "completed", "summary": "Checks recorded", "items": [
      { "label": "Build", "reference": "CI run #123" }
    ], "details": ["No production changes were made."]}
  ]
}
```

## Supported blocks

- `checklist`: task rows are built from tenant-scoped `jd_operational_tasks`. For rows with a persisted task ID, the UI calls the authenticated `operations.task.transition` action. Queued tasks move to `in_progress`; in-progress tasks can move to `completed`. The server enforces manager/admin access, legal state transitions, tenant scope and optimistic concurrency. Completed/cancelled tasks are not reopened by the visual checkbox.
- `workflow`: ordered workflow stages with status and optional owner/description.
- `question`: bounded choice buttons. Selecting an option submits the selected value as a new chat turn; it does not silently approve a consequential action.
- `timeline`: execution events with status and optional details.
- `departments`: workload metrics grouped from the authoritative `department` field on persisted `jd_operational_tasks`. This is a workload summary, not a separate department directory or headcount system.
- `evidence`: execution-step and audit-event IDs from persisted `jd_automation_steps` and `jd_audit_events`, plus privacy-safe numeric/boolean result summaries persisted from tool outputs. Raw tool results and personal records are not copied into evidence. An empty evidence source is shown as pending, never as verified.

## Status vocabulary

`completed`, `running`, `blocked`, `failed`, `pending`, `awaiting_approval`, `queued`.

## Security and data integrity

- Renderer accepts only known block types and caps blocks, items, events, options and details.
- Text is rendered as React text, never injected as HTML.
- URLs are not accepted as executable actions or navigation targets in visual blocks.
- Tenant and permission checks remain server-side; a visual payload is not an authorization grant.
- A task is shown as completed only after the authenticated task-transition endpoint confirms the database update; the UI does not optimistically mark a failed request as complete.
- Backend producers must derive statuses from persisted job/task/evidence records. Never synthesize completed states from model prose.
- Decision choices are sent back to JD as user input. Existing approval gates remain authoritative.

## Current integration boundary

ChatHome reads `visual_workspace` or `ui` from the assistant message's `content_json`, including streamed message updates returned by the existing authenticated job-status action. The execution worker assembles visual blocks after each completed agent run from tenant-filtered persisted tasks, execution steps and audit events, then stores the payload in the assistant message `content_json.visual_workspace`. Operational tasks and department workload are only returned to admin/manager roles. The existing authenticated task-transition endpoint is used for persistent checklist actions. If a source query fails, that source block is omitted rather than fabricated. Staging and production runtime verification remain deployment gates.