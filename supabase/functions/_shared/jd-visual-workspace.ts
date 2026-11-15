export type JdVisualTask = {
  id: string; title: string; description?: string | null; department?: string | null;
  priority?: string | null; status: string; due_at?: string | null; updated_at?: string | null; metadata?: Record<string, unknown> | null;
};
export type JdVisualDepartment = { name: string; purpose?: string | null };
export type JdVisualStep = {
  id: string; tool_key: string; status: string; error_message?: string | null; output_json?: { evidence?: Record<string, unknown> | null } | null;
  started_at?: string | null; completed_at?: string | null;
};
export type JdVisualAudit = { id: string; event_type: string; created_at: string; event_json?: Record<string, unknown> | null };

const taskStatus = (status: string) => status === "completed" ? "completed" :
  status === "in_progress" ? "in_progress" : status === "queued" ? "queued" : status === "blocked" ? "blocked" :
  status === "cancelled" ? "failed" : "pending";

/** Build assistant UI only from tenant-filtered persisted operational and audit records. */
export function buildJdVisualWorkspace(input: {
  tasks?: JdVisualTask[]; steps?: JdVisualStep[]; audit?: JdVisualAudit[];
  tasksAvailable?: boolean; evidenceAvailable?: boolean;
  departments?: JdVisualDepartment[]; departmentDefinitionsAvailable?: boolean;
  tasksTotal?: number | null;
}) {
  const blocks: Record<string, unknown>[] = [];
  if (input.tasksAvailable) {
    const tasks = (input.tasks || []).slice(0, 30);
    blocks.push({
      type: "checklist", id: "operational-tasks", title: "Operational tasks",
      items: tasks.slice(0, 30).map((task) => ({
        id: task.id, title: task.title, description: task.description || "",
        status: taskStatus(task.status), priority: task.priority || "normal",
        department: task.department || "Unassigned", due_at: task.due_at || null,
        owner: typeof task.metadata?.owner_role === "string" ? task.metadata.owner_role : "Unassigned",\n        dependencies: Array.isArray(task.metadata?.dependencies) ? task.metadata.dependencies : [],
        approval_required: task.metadata?.approval_required === true,
        approval_reason: typeof task.metadata?.approval_reason === "string" ? task.metadata.approval_reason : "",
      })),
    });
    const departments = new Map<string, { total: number; open: number; completed: number; blocked: number; purpose?: string }>();
    for (const definition of input.departments || []) {
      const name = String(definition.name || "").trim().slice(0, 120);
      if (name) departments.set(name, { total: 0, open: 0, completed: 0, blocked: 0, purpose: definition.purpose || undefined });
    }
    for (const task of input.tasks || []) {
      const name = String(task.department || "Unassigned").trim().slice(0, 120) || "Unassigned";
      const row = departments.get(name) || { total: 0, open: 0, completed: 0, blocked: 0 };
      row.total += 1;
      if (task.status === "completed") row.completed += 1;
      else if (task.status === "blocked") row.blocked += 1;
      else if (!["cancelled"].includes(task.status)) row.open += 1;
      departments.set(name, row);
    }
    blocks.push({
      type: "departments", id: "department-task-summary", title: "Department workload",
      source: input.departmentDefinitionsAvailable ? "approved_organisation_blueprint + jd_operational_tasks" : "jd_operational_tasks",
      source_label: input.departmentDefinitionsAvailable ? "Approved organisation blueprint" : "Departments inferred only from task assignments",
      sample_truncated: (input.tasksTotal ?? (input.tasks || []).length) > (input.tasks || []).length,
      items: [...departments.entries()].slice(0, 20).map(([name, counts]) => ({
        name, metric: String(counts.open) + " open",
        detail: [counts.purpose, counts.total + " total · " + counts.completed + " completed · " + counts.blocked + " blocked"].filter(Boolean).join(" · "),
        status: counts.blocked > 0 ? "blocked" : counts.open > 0 ? "running" : "completed",
      })),
    });
  }
  if (input.evidenceAvailable) {
    const steps = (input.steps || []).slice(0, 30);
    const audit = (input.audit || []).slice(0, 20);
    blocks.push({
      type: "timeline", id: "persisted-execution", title: "Persisted execution activity",
      events: steps.map((step) => ({
        title: ({get_workspace_overview:"Reviewed organisation overview",get_organisation_departments:"Reviewed departments",get_business_memory:"Checked saved business decisions",remember_business_fact:"Saved a business decision",get_billing_snapshot:"Checked billing records",get_business_expense_anomalies:"Reviewed recorded business costs",get_recent_activity_logs:"Checked recent workspace activity",create_operational_setup_tasks:"Saved launch-readiness tasks",preview_hiring_vacancy:"Prepared a vacancy preview",create_business_document_draft:"Saved a private document draft"} as Record<string,string>)[step.tool_key] || "Completed a workspace check", status: step.status === "completed" ? "completed" :
          step.status === "running" ? "running" : step.status === "failed" ? "failed" : "pending",
        detail: step.error_message ? "Needs administrator review" : (step.completed_at ? "Completed and recorded" : step.started_at ? "In progress" : "Recorded"),
      })),
    });
    blocks.push({
      type: "evidence", id: "persisted-evidence", title: "Execution evidence",
      status: steps.some((step) => step.status === "failed") ? "blocked" : (steps.length || audit.length) ? "completed" : "pending",
      summary: "Derived from persisted JD execution steps and audit events. This is execution evidence, not proof of an external business outcome.",
      items: [
        ...steps.map((step) => ({ label: step.tool_key + " · " + step.status + (step.output_json?.evidence && Object.keys(step.output_json.evidence).length ? " · " + Object.entries(step.output_json.evidence).slice(0, 3).map(([key, value]) => key + ": " + String(value)).join(", ") : ""), reference: step.id })),
        ...audit.map((event) => ({ label: event.event_type, reference: event.id })),
      ].slice(0, 30),
      details: audit.slice(0, 10).map((event) => event.created_at ? new Date(event.created_at).toLocaleString() : "Recorded workspace activity"),
    });
  }
  return { version: 1, source: "persisted_workspace_records", blocks };
}
