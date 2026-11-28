import React, { useEffect } from "react";
import { Building2, Check, ChevronRight, Plus, RefreshCw, Sparkles, X } from "lucide-react";

export function WorkspaceSwitcherSheet({
  open,
  organisation,
  role,
  usageSummary,
  canCreateOrg,
  onClose,
  onSwitchOrganisation,
  onCreateOrganisation,
  onOpenBilling,
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const runsCount = Number(usageSummary?.runs || 0);
  const totalTokens = Number(usageSummary?.total_tokens || 0);
  const pct = Math.min(100, Math.max(8, runsCount ? Math.round((runsCount / Math.max(runsCount + 10, 50)) * 100) : 12));

  return (
    <div className="jd-sheet-backdrop" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <section className="jd-sheet" role="dialog" aria-modal="true" aria-labelledby="jd-ws-sheet-title">
        <div className="jd-sheet-head">
          <h2 className="jd-sheet-title" id="jd-ws-sheet-title">Workspaces</h2>
          <button type="button" className="jd-icon-circle" aria-label="Close workspace switcher" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="jd-sheet-card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, fontWeight: 650 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Sparkles size={14} /> Agent Activity &amp; Budget
            </span>
            <span style={{ fontSize: 11, color: "var(--jd-muted)" }}>
              {runsCount} run{runsCount === 1 ? "" : "s"} · {totalTokens.toLocaleString()} tokens
            </span>
          </div>
          <div className="jd-sheet-meter" aria-hidden="true">
            <span style={{ width: `${pct}%` }} />
          </div>
          {onOpenBilling && (
            <button type="button" onClick={() => { onClose?.(); onOpenBilling(); }}
              style={{ border: 0, background: "transparent", padding: 0, textAlign: "left", fontSize: 11, fontWeight: 650, color: "var(--jd-text)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
              Manage plan &amp; billing <ChevronRight size={13} />
            </button>
          )}
        </div>

        <div>
          <div className="jd-sheet-group-label">Current organisation</div>
          <div className="jd-sheet-list">
            <div className="jd-sheet-row" style={{ background: "var(--jd-soft)", borderColor: "var(--jd-border)" }}>
              <span className="jd-org-pill-badge">{(organisation || "J").trim().charAt(0).toUpperCase()}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ display: "block", fontSize: 13 }}>{organisation || "Your organisation"}</strong>
                <small style={{ display: "block", fontSize: 11, color: "var(--jd-muted)", textTransform: "capitalize" }}>{role || "Member"}</small>
              </span>
              <Check size={16} aria-hidden="true" />
            </div>
          </div>
        </div>

        <div className="jd-sheet-list">
          <button type="button" className="jd-sheet-row" onClick={() => { onClose?.(); onSwitchOrganisation?.(); }}>
            <RefreshCw size={17} />
            <span>Switch organisation</span>
            <ChevronRight size={15} style={{ marginLeft: "auto", color: "var(--jd-muted)" }} />
          </button>
          {canCreateOrg && (
            <button type="button" className="jd-sheet-row" onClick={() => { onClose?.(); onCreateOrganisation?.(); }}>
              <Plus size={17} />
              <span>Register new organisation</span>
              <ChevronRight size={15} style={{ marginLeft: "auto", color: "var(--jd-muted)" }} />
            </button>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 11px 0", fontSize: 11, color: "var(--jd-muted)" }}>
            <Building2 size={13} />
            <span>Each organisation keeps isolated data, permissions, and runs.</span>
          </div>
        </div>
      </section>
    </div>
  );
}
