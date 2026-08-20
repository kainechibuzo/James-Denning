/**
 * Workspace context. Database keys remain school-compatible for existing tenants,
 * while the presentation layer exposes organization-neutral terminology.
 */
import React, { useState, useEffect, useCallback, createContext, useContext } from "react";
import { db } from "../supabaseClient.js";
import { loadSelectedSchool } from "../utils/session.js";
import { setNameSettings } from "../utils/grades.js";
import { PRODUCT, getStoredWorkspaceType, getTerms, storeWorkspaceType } from "../config/product.js";

export const SectionCtx = createContext(null);
export const useSection = () => useContext(SectionCtx);

export function SectionProvider({ children }) {
  const [sections, setSections] = useState([]);
  const [selectedSection, setSelectedSection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [schoolLogo, setSchoolLogo] = useState(() => loadSelectedSchool()?.logo || null);
  const [schoolName, setSchoolName] = useState(() => loadSelectedSchool()?.name || "Business Portal");
  const [workspaceType, setWorkspaceType] = useState(() => getStoredWorkspaceType());
  const [educationModuleEnabled, setEducationModuleEnabled] = useState(true);

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
    if (m.portal_logo_base64) { setSchoolLogo(m.portal_logo_base64); applyFavicon(m.portal_logo_base64); }
    if (m.school_name) setSchoolName(m.school_name);
    if (m.workspace_type) { setWorkspaceType(m.workspace_type); storeWorkspaceType(m.workspace_type); }
    if (m.education_module_enabled != null) setEducationModuleEnabled(m.education_module_enabled !== "false");
    if (m.name_order || m.name_case) setNameSettings({ order: m.name_order || "FML", casing: m.name_case || "title" });
  }, []);

  useEffect(() => {
    db.getSections(true).then(({ data }) => {
      setSections(data || []);
      const saved = localStorage.getItem("rgs_section_id");
      if (saved && saved !== "null" && data) {
        const found = data.find(s => s.id === parseInt(saved));
        if (found) setSelectedSection(found);
      }
      setLoading(false);
    });
    db.getSettings().then(({ data }) => applySettings(data));
  }, [applySettings]);

  const selectSection = useCallback((sec) => {
    setSelectedSection(sec);
    localStorage.setItem("rgs_section_id", sec ? sec.id : "null");
  }, []);
  const refreshSchool = useCallback((school) => {
    if (school?.name) setSchoolName(school.name);
    if (school?.logo) { setSchoolLogo(school.logo); applyFavicon(school.logo); }
  }, []);
  const refreshLogo = useCallback(() => { db.getSettings().then(({ data }) => applySettings(data)); }, [applySettings]);
  const refreshWorkspace = useCallback((nextType, educationEnabled = true) => {
    const value = nextType || PRODUCT.defaultIndustry;
    setWorkspaceType(value); setEducationModuleEnabled(educationEnabled); storeWorkspaceType(value);
  }, []);
  const presentationType = workspaceType === "education" && educationModuleEnabled ? "education" : "business";

  return <SectionCtx.Provider value={{
    sections, selectedSection, selectSection, loading, schoolLogo, schoolName, workspaceType,
    educationModuleEnabled, terms: getTerms(presentationType), refreshLogo, refreshSchool, refreshWorkspace,
  }}>{children}</SectionCtx.Provider>;
}
