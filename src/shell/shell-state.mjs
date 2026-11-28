// Pure state, filtering and RBAC mapping helpers for the unified JD shell.
// Navigation items are presentation only; routes and backend enforce access independently.

export const EXECUTION_MODES = Object.freeze([
  Object.freeze({
    id: "ask",
    label: "Ask",
    badge: "Free · Read-only",
    hint: "Explore ideas & inspect records without making changes",
  }),
  Object.freeze({
    id: "plan",
    label: "Plan",
    badge: "Blueprint",
    hint: "Design task lists, structures & specialist proposals for review",
  }),
  Object.freeze({
    id: "execute",
    label: "Execute",
    badge: "Bounded",
    hint: "Run supported steps through JD approval boundaries",
  }),
]);

export const PROJECT_FILTERS = Object.freeze([
  Object.freeze({ id: "all", label: "All" }),
  Object.freeze({ id: "pinned", label: "Pinned" }),
  Object.freeze({ id: "initiative", label: "Initiatives" }),
  Object.freeze({ id: "software", label: "Software" }),
  Object.freeze({ id: "archived", label: "Archived" }),
]);

export const CHAT_FILTERS = Object.freeze([
  Object.freeze({ id: "all", label: "All" }),
  Object.freeze({ id: "active", label: "Active" }),
  Object.freeze({ id: "scheduled", label: "Scheduled" }),
  Object.freeze({ id: "archived", label: "Archived" }),
]);

export function filterProjects(projects = [], { query = "", filter = "all" } = {}) {
  const q = String(query || "").trim().toLowerCase();
  return (Array.isArray(projects) ? projects : []).filter((project) => {
    const status = String(project?.status || "active");
    if (filter === "archived") {
      if (status !== "archived") return false;
    } else if (status === "archived") {
      return false;
    }
    if (filter === "pinned" && !project?.pinned) return false;
    if (filter === "initiative" && project?.kind !== "initiative") return false;
    if (filter === "software" && project?.kind !== "software") return false;
    if (!q) return true;
    const hay = `${project?.name || ""} ${project?.description || ""} ${project?.kind || ""}`.toLowerCase();
    return hay.includes(q);
  });
}

export function filterConversations(conversations = [], { query = "", filter = "all" } = {}) {
  const q = String(query || "").trim().toLowerCase();
  return (Array.isArray(conversations) ? conversations : []).filter((chat) => {
    const status = String(chat?.status || "active");
    if (filter === "archived" && status !== "archived") return false;
    if (filter === "active" && status === "archived") return false;
    if (!q) return true;
    const hay = `${chat?.title || "New conversation"}`.toLowerCase();
    return hay.includes(q);
  });
}

export function buildProjectInspectorGroups({ role, canAccess = () => false, canOpenOperations = () => false }) {
  const hasChat = role !== "owner" || canAccess("jd-chat");
  const isAdmin = role === "admin";
  const isOwnerOrAdmin = role === "owner" || role === "admin";

  const groups = [
    {
      id: "workspace",
      label: "Workspace",
      items: [
        { id: "preview", label: "Live Preview & Brief", icon: "eye", kind: "project-pane", visible: true },
        { id: "jd-operations", label: "Tasks & Operations", icon: "activity", kind: "page", visible: canOpenOperations(role) && canAccess("jd-operations") },
        { id: "departments", label: "Departments", icon: "building", kind: "assistant", visible: hasChat },
        { id: "admin-dashboard", label: "Analytics", icon: "layout-dashboard", kind: "page", visible: isAdmin && canAccess("admin-dashboard") },
      ],
    },
    {
      id: "infrastructure",
      label: "Data & Infrastructure",
      items: [
        { id: "admin-tools", label: "Database & Tools", icon: "database", kind: "page", visible: isAdmin },
        { id: "mail-logs", label: "Emails & Logs", icon: "mail-logs", kind: "page", visible: isAdmin && canAccess("mail-logs") },
        { id: "connectors", label: "Connectors", icon: "link", kind: "assistant", visible: hasChat },
      ],
    },
    {
      id: "people-ai",
      label: "People & AI Workforce",
      items: [
        { id: "workforce", label: "AI Workforce", icon: "users", kind: "assistant", visible: isOwnerOrAdmin && hasChat },
        { id: "runs", label: "Automation Runs", icon: "play", kind: "assistant", visible: hasChat },
        { id: "jd-skills", label: "Skills Catalog", icon: "package", kind: "page", visible: isAdmin },
        { id: "hiring", label: "Users & Recruitment", icon: "user-check", kind: "page", visible: isAdmin && canAccess("hiring") },
        { id: "permissions", label: "Permissions", icon: "shield", kind: "page", visible: isAdmin && canAccess("permissions") },
      ],
    },
    {
      id: "governance",
      label: "Governance & Account",
      items: [
        { id: "review", label: "Review Centre", icon: "check", kind: "assistant", visible: hasChat },
        { id: "billing", label: "Payments & Billing", icon: "wallet", kind: "page", visible: isOwnerOrAdmin && canAccess("billing") },
        { id: "usage", label: "AI Usage & Budget", icon: "trending-up", kind: "assistant", visible: hasChat },
        { id: "audit-log", label: "Security & Audit", icon: "lock", kind: "page", visible: isAdmin && canAccess("audit-log") },
        { id: "settings", label: "Settings", icon: "settings", kind: "page", visible: isOwnerOrAdmin && canAccess("settings") },
        { id: "history", label: "Chat History", icon: "history", kind: "assistant", visible: hasChat },
      ],
    },
  ];

  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.visible),
    }))
    .filter((group) => group.items.length > 0);
}
