import React, { useState } from "react";
import { ArrowUpRight, Check, Info, Link2, ShieldCheck } from "lucide-react";
import { CONNECTOR_CATALOGUE, canManageConnectors } from "../connectors/catalogue.mjs";
import { ConnectorLogo } from "../connectors/ConnectorLogo.jsx";
import { oauthProviderId } from "../../supabase/functions/_shared/jd-connector-oauth-policy.mjs";
import { tokenConnector } from "../../supabase/functions/_shared/jd-connector-token-policy.mjs";

function connectorSetupLabel(entry) {
  if (!entry) return "Directory entry";
  if (tokenConnector(entry.id)) return "API key / token";
  if (entry.connection?.kind === "native" || oauthProviderId(entry.id)) return "Account sign-in";
  if (["exa", "firecrawl"].includes(entry.id)) return "Limited public access";
  return "Setup guide";
}

export function InlineConnectorCard({ block, role, disabled, onConnect, onDismiss }) {
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const entry = CONNECTOR_CATALOGUE.find((item) => item.id === block.connectorId);

  if (dismissed) {
    return (
      <div className="jd-inline-connector is-dismissed" role="status">
        <span>Skipped {entry?.name || block.connectorId} connection for now. JD will continue without external access.</span>
        <button type="button" className="jd-inline-connector-undo" onClick={() => setDismissed(false)}>
          Show again
        </button>
      </div>
    );
  }

  const allowed = canManageConnectors(role);
  const setupLabel = connectorSetupLabel(entry);
  const name = entry?.name || block.connectorId;
  const description = block.reason || entry?.description || "Connect this service in JD Connect so authorised read tools can be discovered.";
  const capabilities = Array.isArray(block.capabilities) && block.capabilities.length
    ? block.capabilities
    : ["Inspect authorised records only after connection", "Write actions still require explicit human approval"];

  return (
    <section className="jd-inline-connector" aria-label={`Connect ${name}`}>
      <div className="jd-inline-connector-top">
        <div className="jd-inline-connector-brand">
          {entry ? <ConnectorLogo id={entry.id} name={entry.name} /> : <span className="jd-inline-connector-fallback"><Link2 size={18} /></span>}
          <div className="jd-inline-connector-heading">
            <div className="jd-inline-connector-title-row">
              <h3>Connect {name}</h3>
              <span className="jd-inline-connector-pill">{setupLabel}</span>
            </div>
            <p className="jd-inline-connector-sub">{entry?.category || "External integration"} · Not connected automatically</p>
          </div>
        </div>
      </div>

      <p className="jd-inline-connector-reason">{description}</p>

      <ul className="jd-inline-connector-caps" aria-label="Requested capabilities">
        {capabilities.map((cap, idx) => (
          <li key={idx}>
            <Check size={14} aria-hidden="true" />
            <span>{cap}</span>
          </li>
        ))}
      </ul>

      {expanded && entry && (
        <div className="jd-inline-connector-details">
          <div className="jd-inline-connector-detail-row">
            <span>Authentication</span>
            <strong>{setupLabel}</strong>
          </div>
          <div className="jd-inline-connector-detail-row">
            <span>Permission boundary</span>
            <strong>Scoped to workspace · never paste secrets in chat</strong>
          </div>
          {entry.connection?.docsUrl && (
            <a href={entry.connection.docsUrl} target="_blank" rel="noopener noreferrer" className="jd-inline-connector-doc">
              Official provider documentation <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          )}
        </div>
      )}

      <div className="jd-inline-connector-foot">
        <button
          type="button"
          className="jd-inline-connector-info-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          <Info size={14} aria-hidden="true" />
          {expanded ? "Hide connection details" : "Permissions & info"}
        </button>

        <div className="jd-inline-connector-actions">
          <button
            type="button"
            className="jd-inline-connector-secondary"
            disabled={disabled}
            onClick={() => {
              setDismissed(true);
              onDismiss?.(block.connectorId);
            }}
          >
            Not now
          </button>
          {allowed ? (
            <button
              type="button"
              className="jd-inline-connector-primary"
              disabled={disabled}
              onClick={() => onConnect?.(entry || { id: block.connectorId, name })}
            >
              Connect {name}
            </button>
          ) : (
            <span className="jd-inline-connector-restricted">
              <ShieldCheck size={14} aria-hidden="true" /> Owner, admin or manager required
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
