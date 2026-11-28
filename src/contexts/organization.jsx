/**
 * Organisation context: name, logo, workspace type and display terminology.
 * Database keys keep their original names (for example `school_name` and
 * `school_id` identify the organisation tenant); see docs/LEGACY_SCHEMA.md.
 */
import React, { useState, useEffect, useCallback, createContext, useContext } from "react";
import { db } from "../supabaseClient.js";
import { loadSelectedSchool } from "../utils/session.js";
import { PRODUCT, getStoredWorkspaceType, getTerms, storeWorkspaceType } from "../config/product.js";

export const OrganizationCtx = createContext(null);
export const useOrganization = () => useContext(OrganizationCtx);

export function OrganizationProvider({ children }) {
  const [orgLogo, setOrgLogo] = useState(() => loadSelectedSchool()?.logo || null);
  const [orgName, setOrgName] = useState(() => loadSelectedSchool()?.name || "Your organisation");
  const [workspaceType, setWorkspaceType] = useState(() => getStoredWorkspaceType());

  const applyFavicon = (logoData) => {
    if (!logoData) return;
    try {
      let link = document.querySelector("link[rel~='icon']");
      if (!link) { link = document.createElement("link"); link.rel = "icon"; document.head.appendChild(link); }
      link.href = logoData;
      const touch = document.querySelector("link[rel='apple-touch-icon']:not([sizes])");
      if (touch) touch.href = logoData;
    } catch (e) {}
  };

  const applySettings = useCallback((data) => {
    const m = {};
    (data || []).forEach(row => { m[row.key] = row.value; });
    if (m.portal_logo_base64) { setOrgLogo(m.portal_logo_base64); applyFavicon(m.portal_logo_base64); }
    if (m.school_name) setOrgName(m.school_name);
    if (m.workspace_type) { setWorkspaceType(m.workspace_type); storeWorkspaceType(m.workspace_type); }
  }, []);

  // Settings are a decoration: a name, a logo and a workspace label. A failed read
  // (offline, expired token, 5xx) must leave the defaults above in place rather than
  // escaping as an unhandled rejection that tears down the workspace around it.
  const loadSettings = useCallback(() => {
    const unavailable = (error) => console.warn("[JD] organisation settings unavailable; keeping local defaults.", error?.message || error);
    try {
      const request = db.getSettings();
      if (!request || typeof request.then !== "function") return;
      request.then(({ data } = {}) => applySettings(data)).catch(unavailable);
    } catch (error) {
      // The client can also throw synchronously (helper missing or misconfigured).
      unavailable(error);
    }
  }, [applySettings]);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const refreshOrganization = useCallback((org) => {
    if (org?.name) setOrgName(org.name);
    if (org?.logo) { setOrgLogo(org.logo); applyFavicon(org.logo); }
  }, []);
  const refreshLogo = useCallback(() => { loadSettings(); }, [loadSettings]);
  const refreshWorkspace = useCallback((nextType) => {
    const value = nextType || PRODUCT.defaultIndustry;
    setWorkspaceType(value); storeWorkspaceType(value);
  }, []);

  return <OrganizationCtx.Provider value={{
    orgLogo, orgName, workspaceType, terms: getTerms(), refreshLogo, refreshOrganization, refreshWorkspace,
  }}>{children}</OrganizationCtx.Provider>;
}
