import React from "react";

/**
 * Shared page furniture for workspace routes.
 *
 * The reference puts a Caslon title with its tri-colour rule at the top of
 * every interior page, followed by a single quiet line of context. Pages keep
 * their own cards and tables below this; only the framing is shared.
 */
export function PageHeader({ title, eyebrow, description, actions, children }) {
  return <header className="jd-page-header">
    <div className="jd-page-header-main">
      {eyebrow && <div className="jd-eyebrow">{eyebrow}</div>}
      <h1 className="jd-page-title">{title}</h1>
      <span className="jd-rule" aria-hidden="true"><i/><i/><i/></span>
      {description && <p className="jd-page-lede">{description}</p>}
      {children}
    </div>
    {actions && <div className="jd-page-header-actions">{actions}</div>}
  </header>;
}

/** A paper card. Section headings inside use Caslon; labels use Inter. */
export function PaperCard({ title, description, actions, children, className = "", style }) {
  return <section className={`jd-paper-card ${className}`} style={style}>
    {(title || actions) && <div className="jd-paper-card-head">
      <div style={{minWidth:0}}>
        {title && <h2 className="jd-paper-card-title">{title}</h2>}
        {description && <p className="jd-paper-card-lede">{description}</p>}
      </div>
      {actions && <div className="jd-paper-card-actions">{actions}</div>}
    </div>}
    {children}
  </section>;
}

/** A labelled figure, set like a ledger entry rather than a dashboard tile. */
export function Figure({ label, value, note }) {
  return <div className="jd-figure">
    <div className="jd-figure-label">{label}</div>
    <div className="jd-figure-value">{value}</div>
    {note && <div className="jd-figure-note">{note}</div>}
  </div>;
}
