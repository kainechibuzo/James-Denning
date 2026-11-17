import {ownerNavigationScope,readOwnerNavigationPermissions} from "./auth/owner-navigation-permissions.mjs";
import React, { lazy, useId, useState, useEffect, useMemo, Component, useRef } from "react";
import { ArrowLeft, ArrowRight, ChevronDown, Moon, Sun, LayoutDashboard, Users, TrendingUp, Inbox, History, CheckCircle2, Wallet, Settings, ReceiptText, Bell, Plus, Pencil, Trash2, Eye, EyeOff, Download, Send, Search, Filter, RefreshCw, X, Check, AlertTriangle, Info, LogOut, User, Calendar, Clock, Star, Home, Menu, Lock, Unlock, Shield, Key, Globe, Phone, MapPin, Building2, Image, File, Folder, Archive, Database, Activity, PieChart, BarChart2, Link, Copy, Share2, Printer, Save, HelpCircle, BookMarked, Award, ClipboardList, UserCircle, UserCheck, UserX, Banknote, TrendingDown, Calculator, Flag, Target, Navigation, Package, Type, Sidebar, AlertCircle, WifiOff, Wifi } from "lucide-react";
import ReactDOM from "react-dom";
import { db, supabase } from "./supabaseClient.js";
import { useInactivityTimeout } from "./useInactivityTimeout.js";
// -- SHARED CONTEXT IMPORTS (src/contexts/ -- shared with pages/) ---------------
import { DarkCtx, useDark } from './contexts/dark.jsx';
import { ConfirmProvider, useConfirm } from './contexts/confirm.jsx';
import { OrganizationProvider, useOrganization } from './contexts/organization.jsx';
import { LIGHT as THEME_LIGHT, DARK as THEME_DARK, setTheme } from './config/theme.js';
import { PRODUCT } from './config/product.js';
import { PERM_ROLE_DEFAULTS } from './config/permissions.mjs';
import { ReferenceBrand } from "./components/reference-brand.jsx";
import "./styles/reference-design.css";
import { ChatHome } from "./chat/ChatHome.jsx";
import { searchNavigation, isNavGroupCollapsed } from "./config/navigation-search.mjs";
import { canOpenOperations, WORKSPACE_NAVIGATION, buildWorkspaceNavigation, defaultCollapsedGroups, businessGroupForPage } from "./config/workspace-navigation.mjs";
import { bindMobileNavigation } from "./components/mobile-navigation.mjs";
import { WorkspaceSwitchDialog } from "./components/workspace-switch-dialog.jsx";
import { signOutForWorkspaceSwitch } from "./utils/switch-workspace.mjs";
// -- Route-level page chunks. The app shell is ready before feature modules download.
const lazyPage = (loader, exportName) => lazy(() => loader().then(module => ({ default: module[exportName] })));
const AdminToolsPage = lazyPage(() => import("./pages/tools.jsx"), "AdminToolsPage");
const AuditLogPage = lazyPage(() => import("./pages/tools.jsx"), "AuditLogPage");
const MailLogsPage = lazyPage(() => import("./pages/email-logs.jsx"), "MailLogsPage");
const PermissionsPage = lazyPage(() => import("./pages/permissions.jsx"), "PermissionsPage");
const SettingsPage = lazyPage(() => import("./pages/settings.jsx"), "SettingsPage");
const NotificationsPage = lazyPage(() => import("./pages/settings.jsx"), "NotificationsPage");
const OrgPresetSelectPage = lazyPage(() => import("./pages/hiring.jsx"), "OrgPresetSelectPage");
const OrgCreatePage = lazyPage(() => import("./pages/hiring.jsx"), "OrgCreatePage");
const OrgSignupModal = lazyPage(() => import("./pages/hiring.jsx"), "OrgSignupModal");
const PublicHireLanding = lazyPage(() => import("./pages/hiring.jsx"), "PublicHireLanding");
const HiringPage = lazyPage(() => import("./pages/hiring.jsx"), "HiringPage");
const JDOperationsPage = lazyPage(() => import("./pages/jd-operations.jsx"), "JDOperationsPage");




// ─── VERSION / BRAND ─────────────────────────────────────────────────────────
const APP_VERSION = PRODUCT.version;
const LIGHT = THEME_LIGHT;
const DARK = THEME_DARK;
// C is set at runtime by the DarkMode provider.
let C = LIGHT;

// ─── DARK MODE CONTEXT ─────────────────────────────────────────────────────────
// DarkCtx/useDark -- imported from contexts/dark.jsx

function DarkProvider({children}){
  const stored=()=>{try{const value=localStorage.getItem("jd_dark");return value!=null?value==="1":false}catch{return false}};
  const [dark,setDark]=useState(stored);
  C=dark?DARK:LIGHT;
  setTheme(dark);
  const toggle=()=>setDark(current=>{
    const next=!current;
    try{localStorage.setItem("jd_dark",next?"1":"0")}catch{}
    return next;
  });
  useEffect(()=>{
    const mode=dark?"dark":"light";
    document.documentElement.dataset.theme=mode;
    document.body.dataset.theme=mode;
    document.documentElement.style.colorScheme=mode;
    document.body.style.background=dark?DARK.offWhite:LIGHT.offWhite;
  },[dark]);
  return <DarkCtx.Provider value={{dark,toggle}}>{children}</DarkCtx.Provider>;
}

function DarkToggle({compact=false}){
  const {dark,toggle}=useDark();
  // Compact form for the phone header: the text label is what pushed the page
  // title into an ellipsis and the sign-out control off-screen at 360–393px.
  if(compact){
    return <button onClick={toggle} title={dark?"Switch to Light Mode":"Switch to Dark Mode"}
      aria-label={dark?"Switch to light mode":"Switch to dark mode"} aria-pressed={dark}
      style={{background:dark?"rgba(255,255,255,.08)":"rgba(0,0,0,.05)",
        border:`1px solid ${C.border}`,borderRadius:9,width:36,height:36,cursor:"pointer",
        display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,lineHeight:1,
        color:C.text,transition:"all .2s",flexShrink:0}}>
      <span aria-hidden="true">{dark?<Sun size={17}/>:<Moon size={17}/>}</span>
    </button>;
  }
  return <button onClick={toggle} title={dark?"Switch to Light Mode":"Switch to Dark Mode"}
    aria-label={dark?"Switch to light mode":"Switch to dark mode"} aria-pressed={dark}
    style={{background:dark?"rgba(255,255,255,.08)":"rgba(0,0,0,.05)",
      border:`1px solid ${C.border}`,borderRadius:20,padding:"7px 14px",cursor:"pointer",
      display:"flex",alignItems:"center",gap:5,fontSize:12,fontWeight:600,
      color:C.text,transition:"all .2s",flexShrink:0,backdropFilter:"blur(4px)"}}>
    <span>{dark?"Light":"Dark"}</span>
  </button>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// STABILITY LAYER — Error boundary, confirm dialog, safe-delete helpers
// ═══════════════════════════════════════════════════════════════════════════════

// ── Global Error Boundary ────────────────────────────────────────────────────
class ErrorBoundary extends Component {
  constructor(props){ super(props); this.state={hasError:false,error:null,info:null}; }
  static getDerivedStateFromError(error){ return {hasError:true,error}; }
  componentDidCatch(error,info){ console.error("JAMES-DENNING Error:",error,info); this.setState({info}); }
  render(){
    if(this.state.hasError){
      return(
        <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",
          background:"linear-gradient(135deg,#17191c,#17191c)",fontFamily:"'JD Inter',system-ui,sans-serif",padding:24}}>
          <div style={{background:"#fff",borderRadius:20,padding:"38px 32px",maxWidth:500,width:"100%",
            boxShadow:"0 24px 60px rgba(0,0,0,.35)",textAlign:"center"}}>
            <div style={{marginBottom:14}}><Shield size={52} color={C.blue}/></div>
            <div style={{fontSize:21,fontWeight:900,color:"#34353b",marginBottom:8}}>Something went wrong</div>
            <div style={{fontSize:13,color:"#60616b",lineHeight:1.7,marginBottom:6}}>
              The portal hit an unexpected error. Your data is safe — this is a display issue only.
            </div>
            <div style={{fontSize:12,color:"#60616b",lineHeight:1.6,marginBottom:20}}>
              Click <b>Try Again</b> to dismiss, or <b>Reload</b> if the issue persists.
            </div>
            {this.state.error?.message&&(
              <details style={{textAlign:"left",marginBottom:20}}>
                <summary style={{cursor:"pointer",fontSize:12,color:"#60616b",fontWeight:600,userSelect:"none"}}>
                  Technical details
                </summary>
                <pre style={{background:"#fef2f2",borderRadius:8,padding:"10px 12px",fontSize:11,
                  color:"#34353b",overflow:"auto",maxHeight:120,marginTop:6,border:"1px solid #a3a4ad",
                  whiteSpace:"pre-wrap",wordBreak:"break-word"}}>
                  {this.state.error.message}
                </pre>
              </details>
            )}
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>this.setState({hasError:false,error:null,info:null})}
                style={{flex:1,background:"#fff",color:"#17191c",border:"2px solid #17191c",
                  padding:"12px",borderRadius:10,fontWeight:700,fontSize:13,cursor:"pointer"}}>
                <RefreshCw size={14}/> Try Again
              </button>
              <button onClick={()=>window.location.reload()}
                style={{flex:1,background:"#17191c",color:"#fff",border:"none",padding:"12px",
                  borderRadius:10,fontWeight:800,fontSize:13,cursor:"pointer",
                  boxShadow:"0 4px 14px rgba(74,74,74,.4)"}}>
                Reload Portal
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Styled Confirm Dialog (replaces browser confirm()) ────────────────────────
// Usage: showConfirm({title, message, confirmLabel, danger, typeToConfirm, onConfirm, onCancel})
// typeToConfirm: if set, user must type this exact string before confirming
// ConfirmDialog/ConfirmCtx/ConfirmProvider/useConfirm -- imported from contexts/confirm.jsx



// ─── RESPONSIVE HOOK ──────────────────────────────────────────────────────────
function useIsMobile(breakpoint=768){
  const [mobile,setMobile]=useState(()=>window.innerWidth<breakpoint);
  useEffect(()=>{
    const fn=()=>setMobile(window.innerWidth<breakpoint);
    window.addEventListener("resize",fn,{passive:true});
    return()=>window.removeEventListener("resize",fn);
  },[breakpoint]);
  return mobile;
}

// ─── SECTION CONTEXT ──────────────────────────────────────────────────────────










let _id = 1000;
const uid = () => ++_id;









/**
 * Build a clean PDF filename from parts.
 * e.g. pdfName("Emeka Okafor","RCPT","00042") → "EMEKA_OKAFOR_RCPT_00042"
 * All parts are uppercased; spaces and non-alphanumeric chars become underscores.
 */
function pdfName(...parts){
  return parts
    .filter(Boolean)
    .map(p=>String(p).toUpperCase().replace(/[^A-Z0-9]+/g,"_").replace(/^_+|_+$/g,""))
    .filter(Boolean)
    .join("_")+".pdf";
}





// Safe async wrapper: catches errors and returns {data, error} shape always
async function safe(fn) {
  try {
    const result = await fn();
    // Supabase already returns {data, error}; for raw values just wrap them
    if(result && typeof result === "object" && "error" in result) return result;
    return {data: result, error: null};
  } catch(err) {
    console.warn("[JD safe]", err?.message||err);
    return {data: null, error: err};
  }
}

// ── Portal email helpers ────────────────────────────────────────────────────
// Email failures NEVER block registration or payments.
async function sendPortalEmail({to,subject,html,attachments=[]}){
  if(!to||!to.includes("@"))return{ok:false};
  try{
    const body=JSON.stringify({to,subject,html,...(attachments.length?{attachments}:{})});
    const res=await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email`,
      {
        method:"POST",
        headers:{
          "Content-Type":"application/json",
          "Authorization":`Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
        },
        body,
      }
    );
    if(!res.ok){
      let errBody="";
      try{errBody=await res.text();}catch{}
      console.error(`[sendPortalEmail] HTTP ${res.status}:`,errBody);
      // Log failure (fire-and-forget)
      db.logEmail({subject,body:"",recipient_count:1,delivered_count:0,failed_count:1,
        failed_recipients:[{email:to,error:`HTTP ${res.status}: ${errBody}`}],
        status:"failed",error_message:`HTTP ${res.status}: ${errBody}`}).catch(()=>{});
      return{ok:false,error:errBody};
    }
    // Log success (fire-and-forget)
    db.logEmail({subject,body:"",recipient_count:1,delivered_count:1,failed_count:0,
      failed_recipients:[],status:"sent"}).catch(()=>{});
    return{ok:true};
  }catch(e){
    console.warn("[sendPortalEmail] failed (non-blocking):",e);
    db.logEmail({subject,body:"",recipient_count:1,delivered_count:0,failed_count:1,
      failed_recipients:[{email:to,error:e.message}],
      status:"failed",error_message:e.message}).catch(()=>{});
    return{ok:false};
  }
}













// ── Persist session ───────────────────────────────────────────────────────────
// localStorage keeps the user profile across reloads.
// sessionStorage holds the "alive" flag — it clears automatically when the
// tab/browser/PWA/Android app is closed, forcing a fresh login each time.
const SESSION_KEY = "jd_session_user";
const SESSION_ALIVE = "jd_session_active";
function saveSession(user){
  try{localStorage.setItem(SESSION_KEY, JSON.stringify(user));}catch{}
  try{sessionStorage.setItem(SESSION_ALIVE,"1");}catch{}
}
function loadSession(){
  try{
    if(!sessionStorage.getItem(SESSION_ALIVE)) return null; // tab was closed — force re-login
    const s=localStorage.getItem(SESSION_KEY);
    return s?JSON.parse(s):null;
  }catch{return null;}
}
function clearSession(){
  try{localStorage.removeItem(SESSION_KEY);}catch{}
  try{sessionStorage.removeItem(SESSION_ALIVE);}catch{}
}

// ─── Organization selection helpers (multi-tenant) ──────────────────────────────────
const SCHOOL_KEY = "jd_selected_org";

function loadSelectedSchool(){ try{const s=localStorage.getItem(SCHOOL_KEY);return s?JSON.parse(s):null;}catch{return null;} }
function clearSelectedSchool(){ try{localStorage.removeItem(SCHOOL_KEY);}catch{} }

// Initialise db school context synchronously at module load — before any component
// renders or mounts. This ensures every initial data fetch already has _schoolId set,
// preventing cross-organization data leaking on first load (race condition with useEffect).
(()=>{ const s=loadSelectedSchool(); if(s?.id) db.setSchool(s.id,s.student_id_prefix||'SCH',s.name||''); })();



// ─── UI PRIMITIVES ────────────────────────────────────────────────────────────
function Logo({size=44}){
  const ctx = useOrganization();
  const logo = ctx?.orgLogo;
  if(logo){
    return <img src={logo} alt="Organization logo" style={{width:size,height:size,objectFit:"contain",borderRadius:size*0.18,background:"transparent"}}/>;
  }
  return(
    <img src="/design/jd-tile.png" width={size} height={size} alt={PRODUCT.name} style={{borderRadius:size*.26,objectFit:"contain"}}/>
  );
}

function Card({children,style={},onClick}){
  const [h,setH]=useState(false);
  return(
    <div className="jd-ui-card" onClick={onClick}
      onMouseEnter={()=>onClick&&setH(true)} onMouseLeave={()=>setH(false)}
      style={{background:C.white,borderRadius:18,padding:22,
        boxShadow:h?C.shadowMd:C.shadow,
        border:`1px solid ${h&&onClick?C.blue+"28":C.border}`,
        cursor:onClick?"pointer":"default",
        transform:h&&onClick?"translateY(-2px)":"none",
        transition:"all .2s ease",...style}}>
      {children}
    </div>
  );
}

function Btn({children,onClick,color=C.blue,outline=false,sm=false,xs=false,disabled=false,style={}}){
  const [h,setH]=useState(false);
  const p=xs?"4px 10px":sm?"7px 14px":"10px 20px";
  const fs=xs?11:sm?12:13;
  const radius=xs?6:sm?8:9;
  return(
    <button className={`jd-ui-button${outline?" is-outline":""}`} onClick={onClick} disabled={disabled}
      onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
      style={{
        background:outline?"transparent":disabled?"#dedfe4":h
          ?`linear-gradient(135deg,${color}ee,${color}bb)`
          :`linear-gradient(135deg,${color},${color}cc)`,
        color:outline?(disabled?C.light:color):"#fff",
        border:outline?`1.5px solid ${disabled?C.border:color}`:"none",
        padding:p,borderRadius:radius,cursor:disabled?"not-allowed":"pointer",
        fontSize:fs,fontWeight:700,display:"inline-flex",alignItems:"center",gap:5,
        whiteSpace:"nowrap",transition:"all .15s ease",opacity:disabled?.55:1,
        boxShadow:(!outline&&!disabled&&h)?`0 4px 12px ${color}40`:"none",
        transform:(!disabled&&h)?"translateY(-1px)":"none",
        letterSpacing:".01em",...style}}>
      {children}
    </button>
  );
}

function Badge({children,color=C.blue,style={}}){
  return <span className="jd-ui-badge" style={{background:color+"15",color,padding:"3px 10px",borderRadius:20,
    fontSize:11,fontWeight:700,border:`1px solid ${color}25`,whiteSpace:"nowrap",
    letterSpacing:".02em",...style}}>{children}</span>;
}

function Inp({label,value,onChange,type="text",placeholder="",disabled=false,required=false,style={}}){
  const fieldId = useId();
  const [focused,setFocused]=useState(false);
  return(
    <div style={{marginBottom:14}}>
      {label&&<label htmlFor={fieldId} style={{display:"block",fontSize:11,fontWeight:700,color:focused?C.blue:C.muted,
        textTransform:"uppercase",letterSpacing:.6,marginBottom:5,transition:"color .15s"}}>
        {label}{required&&<span style={{color:C.red}}> *</span>}
      </label>}
      <input id={fieldId} type={type} value={value??""} onChange={e=>onChange(e.target.value)}
        placeholder={placeholder} disabled={disabled}
        onFocus={e=>{setFocused(true);e.target.style.borderColor=C.blue;e.target.style.boxShadow=`0 0 0 3px ${C.blue}18`;}}
        onBlur={e=>{setFocused(false);e.target.style.borderColor=C.border;e.target.style.boxShadow="none";}}
        style={{display:"block",width:"100%",padding:"10px 13px",
          border:`1.5px solid ${focused?C.blue:C.border}`,
          borderRadius:9,fontSize:13,background:disabled?C.offWhite:C.white,
          color:C.text,transition:"border-color .15s,box-shadow .15s",outline:"none",
          boxSizing:"border-box",...style}}/>
    </div>
  );
}



function Modal({title,children,onClose,width=520}){
  const isMobile=useIsMobile();
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(6,6,6,.6)",backdropFilter:"blur(6px)",
      display:"flex",
      alignItems:isMobile?"flex-end":"flex-start",
      justifyContent:"center",
      zIndex:800,padding:isMobile?"0":"28px 16px",overflowY:isMobile?"hidden":"auto"}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="jd-ui-modal" role="dialog" aria-modal="true" aria-label={title} style={{background:C.white,
        borderRadius:isMobile?"20px 20px 0 0":"20px",
        width:"100%",maxWidth:isMobile?"100%":width,
        maxHeight:isMobile?"92vh":"none",
        display:"flex",flexDirection:"column",
        boxShadow:C.shadowXl,
        animation:isMobile?"sheetUp .28s cubic-bezier(.34,1.3,.64,1)":"modalUp .22s cubic-bezier(.34,1.56,.64,1)",
        transition:"background .2s"}}>
        <div className="jd-ui-modal-head" style={{background:`linear-gradient(135deg,${C.blue} 0%,${C.blueDark} 100%)`,
          borderRadius:isMobile?"20px 20px 0 0":"20px 20px 0 0",
          padding:"16px 22px",flexShrink:0,
          display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          {isMobile&&<div style={{width:36,height:4,borderRadius:2,
            background:"rgba(255,255,255,.3)",margin:"0 auto 0 0",flexShrink:0}}/>}
          <span style={{color:"#fff",fontWeight:800,fontSize:15,letterSpacing:".01em",flex:1,
            textAlign:isMobile?"center":"left"}}>{title}</span>
          <button aria-label="Close dialog" onClick={onClose}
            style={{background:"rgba(255,255,255,.15)",color:"rgba(255,255,255,.9)",
              border:"1px solid rgba(255,255,255,.2)",width:30,height:30,borderRadius:"50%",
              cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",
              justifyContent:"center",transition:"background .15s",flexShrink:0}}
            onMouseEnter={e=>e.target.style.background="rgba(255,255,255,.28)"}
            onMouseLeave={e=>e.target.style.background="rgba(255,255,255,.15)"}>
            <X size={16}/>
          </button>
        </div>
        <div style={{padding:isMobile?"20px 16px 32px":24,overflowY:"auto"}}>{children}</div>
      </div>
    </div>
  );
}

function Toast({t,rm}){
  // Support both old Toast({msg,type,onClose}) and new Toast({t,rm})
  const msg=t?.msg||"";
  const type=t?.type||"success";
  const onClose=()=>rm(t?.id);
  useEffect(()=>{ const tid=setTimeout(onClose,4000); return()=>clearTimeout(tid); },[]);
  const configs={
    success:{bg:`linear-gradient(135deg,${LIGHT.green},#60616b)`,icon:"check",bdr:LIGHT.green},
    error:  {bg:`linear-gradient(135deg,#34353b,#34353b)`,       icon:"close",bdr:"#34353b"},
    warn:   {bg:`linear-gradient(135deg,#60616b,#34353b)`,       icon:"warning",bdr:"#60616b"},
  };
  const cfg=configs[type]||configs.success;
  return(
    <div style={{background:cfg.bg,color:"#fff",padding:"12px 16px",borderRadius:12,
      fontWeight:600,fontSize:13,boxShadow:`0 8px 24px ${cfg.bdr}40`,
      display:"flex",alignItems:"center",gap:10,minWidth:240,maxWidth:360,
      animation:"slideInRight .28s cubic-bezier(.34,1.56,.64,1)",
      border:`1px solid ${cfg.bdr}80`}}>
      <div style={{width:22,height:22,borderRadius:"50%",background:"rgba(255,255,255,.2)",
        display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
        <AppIcon name={cfg.icon} size={13} color="#fff"/>
      </div>
      <span style={{flex:1,lineHeight:1.4}}>{msg}</span>
      <button onClick={onClose}
        style={{background:"rgba(255,255,255,.15)",border:"none",color:"#fff",
          cursor:"pointer",width:22,height:22,borderRadius:"50%",fontSize:12,
          display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
        <X size={14}/>
      </button>
    </div>
  );
}















// ─── APP ICON ──────────────────────────────────────────────────────────────────
// Maps icon-name strings to Lucide components for use in nav, headers, buttons
const ICON_MAP = {
  // Navigation
  dashboard: LayoutDashboard, members: Users,
  'mail-logs': Inbox, 'audit-log': History,
  'admin-tools': Database, notifications: Bell, permissions: Shield,
  // Actions
  add: Plus, edit: Pencil, delete: Trash2, view: Eye, hide: EyeOff,
  download: Download, send: Send, search: Search, filter: Filter,
  refresh: RefreshCw, close: X, check: Check, warning: AlertTriangle,
  info: Info, logout: LogOut, user: UserCircle, settings: Settings,
  lock: Lock, unlock: Unlock, shield: Shield, key: Key,
  calendar: Calendar, clock: Clock, star: Star, home: Home,
  menu: Menu, bell: Bell, link: Link, copy: Copy, share: Share2,
  print: Printer, save: Save, archive: Archive, database: Database,
  activity: Activity, chart: BarChart2, 'pie-chart': PieChart,
  trending: TrendingUp, 'trending-down': TrendingDown,
  wallet: Wallet, banknote: Banknote, receipt: ReceiptText, calculator: Calculator,
  award: Award, bookmark: BookMarked, flag: Flag, target: Target,
  clipboard: ClipboardList, 'user-check': UserCheck, 'user-x': UserX,
  building: Building2, globe: Globe, phone: Phone, map: MapPin,
  image: Image, file: File, folder: Folder, package: Package,
  pencil: Pencil,
};
function AppIcon({name,size=16,color,style={}}){
  const Ic=ICON_MAP[name];
  if(!Ic) return null;
  return <Ic size={size} color={color} style={{flexShrink:0,...style}}/>;
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App(){
  // Public hiring landing pages live at /apply/<slug> (ad destination).
  // They render standalone — no portal shell, no auth — and only exist in the
  // browser if the SPA server rewrites all paths to index.html (Vercel does).
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/apply/")) {
    return (
      <ErrorBoundary>
        <PublicHireLanding/>
      </ErrorBoundary>
    );
  }
  return(
    <ErrorBoundary>
      <DarkProvider>
        <ConfirmProvider>
          <OrganizationProvider>
            <AppInnerWrapper/>
          </OrganizationProvider>
        </ConfirmProvider>
      </DarkProvider>
    </ErrorBoundary>
  );
}
// Wrapper forces re-render when dark mode changes so C is always current
function AppInnerWrapper(){
  const {dark}=useDark();
  const isMobile=useIsMobile();
  C = dark ? DARK : LIGHT;

  // ── Internet connectivity detection ─────────────────────────────────────────
  const [isOnline,setIsOnline]=useState(()=>navigator.onLine);
  const [justReconnected,setJustReconnected]=useState(false);
  useEffect(()=>{
    const handleOnline=()=>{setIsOnline(true);setJustReconnected(true);setTimeout(()=>setJustReconnected(false),4000);};
    const handleOffline=()=>{setIsOnline(false);setJustReconnected(false);};
    window.addEventListener('online',handleOnline);
    window.addEventListener('offline',handleOffline);
    return()=>{window.removeEventListener('online',handleOnline);window.removeEventListener('offline',handleOffline);};
  },[]);

  // Inject print stylesheet once
  useEffect(()=>{
    const id="jd-print-styles";
    if(document.getElementById(id))return;
    const s=document.createElement("style");
    s.id=id;
    s.textContent=`
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
@keyframes modalUp{from{opacity:0;transform:translateY(20px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes sheetUp{from{opacity:0;transform:translateY(100%)}to{opacity:1;transform:translateY(0)}}
@keyframes slideInRight{from{opacity:0;transform:translateX(30px)}to{opacity:1;transform:translateX(0)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
/* Prevent content hidden under fixed elements */
html{-webkit-text-size-adjust:100%;}
@media print{
  aside,header,nav,.no-print,button:not(.print-show),[data-no-print]{display:none!important;}
  body,html{background:#fff!important;color:#000!important;font-size:11pt!important;}
  *{box-shadow:none!important;}
  table,th,td{border:1px solid #ccc!important;}
  tr,td,th{page-break-inside:avoid;}
  @page{margin:1.5cm;}
}`;
    document.head.appendChild(s);
    return()=>{s.remove();};
  },[]);
  return(
    <>
      <AppInner/>

      {/* ── Offline overlay ──────────────────────────────────────────────── */}
      {!isOnline&&(
        <div style={{position:"fixed",inset:0,zIndex:99999,display:"flex",flexDirection:"column",
          alignItems:"center",justifyContent:"center",
          background:"rgba(15,15,15,0.82)",backdropFilter:"blur(6px)"}}>
          <div style={{background:C.white,borderRadius:20,padding:"44px 48px",maxWidth:460,width:"90%",
            textAlign:"center",boxShadow:"0 32px 80px rgba(0,0,0,0.45)",
            border:"3px solid #34353b",animation:"fadeUp .35s ease"}}>
            <div style={{display:"flex",justifyContent:"center",marginBottom:18}}>
              <div style={{background:C.redPale,borderRadius:"50%",width:72,height:72,
                display:"flex",alignItems:"center",justifyContent:"center",
                animation:"pulse 2s ease infinite"}}>
                <WifiOff size={36} color="#34353b"/>
              </div>
            </div>
            <div style={{fontSize:22,fontWeight:900,color:C.text,marginBottom:8}}>
              No Internet Connection
            </div>
            <div style={{fontSize:14,color:C.muted,lineHeight:1.7,marginBottom:24}}>
              The portal needs an active internet connection to access your organization data.
              <br/>Your work is safe — please check your network connection.
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              <div style={{background:C.redPale,border:`1px solid ${C.red}40`,borderRadius:10,
                padding:"12px 16px",display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:C.red,
                  flexShrink:0,animation:"pulse 1.2s ease infinite"}}/>
                <span style={{fontSize:12,fontWeight:700,color:C.red}}>Connection lost — waiting to reconnect…</span>
              </div>
              <div style={{fontSize:11,color:C.light}}>
                The page will resume automatically when your connection is restored.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Reconnected toast ─────────────────────────────────────────────── */}
      {justReconnected&&(
        <div style={{position:"fixed",bottom:28,left:"50%",transform:"translateX(-50%)",
          zIndex:99999,background:"#60616b",color:"#fff",
          padding:"14px 28px",borderRadius:14,fontWeight:700,fontSize:14,
          boxShadow:"0 8px 32px rgba(145,145,145,0.45)",animation:"fadeUp .3s ease",
          display:"flex",alignItems:"center",gap:10,whiteSpace:"nowrap"}}>
          <Wifi size={18} color="#fff"/>
          Internet connection restored
        </div>
      )}

      {/* Decorative version marker stays out of the phone header controls. */}
      {!isMobile&&(
        <div style={{position:"fixed",bottom:6,right:10,zIndex:9000,
          fontSize:10,fontWeight:500,letterSpacing:"0.04em",
          color:dark?"rgba(255,255,255,0.22)":"rgba(0,0,0,0.2)",
          pointerEvents:"none",userSelect:"none"}}>
          {APP_VERSION}
        </div>
      )}
    </>
  );
}


function LiveClock(){
  const [t,setT]=useState(new Date());
  useEffect(()=>{const i=setInterval(()=>setT(new Date()),60000);return()=>clearInterval(i);},[]);
  return <span style={{fontSize:11,color:C.muted,fontWeight:500}}>
    {t.toLocaleTimeString("en-NG",{hour:"2-digit",minute:"2-digit"})}&nbsp;·&nbsp;
    {t.toLocaleDateString("en-NG",{weekday:"short",day:"numeric",month:"short"})}
  </span>;
}

// ── Profile Edit Modal ────────────────────────────────────────────────────────
function ProfileModal({user,onClose,notify,onUpdated}){
  const [name,setName]=useState(user.name||"");
  const [pw,setPw]=useState("");
  const [pw2,setPw2]=useState("");
  const [saving,setSaving]=useState(false);

  // Name lives on the profile row; the password is owned by Supabase Auth.
  const save=async()=>{
    if(pw&&pw.length<8){notify("Password must be at least 8 characters","error");return;}
    if(pw&&pw!==pw2){notify("Passwords do not match","error");return;}
    setSaving(true);
    try{
      const {error}=await supabase.from("profiles").update({full_name:name.trim()}).eq("id",user._authUserId||user.id);
      if(error)throw error;
      if(pw){const {error:pwError}=await supabase.auth.updateUser({password:pw});if(pwError)throw pwError;}
      notify("Profile updated");
      onUpdated({...user,name:name.trim()});
      onClose();
    }catch(e){notify(e?.message||"Profile could not be saved","error");}
    finally{setSaving(false);}
  };

  return(
    <Modal title="My Profile" onClose={onClose} width={440}>
      <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:18,
        padding:"14px 16px",background:C.bluePale,borderRadius:10}}>
        <div style={{width:56,height:56,borderRadius:"50%",background:C.blue,
          color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",
          fontSize:22,fontWeight:900,flexShrink:0}}>
          {(name||"?")[0].toUpperCase()}
        </div>
        <div>
          <div style={{fontWeight:800,color:C.blue,fontSize:14}}>{name||"—"}</div>
          <Badge color={user.role==="admin"?C.orange:C.blue}>
            {user.role.toUpperCase()}
          </Badge>
          {user.email&&<div style={{fontSize:11,color:C.muted,marginTop:3}}>{user.email}</div>}
        </div>
      </div>
      <Inp label="Display Name" value={name} onChange={setName} placeholder="Your full name"/>
      <div style={{borderTop:`1px solid ${C.border}`,marginTop:4,paddingTop:14}}>
        <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:8}}>Change Password</div>
        <Inp label="New Password" type="password" value={pw} onChange={setPw} placeholder="Leave blank to keep current"/>
        {pw&&<Inp label="Confirm Password" type="password" value={pw2} onChange={setPw2} placeholder="Repeat new password"/>}
      </div>
      <div style={{display:"flex",gap:10,marginTop:6}}>
        <Btn onClick={save} color={C.orange} disabled={saving} style={{flex:1}}>{saving?"Saving…":"Save Profile"}</Btn>
        <Btn onClick={onClose} color={C.muted} outline style={{flex:1}}>Cancel</Btn>
      </div>
    </Modal>
  );
}

// ── Logout confirmation dialog ────────────────────────────────────────────────
function LogoutDialog({onConfirm,onCancel}){
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(6,6,6,.65)",backdropFilter:"blur(8px)",
      zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div className="jd-confirm-card" role="dialog" aria-modal="true" aria-label="Sign out" style={{background:C.white,borderRadius:24,padding:"36px 32px",maxWidth:380,width:"100%",
        boxShadow:C.shadowXl,textAlign:"center",animation:"modalUp .22s cubic-bezier(.34,1.56,.64,1)"}}>
        <div style={{width:64,height:64,borderRadius:18,background:C.redPale,
          display:"flex",alignItems:"center",justifyContent:"center",
          fontSize:30,margin:"0 auto 16px",border:`1px solid ${C.red}20`}}><LogOut size={30} color={C.red}/></div>
        <div style={{fontSize:20,fontWeight:900,color:C.text,marginBottom:8,letterSpacing:"-.02em"}}>Sign Out?</div>
        <div style={{fontSize:13,color:C.muted,lineHeight:1.7,marginBottom:28}}>
          You'll be returned to the login screen.<br/>Any unsaved changes will be lost.
        </div>
        <div style={{display:"flex",gap:10}}>
          <button onClick={onCancel}
            style={{flex:1,padding:"12px",borderRadius:12,border:`1.5px solid ${C.border}`,
              background:C.white,color:C.muted,fontWeight:700,fontSize:13,cursor:"pointer",
              transition:"all .15s"}}
            onMouseEnter={e=>e.currentTarget.style.background=C.offWhite}
            onMouseLeave={e=>e.currentTarget.style.background=C.white}>
            Cancel
          </button>
          <button onClick={onConfirm}
            style={{flex:1,padding:"12px",borderRadius:12,border:"none",
              background:`linear-gradient(135deg,#34353b,#34353b)`,
              color:"#fff",fontWeight:800,fontSize:13,cursor:"pointer",
              boxShadow:"0 6px 20px rgba(77,77,77,.35)",transition:"all .15s"}}
            onMouseEnter={e=>e.currentTarget.style.transform="translateY(-1px)"}
            onMouseLeave={e=>e.currentTarget.style.transform="none"}>
            Yes, Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Inactivity warning modal ──────────────────────────────────────────────────
function InactivityWarningModal({ secondsLeft, onStay, onLogout }) {
  const urgent = secondsLeft <= 15;
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(6,6,6,.8)",backdropFilter:"blur(10px)",
      zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:`linear-gradient(160deg,${C.blueDark} 0%,#17191c 100%)`,
        border:"1px solid rgba(255,255,255,.12)",borderRadius:24,
        padding:"44px 36px 36px",maxWidth:380,width:"100%",textAlign:"center",
        boxShadow:"0 32px 80px rgba(0,0,0,.5)",animation:"modalUp .3s cubic-bezier(.34,1.56,.64,1)"}}>
        {/* Lock icon */}
        <div style={{width:72,height:72,borderRadius:20,background:"rgba(255,255,255,.08)",
          border:"1px solid rgba(255,255,255,.15)",display:"flex",alignItems:"center",
          justifyContent:"center",fontSize:34,margin:"0 auto 22px"}}><Lock size={34} color={C.orange}/></div>
        {/* Title */}
        <div style={{fontSize:22,fontWeight:900,color:"#fff",marginBottom:10,letterSpacing:"-.02em"}}>
          Still there?
        </div>
        {/* Message */}
        <p style={{fontSize:14,color:"rgba(255,255,255,.6)",lineHeight:1.7,marginBottom:16}}>
          You'll be logged out in due to inactivity.
        </p>
        {/* Countdown */}
        <div style={{fontSize:52,fontWeight:900,letterSpacing:"-2px",marginBottom:28,
          fontVariantNumeric:"tabular-nums",transition:"color .4s",
          color: urgent ? "#60616b" : C.orange}}>
          {secondsLeft}<span style={{fontSize:20,fontWeight:600,opacity:.7}}>s</span>
        </div>
        {/* Stay logged in */}
        <button onClick={onStay}
          style={{width:"100%",padding:"14px",borderRadius:12,border:"none",cursor:"pointer",
            background:`linear-gradient(135deg,${C.orange},#34353b)`,color:"#fff",
            fontSize:15,fontWeight:800,letterSpacing:".2px",marginBottom:10,
            boxShadow:"0 4px 16px rgba(112,112,112,.4)",transition:"opacity .15s"}}
          onMouseEnter={e=>e.currentTarget.style.opacity=".9"}
          onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
          Stay Logged In
        </button>
        {/* Log out now */}
        <button onClick={onLogout}
          style={{width:"100%",padding:"11px",borderRadius:12,border:"1px solid rgba(255,255,255,.12)",
            cursor:"pointer",background:"rgba(255,255,255,.06)",color:"rgba(255,255,255,.5)",
            fontSize:13,fontWeight:600,transition:"all .15s"}}
          onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,.12)";e.currentTarget.style.color="rgba(255,255,255,.8)";}}
          onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,.06)";e.currentTarget.style.color="rgba(255,255,255,.5)";}}>
          Log Out Now
        </button>
      </div>
    </div>
  );
}

// ─── ONBOARDING TOUR ──────────────────────────────────────────────────────────
const TOUR_STEPS_CONFIG = [
  {id:"welcome",       title:"Welcome to JAMES-DENNING",
    content:"This quick tour walks you through the key features available to you. Use the arrows to navigate, or press Skip to explore on your own.",
    target:null, page:null, placement:"center", roles:null, perms:null},
  {id:"nav-sidebar",   title:"Navigation Sidebar",
    content:"Use the sidebar to jump between areas of your workspace. Click the menu icon to collapse or expand it anytime.",
    target:"aside", page:"jd-chat", placement:"right", roles:null, perms:null},
  {id:"nav-jd-chat",   title:"JD Assistant",
    content:"Describe what your business needs. JD plans the work, proposes changes for review and keeps a record of every decision.",
    target:"[data-tour='nav-jd-chat']", page:"jd-chat", placement:"right", roles:null, perms:"jd-chat"},
  {id:"nav-jd-operations", title:"Tasks & Operations",
    content:"Track the tasks, runs and approvals JD is working on for your organisation.",
    target:"[data-tour='nav-jd-operations']", page:"jd-operations", placement:"right", roles:null, perms:"jd-operations"},
  {id:"nav-hiring",    title:"Recruitment",
    content:"Publish roles, review applicants and message candidates.",
    target:"[data-tour='nav-hiring']", page:"hiring", placement:"right", roles:["admin"], perms:null},
  {id:"settings-btn",  title:"Settings",
    content:"Configure organisation details, security, JD Connect integrations and permissions.",
    target:"[data-tour='workspace-menu']", page:"settings", placement:"bottom", roles:["admin"], perms:null},
  {id:"finish",        title:"You're all set",
    content:"You can restart this tour anytime with the ? button in the header.",
    target:"[data-tour='tour-trigger']", page:"jd-chat", placement:"bottom", roles:null, perms:null},
];

function TourSystem({userId, role, canAccess, setPage, isMobile, show, onClose}){
  const {dark} = useDark();
  C = dark ? DARK : LIGHT;

  const filteredSteps = useMemo(()=>{
    return TOUR_STEPS_CONFIG.filter(s=>{
      if(s.roles && !s.roles.includes(role)) return false;
      if(s.perms && !canAccess(s.perms)) return false;
      return true;
    });
  },[role, canAccess]);

  const [step, setStep] = useState(0);
  const [rect, setRect] = useState(null);
  const [ready, setReady] = useState(false);
  const overlayRef = useRef(null);

  const current = filteredSteps[step];
  const total = filteredSteps.length;
  const isLast = step === total - 1;

  // Navigate to step's page and locate target element
  useEffect(()=>{
    if(!show || !current) return;
    setReady(false);
    // Steps with no target (e.g. welcome/finish): show tooltip immediately, no spotlight
    if(!current.target){
      setRect(null);
      setReady(true);
      return;
    }
    const measure=()=>{
      const el = document.querySelector(current.target);
      if(!el){ setRect(null); setReady(true); return; }
      el.scrollIntoView({behavior:"smooth", block:"nearest", inline:"nearest"});
      // Single short wait for scrollIntoView to settle, then measure and show both together
      setTimeout(()=>{
        const r = el.getBoundingClientRect();
        setRect({top:r.top, left:r.left, width:r.width, height:r.height});
        setReady(true);
      }, 80);
    };
    if(current.page){
      setPage(current.page);
      // Wait for React to re-render the new page, then measure
      setTimeout(measure, 350);
    } else {
      // Same page — measure immediately after a single paint
      requestAnimationFrame(()=>requestAnimationFrame(measure));
    }
  },[step, show]); // eslint-disable-line react-hooks/exhaustive-deps

  // Recalculate on resize/scroll
  useEffect(()=>{
    if(!show || !current?.target) return;
    const recalc=()=>{
      const el=document.querySelector(current.target);
      if(el){ const r=el.getBoundingClientRect(); setRect({top:r.top,left:r.left,width:r.width,height:r.height}); }
    };
    window.addEventListener("resize",recalc);
    window.addEventListener("scroll",recalc,true);
    return()=>{ window.removeEventListener("resize",recalc); window.removeEventListener("scroll",recalc,true); };
  },[show, current]); // eslint-disable-line react-hooks/exhaustive-deps

  if(!show || !current || !ready) return null;

  const PAD = 8;
  const spotRect = rect ? {
    top: rect.top - PAD, left: rect.left - PAD,
    width: rect.width + PAD*2, height: rect.height + PAD*2,
  } : null;

  // Tooltip positioning
  const TOOLTIP_W = isMobile ? Math.min(window.innerWidth - 32, 320) : 340;
  const placement = current.placement || "bottom";
  let tooltipStyle = {};
  if(!spotRect || placement==="center"){
    tooltipStyle = {
      position:"fixed", top:"50%", left:"50%",
      transform:"translate(-50%,-50%)",
      width: TOOLTIP_W,
    };
  } else {
    const vw=window.innerWidth, vh=window.innerHeight;
    if(placement==="right"){
      let top=spotRect.top + spotRect.height/2 - 80;
      top = Math.max(12, Math.min(vh - 200, top));
      let left=spotRect.left + spotRect.width + 16;
      if(left + TOOLTIP_W > vw - 12) left = spotRect.left - TOOLTIP_W - 16;
      // On narrow screens anchor the tour card to the viewport instead of
      // trying to squeeze it between the highlighted control and screen edge.
      if(isMobile || left < 12) {
        left = 12;
        top = Math.max(12, Math.min(vh - 220, spotRect.top + spotRect.height + 14));
      }
      left = Math.max(12, Math.min(vw - TOOLTIP_W - 12, left));
      tooltipStyle={position:"fixed", top, left, width:TOOLTIP_W, maxHeight:"calc(100dvh - 24px)", overflowY:"auto"};
    } else if(placement==="bottom"){
      let top=spotRect.top + spotRect.height + 14;
      if(top + 160 > vh - 12) top = spotRect.top - 170;
      let left=spotRect.left + spotRect.width/2 - TOOLTIP_W/2;
      left = Math.max(12, Math.min(vw - TOOLTIP_W - 12, left));
      tooltipStyle={position:"fixed", top, left, width:TOOLTIP_W};
    } else {
      let top=spotRect.top - 170;
      if(top < 12) top = spotRect.top + spotRect.height + 14;
      let left=spotRect.left + spotRect.width/2 - TOOLTIP_W/2;
      left = Math.max(12, Math.min(vw - TOOLTIP_W - 12, left));
      tooltipStyle={position:"fixed", top, left, width:TOOLTIP_W};
    }
  }

  const progress = ((step+1)/total)*100;

  return ReactDOM.createPortal(
    <div ref={overlayRef} style={{position:"fixed",inset:0,zIndex:99999,pointerEvents:"none"}}>
      {/* Dimmed overlay with spotlight hole */}
      {spotRect ? (
        <>
          {/* top strip */}
          <div style={{position:"fixed",top:0,left:0,right:0,height:spotRect.top,
            background:"rgba(0,0,0,.72)",pointerEvents:"auto"}} onClick={onClose}/>
          {/* left strip */}
          <div style={{position:"fixed",top:spotRect.top,left:0,width:spotRect.left,
            height:spotRect.height,background:"rgba(0,0,0,.72)",pointerEvents:"auto"}} onClick={onClose}/>
          {/* right strip */}
          <div style={{position:"fixed",top:spotRect.top,
            left:spotRect.left+spotRect.width,
            right:0,height:spotRect.height,
            background:"rgba(0,0,0,.72)",pointerEvents:"auto"}} onClick={onClose}/>
          {/* bottom strip */}
          <div style={{position:"fixed",top:spotRect.top+spotRect.height,
            left:0,right:0,bottom:0,
            background:"rgba(0,0,0,.72)",pointerEvents:"auto"}} onClick={onClose}/>
          {/* Highlight ring around target */}
          <div style={{position:"fixed",
            top:spotRect.top, left:spotRect.left,
            width:spotRect.width, height:spotRect.height,
            borderRadius:10, pointerEvents:"none",
            outline:"2px solid "+C.orange,
            animation:"tourPulse 2s ease-in-out infinite",
            boxShadow:`0 0 0 4px ${C.orange}30`}}/>
        </>
      ) : (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.72)",
          pointerEvents:"auto"}} onClick={onClose}/>
      )}

      {/* Tooltip card */}
      <div style={{...tooltipStyle, pointerEvents:"auto",
        background: dark ? "#17191c" : "#ffffff",
        borderRadius:16, boxShadow:"0 24px 48px rgba(0,0,0,.4),0 8px 24px rgba(0,0,0,.3)",
        border:`1px solid ${C.border}`,
        animation:"tourFadeIn .25s ease both",
        overflow:"hidden"}}>

        {/* Progress bar */}
        <div style={{height:3, background:C.borderLight}}>
          <div style={{height:"100%", width:progress+"%",
            background:`linear-gradient(90deg,${C.orange},${C.blue})`,
            transition:"width .3s ease"}}/>
        </div>

        <div style={{padding:"18px 20px 16px"}}>
          {/* Header row */}
          <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:10}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:28,height:28,borderRadius:8,
                background:`linear-gradient(135deg,${C.orange},#34353b)`,
                display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <HelpCircle size={14} color="#fff"/>
              </div>
              <h3 style={{fontSize:14,fontWeight:800,color:C.text,lineHeight:1.3,margin:0}}>
                {current.title}
              </h3>
            </div>
            <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",
              color:C.muted,padding:4,borderRadius:6,display:"flex",alignItems:"center",
              flexShrink:0,marginLeft:8,marginTop:-2}}>
              <X size={15}/>
            </button>
          </div>

          {/* Content */}
          <p style={{fontSize:13,color:C.textSoft,lineHeight:1.6,margin:0}}>
            {current.content}
          </p>

          {/* Step dots */}
          <div style={{display:"flex",gap:4,justifyContent:"center",margin:"14px 0 0"}}>
            {filteredSteps.map((_,i)=>(
              <button key={i} onClick={()=>setStep(i)}
                style={{width:i===step?18:6,height:6,borderRadius:99,border:"none",cursor:"pointer",
                  background:i===step?C.orange:i<step?C.orange+"60":C.borderLight,
                  padding:0,transition:"all .2s"}}/>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
          padding:"10px 20px 14px",borderTop:`1px solid ${C.border}`}}>
          <span style={{fontSize:11,color:C.muted,fontWeight:600}}>
            {step+1} / {total}
          </span>
          <div style={{display:"flex",gap:8}}>
            {step>0&&(
              <button onClick={()=>setStep(s=>s-1)} style={{
                background:C.offWhite, border:`1px solid ${C.border}`,
                borderRadius:8, padding:"6px 14px", cursor:"pointer",
                fontSize:12, fontWeight:700, color:C.textSoft,
                display:"flex",alignItems:"center",gap:5}}>
                <ArrowLeft size={14}/> Back
              </button>
            )}
            {step===0&&(
              <button onClick={onClose} style={{
                background:"none", border:`1px solid ${C.border}`,
                borderRadius:8, padding:"6px 14px", cursor:"pointer",
                fontSize:12, fontWeight:600, color:C.muted}}>
                Skip
              </button>
            )}
            <button onClick={()=>{ if(isLast){ onClose(); } else { setStep(s=>s+1); } }}
              style={{background:`linear-gradient(135deg,${C.orange},#34353b)`,
                border:"none", borderRadius:8, padding:"6px 16px",
                cursor:"pointer", fontSize:12, fontWeight:800, color:"#fff",
                display:"flex",alignItems:"center",gap:5,
                boxShadow:`0 2px 10px ${C.orange}40`}}>
              {isLast ? <>Finish <Check size={14}/></> : <>Next <ArrowRight size={14}/></>}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// Shown when a route exists but the current role cannot open it.
function AccessDenied(){
  return (
    <div role="alert" style={{maxWidth:420,margin:"48px auto",padding:24,textAlign:"center",background:"#fff",border:`1px solid ${C.border}`,borderRadius:12}}>
      <div style={{fontSize:16,fontWeight:700,color:C.text,marginBottom:6}}>You do not have access to this page</div>
      <div style={{fontSize:13,color:C.muted}}>Ask a workspace admin to grant access, or return to the chat.</div>
    </div>
  );
}

// The workspace shell needs an authenticated user and an active organisation.
// Both come from the public entry in App.jsx, so send the visitor back there.
function SignInRequired(){
  return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:C.offWhite,padding:24}}>
      <div style={{maxWidth:380,textAlign:"center"}}>
        <div style={{fontSize:18,fontWeight:700,color:C.text,marginBottom:8}}>Sign in to continue</div>
        <div style={{fontSize:13,color:C.muted,marginBottom:16}}>Your session has ended or no workspace is selected.</div>
        <button onClick={()=>window.location.assign("/")} style={{padding:"10px 20px",borderRadius:8,border:"none",background:C.blue,color:"#fff",fontWeight:600,cursor:"pointer"}}>Go to sign in</button>
      </div>
    </div>
  );
}

function AppInner(){
  const [user,setUser]         = useState(()=>loadSession());
  const [page,setPage]         = useState("jd-chat");
  // Optional payload set alongside a page navigation (e.g. dashboard "Fix →" links) so the
  // target page can pre-apply a filter. The target page should clear it after reading it.
  const [pageParam,setPageParam] = useState(null);
  const [refreshKey,setRefreshKey] = useState(0);
  const bumpRefresh = ()=>setRefreshKey(k=>k+1);
  const [sideOpen,setSide]     = useState(()=>window.innerWidth>=768);
  const [collapsedGroups,setCollapsedGroups] = useState(new Set());
  const [sidebarSearch,setSidebarSearch] = useState("");
  const sidebarRef = useRef(null);
  const navigationToggleRef = useRef(null);
  const workspaceSwitchRef = useRef(null);
  const [showWorkspaceSwitch,setShowWorkspaceSwitch] = useState(false);
  const [toasts,setToasts]     = useState([]);
  const [showSettings,setShowSettings] = useState(false); // kept for legacy; now uses setPage("settings")
  const [showProfile,setShowProfile]   = useState(false);
  const [showLogout,setShowLogout]     = useState(false);
  const [showTour,setShowTour]         = useState(false);
  // showInactivityWarning replaced by useInactivityTimeout hook below
  const [rolePerms,setRolePerms]       = useState([]);
  const [userPerms,setUserPerms]       = useState([]);
  const [ownerPermissions,setOwnerPermissions]=useState({scope:null,status:"idle"});
  const [inactivityMs,setInactivityMs] = useState(5*60*1000); // configurable via school_settings
  const {orgName:_sidebarSchoolName,workspaceType,terms} = useOrganization();
  // ← Must be declared here — before any conditional returns — to satisfy Rules of Hooks
  const isMobile = useIsMobile();

  // ── Inactivity timeout — value loaded from school_settings on login ──────────
  const _inactivityWarning = inactivityMs >= 99999*60*1000 ? 60000 : Math.min(60000, Math.max(30000, inactivityMs*0.2));
  const inactivity = useInactivityTimeout({ active: !!user, timeout: inactivityMs, warningTime: _inactivityWarning });

  let _tid=0;
  const notify=(msg,type="success")=>{
    const id=Date.now()+(++_tid);
    setToasts(p=>[...p,{id,msg,type}]);
  };
  const rmToast=id=>setToasts(p=>p.filter(t=>t.id!==id));

  // Load permissions when user logs in
  useEffect(()=>{
    if(!user) return;
    if(user.role==="owner"){
      let current=true;const scope=ownerNavigationScope(user);
      setRolePerms([]);setUserPerms([]);setOwnerPermissions({scope,status:"loading"});
      readOwnerNavigationPermissions(db,user).then(result=>{
        if(!current)return;
        setRolePerms(result.rolePermissions);setUserPerms(result.userPermissions);setOwnerPermissions({scope:result.scope,status:"ready"});
      }).catch(()=>{if(current)setOwnerPermissions({scope,status:"error"});});
      return()=>{current=false;};
    }
    if(user.role==="admin") return;
    Promise.all([
      db.getRolePermissions(user.role),
      db.getUserPermissions(user._authUserId||user.id),
    ]).then(([rp,up])=>{
      setRolePerms(rp.data||[]);
      setUserPerms(up.data||[]);
    });
  },[user]);

  // Auto-start tour on first login for this user
  useEffect(()=>{
    if(!user) return;
    const uid = user._authUserId || user.id;
    const key = `jd_tour_done_${uid}`;
    try { if(!localStorage.getItem(key)){ setTimeout(()=>setShowTour(true),1800); } }
    catch(e){}
  },[user?._authUserId||user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load inactivity timeout setting from school_settings on login
  useEffect(()=>{
    if(!user) return;
    db.getSettings().then(({data})=>{
      const m={};
      (data||[]).forEach(r=>{m[r.key]=r.value;});
      const mins=parseInt(m.inactivity_timeout_minutes||"5",10);
      if(isNaN(mins)||mins<=0) setInactivityMs(99999*60*1000); // "Never"
      else setInactivityMs(mins*60*1000);
    });
  },[user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // (inactivity timeout handled by useInactivityTimeout hook above)

  const doLogout=async(kicked=false)=>{
    if(kicked){
      try{sessionStorage.setItem('jd_kicked_out','1');}catch{}
    } else {
      // Manual logout — stamp a flag so any concurrent token-check race can't
      // show the "signed in on another device" banner after a normal sign-out.
      try{sessionStorage.setItem('jd_manual_logout','1');}catch{}
    }
    clearSession();
    // Keep Supabase Auth and the legacy portal session in sync. Without this,
    // the public SaaS shell would restore the same account after a hard reload.
    try{await supabase.auth.signOut();}catch{}
    // Hard reload clears React state and returns the user to the public site.
    window.location.reload();
  };

  // Trigger logout when inactivity hook says time is up
  useEffect(()=>{
    if(inactivity.shouldLogout) doLogout();
  },[inactivity.shouldLogout]); // eslint-disable-line react-hooks/exhaustive-deps


  // ── Organization context (multi-tenant) ────────────────────────────────────────
  const [selectedSchool,setSelectedSchool]=useState(()=>loadSelectedSchool());

  useEffect(()=>{
    setSidebarSearch("");
    setCollapsedGroups(defaultCollapsedGroups(page));
  },[user?.id,user?.role,selectedSchool?.id]);

  // A route opened by a dashboard or tour should reveal its containing department.
  useEffect(()=>{
    const group=businessGroupForPage(page);
    if(group) setCollapsedGroups(previous=>{const next=new Set(previous);next.delete(group);return next;});
  },[page]);

  useEffect(()=>{
    if(!isMobile || !sideOpen || !user || !selectedSchool || !sidebarRef.current) return;
    return bindMobileNavigation(sidebarRef.current,{
      onClose:()=>setSide(false),returnFocus:navigationToggleRef.current
    });
  },[isMobile,sideOpen,user?.id,user?.role,selectedSchool?.id]);

  // db school context is set synchronously at module load (see IIFE above loadSelectedSchool).
  // No useEffect needed here — _schoolId is already correct before any component renders.

  const switchWorkspace=()=>signOutForWorkspaceSwitch({
    signOut:options=>supabase.auth.signOut(options),
    clearSession,clearWorkspace:clearSelectedSchool,
    resetContext:()=>db.setSchool(null),leave:()=>window.location.assign("/"),
  });

  // ── Compact grouped NAV ──
  // Admin: grouped by category with dividers
  // Staff/Member: only permitted pages
  const ALL_NAV = WORKSPACE_NAVIGATION;

  // Check if user can access a page (admin always yes)
  const canAccess=(pageId)=>{
    if(!user||user.role==="admin") return true;
    if(user.role==="owner"&&(ownerPermissions.scope!==ownerNavigationScope(user)||ownerPermissions.status!=="ready"))return false;
    // Build all lookup keys: bare id + "page:"-prefixed id (for pages), both directions.
    // DB may store "my-classes" (old seed) OR "page:my-classes" (Settings UI save) — handle both.
    const keys=new Set([pageId]);
    if(!pageId.includes(":"))         keys.add("page:"+pageId);   // "my-classes" → "page:my-classes"
    else if(pageId.startsWith("page:"))keys.add(pageId.slice(5)); // "page:my-classes" → "my-classes"
    const keyArr=[...keys];

    // Helper: pick the best match from a list — prefer prefixed ("page:xxx") over bare
    const bestMatch=(list)=>{
      const prefixed=list.find(p=>p.page_id.startsWith("page:")||p.page_id.startsWith("action:"));
      return prefixed||list[0];
    };

    // User-specific override wins first
    const uMatches=userPerms.filter(p=>keyArr.includes(p.page_id));
    if(uMatches.length>0) return bestMatch(uMatches).allowed;

    // Role permission from DB
    const rMatches=rolePerms.filter(p=>keyArr.includes(p.page_id));
    if(rMatches.length>0) return bestMatch(rMatches).allowed;

    // Fall back: PERM_ROLE_DEFAULTS
    const defaults=PERM_ROLE_DEFAULTS[user.role]||[];
    if(keyArr.some(k=>defaults.includes(k))) return true;
    // Final fallback: nav definition — if the page lists this role, allow it
    const navEntry=ALL_NAV.find(n=>n.id===pageId||n.id==="page:"+pageId);
    if(navEntry&&navEntry.roles&&navEntry.roles.includes(user.role)) return true;
    return false; // deny by default
  };

  // Sign-in and organisation selection happen in the public entry (App.jsx).
  // Without both, return to it rather than rendering a partial workspace.
  if(!selectedSchool||!user) return <SignInRequired/>;

  const role=user.role;


  const NAV = buildWorkspaceNavigation({role,canAccess});

  const navigationQuery = sideOpen || isMobile ? sidebarSearch : "";
  const visibleNavigation = searchNavigation(NAV,navigationQuery);
  const groupCollapsed = (id) => isNavGroupCollapsed(id,collapsedGroups,navigationQuery,sideOpen||isMobile);

  const ctx={user,role,notify,setPage,canAccess,refreshKey,bumpRefresh,selectedSchool,pageParam,setPageParam,workspaceType,terms};

  // On mobile the sidebar is always a full overlay; on desktop it collapses to icon rail
  const closeSideOnMobile = () => {
    if(isMobile){setSide(false);navigationToggleRef.current?.focus();}
  };

  // Mobile in-app PDF viewer — covers everything


  return(
    <div className="jd-workspace-shell" inert={showWorkspaceSwitch ? "" : undefined} style={{display:"flex",minHeight:"100vh",background:C.offWhite,
      fontFamily:"'JD Inter',system-ui,sans-serif",transition:"background .2s"}}>


      {/* Mobile backdrop */}
      {isMobile&&sideOpen&&(
        <div onClick={closeSideOnMobile}
          style={{position:"fixed",inset:0,background:"rgba(6,6,6,.55)",
            zIndex:498,backdropFilter:"blur(2px)"}}/>
      )}

      {/* SIDEBAR */}
      <aside id="workspace-navigation" ref={sidebarRef} tabIndex={-1} aria-label="Workspace navigation"
        role={isMobile?"dialog":undefined} aria-modal={isMobile&&sideOpen?true:undefined}
        aria-hidden={isMobile&&!sideOpen ? true : undefined} inert={isMobile&&!sideOpen ? "" : undefined}
        style={{
        width: isMobile ? "min(280px, 88vw)" : (sideOpen?230:56),
        background:"linear-gradient(180deg,#080808 0%,#101010 55%,#080808 100%)",
        transition:"width .25s cubic-bezier(.4,0,.2,1), transform .25s cubic-bezier(.4,0,.2,1)",
        flexShrink:0,display:"flex",flexDirection:"column",
        position: isMobile ? "fixed" : "sticky",
        top:0, left:0,
        height:"100dvh",zIndex: isMobile ? 499 : "auto",
        overflow:"hidden",
        boxShadow:"4px 0 24px rgba(0,0,0,.15)",
        transform: isMobile ? (sideOpen?"translateX(0)":"translateX(-100%)") : "none",
      }}>

        {/* Logo / Brand */}
        <div style={{padding:"16px 12px",display:"flex",alignItems:"center",gap:10,
          borderBottom:"1px solid rgba(255,255,255,.08)",flexShrink:0,minHeight:60}}>
          <div style={{flexShrink:0,transition:"all .2s"}}><Logo size={32}/></div>
          {(sideOpen||isMobile)&&(
            <div style={{overflow:"hidden",transition:"opacity .2s"}}>
              <div style={{color:"#fff",fontWeight:900,fontSize:12,lineHeight:1.2,letterSpacing:.2,
                whiteSpace:"nowrap"}}>James-Denning</div>
              <div style={{color:"rgba(255,255,255,.4)",fontSize:9,textTransform:"uppercase",
                letterSpacing:.3,marginTop:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={_sidebarSchoolName||"Your organisation"}>{_sidebarSchoolName||"Your organisation"}</div>
            </div>
          )}
        </div>

        <button ref={workspaceSwitchRef} type="button" aria-label="Switch organisation" aria-haspopup="dialog"
          title={`Switch organisation — ${_sidebarSchoolName||"Your organisation"}`}
          onClick={()=>{closeSideOnMobile();setShowWorkspaceSwitch(true);}}
          style={{margin:"10px 8px 0",padding:"10px 8px",minHeight:40,display:"flex",alignItems:"center",justifyContent:sideOpen||isMobile?"flex-start":"center",gap:8,borderRadius:9,border:"1px solid rgba(255,255,255,.18)",background:"rgba(255,255,255,.06)",color:"#dedfe4",cursor:"pointer",flexShrink:0,fontSize:12}}>
          <Building2 size={16} aria-hidden="true" style={{flexShrink:0}}/>
          {(sideOpen||isMobile)&&<span>Switch organisation</span>}
        </button>

        {(sideOpen||isMobile)&&<div style={{padding:"10px 10px 4px",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:7,border:"1px solid rgba(255,255,255,.18)",borderRadius:9,padding:"6px 8px",color:"#a3a4ad"}}>
            <Search size={14} aria-hidden="true"/>
            <input type="search" aria-label="Search workspace navigation" placeholder="Find a page or department"
              value={sidebarSearch} onChange={e=>setSidebarSearch(e.target.value)}
              style={{width:"100%",minWidth:0,background:"transparent",color:"#fff",border:0,fontSize:12,padding:"5px 0"}}/>
            {sidebarSearch&&<button type="button" aria-label="Clear navigation search" onClick={()=>{setSidebarSearch("");sidebarRef.current?.querySelector('input[type="search"]')?.focus();}}
              style={{background:"none",border:0,color:"#fff",cursor:"pointer",padding:4,display:"flex"}}><X size={14}/></button>}
          </div>
          {isMobile&&<button type="button" onClick={closeSideOnMobile} style={{background:"none",border:0,color:"#d0d4da",padding:"10px 0",cursor:"pointer",fontSize:12}}>Close navigation</button>}
        </div>}
        <nav aria-label="Workspace pages" style={{flex:1,minHeight:0,padding:"8px 6px",overflowY:"auto",overscrollBehavior:"contain",WebkitOverflowScrolling:"touch"}}>
          {role==="owner"&&ownerPermissions.status!=="ready"&&<p role={ownerPermissions.status==="error"?"alert":"status"} style={{fontSize:11,color:"#a3a4ad",padding:"0 10px"}}>{ownerPermissions.status==="error"?"Owner navigation permissions could not be confirmed. Sign in again or contact an administrator.":"Checking owner navigation permissions…"}</p>}
          {navigationQuery.trim()&&<p role="status" style={{fontSize:11,color:"#a3a4ad",padding:"0 10px"}}>{visibleNavigation.filter(n=>!n.group).length} matching pages</p>}
          {visibleNavigation.map((n,i)=>{
            // ── Group header ──
            if(n.group){
              if(!sideOpen) return <div key={n.id} style={{margin:"6px 4px",height:1,background:"rgba(255,255,255,.07)"}}/>;
              const collapsed=groupCollapsed(n.id);
              return(
                <button key={n.id} type="button" aria-expanded={!collapsed} disabled={Boolean(navigationQuery.trim())} onClick={()=>setCollapsedGroups(prev=>{
                  const s=new Set(prev);
                  s.has(n.id)?s.delete(n.id):s.add(n.id);
                  return s;
                })}
                  style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",
                    padding:"10px 9px 5px",fontSize:9.5,fontWeight:800,letterSpacing:1.4,
                    textTransform:"uppercase",color:"#a3a4ad",background:"none",
                    border:"none",cursor:"pointer",textAlign:"left",marginTop:6,
                    transition:"color .15s"}}
                  onMouseEnter={e=>e.currentTarget.style.color="#fff"}
                  onMouseLeave={e=>e.currentTarget.style.color="#a3a4ad"}>
                  <span>{n.group}</span>
                  <span style={{fontSize:9,transition:"transform .2s",
                    transform:collapsed?"rotate(-90deg)":"rotate(0deg)"}}><ChevronDown size={12}/></span>
                </button>
              );
            }
            // ── Child item: hide when group is collapsed ──
            if(n.gid&&groupCollapsed(n.gid)) return null;
            const active=page===n.id;
            return(
              <button key={n.id+i} type="button" aria-label={n.label} aria-current={active?"page":undefined} data-tour={`nav-${n.id}`} onClick={()=>{setPage(n.id);setSidebarSearch("");closeSideOnMobile();}}
                title={!sideOpen?n.label:""}
                style={{width:"100%",display:"flex",alignItems:"center",gap:9,
                  padding:sideOpen?"8px 10px":"10px",
                  borderRadius:10,border:"none",cursor:"pointer",marginBottom:1,
                  background:active?`linear-gradient(90deg,${C.orange}2a,rgba(255,255,255,.04))`:"transparent",
                  color:active?"#fff":"rgba(255,255,255,.5)",
                  fontSize:12,fontWeight:active?700:400,
                  transition:"all .15s ease",textAlign:"left",
                  position:"relative",
                  justifyContent:sideOpen?"flex-start":"center"}}
                onMouseEnter={e=>{if(!active){e.currentTarget.style.background="rgba(255,255,255,.07)";e.currentTarget.style.color="rgba(255,255,255,.8)";}}}
                onMouseLeave={e=>{if(!active){e.currentTarget.style.background="transparent";e.currentTarget.style.color="rgba(255,255,255,.5)";}}}
              >
                {active&&<div style={{position:"absolute",left:0,top:"12%",bottom:"12%",
                  width:4,borderRadius:"0 4px 4px 0",background:C.orange,
                  boxShadow:`0 0 10px ${C.orange}99`}}/>}
                <AppIcon name={n.icon} size={16} color={active?C.orange:"#60616b"}/>
                {(sideOpen||isMobile)&&<span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1,
                  letterSpacing:".01em"}}>{n.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* User / Sign Out */}
        <div style={{padding:"10px 6px",borderTop:"1px solid rgba(255,255,255,.08)",flexShrink:0}}>
          <button aria-label="My profile" title="My profile" onClick={()=>{setShowProfile(true);closeSideOnMobile();}}
              style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:10,padding:sideOpen||isMobile?"10px":"8px 0",
                borderRadius:10,border:"1px solid rgba(255,255,255,.1)",cursor:"pointer",marginBottom:6,
                background:"rgba(255,255,255,.06)",color:"#fff",textAlign:"left",
                transition:"all .15s"}}
              onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,.12)";}}
              onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,.06)";}}>
              <div style={{width:30,height:30,borderRadius:9,
                background:`linear-gradient(135deg,${C.orange},#34353b)`,
                display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:13,fontWeight:900,flexShrink:0,color:"#fff",
                boxShadow:"0 2px 8px rgba(112,112,112,.4)"}}>
                {(user.name||"?")[0].toUpperCase()}
              </div>
              {(sideOpen||isMobile)&&<div style={{overflow:"hidden",flex:1}}>
                <div style={{fontWeight:700,fontSize:12,overflow:"hidden",textOverflow:"ellipsis",
                  whiteSpace:"nowrap",color:"#fff",lineHeight:1.2}}>{user.name}</div>
                <div style={{fontSize:9.5,color:"rgba(255,255,255,.4)",textTransform:"uppercase",
                  letterSpacing:.8,marginTop:2}}>{role}</div>
              </div>}
              {(sideOpen||isMobile)&&<span style={{color:"rgba(255,255,255,.3)",fontSize:12}}>›</span>}
          </button>
          <button aria-label="Sign out" title="Sign out" onClick={()=>{closeSideOnMobile();setShowLogout(true);}}
            style={{width:"100%",display:"flex",alignItems:"center",
              gap:(sideOpen||isMobile)?7:0,justifyContent:(sideOpen||isMobile)?"flex-start":"center",
              padding:"9px 10px",borderRadius:10,border:"none",cursor:"pointer",
              background:"rgba(142,142,142,.1)",color:"rgba(183,183,183,.9)",
              fontSize:11.5,fontWeight:600,transition:"all .15s"}}
            onMouseEnter={e=>{e.currentTarget.style.background="rgba(142,142,142,.2)";e.currentTarget.style.color="#a3a4ad";}}
            onMouseLeave={e=>{e.currentTarget.style.background="rgba(142,142,142,.1)";e.currentTarget.style.color="rgba(183,183,183,.9)";}}>
            <LogOut size={14}/>{(sideOpen||isMobile)&&<span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0,
        marginLeft: isMobile ? 0 : undefined}}>
        <header className="reference-workspace-header" style={{background:C.white,borderBottom:`1px solid ${C.border}`,
          padding:`0 ${isMobile?10:18}px`,height:54,display:"flex",alignItems:"center",
          justifyContent:"space-between",position:"sticky",top:0,zIndex:200,
          boxShadow:"0 1px 0 rgba(0,0,0,.06),0 2px 8px rgba(0,0,0,.04)"}}>
          <div className="reference-header-left" style={{display:"flex",alignItems:"center",gap:8,minWidth:0,flex:1}}>
            <button data-tour="workspace-menu" ref={navigationToggleRef} aria-label={sideOpen?"Close or collapse navigation":"Open navigation"} aria-expanded={sideOpen} aria-controls="workspace-navigation" onClick={()=>setSide(p=>!p)}
              style={{background:"none",border:`1px solid ${C.border}`,cursor:"pointer",
                color:C.muted,padding:"7px 9px",borderRadius:9,
                display:"flex",alignItems:"center",transition:"all .15s",minWidth:36,minHeight:36,
                justifyContent:"center"}}
              onMouseEnter={e=>{e.currentTarget.style.background=C.offWhite;e.currentTarget.style.borderColor=C.blue+"30";}}
              onMouseLeave={e=>{e.currentTarget.style.background="none";e.currentTarget.style.borderColor=C.border;}}>
              <AppIcon name="menu" size={18} color={C.muted}/>
            </button>
            <ReferenceBrand/>
          </div>
          <div className="reference-header-controls" style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>

            <DarkToggle compact/>
            <button data-tour="tour-trigger"
              onClick={()=>setShowTour(true)}
              title="Help / Product Tour"
              style={{background:C.offWhite,border:`1px solid ${C.border}`,
                borderRadius:9,width:36,height:36,cursor:"pointer",
                display:"flex",alignItems:"center",justifyContent:"center",
                color:C.muted,transition:"all .15s"}}
              onMouseEnter={e=>{e.currentTarget.style.background=C.orangePale;e.currentTarget.style.borderColor=C.orange+"40";e.currentTarget.style.color=C.orange;}}
              onMouseLeave={e=>{e.currentTarget.style.background=C.offWhite;e.currentTarget.style.borderColor=C.border;e.currentTarget.style.color=C.muted;}}>
              <HelpCircle size={16}/>
            </button>
            <NotificationBell ctx={ctx}/>
            <button className="reference-profile" aria-label="My profile" onClick={()=>setShowProfile(true)}
              style={{width:34,height:34,borderRadius:10,
                background:`linear-gradient(135deg,${C.blue},${C.blueDark})`,
                color:"#fff",fontSize:13,fontWeight:900,cursor:"pointer",
                display:"flex",alignItems:"center",justifyContent:"center",
                boxShadow:`0 2px 8px ${C.blue}40`}}
              title="My Profile">
              {(user.name||"?").trim().split(/\s+/).map(part=>part[0]).slice(0,2).join("").toUpperCase()}
            </button>

          </div>
        </header>


        <main className={page==="jd-chat"?"jd-workspace-chat":"jd-workspace-page"} style={{flex:1,padding:page==="jd-chat"?0:(isMobile?12:20),overflowY:"auto",background:page==="jd-chat"?"#f8f9fa":C.offWhite,transition:"background .2s"}}>
          {page==="jd-chat"       && (role!=="owner"||canAccess("jd-chat") ? <ChatHome key={JSON.stringify([selectedSchool?.id,user?._authUserId||user?.id,user?.role])} user={user} organizationId={selectedSchool?.id} organizationName={selectedSchool?.name||"Your organisation"}/> : <AccessDenied/>)}
          {page==="jd-operations" && (canOpenOperations(role)&&canAccess("jd-operations") ? <JDOperationsPage key={JSON.stringify([selectedSchool?.id,user?._authUserId||user?.id,user?.role])} ctx={ctx}/> : <AccessDenied/>)}
          {page==="hiring"        && (canAccess("hiring")       ?<HiringPage ctx={ctx}/>             :<AccessDenied/>)}
          {page==="mail-logs"     && (canAccess("mail-logs")    ?<MailLogsPage ctx={ctx}/>           :<AccessDenied/>)}
          {page==="notifications" && (canAccess("notifications")?<NotificationsPage ctx={ctx}/>      :<AccessDenied/>)}
          {page==="audit-log"     && (canAccess("audit-log")    ?<AuditLogPage ctx={ctx}/>           :<AccessDenied/>)}
          {page==="admin-tools"   && (role==="admin"            ?<AdminToolsPage ctx={ctx}/>         :<AccessDenied/>)}
          {page==="permissions"   && (role==="admin"            ?<PermissionsPage ctx={ctx}/>        :<AccessDenied/>)}
          {page==="settings"      && (role==="admin"            ?<SettingsPage ctx={{...ctx,notify}}/>:<AccessDenied/>)}
          {page==="org-create"         && <OrgPresetSelectPage ctx={ctx}/>}
          {page==="org-create-details" && <OrgCreatePage ctx={ctx}/>}
        </main>
      </div>


      {showWorkspaceSwitch&&<WorkspaceSwitchDialog organisation={_sidebarSchoolName||selectedSchool?.name}
        onClose={()=>setShowWorkspaceSwitch(false)} onSwitch={switchWorkspace}
        returnFocus={isMobile?navigationToggleRef.current:workspaceSwitchRef.current}/>}

      {/* Profile modal */}
      {showProfile&&(
        <ProfileModal user={user} notify={notify} onClose={()=>setShowProfile(false)}
          onUpdated={(u)=>{saveSession(u);setUser(u);}}/>
      )}

      {inactivity.showWarning&&(
        <InactivityWarningModal
          secondsLeft={inactivity.secondsLeft}
          onStay={inactivity.stayLoggedIn}
          onLogout={doLogout}/>
      )}

      {/* Logout dialog */}
      {showLogout&&<LogoutDialog onConfirm={doLogout} onCancel={()=>setShowLogout(false)}/>}

      {/* Onboarding tour */}
      <TourSystem
        userId={user._authUserId||user.id}
        role={role}
        canAccess={canAccess}
        setPage={setPage}
        isMobile={isMobile}
        show={showTour}
        onClose={()=>{
          setShowTour(false);
          const uid=user._authUserId||user.id;
          try{ localStorage.setItem(`jd_tour_done_${uid}`,"1"); }catch(e){}
        }}/>

      <div style={{position:"fixed",
        ...(isMobile
          ? {bottom:16,left:"50%",transform:"translateX(-50%)",alignItems:"center",width:"calc(100% - 32px)"}
          : {top:66,right:14}),
        zIndex:9999,display:"flex",flexDirection:"column",gap:8}}>
        {toasts.map(t=><Toast key={t.id} t={t} rm={rmToast}/>)}
      </div>

      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:'JD Inter',system-ui,-apple-system,sans-serif;}
        input,select,textarea{color:${C.text}!important;background:${C.white}!important;font-family:inherit;}
        input::placeholder,textarea::placeholder{color:${C.light}!important;}
        table{color:${C.text};width:100%;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        @keyframes modalUp{from{opacity:0;transform:translateY(20px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
        @keyframes sheetUp{from{opacity:0;transform:translateY(100%)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}
        @keyframes slideInRight{from{opacity:0;transform:translateX(30px)}to{opacity:1;transform:translateX(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
        @keyframes tourFadeIn{from{opacity:0;transform:scale(.95) translateY(-6px)}to{opacity:1;transform:scale(1) translateY(0)}}
        @keyframes tourPulse{0%,100%{box-shadow:0 0 0 4px rgba(112,112,112,.3)}50%{box-shadow:0 0 0 8px rgba(112,112,112,.15),0 0 0 4px rgba(112,112,112,.4)}}
        ::-webkit-scrollbar{width:5px;height:5px}
        ::-webkit-scrollbar-thumb{background:${C.border};border-radius:10px}
        ::-webkit-scrollbar-track{background:transparent}
        aside::-webkit-scrollbar{display:none}
        button{font-family:inherit;}
        .hover-lift:hover{transform:translateY(-2px);box-shadow:${C.shadowMd}!important;}

        /* ── TABLE SCROLL WRAPPER ── */
        .tbl-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;border-radius:12px;}
        .tbl-wrap table{min-width:560px;}

        /* ── MOBILE OVERRIDES ── */
        @media(max-width:767px){
          /* Prevent iOS input zoom (must be 16px) */
          input,select,textarea{font-size:16px!important;}

          /* Touch targets */
          button{min-height:40px;}

          /* Tables always scroll — :has() auto-wraps any parent div */
          /* Was a blanket 520px floor, which forced even a two-column table —
             and every empty-state row — wider than the phone, so the message
             sat off-screen and had to be scrolled to. The floor now belongs to
             deliberately wide tables (.tbl-wrap) only; wide tables still
             overflow and still scroll inside their wrapper. */
          table{min-width:100%;}
          div:has(>table),div:has(>div>table){overflow-x:auto!important;-webkit-overflow-scrolling:touch!important;}
          .tbl-wrap{-webkit-overflow-scrolling:touch;}

          /* Hard grids collapse to 1 col */
          div[style*="repeat(3,"]{grid-template-columns:minmax(0,1fr)!important;}
          div[style*="repeat(4,"]{grid-template-columns:repeat(2,minmax(0,1fr))!important;}

          /* Softer grids — raise minmax floor */
          div[style*="minmax(300px"]{grid-template-columns:1fr!important;}
          div[style*="minmax(250px"]{grid-template-columns:1fr!important;}
          div[style*="minmax(220px"]{grid-template-columns:1fr!important;}
          div[style*="minmax(200px"]{grid-template-columns:1fr!important;}

          /* Page-level max-width reset */
          main > div[style*="maxWidth"]{max-width:100%!important;}

          /* Card padding reduce */

          /* Stat cards 2-col */
          .stat-grid{grid-template-columns:1fr 1fr!important;}

          /* Modals: make form rows stack */
          .form-row{flex-direction:column!important;}

          /* Section selector hide scrollbar */
          div::-webkit-scrollbar{display:none;}
        }
      `}</style>
    </div>
  );
}





































// ─── ATTENDANCE PAGE ──────────────────────────────────────────────────────────

// ─── MAIL COMPOSE PAGE ────────────────────────────────────────────────────────

// ─── RECYCLE BIN PAGE ─────────────────────────────────────────────────────────

// ─── NOTIFICATION BELL ────────────────────────────────────────────────────────
function NotificationBell({ctx}){
  const{user,setPage}=ctx;
  const isMobile=useIsMobile();
  const[open,setOpen]=useState(false);
  const[notifs,setNotifs]=useState([]);
  const[unread,setUnread]=useState(0);
  const ref=useRef(null);
  const recipientId=user?.role==="admin"?"admin":(user?._authUserId||user?.id);

  const load=async()=>{
    if(!recipientId)return;
    const{data}=user?.role==="admin"?await db.getAdminNotifications(25):await db.getNotifications(String(recipientId),25);
    setNotifs(data||[]);
    setUnread((data||[]).filter(n=>!n.read_at).length);
  };
  useEffect(()=>{load();const t=setInterval(load,60000);return()=>clearInterval(t);},[recipientId]);
  useEffect(()=>{
    const h=(e)=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};
    document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h);
  },[]);

  const markRead=async(n)=>{
    if(!n.read_at){await db.markNotificationRead(n.id);setUnread(p=>Math.max(0,p-1));setNotifs(p=>p.map(x=>x.id===n.id?{...x,read_at:new Date().toISOString()}:x));}
    if(n.link_page){setOpen(false);setPage(n.link_page);}
  };
  const markAll=async()=>{await db.markAllNotificationsRead(String(recipientId));setNotifs(p=>p.map(x=>({...x,read_at:x.read_at||new Date().toISOString()})));setUnread(0);};

  const typeColors={info:C.blue,success:C.green,warning:C.orange,alert:C.red};
  const typeIcons={info:Info,success:CheckCircle2,warning:AlertTriangle,alert:AlertCircle};
  return(
    <div ref={ref} style={{position:"relative"}}>
      <button aria-label="Notifications" aria-expanded={open} onClick={()=>{setOpen(p=>!p);if(!open)load();}}
        style={{position:"relative",background:C.offWhite,border:`1px solid ${C.border}`,borderRadius:9,
          width:36,height:36,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:C.muted}}>
        <Bell size={16}/>
        {unread>0&&(
          <span style={{position:"absolute",top:-4,right:-4,background:C.red,color:"#fff",
            borderRadius:"50%",width:16,height:16,fontSize:9,fontWeight:900,
            display:"flex",alignItems:"center",justifyContent:"center",border:"2px solid "+C.white}}>
            {unread>9?"9+":unread}
          </span>
        )}
      </button>
      {open&&(
        <div style={{position:"absolute",top:44,right:isMobile?-38:0,width:340,
          maxWidth:"calc(100vw - 16px)",maxHeight:480,
          background:C.white,border:`1px solid ${C.border}`,borderRadius:14,
          boxShadow:"0 16px 48px rgba(0,0,0,.18)",zIndex:9000,display:"flex",flexDirection:"column",overflow:"hidden"}}>
          <div style={{padding:"12px 16px",borderBottom:`1px solid ${C.border}`,
            display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <span style={{fontWeight:800,fontSize:13,color:C.text}}>Notifications</span>
            {unread>0&&<button onClick={markAll} style={{background:"none",border:"none",color:C.blue,fontSize:11,cursor:"pointer",fontWeight:700}}>Mark all read</button>}
          </div>
          <div style={{overflowY:"auto",flex:1}}>
            {notifs.length===0?(
              <div style={{padding:32,textAlign:"center",color:C.light,fontSize:12}}>
                <Bell size={28} color={C.border} style={{marginBottom:8}}/>
                <div>No notifications yet</div>
              </div>
            ):notifs.map((n,i)=>{
              const Ico=typeIcons[n.type]||Info;
              const col=typeColors[n.type]||C.blue;
              const ago=getTimeAgo(n.created_at);
              return(
                <div key={n.id} onClick={()=>markRead(n)}
                  style={{padding:"11px 16px",borderBottom:i<notifs.length-1?`1px solid ${C.border}`:"none",
                    cursor:n.link_page?"pointer":"default",
                    background:n.read_at?"transparent":col+"08",
                    display:"flex",gap:10,alignItems:"flex-start",transition:"background .15s"}}
                  onMouseEnter={e=>{e.currentTarget.style.background=C.offWhite;}}
                  onMouseLeave={e=>{e.currentTarget.style.background=n.read_at?"transparent":col+"08";}}>
                  <div style={{width:28,height:28,borderRadius:8,background:col+"18",flexShrink:0,
                    display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <Ico size={14} color={col}/>
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:n.read_at?600:800,color:C.text,lineHeight:1.4}}>{n.title}</div>
                    {n.body&&<div style={{fontSize:11,color:C.muted,marginTop:2,lineHeight:1.4}}>{n.body}</div>}
                    <div style={{fontSize:10,color:C.light,marginTop:3}}>{ago}</div>
                  </div>
                  {!n.read_at&&<div style={{width:7,height:7,borderRadius:"50%",background:col,flexShrink:0,marginTop:4}}/>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
function getTimeAgo(ts){
  const s=Math.floor((Date.now()-new Date(ts))/1000);
  if(s<60)return"Just now";if(s<3600)return`${Math.floor(s/60)}m ago`;
  if(s<86400)return`${Math.floor(s/3600)}h ago`;
  return`${Math.floor(s/86400)}d ago`;
}









// ─── DATA EXPORT PAGE ─────────────────────────────────────────────────────────

// ─── ACTIVITY ANALYTICS PAGE ──────────────────────────────────────────────────

// ─── BROADSHEET ───────────────────────────────────────────────────────────────
// Builds the full HTML for PDF print/save. Called by BroadsheetPage.exportPDF.


// ─── AUDIT LOG PAGE ───────────────────────────────────────────────────────────

// ─── BULK PROMOTION PAGE ──────────────────────────────────────────────────────
