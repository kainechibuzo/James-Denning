/**
 * Settings domain: SettingsPage, NotificationsPage, SettingRow, SettingInput,
 * SettingToggle.
 */
import React, { useState, useEffect, useContext } from "react";
import { ArrowLeft, Bell, Building2, Calendar, Clock, Settings } from "lucide-react";
import { db, supabase } from "../supabaseClient.js";
import { discoveryRequest } from "../software-factory/discovery-client.mjs";
import { C } from "../config/theme.js";
import { OrganizationCtx } from "../contexts/organization.jsx";
import { Card, Btn, Badge, Spinner } from "../components/ui.jsx";
import { buildAlertEmail } from "../services/email/index.js";
import { PRODUCT, INDUSTRIES, MODULES, getIndustryLabel, storeWorkspaceType } from "../config/product.js";
import { ConnectorDirectory } from "../connectors/ConnectorDirectory.jsx";

import { configuredProjectLabel } from "../config/settings-presentation.mjs";

const APP_VERSION = PRODUCT.version;




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
        background:on?C.green:"var(--jd-border)",transition:"all .2s",position:"relative"}}>
      <div style={{position:"absolute",top:3,left:on?26:3,width:22,height:22,
        borderRadius:"50%",background:"var(--jd-card)",transition:"all .2s",boxShadow:"0 1px 4px rgba(0,0,0,.2)"}}/>
    </button>
  );
}

// ─── SETTINGS PAGE ────────────────────────────────────────────────────────────
export function SettingsPage({ctx}){
  const {notify,setPage}=ctx;
  const {refreshLogo,refreshWorkspace}=useContext(OrganizationCtx);
  const [settings,setSettings]=useState({});
  const [loading,setLoading]=useState(true);
  const [loadError,setLoadError]=useState(false);
  const [saving,setSaving]=useState(false);
  const [tab,setTab]=useState("workspace"); // workspace | organization | security | integrations | portal
  // Logo upload state
  const [logoPreview,setLogoPreview]=useState(null);


  const load=()=>{
    setLoading(true);setLoadError(false);
    db.getSettings().then(({data,error})=>{
      if(error||!Array.isArray(data))throw Error("Settings unavailable");
      const m={};
      (data||[]).forEach(r=>{m[r.key]=r.value;});
      setSettings(m);
      if(m.portal_logo_base64) setLogoPreview(m.portal_logo_base64);
    }).catch(()=>setLoadError(true)).finally(()=>setLoading(false));
  };
  useEffect(()=>{load();},[]);

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
    setSaving(true);
    try{
      const pairs=[{key:"workspace_type",value:workspaceType}];
      const {error}=await db.setSettings(pairs);
      if(error)throw Error();
      const {data,error:readError}=await db.getSettings();
      if(readError||!Array.isArray(data)||pairs.some(p=>!data.some(r=>r.key===p.key&&r.value===p.value)))throw Error();
      storeWorkspaceType(workspaceType);
      refreshWorkspace?.(workspaceType);
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

  const tabs=[
    {id:"workspace",     label:"Workspace"},
    {id:"organization",  label:"Organization Info"},
    {id:"autonomy",      label:"Agent Autonomy"},
    {id:"security",      label:"Security"},
    {id:"integrations",   label:"JD Connect"},
    {id:"portal",        label:"About"},
  ];

  // SettingRow, SettingInput, SettingToggle are defined at module scope above
  // to prevent focus-loss caused by component re-creation on every keystroke.

  if(loading)return <Spinner/>;
  if(loadError)return <div role="alert"><p>Organisation settings could not be loaded. No editable defaults have been substituted.</p><Btn onClick={load}>Reload settings</Btn></div>;

  return(
    <div style={{padding:"0 0 40px"}}>
      {/* ── Page header ── */}
      <div className="jd-page-header" style={{background:`linear-gradient(135deg,${C.blue},${C.blueDark})`,
        padding:"20px 28px",marginBottom:24,display:"flex",alignItems:"center",gap:16}}>
        <button onClick={()=>setPage&&setPage("jd-chat")}
          style={{background:"color-mix(in srgb, var(--jd-card) 18%, transparent)",border:"none",color:"var(--jd-card)",
            borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:12,fontWeight:700,
            display:"flex",alignItems:"center",gap:6}}>
          <ArrowLeft size={14}/> Back
        </button>
        <div style={{flex:1}}>
          <div style={{fontWeight:900,fontSize:20,color:"var(--jd-card)",display:"flex",alignItems:"center",gap:10}}>
            <Settings size={20} color={C.text} style={{opacity:.85}}/>Settings
          </div>
          <div style={{fontSize:12,color:"color-mix(in srgb, var(--jd-card) 70%, transparent)",marginTop:2}}>Configure your business portal</div>
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
              color:tab===t.id?"var(--jd-card)":C.muted,
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
          <Btn onClick={saveWorkspace} disabled={saving}>{saving?"Saving…":"Save Workspace Profile"}</Btn>
        </Card>
      )}

      {/* ── SCHOOL INFO ── */}
      {tab==="organization"&&(
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
                  style={{display:"inline-block",padding:"8px 16px",background:C.blue,color:"var(--jd-card)",
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

      {/* ── AGENT AUTONOMY ── */}
      {tab==="autonomy"&&<AgentAutonomyCard ctx={ctx} C={C} Card={Card} Btn={Btn} Badge={Badge}/>}

      {/* ── JD CONNECT ── */}
      {tab==="integrations"&&<ConnectorDirectory organizationName={ctx.selectedSchool?.name} role={ctx.user?.role}/>}

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
                style={{width:"100%",padding:"8px 12px",border:`2px solid ${C.border}`,borderRadius:8,fontSize:13,background:"var(--jd-card)",outline:"none",cursor:"pointer"}}>
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
        </div>
      )}

      {/* ── PORTAL ── */}
      {tab==="portal"&&(
        <Card>
          <div style={{fontWeight:900,color:C.blue,fontSize:15,marginBottom:4}}>About this workspace</div>
          <p style={{color:C.muted,fontSize:12,marginBottom:16}}>Version and backend details for this workspace.</p>

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

      </div>{/* end maxWidth wrapper */}
    </div>
  );
}



// ─── NOTIFICATIONS PAGE ───────────────────────────────────────────────────────
export function NotificationsPage({ctx}){
  const {notify}=ctx;
  const [loading,setLoading]=useState(true);
  const [orgName,setOrgName]=useState("");
  const [notifConfig,setNotifConfig]=useState(null);
  const [notifSaving,setNotifSaving]=useState(false);
  const [testSending,setTestSending]=useState(false);
  const [digestConfig,setDigestConfig]=useState(null);
  const [digestSaving,setDigestSaving]=useState(false);
  const [digestSending,setDigestSending]=useState(false);

  const DEFAULT_DIGEST={enabled:false,recipient:"",utc_hour:6,frequency:"daily",day_of_week:1,events:null,last_sent_at:null};

  useEffect(()=>{
    // The page is useless until this settles: a failed read must fall back to
    // defaults rather than leaving the whole settings page on its spinner.
    Promise.resolve().then(()=>Promise.all([db.getSettings(),db.getNotifConfig(),db.getDigestConfig()])).then(([st,nc,dc])=>{
      const m={};(st?.data||[]).forEach(r=>{m[r.key]=r.value;});
      setOrgName(m.school_name||"Business Portal");
      setNotifConfig(nc?.data||{admin_email:"",events:{},failed_login_threshold:5});
      setDigestConfig(dc?.data||DEFAULT_DIGEST);
    }).catch(error=>{
      setNotifConfig({admin_email:"",events:{},failed_login_threshold:5});
      setDigestConfig(DEFAULT_DIGEST);
      notify("Some settings could not be loaded. Defaults are shown.","error");
      console.warn("[JD] settings unavailable.",error?.message||error);
    }).finally(()=>setLoading(false));
  },[]);

  if(loading)return <Spinner/>;
  if(!notifConfig)return null;

  const nc=notifConfig;
  const setNc=v=>setNotifConfig(p=>({...p,...v}));
  const setEvt=(k,v)=>setNotifConfig(p=>({...p,events:{...(p.events||{}),[k]:v}}));

  const EVENTS=[
    {key:"role_change",      label:"Role / Permission Changed", severity:"critical",
     desc:"Fires when a team member's role or individual permissions are changed."},
    {key:"failed_logins",    label:"Multiple Failed Logins",     severity:"critical",
     desc:`Fires when a user exceeds the threshold of failed login attempts (default: 5 within 10 min).`},
  ];

  const SEV_COLOR={critical:"var(--jd-text-soft)",warn:"var(--jd-muted)",info:"var(--jd-text-soft)"};
  const SEV_BG   ={critical:"var(--jd-soft)",warn:"var(--jd-soft)",info:"var(--jd-soft)"};

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
      ["Organization: "+orgName,"Time: "+new Date().toLocaleString("en-NG"),
       "Sent by: "+(ctx?.user?.full_name||"Admin"),"Status: Active notifications are working correctly"],
      "info",orgName
    );
    await db.sendAdminAlert({subject:"[Test] Portal Notification Alert",html,config:nc});
    setTestSending(false);
    notify("Test email sent to "+nc.admin_email+" ✓");
  };

  const DAYS=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const DIGEST_EVENTS=[
    {key:"logins",    label:"Login Activity",        desc:"Login successes, failures, and logouts"},
    {key:"staff",     label:"Team & Role Changes",    desc:"Team members, role changes, permission changes"},
    {key:"settings",  label:"Settings Changes",       desc:"Organization settings and configuration updates"},
  ];

  return(
    <div style={{maxWidth:760,margin:"0 auto",paddingBottom:40}}>
      {/* Page header */}
      <div className="jd-page-header" style={{background:`linear-gradient(135deg,${C.blue},${C.blueDark})`,
        padding:"20px 28px",marginBottom:24,display:"flex",alignItems:"center",gap:16,borderRadius:14}}>
        <div style={{background:"color-mix(in srgb, var(--jd-card) 18%, transparent)",borderRadius:10,padding:10,display:"flex"}}>
          <Bell size={22} color={C.text}/>
        </div>
        <div>
          <h2 style={{color:"var(--jd-card)",fontWeight:900,fontSize:18,margin:0}}>Notifications</h2>
          <p style={{color:"color-mix(in srgb, var(--jd-card) 75%, transparent)",fontSize:12,margin:"2px 0 0"}}>
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
            placeholder="admin@yourcompany.com"
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
                    cursor:"pointer",background:on?C.green:"var(--jd-border)",position:"relative",transition:"all .2s"}}>
                  <div style={{position:"absolute",top:3,left:on?20:3,width:16,height:16,
                    borderRadius:"50%",background:"var(--jd-card)",transition:"all .2s",boxShadow:"0 1px 3px rgba(0,0,0,.2)"}}/>
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
                background:dc.enabled?"var(--jd-soft)":C.offWhite,marginBottom:16,cursor:"pointer"}}
                onClick={()=>setDc({enabled:!dc.enabled})}>
                <button style={{flexShrink:0,width:44,height:24,borderRadius:12,border:"none",
                  cursor:"pointer",background:dc.enabled?C.blue:"var(--jd-border)",position:"relative",transition:"all .2s"}}>
                  <div style={{position:"absolute",top:4,left:dc.enabled?22:4,width:16,height:16,
                    borderRadius:"50%",background:"var(--jd-card)",transition:"all .2s",boxShadow:"0 1px 3px rgba(0,0,0,.2)"}}/>
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
                            color:dc.frequency===f?"var(--jd-card)":C.muted,transition:"all .15s"}}>
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
                              color:dc.day_of_week===i?"var(--jd-card)":C.muted,transition:"all .15s"}}>
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
                  border:`2px solid ${allOn?C.blue:C.border}`,background:allOn?"var(--jd-soft)":C.offWhite,
                  marginBottom:10,cursor:"pointer"}} onClick={()=>setDc({events:allOn?{}:null})}>
                  <div style={{width:16,height:16,borderRadius:4,border:`2px solid ${allOn?C.blue:C.border}`,
                    background:allOn?C.blue:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    {allOn&&<div style={{width:8,height:8,borderRadius:2,background:"var(--jd-card)"}}/>}
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
                          {on&&<div style={{width:8,height:8,borderRadius:2,background:"var(--jd-card)"}}/>}
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

const AUTONOMY_ROLES = ["owner","admin"];

export function AgentAutonomyCard({ctx,C,Card,Btn,Badge}){
  const role=ctx?.user?.role;
  const isAdmin=AUTONOMY_ROLES.includes(role);
  const [autonomy,setAutonomy]=useState(null);
  const [mode,setMode]=useState("assisted");
  const [ceilingHours,setCeilingHours]=useState("1");
  const [ratePerHour,setRatePerHour]=useState("100.00");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const alive=useState(true);
  const load=async()=>{
    setBusy(true);setError("");
    try{
      const a=await discoveryRequest(supabase,role,{action:"autonomy.read"});
      if(alive[0]){setAutonomy(a);setMode(a.mode);setCeilingHours(String(Math.round(a.spend_ceiling_seconds/60)));setRatePerHour((a.agentic_rate_minor_per_hour/100).toFixed(2));}
    }catch(e){if(alive[0])setError(e.message||"The autonomy dial could not be read.");}
    finally{if(alive[0])setBusy(false);}
  };
  useEffect(()=>{if(isAdmin)load();return()=>{alive[0]=false;};},[]);
  const save=async()=>{
    setBusy(true);setError("");setNotice("");
    try{
      const ceilingSeconds=Math.round(parseFloat(ceilingHours||"0")*60);
      const rateMinor=Math.round(parseFloat(ratePerHour||"0")*100);
      const receipt=await discoveryRequest(supabase,role,{action:"autonomy.set",confirm:true,
        requestId:crypto.randomUUID(),mode,ceilingSeconds,rateMinorPerHour:rateMinor});
      setNotice(receipt.mode==="autonomous"
        ?"Autonomous mode saved. JD proceeds without per-run prompts — the spend ceiling, immutable metering and audit trail still apply."
        :"Assisted mode saved. Discovery proposals wait for an independent approval before anything is acquired or spent.");
      load();
    }catch(e){setError(e.message||"The autonomy dial could not be saved.");}
    finally{setBusy(false);}
  };
  if(!isAdmin)return <Card><p style={{color:C.muted,fontSize:13}}>Workspace administrator access is required to change the agent autonomy dial.</p></Card>;
  return <Card>
    <div style={{fontWeight:900,color:C.blue,fontSize:15,marginBottom:4}}>Agent Autonomy</div>
    <p style={{color:C.muted,fontSize:12,lineHeight:1.6,marginBottom:14}}>Controls whether the discovery agent asks before acting. Assisted: JD researches the work, then an independent administrator approves acquisition and spend. Autonomous: JD proceeds without per-run prompts — the spend ceiling below is a hard stop, every acquisition keeps its immutable provenance, and all agent work time is metered. Neither mode grants packages tools or authority.</p>
    {error&&<p role="alert" style={{color:"#8d2f26",fontWeight:650,fontSize:12}}>{error}</p>}
    {notice&&<p role="status" style={{color:C.green||"#2f6b3a",fontWeight:650,fontSize:12}}>{notice}</p>}
    {!autonomy&&!busy&&<Btn onClick={load}>Load current dial</Btn>}
    {autonomy&&<div>
      <div style={{display:"grid",gap:10,marginBottom:16}}>
        {[["assisted","Assisted — ask before acquiring or spending","JD researches and proposes; an independent administrator approves before JD acquires capabilities or spends agent time."],
          ["autonomous","Autonomous — cook without asking","JD researches, acquires what it needs and proceeds. Bounded by the spend ceiling below; charging happens per actual agent work time at the recorded rate."]].map(([value,label,desc])=>(
          <label key={value} style={{display:"flex",gap:10,alignItems:"flex-start",border:`1.5px solid ${mode===value?C.blue:C.border}`,borderRadius:10,padding:12,cursor:"pointer",background:mode===value?"color-mix(in srgb, "+C.blue+" 6%, transparent)":"transparent"}}>
            <input type="radio" name="autonomy-mode" value={value} checked={mode===value} onChange={()=>setMode(value)} style={{marginTop:3}}/>
            <span><div style={{fontWeight:800,fontSize:13,color:C.text}}>{label}</div><div style={{fontSize:12,color:C.muted,marginTop:2}}>{desc}</div></span>
          </label>))}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
        <label style={{display:"block",fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5}}>Spend ceiling (hours of agent time)
          <input type="number" min="0.02" max="24" step="0.02" value={ceilingHours} onChange={e=>setCeilingHours(e.target.value)}
            style={{width:"100%",padding:"10px 12px",border:`1.5px solid ${C.border}`,borderRadius:9,fontSize:13,marginTop:6}}/>
        </label>
        <label style={{display:"block",fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5}}>Rate ({autonomy.currency} per agent-hour)
          <input type="number" min="1" max="1000000" step="0.5" value={ratePerHour} onChange={e=>setRatePerHour(e.target.value)}
            style={{width:"100%",padding:"10px 12px",border:`1.5px solid ${C.border}`,borderRadius:9,fontSize:13,marginTop:6}}/>
        </label>
      </div>
      <p style={{fontSize:11,color:C.muted,marginBottom:14}}>Charging itself stays disabled until the platform release flag is enabled; the ledger records confirmed estimates and measured actual seconds in the meantime. Queued and waiting time is never billable.</p>
      <Btn onClick={save} disabled={busy}>Save autonomy dial</Btn>
    </div>}
  </Card>;
}
