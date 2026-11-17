/**
 * Settings domain: SettingsPage, SettingRow, SettingInput, SettingToggle,
 * generateStampSvg
 */
import React, { useState, useEffect, useContext } from "react";
import {
  Bell, Building2, Calendar, Clock, Edit, Info, Pencil, Phone, Save, School,
  Send, Settings, Shield, Trash2, Upload, Users,
} from "lucide-react";
import { db, supabase } from "../supabaseClient.js";
import { C } from "../config/theme.js";
import { SectionCtx } from "../contexts/section.jsx";
import { useConfirm } from "../contexts/confirm.jsx";
import {
  DangerBtn, Logo, Card, Btn, Badge, Inp, Sel, Modal, Spinner,
} from "../components/ui.jsx";
import { buildTranscriptHTML } from "../services/pdf/transcript.js";
import { buildAlertEmail } from "../services/email/index.js";
import { _applyNameCase, setNameSettings } from "../utils/grades.js";
import { PRODUCT, INDUSTRIES, MODULES, getIndustryLabel, storeWorkspaceType } from "../config/product.js";
import { PermissionsPage } from "./permissions.jsx";
import { JDConnectPanel } from "../components/jd-connect/JDConnectPanel.jsx";

import { showEducationSettings, configuredProjectLabel } from "../config/settings-presentation.mjs";

const APP_VERSION = PRODUCT.version;

export function generateStampSvg(schoolName="OFFICIAL STAMP", style="blue"){
  const S=schoolName.toUpperCase().slice(0,30);
  const palettes={
    blue:  {ring:"#1a3a6b",fill:"#1a3a6b22",text:"#1a3a6b",center:"#1a3a6b",bg:"none"},
    red:   {ring:"#b91c1c",fill:"#b91c1c18",text:"#b91c1c",center:"#b91c1c",bg:"none"},
    gold:  {ring:"#92400e",fill:"#fef3c722",text:"#92400e",center:"#92400e",bg:"none"},
    green: {ring:"#065f46",fill:"#065f4618",text:"#065f46",center:"#065f46",bg:"none"},
    orange:{ring:"#c2410c",fill:"#c2410c18",text:"#c2410c",center:"#1a3a6b",bg:"none"},
  };
  const p=palettes[style]||palettes.blue;
  // curved top text via textPath on a circle arc
  // SVG 200×200, outer ring r=95, inner ring r=80, center r=75
  const topArc=`M 15,100 A 85,85 0 0,1 185,100`;
  const botArc=`M 20,105 A 80,80 0 0,0 180,105`;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
  <defs>
    <path id="topArc" d="${topArc}"/>
    <path id="botArc" d="${botArc}"/>
  </defs>
  <circle cx="100" cy="100" r="95" fill="${p.fill}" stroke="${p.ring}" stroke-width="4"/>
  <circle cx="100" cy="100" r="80" fill="none" stroke="${p.ring}" stroke-width="1.5" stroke-dasharray="4,3"/>
  <text font-family="Arial,Helvetica,sans-serif" font-size="13" font-weight="700" fill="${p.text}" letter-spacing="2">
    <textPath href="#topArc" startOffset="50%" text-anchor="middle">${S}</textPath>
  </text>
  <text font-family="Arial,Helvetica,sans-serif" font-size="11" font-weight="600" fill="${p.text}" letter-spacing="1.5">
    <textPath href="#botArc" startOffset="50%" text-anchor="middle">LAGOS · NIGERIA</textPath>
  </text>
  <text x="100" y="93" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="14" font-weight="900" fill="${p.center}" letter-spacing="2">OFFICIAL</text>
  <text x="100" y="111" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="10" font-weight="600" fill="${p.center}" letter-spacing="1">VERIFIED</text>
  <line x1="60" y1="100" x2="140" y2="100" stroke="${p.ring}" stroke-width="0.8" opacity="0.5"/>
</svg>`;
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

export const STAMP_TEMPLATES=[
  {id:"blue",  label:"Classic Blue",   style:"blue"},
  {id:"red",   label:"Official Red",   style:"red"},
  {id:"gold",  label:"Gold Premium",   style:"gold"},
  {id:"green", label:"Emerald",        style:"green"},
  {id:"orange",label:"Organization Brand",   style:"orange"},
];

// ─── SETTINGS HELPERS — defined OUTSIDE SettingsPage so they are stable
// component references and never cause focus-loss on re-render ─────────────────
export function SettingRow({label,desc,children}){
  return(
    <div className="jd-setting-row" style={{borderBottom:`1px solid ${C.border}`,padding:"16px 0"}}>
      <div className="jd-setting-row__label" style={{minWidth:0,paddingRight:8}}>
        <div style={{fontWeight:700,fontSize:13,color:C.text,marginBottom:2}}>{label}</div>
        {desc&&<div style={{fontSize:11,color:C.muted,lineHeight:1.5}}>{desc}</div>}
      </div>
      <div className="jd-setting-row__control">{children}</div>
    </div>
  );
}
export function SettingInput({k,placeholder="",settings,onSet}){
  return(
    <input value={settings[k]||""} onChange={e=>onSet(k,e.target.value)} placeholder={placeholder}
      style={{width:"100%",padding:"9px 12px",border:`2px solid ${C.border}`,borderRadius:8,
        fontSize:13,outline:"none",background:C.white,color:C.text}}
      onFocus={e=>e.target.style.borderColor=C.orange}
      onBlur={e=>e.target.style.borderColor=C.border}/>
  );
}
export function SettingToggle({k,settings,onSet}){
  const on=settings[k]==="true";
  return(
    <button onClick={()=>onSet(k,on?"false":"true")}
      style={{width:52,height:28,borderRadius:14,border:"none",cursor:"pointer",
        background:on?C.green:"#cbd5e1",transition:"all .2s",position:"relative"}}>
      <div style={{position:"absolute",top:3,left:on?26:3,width:22,height:22,
        borderRadius:"50%",background:"#fff",transition:"all .2s",boxShadow:"0 1px 4px rgba(0,0,0,.2)"}}/>
    </button>
  );
}

// ─── SETTINGS PAGE ────────────────────────────────────────────────────────────
export function SettingsPage({ctx,inPanel}){
  const {notify,setPage}=ctx;
  const {refreshLogo,refreshWorkspace}=useContext(SectionCtx);
  const confirm=useConfirm();
  const [settings,setSettings]=useState({});
  const [loading,setLoading]=useState(true);
  const [loadError,setLoadError]=useState(false);
  const [saving,setSaving]=useState(false);
  const [tab,setTab]=useState("workspace"); // workspace | school | sessions | academic | security | portal
  const [showPass,setShowPass]=useState(false);
  const [newPass,setNewPass]=useState("");
  const [confirmPass,setConfirmPass]=useState("");
  // Cycles/Periods state
  const [sessions,setSessions]=useState([]);
  const [terms,setTerms]=useState([]);
  const [sessModal,setSessModal]=useState(false);
  const [termModal,setTermModal]=useState(false);
  const [editSessId,setEditSessId]=useState(null);
  const [editTermId,setEditTermId]=useState(null);
  const [sessForm,setSessForm]=useState({name:"",is_active:false});
  const [termForm,setTermForm]=useState({name:"",session_id:"",is_active:false});
  const [sesLoading,setSesLoading]=useState(false);
  // Logo upload state
  const [logoPreview,setLogoPreview]=useState(null);
  // Notification config state
  const [notifConfig,setNotifConfig]=useState(null);
  const [notifSaving,setNotifSaving]=useState(false);
  const [testSending,setTestSending]=useState(false);
  // Digest config state
  const [digestConfig,setDigestConfig]=useState(null);
  const [digestSaving,setDigestSaving]=useState(false);
  const [digestSending,setDigestSending]=useState(false);

  const DEFAULT_DIGEST={
    enabled:false, recipient:"", utc_hour:6, frequency:"daily",
    day_of_week:1, events:null, last_sent_at:null,
  };

  const load=()=>{
    setLoading(true);setLoadError(false);
    db.getSettings().then(({data,error})=>{
      if(error||!Array.isArray(data))throw Error("Settings unavailable");
      const m={};
      (data||[]).forEach(r=>{m[r.key]=r.value;});
      setSettings(m);
      if(m.portal_logo_base64) setLogoPreview(m.portal_logo_base64);
    }).catch(()=>setLoadError(true)).finally(()=>setLoading(false));
    db.getNotifConfig().then(({data})=>{
      setNotifConfig(data || {
        admin_email: "",
        events: {},
        failed_login_threshold: 5,
      });
    });
    db.getDigestConfig().then(({data})=>{
      setDigestConfig(data || DEFAULT_DIGEST);
    });
  };
  const loadSessions=()=>{
    setSesLoading(true);
    Promise.all([db.getSessions(),db.getTerms()]).then(([s,t])=>{
      setSessions(s.data||[]);
      setTerms(t.data||[]);
      setSesLoading(false);
    });
  };
  useEffect(()=>{load();},[]);
  useEffect(()=>{if(showEducationSettings(settings))loadSessions();},[settings.workspace_type,settings.education_module_enabled]);

  const set=(key,value)=>setSettings(p=>({...p,[key]:value}));
  const saveTab=async(keys)=>{
    setSaving(true);
    try{
      const pairs=keys.map(k=>({key:k,value:String(settings[k]??"")}));
      const {error}=await db.setSettings(pairs);
      if(error)throw Error();
      const {data,error:readError}=await db.getSettings();
      if(readError||!Array.isArray(data)||pairs.some(p=>!data.some(r=>r.key===p.key&&r.value===p.value)))throw Error();
      if(keys.includes("school_name"))refreshLogo?.();
      notify("Settings saved and read back ✓");return true;
    }catch{notify("Settings save was not confirmed. Reload before retrying; some changes may have been saved.","error");return false;}
    finally{setSaving(false);}
  };

  const saveWorkspace=async()=>{
    const workspaceType=settings.workspace_type||PRODUCT.defaultIndustry;
    const educationEnabled=showEducationSettings(settings);
    setSaving(true);
    try{
      const pairs=[{key:"workspace_type",value:workspaceType},{key:"education_module_enabled",value:educationEnabled?"true":"false"}];
      const {error}=await db.setSettings(pairs);
      if(error)throw Error();
      const {data,error:readError}=await db.getSettings();
      if(readError||!Array.isArray(data)||pairs.some(p=>!data.some(r=>r.key===p.key&&r.value===p.value)))throw Error();
      storeWorkspaceType(workspaceType);
      refreshWorkspace?.(workspaceType,educationEnabled);
      notify(`${getIndustryLabel(workspaceType)} workspace saved and read back ✓`);
    }catch{notify("Workspace save was not confirmed. Reload before retrying; some changes may have been saved.","error");}
    finally{setSaving(false);}
  };

  const handleLogoUpload=async(file)=>{
    if(!file)return;
    if(file.size>500000){notify("Logo must be under 500KB","error");return;}
    const reader=new FileReader();
    reader.onload=async(e)=>{
      const b64=e.target.result;
      setLogoPreview(b64);
      await db.setSetting("portal_logo_base64",b64);
      notify("Logo uploaded ✓");
      if(refreshLogo)refreshLogo();
    };
    reader.readAsDataURL(file);
  };

  const changePassword=async()=>{
    if(!newPass){notify("Enter a new password","error");return;}
    if(newPass!==confirmPass){notify("Passwords do not match","error");return;}
    if(newPass.length<6){notify("Min. 6 characters","error");return;}
    setSaving(true);
    const {error}=await db.setSetting("admin_password_hash",newPass);
    setSaving(false);
    if(error)notify(error.message,"error");
    else{
      notify("Password changed ✓");setNewPass("");setConfirmPass("");
      // Tier A alert — admin password changed
      db.sendAdminAlert({
        subject:"[Alert] Admin Password Changed",
        html:buildAlertEmail("Admin Password Changed",
          [`Changed by: ${ctx?.user?.full_name||ctx?.user?.name||"Admin"}`,
           `Organization: ${settings.school_name||"Business Portal"}`,
           `Time: ${new Date().toLocaleString("en-NG")}`,
           `Action: Admin portal login password was changed`],
          "critical",settings.school_name||"Business Portal"),
        eventKey:"pin_change"
      });
    }
  };

  // Cycles CRUD
  const saveSession=async()=>{
    if(!sessForm.name){notify("Cycle name required","error");return;}
    const {error}=await db.upsertSession(sessForm,editSessId);
    if(error)notify(error.message,"error");
    else{notify(editSessId?"Cycle updated ✓":"Cycle added ✓");setSessModal(false);loadSessions();}
  };
  const saveTerm=async()=>{
    if(!termForm.name||!termForm.session_id){notify("Name and cycle required","error");return;}
    const {error}=await db.upsertTerm({...termForm,session_id:+termForm.session_id},editTermId);
    if(error)notify(error.message,"error");
    else{notify(editTermId?"Period updated ✓":"Period added ✓");setTermModal(false);loadSessions();}
  };
  const activateSession=async(s)=>{
    const current=sessions.find(x=>x.is_active);
    if(current&&current.id!==s.id){
      const ok=await confirm({title:"Change Active Cycle?",
        message:`"${current.name}" is currently active. Switch to "${s.name}"? The previous session will be deactivated.`,
        confirmLabel:"Switch Cycle"});
      if(!ok)return;
    }
    const {error}=await db.setActiveSession(s.id);
    if(error){notify(error.message,"error");return;}
    notify(`Active session changed to "${s.name}"`);loadSessions();
  };
  const activateTerm=async(t)=>{
    const sessionTerms=terms.filter(x=>x.session_id===t.session_id);
    const current=sessionTerms.find(x=>x.is_active);
    if(current&&current.id!==t.id){
      const ok=await confirm({title:"Change Active Period?",
        message:`"${current.name}" is currently active. Switch to "${t.name}"?`,
        confirmLabel:"Switch Period"});
      if(!ok)return;
    }
    const {error}=await db.setActiveTerm(t.id,t.session_id);
    if(error){notify(error.message,"error");return;}
    notify(`Active term changed to "${t.name}"`);loadSessions();
  };
  const delSession=async(s)=>{
    const __ok=await confirm({title:"Delete Cycle?",
        message:`Delete "${s.name}"? All associated terms, results, and report data will be permanently removed.`,
        confirmLabel:"Delete Cycle",danger:true,typeToConfirm:s.name});
    if(!__ok)return;
    await db.deleteSession(s.id);
    notify(s.name+" deleted","warn");loadSessions();
  };
  const delTerm=async(id,name)=>{
    const __ok=await confirm({title:"Delete Period?",
        message:`Delete term "${name}"? Results linked to this term will also be removed.`,
        confirmLabel:"Delete",danger:true,typeToConfirm:name});
    if(!__ok)return;
    await db.deleteTerm(id);notify(`${name} deleted`,"warn");loadSessions();
  };

  const educationSettings=showEducationSettings(settings);
  const tabs=[
    {id:"workspace",     label:"Workspace"},
    {id:"school",        label:"Organization Info"},
    ...(educationSettings?[{id:"sessions",label:"Academic periods"},{id:"academic",label:"Academic scores"}]:[]),
    {id:"security",      label:"Security"},
    {id:"integrations",   label:"JD Connect"},
    {id:"portal",        label:"Portal"},
  ];

  // SettingRow, SettingInput, SettingToggle are defined at module scope above
  // to prevent focus-loss caused by component re-creation on every keystroke.

  if(loading)return <Spinner/>;
  if(loadError)return <div role="alert"><p>Organisation settings could not be loaded. No editable defaults have been substituted.</p><Btn onClick={load}>Reload settings</Btn></div>;

  return(
    <div style={{padding:"0 0 40px"}}>
      {/* ── Page header ── */}
      <div style={{background:`linear-gradient(135deg,${C.blue},${C.blueDark})`,
        padding:"20px 28px",marginBottom:24,display:"flex",alignItems:"center",gap:16}}>
        <button onClick={()=>setPage&&setPage("dashboard")}
          style={{background:"rgba(255,255,255,.18)",border:"none",color:"#fff",
            borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:12,fontWeight:700,
            display:"flex",alignItems:"center",gap:6}}>
          ← Back
        </button>
        <div style={{flex:1}}>
          <div style={{fontWeight:900,fontSize:20,color:"#fff",display:"flex",alignItems:"center",gap:10}}>
            <Settings size={20} color="#fff" style={{opacity:.85}}/>Settings
          </div>
          <div style={{fontSize:12,color:"rgba(255,255,255,.7)",marginTop:2}}>Configure your business portal</div>
        </div>
      </div>

      <div style={{padding:"0 20px",maxWidth:900,margin:"0 auto"}}>

      {/* Tabs */}
      <div style={{display:"flex",gap:0,marginBottom:20,background:C.white,borderRadius:10,
        border:`1px solid ${C.border}`,overflow:"hidden",flexWrap:"wrap"}}>
        {tabs.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{padding:"10px 18px",border:"none",cursor:"pointer",fontSize:13,fontWeight:700,
              background:tab===t.id?C.blue:"transparent",
              color:tab===t.id?"#fff":C.muted,
              borderRight:`1px solid ${C.border}`,transition:"all .15s"}}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── WORKSPACE PROFILE ── */}
      {tab==="workspace"&&(
        <Card>
          <div style={{fontWeight:900,color:C.blue,fontSize:15,marginBottom:4}}>Workspace Profile</div>
          <p style={{color:C.muted,fontSize:12,lineHeight:1.6,marginBottom:18}}>Choose the language and optional modules that best fit your organization. Existing data and workflows remain compatible when you change this setting.</p>
          <div style={{marginBottom:20}}><label style={{display:"block",fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:8}}>Organization type</label>
            <select value={settings.workspace_type||PRODUCT.defaultIndustry} onChange={e=>set("workspace_type",e.target.value)} style={{width:"100%",padding:"11px 12px",border:`1.5px solid ${C.border}`,borderRadius:9,fontSize:13,background:C.white,color:C.text,outline:"none"}}>
              {INDUSTRIES.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}
            </select><div style={{fontSize:11,color:C.muted,marginTop:6}}>{INDUSTRIES.find(item=>item.value===(settings.workspace_type||PRODUCT.defaultIndustry))?.description}</div>
          </div>
          <div style={{border:`1px solid ${C.border}`,borderRadius:12,padding:16,marginBottom:20,background:C.offWhite}}><div style={{display:"flex",alignItems:"flex-start",gap:12}}><div style={{width:36,height:36,borderRadius:10,background:C.text,color:C.white,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Settings size={17}/></div><div style={{flex:1}}><div style={{fontWeight:800,fontSize:13,color:C.text}}>{MODULES.core.label}</div><div style={{fontSize:12,color:C.muted,lineHeight:1.5,marginTop:3}}>{MODULES.core.description}</div></div><Badge color={C.green}>Always on</Badge></div></div>
          <div style={{border:`1px solid ${C.border}`,borderRadius:12,padding:16,marginBottom:20}}><div style={{display:"flex",alignItems:"flex-start",gap:12}}><div style={{width:36,height:36,borderRadius:10,background:C.offWhite,color:C.text,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Calendar size={17}/></div><div style={{flex:1}}><div style={{fontWeight:800,fontSize:13,color:C.text}}>{MODULES.education.label}</div><div style={{fontSize:12,color:C.muted,lineHeight:1.5,marginTop:3}}>{MODULES.education.description}</div></div><button type="button" aria-label="Enable education module" role="switch" aria-checked={showEducationSettings(settings)} disabled={settings.workspace_type!=="education"} onClick={()=>set("education_module_enabled",showEducationSettings(settings)?"false":"true")} style={{width:44,height:24,borderRadius:14,border:"none",background:showEducationSettings(settings)?C.text:C.border,position:"relative",cursor:"pointer",flexShrink:0}}><span style={{position:"absolute",top:4,left:showEducationSettings(settings)?24:4,width:16,height:16,borderRadius:"50%",background:C.white,transition:"left .15s"}}/></button></div><div style={{fontSize:11,color:C.muted,marginTop:12}}>Academic tools are available only for the Education workspace type. Business workspaces keep these controls out of the way; existing academic records are not deleted.</div></div>
          <Btn onClick={saveWorkspace} disabled={saving}>{saving?"Saving…":"Save Workspace Profile"}</Btn>
        </Card>
      )}

      {/* ── SCHOOL INFO ── */}
      {tab==="school"&&(
        <Card>
          <div style={{fontWeight:900,color:C.blue,fontSize:15,marginBottom:4}}>Organization Information</div>
          <p style={{color:C.muted,fontSize:12,marginBottom:16}}>Appears on reports, transcripts, and the login page.</p>

          {/* Logo Upload */}
          <div style={{marginBottom:20,paddingBottom:20,borderBottom:`1px solid ${C.border}`}}>
            <label style={{display:"block",fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:10}}>Organization Logo</label>
            <div style={{display:"flex",alignItems:"center",gap:16}}>
              <div style={{width:80,height:80,borderRadius:12,border:`2px dashed ${C.border}`,
                background:C.offWhite,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",flexShrink:0}}>
                {logoPreview
                  ?<img src={logoPreview} alt="logo" style={{width:"100%",height:"100%",objectFit:"contain"}}/>
                  :<Building2 size={32} color={C.muted}/>}
              </div>
              <div>
                <input type="file" id="logo-upload" accept="image/jpeg,image/png,image/webp"
                  style={{display:"none"}} onChange={e=>e.target.files[0]&&handleLogoUpload(e.target.files[0])}/>
                <label htmlFor="logo-upload"
                  style={{display:"inline-block",padding:"8px 16px",background:C.blue,color:"#fff",
                    borderRadius:8,cursor:"pointer",fontSize:12,fontWeight:700,marginBottom:6}}>
                  Upload Logo (JPG/PNG)
                </label>
                <div style={{fontSize:11,color:C.muted}}>Max 500KB. Displayed on login screen & reports.</div>
                {logoPreview&&(
                  <button onClick={async()=>{setLogoPreview(null);await db.setSetting("portal_logo_base64","");notify("Logo removed","warn");if(refreshLogo)refreshLogo();}}
                    style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:11,fontWeight:700,marginTop:4}}>
                    Remove logo
                  </button>
                )}
              </div>
            </div>
          </div>

          <SettingRow label="Organisation Name" desc="Full official name"><SettingInput settings={settings} onSet={set} k="school_name" placeholder="Your Business"/></SettingRow>
          <SettingRow label="Organization Address" desc="Physical address on official documents"><SettingInput settings={settings} onSet={set} k="school_address" placeholder="Enter the confirmed organisation address"/></SettingRow>
          <SettingRow label="Phone Number" desc="Main contact number"><SettingInput settings={settings} onSet={set} k="school_phone" placeholder="+234 800 000 0000"/></SettingRow>
          <SettingRow label="Organization Motto" desc="Optional tagline on supported organisation documents"><SettingInput settings={settings} onSet={set} k="school_motto" placeholder="Built for Progress"/></SettingRow>

          <div style={{display:"flex",justifyContent:"flex-end",marginTop:16}}>
            <Btn onClick={()=>saveTab(["school_name","school_address","school_phone","school_motto"])} color={C.orange} disabled={saving}>
              {saving?"Saving…":"Save Organization Info"}
            </Btn>
          </div>
        </Card>
      )}

      {/* ── SESSIONS & TERMS ── */}
      {tab==="sessions"&&educationSettings&&(
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <div>
              <div style={{fontWeight:900,color:C.blue,fontSize:15}}>Cycles & Periods</div>
              <div style={{color:C.muted,fontSize:12}}>Manage performance cycles and their periods</div>
            </div>
            <div style={{display:"flex",gap:8}}>
              <Btn sm onClick={()=>{setTermForm({name:"",session_id:sessions[0]?.id||"",is_active:false});setEditTermId(null);setTermModal(true);}} color={C.green} outline>+ Period</Btn>
              <Btn onClick={()=>{setSessForm({name:"",is_active:false});setEditSessId(null);setSessModal(true);}} color={C.orange}>+ Cycle</Btn>
            </div>
          </div>
          {sesLoading?<Spinner/>:sessions.length===0
            ?<Card style={{textAlign:"center",padding:40,color:C.light}}>No cycles yet. Add one above.</Card>
            :sessions.map(s=>{
              const sTerms=terms.filter(t=>t.session_id===s.id);
              return(
                <Card key={s.id} style={{marginBottom:14}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <div style={{fontWeight:900,fontSize:15,color:C.blue}}>{s.name}</div>
                      {s.is_active&&<Badge color={C.green}>ACTIVE</Badge>}
                    </div>
                    <div style={{display:"flex",gap:6}}>
                      {!s.is_active&&<Btn sm onClick={()=>activateSession(s)} color={C.green} outline>Set Active</Btn>}
                      <Btn sm onClick={()=>{setSessForm({name:s.name,is_active:s.is_active});setEditSessId(s.id);setSessModal(true);}} color={C.blue} outline><Pencil size={13}/></Btn>
                      <Btn sm onClick={()=>delSession(s)} color={C.red} outline><Trash2 size={13}/></Btn>
                    </div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
                    {sTerms.map(t=>(
                      <div key={t.id} style={{background:t.is_active?C.greenPale:C.offWhite,borderRadius:9,
                        padding:"11px",border:`2px solid ${t.is_active?C.green:C.border}`}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                          <div style={{fontWeight:700,color:t.is_active?C.green:C.text}}>{t.name}</div>
                          <div style={{display:"flex",gap:4}}>
                            <Btn xs onClick={()=>{setTermForm({name:t.name,session_id:t.session_id,is_active:t.is_active});setEditTermId(t.id);setTermModal(true);}} color={C.blue} outline><Pencil size={13}/></Btn>
                            <Btn xs onClick={()=>delTerm(t.id,t.name)} color={C.red} outline><Trash2 size={13}/></Btn>
                          </div>
                        </div>
                        {t.is_active?<Badge color={C.green}>Currently Active</Badge>
                          :<Btn xs onClick={()=>activateTerm(t)} color={C.orange} style={{marginTop:6}}>Set Active</Btn>}
                      </div>
                    ))}
                    {!sTerms.length&&<div style={{color:C.light,fontSize:12,gridColumn:"1/-1"}}>No periods yet</div>}
                  </div>
                </Card>
              );
            })
          }
          {sessModal&&(
            <Modal title={editSessId?"Edit Cycle":"New Cycle"} onClose={()=>setSessModal(false)}>
              <Inp label="Cycle Name *" value={sessForm.name} onChange={v=>setSessForm(p=>({...p,name:v}))} placeholder="e.g. 2025/2026"/>
              <div style={{display:"flex",gap:10,marginTop:6}}>
                <Btn onClick={saveSession} color={C.orange} style={{flex:1}}>Save</Btn>
                <Btn onClick={()=>setSessModal(false)} color={C.muted} outline style={{flex:1}}>Cancel</Btn>
              </div>
            </Modal>
          )}
          {termModal&&(
            <Modal title={editTermId?"Edit Period":"New Period"} onClose={()=>setTermModal(false)}>
              <Sel label="Cycle *" value={termForm.session_id||""} onChange={v=>setTermForm(p=>({...p,session_id:v}))}
                options={sessions.map(s=>({value:s.id,label:s.name}))}/>
              <Inp label="Period Name *" value={termForm.name} onChange={v=>setTermForm(p=>({...p,name:v}))} placeholder="e.g. 1st Period"/>
              <div style={{display:"flex",gap:10,marginTop:6}}>
                <Btn onClick={saveTerm} color={C.orange} style={{flex:1}}>Save</Btn>
                <Btn onClick={()=>setTermModal(false)} color={C.muted} outline style={{flex:1}}>Cancel</Btn>
              </div>
            </Modal>
          )}
        </div>
      )}

      {/* ── ACADEMIC ── */}
      {tab==="academic"&&educationSettings&&(
        <Card>
          <div style={{fontWeight:900,color:C.blue,fontSize:15,marginBottom:4}}>Academic Score Settings</div>
          <p style={{color:C.muted,fontSize:12,marginBottom:16}}>Configure scoring rules (CA / Exam maximums).</p>
          <SettingRow label="CA Score Maximum" desc="Max marks for Continuous Assessment (default: 40)">
            <input type="number" value={settings.result_ca_max||40} onChange={e=>set("result_ca_max",e.target.value)}
              style={{width:"100%",padding:"9px 12px",border:`2px solid ${C.border}`,borderRadius:8,fontSize:13,outline:"none",background:C.white,color:C.text}}
              onFocus={e=>e.target.style.borderColor=C.orange} onBlur={e=>e.target.style.borderColor=C.border}/>
          </SettingRow>
          <SettingRow label="Exam Score Maximum" desc="Max marks for main exam (default: 60)">
            <input type="number" value={settings.result_exam_max||60} onChange={e=>set("result_exam_max",e.target.value)}
              style={{width:"100%",padding:"9px 12px",border:`2px solid ${C.border}`,borderRadius:8,fontSize:13,outline:"none",background:C.white,color:C.text}}
              onFocus={e=>e.target.style.borderColor=C.orange} onBlur={e=>e.target.style.borderColor=C.border}/>
          </SettingRow>
          <div style={{background:C.offWhite,borderRadius:10,padding:"14px 16px",marginTop:14}}>
            <div style={{fontWeight:700,fontSize:13,color:C.muted,marginBottom:8}}>Score Preview</div>
            <div style={{display:"flex",gap:8,alignItems:"center",fontSize:13}}>
              <span style={{background:C.orangePale,color:C.orange,padding:"4px 12px",borderRadius:8,fontWeight:700}}>CA: {settings.result_ca_max||40}</span>
              <span style={{color:C.muted}}>+</span>
              <span style={{background:C.bluePale,color:C.blue,padding:"4px 12px",borderRadius:8,fontWeight:700}}>Exam: {settings.result_exam_max||60}</span>
              <span style={{color:C.muted}}>=</span>
              <span style={{background:C.greenPale,color:C.green,padding:"4px 12px",borderRadius:8,fontWeight:700}}>Total: {(+settings.result_ca_max||40)+(+settings.result_exam_max||60)}</span>
            </div>
          </div>
          <div style={{background:C.offWhite,borderRadius:8,padding:"10px 14px",marginTop:4,display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:11,color:C.muted}}>Report card appearance, signatures, stamps, fonts, dates and templates are managed in</span>
            <Btn onClick={()=>setPage("report-card-settings")} color={C.blue} outline style={{fontSize:11,padding:"4px 10px"}}>Report Settings</Btn>
          </div>
          <div style={{display:"flex",justifyContent:"flex-end",marginTop:16}}>
            <Btn onClick={()=>saveTab(["result_ca_max","result_exam_max"])} color={C.orange} disabled={saving}>
              {saving?"Saving…":"Save Performance Settings"}
            </Btn>
          </div>
        </Card>
      )}

      {/* ── JD CONNECT ── */}
      {tab==="integrations"&&<JDConnectPanel notify={notify}/>}

      {/* ── SECURITY ── */}
      {tab==="security"&&(
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <Card>
            <div style={{fontWeight:900,color:C.blue,fontSize:15,marginBottom:4}}>Session Security</div>
            <p style={{color:C.muted,fontSize:12,marginBottom:16}}>Control automatic sign-out behaviour for all portal users.</p>
            <SettingRow label="Inactivity Timeout" desc="Users are warned 1 minute before being signed out. Applies to all staff, managers, and members. Administrator sessions are not affected.">
              <select
                value={settings.inactivity_timeout_minutes||"5"}
                onChange={e=>set("inactivity_timeout_minutes",e.target.value)}
                style={{width:"100%",padding:"8px 12px",border:`2px solid ${C.border}`,borderRadius:8,fontSize:13,background:"#fff",outline:"none",cursor:"pointer"}}>
                {[["5","5 minutes (default)"],["10","10 minutes"],["15","15 minutes"],["20","20 minutes"],["30","30 minutes"],["60","1 hour"],["0","Never (auto-logout disabled)"]].map(([v,l])=>(
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </SettingRow>
            <div style={{display:"flex",justifyContent:"flex-end",marginTop:16}}>
              <Btn onClick={()=>saveTab(["inactivity_timeout_minutes"])} color={C.orange} disabled={saving}>
                {saving?"Saving…":"Save Session Settings"}
              </Btn>
            </div>
          </Card>
          <Card>
            <div style={{fontWeight:900,color:C.blue,fontSize:15,marginBottom:4}}>Admin Password</div>
            <p style={{color:C.muted,fontSize:12,marginBottom:16}}>Change the admin portal login password.</p>
            <div style={{maxWidth:400}}>
              <div style={{marginBottom:13}}>
                <label style={{display:"block",fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:4}}>New Password</label>
                <div style={{position:"relative"}}>
                  <input type={showPass?"text":"password"} value={newPass} onChange={e=>setNewPass(e.target.value)}
                    placeholder="Min. 6 characters"
                    style={{display:"block",width:"100%",padding:"9px 40px 9px 12px",border:`2px solid ${C.border}`,borderRadius:8,fontSize:13,outline:"none"}}
                    onFocus={e=>e.target.style.borderColor=C.orange} onBlur={e=>e.target.style.borderColor=C.border}/>
                  <button onClick={()=>setShowPass(p=>!p)}
                    style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",fontSize:16,color:C.muted}}>
                    {showPass?"Hide":"Show"}
                  </button>
                </div>
              </div>
              <div style={{marginBottom:13}}>
                <label style={{display:"block",fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:4}}>Confirm Password</label>
                <input type="password" value={confirmPass} onChange={e=>setConfirmPass(e.target.value)}
                  placeholder="Repeat password"
                  style={{display:"block",width:"100%",padding:"9px 12px",
                    border:`2px solid ${confirmPass&&confirmPass!==newPass?C.red:C.border}`,
                    borderRadius:8,fontSize:13,outline:"none"}}/>
                {confirmPass&&confirmPass!==newPass&&<p style={{color:C.red,fontSize:11,marginTop:4}}>Passwords do not match</p>}
              </div>
              <Btn onClick={changePassword} color={C.orange} disabled={saving||!newPass}>{saving?"Saving…":"Change Password"}</Btn>
            </div>
          </Card>
          <Card style={{borderLeft:`4px solid ${C.red}`}}>
            <div style={{fontWeight:900,color:C.red,fontSize:14,marginBottom:8}}>Danger Zone</div>
            <p style={{fontSize:12,color:C.muted,marginBottom:12}}>These actions are irreversible. Proceed with extreme caution.</p>
            <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
              {educationSettings&&<DangerBtn label="Clear All Results" icon={<Trash2 size={14}/>} typePhrase="DELETE RESULTS"
                onClick={async()=>{
                  const {error}=await db.clearAllResults();
                  if(error)notify(error.message,"error"); else notify("All results for this organization deleted","warn");
                }}/>}
              <DangerBtn label="Clear All Payments" icon={<Trash2 size={14}/>} typePhrase="DELETE PAYMENTS"
                onClick={async()=>{
                  const {error}=await db.clearAllPayments();
                  if(error)notify(error.message,"error"); else notify("All payments for this organization deleted","warn");
                }}/>
            </div>
          </Card>
        </div>
      )}

      {/* ── PORTAL ── */}
      {tab==="portal"&&(
        <Card>
          <div style={{fontWeight:900,color:C.blue,fontSize:15,marginBottom:4}}>Portal Preferences</div>
          <p style={{color:C.muted,fontSize:12,marginBottom:16}}>Control portal behaviour and notifications.</p>

          {/* ── Login Access Control ──────────────────────────────────────── */}
          {educationSettings&&<div style={{background:C.offWhite,border:`1px solid ${C.border}`,borderRadius:12,marginBottom:16,overflow:"hidden"}}>
            <div style={{padding:"12px 16px",background:C.redPale,borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:8}}>
              <Shield size={15} color={C.red}/>
              <span style={{fontWeight:800,fontSize:13,color:C.red}}>Login Access Control</span>
              <span style={{marginLeft:"auto",fontSize:10,color:C.red,fontWeight:600,opacity:.7}}>Changes take effect immediately</span>
            </div>
            <div style={{padding:"12px 16px",borderBottom:`1px solid ${C.border}`}}>
              <div style={{fontSize:12,color:C.muted,marginBottom:12,lineHeight:1.6}}>
                Disable logins for specific user groups. Blocked users will see the message below when they try to sign in.
                Admin logins are never affected — the admin can always sign in.
              </div>
              {[
                {key:"login_students_disabled",   label:"Disable Member Logins",  desc:"All members will be blocked from signing in.", color:C.orange},
                {key:"login_teachers_disabled",   label:"Disable Staff Logins",    desc:"All staff and managers will be blocked from signing in.", color:C.blue},
              ].map(({key,label,desc,color},i,arr)=>{
                const on=settings[key]==="true";
                return(
                  <div key={key} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",
                    borderBottom:i<arr.length-1?`1px solid ${C.border}`:"none"}}>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:700,fontSize:12,color:on?color:C.text,display:"flex",alignItems:"center",gap:6}}>
                        {on&&<span style={{width:7,height:7,borderRadius:"50%",background:color,display:"inline-block",flexShrink:0}}/>}
                        {label}
                      </div>
                      <div style={{fontSize:10,color:C.muted,marginTop:2}}>{desc}</div>
                    </div>
                    <SettingToggle k={key} settings={settings} onSet={async(k,v)=>{
                      await db.setSetting(k,v);
                      set(k,v);
                      notify(`${label} ${v==="true"?"ENABLED — users will be blocked":"DISABLED — users can now log in"} ✓`,"info");
                    }}/>
                  </div>
                );
              })}
            </div>
            <div style={{padding:"12px 16px"}}>
              <div style={{fontWeight:700,fontSize:12,color:C.text,marginBottom:6}}>Custom Blocked Login Message <span style={{fontWeight:400,color:C.muted}}>(optional)</span></div>
              <div style={{fontSize:10,color:C.muted,marginBottom:8}}>Shown to blocked users instead of the default message. Leave blank to use the default.</div>
              <textarea
                rows={2}
                value={settings.login_disabled_message||""}
                onChange={e=>setSettings(p=>({...p,login_disabled_message:e.target.value}))}
                onBlur={async e=>{await db.setSetting("login_disabled_message",e.target.value.trim());notify("Login message saved ✓");}}
                placeholder="e.g. The portal is closed for the end-of-period period. Please check back after resumption."
                style={{width:"100%",padding:"9px 12px",border:`1.5px solid ${C.border}`,borderRadius:8,
                  fontSize:12,background:C.white,color:C.text,resize:"vertical",fontFamily:"inherit",
                  lineHeight:1.5,boxSizing:"border-box"}}
              />
            </div>
          </div>}

          {educationSettings&&<SettingRow label="Block Reports for Owing Members"
            desc="When enabled, members with any outstanding billing balance — even partial — cannot view or download their report card until the balance is cleared. Admins are never blocked.">
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              <SettingToggle settings={settings} onSet={set} k="block_reports_if_owing"/>
              {settings.block_reports_if_owing==="true"&&(
                <div style={{fontSize:11,color:C.red,background:C.redPale,padding:"6px 10px",borderRadius:6,border:"1px solid #fecaca"}}>
                  🔒 Active — Members with any unpaid balance will see a billing-owing notice instead of their report card.
                </div>
              )}
            </div>
          </SettingRow>}
          <div style={{padding:"8px 0",borderBottom:`1px solid ${C.border}`}}/>
          <SettingRow label="Rows Per Page" desc="How many members (or staff) to show per page in list tables. Applies immediately.">
            <select
              defaultValue={localStorage.getItem('rgs_rows_per_page')||'50'}
              onChange={e=>{localStorage.setItem('rgs_rows_per_page',e.target.value);notify(`Rows per page set to ${e.target.value} — refresh the page you're on to see it take effect`);}}
              style={{width:"100%",padding:"9px 12px",border:`2px solid ${C.border}`,borderRadius:8,fontSize:13,background:"#fff",color:C.text,cursor:"pointer"}}>
              {[25,50,100,200,500,1000].map(n=><option key={n} value={n}>{n} rows per page{n===50?" (default)":n===1000?" (max)":""}</option>)}
            </select>
          </SettingRow>
          <div style={{padding:"8px 0",borderBottom:`1px solid ${C.border}`}}/>
          <SettingRow label="Member Name Order" desc="Controls how names appear in people lists, invoices and supported documents.">
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {[{v:"FML",l:"First, Middle, Last (default)"},{v:"LFM",l:"Last, First, Middle"}].map(o=>(
                <label key={o.v} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",
                  border:`2px solid ${(settings.name_order||"FML")===o.v?C.orange:C.border}`,
                  borderRadius:8,cursor:"pointer",background:(settings.name_order||"FML")===o.v?"#fff7f0":"#fff"}}>
                  <input type="radio" checked={(settings.name_order||"FML")===o.v}
                    onChange={()=>set("name_order",o.v)} style={{accentColor:C.orange}}/>
                  <span style={{fontSize:13}}>{o.l}</span>
                </label>
              ))}
            </div>
          </SettingRow>
          <SettingRow label="Member Name Capitalization" desc="How member names are capitalised in all portal displays.">
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {[{v:"title",l:"Title Case — First Letter Capitalised (default)"},{v:"upper",l:"ALL CAPS"},{v:"lower",l:"lowercase"}].map(o=>(
                <label key={o.v} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",
                  border:`2px solid ${(settings.name_case||"title")===o.v?C.orange:C.border}`,
                  borderRadius:8,cursor:"pointer",background:(settings.name_case||"title")===o.v?"#fff7f0":"#fff"}}>
                  <input type="radio" checked={(settings.name_case||"title")===o.v}
                    onChange={()=>set("name_case",o.v)} style={{accentColor:C.orange}}/>
                  <span style={{fontSize:13}}>{o.l}</span>
                </label>
              ))}
            </div>
          </SettingRow>
          {(settings.name_order||settings.name_case)&&(
            <div style={{background:C.bluePale,border:`1px solid ${C.blue}33`,borderRadius:8,padding:"8px 14px",marginBottom:8,fontSize:12,color:C.blue}}>
              Preview: <strong>{_applyNameCase(
                (settings.name_order||"FML")==="LFM"?"Doe John Michael":"John Michael Doe",
                settings.name_case||"title"
              )}</strong>
            </div>
          )}
          <SettingRow label="Recycle Bin Retention" desc="How long deleted items are kept in the Recycle Bin before being permanently purged. Applies to members, staff, groups, sections, and categories.">
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {[7,14,30,60,90].map(d=>{
                const active=(settings.recycle_bin_retention_days||"30")===String(d);
                return(
                  <button key={d} onClick={()=>set("recycle_bin_retention_days",String(d))}
                    style={{padding:"7px 14px",borderRadius:8,border:`2px solid ${active?C.orange:C.border}`,
                      background:active?"#fff7f0":C.white,color:active?C.orange:C.text,
                      fontWeight:active?700:500,fontSize:12,cursor:"pointer"}}>
                    {d} days{d===30?" (default)":""}
                  </button>
                );
              })}
            </div>
          </SettingRow>
          <div style={{marginTop:12,display:"flex",justifyContent:"flex-end"}}>
            <Btn onClick={async()=>{
              const saved=await saveTab([...(educationSettings?["login_students_disabled","login_teachers_disabled","login_disabled_message","block_reports_if_owing"]:[]),"name_order","name_case","recycle_bin_retention_days"]);
              if(saved)setNameSettings({order:settings.name_order||"FML",casing:settings.name_case||"title"});
            }} color={C.orange} disabled={saving}>
              {saving?"Saving…":"Save Portal Settings"}
            </Btn>
          </div>
          <div style={{marginTop:16,padding:"14px 16px",background:C.offWhite,borderRadius:10}}>
            <div style={{fontWeight:700,color:C.muted,fontSize:12,marginBottom:10,textTransform:"uppercase",letterSpacing:.5}}>Portal Info</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,fontSize:12}}>
              {[["Portal Version",APP_VERSION],["Database","Supabase (PostgreSQL)"],["Configured project",configuredProjectLabel(supabase.supabaseUrl)],["Region","Not reported by this client"]].map(([k,v])=>(
                <div key={k} style={{background:C.white,borderRadius:7,padding:"8px 12px",border:`1px solid ${C.border}`}}>
                  <div style={{color:C.muted,fontSize:10,fontWeight:700,marginBottom:2,textTransform:"uppercase"}}>{k}</div>
                  <div style={{color:C.text,fontWeight:600}}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Notifications and Permissions are now standalone pages in the sidebar */}
      {tab==="notifications_unused"&&notifConfig&&(()=>{
        const nc=notifConfig;
        const setNc=v=>setNotifConfig(p=>({...p,...v}));
        const setEvt=(k,v)=>setNotifConfig(p=>({...p,events:{...(p.events||{}),[k]:v}}));

        const EVENTS=[
          {key:"role_change",      label:"Role / Permission Changed", severity:"critical",
           desc:"Fires when a staff member's role or individual permissions are changed."},
          {key:"failed_logins",    label:"Multiple Failed Logins",     severity:"critical",
           desc:`Fires when a user exceeds the threshold of failed login attempts (default: 5 within 10 min).`},
          {key:"pin_change",       label:"Admin PIN Changed",          severity:"critical",
           desc:"Fires when the organization administrator password is changed."},
          {key:"student_delete",   label:"Member Deleted",            severity:"warn",
           desc:"Fires when a member record is permanently deleted."},
          {key:"refund_issued",    label:"Billing Refund Issued",          severity:"warn",
           desc:"Fires when a payment refund is processed."},
          {key:"large_payment",    label:"Large Payment Recorded",     severity:"warn",
           desc:"Fires when a single payment exceeds ₦100,000."},
          {key:"report_published", label:"Reports Published",     severity:"info",
           desc:"Fires when a staff publishes report cards for a group."},
          {key:"access_request",   label:"Access Request Submitted",   severity:"info",
           desc:"Fires when a staff submits an access request."},
          {key:"student_request",  label:"Member Enrolment Request",  severity:"info",
           desc:"Fires when a staff submits a new member (manual or bulk) for admin approval."},
        ];

        const SEV_COLOR={critical:"#b91c1c",warn:"#d97706",info:"#1A4FA0"};
        const SEV_BG   ={critical:"#fef2f2",warn:"#fffbeb",info:"#eff6ff"};

        const saveNotif=async()=>{
          setNotifSaving(true);
          const{error}=await db.saveNotifConfig(nc);
          setNotifSaving(false);
          if(error) notify("Save failed: "+error.message,"error");
          else notify("Notification settings saved ✓");
        };

        const sendTest=async()=>{
          if(!nc.admin_email||!nc.admin_email.includes("@")){
            notify("Enter a valid admin email first","error"); return;
          }
          setTestSending(true);
          const html=buildAlertEmail(
            "Test Alert — Notifications Working",
            ["Organization: "+(settings.school_name||"Business Portal"),
             "Time: "+new Date().toLocaleString("en-NG"),
             "Sent by: "+ctx?.user?.full_name||"Admin",
             "Status: Active notifications are working correctly"],
            "info", settings.school_name||"Business Portal"
          );
          await db.sendAdminAlert({subject:"[Test] Portal Notification Alert",html,config:nc});
          setTestSending(false);
          notify("Test email sent to "+nc.admin_email+" ✓");
        };

        return(
          <Card>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
              <div>
                <div style={{fontWeight:900,color:C.blue,fontSize:15,display:"flex",alignItems:"center",gap:8}}>
                  <Bell size={16}/>Email Notification Alerts
                </div>
                <p style={{color:C.muted,fontSize:12,marginTop:4,marginBottom:0}}>
                  Automatic emails to the admin when critical events happen in the portal.
                </p>
              </div>
              <div style={{display:"flex",gap:8}}>
                <Btn onClick={sendTest} color={C.muted} outline disabled={testSending} style={{fontSize:12}}>
                  {testSending?"Sending…":"Send Test"}
                </Btn>
                <Btn onClick={saveNotif} color={C.orange} disabled={notifSaving}>
                  {notifSaving?"Saving…":"Save"}
                </Btn>
              </div>
            </div>

            <div style={{borderBottom:`1px solid ${C.border}`,margin:"16px 0"}}/>

            {/* Admin email */}
            <div style={{marginBottom:20}}>
              <label style={{display:"block",fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:6}}>
                Admin Alert Email *
              </label>
              <input value={nc.admin_email||""} onChange={e=>setNc({admin_email:e.target.value})}
                placeholder="admin@yourschool.com"
                style={{width:"100%",padding:"9px 12px",border:`2px solid ${C.border}`,borderRadius:8,
                  fontSize:13,background:C.white,boxSizing:"border-box",outline:"none"}}/>
              <div style={{fontSize:11,color:C.muted,marginTop:4}}>
                All alerts will be sent to this address. You can enter multiple addresses separated by commas.
              </div>
            </div>

            {/* Failed login threshold */}
            <div style={{marginBottom:20,display:"flex",alignItems:"center",gap:16}}>
              <div style={{flex:1}}>
                <label style={{display:"block",fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:4}}>
                  Failed Login Threshold
                </label>
                <div style={{fontSize:12,color:C.muted}}>Trigger alert after this many failed logins within 10 minutes.</div>
              </div>
              <input type="number" min={2} max={20}
                value={nc.failed_login_threshold||5}
                onChange={e=>setNc({failed_login_threshold:+e.target.value})}
                style={{width:70,padding:"8px 10px",border:`2px solid ${C.border}`,borderRadius:8,
                  fontSize:14,fontWeight:700,textAlign:"center",background:C.white,outline:"none"}}/>
            </div>

            <div style={{borderBottom:`1px solid ${C.border}`,margin:"0 0 16px"}}/>

            {/* Event toggles */}
            <div style={{fontWeight:700,fontSize:12,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:12}}>
              Events
            </div>
            <div style={{display:"grid",gap:10}}>
              {EVENTS.map(ev=>{
                const on=nc.events?.[ev.key]!==false; // default on
                return(
                  <div key={ev.key} style={{display:"flex",alignItems:"flex-start",gap:14,
                    padding:"12px 14px",borderRadius:8,border:`1px solid ${C.border}`,
                    background:on?C.white:C.offWhite,opacity:on?1:.7}}>
                    {/* Toggle */}
                    <button onClick={()=>setEvt(ev.key,!on)}
                      style={{flexShrink:0,marginTop:2,width:40,height:22,borderRadius:11,border:"none",
                        cursor:"pointer",background:on?C.green:"#cbd5e1",position:"relative",transition:"all .2s"}}>
                      <div style={{position:"absolute",top:3,left:on?20:3,width:16,height:16,
                        borderRadius:"50%",background:"#fff",transition:"all .2s",boxShadow:"0 1px 3px rgba(0,0,0,.2)"}}/>
                    </button>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
                        <span style={{fontWeight:700,fontSize:13,color:C.text}}>{ev.label}</span>
                        <span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:999,
                          background:SEV_BG[ev.severity],color:SEV_COLOR[ev.severity],textTransform:"uppercase",letterSpacing:.5}}>
                          {ev.severity}
                        </span>
                      </div>
                      <div style={{fontSize:12,color:C.muted,lineHeight:1.5}}>{ev.desc}</div>
                    </div>
                    <div style={{flexShrink:0,fontSize:12,fontWeight:700,color:on?C.green:C.muted,marginTop:3}}>
                      {on?"ON":"OFF"}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── SCHEDULED DIGEST ── */}
            {digestConfig&&(()=>{
              const dc=digestConfig;
              const setDc=v=>setDigestConfig(p=>({...p,...v}));

              const DAYS=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
              const DIGEST_EVENTS=[
                {key:"logins",    label:"Login Activity",        desc:"Login successes, failures, and logouts"},
                {key:"students",  label:"Member Changes",       desc:"Member records added, edited, or deleted"},
                {key:"staff",     label:"Staff & Role Changes",  desc:"Staff records, role changes, permission changes"},
                {key:"results",   label:"Results & Reports",     desc:"Result uploads, approvals, report card publishes"},
                {key:"fees",      label:"Billing & Payments",       desc:"Payments recorded, refunds, large transactions"},
                {key:"settings",  label:"Settings Changes",      desc:"Organization settings, passwords, config updates"},
                {key:"access",    label:"Access Requests",       desc:"Staff and member access requests"},
              ];

              const saveDigest=async()=>{
                setDigestSaving(true);
                const{error}=await db.saveDigestConfig(dc);
                setDigestSaving(false);
                if(error) notify("Save failed: "+error.message,"error");
                else notify("Digest schedule saved ✓");
              };

              const sendNow=async()=>{
                setDigestSending(true);
                const{data,error}=await db.triggerDigestNow();
                setDigestSending(false);
                if(error) notify("Failed: "+error.message,"error");
                else if(data?.skipped) notify("No activity to report in the selected period.","warn");
                else notify("Digest sent ✓ — check your inbox");
              };

              // friendly UTC hour display: show UTC and WAT (UTC+1)
              const fmtHour=h=>{
                const watH=(h+1)%24;
                return `${String(h).padStart(2,"0")}:00 UTC  (${String(watH).padStart(2,"0")}:00 WAT)`;
              };

              const allOn=!dc.events;
              const toggleEvt=k=>{
                if(allOn){
                  // switch from "all" to individual — disable just this one
                  const ev={};DIGEST_EVENTS.forEach(e=>{ev[e.key]=e.key!==k;});
                  setDc({events:ev});
                } else {
                  const ev={...(dc.events||{}),[k]:!(dc.events?.[k]!==false)};
                  // if all now on, collapse back to null
                  const allNowOn=DIGEST_EVENTS.every(e=>ev[e.key]!==false);
                  setDc({events:allNowOn?null:ev});
                }
              };

              return(
                <>
                  <div style={{borderBottom:`1px solid ${C.border}`,margin:"24px 0"}}/>

                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
                    <div>
                      <div style={{fontWeight:900,color:C.blue,fontSize:15,display:"flex",alignItems:"center",gap:8}}>
                        <Calendar size={16}/>Scheduled Activity Digest
                      </div>
                      <p style={{color:C.muted,fontSize:12,marginTop:4,marginBottom:0}}>
                        A summary of portal activity emailed to you on a schedule. Filter by event type and choose daily or weekly delivery.
                      </p>
                    </div>
                    <div style={{display:"flex",gap:8}}>
                      <Btn onClick={sendNow} color={C.muted} outline disabled={digestSending} style={{fontSize:12}}>
                        {digestSending?"Sending…":"Send Now"}
                      </Btn>
                      <Btn onClick={saveDigest} color={C.orange} disabled={digestSaving}>
                        {digestSaving?"Saving…":"Save"}
                      </Btn>
                    </div>
                  </div>

                  {/* Enable toggle */}
                  <div style={{display:"flex",alignItems:"center",gap:14,padding:"14px 16px",
                    borderRadius:10,border:`2px solid ${dc.enabled?C.blue:C.border}`,
                    background:dc.enabled?"#eff6ff":C.offWhite,marginBottom:16,cursor:"pointer"}}
                    onClick={()=>setDc({enabled:!dc.enabled})}>
                    <button style={{flexShrink:0,width:44,height:24,borderRadius:12,border:"none",
                      cursor:"pointer",background:dc.enabled?C.blue:"#cbd5e1",position:"relative",transition:"all .2s"}}>
                      <div style={{position:"absolute",top:4,left:dc.enabled?22:4,width:16,height:16,
                        borderRadius:"50%",background:"#fff",transition:"all .2s",boxShadow:"0 1px 3px rgba(0,0,0,.2)"}}/>
                    </button>
                    <div>
                      <div style={{fontWeight:700,fontSize:13,color:dc.enabled?C.blue:C.muted}}>
                        {dc.enabled?"Digest Enabled":"Digest Disabled"}
                      </div>
                      <div style={{fontSize:11,color:C.muted}}>
                        {dc.enabled?"Digest emails will be sent on the schedule below.":"Toggle to activate scheduled digest emails."}
                      </div>
                    </div>
                  </div>

                  {dc.enabled&&<>
                    {/* Recipient */}
                    <div style={{marginBottom:16}}>
                      <label style={{display:"block",fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:6}}>
                        Recipient Email
                      </label>
                      <input value={dc.recipient||""} onChange={e=>setDc({recipient:e.target.value})}
                        placeholder={`Leave blank to use alert email (${nc.admin_email||"not set"})`}
                        style={{width:"100%",padding:"9px 12px",border:`2px solid ${C.border}`,borderRadius:8,
                          fontSize:13,background:C.white,boxSizing:"border-box",outline:"none"}}/>
                      <div style={{fontSize:11,color:C.muted,marginTop:4}}>
                        Separate multiple addresses with commas. Defaults to the alert email above.
                      </div>
                    </div>

                    {/* Schedule row */}
                    <div style={{display:"flex",gap:12,marginBottom:16,flexWrap:"wrap"}}>
                      {/* Frequency */}
                      <div style={{flex:"1 1 160px"}}>
                        <label style={{display:"block",fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:6}}>
                          Frequency
                        </label>
                        <div style={{display:"flex",gap:0,borderRadius:8,overflow:"hidden",border:`2px solid ${C.border}`}}>
                          {["daily","weekly"].map(f=>(
                            <button key={f} onClick={()=>setDc({frequency:f})}
                              style={{flex:1,padding:"8px 0",border:"none",cursor:"pointer",fontWeight:700,fontSize:12,
                                background:dc.frequency===f?C.blue:"transparent",
                                color:dc.frequency===f?"#fff":C.muted,transition:"all .15s"}}>
                              {f.charAt(0).toUpperCase()+f.slice(1)}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Day of week — only for weekly */}
                      {dc.frequency==="weekly"&&(
                        <div style={{flex:"1 1 220px"}}>
                          <label style={{display:"block",fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:6}}>
                            Day of Week
                          </label>
                          <div style={{display:"flex",gap:4}}>
                            {DAYS.map((d,i)=>(
                              <button key={i} onClick={()=>setDc({day_of_week:i})}
                                style={{flex:1,padding:"6px 0",border:`2px solid ${dc.day_of_week===i?C.blue:C.border}`,
                                  borderRadius:6,cursor:"pointer",fontWeight:700,fontSize:11,
                                  background:dc.day_of_week===i?C.blue:"transparent",
                                  color:dc.day_of_week===i?"#fff":C.muted,transition:"all .15s"}}>
                                {d}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Time */}
                      <div style={{flex:"1 1 200px"}}>
                        <label style={{display:"block",fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:6}}>
                          Send Time
                        </label>
                        <select value={dc.utc_hour??6} onChange={e=>setDc({utc_hour:+e.target.value})}
                          style={{width:"100%",padding:"8px 10px",border:`2px solid ${C.border}`,borderRadius:8,
                            fontSize:13,background:C.white,outline:"none",cursor:"pointer"}}>
                          {Array.from({length:24},(_,h)=>(
                            <option key={h} value={h}>{fmtHour(h)}</option>
                          ))}
                        </select>
                        <div style={{fontSize:10,color:C.muted,marginTop:3}}>
                          WAT = West Africa Time (UTC+1, Nigeria)
                        </div>
                      </div>
                    </div>

                    {/* Last sent info */}
                    {dc.last_sent_at&&(
                      <div style={{fontSize:11,color:C.muted,marginBottom:12,display:"flex",alignItems:"center",gap:6}}>
                        <Clock size={12}/>
                        Last sent: {new Date(dc.last_sent_at).toLocaleString("en-NG",{dateStyle:"medium",timeStyle:"short"})}
                      </div>
                    )}

                    <div style={{borderBottom:`1px solid ${C.border}`,margin:"4px 0 16px"}}/>

                    {/* Event filter */}
                    <div style={{fontWeight:700,fontSize:12,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:10}}>
                      Include in Digest
                    </div>

                    {/* All events toggle */}
                    <div style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",borderRadius:8,
                      border:`2px solid ${allOn?C.blue:C.border}`,background:allOn?"#eff6ff":C.offWhite,
                      marginBottom:10,cursor:"pointer"}} onClick={()=>setDc({events:allOn?{}:null})}>
                      <div style={{width:16,height:16,borderRadius:4,border:`2px solid ${allOn?C.blue:C.border}`,
                        background:allOn?C.blue:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                        {allOn&&<div style={{width:8,height:8,borderRadius:2,background:"#fff"}}/>}
                      </div>
                      <div style={{fontWeight:700,fontSize:13,color:allOn?C.blue:C.text}}>
                        All Events <span style={{fontWeight:400,color:C.muted,fontSize:12}}>— include everything in the digest</span>
                      </div>
                    </div>

                    <div style={{display:"grid",gap:6}}>
                      {DIGEST_EVENTS.map(ev=>{
                        const on=allOn||(dc.events?.[ev.key]!==false);
                        return(
                          <div key={ev.key} onClick={()=>toggleEvt(ev.key)}
                            style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",
                              borderRadius:8,border:`1px solid ${C.border}`,
                              background:on?C.white:C.offWhite,cursor:"pointer",opacity:on?1:.65}}>
                            <div style={{width:16,height:16,borderRadius:4,border:`2px solid ${on?C.blue:C.border}`,
                              background:on?C.blue:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                              {on&&<div style={{width:8,height:8,borderRadius:2,background:"#fff"}}/>}
                            </div>
                            <div style={{flex:1}}>
                              <div style={{fontWeight:700,fontSize:13,color:C.text}}>{ev.label}</div>
                              <div style={{fontSize:11,color:C.muted}}>{ev.desc}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>}
                </>
              );
            })()}
          </Card>
        );
      })()}

      {tab==="permissions_unused"&&(
        <PermissionsPage ctx={ctx}/>
      )}
      </div>{/* end maxWidth wrapper */}
    </div>
  );
}


// printTranscript replaced by buildTranscriptHTML + openTranscriptPDF above TranscriptPage

// ─── NOTIFICATIONS PAGE ───────────────────────────────────────────────────────
export function NotificationsPage({ctx}){
  const {notify}=ctx;
  const [loading,setLoading]=useState(true);
  const [schoolName,setSchoolName]=useState("");
  const [notifConfig,setNotifConfig]=useState(null);
  const [notifSaving,setNotifSaving]=useState(false);
  const [testSending,setTestSending]=useState(false);
  const [digestConfig,setDigestConfig]=useState(null);
  const [digestSaving,setDigestSaving]=useState(false);
  const [digestSending,setDigestSending]=useState(false);

  const DEFAULT_DIGEST={enabled:false,recipient:"",utc_hour:6,frequency:"daily",day_of_week:1,events:null,last_sent_at:null};

  useEffect(()=>{
    Promise.all([db.getSettings(),db.getNotifConfig(),db.getDigestConfig()]).then(([st,nc,dc])=>{
      const m={};(st.data||[]).forEach(r=>{m[r.key]=r.value;});
      setSchoolName(m.school_name||"Business Portal");
      setNotifConfig(nc.data||{admin_email:"",events:{},failed_login_threshold:5});
      setDigestConfig(dc.data||DEFAULT_DIGEST);
      setLoading(false);
    });
  },[]);

  if(loading)return <Spinner/>;
  if(!notifConfig)return null;

  const nc=notifConfig;
  const setNc=v=>setNotifConfig(p=>({...p,...v}));
  const setEvt=(k,v)=>setNotifConfig(p=>({...p,events:{...(p.events||{}),[k]:v}}));

  const EVENTS=[
    {key:"role_change",      label:"Role / Permission Changed", severity:"critical",
     desc:"Fires when a staff member's role or individual permissions are changed."},
    {key:"failed_logins",    label:"Multiple Failed Logins",     severity:"critical",
     desc:`Fires when a user exceeds the threshold of failed login attempts (default: 5 within 10 min).`},
    {key:"pin_change",       label:"Admin PIN Changed",          severity:"critical",
     desc:"Fires when the organization administrator password is changed."},
    {key:"student_delete",   label:"Member Deleted",            severity:"warn",
     desc:"Fires when a member record is permanently deleted."},
    {key:"refund_issued",    label:"Billing Refund Issued",          severity:"warn",
     desc:"Fires when a payment refund is processed."},
    {key:"large_payment",    label:"Large Payment Recorded",     severity:"warn",
     desc:"Fires when a single payment exceeds ₦100,000."},
    {key:"report_published", label:"Reports Published",     severity:"info",
     desc:"Fires when a staff publishes report cards for a group."},
    {key:"access_request",   label:"Access Request Submitted",   severity:"info",
     desc:"Fires when a staff submits an access request."},
    {key:"student_request",  label:"Member Enrolment Request",  severity:"info",
     desc:"Fires when a staff submits a new member (manual or bulk) for admin approval."},
  ];

  const SEV_COLOR={critical:"#b91c1c",warn:"#d97706",info:"#1A4FA0"};
  const SEV_BG   ={critical:"#fef2f2",warn:"#fffbeb",info:"#eff6ff"};

  const saveNotif=async()=>{
    setNotifSaving(true);
    const{error}=await db.saveNotifConfig(nc);
    setNotifSaving(false);
    if(error)notify("Save failed: "+error.message,"error");
    else notify("Notification settings saved ✓");
  };

  const sendTest=async()=>{
    if(!nc.admin_email||!nc.admin_email.includes("@")){notify("Enter a valid admin email first","error");return;}
    setTestSending(true);
    const html=buildAlertEmail(
      "Test Alert — Notifications Working",
      ["Organization: "+schoolName,"Time: "+new Date().toLocaleString("en-NG"),
       "Sent by: "+(ctx?.user?.full_name||"Admin"),"Status: Active notifications are working correctly"],
      "info",schoolName
    );
    await db.sendAdminAlert({subject:"[Test] Portal Notification Alert",html,config:nc});
    setTestSending(false);
    notify("Test email sent to "+nc.admin_email+" ✓");
  };

  const DAYS=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const DIGEST_EVENTS=[
    {key:"logins",    label:"Login Activity",        desc:"Login successes, failures, and logouts"},
    {key:"students",  label:"Member Changes",        desc:"Member records added, edited, or deleted"},
    {key:"staff",     label:"Staff & Role Changes",   desc:"Staff records, role changes, permission changes"},
    {key:"results",   label:"Results & Reports",      desc:"Result uploads, approvals, report card publishes"},
    {key:"fees",      label:"Billing & Payments",        desc:"Payments recorded, refunds, large transactions"},
    {key:"settings",  label:"Settings Changes",       desc:"Organization settings, passwords, config updates"},
    {key:"access",    label:"Access Requests",        desc:"Staff and member access requests"},
  ];

  return(
    <div style={{maxWidth:760,margin:"0 auto",paddingBottom:40}}>
      {/* Page header */}
      <div style={{background:`linear-gradient(135deg,${C.blue},${C.blueDark})`,
        padding:"20px 28px",marginBottom:24,display:"flex",alignItems:"center",gap:16,borderRadius:14}}>
        <div style={{background:"rgba(255,255,255,.18)",borderRadius:10,padding:10,display:"flex"}}>
          <Bell size={22} color="#fff"/>
        </div>
        <div>
          <h2 style={{color:"#fff",fontWeight:900,fontSize:18,margin:0}}>Notifications</h2>
          <p style={{color:"rgba(255,255,255,.75)",fontSize:12,margin:"2px 0 0"}}>
            Email alerts and activity digest for portal events
          </p>
        </div>
      </div>

      <Card>
        {/* Header row */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
          <div>
            <div style={{fontWeight:900,color:C.blue,fontSize:15,display:"flex",alignItems:"center",gap:8}}>
              <Bell size={16}/>Email Notification Alerts
            </div>
            <p style={{color:C.muted,fontSize:12,marginTop:4,marginBottom:0}}>
              Automatic emails to the admin when critical events happen in the portal.
            </p>
          </div>
          <div style={{display:"flex",gap:8}}>
            <Btn onClick={sendTest} color={C.muted} outline disabled={testSending} style={{fontSize:12}}>
              {testSending?"Sending…":"Send Test"}
            </Btn>
            <Btn onClick={saveNotif} color={C.orange} disabled={notifSaving}>
              {notifSaving?"Saving…":"Save"}
            </Btn>
          </div>
        </div>

        <div style={{borderBottom:`1px solid ${C.border}`,margin:"16px 0"}}/>

        {/* Admin email */}
        <div style={{marginBottom:20}}>
          <label style={{display:"block",fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:6}}>
            Admin Alert Email *
          </label>
          <input value={nc.admin_email||""} onChange={e=>setNc({admin_email:e.target.value})}
            placeholder="admin@yourschool.com"
            style={{width:"100%",padding:"9px 12px",border:`2px solid ${C.border}`,borderRadius:8,
              fontSize:13,background:C.white,boxSizing:"border-box",outline:"none"}}/>
          <div style={{fontSize:11,color:C.muted,marginTop:4}}>
            All alerts will be sent to this address. You can enter multiple addresses separated by commas.
          </div>
        </div>

        {/* Failed login threshold */}
        <div style={{marginBottom:20,display:"flex",alignItems:"center",gap:16}}>
          <div style={{flex:1}}>
            <label style={{display:"block",fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:4}}>
              Failed Login Threshold
            </label>
            <div style={{fontSize:12,color:C.muted}}>Trigger alert after this many failed logins within 10 minutes.</div>
          </div>
          <input type="number" min={2} max={20}
            value={nc.failed_login_threshold||5}
            onChange={e=>setNc({failed_login_threshold:+e.target.value})}
            style={{width:70,padding:"8px 10px",border:`2px solid ${C.border}`,borderRadius:8,
              fontSize:14,fontWeight:700,textAlign:"center",background:C.white,outline:"none"}}/>
        </div>

        <div style={{borderBottom:`1px solid ${C.border}`,margin:"0 0 16px"}}/>

        {/* Event toggles */}
        <div style={{fontWeight:700,fontSize:12,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:12}}>
          Events
        </div>
        <div style={{display:"grid",gap:10}}>
          {EVENTS.map(ev=>{
            const on=nc.events?.[ev.key]!==false;
            return(
              <div key={ev.key} style={{display:"flex",alignItems:"flex-start",gap:14,
                padding:"12px 14px",borderRadius:8,border:`1px solid ${C.border}`,
                background:on?C.white:C.offWhite,opacity:on?1:.7}}>
                <button onClick={()=>setEvt(ev.key,!on)}
                  style={{flexShrink:0,marginTop:2,width:40,height:22,borderRadius:11,border:"none",
                    cursor:"pointer",background:on?C.green:"#cbd5e1",position:"relative",transition:"all .2s"}}>
                  <div style={{position:"absolute",top:3,left:on?20:3,width:16,height:16,
                    borderRadius:"50%",background:"#fff",transition:"all .2s",boxShadow:"0 1px 3px rgba(0,0,0,.2)"}}/>
                </button>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
                    <span style={{fontWeight:700,fontSize:13,color:C.text}}>{ev.label}</span>
                    <span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:999,
                      background:SEV_BG[ev.severity],color:SEV_COLOR[ev.severity],textTransform:"uppercase",letterSpacing:.5}}>
                      {ev.severity}
                    </span>
                  </div>
                  <div style={{fontSize:12,color:C.muted,lineHeight:1.5}}>{ev.desc}</div>
                </div>
                <div style={{flexShrink:0,fontSize:12,fontWeight:700,color:on?C.green:C.muted,marginTop:3}}>
                  {on?"ON":"OFF"}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── SCHEDULED DIGEST ── */}
        {digestConfig&&(()=>{
          const dc=digestConfig;
          const setDc=v=>setDigestConfig(p=>({...p,...v}));

          const allOn=!dc.events;
          const toggleEvt=k=>{
            if(allOn){
              const ev={};DIGEST_EVENTS.forEach(e=>{ev[e.key]=e.key!==k;});
              setDc({events:ev});
            } else {
              const ev={...(dc.events||{}),[k]:!(dc.events?.[k]!==false)};
              const allNowOn=DIGEST_EVENTS.every(e=>ev[e.key]!==false);
              setDc({events:allNowOn?null:ev});
            }
          };

          const saveDigest=async()=>{
            setDigestSaving(true);
            const{error}=await db.saveDigestConfig(dc);
            setDigestSaving(false);
            if(error)notify("Save failed: "+error.message,"error");
            else notify("Digest schedule saved ✓");
          };

          const sendNow=async()=>{
            setDigestSending(true);
            const{data,error}=await db.triggerDigestNow();
            setDigestSending(false);
            if(error)notify("Failed: "+error.message,"error");
            else if(data?.skipped)notify("No activity to report in the selected period.","warn");
            else notify("Digest sent ✓ — check your inbox");
          };

          const fmtHour=h=>{
            const watH=(h+1)%24;
            return `${String(h).padStart(2,"0")}:00 UTC  (${String(watH).padStart(2,"0")}:00 WAT)`;
          };

          return(
            <>
              <div style={{borderBottom:`1px solid ${C.border}`,margin:"24px 0"}}/>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
                <div>
                  <div style={{fontWeight:900,color:C.blue,fontSize:15,display:"flex",alignItems:"center",gap:8}}>
                    <Calendar size={16}/>Scheduled Activity Digest
                  </div>
                  <p style={{color:C.muted,fontSize:12,marginTop:4,marginBottom:0}}>
                    A summary of portal activity emailed to you on a schedule.
                  </p>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <Btn onClick={sendNow} color={C.muted} outline disabled={digestSending} style={{fontSize:12}}>
                    {digestSending?"Sending…":"Send Now"}
                  </Btn>
                  <Btn onClick={saveDigest} color={C.orange} disabled={digestSaving}>
                    {digestSaving?"Saving…":"Save"}
                  </Btn>
                </div>
              </div>

              {/* Enable toggle */}
              <div style={{display:"flex",alignItems:"center",gap:14,padding:"14px 16px",
                borderRadius:10,border:`2px solid ${dc.enabled?C.blue:C.border}`,
                background:dc.enabled?"#eff6ff":C.offWhite,marginBottom:16,cursor:"pointer"}}
                onClick={()=>setDc({enabled:!dc.enabled})}>
                <button style={{flexShrink:0,width:44,height:24,borderRadius:12,border:"none",
                  cursor:"pointer",background:dc.enabled?C.blue:"#cbd5e1",position:"relative",transition:"all .2s"}}>
                  <div style={{position:"absolute",top:4,left:dc.enabled?22:4,width:16,height:16,
                    borderRadius:"50%",background:"#fff",transition:"all .2s",boxShadow:"0 1px 3px rgba(0,0,0,.2)"}}/>
                </button>
                <div>
                  <div style={{fontWeight:700,fontSize:13,color:dc.enabled?C.blue:C.muted}}>
                    {dc.enabled?"Digest Enabled":"Digest Disabled"}
                  </div>
                  <div style={{fontSize:11,color:C.muted}}>
                    {dc.enabled?"Digest emails will be sent on the schedule below.":"Toggle to activate scheduled digest emails."}
                  </div>
                </div>
              </div>

              {dc.enabled&&<>
                <div style={{marginBottom:16}}>
                  <label style={{display:"block",fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:6}}>
                    Recipient Email
                  </label>
                  <input value={dc.recipient||""} onChange={e=>setDc({recipient:e.target.value})}
                    placeholder={`Leave blank to use alert email (${nc.admin_email||"not set"})`}
                    style={{width:"100%",padding:"9px 12px",border:`2px solid ${C.border}`,borderRadius:8,
                      fontSize:13,background:C.white,boxSizing:"border-box",outline:"none"}}/>
                  <div style={{fontSize:11,color:C.muted,marginTop:4}}>
                    Separate multiple addresses with commas.
                  </div>
                </div>

                <div style={{display:"flex",gap:12,marginBottom:16,flexWrap:"wrap"}}>
                  <div style={{flex:"1 1 160px"}}>
                    <label style={{display:"block",fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:6}}>
                      Frequency
                    </label>
                    <div style={{display:"flex",gap:0,borderRadius:8,overflow:"hidden",border:`2px solid ${C.border}`}}>
                      {["daily","weekly"].map(f=>(
                        <button key={f} onClick={()=>setDc({frequency:f})}
                          style={{flex:1,padding:"8px 0",border:"none",cursor:"pointer",fontWeight:700,fontSize:12,
                            background:dc.frequency===f?C.blue:"transparent",
                            color:dc.frequency===f?"#fff":C.muted,transition:"all .15s"}}>
                          {f.charAt(0).toUpperCase()+f.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                  {dc.frequency==="weekly"&&(
                    <div style={{flex:"1 1 220px"}}>
                      <label style={{display:"block",fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:6}}>
                        Day of Week
                      </label>
                      <div style={{display:"flex",gap:4}}>
                        {DAYS.map((d,i)=>(
                          <button key={i} onClick={()=>setDc({day_of_week:i})}
                            style={{flex:1,padding:"6px 0",border:`2px solid ${dc.day_of_week===i?C.blue:C.border}`,
                              borderRadius:6,cursor:"pointer",fontWeight:700,fontSize:11,
                              background:dc.day_of_week===i?C.blue:"transparent",
                              color:dc.day_of_week===i?"#fff":C.muted,transition:"all .15s"}}>
                            {d}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div style={{flex:"1 1 200px"}}>
                    <label style={{display:"block",fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:6}}>
                      Send Time
                    </label>
                    <select value={dc.utc_hour??6} onChange={e=>setDc({utc_hour:+e.target.value})}
                      style={{width:"100%",padding:"8px 10px",border:`2px solid ${C.border}`,borderRadius:8,
                        fontSize:13,background:C.white,outline:"none",cursor:"pointer"}}>
                      {Array.from({length:24},(_,h)=>(
                        <option key={h} value={h}>{fmtHour(h)}</option>
                      ))}
                    </select>
                    <div style={{fontSize:10,color:C.muted,marginTop:3}}>WAT = West Africa Time (UTC+1)</div>
                  </div>
                </div>

                {dc.last_sent_at&&(
                  <div style={{fontSize:11,color:C.muted,marginBottom:12,display:"flex",alignItems:"center",gap:6}}>
                    <Clock size={12}/>
                    Last sent: {new Date(dc.last_sent_at).toLocaleString("en-NG",{dateStyle:"medium",timeStyle:"short"})}
                  </div>
                )}

                <div style={{borderBottom:`1px solid ${C.border}`,margin:"4px 0 16px"}}/>
                <div style={{fontWeight:700,fontSize:12,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:10}}>
                  Include in Digest
                </div>
                <div style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",borderRadius:8,
                  border:`2px solid ${allOn?C.blue:C.border}`,background:allOn?"#eff6ff":C.offWhite,
                  marginBottom:10,cursor:"pointer"}} onClick={()=>setDc({events:allOn?{}:null})}>
                  <div style={{width:16,height:16,borderRadius:4,border:`2px solid ${allOn?C.blue:C.border}`,
                    background:allOn?C.blue:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    {allOn&&<div style={{width:8,height:8,borderRadius:2,background:"#fff"}}/>}
                  </div>
                  <div style={{fontWeight:700,fontSize:13,color:allOn?C.blue:C.text}}>
                    All Events <span style={{fontWeight:400,color:C.muted,fontSize:12}}>— include everything in the digest</span>
                  </div>
                </div>
                <div style={{display:"grid",gap:6}}>
                  {DIGEST_EVENTS.map(ev=>{
                    const on=allOn||(dc.events?.[ev.key]!==false);
                    return(
                      <div key={ev.key} onClick={()=>toggleEvt(ev.key)}
                        style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",
                          borderRadius:8,border:`1px solid ${C.border}`,
                          background:on?C.white:C.offWhite,cursor:"pointer",opacity:on?1:.65}}>
                        <div style={{width:16,height:16,borderRadius:4,border:`2px solid ${on?C.blue:C.border}`,
                          background:on?C.blue:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                          {on&&<div style={{width:8,height:8,borderRadius:2,background:"#fff"}}/>}
                        </div>
                        <div style={{flex:1}}>
                          <div style={{fontWeight:700,fontSize:13,color:C.text}}>{ev.label}</div>
                          <div style={{fontSize:11,color:C.muted}}>{ev.desc}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>}
            </>
          );
        })()}
      </Card>
    </div>
  );
}

// ─── REPORT CARDS PAGE ────────────────────────────────────────────────────────
