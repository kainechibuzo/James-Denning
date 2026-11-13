export type JdVisualTask = {
  id: string; title: string; description?: string | null; department?: string | null;
  priority?: string | null; status: string; due_at?: string | null; updated_at?: string | null;
};
export type JdVisualStep = {
  id: string; tool_key: string; status: string; error_message?: string | null;
  started_at?: string | null; completed_at?: string | null;
};
export type JdVisualAudit = { id: string; event_type: string; created_at: string; event_json?: Record<string, unknown> | null };

const taskStatus = (status: string) => status === "completed" ? "completed" :
  status === "in_progress" ? "running" : status === "blocked" ? "blocked" :
  status === "cancelled" ? "failed" : "pending";

/** Build assistant UI only from tenant-filtered persisted operational and audit records. */
export function buildJdVisualWorkspace(input: {
  tasks?: JdVisualTask[]; steps?: JdVisualStep[]; audit?: JdVisualAudit[];
  tasksAvailable?: boolean; evidenceAvailable?: boolean;
}) {
  const blocks: Record<string, unknown>[] = [];
  if (input.tasksAvailable) {
    const tasks = (input.tasks || []).slice(0, 30);
    blocks.push({
      type: "checklist", id: "operational-tasks", title: "Operational tasks",
      items: tasks.map((task) => ({
        id: task.id, title: task.title, description: task.description || "",
        status: taskStatus(task.status), priority: task.priority || "normal",
        department: task.department || "Unassigned", due_at: task.due_at || null,
      })),
    });
    const departments = new Map<string, { total: number; open: number; completed: number; blocked: number }>();
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
      source: "jd_operational_tasks", items: [...departments.entries()].slice(0, 20).map(([name, counts]) => ({
        name, metric: String(counts.open) + " open",
        detail: counts.total + " total · " + counts.completed + " completed · " + counts.blocked + " blocked",
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
        title: step.tool_key.replaceAll("_", " "), status: step.status === "completed" ? "completed" :
          step.status === "running" ? "running" : step.status === "failed" ? "failed" : "pending",
        detail: step.error_message || (step.completed_at ? "Recorded at " + step.completed_at : step.started_at ? "Started at " + step.started_at : "Persisted execution step"),
      })),
    });
    blocks.push({
      type: "evidence", id: "persisted-evidence", title: "Execution evidence",
      status: steps.some((step) => step.status === "failed") ? "blocked" : "completed",
      summary: "Derived from persisted JD execution steps and audit events. This is execution evidence, not proof of an external business outcome.",
      items: [
        ...steps.map((step) => ({ label: step.tool_key + " · " + step.status, reference: step.id })),
        ...audit.map((event) => ({ label: event.event_type, reference: event.id })),
      ].slice(0, 30),
      details: audit.slice(0, 10).map((event) => event.event_type + " · " + event.created_at),
    });
  }
  return { version: 1, source: "persisted_workspace_records", blocks };
}
