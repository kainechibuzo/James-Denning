/**
 * Confirm Dialog Context
 * Replaces the native browser confirm() with a styled modal.
 * Usage: const showConfirm = useConfirm();
 *        const ok = await showConfirm({ title, message, confirmLabel, danger, typeToConfirm });
 */
import React, { createContext, useContext } from "react";
import { C } from "../config/theme.js";

export const ConfirmCtx = React.createContext(null);
export const useConfirm = () => React.useContext(ConfirmCtx);

function ConfirmDialog({ config, onDone }) {
  const [typed, setTyped] = React.useState("");
  if (!config) return null;
  const { title, message, confirmLabel = "Confirm", danger = false, typeToConfirm = null, icon = null } = config;
  const canConfirm = typeToConfirm ? typed === typeToConfirm : true;
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.6)", zIndex:99999,
      display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div style={{ background:C.white, borderRadius:18, padding:"30px 28px", maxWidth:420, width:"100%",
        boxShadow:"0 24px 60px rgba(0,0,0,.35)", animation:"fadeUp .15s ease" }}>
        <div style={{ fontSize:40, textAlign:"center", marginBottom:12 }}>{icon}</div>
        <div style={{ fontSize:17, fontWeight:900, color:danger ? C.red : C.text,
          textAlign:"center", marginBottom:10 }}>{title}</div>
        <div style={{ fontSize:13, color:C.muted, lineHeight:1.7, textAlign:"center", marginBottom:18 }}>
          {message}
        </div>
        {typeToConfirm && (
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:11, color:C.muted, marginBottom:6, textAlign:"center" }}>
              Type <strong style={{ color:C.red, fontFamily:"monospace" }}>{typeToConfirm}</strong> to confirm
            </div>
            <input value={typed} onChange={e => setTyped(e.target.value)}
              placeholder={`Type "${typeToConfirm}"…`}
              style={{ display:"block", width:"100%", padding:"9px 12px",
                border:`2px solid ${typed === typeToConfirm ? C.green : C.border}`,
                borderRadius:8, fontSize:13, outline:"none", textAlign:"center",
                fontFamily:"monospace", fontWeight:700, background:C.white, color:C.text }} />
          </div>
        )}
        <div style={{ display:"flex", gap:10 }}>
          <button onClick={() => onDone(false)}
            style={{ flex:1, padding:"11px", borderRadius:10, border:`2px solid ${C.border}`,
              background:C.white, color:C.muted, fontWeight:700, fontSize:13, cursor:"pointer" }}>
            Cancel
          </button>
          <button onClick={() => { if (canConfirm) onDone(true); }}
            disabled={!canConfirm}
            style={{ flex:1, padding:"11px", borderRadius:10, border:"none",
              background: canConfirm ? (danger ? "linear-gradient(135deg,#dc2626,#b91c1c)" : "linear-gradient(135deg,#E8560A,#FF7A35)") : "#cbd5e1",
              color: canConfirm ? "#fff" : "#94a3b8", fontWeight:800, fontSize:13,
              cursor: canConfirm ? "pointer" : "not-allowed",
              boxShadow: canConfirm && danger ? "0 4px 14px rgba(220,38,38,.35)" : canConfirm ? "0 4px 14px rgba(232,86,10,.3)" : "none" }}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ConfirmProvider({ children }) {
  const [config, setConfig] = React.useState(null);
  const showConfirm = React.useCallback((opts) => new Promise(resolve => {
    setConfig({ ...opts, _resolve: resolve });
  }), []);
  const onDone = (result) => { config?._resolve(result); setConfig(null); };
  return (
    <ConfirmCtx.Provider value={showConfirm}>
      {children}
      <ConfirmDialog config={config} onDone={onDone} />
    </ConfirmCtx.Provider>
  );
}
