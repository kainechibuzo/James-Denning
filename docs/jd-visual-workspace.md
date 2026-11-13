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

- `checklist`: interactive local check marks and completion ratio. These are explicitly local presentation state; they do not mutate task records.
- `workflow`: ordered workflow stages with status and optional owner/description.
- `question`: bounded choice buttons. Selecting an option submits the selected value as a new chat turn; it does not silently approve a consequential action.
- `timeline`: execution events with status and optional details.
- `departments`: compact department metrics and status.
- `evidence`: evidence labels/references and expandable detail.

## Status vocabulary

`completed`, `running`, `blocked`, `failed`, `pending`, `awaiting_approval`, `queued`.

## Security and data integrity

- Renderer accepts only known block types and caps blocks, items, events, options and details.
- Text is rendered as React text, never injected as HTML.
- URLs are not accepted as executable actions or navigation targets in visual blocks.
- Tenant and permission checks remain server-side; a visual payload is not an authorization grant.
- The renderer does not claim a task is complete because a user ticked a local checkbox.
- Backend producers must derive statuses from persisted job/task/evidence records. Never synthesize completed states from model prose.
- Decision choices are sent back to JD as user input. Existing approval gates remain authoritative.

## Current integration boundary

ChatHome reads `visual_workspace` or `ui` from the assistant message's `content_json`, including streamed message updates returned by the existing authenticated job-status action. The renderer and transport are implemented. The agent runtime does not yet automatically produce these payloads from every tool result; backend block production and live staging verification remain separate follow-up work.