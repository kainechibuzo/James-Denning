/**
 * Dark Mode Context
 * Provides dark/light theme state across the entire app.
 * setTheme() keeps config/theme.js C in sync for non-React (service) modules.
 */
import React, { useState, useEffect, createContext, useContext } from "react";
import { LIGHT, DARK, C, setTheme } from "../config/theme.js";

export const DarkCtx = createContext({ dark: false, toggle: () => {} });
export const useDark  = () => useContext(DarkCtx);

export function DarkProvider({ children }) {
  // Defaults to true (all-black theme) unless the user has explicitly opted
  // into light mode before.
  const stored = () => { try { const value = localStorage.getItem("jd_dark"); return value != null ? value === "1" : false; } catch { return false; } };
  const [dark, setDark] = useState(stored);
  // Keep config/theme.js C in sync on every render so service modules read the right palette
  setTheme(dark);

  const toggle = () => {
    setDark(d => {
      const next = !d;
      try { localStorage.setItem("jd_dark", next ? "1" : "0"); } catch {}
      setTheme(next);
      return next;
    });
  };

  useEffect(() => {
    document.body.style.background = dark ? DARK.offWhite : LIGHT.offWhite;
  }, [dark]);

  return <DarkCtx.Provider value={{ dark, toggle }}>{children}</DarkCtx.Provider>;
}

export function DarkToggle() {
  const { dark, toggle } = useDark();
  return (
    <button
      onClick={toggle}
      title={dark ? "Switch to Light Mode" : "Switch to Dark Mode"}
      style={{
        background: dark ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.05)",
        border: `1px solid ${C.border}`, borderRadius: 20, padding: "5px 12px",
        cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
        fontSize: 12, fontWeight: 600, color: C.muted,
        transition: "all .2s", flexShrink: 0, backdropFilter: "blur(4px)",
      }}>
      <span>{dark ? "Light" : "Dark"}</span>
    </button>
  );
}
