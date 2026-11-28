import React, { useEffect } from "react";
import { Bell, ChevronRight, HelpCircle, Link2, LogOut, Moon, Settings, ShieldCheck, Sun, User, Wallet, X } from "lucide-react";

export function AccountProfileSheet({
  open,
  user,
  role,
  dark,
  pendingApprovals = 0,
  canOpenSettings = false,
  canOpenBilling = false,
  canOpenConnectors = true,
  onToggleDark,
  onOpenApprovals,
  onOpenConnectors,
  onOpenBilling,
  onOpenSettings,
  onOpenProfile,
  onOpenTour,
  onLogout,
  onClose,
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const initials = (user?.name || "?").trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="jd-sheet-backdrop" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <section className="jd-sheet" role="dialog" aria-modal="true" aria-labelledby="jd-acct-sheet-title">
        <div className="jd-sheet-head">
          <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
            <span className="jd-avatar-pill" style={{ width: 40, height: 40, fontSize: 13 }}>{initials}</span>
            <div style={{ minWidth: 0 }}>
              <h2 className="jd-sheet-title" id="jd-acct-sheet-title" style={{ fontSize: 17 }}>{user?.name || "Account"}</h2>
              <div style={{ fontSize: 11, color: "var(--jd-muted)", overflow: "hidden", textOverflow: "ellipsis" }}>
                {user?.email || ""} · <span style={{ textTransform: "capitalize" }}>{role === "admin" ? "Administrator" : role}</span>
              </div>
            </div>
          </div>
          <button type="button" className="jd-icon-circle" aria-label="Close account menu" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="jd-sheet-list">
          <button type="button" className="jd-sheet-row" onClick={() => { onClose?.(); onOpenApprovals?.(); }}>
            <ShieldCheck size={17} />
            <span>Review Centre &amp; Inbox</span>
            {pendingApprovals > 0 && <span className="jd-sheet-row-badge">{pendingApprovals}</span>}
            {pendingApprovals === 0 && <ChevronRight size={15} style={{ marginLeft: "auto", color: "var(--jd-muted)" }} />}
          </button>

          {canOpenConnectors && (
            <button type="button" className="jd-sheet-row" onClick={() => { onClose?.(); onOpenConnectors?.(); }}>
              <Link2 size={17} />
              <span>Connectors</span>
              <ChevronRight size={15} style={{ marginLeft: "auto", color: "var(--jd-muted)" }} />
            </button>
          )}

          {canOpenBilling && (
            <button type="button" className="jd-sheet-row" onClick={() => { onClose?.(); onOpenBilling?.(); }}>
              <Wallet size={17} />
              <span>Billing &amp; Plan</span>
              <ChevronRight size={15} style={{ marginLeft: "auto", color: "var(--jd-muted)" }} />
            </button>
          )}

          <button type="button" className="jd-sheet-row" onClick={() => { onClose?.(); onOpenProfile?.(); }}>
            <User size={17} />
            <span>My Profile</span>
            <ChevronRight size={15} style={{ marginLeft: "auto", color: "var(--jd-muted)" }} />
          </button>

          {canOpenSettings && (
            <button type="button" className="jd-sheet-row" onClick={() => { onClose?.(); onOpenSettings?.(); }}>
              <Settings size={17} />
              <span>Organisation Settings</span>
              <ChevronRight size={15} style={{ marginLeft: "auto", color: "var(--jd-muted)" }} />
            </button>
          )}

          <button type="button" className="jd-sheet-row" onClick={onToggleDark}>
            {dark ? <Sun size={17} /> : <Moon size={17} />}
            <span>Appearance: {dark ? "Dark (True Black)" : "Light (Warm Paper)"}</span>
          </button>

          <button type="button" className="jd-sheet-row" onClick={() => { onClose?.(); onOpenTour?.(); }}>
            <HelpCircle size={17} />
            <span>Product Tour &amp; Help</span>
            <ChevronRight size={15} style={{ marginLeft: "auto", color: "var(--jd-muted)" }} />
          </button>

          <div className="jd-sheet-divider" />

          <button type="button" className="jd-sheet-row" onClick={() => { onClose?.(); onLogout?.(); }}>
            <LogOut size={17} />
            <span>Sign out</span>
          </button>
        </div>
      </section>
    </div>
  );
}
