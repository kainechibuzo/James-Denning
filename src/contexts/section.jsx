/**
 * Section (multi-campus) Context
 * Provides the selected school section, school name, and logo to all components.
 */
import React, { useState, useEffect, useCallback, createContext, useContext } from "react";
import { db } from "../supabaseClient.js";
import { loadSelectedSchool } from "../utils/session.js";
import { setNameSettings } from "../utils/grades.js";

export const SectionCtx = createContext(null);
export const useSection = () => useContext(SectionCtx);

export function SectionProvider({ children }) {
  const [sections, setSections]       = useState([]);
  const [selectedSection, setSelectedSection] = useState(null);
  const [loading, setLoading]         = useState(true);
  const [schoolLogo, setSchoolLogo]   = useState(() => loadSelectedSchool()?.logo || null);
  const [schoolName, setSchoolName]   = useState(() => loadSelectedSchool()?.name || "School Portal");

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
    db.getSettings().then(({ data }) => {
      const m = {};
      (data || []).forEach(r => { m[r.key] = r.value; });
      if (m.portal_logo_base64) { setSchoolLogo(m.portal_logo_base64); applyFavicon(m.portal_logo_base64); }
      if (m.school_name) setSchoolName(m.school_name);
      if (m.name_order || m.name_case) setNameSettings({ order: m.name_order || "FML", casing: m.name_case || "title" });
    });
  }, []);

  const selectSection = useCallback((sec) => {
    setSelectedSection(sec);
    localStorage.setItem("rgs_section_id", sec ? sec.id : "null");
  }, []);

  const refreshSchool = useCallback((school) => {
    if (school?.name) setSchoolName(school.name);
    if (school?.logo) { setSchoolLogo(school.logo); applyFavicon(school.logo); }
  }, []);

  const refreshLogo = useCallback(() => {
    db.getSettings().then(({ data }) => {
      const m = {};
      (data || []).forEach(r => { m[r.key] = r.value; });
      setSchoolLogo(m.portal_logo_base64 || null);
      if (m.school_name) setSchoolName(m.school_name);
    });
  }, []);

  return (
    <SectionCtx.Provider value={{ sections, selectedSection, selectSection, loading, schoolLogo, schoolName, refreshLogo, refreshSchool }}>
      {children}
    </SectionCtx.Provider>
  );
}
