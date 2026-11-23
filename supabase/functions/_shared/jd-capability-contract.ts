// Interpretation only: this metadata never grants access, approves a request,
// runs a tool or certifies a deployment. Existing server checks remain binding.
export const CAPABILITY_INTERPRETATION = [
  "Keep three separate questions separate: is a tool callable for this role, what approval/effect boundary applies, and what independent live verification evidence exists?",
  "Unverified means independent live verification evidence has not been supplied; it does not mean unavailable, disabled, failed or incapable of execution. Conversely, callable does not mean tested, configured or production-ready.",
  "For a capability question, inspect the current registered inventory without executing writes as a demonstration. For a requested task, use only the tools actually supplied to this request, within their role and approval boundaries. Report the returned result or failure, not an inferred outcome.",
  "Do not describe every saved record as a draft awaiting approval. A tool can persist task or memory records without completing a business activity. Only call a record a draft or approval-pending when its actual tool result or saved state says so.",
  "An approval authorises a particular action; it is not proof that the action executed, that a capability is verified live, or that a business outcome succeeded. Check the associated execution result and persisted records before making those claims.",
  "For capability summaries use short grouped lists: available to request, approval/restriction boundaries, and verification still missing. Avoid a wide inventory table unless the user asks for one. Explain capabilities in plain language, not internal tool names.",
  "Keep normal user-facing status updates concise and action-oriented: lead with what happened, what remains unconfirmed, and one useful next step, usually in 1–3 short sentences. Do not narrate internal checking or repeat caveats. By default, keep raw tool names, UUIDs, event logs, stack traces, SQL details, counters and implementation metadata in the audit or diagnostics view; show them in chat only when the user explicitly asks for technical detail. Never hide a real failure, pending approval or unverified outcome—state it plainly without dumping internal diagnostics.",
].join("\n");

const effects: Record<string, {effect:string; boundary:string}> = {
  get_ai_workforce_catalogue:{effect:"preview_only",boundary:"Reads draft catalogue definitions; does not certify evaluations, hire employees or start billable work."},
  preview_business_workspace:{effect:"preview_only",boundary:"Generates an industry-specific blueprint and context-only advisory brief. No research, activation, hiring, persistence or charges."},
  preview_saas_agent_team:{effect:"preview_only",boundary:"Designs agent definitions and requested permissions only. Does not create running agents, bind tools, authorise spend, run evaluations or deploy software."},
  preview_organisation_blueprint: {effect:"preview_only",boundary:"Generates a proposal without saving or provisioning departments."},
  preview_hiring_vacancy: {effect:"preview_only",boundary:"Generates a vacancy draft; does not publish it or hire anyone."},
  submit_workspace_settings_for_review: {effect:"approval_request",boundary:"Saves an exact settings proposal only. Human approval and explicit application in Review Centre are separate; never approves its own request or claims settings changed on submission."},
  plan_workspace_settings_changes: {effect:"preview_only",boundary:"Reads settings and prepares a proposal; does not apply it."},
  remember_business_fact: {effect:"saved_internal_record",boundary:"May save confirmed business context. Not a draft approval and not proof of a real-world action; never store secrets."},
  create_operational_setup_tasks: {effect:"saved_internal_record",boundary:"May save task records. Per-task approval requirements apply to later actions; saving a task does not complete that activity."},
  submit_organisation_blueprint_for_review: {effect:"approval_request",boundary:"May save a proposal and request review. Does not create departments; approval and successful provisioning are separate."},
  submit_workforce_proposal_for_review: {effect:"approval_request",boundary:"Saves an individual AI employee or drafted AI team proposal for owner review. Approval records the decision only; it does not activate employees, create team instances, grant tools/connectors or enable billing."},
  create_business_document_draft: {effect:"private_document_draft",boundary:"Only on an explicit file request. Saves a private draft; never sends or publishes it."},
  call_connected_mcp_tool: {effect:"connector_dependent",boundary:"Discover first. Read-only calls may execute; write-capable calls request approval. Check execution evidence after approval, never treat an approval as execution."},
  delegate_to_specialist_agent: {effect:"workforce_orchestration",boundary:"Returns one bounded reasoning-only specialist report inside the conversation. The specialist has no tools, approvals, hiring, spending or deployment authority, and JD verifies the report independently."},
  deploy_specialist_workforce: {effect:"workforce_orchestration",boundary:"Runs bounded read-only specialist assignments inside the conversation. Specialists cannot approve, hire, spend, deploy or create agents, and every deliverable requires independent JD verification before completion. Release-gated."},
  propose_agent_definition: {effect:"saved_internal_record",boundary:"Saves a validated specialist proposal as an immutable registry draft for independent human review. Not evaluated, published, executable, hireable or billable."},
};
const readers = new Set([
  "get_approved_business_context", "get_people_intelligence", "get_performance_intelligence", "get_operations_intelligence", "get_workforce_roster",
  "get_organisation_departments", "get_business_memory", "get_workspace_overview",
  "get_hiring_pipeline", "get_billing_snapshot", "get_business_expense_anomalies",
  "get_business_kpi_trends", "get_recent_activity_logs", "get_email_delivery_logs",
  "get_attendance_snapshot", "get_recent_announcements", "get_workspace_settings_catalogue",
  "list_connected_mcp_tools", "list_pending_approvals", "list_workspace_apps", "read_workspace_app",
  "search_connected_repository_code", "read_connected_repository_file",
]);
export function capabilityEffect(name:string) {
  if (Object.hasOwn(effects,name)) return effects[name];
  if (readers.has(name)) return {effect:"read_only",boundary:"Reads authorised records; the result is a bounded observation, not independent verification of the whole capability."};
  return {effect:"not_classified",boundary:"Effect boundary has not been classified. Inspect the registered tool contract; do not assume it is read-only or approved."};
}
