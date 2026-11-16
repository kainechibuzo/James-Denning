// UI contract only. The endpoint and RPC remain the authority for roles,
// assignment, tenant scope and legal transitions. Never retry a mutation here:
// a lost response can mean the write committed and needs reconciliation first.
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const statuses = new Set(["queued", "in_progress", "blocked", "completed", "cancelled"]);

export function taskTransitionAction(role) {
  if (role === "staff") return "operations.task.transition_own";
  if (["owner", "admin", "manager"].includes(role)) return "operations.task.transition";
  return null;
}

function requestError(status) {
  const messages = {
    400: "This task update is invalid. Refresh the task before trying again.",
    401: "Your session has expired. Sign in again, then refresh the task.",
    403: "You do not have permission to update this task. Staff can update only their assigned tasks.",
    404: "This task is unavailable in your current workspace. Refresh the workspace.",
    409: "This task changed or the transition is no longer allowed. Refresh it before trying again.",
    429: "Too many requests. Wait, then refresh the task before trying again.",
    503: "The task service is unavailable. Refresh the task when service returns before retrying.",
  };
  // Do not expose raw response bodies, JWTs, database details or thrown transport errors.
  const error = new Error(messages[status] || "JD could not confirm this task update. It may have been saved; refresh the task before retrying.");
  error.status = status || null;
  return error;
}

export async function transitionOperationalTask(client, { taskId, status, role }) {
  const action = taskTransitionAction(role);
  if (!action) throw requestError(403);
  if (!uuid.test(taskId || "") || !statuses.has(status)) throw requestError(400);
  if (role === "staff" && !["in_progress", "blocked", "completed"].includes(status)) throw requestError(403);

  let result;
  try {
    result = await client.functions.invoke("jd-automation", { body: { action, taskId, status } });
  } catch {
    throw requestError(null);
  }
  if (result?.error) throw requestError(result.error?.context?.status || result.error?.status);
  const data = result?.data;
  if (data?.error) throw requestError(null);
  // A 2xx or a task-shaped object is not sufficient. Require the exact saved
  // transition plus the atomic audit acknowledgement; never fall back to the requested state.
  if (data?.task?.id !== taskId || data?.task?.status !== status ||
      data?.auditRecorded !== true || !uuid.test(data?.auditId || "")) {
    throw new Error("JD did not return confirmed task and audit evidence. Refresh the task before retrying; no success has been confirmed.");
  }
  return data;
}
