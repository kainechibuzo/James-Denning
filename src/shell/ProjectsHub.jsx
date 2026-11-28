import React, { useEffect, useState } from "react";
import { Archive, Briefcase, Code2, Eye, FolderKanban, MoreHorizontal, Pin, Plus, RefreshCw, Search, Sparkles, X } from "lucide-react";
import { PROJECT_FILTERS, filterProjects } from "./shell-state.mjs";

function formatProjectDate(iso) {
  if (!iso) return "Updated recently";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Updated recently";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function NewProjectModal({ open, busy, error, initialPrompt = "", onClose, onCreate }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState(initialPrompt);
  const [kind, setKind] = useState("initiative");
  const [initialMode, setInitialMode] = useState("plan");

  useEffect(() => {
    if (!open) return;
    setDescription(initialPrompt || "");
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, initialPrompt, onClose]);

  if (!open) return null;

  const submit = (e) => {
    e.preventDefault();
    if (name.trim().length < 2 || busy) return;
    onCreate?.({ name: name.trim(), description: description.trim(), kind, initialMode });
  };

  return (
    <div className="jd-sheet-backdrop" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <form className="jd-sheet" role="dialog" aria-modal="true" aria-labelledby="jd-new-project-title" onSubmit={submit}>
        <div className="jd-sheet-head">
          <div>
            <p className="jd-hub-eyebrow" style={{ marginBottom: 2 }}>NEW PROJECT</p>
            <h2 className="jd-sheet-title" id="jd-new-project-title">Start a workspace project</h2>
          </div>
          <button type="button" className="jd-icon-circle" aria-label="Close new project dialog" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="jd-sheet-action-grid" role="radiogroup" aria-label="Project type">
          <button type="button" className={`jd-sheet-action-btn${kind === "initiative" ? " is-primary" : ""}`}
            aria-pressed={kind === "initiative"} onClick={() => setKind("initiative")}>
            <Briefcase size={15} /> Business Initiative
          </button>
          <button type="button" className={`jd-sheet-action-btn${kind === "software" ? " is-primary" : ""}`}
            aria-pressed={kind === "software"} onClick={() => setKind("software")}>
            <Code2 size={15} /> Software Build
          </button>
        </div>

        <p style={{ fontSize: 12, color: "var(--jd-muted)", margin: 0, lineHeight: 1.5 }}>
          {kind === "software"
            ? "Build an app, landing site, or internal tool with live Preview, Software Studio, and approval-gated shipping."
            : "Organise a launch, hiring drive, or department initiative with live operational tasks, blueprints, and JD execution."}
        </p>

        <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 600 }}>
          Project name
          <input required minLength={2} maxLength={140} value={name} onChange={(e) => setName(e.target.value)}
            placeholder={kind === "software" ? "e.g. UniConnect Campus Portal" : "e.g. Q4 Product Launch"}
            style={{ padding: "11px 12px", borderRadius: 11, border: "1px solid var(--jd-border)", fontSize: 13 }} />
        </label>

        <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 600 }}>
          Brief or goal
          <textarea rows={3} maxLength={4000} value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what you want to achieve, who it serves, and what success looks like..."
            style={{ padding: "11px 12px", borderRadius: 11, border: "1px solid var(--jd-border)", fontSize: 13, resize: "vertical" }} />
        </label>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: "var(--jd-muted)" }}>Starting mode</span>
          <div className="jd-exec-modes">
            {[{ id: "ask", label: "Ask" }, { id: "plan", label: "Plan" }, { id: "execute", label: "Execute" }].map((m) => (
              <button key={m.id} type="button" className={initialMode === m.id ? "is-active" : ""} onClick={() => setInitialMode(m.id)}>
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {error && <p role="alert" style={{ fontSize: 12, color: "var(--jd-red, #8d2f26)", margin: 0 }}>{error}</p>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" className="jd-sheet-action-btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="jd-hub-primary-btn" disabled={busy || name.trim().length < 2}>
            <Sparkles size={14} /> {busy ? "Creating..." : "Create project"}
          </button>
        </div>
      </form>
    </div>
  );
}

export function ProjectsHub({
  projects = [],
  loading = false,
  error = "",
  canCreate = true,
  onRefresh,
  onOpenProject,
  onNewProject,
  onTogglePin,
  onArchiveProject,
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [menuId, setMenuId] = useState(null);

  const visible = filterProjects(projects, { query, filter });

  return (
    <section className="jd-hub" aria-labelledby="jd-projects-title">
      <div className="jd-hub-inner">
        <header className="jd-hub-header">
          <div>
            <p className="jd-hub-eyebrow">WORKSPACE PROJECTS</p>
            <h1 className="jd-hub-title" id="jd-projects-title">Projects</h1>
          </div>
          <div className="jd-hub-actions">
            <button type="button" className="jd-icon-circle" aria-label="Refresh projects" onClick={onRefresh} disabled={loading}>
              <RefreshCw size={17} />
            </button>
            {canCreate && (
              <button type="button" className="jd-hub-primary-btn" onClick={onNewProject}>
                <Plus size={15} /> New project
              </button>
            )}
          </div>
        </header>

        <div className="jd-hub-toolbar">
          <label className="jd-hub-search">
            <Search size={16} />
            <input type="search" aria-label="Search projects" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Search projects and initiatives..." />
          </label>
          <div className="jd-filter-chips" role="group" aria-label="Filter projects">
            {PROJECT_FILTERS.map((f) => (
              <button key={f.id} type="button" className={`jd-chip${filter === f.id ? " is-active" : ""}`}
                aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {error && <p role="alert" style={{ fontSize: 12, color: "var(--jd-red, #8d2f26)", margin: 0 }}>{error}</p>}

        {loading && !projects.length ? (
          <div className="jd-hub-empty"><p>Loading workspace projects...</p></div>
        ) : !visible.length ? (
          <div className="jd-hub-empty">
            <FolderKanban size={28} />
            <h2>{query || filter !== "all" ? "No matching projects" : "No projects yet"}</h2>
            <p>
              {query || filter !== "all"
                ? "Try clearing your search or switching project filters."
                : "Create your first Business Initiative or Software Build to keep chat, live previews, tasks, and approvals together."}
            </p>
            {canCreate && (
              <button type="button" className="jd-hub-primary-btn" onClick={onNewProject}>
                <Plus size={15} /> Create project
              </button>
            )}
          </div>
        ) : (
          <div className="jd-project-list">
            {visible.map((project) => {
              const isSoftware = project.kind === "software";
              const ownerName = project.metadata_json?.owner_name || "Workspace";
              const menuOpen = menuId === project.id;
              return (
                <article key={project.id} className="jd-project-card" style={{ position: "relative" }}>
                  <div className="jd-project-thumb" aria-hidden="true">
                    {isSoftware ? <Code2 size={20} /> : <Briefcase size={20} />}
                  </div>
                  <button type="button" className="jd-project-main" onClick={() => onOpenProject?.(project, "chat")}>
                    <div className="jd-project-title-row">
                      <span className="jd-project-name">{project.name}</span>
                      {project.pinned && <Pin size={13} aria-label="Pinned" />}
                      <span className="jd-project-tag">{isSoftware ? "Software" : "Initiative"}</span>
                      {project.status === "published" && <span className="jd-project-tag">Published</span>}
                    </div>
                    <div className="jd-project-meta">
                      {ownerName} · {formatProjectDate(project.updated_at)}
                      {project.description ? ` · ${project.description}` : ""}
                    </div>
                  </button>
                  <button type="button" className="jd-icon-circle" title="Open live preview" aria-label={`Preview ${project.name}`}
                    onClick={() => onOpenProject?.(project, "preview")}>
                    <Eye size={16} />
                  </button>
                  <button type="button" className="jd-icon-circle" aria-label={`More options for ${project.name}`}
                    aria-expanded={menuOpen} onClick={() => setMenuId(menuOpen ? null : project.id)}>
                    <MoreHorizontal size={17} />
                  </button>

                  {menuOpen && (
                    <div style={{
                      position: "absolute", right: 12, top: 54, zIndex: 25, minWidth: 185,
                      borderRadius: 13, border: "1px solid var(--jd-border)", background: "var(--jd-card)",
                      boxShadow: "0 14px 36px rgba(0,0,0,.14)", padding: 6, display: "grid", gap: 2,
                    }}>
                      <button type="button" className="jd-sheet-row" onClick={() => { setMenuId(null); onOpenProject?.(project, "chat"); }}>
                        Open chat
                      </button>
                      <button type="button" className="jd-sheet-row" onClick={() => { setMenuId(null); onOpenProject?.(project, "preview"); }}>
                        <Eye size={14} /> Open preview
                      </button>
                      <button type="button" className="jd-sheet-row" onClick={() => { setMenuId(null); onTogglePin?.(project); }}>
                        <Pin size={14} /> {project.pinned ? "Unpin project" : "Pin project"}
                      </button>
                      <button type="button" className="jd-sheet-row" onClick={() => { setMenuId(null); onArchiveProject?.(project); }}>
                        <Archive size={14} /> {project.status === "archived" ? "Restore project" : "Archive project"}
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
