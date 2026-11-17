import React, {useEffect, useRef, useState} from "react";
import {createPortal} from "react-dom";
import {bindMobileNavigation} from "./mobile-navigation.mjs";

export function WorkspaceSwitchDialog({organisation, onClose, onSwitch, returnFocus}) {
  const dialog = useRef(null);
  const busyRef = useRef(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const callbacks = useRef({onClose,returnFocus});
  callbacks.current = {onClose,returnFocus};
  useEffect(()=>{
    const cleanup=bindMobileNavigation(dialog.current, {
      onClose:()=>{if(!busyRef.current) callbacks.current.onClose();},
      returnFocus:{focus:()=>{if(!busyRef.current) callbacks.current.returnFocus?.focus();}},
    });
    return ()=>{cleanup();callbacks.current.returnFocus?.focus();};
  },[]);
  const proceed = async()=>{
    if(busyRef.current) return;
    busyRef.current=true;setBusy(true);setError("");
    try {await onSwitch();}
    catch {setError("Could not sign out safely. Your organisation selection has not changed. Check your connection and try again.");}
    finally {busyRef.current=false;setBusy(false);}
  };
  const button={padding:"12px 16px",borderRadius:10,border:"1px solid #d1d5db",cursor:"pointer",fontWeight:700};
  return createPortal(<div style={{position:"fixed",inset:0,zIndex:10000,background:"rgba(6,6,6,.65)",display:"grid",placeItems:"center",padding:16}}>
    <section className="jd-confirm-card" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="workspace-switch-title" aria-describedby="workspace-switch-description" aria-busy={busy} tabIndex={-1}
      style={{background:"#fff",color:"#17191c",width:"100%",maxWidth:440,borderRadius:18,padding:24,boxSizing:"border-box",maxHeight:"90dvh",overflowY:"auto"}}>
      <h2 id="workspace-switch-title" style={{fontSize:20,margin:"0 0 12px"}}>Switch organisation</h2>
      <p style={{overflowWrap:"anywhere",fontSize:14}}>Current organisation: <strong>{organisation || "Your organisation"}</strong></p>
      <p id="workspace-switch-description" style={{fontSize:14,lineHeight:1.7,color:"#34353b"}}>Save any unsaved work first. This signs you out on this device. Then sign in with the account linked to the organisation you want to use. It does not grant access to another organisation.</p>
      {error&&<p role="alert" style={{color:"#34353b",fontSize:13,lineHeight:1.6}}>{error}</p>}
      <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:20}}>
        <button type="button" disabled={busy} onClick={onClose} style={{...button,background:"#fff",color:"#17191c"}}>Stay here</button>
        <button type="button" disabled={busy} onClick={proceed} style={{...button,background:"#17191c",color:"#fff",opacity:busy?.6:1}}>{busy?"Signing out…":"Sign out to switch"}</button>
      </div>
    </section>
  </div>,document.body);
}
