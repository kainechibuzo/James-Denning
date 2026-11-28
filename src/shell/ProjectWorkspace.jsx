import React, { Suspense, lazy, useEffect, useState } from "react";
import {
  Activity, Briefcase, Building2, Check, CheckCircle2, ChevronRight, Code2,
  Columns2, Database, Eye, Globe, History, LayoutDashboard, Link2, Lock, Mail, MessageSquare,
  Monitor, Package, Play, RefreshCw, Settings, Share2, Shield, Smartphone, Sparkles,
  TrendingUp, UserCheck, Users, Wallet, X,
} from "lucide-react";
import { buildProjectInspectorGroups } from "./shell-state.mjs";
import { canOpenOperations } from "../config/workspace-navigation.mjs";
import { supabase } from "../supabaseClient.js";

const SaaSAgentStudio = lazy(() =>
  import("../software-factory/SaaSAgentStudio.jsx").then((mod) => ({ default: mod.SaaSAgentStudio }))
);

const INSPECTOR_ICONS = {
  eye: Eye,
  activity: Activity,
  building: Building2,
  "layout-dashboard": LayoutDashboard,
  database: Database,
  "mail-logs": Mail,
  link: Link2,
  users: Users,
  play: Play,
  package: Package,
  "user-check": UserCheck,
  shield: Shield,
  check: CheckCircle2,
  wallet: Wallet,
  "trending-up": TrendingUp,
  lock: Lock,
  settings: Settings,
  history: History,
};

export function ProjectInspectorSheet({
  open,
  project,
  role,
  canAccess,
  usageSummary,
  busy = false,
  onClose,
  onShare,
  onPublish,
  onSelectDestination,
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !project) return null;

  const groups = buildProjectInspectorGroups({ role, canAccess, canOpenOperations });
  const runsCount = Number(usageSummary?.runs || 0);
  const pct = Math.min(100, Math.max(10, runsCount ? Math.round((runsCount / Math.max(runsCount + 12, 50)) * 100) : 14));
  const isPublished = project.status === "published";

  return (
    <div className="jd-sheet-backdrop" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <section className="jd-sheet" role="dialog" aria-modal="true" aria-labelledby="jd-inspector-title">
        <div className="jd-sheet-head">
          <div style={{ minWidth: 0 }}>
            <p className="jd-hub-eyebrow" style={{ marginBottom: 2 }}>
              {project.kind === "software" ? "SOFTWARE PROJECT" : "BUSINESS INITIATIVE"}
            </p>
            <h2 className="jd-sheet-title" id="jd-inspector-title" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
              {project.name}
            </h2>
          </div>
          <button type="button" className="jd-icon-circle" aria-label="Close project inspector" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="jd-sheet-card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, fontWeight: 650 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Sparkles size={14} /> Agent Usage
            </span>
            <span style={{ fontSize: 11, color: "var(--jd-muted)" }}>
              {runsCount} run{runsCount === 1 ? "" : "s"} recorded
            </span>
          </div>
          <div className="jd-sheet-meter" aria-hidden="true">
            <span style={{ width: `${pct}%` }} />
          </div>
          <div className="jd-sheet-action-grid">
            <button type="button" className="jd-sheet-action-btn" disabled={busy} onClick={() => { onClose?.(); onShare?.(project); }}>
              <Share2 size={14} /> Share
            </button>
            <button type="button" className={`jd-sheet-action-btn${isPublished ? "" : " is-primary"}`} disabled={busy}
              onClick={() => { onClose?.(); onPublish?.(project); }}>
              <Globe size={14} /> {isPublished ? "Unpublish" : "Publish"}
            </button>
          </div>
        </div>

        {groups.map((group) => (
          <div key={group.id}>
            <div className="jd-sheet-group-label">{group.label}</div>
            <div className="jd-sheet-list">
              {group.items.map((item) => {
                const Icon = INSPECTOR_ICONS[item.icon] || ChevronRight;
                return (
                  <button key={item.id} type="button" className="jd-sheet-row"
                    onClick={() => { onClose?.(); onSelectDestination?.(item); }}>
                    <Icon size={17} />
                    <span>{item.label}</span>
                    <ChevronRight size={15} style={{ marginLeft: "auto", color: "var(--jd-muted)" }} />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

export function ProjectPreviewPane({
  project,
  detail,
  loading = false,
  role,
  organizationName,
  onRefresh,
  onAskInChat,
  onShare,
  onPublish,
  onOpenOperations,
}) {
  const [viewport, setViewport] = useState("desktop");
  const [softwareTab, setSoftwareTab] = useState("preview");

  if (!project) return null;

  const isSoftware = project.kind === "software";
  const tasks = detail?.tasks || [];
  const conversations = detail?.conversations || [];
  const memory = detail?.memory || [];
  const completedTasks = tasks.filter((t) => t.status === "completed").length;
  const pct = tasks.length ? Math.round((completedTasks / tasks.length) * 100) : 0;
  const previewConfig = project.preview_config || {};
  const isPublished = project.status === "published";

  const studioClient = {
    async invoke(fn, args) {
      return supabase.functions.invoke(fn, args);
    },
  };

  return (
    <div className="jd-preview-canvas">
      <div className="jd-preview-shell">
        <div className="jd-preview-toolbar">
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <span className="jd-project-tag" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              {isSoftware ? <Code2 size={12} /> : <Briefcase size={12} />}
              {isSoftware ? "Software Build" : "Business Initiative"}
            </span>
            <span className="jd-project-tag">{isPublished ? "Published" : "Draft"}</span>
            {isSoftware && previewConfig.route && (
              <span style={{ fontSize: 11, color: "var(--jd-muted)" }}>{previewConfig.route}</span>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {isSoftware && (
              <>
                <div className="jd-pane-switch">
                  <button type="button" className={softwareTab === "preview" ? "is-active" : ""} onClick={() => setSoftwareTab("preview")}>
                    Preview
                  </button>
                  <button type="button" className={softwareTab === "studio" ? "is-active" : ""} onClick={() => setSoftwareTab("studio")}>
                    Agent Studio
                  </button>
                </div>
                {softwareTab === "preview" && (
                  <div className="jd-pane-switch">
                    <button type="button" aria-label="Desktop preview" className={viewport === "desktop" ? "is-active" : ""} onClick={() => setViewport("desktop")}>
                      <Monitor size={13} />
                    </button>
                    <button type="button" aria-label="Mobile preview" className={viewport === "mobile" ? "is-active" : ""} onClick={() => setViewport("mobile")}>
                      <Smartphone size={13} />
                    </button>
                  </div>
                )}
              </>
            )}
            <button type="button" className="jd-icon-circle" aria-label="Refresh project preview" onClick={onRefresh} disabled={loading}>
              <RefreshCw size={15} />
            </button>
            <button type="button" className="jd-chip" onClick={() => onShare?.(project)}>
              <Share2 size={12} style={{ verticalAlign: "middle", marginRight: 4 }} /> Share
            </button>
          </div>
        </div>

        {isSoftware && softwareTab === "studio" ? (
          <div className="jd-preview-surface">
            <Suspense fallback={<div className="jd-muted" style={{ fontSize: 12 }}>Loading Agent Studio...</div>}>
              <SaaSAgentStudio client={studioClient} role={role} scopeKey={project.id} />
            </Suspense>
          </div>
        ) : (
          <div className={`jd-preview-surface${isSoftware && viewport === "mobile" ? " is-mobile-frame" : ""}`}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <p className="jd-hub-eyebrow" style={{ marginBottom: 4 }}>
                  {organizationName} · {isSoftware ? "APPLICATION PREVIEW" : "INITIATIVE BLUEPRINT"}
                </p>
                <h2 style={{ fontFamily: "'JD Caslon Text', Georgia, serif", fontSize: 26, fontWeight: 500, margin: "0 0 6px" }}>
                  {previewConfig.headline || project.name}
                </h2>
                <p style={{ fontSize: 13, color: "var(--jd-muted)", lineHeight: 1.65, margin: 0, maxWidth: 640 }}>
                  {previewConfig.summary || project.description || "Use Chat to define deliverables, tasks, or application screens for this project."}
                </p>
              </div>
              <button type="button" className="jd-publish-pill" onClick={() => onPublish?.(project)}>
                <Check size={13} /> {isPublished ? "Published" : "Publish project"}
              </button>
            </div>

            {isSoftware ? (
              previewConfig.html_preview ? (
                <iframe
                  title={`${project.name} preview`}
                  sandbox=""
                  srcDoc={String(previewConfig.html_preview)}
                  className="jd-preview-iframe"
                />
              ) : (
                <div className="jd-preview-blueprint">
                  <div className="jd-preview-browser-bar">
                    <span className="jd-preview-dots" aria-hidden="true"><i/><i/><i/></span>
                    <span className="jd-preview-route">{previewConfig.route || "/"}</span>
                    <span className="jd-project-tag">{isPublished ? "Live" : "Sandbox"}</span>
                  </div>
                  <div className="jd-preview-blueprint-body">
                    <div className="jd-sheet-card" style={{ gap: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>Interactive App Canvas</div>
                        <span style={{ fontSize: 11, color: "var(--jd-muted)" }}>
                          {conversations.length} thread{conversations.length === 1 ? "" : "s"} · {tasks.length} task{tasks.length === 1 ? "" : "s"}
                        </span>
                      </div>
                      <p style={{ fontSize: 12, color: "var(--jd-muted)", margin: 0, lineHeight: 1.6 }}>
                        Use <strong>Chat</strong> in <strong>Plan</strong> or <strong>Execute</strong> mode to scaffold screens, tables, and workflows, or configure your specialist team in <strong>Agent Studio</strong>.
                      </p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        <button type="button" className="jd-chip" onClick={() => onAskInChat?.(`Design the architecture, data tables, and UI screens for ${project.name}.`, "plan")}>
                          Plan app architecture
                        </button>
                        <button type="button" className="jd-chip" onClick={() => onAskInChat?.(`Draft the core user flows and authentication checks for ${project.name}.`, "plan")}>
                          Review auth &amp; backend
                        </button>
                        <button type="button" className="jd-chip" onClick={() => setSoftwareTab("studio")}>
                          Open Agent Studio
                        </button>
                      </div>
                    </div>
                    {tasks.length > 0 && (
                      <div className="jd-sheet-card" style={{ gap: 6 }}>
                        <div style={{ fontSize: 12, fontWeight: 700 }}>Build Checklist ({completedTasks}/{tasks.length})</div>
                        {tasks.slice(0, 5).map((task) => (
                          <div key={task.id} className="jd-project-file-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                            <span style={{ fontSize: 12, fontWeight: 600 }}>{task.title}</span>
                            <span className="jd-project-tag" style={{ textTransform: "capitalize" }}>{String(task.status || "queued").replaceAll("_", " ")}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            ) : (
              <>
                <div className="jd-sheet-card">
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, fontWeight: 700 }}>
                    <span>Operational Tasks ({completedTasks}/{tasks.length} complete)</span>
                    {onOpenOperations && (
                      <button type="button" onClick={onOpenOperations}
                        style={{ border: 0, background: "transparent", color: "var(--jd-text)", fontSize: 11, fontWeight: 650, cursor: "pointer" }}>
                        Open Operations →
                      </button>
                    )}
                  </div>
                  <div className="jd-sheet-meter" aria-hidden="true">
                    <span style={{ width: `${pct}%` }} />
                  </div>
                  {!tasks.length ? (
                    <p style={{ fontSize: 12, color: "var(--jd-muted)", margin: 0 }}>
                      No operational tasks linked to this initiative yet. Ask JD in Chat to generate a launch checklist.
                    </p>
                  ) : (
                    <div style={{ display: "grid", gap: 6 }}>
                      {tasks.slice(0, 8).map((task) => (
                        <div key={task.id} className="jd-project-file-row" style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                        }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 650 }}>{task.title}</div>
                            {task.department && <div style={{ fontSize: 10, color: "var(--jd-muted)" }}>{task.department}</div>}
                          </div>
                          <span className="jd-project-tag" style={{ textTransform: "capitalize" }}>{String(task.status || "queued").replaceAll("_", " ")}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                  <div className="jd-sheet-card">
                    <div style={{ fontSize: 12, fontWeight: 700 }}>Project Threads</div>
                    <div style={{ fontSize: 22, fontFamily: "'JD Caslon Text', Georgia, serif" }}>{conversations.length}</div>
                    <p style={{ fontSize: 11, color: "var(--jd-muted)", margin: 0 }}>Conversations linked to this initiative</p>
                  </div>
                  <div className="jd-sheet-card">
                    <div style={{ fontSize: 12, fontWeight: 700 }}>Organisation Memory</div>
                    <div style={{ fontSize: 22, fontFamily: "'JD Caslon Text', Georgia, serif" }}>{memory.length}</div>
                    <p style={{ fontSize: 11, color: "var(--jd-muted)", margin: 0 }}>Confirmed business context items</p>
                  </div>
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <button type="button" className="jd-chip" onClick={() => onAskInChat?.(`Create an execution plan and task checklist for ${project.name}.`, "plan")}>
                    Draft plan in Chat
                  </button>
                  <button type="button" className="jd-chip" onClick={() => onAskInChat?.(`Summarise progress, risks, and next approvals for ${project.name}.`, "ask")}>
                    Check status &amp; risks
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function ProjectBottomBar({ activePane, project, canSplit = false, onChangePane, onPublish }) {
  const isPublished = project?.status === "published";
  return (
    <div className="jd-project-bottom-bar">
      <div className="jd-pane-switch" role="tablist" aria-label="Project workspace view">
        {canSplit && (
          <button type="button" role="tab" aria-selected={activePane === "split"}
            className={activePane === "split" ? "is-active" : ""} onClick={() => onChangePane?.("split")}>
            <Columns2 size={13} /> Split
          </button>
        )}
        <button type="button" role="tab" aria-selected={activePane === "chat"}
          className={activePane === "chat" ? "is-active" : ""} onClick={() => onChangePane?.("chat")}>
          <MessageSquare size={13} /> Chat
        </button>
        <button type="button" role="tab" aria-selected={activePane === "preview"}
          className={activePane === "preview" ? "is-active" : ""} onClick={() => onChangePane?.("preview")}>
          <Eye size={13} /> Preview
        </button>
      </div>
      <button type="button" className="jd-publish-pill" onClick={() => onPublish?.(project)}>
        <Globe size={13} /> {isPublished ? "Published" : "Publish"}
      </button>
    </div>
  );
}
