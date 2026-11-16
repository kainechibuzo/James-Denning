import React, { lazy, useState, useEffect, useMemo, useCallback, createContext, useContext, Component, useRef } from "react";
import { LayoutDashboard, Users, GraduationCap, BookUser, School, BookOpen, Layers, Paperclip, BarChart3, FileText, ScrollText, ShieldCheck, Settings2, ListChecks, Tag, FileStack, Zap, CreditCard, TrendingUp, Megaphone, ClipboardCheck, Mail, Inbox, ArrowUpCircle, History, CheckCircle2, UserPlus, Upload, Wallet, MessageSquare, Settings, BadgeCheck, ReceiptText, Link2, Bell, ChevronRight, Plus, Pencil, Trash2, Eye, EyeOff, Download, Send, Search, Filter, RefreshCw, X, Check, AlertTriangle, Info, LogOut, User, ChevronDown, ChevronUp, MoreHorizontal, Calendar, CalendarDays, CalendarCheck, Clock, Star, Heart, Home, Menu, Lock, Unlock, Shield, Key, Globe, Phone, MapPin, Building2, Image, File, Folder, Archive, Database, Activity, PieChart, BarChart2, LineChart, Hash, AtSign, Link, ExternalLink, Copy, Share2, Printer, Save, RotateCcw, RotateCw, ZoomIn, ZoomOut, Maximize, Minimize, HelpCircle, BookMarked, FlaskConical, Award, Clipboard, ClipboardList, UserCircle, UserCheck, UserX, UserMinus, UsersRound, BriefcaseBusiness, Banknote, Receipt, PiggyBank, TrendingDown, DollarSign, Percent, Calculator, ListOrdered, ListTree, Grid2x2, Columns2, Rows2, AlignLeft, AlignCenter, CircleCheck, CircleX, CircleAlert, CircleDot, CheckSquare, Square, Circle, Triangle, Hexagon, Bookmark, BookmarkCheck, Flag, FlagOff, Target, Crosshair, Compass, Map as MapIcon, Navigation, Bus, Car, Plane, Train, Package, Box, Boxes, ShoppingCart, ShoppingBag, Store, Building, Hotel, Hospital, Church, Landmark, PenLine, Pen, Type, Bold, Italic, Underline, Strikethrough, Subscript, Superscript, AlignJustify, IndentIncrease, IndentDecrease, List, TableProperties, Table, LayoutGrid, LayoutList, LayoutPanelLeft, Sidebar, SidebarClose, SidebarOpen, PanelLeft, PanelRight, Columns, Rows, MoveHorizontal, MoveVertical, Move, Maximize2, Minimize2, SquarePlus, SquareMinus, SquareCheck, SquareX, PlusCircle, MinusCircle, XCircle, AlertCircle, CheckCircle, Loader2, WifiOff, Wifi, ArrowRight, ArrowLeft, KeyRound } from "lucide-react";
import ReactDOM from "react-dom";
import { db, supabase } from "./supabaseClient.js";
import { useInactivityTimeout } from "./useInactivityTimeout.js";
// -- SHARED CONTEXT IMPORTS (src/contexts/ -- shared with pages/) ---------------
import { DarkCtx, useDark } from './contexts/dark.jsx';
import { ConfirmProvider, useConfirm } from './contexts/confirm.jsx';
import { SectionCtx, useSection, SectionProvider } from './contexts/section.jsx';
import { LIGHT as THEME_LIGHT, DARK as THEME_DARK, setTheme } from './config/theme.js';
import { PRODUCT, getTerms, EDUCATION_NAV_LABELS } from './config/product.js';
import { ChatHome } from "./chat/ChatHome.jsx";
import { searchNavigation, isNavGroupCollapsed } from "./config/navigation-search.mjs";
import { bindMobileNavigation } from "./components/mobile-navigation.mjs";
// -- Route-level page chunks. The app shell is ready before feature modules download.
const lazyPage = (loader, exportName) => lazy(() => loader().then(module => ({ default: module[exportName] })));
const TeachersPage = lazyPage(() => import("./pages/teachers.jsx"), "TeachersPage");
const SubjectsPage = lazyPage(() => import("./pages/curriculum.jsx"), "SubjectsPage");
const SessionsPage = lazyPage(() => import("./pages/curriculum.jsx"), "SessionsPage");
const TranscriptPage = lazyPage(() => import("./pages/transcript.jsx"), "TranscriptPage");
const GradingPage = lazyPage(() => import("./pages/grading.jsx"), "GradingPage");
const CaeStructurePanel = lazyPage(() => import("./pages/grading.jsx"), "CaeStructurePanel");
const ClassesPage = lazyPage(() => import("./pages/classes.jsx"), "ClassesPage");
const AssignmentsPage = lazyPage(() => import("./pages/classes.jsx"), "AssignmentsPage");
const SectionsPage = lazyPage(() => import("./pages/classes.jsx"), "SectionsPage");
const LoginPage = lazyPage(() => import("./pages/login.jsx"), "LoginPage");
const SchoolManagerModal = lazyPage(() => import("./pages/login.jsx"), "SchoolManagerModal");
const RecycleBinPage = lazyPage(() => import("./pages/tools.jsx"), "RecycleBinPage");
const DataExportPage = lazyPage(() => import("./pages/tools.jsx"), "DataExportPage");
const AdminToolsPage = lazyPage(() => import("./pages/tools.jsx"), "AdminToolsPage");
const AuditLogPage = lazyPage(() => import("./pages/tools.jsx"), "AuditLogPage");
const ActivityPage = lazyPage(() => import("./pages/tools.jsx"), "ActivityPage");
const BroadsheetPage = lazyPage(() => import("./pages/tools.jsx"), "BroadsheetPage");
const BulkPromotionPage = lazyPage(() => import("./pages/tools.jsx"), "BulkPromotionPage");
const MembersPage = lazyPage(() => import("./pages/members.jsx"), "MembersPage");
const MyProfilePage = lazyPage(() => import("./pages/members.jsx"), "MyProfilePage");
const AttendancePage = lazyPage(() => import("./pages/schedule.jsx"), "AttendancePage");
const TimetablePage = lazyPage(() => import("./pages/schedule.jsx"), "TimetablePage");
const AcademicCalendarPage = lazyPage(() => import("./pages/schedule.jsx"), "AcademicCalendarPage");
const ReportTemplatesPage = lazyPage(() => import("./pages/reportcards.jsx"), "ReportTemplatesPage");
const ReportCardsPage = lazyPage(() => import("./pages/reportcards.jsx"), "ReportCardsPage");
const ReportCardSettingsPage = lazyPage(() => import("./pages/reportcards.jsx"), "ReportCardSettingsPage");
const AnnouncePage = lazyPage(() => import("./pages/comms.jsx"), "AnnouncePage");
const MailLogsPage = lazyPage(() => import("./pages/comms.jsx"), "MailLogsPage");
const MailComposePage = lazyPage(() => import("./pages/comms.jsx"), "MailComposePage");
const MyPaymentsPage = lazyPage(() => import("./pages/fees.jsx"), "MyPaymentsPage");
const FeesPage = lazyPage(() => import("./pages/fees.jsx"), "FeesPage");
const PaymentsPage = lazyPage(() => import("./pages/fees.jsx"), "PaymentsPage");
const FeeItemsPage = lazyPage(() => import("./pages/fees.jsx"), "FeeItemsPage");
const FeeTemplatesPage = lazyPage(() => import("./pages/fees.jsx"), "FeeTemplatesPage");
const MyBillPage = lazyPage(() => import("./pages/fees.jsx"), "MyBillPage");
const FeeGeneratePage = lazyPage(() => import("./pages/fees.jsx"), "FeeGeneratePage");
const PayItemModal = lazyPage(() => import("./pages/fees.jsx"), "PayItemModal");
const BillDetailModal = lazyPage(() => import("./pages/fees.jsx"), "BillDetailModal");
const FeeTrackerPage = lazyPage(() => import("./pages/fees.jsx"), "FeeTrackerPage");
const FeeStatsPage = lazyPage(() => import("./pages/fees.jsx"), "FeeStatsPage");
const DashboardPage = lazyPage(() => import("./pages/dashboard.jsx"), "DashboardPage");
const StudentsPage = lazyPage(() => import("./pages/students.jsx"), "StudentsPage");
const TeacherAddStudentsPage = lazyPage(() => import("./pages/students.jsx"), "TeacherAddStudentsPage");
const StudentApprovalsPage = lazyPage(() => import("./pages/students.jsx"), "StudentApprovalsPage");
const ResultsAdminPage = lazyPage(() => import("./pages/results.jsx"), "ResultsAdminPage");
const MyClassesPage = lazyPage(() => import("./pages/results.jsx"), "MyClassesPage");
const MyResultsPage = lazyPage(() => import("./pages/results.jsx"), "MyResultsPage");
const ResultsTeachPage = lazyPage(() => import("./pages/results.jsx"), "ResultsTeachPage");
const ResultsHubPage = lazyPage(() => import("./pages/results.jsx"), "ResultsHubPage");
const ResultApprovalsPage = lazyPage(() => import("./pages/results.jsx"), "ResultApprovalsPage");
const TeacherAccessRequestPage = lazyPage(() => import("./pages/access.jsx"), "TeacherAccessRequestPage");
const AccessRequestsAdminPage = lazyPage(() => import("./pages/access.jsx"), "AccessRequestsAdminPage");
const PermissionsPage = lazyPage(() => import("./pages/permissions.jsx"), "PermissionsPage");
const SettingsPage = lazyPage(() => import("./pages/settings.jsx"), "SettingsPage");
const NotificationsPage = lazyPage(() => import("./pages/settings.jsx"), "NotificationsPage");
const AcademicSummaryPage = lazyPage(() => import("./pages/analytics.jsx"), "AcademicSummaryPage");
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
  const stored=()=>{try{const value=localStorage.getItem("jd_dark");return value!=null?value==="1":(localStorage.getItem("rgs_dark")!=null?localStorage.getItem("rgs_dark")==="1":false)}catch{return false}};
  const [dark,setDark]=useState(stored);
  C=dark?DARK:LIGHT;
  setTheme(dark);
  const toggle=()=>setDark(current=>{
    const next=!current;
    try{localStorage.setItem("jd_dark",next?"1":"0");localStorage.setItem("rgs_dark",next?"1":"0")}catch{}
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
      <span aria-hidden="true">{dark?"☀":"☾"}</span>
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
          background:"linear-gradient(135deg,#030712,#111827)",fontFamily:"'Segoe UI',system-ui,sans-serif",padding:24}}>
          <div style={{background:"#fff",borderRadius:20,padding:"38px 32px",maxWidth:500,width:"100%",
            boxShadow:"0 24px 60px rgba(0,0,0,.35)",textAlign:"center"}}>
            <div style={{marginBottom:14}}><Shield size={52} color={C.blue}/></div>
            <div style={{fontSize:21,fontWeight:900,color:"#dc2626",marginBottom:8}}>Something went wrong</div>
            <div style={{fontSize:13,color:"#6b7280",lineHeight:1.7,marginBottom:6}}>
              The portal hit an unexpected error. Your data is safe — this is a display issue only.
            </div>
            <div style={{fontSize:12,color:"#94a3b8",lineHeight:1.6,marginBottom:20}}>
              Click <b>Try Again</b> to dismiss, or <b>Reload</b> if the issue persists.
            </div>
            {this.state.error?.message&&(
              <details style={{textAlign:"left",marginBottom:20}}>
                <summary style={{cursor:"pointer",fontSize:12,color:"#6b7280",fontWeight:600,userSelect:"none"}}>
                  Technical details
                </summary>
                <pre style={{background:"#fef2f2",borderRadius:8,padding:"10px 12px",fontSize:11,
                  color:"#dc2626",overflow:"auto",maxHeight:120,marginTop:6,border:"1px solid #fca5a5",
                  whiteSpace:"pre-wrap",wordBreak:"break-word"}}>
                  {this.state.error.message}
                </pre>
              </details>
            )}
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>this.setState({hasError:false,error:null,info:null})}
                style={{flex:1,background:"#fff",color:"#111827",border:"2px solid #111827",
                  padding:"12px",borderRadius:10,fontWeight:700,fontSize:13,cursor:"pointer"}}>
                ↩ Try Again
              </button>
              <button onClick={()=>window.location.reload()}
                style={{flex:1,background:"#111827",color:"#fff",border:"none",padding:"12px",
                  borderRadius:10,fontWeight:800,fontSize:13,cursor:"pointer",
                  boxShadow:"0 4px 14px rgba(26,79,160,.4)"}}>
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
// SectionCtx/useSection/SectionProvider -- imported from contexts/section.jsx
export { useSection };

const GRADES = [
  {min:70,max:100,grade:"A",remark:"Excellent"},
  {min:60,max:69, grade:"B",remark:"Very Good"},
  {min:50,max:59, grade:"C",remark:"Good"},
  {min:45,max:49, grade:"D",remark:"Pass"},
  {min:40,max:44, grade:"E",remark:"Fair"},
  {min:0, max:39, grade:"F",remark:"Fail"},
];
const getGrade  = (n,schema) => {
  if(n==null||n==="")return"–";
  const src = schema?.length ? schema : GRADES;
  // DB rows use min_score/max_score; fallback GRADES uses min/max
  // Use Math.floor so decimal averages (e.g. 59.4) don't fall between integer grade boundaries
  const v=Math.floor(+n);
  const g = src.find(g=>v>=(+(g.min??g.min_score??0))&&v<=(+(g.max??g.max_score??100)));
  return g?g.grade:"–";
};
const getRemark = (n,schema) => {
  if(n==null||n==="")return"–";
  const src = schema?.length ? schema : GRADES;
  const v=Math.floor(+n);
  const g = src.find(g=>v>=(+(g.min??g.min_score??0))&&v<=(+(g.max??g.max_score??100)));
  return g?g.remark:"–";
};
const gradeCol  = g => g==="A"?C.green:g==="B"?C.blue:g==="C"?C.orange:g==="F"?C.red:C.muted;
const fmt       = n => "₦"+Number(n||0).toLocaleString();
// ── Member name formatting (controlled by school_settings name_order / name_case) ──
let _nameSettings = {order:'FML', casing:'title'};
const setNameSettings = (s={}) => { _nameSettings = {..._nameSettings, ...s}; };
const _applyNameCase = (str, casing) => {
  if(!str||str==='—') return str;
  if(casing==='upper') return str.toUpperCase();
  if(casing==='lower') return str.toLowerCase();
  // title (default)
  return str.split(' ').map(w=>w?w[0].toUpperCase()+w.slice(1).toLowerCase():'').join(' ');
};
const fullName = s => {
  const parts = _nameSettings.order==='LFM'
    ? [s.last_name, s.first_name, s.middle_name]
    : [s.first_name, s.middle_name, s.last_name];
  const raw = parts.filter(Boolean).join(' ') || s.name || '—';
  if(raw==='—') return raw;
  return _applyNameCase(raw, _nameSettings.casing||'title');
};
let _id = 1000;
const uid = () => ++_id;

// ─── PLATFORM / MOBILE UTILS ──────────────────────────────────────────────────
/** True when running inside Capacitor (Android / iOS native app) */
const isNative = () => !!(window.Capacitor?.isNativePlatform?.());

/**
 * Download a file on web, or open the native Android share sheet on mobile.
 * @param {string} filename  e.g. "report.csv"
 * @param {string|Blob} content
 * @param {string} mimeType  e.g. "text/csv"
 */
async function shareOrDownload(filename, content, mimeType="text/plain"){
  if(isNative()){
    try{
      const blob = content instanceof Blob ? content : new Blob([content],{type:mimeType});
      const file = new File([blob], filename, {type:mimeType});
      if(navigator.share && navigator.canShare?.({files:[file]})){
        await navigator.share({files:[file], title:filename});
        return;
      }
    } catch(e){
      if(e.name==="AbortError") return; // user cancelled — not an error
      console.warn("[JD] share failed, falling back to download",e);
    }
  }
  // Web fallback (also used when canShare is false)
  const blob = content instanceof Blob ? content : new Blob([content],{type:mimeType});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(()=>{ URL.revokeObjectURL(a.href); document.body.removeChild(a); }, 10000);
}

// ── Script loader ─────────────────────────────────────────────────────────────
function loadScript(src){
  return new Promise((resolve,reject)=>{
    let parsed;
    try{parsed=new URL(src);}catch{return reject(new Error("Invalid script URL"));}
    if(parsed.protocol!=="https:"||parsed.hostname!=="cdnjs.cloudflare.com"||!parsed.pathname.startsWith("/ajax/libs/")){
      return reject(new Error("External script host is not approved"));
    }
    if(document.querySelector(`script[src="${parsed.href}"]`)){resolve();return;}
    const s=document.createElement("script");
    s.src=parsed.href;s.crossOrigin="anonymous";s.referrerPolicy="no-referrer";s.onload=resolve;s.onerror=reject;
    document.head.appendChild(s);
  });
}

// ── HTML → PDF base64 converter ───────────────────────────────────────────────
// Two modes:
//   usePt=false (default): 794px iframe, mm units — used for fee PDFs (single page, capped height)
//   usePt=false + autoHeight=true: 794px iframe, mm units, full scrollHeight — used for report cards
//   usePt=true (legacy):  595px iframe, pt units — kept for backwards compat but not recommended
//     (595px causes text wrapping on report card HTML designed for 794px)
async function htmlToPdfBase64(htmlString, {scale=3, quality=1.0, usePt=false, waitMs=700, autoHeight=false}={}){
  await Promise.all([
    !window.html2canvas&&loadScript("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"),
    !window.jspdf&&loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"),
  ].filter(Boolean));

  // Page dimensions in the chosen unit system
  const PW_PT=595.28, PH_PT=841.89;   // A4 in points
  // autoHeight (report cards): 571px = card's natural design width; jsPDF scales to fill A4
  const ifrW=autoHeight?571:(usePt?595:794);
  const ifrH=autoHeight?900:(usePt?842:1123);
  const captureScale=scale;            // html2canvas device-pixel ratio — caller controls quality

  // ── Pre-process HTML before loading ────────────────────────────────────────
  // All overrides MUST be baked into the HTML string before srcdoc is set —
  // post-load DOM injection is too late on mobile (viewport is evaluated once
  // on load; JS scalers run at DOMContentLoaded before our code can intervene).

  // 0. Inline all remote http(s) image URLs as base64 data URLs.
  //    This is CRITICAL for iOS foreignObjectRendering — Safari's SVG renderer
  //    blocks cross-origin <img> src URLs inside <foreignObject>. By converting
  //    every remote URL to a data: URI before the srcdoc is set, images (school
  //    logo, signatures, stamps) are guaranteed to appear in the final PDF.
  let captureHtml=htmlString;
  try{
    const urlsToInline=new Set();
    // Match src="https://..." and src='https://...' attribute values
    const srcRe=/\bsrc=["'](https?:\/\/[^"']+)["']/gi;
    let m;
    while((m=srcRe.exec(captureHtml))!==null) urlsToInline.add(m[1]);
    if(urlsToInline.size>0){
      const inlineMap={};
      await Promise.all(Array.from(urlsToInline).map(async url=>{
        try{
          const resp=await fetch(url,{mode:"cors",credentials:"omit"});
          if(!resp.ok) return;
          const blob=await resp.blob();
          const dataUrl=await new Promise((res,rej)=>{
            const fr=new FileReader();
            fr.onload=()=>res(fr.result);
            fr.onerror=rej;
            fr.readAsDataURL(blob);
          });
          inlineMap[url]=dataUrl;
        }catch(_){}
      }));
      // Replace every matched URL in the HTML string
      captureHtml=captureHtml.replace(/\bsrc=["'](https?:\/\/[^"']+)["']/gi,(match,url)=>{
        if(inlineMap[url]){
          // preserve quote style
          const q=match[4];
          return `src=${q}${inlineMap[url]}${q}`;
        }
        return match;
      });
    }
  }catch(_){}

  // 1. Replace viewport meta so mobile doesn't use device-width (~390px).
  //    Mobile browsers evaluate the viewport once on load — must be fixed upfront.
  captureHtml=captureHtml.replace(
    /<meta[^>]+name=["']viewport["'][^>]*\/?>/i,
    `<meta name="viewport" content="width=${ifrW},initial-scale=1.0,maximum-scale=1.0"/>`
  );

  // 2. Strip the scaleCards() IIFE from the report card HTML — it reads
  //    window.innerWidth (which on mobile returns device width, not the iframe
  //    width) and applies wrong zoom/padding to .report-card and document.body.
  //    Removing it entirely is simpler than fighting its inline-style output.
  captureHtml=captureHtml.replace(
    /<script\b[^>]*>[\s\S]*?scaleCards[\s\S]*?<\/script>/gi,
    ""
  );

  // 3. Inject override CSS at end of <head> so it wins the cascade.
  //    Force iframe-width on html/body so mobile viewport evaluation doesn't
  //    shrink anything. DO NOT force a width on .report-card here — let its own
  //    stylesheet decide (storage CSS uses width:100% so it fills body minus
  //    padding; invoice/receipt templates set their own widths).
  const pdfOverrideCss=`<style id="__pdf_capture__">
    html,body{padding:0!important;margin:0!important;
             width:${ifrW}px!important;min-width:${ifrW}px!important;max-width:${ifrW}px!important;
             overflow:visible!important;}
    .report-card{zoom:1!important;transform:none!important;}
    .a4{box-shadow:none!important;margin:0!important;width:100%!important;}
    .no-print{display:none!important;}
  </style>`;
  captureHtml=captureHtml.includes("</head>")
    ?captureHtml.replace("</head>",pdfOverrideCss+"</head>")
    :pdfOverrideCss+captureHtml;

  return new Promise((resolve,reject)=>{
    const iframe=document.createElement("iframe");
    iframe.style.cssText=`position:fixed;left:-9999px;top:0;width:${ifrW}px;height:${ifrH}px;border:none;opacity:0;pointer-events:none;z-index:-1;`;
    document.body.appendChild(iframe);
    const cleanup=()=>{try{document.body.removeChild(iframe);}catch{}};

    iframe.onload=async()=>{
      try{
        const cdoc=iframe.contentDocument;
        const body=cdoc?.body;
        const html=cdoc?.documentElement;
        if(!body||!html){cleanup();reject(new Error("iframe body not accessible"));return;}
        // Force dimensions on both html and body — iOS Safari otherwise sizes
        // the document to its own viewport width regardless of iframe width.
        html.style.width=`${ifrW}px`;
        html.style.minWidth=`${ifrW}px`;
        html.style.maxWidth=`${ifrW}px`;
        body.style.width=`${ifrW}px`;
        body.style.minWidth=`${ifrW}px`;
        body.style.maxWidth=`${ifrW}px`;
        // Wait for fonts — iOS Safari reports wrong scrollHeight before webfonts
        // finish loading, making the captured canvas too short.
        try{ await cdoc.fonts?.ready; }catch(_){}
        // Wait for all images to decode AND inline them as base64 data URLs.
        // Why inline? html2canvas foreignObjectRendering serializes the DOM into
        // an SVG <foreignObject> — cross-origin image URLs (e.g. signatures from
        // Supabase storage) can't be embedded in that SVG and render blank.
        // Converting them to data URLs first guarantees they appear in the PDF.
        try{
          const imgs=Array.from(cdoc.images||[]);
          await Promise.all(imgs.map(async img=>{
            // Wait for load
            if(!img.complete||img.naturalWidth===0){
              await new Promise(res=>{
                img.addEventListener("load",res,{once:true});
                img.addEventListener("error",res,{once:true});
                setTimeout(res,3000);
              });
            }
            // Inline remote URLs as data URLs (skip already-inlined data: URIs)
            const src=img.getAttribute("src")||"";
            if(!src||src.startsWith("data:"))return;
            try{
              const resp=await fetch(src,{mode:"cors",credentials:"omit"});
              if(!resp.ok)return;
              const blob=await resp.blob();
              const dataUrl=await new Promise((res,rej)=>{
                const fr=new FileReader();
                fr.onload=()=>res(fr.result);
                fr.onerror=rej;
                fr.readAsDataURL(blob);
              });
              img.src=dataUrl;
              // Wait for the new data URL to decode too
              if(!img.complete||img.naturalWidth===0){
                await new Promise(res=>{
                  img.addEventListener("load",res,{once:true});
                  img.addEventListener("error",res,{once:true});
                  setTimeout(res,2000);
                });
              }
            }catch(_){/* keep original src; worst case html2canvas will try */}
          }));
        }catch(_){}
        // iOS needs extra settle time after fonts + images load.
        const isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent)||
                    (navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
        const effectiveWait=isIOS?Math.max(waitMs,1500):waitMs;
        await new Promise(r=>setTimeout(r,effectiveWait));
        // Force a reflow before measuring (iOS layout can be stale)
        void body.offsetHeight;
        void html.offsetHeight;
        // mm-mode (receipts/invoices): HTML enforces height:297mm — cap canvas to ifrH
        // so a stray margin never pushes content onto a second page.
        // pt-mode / autoHeight (report cards): measure the .report-card element
        // directly if present — body.scrollHeight is unreliable on iOS WebKit.
        let scrollH;
        if(usePt||autoHeight){
          // Capture JUST the card + body padding — never the whole iframe,
          // otherwise empty iframe space bleeds into page 2.
          const card=cdoc.querySelector(".report-card");
          if(card){
            const rect=card.getBoundingClientRect();
            const bodyStyle=cdoc.defaultView?.getComputedStyle(body);
            const padTop=parseFloat(bodyStyle?.paddingTop||"0")||0;
            const padBot=parseFloat(bodyStyle?.paddingBottom||"0")||0;
            scrollH=Math.ceil(rect.top+rect.height+padBot);
            // Fallback: if measurement failed, use card + padding
            if(!scrollH||scrollH<100) scrollH=Math.ceil(rect.height+padTop+padBot);
          }else{
            scrollH=body.scrollHeight||ifrH;
          }
        }else{
          scrollH=ifrH;
        }
        const canvas=await window.html2canvas(body,{
          scale:captureScale,
          useCORS:true,
          allowTaint:true,
          backgroundColor:"#ffffff",
          width:ifrW,
          height:scrollH,
          windowWidth:ifrW,
          windowHeight:ifrH,
          logging:false,
          // foreignObjectRendering uses SVG <foreignObject> to render, which
          // preserves backgrounds/gradients/text accurately on iOS Safari.
          // Slower but fixes iOS rendering issues entirely.
          foreignObjectRendering:isIOS,
          imageTimeout:15000,
        });

        const {jsPDF}=window.jspdf;
        // PNG is lossless — no JPEG compression artifacts on text/graphics
        const imgData=canvas.toDataURL("image/png");

        if(usePt){
          // ── Points mode: exact A4 595.28×841.89pt, no extra margins ──
          const doc=new jsPDF({orientation:"portrait",unit:"pt",format:[PW_PT,PH_PT],compress:false});
          const ptPerCanvasPx=PW_PT/canvas.width;
          const totalHeightPt=canvas.height*ptPerCanvasPx;
          const totalPages=Math.ceil(totalHeightPt/PH_PT);
          for(let page=0;page<totalPages;page++){
            if(page>0)doc.addPage();
            doc.addImage(imgData,"PNG",0,-(page*PH_PT),PW_PT,totalHeightPt,"","FAST");
          }
          cleanup();
          resolve(doc.output("datauristring").split(",")[1]);
        }else{
          // ── mm mode: A4 in mm, for fee receipts/invoices ──
          const doc=new jsPDF({orientation:"portrait",unit:"mm",format:"a4",compress:false});
          const pdfW=doc.internal.pageSize.getWidth();
          const pdfH=doc.internal.pageSize.getHeight();
          const mmPerCanvasPx=pdfW/canvas.width;
          const totalHeightMm=canvas.height*mmPerCanvasPx;
          // autoHeight = multi-page (report cards); otherwise single-page invoice/receipt.
          // For single-page, cap to exactly 1 page — avoids blank 2nd page from px rounding.
          // For multi-page, apply 25mm tolerance so small overflows don't trigger a
          // phantom blank page. A real multi-page card will overflow by hundreds of mm.
          // autoHeight = report card downloads. Each call has exactly 1 student,
          // and report cards are designed to fit one A4 page. Always 1 page —
          // any tiny overflow (body padding, iOS rendering drift) is imperceptible.
          const totalPages=1;
          for(let page=0;page<totalPages;page++){
            if(page>0)doc.addPage();
            doc.addImage(imgData,"PNG",0,-(page*pdfH),pdfW,totalHeightMm,"","FAST");
          }
          cleanup();
          resolve(doc.output("datauristring").split(",")[1]);
        }
      }catch(err){cleanup();reject(err);}
    };
    iframe.onerror=e=>{cleanup();reject(e);};
    iframe.srcdoc=captureHtml;
  });
}

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

/**
 * Open an HTML document as a PDF.
 * - Web  : opens in a new window + triggers print dialog
 * - Native: pushes into the in-app PDFViewer (pass showPDF from ctx)
 */
function openHtmlDoc(html, {title="Document", showPDF=null}={}){
  // Use in-app PDFViewer for: (a) native app, (b) mobile browser / PWA
  const onMobile = /Mobi|Android|iPhone|iPad|webOS/i.test(navigator.userAgent);
  if(showPDF && (isNative() || onMobile)){
    showPDF(html, title);
    return;
  }
  // Desktop: open about:blank, write HTML, then use history.replaceState to give the
  // window a URL path matching the filename — Chrome/Edge read the URL path as the
  // print-to-PDF save dialog filename (e.g. /EMEKA_OKAFOR_RCPT_00042 → "EMEKA_OKAFOR_RCPT_00042").
  const w = window.open("","_blank");
  if(!w){ alert("Please allow pop-ups to generate the PDF."); return; }
  w.document.write(html);
  w.document.close();
  try{ w.document.title=title; }catch(_){}
  try{ w.history.replaceState({},"","/"+encodeURIComponent(title)); }catch(_){}
}

/**
 * Generate a PDF from HTML and download it with the given filename.
 * Uses htmlToPdfBase64 (html2canvas+jsPDF) — same pipeline used for email attachments.
 * usePt=true for report cards (multi-page, 595pt), false for invoices/receipts (A4 mm).
 */
async function downloadPDF(html, filename, usePtOrOpts=false){
  const opts=typeof usePtOrOpts==="object"?usePtOrOpts:{usePt:usePtOrOpts};
  try{
    const base64=await htmlToPdfBase64(html,opts);
    const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
    const blob=new Blob([bytes],{type:"application/pdf"});
    shareOrDownload(filename.endsWith(".pdf")?filename:filename+".pdf",blob,"application/pdf");
  }catch(err){
    console.error("[downloadPDF]",err);
    alert("PDF generation failed: "+err.message);
  }
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
// Rate-limited batch email sender
// ratePerMin: 10 (safe/recommended) or 20 (fast)
async function sendBatchEmails(emails,onProgress,ratePerMin=10){
  const delay=Math.floor(60000/ratePerMin);
  let sent=0,failed=0;
  for(let i=0;i<emails.length;i++){
    const result=await sendPortalEmail(emails[i]);
    if(result.ok)sent++;else failed++;
    onProgress?.({sent,failed,total:emails.length,current:emails[i].to,done:i===emails.length-1});
    if(i<emails.length-1)await new Promise(r=>setTimeout(r,delay));
  }
  return{sent,failed,total:emails.length};
}

// Send a batch via the background queue edge function.
// Returns { batchId } — caller polls db.getEmailQueueStatus(batchId) for progress.
async function sendEmailBatchBackground(emails, schoolId, ratePerMin=10){
  const batchId = crypto.randomUUID();
  const{error}=await db.queueEmailBatch(batchId,emails,schoolId);
  if(error){console.error('[sendEmailBatchBackground] queue error:',error);return{batchId,error};}
  try{
    await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email-batch`,{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':`Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`},
      body:JSON.stringify({batch_id:batchId,rate_per_min:ratePerMin}),
    });
  }catch(e){console.warn('[sendEmailBatchBackground] trigger error:',e);}
  return{batchId,error:null};
}

// Share a PDF file using the Web Share API.
// navigator.share() MUST be called from a fresh user gesture — PDF generation is async
// so we can't call it directly after awaiting the blob. Instead we show a small overlay
// with a "Share" / "Download" button; that click IS a fresh gesture and share works.

const EMAIL_CARD_CSS=`<style>
body{font-family:'Segoe UI',Arial,sans-serif;background:#f0f4f8;padding:32px 16px;margin:0}
.card{max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.1)}
.header{background:linear-gradient(135deg,#030712,#111827);padding:32px;text-align:center}
.school{color:#fff;font-size:20px;font-weight:900;margin-bottom:4px}
.tagline{color:rgba(255,255,255,.7);font-size:12px;letter-spacing:1px;text-transform:uppercase}
.body{padding:28px 32px}
.greeting{font-size:16px;color:#1a202c;margin-bottom:16px}
.details-box{background:#f8fafc;border-radius:8px;padding:16px 20px;border-left:4px solid #111827;margin:20px 0}
.detail-row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e2e8f0;font-size:14px}
.detail-row:last-child{border-bottom:none}
.label{color:#64748b}.value{font-weight:700;color:#1a202c}.value.id{color:#111827;font-size:15px;letter-spacing:.5px}
.login-box{background:linear-gradient(135deg,#F3F4F6,#E5E7EB);border-radius:8px;padding:16px 20px;margin:20px 0;text-align:center}
.login-url{color:#111827;font-weight:700;font-size:15px;text-decoration:none}
.note{font-size:12px;color:#64748b;margin-top:6px}
.footer{background:#f8fafc;padding:16px 32px;text-align:center;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0}
</style>`;



// ── Module-level buildEmailHtml — shared by all email senders ────────────────
// subj: email subject string; bodyText: plain text with \n line breaks

// Retry a supabase query once on network failure
async function safeRetry(fn, retries=1) {
  let last;
  for(let i=0;i<=retries;i++){
    last = await safe(fn);
    if(!last.error) return last;
    if(i<retries) await new Promise(r=>setTimeout(r,800));
  }
  return last;
}

// ── Auth helpers ──────────────────────────────────────────────────────────────
// Single-device token: a short random string stored in the DB and in localStorage.
// If another device logs in with the same account, the DB token changes → this
// device detects the mismatch on the next 60-second poll and is kicked out.
const genSessionToken=()=>{
  if(!globalThis.crypto?.randomUUID) throw new Error("Secure session token generation is unavailable in this browser");
  return globalThis.crypto.randomUUID();
};


// ── Persist session ───────────────────────────────────────────────────────────
// localStorage keeps the user profile across reloads.
// sessionStorage holds the "alive" flag — it clears automatically when the
// tab/browser/PWA/Android app is closed, forcing a fresh login each time.
const SESSION_KEY = "rgs_portal_user";
const SESSION_ALIVE = "rgs_session_active";
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
const SCHOOL_KEY = "rgs_selected_school";
function saveSelectedSchool(school){ try{localStorage.setItem(SCHOOL_KEY,JSON.stringify(school));}catch{} }
function loadSelectedSchool(){ try{const s=localStorage.getItem(SCHOOL_KEY);return s?JSON.parse(s):null;}catch{return null;} }
function clearSelectedSchool(){ try{localStorage.removeItem(SCHOOL_KEY);}catch{} }

// Initialise db school context synchronously at module load — before any component
// renders or mounts. This ensures every initial data fetch already has _schoolId set,
// preventing cross-organization data leaking on first load (race condition with useEffect).
(()=>{ const s=loadSelectedSchool(); if(s?.id) db.setSchool(s.id,s.student_id_prefix||'SCH',s.name||''); })();

// ─── DANGER BUTTON — Requires typing phrase before confirming ───────────────
function DangerBtn({label,icon,typePhrase,onClick}){
  const confirm=useConfirm();
  const handle=async()=>{
    const ok=await confirm({
      title:`${label}`,
      message:`This action is IRREVERSIBLE and will permanently delete all records. Type the phrase below to confirm.`,
      icon:null,
      confirmLabel:label,
      danger:true,
      typeToConfirm:typePhrase,
    });
    if(ok) onClick();
  };
  return(
    <button onClick={handle}
      style={{display:"flex",alignItems:"center",gap:6,padding:"8px 14px",
        border:`1px solid ${C.red}40`,background:C.redPale,
        color:C.red,borderRadius:8,cursor:"pointer",fontSize:12,fontWeight:700}}>
      {icon} {label}
    </button>
  );
}

// ─── UI PRIMITIVES ────────────────────────────────────────────────────────────
function Logo({size=44}){
  const ctx = useContext(SectionCtx);
  const logo = ctx?.schoolLogo;
  if(logo){
    return <img src={logo} alt="Organization logo" style={{width:size,height:size,objectFit:"contain",borderRadius:size*0.18,background:"transparent"}}/>;
  }
  return(
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label={PRODUCT.name}>
      <rect width="48" height="48" rx="13" fill={C.text}/>
      <path d="M13 13h5v22h-5zM18 13h7.5c5.5 0 8.5 2.7 8.5 7.1 0 2.7-1.4 4.8-3.9 5.9L35 35h-6.2l-5.1-7.5H18V35h-5V13h5Zm0 9.8h7c2.4 0 3.7-.9 3.7-2.7s-1.3-2.7-3.7-2.7h-7v5.4Z" fill="#fff"/>
      <path d="M37 11.5h2v25h-2z" fill={C.light}/>
    </svg>
  );
}

function Card({children,style={},onClick}){
  const [h,setH]=useState(false);
  return(
    <div onClick={onClick}
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
    <button onClick={onClick} disabled={disabled}
      onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
      style={{
        background:outline?"transparent":disabled?"#CBD5E1":h
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
  return <span style={{background:color+"15",color,padding:"3px 10px",borderRadius:20,
    fontSize:11,fontWeight:700,border:`1px solid ${color}25`,whiteSpace:"nowrap",
    letterSpacing:".02em",...style}}>{children}</span>;
}

function Inp({label,value,onChange,type="text",placeholder="",disabled=false,required=false,style={}}){
  const [focused,setFocused]=useState(false);
  return(
    <div style={{marginBottom:14}}>
      {label&&<label style={{display:"block",fontSize:11,fontWeight:700,color:focused?C.blue:C.muted,
        textTransform:"uppercase",letterSpacing:.6,marginBottom:5,transition:"color .15s"}}>
        {label}{required&&<span style={{color:C.red}}> *</span>}
      </label>}
      <input type={type} value={value??""} onChange={e=>onChange(e.target.value)}
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

function Sel({label,value,onChange,options=[],disabled=false}){
  const [focused,setFocused]=useState(false);
  return(
    <div style={{marginBottom:14}}>
      {label&&<label style={{display:"block",fontSize:11,fontWeight:700,color:focused?C.blue:C.muted,
        textTransform:"uppercase",letterSpacing:.6,marginBottom:5,transition:"color .15s"}}>{label}</label>}
      <select value={value??""} onChange={e=>onChange(e.target.value)} disabled={disabled}
        onFocus={e=>{setFocused(true);e.target.style.borderColor=C.blue;e.target.style.boxShadow=`0 0 0 3px ${C.blue}18`;}}
        onBlur={e=>{setFocused(false);e.target.style.borderColor=C.border;e.target.style.boxShadow="none";}}
        style={{display:"block",width:"100%",padding:"10px 13px",
          border:`1.5px solid ${focused?C.blue:C.border}`,
          borderRadius:9,fontSize:13,background:disabled?C.offWhite:C.white,color:C.text,
          cursor:disabled?"not-allowed":"pointer",outline:"none",transition:"all .15s",
          boxSizing:"border-box"}}>
        {options.map(o=><option key={o.value??o} value={o.value??o}>{o.label??o}</option>)}
      </select>
    </div>
  );
}

function Modal({title,children,onClose,width=520}){
  const isMobile=useIsMobile();
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(2,6,23,.6)",backdropFilter:"blur(6px)",
      display:"flex",
      alignItems:isMobile?"flex-end":"flex-start",
      justifyContent:"center",
      zIndex:800,padding:isMobile?"0":"28px 16px",overflowY:isMobile?"hidden":"auto"}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:C.white,
        borderRadius:isMobile?"20px 20px 0 0":"20px",
        width:"100%",maxWidth:isMobile?"100%":width,
        maxHeight:isMobile?"92vh":"none",
        display:"flex",flexDirection:"column",
        boxShadow:C.shadowXl,
        animation:isMobile?"sheetUp .28s cubic-bezier(.34,1.3,.64,1)":"modalUp .22s cubic-bezier(.34,1.56,.64,1)",
        transition:"background .2s"}}>
        <div style={{background:`linear-gradient(135deg,${C.blue} 0%,${C.blueDark} 100%)`,
          borderRadius:isMobile?"20px 20px 0 0":"20px 20px 0 0",
          padding:"16px 22px",flexShrink:0,
          display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          {isMobile&&<div style={{width:36,height:4,borderRadius:2,
            background:"rgba(255,255,255,.3)",margin:"0 auto 0 0",flexShrink:0}}/>}
          <span style={{color:"#fff",fontWeight:800,fontSize:15,letterSpacing:".01em",flex:1,
            textAlign:isMobile?"center":"left"}}>{title}</span>
          <button onClick={onClose}
            style={{background:"rgba(255,255,255,.15)",color:"rgba(255,255,255,.9)",
              border:"1px solid rgba(255,255,255,.2)",width:30,height:30,borderRadius:"50%",
              cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",
              justifyContent:"center",transition:"background .15s",flexShrink:0}}
            onMouseEnter={e=>e.target.style.background="rgba(255,255,255,.28)"}
            onMouseLeave={e=>e.target.style.background="rgba(255,255,255,.15)"}>
            ✕
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
    success:{bg:`linear-gradient(135deg,${LIGHT.green},#16A34A)`,icon:"check",bdr:LIGHT.green},
    error:  {bg:`linear-gradient(135deg,#DC2626,#B91C1C)`,       icon:"close",bdr:"#DC2626"},
    warn:   {bg:`linear-gradient(135deg,#D97706,#B45309)`,       icon:"warning",bdr:"#D97706"},
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
        ✕
      </button>
    </div>
  );
}

function StatCard({label,value,icon,color=C.blue,sub,valueSize=28}){
  const [h,setH]=useState(false);
  return(
    <div onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
      style={{background:C.white,borderRadius:18,padding:"18px 20px",
      boxShadow:h?C.shadowMd:C.shadow,border:`1px solid ${h?color+"30":C.border}`,
      position:"relative",overflow:"hidden",minWidth:0,
      transform:h?"translateY(-2px)":"none",transition:"all .2s ease"}}>
      <div style={{position:"absolute",top:0,left:0,right:0,height:3,
        background:`linear-gradient(90deg,${color},${color}88)`}}/>
      <div style={{position:"absolute",bottom:-16,right:-16,width:80,height:80,
        borderRadius:"50%",background:color+"08",transition:"transform .3s",
        transform:h?"scale(1.2)":"scale(1)"}}/>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div style={{minWidth:0,overflow:"hidden"}}>
          <div style={{fontSize:10.5,fontWeight:700,color:C.muted,textTransform:"uppercase",
            letterSpacing:.9,marginBottom:8}}>{label}</div>
          <div style={{fontSize:valueSize,fontWeight:900,color:C.text,lineHeight:1,marginBottom:sub?4:0,
            whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{value}</div>
          {sub&&<div style={{fontSize:11.5,color:C.muted,marginTop:3}}>{sub}</div>}
        </div>
        <div style={{width:46,height:46,borderRadius:13,
          background:`linear-gradient(135deg,${color}22,${color}10)`,
          border:`1.5px solid ${color}20`,
          display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0,
          boxShadow:`0 4px 12px ${color}20`,transition:"all .2s",
          transform:h?"scale(1.08)":"scale(1)"}}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function Th({cols}){
  return(
    <thead>
      <tr style={{background:C.offWhite,borderBottom:`1.5px solid ${C.border}`}}>
        {cols.map((c,i)=><th key={i} style={{padding:"10px 14px",color:C.muted,
          textAlign:"left",fontWeight:700,fontSize:10.5,whiteSpace:"nowrap",
          textTransform:"uppercase",letterSpacing:.8}}>{c}</th>)}
      </tr>
    </thead>
  );
}

function TRow({cells,i}){
  const [h,setH]=useState(false);
  return(
    <tr onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
      style={{background:h?C.bluePale:i%2===0?C.white:C.offWhite,
        borderBottom:`1px solid ${C.border}`,transition:"background .1s"}}>
      {cells.map((c,j)=><td key={j} style={{padding:"10px 14px",verticalAlign:"middle",fontSize:13}}>{c}</td>)}
    </tr>
  );
}

// ── Multi-class checkbox dropdown ─────────────────────────────────────────────
// selClasses: Set of string class IDs. onToggle(id): toggles one. onClear(): clears all.
function ClassMultiSelect({classes,selClasses,onToggle,onClear,placeholder="All Groups"}){
  const [open,setOpen]=useState(false);
  const ref=useRef(null);
  useEffect(()=>{
    const handler=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};
    document.addEventListener("mousedown",handler);
    return()=>document.removeEventListener("mousedown",handler);
  },[]);
  const count=selClasses.size;
  const label=count===0?placeholder:count===1?
    (classes.find(c=>selClasses.has(String(c.id)))?.name||`1 group selected`):
    `${count} groups selected`;
  return(
    <div ref={ref} style={{position:"relative",flex:1,minWidth:150}}>
      <button onClick={()=>setOpen(o=>!o)}
        style={{width:"100%",padding:"9px 10px",border:`2px solid ${count>0?C.orange:C.border}`,
          borderRadius:8,fontSize:13,background:count>0?C.orangePale:C.white,color:C.text,
          fontWeight:count>0?700:400,cursor:"pointer",display:"flex",justifyContent:"space-between",
          alignItems:"center",gap:6,textAlign:"left"}}>
        <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{label}</span>
        <span style={{fontSize:10,opacity:.6,flexShrink:0}}>{open?"▲":"▼"}</span>
      </button>
      {open&&(
        <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,right:0,zIndex:999,
          background:C.white,border:`2px solid ${C.border}`,borderRadius:10,
          boxShadow:"0 8px 24px rgba(0,0,0,.12)",maxHeight:280,overflowY:"auto"}}>
          {/* All option */}
          <div onClick={()=>{onClear();}}
            style={{padding:"9px 14px",cursor:"pointer",fontWeight:700,fontSize:13,
              color:count===0?C.orange:C.text,
              background:count===0?C.orangePale:"transparent",
              borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:8}}
            onMouseEnter={e=>e.currentTarget.style.background=count===0?C.orangePale:C.offWhite}
            onMouseLeave={e=>e.currentTarget.style.background=count===0?C.orangePale:"transparent"}>
            <span style={{width:16,height:16,borderRadius:4,display:"inline-flex",alignItems:"center",
              justifyContent:"center",fontSize:11,
              background:count===0?C.orange:"transparent",
              border:`2px solid ${count===0?C.orange:C.border}`,color:"#fff",flexShrink:0}}>
              {count===0?"✓":""}
            </span>
            All Groups
          </div>
          {classes.map(c=>{
            const sid=String(c.id);
            const checked=selClasses.has(sid);
            return(
              <div key={c.id} onClick={()=>onToggle(sid)}
                style={{padding:"8px 14px",cursor:"pointer",fontSize:13,
                  background:checked?C.orangePale:"transparent",
                  display:"flex",alignItems:"center",gap:8,
                  borderBottom:`1px solid ${C.border}22`}}
                onMouseEnter={e=>e.currentTarget.style.background=checked?C.orangePale:C.offWhite}
                onMouseLeave={e=>e.currentTarget.style.background=checked?C.orangePale:"transparent"}>
                <span style={{width:16,height:16,borderRadius:4,display:"inline-flex",alignItems:"center",
                  justifyContent:"center",fontSize:11,flexShrink:0,
                  background:checked?C.orange:"transparent",
                  border:`2px solid ${checked?C.orange:C.border}`,color:"#fff"}}>
                  {checked?"✓":""}
                </span>
                <span style={{flex:1}}>{c.name}</span>
                {c.sections&&<span style={{fontSize:11,color:C.muted}}>{c.sections.code||c.sections.name}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Spinner({text="Loading…"}){
  return(
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",
      justifyContent:"center",padding:"56px 24px",gap:16}}>
      <div style={{width:40,height:40,borderRadius:"50%",
        border:`3px solid ${C.blue}20`,borderTop:`3px solid ${C.blue}`,
        animation:"spin .7s linear infinite"}}/>
      <div style={{fontSize:13,color:C.muted,fontWeight:500}}>{text}</div>
    </div>
  );
}

// ─── IN-APP PDF VIEWER (mobile / Capacitor) ────────────────────────────────────
// Shows an HTML document full-screen inside the app, with a Share button
// that uses the native Android share sheet so the user can save / print.
function PDFViewer({html, title, onClose}){
  const safeTop = "env(safe-area-inset-top, 0px)";
  const iframeRef = React.useRef(null);
  const [sharing, setSharing] = React.useState(false);
  const [zoom, setZoom] = React.useState(100);
  const [shareMsg, setShareMsg] = React.useState(null); // {text, color, bg}

  const showBanner = (text, ok=true) => {
    setShareMsg({text, ok});
    setTimeout(()=>setShareMsg(null), 5000);
  };

  const handleShare = async () => {
    setSharing(true);
    try{
      const blob = new Blob([html], {type:"text/html;charset=utf-8"});
      const safeName = title.replace(/[^a-zA-Z0-9_\-]/g,"_");
      const file = new File([blob], `${safeName}.html`, {type:"text/html"});

      if(navigator.share && navigator.canShare?.({files:[file]})){
        await navigator.share({files:[file], title, text:`${title} — JAMES-DENNING`});
        showBanner("✅ Shared! Open the file in Chrome → tap ⋮ → Print → Save as PDF", true);
      } else if(navigator.share){
        // File sharing not supported — share as blob URL
        const url = URL.createObjectURL(blob);
        await navigator.share({url, title});
        setTimeout(()=>URL.revokeObjectURL(url), 30000);
        showBanner("✅ Link shared! Open it in Chrome → tap ⋮ → Print → Save as PDF", true);
      } else {
        // No share API — download the file
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${safeName}.html`;
        a.click();
        setTimeout(()=>URL.revokeObjectURL(a.href), 10000);
        showBanner("📥 File downloaded! Open it in Chrome to print as PDF", true);
      }
    } catch(e){
      if(e.name!=="AbortError"){
        console.warn("[PDFViewer] share error", e);
        showBanner("⚠️ Could not share — try again", false);
      }
    } finally { setSharing(false); }
  };

  const handlePrint = () => {
    const w = iframeRef.current?.contentWindow;
    if(w) { w.focus(); w.print(); }
  };

  return(
    <div style={{position:"fixed",inset:0,zIndex:9998,
      background:C.offWhite,display:"flex",flexDirection:"column",
      fontFamily:"'Segoe UI',system-ui,sans-serif"}}>

      {/* Header */}
      <div style={{background:`linear-gradient(135deg,${LIGHT.blueDark} 0%,${LIGHT.blue} 100%)`,
        paddingTop:`calc(${safeTop} + 10px)`,paddingBottom:10,
        paddingLeft:12,paddingRight:12,
        display:"flex",alignItems:"center",gap:8,flexShrink:0,
        boxShadow:"0 3px 16px rgba(0,0,0,.3)"}}>
        <button onClick={onClose}
          style={{color:"#fff",background:"rgba(255,255,255,.12)",
            border:"1px solid rgba(255,255,255,.2)",
            borderRadius:10,padding:"9px 14px",cursor:"pointer",fontWeight:700,fontSize:13,
            display:"flex",alignItems:"center",gap:5,flexShrink:0,whiteSpace:"nowrap"}}>
          ← Back
        </button>
        <span style={{color:"#fff",fontWeight:700,flex:1,fontSize:13,
          overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",
          opacity:.9}}>
          {title}
        </span>
        {/* Zoom controls — web only */}
        {!isNative()&&(
          <div style={{display:"flex",alignItems:"center",gap:4,flexShrink:0}}>
            <button onClick={()=>setZoom(z=>Math.max(50,z-10))}
              style={{background:"rgba(255,255,255,.12)",border:"1px solid rgba(255,255,255,.2)",
                color:"#fff",borderRadius:7,width:28,height:28,cursor:"pointer",fontSize:14,
                display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
            <span style={{color:"rgba(255,255,255,.7)",fontSize:11,minWidth:36,textAlign:"center"}}>{zoom}%</span>
            <button onClick={()=>setZoom(z=>Math.min(200,z+10))}
              style={{background:"rgba(255,255,255,.12)",border:"1px solid rgba(255,255,255,.2)",
                color:"#fff",borderRadius:7,width:28,height:28,cursor:"pointer",fontSize:14,
                display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
          </div>
        )}
        {/* Print — web only */}
        {!isNative()&&(
          <button onClick={handlePrint}
            style={{color:"#fff",background:"rgba(255,255,255,.12)",
              border:"1px solid rgba(255,255,255,.2)",
              borderRadius:10,padding:"9px 13px",cursor:"pointer",fontWeight:700,
              fontSize:13,display:"flex",alignItems:"center",gap:5,flexShrink:0}}>
            Print
          </button>
        )}
        {/* Share / Download */}
        <button onClick={handleShare} disabled={sharing}
          style={{color:"#fff",background:sharing?"rgba(255,255,255,.15)":LIGHT.orange,
            border:"none",borderRadius:10,padding:"9px 16px",cursor:sharing?"wait":"pointer",
            fontWeight:800,fontSize:13,display:"flex",alignItems:"center",gap:6,flexShrink:0,
            boxShadow:sharing?"none":`0 3px 12px ${LIGHT.orange}55`,whiteSpace:"nowrap",
            opacity:sharing?.7:1}}>
          {sharing
            ? <><div style={{width:13,height:13,border:"2px solid rgba(255,255,255,.4)",
                borderTop:"2px solid #fff",borderRadius:"50%",animation:"spin .7s linear infinite"}}/> Wait…</>
            : <>{isNative()?"Share":"Download"}</>
          }
        </button>
      </div>

      {/* Tip bar */}
      <div style={{background:C.amberPale,borderBottom:`1px solid ${C.amber}30`,
        padding:"8px 14px",fontSize:12,color:C.amber,display:"flex",
        alignItems:"center",gap:6,flexShrink:0,lineHeight:1.4}}>
        
        {isNative()
          ? <span>Tap <b>Share</b> → open in <b>Chrome</b> → tap ⋮ → <b>Print</b> → <b>Save as PDF</b></span>
          : <span>Use <b>Print</b> to save as PDF, or <b>Download</b> to get the HTML file</span>
        }
      </div>

      {/* Share result banner — auto-dismisses after 5s */}
      {shareMsg && (
        <div style={{
          background: shareMsg.ok ? C.greenPale : C.redPale,
          borderBottom: `1px solid ${shareMsg.ok ? C.green : C.red}40`,
          padding:"9px 14px",fontSize:12,
          color: shareMsg.ok ? C.green : C.red,
          display:"flex",alignItems:"center",gap:6,flexShrink:0,lineHeight:1.5,
          animation:"fadeIn .2s ease",
        }}>
          <span style={{flexShrink:0}}>{shareMsg.ok ? <CheckCircle size={14} color={C.green}/> : <AlertTriangle size={14} color={C.red}/>}</span>
          <span>{shareMsg.text}</span>
          <button onClick={()=>setShareMsg(null)}
            style={{marginLeft:"auto",background:"none",border:"none",cursor:"pointer",
              fontSize:14,color:"inherit",opacity:.6,padding:"0 2px",flexShrink:0}}>✕</button>
        </div>
      )}

      {/* Document iframe */}
      <div style={{flex:1,overflow:"auto",padding:isNative()?0:"12px 0",
        display:"flex",justifyContent:"center",background:C.offWhite}}>
        <iframe
          ref={iframeRef}
          srcDoc={html}
          style={{
            width:isNative()?"100%":"calc(100% - 24px)",
            maxWidth:isNative()?"100%":860,
            flex:isNative()?1:"none",
            height:isNative()?"100%":"auto",
            minHeight:isNative()?undefined:"80vh",
            border:"none",
            background:"#fff",
            borderRadius:isNative()?0:8,
            boxShadow:isNative()?"none":"0 4px 24px rgba(0,0,0,.12)",
            transform:isNative()?undefined:`scale(${zoom/100})`,
            transformOrigin:"top center",
          }}
          title={title}
          sandbox="allow-same-origin allow-scripts allow-modals"/>
      </div>
    </div>
  );
}

// ─── SECTION PILL SELECTOR ────────────────────────────────────────────────────
function SectionSelector(){
  const {sections,selectedSection,selectSection,loading}=useSection();
  const [hover,setHover]=useState(null);

  const pills=[
    {id:'all',label:'All Sections',code:'ALL',color:C.muted},
    ...sections.map(s=>({id:s.id,label:s.name,code:s.code,color:s.color||C.blue,data:s}))
  ];

  if(loading) return(
    <div style={{background:"#0B0B0B",borderBottom:`1px solid ${C.border}`,padding:"10px 20px"}}>
      <span style={{color:C.muted,fontSize:12}}>Loading sections…</span>
    </div>
  );

  return(
    <div style={{background:C.white,borderBottom:`1px solid ${C.border}`,
      padding:"8px 12px",display:"flex",alignItems:"center",gap:10,
      overflowX:"auto",scrollbarWidth:"none",WebkitOverflowScrolling:"touch",
      boxShadow:"0 1px 4px rgba(0,0,0,.04)",flexShrink:0}}>
      <span style={{fontSize:10,fontWeight:800,color:C.muted,textTransform:"uppercase",
        letterSpacing:1.2,whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:4,flexShrink:0}}>
        <Folder size={11} style={{flexShrink:0}}/>Section
      </span>
      <div style={{width:1,height:18,background:C.border,flexShrink:0}}/>
      <div style={{display:"flex",gap:5,flexShrink:0}}>
        {pills.map(p=>{
          const active = p.id==='all' ? selectedSection===null : selectedSection?.id===p.id;
          return(
            <button key={p.id}
              onMouseEnter={()=>setHover(p.id)}
              onMouseLeave={()=>setHover(null)}
              onClick={()=>selectSection(p.id==='all'?null:p.data)}
              style={{
                padding:"5px 14px",borderRadius:20,
                border:`1.5px solid ${active?p.color:hover===p.id?p.color+"66":"transparent"}`,
                background:active?p.color:hover===p.id?p.color+"10":C.offWhite,
                color:active?"#fff":hover===p.id?p.color:C.muted,
                fontSize:11.5,fontWeight:active?700:500,cursor:"pointer",
                transition:"all .15s ease",letterSpacing:.2,
                display:"flex",alignItems:"center",gap:5,
                boxShadow:active?`0 2px 8px ${p.color}40`:"none",
              }}>
              {p.label}
              {p.code!=='ALL'&&(
                <span style={{
                  background:active?"rgba(255,255,255,.22)":p.color+"18",
                  color:active?"#fff":p.color,
                  padding:"1px 6px",borderRadius:8,fontSize:9,fontWeight:800,letterSpacing:.5
                }}>{p.code}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── APP ICON ──────────────────────────────────────────────────────────────────
// Maps icon-name strings to Lucide components for use in nav, headers, buttons
const ICON_MAP = {
  // Navigation
  dashboard: LayoutDashboard, members: Users, students: GraduationCap,
  teachers: BookUser, classes: School, subjects: BookOpen, sections: Layers,
  assignments: Link2, results: BarChart3, 'report-cards': FileText,
  transcript: ScrollText, 'result-approvals': ShieldCheck, 'academic-summary': Award,
  'report-settings': Settings2, grading: ListChecks,
  'fee-items': Tag, 'fee-templates': FileStack, 'fee-generate': Zap,
  'fee-tracker': CreditCard, 'fee-stats': TrendingUp,
  announce: Megaphone, attendance: ClipboardCheck,
  mail: Mail, 'mail-logs': Inbox,
  'bulk-promote': ArrowUpCircle, 'recycle-bin': Trash2, 'audit-log': History, approvals: CheckCircle2,
  'admin-tools': Database, notifications: Bell, permissions: Shield,
  timetable: TableProperties, export: Download, 'login-activity': Activity, broadsheet: Table,
  'my-classes': School, 'upload-results': Upload, 'add-students': UserPlus,
  'my-results': FileText, 'my-payments': CreditCard,
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
          <SectionProvider>
            <AppInnerWrapper/>
          </SectionProvider>
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
    const id="rgs-print-styles";
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
          background:"rgba(10,15,30,0.82)",backdropFilter:"blur(6px)"}}>
          <div style={{background:C.white,borderRadius:20,padding:"44px 48px",maxWidth:460,width:"90%",
            textAlign:"center",boxShadow:"0 32px 80px rgba(0,0,0,0.45)",
            border:"3px solid #EF4444",animation:"fadeUp .35s ease"}}>
            <div style={{display:"flex",justifyContent:"center",marginBottom:18}}>
              <div style={{background:C.redPale,borderRadius:"50%",width:72,height:72,
                display:"flex",alignItems:"center",justifyContent:"center",
                animation:"pulse 2s ease infinite"}}>
                <WifiOff size={36} color="#EF4444"/>
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
          zIndex:99999,background:"#10B981",color:"#fff",
          padding:"14px 28px",borderRadius:14,fontWeight:700,fontSize:14,
          boxShadow:"0 8px 32px rgba(16,185,129,0.45)",animation:"fadeUp .3s ease",
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

// ── Time-based greeting helper ────────────────────────────────────────────────
function getGreeting(name){
  const h=new Date().getHours();
  const n=(name||"").split(" ")[0]||"there";
  if(h>=5&&h<12) return `Good morning, ${n}.`;
  if(h>=12&&h<17) return `Good afternoon, ${n}.`;
  return `Good evening, ${n}.`;
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
  const [bio,setBio]=useState(user.bio||"");
  const [pw,setPw]=useState("");
  const [pw2,setPw2]=useState("");
  const [saving,setSaving]=useState(false);

  const save=async()=>{
    if(pw&&pw.length<4){notify("Password must be at least 4 characters","error");return;}
    if(pw&&pw!==pw2){notify("Passwords do not match","error");return;}
    setSaving(true);
    if(user.role==="admin"){
      const pairs=[{key:"admin_name",value:name}];
      if(pw) pairs.push({key:"admin_password_hash",value:pw});
      await db.setSettings(pairs);
    } else if(user.role==="teacher"||user.role==="manager"||user.role==="bursar"){
      const upd={display_name:name,bio,profile_updated_at:new Date().toISOString()};
      if(pw) upd.password_hash=pw;
      await db.upsertTeacher(upd,user.teacher_db_id);
    } else if(user.role==="student"){
      const upd={display_name:name,bio,profile_updated_at:new Date().toISOString()};
      if(pw) upd.password_hash=pw;
      await db.upsertStudent(upd,user.student_id);
    }
    setSaving(false);
    notify("Profile updated ✓");
    onUpdated({...user,name});
    onClose();
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
          <Badge color={user.role==="admin"?C.orange:user.role==="teacher"?C.green:C.blue}>
            {user.role.toUpperCase()}
          </Badge>
          {user.staff_id&&<div style={{fontSize:11,color:C.muted,marginTop:3}}>Staff ID: {user.staff_id}</div>}
          {user.student_id&&<div style={{fontSize:11,color:C.muted,marginTop:3}}>Member ID: {user.student_id}</div>}
        </div>
      </div>
      <Inp label="Display Name" value={name} onChange={setName} placeholder="Your full name"/>
      <Inp label="Bio / Notes (optional)" value={bio} onChange={setBio} placeholder="Brief description…"/>
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
    <div style={{position:"fixed",inset:0,background:"rgba(2,6,23,.65)",backdropFilter:"blur(8px)",
      zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:C.white,borderRadius:24,padding:"36px 32px",maxWidth:380,width:"100%",
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
              background:`linear-gradient(135deg,#DC2626,#B91C1C)`,
              color:"#fff",fontWeight:800,fontSize:13,cursor:"pointer",
              boxShadow:"0 6px 20px rgba(220,38,38,.35)",transition:"all .15s"}}
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
    <div style={{position:"fixed",inset:0,background:"rgba(2,6,23,.8)",backdropFilter:"blur(10px)",
      zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:`linear-gradient(160deg,${C.blueDark} 0%,#061124 100%)`,
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
          color: urgent ? "#FC8181" : C.orange}}>
          {secondsLeft}<span style={{fontSize:20,fontWeight:600,opacity:.7}}>s</span>
        </div>
        {/* Stay logged in */}
        <button onClick={onStay}
          style={{width:"100%",padding:"14px",borderRadius:12,border:"none",cursor:"pointer",
            background:`linear-gradient(135deg,${C.orange},#374151)`,color:"#fff",
            fontSize:15,fontWeight:800,letterSpacing:".2px",marginBottom:10,
            boxShadow:"0 4px 16px rgba(232,86,10,.4)",transition:"opacity .15s"}}
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
  // ── Shared (all roles) ──
  {id:"welcome",       title:"Welcome to JAMES-DENNING 👋",
    content:"This quick tour walks you through the key features available to you. Use the arrows to navigate, or press Skip to explore on your own.",
    target:null, page:null, placement:"center", roles:null, perms:null},
  {id:"nav-sidebar",   title:"Navigation Sidebar",
    content:"Use the sidebar to jump between modules. Click the hamburger icon (≡) to collapse or expand it anytime.",
    target:"aside", page:"dashboard", placement:"right", roles:null, perms:null},
  {id:"nav-dashboard", title:"Dashboard",
    content:"Your home base — shows key stats, recent activity, and quick-action cards tailored to your role.",
    target:"[data-tour='nav-dashboard']", page:"dashboard", placement:"right", roles:null, perms:null},
  // ── Admin / Manager ──
  {id:"nav-members",   title:"Members",
    content:"View and manage all staff accounts — staff and managers. You can change roles, reset passwords, and see last-login dates here.",
    target:"[data-tour='nav-members']", page:"members", placement:"right",
    roles:["admin","manager"], perms:null},
  {id:"nav-students",  title:"Members",
    content:"Full people directory with filtering, bulk operations, and onboarding email tools.",
    target:"[data-tour='nav-students']", page:"students", placement:"right",
    roles:["admin"], perms:null},
  {id:"nav-results-admin", title:"Results",
    content:"Upload, review and approve performance results. Use the XLS template to populate scores in bulk.",
    target:"[data-tour='nav-results-admin']", page:"results-admin", placement:"right",
    roles:["admin"], perms:null},
  {id:"nav-report-cards", title:"Reports",
    content:"Publish reports for a group/period, generate PDFs, and email them directly to contacts.",
    target:"[data-tour='nav-report-cards']", page:"report-cards", placement:"right",
    roles:["admin","teacher"], perms:null},
  {id:"nav-fee-tracker", title:"Payment Tracker",
    content:"Track member payments, record manual bank deposits, and issue refunds. Integrated with Paystack for online payments.",
    target:"[data-tour='nav-fee-tracker']", page:"fee-tracker", placement:"right",
    roles:["admin","manager"], perms:null},
  {id:"nav-announce",  title:"Announcements",
    content:"Post organization-wide or group-specific announcements visible to all portal users.",
    target:"[data-tour='nav-announce']", page:"announce", placement:"right",
    roles:["admin","teacher","manager"], perms:null},
  {id:"nav-attendance", title:"Attendance",
    content:"Record daily attendance for your groups. Supports Present, Absent, Late, and Excused statuses.",
    target:"[data-tour='nav-attendance']", page:"attendance", placement:"right",
    roles:["admin","teacher"], perms:null},
  {id:"nav-audit-log", title:"Audit Trail",
    content:"Every admin action is logged here — useful for accountability and troubleshooting.",
    target:"[data-tour='nav-audit-log']", page:"audit-log", placement:"right",
    roles:["admin"], perms:null},
  {id:"settings-btn",  title:"Settings",
    content:"Configure organization info, performance cycles, grading schemes, RBAC permissions, and portal behaviour.",
    target:"[data-tour='settings-btn']", page:"dashboard", placement:"bottom",
    roles:["admin"], perms:null},
  // ── Staff ──
  {id:"nav-my-classes", title:"My Groups",
    content:"See all groups assigned to you and the members in each group.",
    target:"[data-tour='nav-my-classes']", page:"my-classes", placement:"right",
    roles:["teacher"], perms:null},
  {id:"nav-results-teach", title:"Upload Results",
    content:"Download the XLS template for your group, fill in scores, then upload to submit results for approval.",
    target:"[data-tour='nav-results-teach']", page:"results-teach", placement:"right",
    roles:["teacher"], perms:null},
  // ── Member ──
  {id:"nav-my-results", title:"My Report",
    content:"View your published report card and download a PDF copy.",
    target:"[data-tour='nav-my-results']", page:"my-results", placement:"right",
    roles:["student"], perms:null},
  {id:"nav-my-bill",   title:"My Bill",
    content:"See your outstanding billing and make payments via Paystack.",
    target:"[data-tour='nav-my-bill']", page:"my-bill", placement:"right",
    roles:["student"], perms:null},
  // ── Finish ──
  {id:"finish",        title:"You're all set! 🎉",
    content:"That's the tour! You can restart it anytime by clicking the ? button in the top-right header. If you need help, contact your organization administrator.",
    target:"[data-tour='tour-trigger']", page:"dashboard", placement:"bottom",
    roles:null, perms:null},
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
        background: dark ? "#1E2D3D" : "#ffffff",
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
                background:`linear-gradient(135deg,${C.orange},#374151)`,
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
                ← Back
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
              style={{background:`linear-gradient(135deg,${C.orange},#374151)`,
                border:"none", borderRadius:8, padding:"6px 16px",
                cursor:"pointer", fontSize:12, fontWeight:800, color:"#fff",
                display:"flex",alignItems:"center",gap:5,
                boxShadow:`0 2px 10px ${C.orange}40`}}>
              {isLast ? "Finish ✓" : "Next →"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function AppInner(){
  const [user,setUser]         = useState(()=>loadSession());
  const [page,setPage]         = useState("jd-chat");
  // Optional payload set alongside a page navigation (e.g. dashboard "Fix →" links) so the
  // target page can pre-apply a filter. The target page should clear it after reading it.
  const [pageParam,setPageParam] = useState(null);
  const [pendingApprovals,setPendingApprovals] = useState(0);
  const [pendingAccessRequests,setPendingAccessRequests] = useState(0);
  const [refreshKey,setRefreshKey] = useState(0);
  const bumpRefresh = ()=>setRefreshKey(k=>k+1);
  const [sideOpen,setSide]     = useState(()=>window.innerWidth>=768);
  const [collapsedGroups,setCollapsedGroups] = useState(new Set());
  const [sidebarSearch,setSidebarSearch] = useState("");
  const sidebarRef = useRef(null);
  const navigationToggleRef = useRef(null);
  const [toasts,setToasts]     = useState([]);
  const [loginLoading,setLoginLoading] = useState(false);
  const [showSettings,setShowSettings] = useState(false); // kept for legacy; now uses setPage("settings")
  const [showProfile,setShowProfile]   = useState(false);
  const [showLogout,setShowLogout]     = useState(false);
  const [showTour,setShowTour]         = useState(false);
  // showInactivityWarning replaced by useInactivityTimeout hook below
  const [rolePerms,setRolePerms]       = useState([]);
  const [userPerms,setUserPerms]       = useState([]);
  const [pdfDoc,setPdfDoc]             = useState(null); // {html,title} — mobile in-app viewer
  const [inactivityMs,setInactivityMs] = useState(5*60*1000); // configurable via school_settings
  const {selectedSection,refreshSchool:ctxRefreshSchool,schoolName:_sidebarSchoolName,workspaceType,educationModuleEnabled,terms} = useSection();
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
    if(user.role==="admin"){
      // Admin: load pending approval counts
      db.getStudentRequests("pending").then(({data})=>setPendingApprovals((data||[]).length));
      db.getSubjectAccessRequests({status:'pending'}).then(({data})=>setPendingAccessRequests((data||[]).length));
      return;
    }
    Promise.all([
      db.getRolePermissions(user.role),
      db.getUserPermissions((user.role==="teacher"||user.role==="manager"||user.role==="bursar")?user.staff_id:user.student_id),
    ]).then(([rp,up])=>{
      setRolePerms(rp.data||[]);
      setUserPerms(up.data||[]);
    });
  },[user]);

  // Auto-start tour on first login for this user
  useEffect(()=>{
    if(!user) return;
    const uid = user.staff_id || user.student_id || user.id;
    const key = `rgs_tour_done_${uid}`;
    try { if(!localStorage.getItem(key)){ setTimeout(()=>setShowTour(true),1800); } }
    catch(e){}
  },[user?.staff_id||user?.student_id||user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
    // Fire-and-forget: clear DB session token only if it still matches ours.
    // If another device already replaced it, this is a no-op (avoids kicking the new session).
    if(user&&user._sessionToken&&user._userType){
      const uid=user._userType==='student'?user.student_id:user.teacher_db_id;
      if(uid) db.clearSessionToken(user._userType,uid,user._sessionToken).catch(()=>{});
    }
    if(kicked){
      try{sessionStorage.setItem('rgs_kicked_out','1');}catch{}
    } else {
      // Manual logout — stamp a flag so any concurrent token-check race can't
      // show the "signed in on another device" banner after a normal sign-out.
      try{sessionStorage.setItem('rgs_manual_logout','1');}catch{}
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

  // ── Single-device session enforcement ──────────────────────────────────────
  // Every 60 s, check if the session token in the DB still matches ours.
  // If another device logged in, it replaced the token → we get kicked here.
  useEffect(()=>{
    if(!user||user.role==='admin'||!user._sessionToken||!user._userType) return;
    const uid=user._userType==='student'?user.student_id:user.teacher_db_id;
    if(!uid) return;
    const check=async()=>{
      try{
        const valid=await db.checkSessionToken(user._userType,uid,user._sessionToken);
        if(valid===false) doLogout(true);
      }catch{/* network error — don't kick */}
    };
    const t=setInterval(check,60000);
    return()=>clearInterval(t);
  },[user?._sessionToken]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Organization context (multi-tenant) ────────────────────────────────────────
  const [selectedSchool,setSelectedSchool]=useState(()=>loadSelectedSchool());
  const [platformAdmin,setPlatformAdmin]=useState(null);

  useEffect(()=>{
    setSidebarSearch("");
    setCollapsedGroups(new Set());
  },[user?.id,user?.role,selectedSchool?.id]);

  useEffect(()=>{
    if(!isMobile || !sideOpen || !user || !selectedSchool || platformAdmin || pdfDoc || !sidebarRef.current) return;
    return bindMobileNavigation(sidebarRef.current,{
      onClose:()=>setSide(false),returnFocus:navigationToggleRef.current
    });
  },[isMobile,sideOpen,user?.id,user?.role,selectedSchool?.id,platformAdmin,pdfDoc]);

  // db school context is set synchronously at module load (see IIFE above loadSelectedSchool).
  // No useEffect needed here — _schoolId is already correct before any component renders.

  const selectSchool=(school)=>{
    saveSelectedSchool(school);
    db.setSchool(school.id, school.student_id_prefix||'SCH', school.name||'');
    window.location.reload();
  };

  // Auto-select school from ?school=xxx query param (set by each school's website portal link).
  // Slug-to-ID map avoids relying on fuzzy name/prefix matching.
  // Cleans the URL immediately so the param never lingers after reload.
  const SCHOOL_SLUGS={
    rgs:'5f8d21ae-bb54-4528-bd01-0a21f180709d',
    heyday:'dcd5c5e5-19a3-4f5c-b30d-90667f4373ab',
    // Legacy demo-tenant route. A tenant ID does not establish environment isolation.
    // Never treat this tenant as a safe staging database or publish shared credentials.
    sandbox:'f0000000-0000-4000-8000-000000000001',
  };
  useEffect(()=>{
    const param=new URLSearchParams(window.location.search).get('school');
    if(!param) return;
    window.history.replaceState({},'',window.location.pathname);
    const slug=param.toLowerCase();
    const targetId=SCHOOL_SLUGS[slug]||slug; // fallback: treat slug as raw UUID
    if(selectedSchool?.id===targetId) return; // already on the right school
    db.getSchools().then(({data})=>{
      const school=(data||[]).find(s=>s.id===targetId);
      if(school){ clearSession(); selectSchool(school); } // clear any old-school login before switching
    });
  },[]); // eslint-disable-line react-hooks/exhaustive-deps

  const changeSchool=()=>{
    clearSelectedSchool();
    clearSession();
    window.location.reload();
  };

  // Called by SchoolManagerModal after saving school details
  const onSchoolUpdated=(updatedSchool)=>{
    saveSelectedSchool(updatedSchool);
    setSelectedSchool(updatedSchool);
    db.setSchool(updatedSchool.id, updatedSchool.student_id_prefix||'SCH', updatedSchool.name||'');
    if(ctxRefreshSchool) ctxRefreshSchool(updatedSchool);
  };

  const loginAsPlatformAdmin=async(pin)=>{
    const {admin,error}=await db.getPlatformAdmin();
    if(error||!admin) return "Platform admin account not found.";
    if(admin.password_hash!==pin) return "Incorrect PIN.";
    await db.updatePlatformAdminLogin(admin.id);
    setPlatformAdmin(admin);
    return null;
  };

  // ── Auth login (moved inside component to fix scope issue) ──────────────────
  // Must exactly match the synthetic-email slug logic in the manage-account
  // edge function (supabase/functions/manage-account/index.ts) — same
  // kind/localId/schoolId in, same email out, or logins will silently fail.
  const syntheticEmail = (kind, localId, schoolId) => {
    const clean = String(localId).toLowerCase().replace(/[^a-z0-9]/g,"");
    return `${kind}-${clean}--${schoolId}@login.internal`;
  };

  const authLogin = async(identifier, password, schoolId=null)=>{
    const id = identifier.trim();
    const pw = password.trim();
    if(!id||!pw) return {error:"Enter your ID and password."};
    if(!schoolId) return {error:"Please select an organization before logging in."};

    try {
      const access = await db.getLoginAccessSettings(schoolId);
      if(access?.error) throw access.error;
      const _accessMsg = (role)=>{
        const custom = (access.login_disabled_message||"").trim();
        const defaults = {
          teacher:"Staff logins are currently disabled. Please contact the organization office.",
          student:"Member logins are currently disabled. Please contact the organization office.",
        };
        return custom || defaults[role] || "Logins are currently disabled. Please contact the organization office.";
      };

      // Admin logs in with the literal word "admin" as their ID; everyone
      // else (staff/student) logs in with their real ID, mapped to the
      // deterministic synthetic email used when their account was created.
      let authEmail;
      let expectedRole;
      if(id.toLowerCase()==="admin"){
        const {data:sa,error:saErr}=await db.loginGetSchoolAdmin(schoolId);
        if(saErr) throw saErr;
        if(!sa) return {error:"ID not recognised. Staff: Staff ID · Members: Member ID · Admin: type 'admin'"};
        authEmail = sa.admin_email;
        expectedRole = "admin";
      } else {
        // Try as staff ID first, then as a student/member ID — both are
        // just deterministic email guesses, no data is fetched yet.
        const {data:teacher} = await db.loginFindTeacher(id, schoolId);
        if(teacher){
          if(access.login_teachers_disabled==="true") return {error:_accessMsg("teacher")};
          authEmail = syntheticEmail("staff", id, schoolId);
          expectedRole = "teacher";
        } else {
          const {data:student} = await db.loginFindStudent(id, schoolId);
          if(!student) return {error:"ID not recognised. Staff: Staff ID · Members: Member ID · Admin: type 'admin'"};
          const st = student.status||"active";
          if(st!=="active"){
            const msgs={
              inactive:"Your account is currently inactive. Please contact the organization office.",
              suspended:"Your account has been suspended. Please contact the organization administration.",
              graduated:"This account belongs to a graduated member and is no longer active.",
              withdrawn:"This account has been withdrawn and is no longer active.",
              left:"This account is no longer active. Please contact the organization office.",
            };
            return{error:msgs[st]||"Your account is not active. Please contact the organization office."};
          }
          if(access.login_students_disabled==="true") return {error:_accessMsg("student")};
          authEmail = syntheticEmail("student", id, schoolId);
          expectedRole = "student";
        }
      }

      // The actual auth check — real Supabase Auth, real password hashing,
      // real session. Nothing about the password is compared in JS anymore.
      const {data:authData, error:authErr} = await supabase.auth.signInWithPassword({email:authEmail, password:pw});
      if(authErr) return {error: expectedRole==="admin" ? "Wrong admin password." : "Wrong password."};

      const {data:profile, error:profileError} = await supabase.from('profiles').select('*').eq('id',authData.user.id).single();
      const allowedRoles=expectedRole==="teacher"?["teacher","manager","bursar"]:[expectedRole];
      if(profileError||!profile?.school_id||profile.school_id!==schoolId||!allowedRoles.includes(profile.role)){
        await supabase.auth.signOut();
        return {error:"This account is not linked to the selected organization or role."};
      }

      if(expectedRole==="teacher"){
        const {data:teacher} = await db.loginFindTeacher(id, schoolId);
        db.recordLogin('teacher',teacher.id);
        return {user:{id:String(teacher.id),role:teacher.role||'teacher',name:teacher.display_name||teacher.full_name,
          staff_id:teacher.staff_id,teacher_db_id:teacher.id,email:teacher.email,school_id:schoolId,
          _authUserId:authData.user.id,_userType:'teacher'}};
      }
      if(expectedRole==="student"){
        const {data:student} = await db.loginFindStudent(id, schoolId);
        db.recordLogin('student',student.id);
        return {user:{id:student.id,role:"student",name:student.display_name||fullName(student),
          student_id:student.id,class_id:student.class_id,email:student.email,school_id:schoolId,
          _authUserId:authData.user.id,_userType:'student'}};
      }
      // admin
      const {data:sa} = await db.loginGetSchoolAdmin(schoolId);
      return {user:{id:"admin",role:"admin",name:sa?.admin_name||profile?.full_name||"Administrator",
        email:authEmail,is_admin:true,school_id:schoolId,_authUserId:authData.user.id}};

    } catch(err) {
      const msg = err?.message||String(err);
      if(msg.includes("Failed to fetch")||msg.includes("NetworkError")||msg.includes("fetch")){
        return {error:"Network error — please check your connection and try again."};
      }
      console.error("Auth error:", err);
      return {error:"Login failed. Please refresh and try again."};
    }
  };

  const login=async(identifier,password)=>{
    setLoginLoading(true);
    const {user:u,error}=await authLogin(identifier,password,selectedSchool?.id||null);
    setLoginLoading(false);
    if(error) return error;
    saveSession(u);
    setUser(u); return null;
  };

  // ── Compact grouped NAV ──
  // Admin: grouped by category with dividers
  // Staff/Member: only permitted pages
  const ALL_NAV = [
    {id:"jd-chat",          label:"JD Assistant",    icon:"dashboard", roles:["admin","teacher","student","bursar","manager"]},
    {id:"jd-operations", label:"Business Operations", icon:"activity", roles:["admin","manager"]},
    {id:"dashboard",       label:"Overview",        icon:"dashboard", roles:["admin","teacher","student","bursar"]},
    // ── Admin groups ──
    {id:"g-academic",      group:"Operations",      roles:["admin","bursar"]},
    {id:"members",         label:"Team",           icon:"members", roles:["admin","manager","bursar"],    gid:"g-academic"},
    {id:"students",        label:"People",          icon:"students", roles:["admin"],    gid:"g-academic"},
    {id:"teachers",        label:"Team",          icon:"teachers", roles:["admin"],    gid:"g-academic"},
    {id:"classes",         label:"Groups",           icon:"classes", roles:["admin"],    gid:"g-academic"},
    {id:"subjects",        label:"Categories",          icon:"subjects", roles:["admin"],    gid:"g-academic"},
    {id:"sections",        label:"Divisions",          icon:"sections", roles:["admin"],    gid:"g-academic"},
    {id:"calendar",        label:"Calendar", icon:"calendar",    roles:["admin","teacher"], gid:"g-academic"},
    {id:"timetable",       label:"Schedule",         icon:"timetable",   roles:["admin","teacher"], gid:"g-academic"},
    {id:"broadsheet",      label:"Performance Matrix",        icon:"broadsheet",  roles:["admin"],           gid:"g-academic"},
    {id:"g-results",       group:"Performance",        roles:["admin"]},
    {id:"assignments",     label:"Assignments",       icon:"assignments", roles:["admin"],    gid:"g-results"},
    {id:"results",         label:"Performance Records",           icon:"results", roles:["admin"],    gid:"g-results"},
    {id:"report-cards",    label:"Reports",      icon:"report-cards", roles:["admin","teacher"], gid:"g-results"},
    {id:"transcript",      label:"History",        icon:"transcript", roles:["admin","student"],  gid:"g-results"},
    {id:"academic-summary",label:"Analytics",icon:"academic-summary",roles:["admin"],     gid:"g-results"},
    {id:"report-card-settings",label:"Report Settings", icon:"report-settings", roles:["admin"], gid:"g-results"},
    {id:"grading",         label:"Scoring & Rubrics",     icon:"grading", roles:["admin"],    gid:"g-results"},
    {id:"g-fees",          group:"Billing",           roles:["admin","bursar"]},
    {id:"fee-items",       label:"Billing Items",         icon:"fee-items", roles:["admin","manager","bursar"],    gid:"g-fees"},
    {id:"fee-templates",   label:"Billing Templates",         icon:"fee-templates", roles:["admin","manager","bursar"],    gid:"g-fees"},
    {id:"fee-generate",    label:"Generate Bills",    icon:"fee-generate", roles:["admin","manager","bursar"],    gid:"g-fees"},
    {id:"fee-tracker",     label:"Payment Tracker",   icon:"fee-tracker", roles:["admin","manager","bursar"],    gid:"g-fees"},
    {id:"fee-stats",       label:"Billing Analytics",        icon:"fee-stats", roles:["admin","manager","bursar"],    gid:"g-fees"},
    {id:"g-comms",         group:"Communication",  roles:["admin","teacher","bursar"]},
    {id:"announce",        label:"Notices",     icon:"announce", roles:["admin","teacher","manager","bursar"], gid:"g-comms"},
    {id:"attendance",      label:"Attendance",        icon:"attendance", roles:["admin","teacher"], gid:"g-comms"},
    {id:"mail-compose",    label:"Send Email",        icon:"mail",  roles:["admin"],    gid:"g-comms"},
    {id:"mail-logs",       label:"Email Logs",        icon:"mail-logs", roles:["admin"],    gid:"g-comms"},
    {id:"g-admin",         group:"Administration",  roles:["admin"]},
    {id:"admin-tools",     label:"Admin Tools",        icon:"database",   roles:["admin"],    gid:"g-admin"},
    {id:"org-create",      label:"Register Organization", icon:"building", roles:["admin"],   gid:"g-admin"},
    {id:"hiring",          label:"Hiring",              icon:"user-check", roles:["admin"],   gid:"g-admin"},
    {id:"notifications",   label:"Notifications",      icon:"bell",       roles:["admin"],    gid:"g-admin"},
    {id:"permissions",     label:"Permissions",        icon:"shield",     roles:["admin"],    gid:"g-admin"},
    {id:"g-approvals",     group:"Approvals",      roles:["admin"]},
    {id:"approvals",       label:"People Approvals", icon:"approvals", roles:["admin"],    gid:"g-approvals"},
    {id:"access-requests", label:"Access Requests",   icon:"approvals", roles:["admin"],    gid:"g-approvals"},
    // ── Staff-only (flat) ──
    {id:"my-classes",      label:"My Groups",        icon:"my-classes", roles:["teacher"]},
    {id:"results-teach",   label:"Upload Records",    icon:"upload-results", roles:["teacher"]},
    {id:"add-students",    label:"Add People",      icon:"add-students", roles:["teacher"]},
    {id:"request-access",  label:"Request Access",    icon:"approvals",  roles:["teacher"]},
    // ── Member-only ──
    {id:"my-results",      label:"My Reports",    icon:"my-results", roles:["student"]},
    {id:"my-payments",     label:"My Payments",       icon:"my-payments", roles:["student"]},
    {id:"my-bill",         label:"My Bill",           icon:"receipt", roles:["student"]},
  ];

  // Check if user can access a page (admin always yes)
  const canAccess=(pageId)=>{
    if(!user||user.role==="admin") return true;
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

  if(platformAdmin) return <PlatformDashboardPage admin={platformAdmin} onLogout={()=>setPlatformAdmin(null)}/>;
  if(!selectedSchool) return <SchoolSelectPage onSelect={selectSchool} onPlatformAdmin={loginAsPlatformAdmin}/>;
  if(!user) return <LoginPage login={login} loading={loginLoading} toasts={toasts} rmToast={rmToast}
    selectedSchool={selectedSchool} onChangeSchool={changeSchool} onSchoolUpdated={onSchoolUpdated}/>;

  const role=user.role;


  // Deduplicate & filter. Education tenants can opt into the original academic
  // labels without changing the underlying routes or database schema.
  const navSource = workspaceType==="education" && educationModuleEnabled
    ? ALL_NAV.map(n=>{
        const label=EDUCATION_NAV_LABELS[n.id];
        return label ? (n.group ? {...n,group:label} : {...n,label}) : n;
      })
    : ALL_NAV;
  const seenIds = new Set();
  const NAV = navSource.filter(n=>{
    if(!n.roles||!n.roles.includes(role)) return false;
    if(n.group){
      // Group header: only include if at least one child item is visible
      const hasChild=navSource.some(c=>c.gid===n.id&&c.roles&&c.roles.includes(role)&&(role==="admin"||canAccess(c.id)));
      return hasChild;
    }
    if(seenIds.has(n.id)) return false;
    seenIds.add(n.id);
    if(role==="admin") return true;
    return canAccess(n.id);
  });

  const navigationQuery = sideOpen || isMobile ? sidebarSearch : "";
  const visibleNavigation = searchNavigation(NAV,navigationQuery);
  const groupCollapsed = (id) => isNavGroupCollapsed(id,collapsedGroups,navigationQuery,sideOpen||isMobile);

  const showPDF = (html, title="Document") => setPdfDoc({html, title});
  const ctx={user,role,notify,setPage,selectedSection,canAccess,pendingApprovals,setPendingApprovals,pendingAccessRequests,setPendingAccessRequests,showPDF,refreshKey,bumpRefresh,selectedSchool,pageParam,setPageParam,workspaceType,educationModuleEnabled,terms};

  // On mobile the sidebar is always a full overlay; on desktop it collapses to icon rail
  const closeSideOnMobile = () => {
    if(isMobile){setSide(false);navigationToggleRef.current?.focus();}
  };

  // Mobile in-app PDF viewer — covers everything
  if(pdfDoc) return <PDFViewer html={pdfDoc.html} title={pdfDoc.title} onClose={()=>setPdfDoc(null)}/>;

  const isSandbox = selectedSchool?.id===SCHOOL_SLUGS.sandbox;

  return(
    <div style={{display:"flex",minHeight:"100vh",background:C.offWhite,
      fontFamily:"'Segoe UI',system-ui,sans-serif",transition:"background .2s",
      paddingTop:isSandbox?22:0}}>

      {/* A legacy demo tenant is not an isolated staging environment. */}
      {isSandbox&&(
        <div style={{position:"fixed",top:0,left:0,right:0,height:22,zIndex:9999,
          background:"#7C3AED",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",
          fontSize:11,fontWeight:800,letterSpacing:1,fontFamily:"var(--font-sans)"}}>
          DEMO WORKSPACE — staging isolation not verified
        </div>
      )}

      {/* Mobile backdrop */}
      {isMobile&&sideOpen&&(
        <div onClick={closeSideOnMobile}
          style={{position:"fixed",inset:0,background:"rgba(2,6,23,.55)",
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
                whiteSpace:"nowrap"}}>James Denning</div>
              <div style={{color:"rgba(255,255,255,.4)",fontSize:9,textTransform:"uppercase",
                letterSpacing:.3,marginTop:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={_sidebarSchoolName||"Your organisation"}>{_sidebarSchoolName||"Your organisation"}</div>
            </div>
          )}
        </div>

        {(sideOpen||isMobile)&&<div style={{padding:"10px 10px 4px",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:7,border:"1px solid rgba(255,255,255,.18)",borderRadius:9,padding:"6px 8px",color:"#aab2bd"}}>
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
          {navigationQuery.trim()&&<p role="status" style={{fontSize:11,color:"#b6bec8",padding:"0 10px"}}>{visibleNavigation.filter(n=>!n.group).length} matching pages</p>}
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
                    textTransform:"uppercase",color:"rgba(255,255,255,.35)",background:"none",
                    border:"none",cursor:"pointer",textAlign:"left",marginTop:6,
                    transition:"color .15s"}}
                  onMouseEnter={e=>e.currentTarget.style.color="rgba(255,255,255,.55)"}
                  onMouseLeave={e=>e.currentTarget.style.color="rgba(255,255,255,.35)"}>
                  <span>{n.group}</span>
                  <span style={{fontSize:9,transition:"transform .2s",
                    transform:collapsed?"rotate(-90deg)":"rotate(0deg)"}}>▾</span>
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
                <AppIcon name={n.icon} size={16} color={active?C.orange:"#94A3B8"}/>
                {(sideOpen||isMobile)&&<span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1,
                  letterSpacing:".01em"}}>{n.label}</span>}
                {(sideOpen||isMobile)&&n.id==="approvals"&&pendingApprovals>0&&(
                  <span style={{background:C.orange,color:"#fff",borderRadius:10,fontSize:9,
                    fontWeight:900,padding:"2px 7px",flexShrink:0,
                    boxShadow:"0 2px 8px rgba(232,86,10,.5)"}}>
                    {pendingApprovals}
                  </span>
                )}
                {(sideOpen||isMobile)&&n.id==="access-requests"&&pendingAccessRequests>0&&(
                  <span style={{background:C.orange,color:"#fff",borderRadius:10,fontSize:9,
                    fontWeight:900,padding:"2px 7px",flexShrink:0,
                    boxShadow:"0 2px 8px rgba(232,86,10,.5)"}}>
                    {pendingAccessRequests}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* User / Sign Out */}
        <div style={{padding:"10px 6px",borderTop:"1px solid rgba(255,255,255,.08)",flexShrink:0}}>
          {(sideOpen||isMobile)&&(
            <button onClick={()=>{setShowProfile(true);closeSideOnMobile();}}
              style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"10px 10px",
                borderRadius:10,border:"1px solid rgba(255,255,255,.1)",cursor:"pointer",marginBottom:6,
                background:"rgba(255,255,255,.06)",color:"#fff",textAlign:"left",
                transition:"all .15s"}}
              onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,.12)";}}
              onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,.06)";}}>
              <div style={{width:30,height:30,borderRadius:9,
                background:`linear-gradient(135deg,${C.orange},#374151)`,
                display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:13,fontWeight:900,flexShrink:0,color:"#fff",
                boxShadow:"0 2px 8px rgba(232,86,10,.4)"}}>
                {(user.name||"?")[0].toUpperCase()}
              </div>
              <div style={{overflow:"hidden",flex:1}}>
                <div style={{fontWeight:700,fontSize:12,overflow:"hidden",textOverflow:"ellipsis",
                  whiteSpace:"nowrap",color:"#fff",lineHeight:1.2}}>{user.name}</div>
                <div style={{fontSize:9.5,color:"rgba(255,255,255,.4)",textTransform:"uppercase",
                  letterSpacing:.8,marginTop:2}}>{role}</div>
              </div>
              <span style={{color:"rgba(255,255,255,.3)",fontSize:12}}>›</span>
            </button>
          )}
          <button onClick={()=>setShowLogout(true)}
            style={{width:"100%",display:"flex",alignItems:"center",
              gap:(sideOpen||isMobile)?7:0,justifyContent:(sideOpen||isMobile)?"flex-start":"center",
              padding:"9px 10px",borderRadius:10,border:"none",cursor:"pointer",
              background:"rgba(248,113,113,.1)",color:"rgba(252,165,165,.9)",
              fontSize:11.5,fontWeight:600,transition:"all .15s"}}
            onMouseEnter={e=>{e.currentTarget.style.background="rgba(248,113,113,.2)";e.currentTarget.style.color="#FCA5A5";}}
            onMouseLeave={e=>{e.currentTarget.style.background="rgba(248,113,113,.1)";e.currentTarget.style.color="rgba(252,165,165,.9)";}}>
            <LogOut size={14}/>{sideOpen&&<span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0,
        marginLeft: isMobile ? 0 : undefined}}>
        <header style={{background:C.white,borderBottom:`1px solid ${C.border}`,
          padding:`0 ${isMobile?10:18}px`,height:54,display:"flex",alignItems:"center",
          justifyContent:"space-between",position:"sticky",top:0,zIndex:200,
          boxShadow:"0 1px 0 rgba(0,0,0,.06),0 2px 8px rgba(0,0,0,.04)"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0,flex:1}}>
            <button ref={navigationToggleRef} aria-label={sideOpen?"Close or collapse navigation":"Open navigation"} aria-expanded={sideOpen} aria-controls="workspace-navigation" onClick={()=>setSide(p=>!p)}
              style={{background:"none",border:`1px solid ${C.border}`,cursor:"pointer",
                color:C.muted,padding:"7px 9px",borderRadius:9,
                display:"flex",alignItems:"center",transition:"all .15s",minWidth:36,minHeight:36,
                justifyContent:"center"}}
              onMouseEnter={e=>{e.currentTarget.style.background=C.offWhite;e.currentTarget.style.borderColor=C.blue+"30";}}
              onMouseLeave={e=>{e.currentTarget.style.background="none";e.currentTarget.style.borderColor=C.border;}}>
              <AppIcon name="menu" size={18} color={C.muted}/>
            </button>
            <div style={{display:"flex",alignItems:"center",gap:7,minWidth:0,overflow:"hidden"}}>
              <div style={{width:28,height:28,borderRadius:8,background:C.blue+"14",
                display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <AppIcon name={NAV.find(n=>n.id===page)?.icon||""} size={14} color={C.blue}/>
              </div>
              <span style={{fontSize:isMobile?13:14,fontWeight:800,color:C.text,letterSpacing:"-.01em",
                overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0,
                maxWidth:isMobile?"46vw":260}}>
                {NAV.find(n=>n.id===page)?.label||"Portal"}
              </span>
            </div>
          </div>
          <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
            {!isMobile&&<LiveClock/>}
            {!isMobile&&selectedSection&&<Badge color={selectedSection.color||C.blue}>{selectedSection.name}</Badge>}
            {!isMobile&&<SessionTermBadge/>}
            <DarkToggle compact={isMobile}/>
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
            {!isMobile&&role==="admin"&&(
              <button data-tour="settings-btn" onClick={()=>setPage("settings")}
                title="Settings"
                style={{background:C.offWhite,border:`1px solid ${C.border}`,
                  borderRadius:9,padding:"6px 12px",cursor:"pointer",
                  display:"flex",alignItems:"center",gap:6,fontWeight:700,fontSize:12,
                  color:C.blue,transition:"all .15s"}}
                onMouseEnter={e=>{e.currentTarget.style.background=C.bluePale;e.currentTarget.style.borderColor=C.blue+"40";}}
                onMouseLeave={e=>{e.currentTarget.style.background=C.offWhite;e.currentTarget.style.borderColor=C.border;}}>
                <Settings size={14} style={{flexShrink:0}}/>Settings
              </button>
            )}
            {isMobile&&role==="admin"&&(
              <button onClick={()=>setPage("settings")} title="Settings" data-header-compact="hide"
                style={{background:"none",border:`1px solid ${C.border}`,borderRadius:8,
                  width:36,height:36,cursor:"pointer",display:"flex",alignItems:"center",
                  justifyContent:"center",fontSize:16,color:C.muted}}>
                <Settings size={16}/>
              </button>
            )}
            <NotificationBell ctx={ctx}/>
            <button onClick={()=>setShowProfile(true)} data-header-compact="hide"
              style={{width:34,height:34,borderRadius:10,
                background:`linear-gradient(135deg,${C.blue},${C.blueDark})`,
                color:"#fff",fontSize:13,fontWeight:900,cursor:"pointer",
                display:"flex",alignItems:"center",justifyContent:"center",
                boxShadow:`0 2px 8px ${C.blue}40`}}
              title="My Profile">
              {(user.name||"?")[0].toUpperCase()}
            </button>
            {!isMobile&&<button onClick={()=>setShowLogout(true)}
              title="Sign Out"
              style={{background:"none",border:`1px solid ${C.border}`,cursor:"pointer",
                borderRadius:8,padding:"7px 9px",display:"flex",alignItems:"center",
                gap:5,fontSize:12,fontWeight:600,color:C.muted,transition:"all .15s",
                minWidth:36,minHeight:36,justifyContent:"center"}}
              onMouseEnter={e=>{e.currentTarget.style.background=C.redPale;e.currentTarget.style.borderColor=C.red+"50";e.currentTarget.style.color=C.red;}}
              onMouseLeave={e=>{e.currentTarget.style.background="none";e.currentTarget.style.borderColor=C.border;e.currentTarget.style.color=C.muted;}}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              {!isMobile&&<span>Sign Out</span>}
            </button>}
          </div>
        </header>

        <div style={{height:3,background:`linear-gradient(90deg,${C.orange} 0%,#374151 20%,${C.green} 55%,${C.blue} 85%,${C.blueDark} 100%)`,opacity:.85}}/>

        {/* Section selector bar */}
        {role==="admin"&&["students","teachers","classes","subjects","assignments","results","results-admin","fees","transcript","sections","report-cards","grading"].includes(page)&&(
          <SectionSelector/>
        )}

        <main style={{flex:1,padding:page==="jd-chat"?0:(isMobile?12:20),overflowY:"auto",background:page==="jd-chat"?"#f8f9fa":C.offWhite,transition:"background .2s"}}>
          {page==="jd-chat"       && <ChatHome user={user} organizationName={selectedSchool?.name||"Your organisation"}/>}
          {page==="jd-operations" && (role==="admin"||role==="manager" ? <JDOperationsPage ctx={ctx}/> : <AccessDenied/>)}
          {page==="sections"      && <SectionsPage ctx={ctx}/>}
          {page==="dashboard"     && <DashboardPage ctx={ctx}/>}
          {page==="members"       && <MembersPage ctx={ctx}/>}
          {page==="students"      && <StudentsPage ctx={ctx}/>}
          {page==="teachers"      && <TeachersPage ctx={ctx}/>}
          {page==="classes"       && <ClassesPage ctx={ctx}/>}
          {page==="subjects"      && <SubjectsPage ctx={ctx}/>}
          {page==="assignments"   && <AssignmentsPage ctx={ctx}/>}
          {page==="results"       && (canAccess("results")       ?<ResultsHubPage ctx={ctx}/>         :<AccessDenied/>)}
          {page==="results-admin" && <ResultsTeachPage ctx={ctx}/>}
          {page==="results-teach" && <ResultsTeachPage ctx={ctx}/>}
          {page==="my-results"    && (canAccess("my-results")   ?<MyResultsPage ctx={ctx}/>          :<AccessDenied/>)}
          {page==="my-classes"    && (canAccess("my-classes")   ?<MyClassesPage ctx={ctx}/>          :<AccessDenied/>)}
          {page==="add-students"  && (canAccess("add-students") ?<TeacherAddStudentsPage ctx={ctx}/>  :<AccessDenied/>)}
          {page==="my-profile"    && <MyProfilePage ctx={ctx}/>}
          {page==="approvals"     && (canAccess("approvals")    ?<StudentApprovalsPage ctx={ctx}/>    :<AccessDenied/>)}
          {page==="access-requests" && <AccessRequestsAdminPage ctx={ctx}/>}
          {page==="request-access"  && <TeacherAccessRequestPage ctx={ctx}/>}
          {page==="result-approvals" && (canAccess("result-approvals")?<ResultApprovalsPage ctx={ctx}/>:<AccessDenied/>)}
          {page==="academic-summary" && (canAccess("academic-summary")?<AcademicSummaryPage ctx={ctx}/>:<AccessDenied/>)}
          {page==="report-card-settings" && (canAccess("report-card-settings")?<ReportCardSettingsPage ctx={ctx}/>:<AccessDenied/>)}
          {page==="grading"       && (canAccess("grading")      ?<GradingPage ctx={ctx}/>            :<AccessDenied/>)}
          {page==="fees"          && (canAccess("fees")         ?<FeesPage ctx={ctx}/>               :<AccessDenied/>)}
          {page==="payments"      && (canAccess("payments")     ?<PaymentsPage ctx={ctx}/>           :<AccessDenied/>)}
          {page==="my-payments"   && (canAccess("my-payments")  ?<MyPaymentsPage ctx={ctx}/>         :<AccessDenied/>)}
          {page==="fee-items"     && (canAccess("fee-items")    ?<FeeItemsPage ctx={ctx}/>           :<AccessDenied/>)}
          {page==="fee-templates" && (canAccess("fee-templates")?<FeeTemplatesPage ctx={ctx}/>       :<AccessDenied/>)}
          {page==="fee-generate"  && (canAccess("fee-generate") ?<FeeGeneratePage ctx={ctx}/>        :<AccessDenied/>)}
          {page==="fee-tracker"   && (canAccess("fee-tracker")  ?<FeeTrackerPage ctx={ctx}/>         :<AccessDenied/>)}
          {page==="fee-stats"     && (canAccess("fee-stats")    ?<FeeStatsPage ctx={ctx}/>           :<AccessDenied/>)}
          {page==="my-bill"       && (canAccess("my-bill")      ?<MyBillPage ctx={ctx}/>             :<AccessDenied/>)}
          {page==="announce"      && (canAccess("announce")     ?<AnnouncePage ctx={ctx}/>           :<AccessDenied/>)}
          {page==="transcript"    && (canAccess("transcript")   ?<TranscriptPage ctx={ctx}/>         :<AccessDenied/>)}
          {page==="report-cards"  && (canAccess("report-cards") ?<ReportCardsPage ctx={ctx}/>        :<AccessDenied/>)}
          {page==="attendance"    && (canAccess("attendance")   ?<AttendancePage ctx={ctx}/>         :<AccessDenied/>)}
          {page==="mail-compose"  && (canAccess("mail-compose") ?<MailComposePage ctx={ctx}/>        :<AccessDenied/>)}
          {page==="mail-logs"     && (canAccess("mail-logs")    ?<MailLogsPage ctx={ctx}/>           :<AccessDenied/>)}
          {page==="admin-tools"   && <AdminToolsPage ctx={ctx}/>}
          {page==="notifications" && <NotificationsPage ctx={ctx}/>}
          {page==="permissions"   && <PermissionsPage ctx={ctx}/>}
          {page==="bulk-promote"  && (canAccess("bulk-promote") ?<BulkPromotionPage ctx={ctx}/>      :<AccessDenied/>)}
          {page==="recycle-bin"   && (canAccess("recycle-bin")  ?<RecycleBinPage ctx={ctx}/>         :<AccessDenied/>)}
          {page==="broadsheet"    && (canAccess("broadsheet")   ?<BroadsheetPage ctx={ctx}/>        :<AccessDenied/>)}
          {page==="calendar"      && (canAccess("calendar")     ?<AcademicCalendarPage ctx={ctx}/>  :<AccessDenied/>)}
          {page==="timetable"     && (canAccess("timetable")    ?<TimetablePage ctx={ctx}/>         :<AccessDenied/>)}
          {page==="export"        && (canAccess("export")       ?<DataExportPage ctx={ctx}/>        :<AccessDenied/>)}
          {page==="activity"      && (canAccess("activity")     ?<ActivityPage ctx={ctx}/>          :<AccessDenied/>)}
          {page==="audit-log"     && (canAccess("audit-log")    ?<AuditLogPage ctx={ctx}/>           :<AccessDenied/>)}
          {page==="settings"      && <SettingsPage ctx={{...ctx,notify}}/>}
          {page==="org-create"         && <OrgPresetSelectPage ctx={ctx}/>}
          {page==="org-create-details" && <OrgCreatePage ctx={ctx}/>}
          {page==="hiring"             && (canAccess("hiring") ? <HiringPage ctx={ctx}/> : <AccessDenied/>)}
        </main>
      </div>


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
        userId={user.staff_id||user.student_id||user.id}
        role={role}
        canAccess={canAccess}
        setPage={setPage}
        isMobile={isMobile}
        show={showTour}
        onClose={()=>{
          setShowTour(false);
          const uid=user.staff_id||user.student_id||user.id;
          try{ localStorage.setItem(`rgs_tour_done_${uid}`,"1"); }catch(e){}
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
        body{font-family:'Segoe UI',system-ui,-apple-system,sans-serif;}
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
        @keyframes tourPulse{0%,100%{box-shadow:0 0 0 4px rgba(232,86,10,.3)}50%{box-shadow:0 0 0 8px rgba(232,86,10,.15),0 0 0 4px rgba(232,86,10,.4)}}
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
          .rgs-card{padding:14px!important;}

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

// ─── SESSION/TERM BADGE ───────────────────────────────────────────────────────
function SessionTermBadge(){
  const [sess,setSess]=useState(null);
  const [term,setTerm]=useState(null);
  useEffect(()=>{
    db.getSessions().then(({data})=>{
      const s=data?.find(s=>s.is_active)||data?.[0];
      setSess(s);
      if(s) db.getTerms(s.id).then(({data:td})=>{
        setTerm(td?.find(t=>t.is_active)||td?.[0]);
      });
    });
  },[]);
  return <>
    {sess&&<Badge color={C.green}>{sess.name}</Badge>}
    {term&&<Badge color={C.orange}>{term.name}</Badge>}
  </>;
}

// ─── SCHOOL SELECT PAGE ───────────────────────────────────────────────────────
function SchoolSelectPage({onSelect,onPlatformAdmin}){
  const {dark}=useDark();
  C = dark ? DARK : LIGHT;
  const [schools,setSchools]=useState([]);
  const [loading,setLoading]=useState(true);
  const [showSignup,setShowSignup]=useState(false);
  const [showPALogin,setShowPALogin]=useState(false);
  const [paPin,setPaPin]=useState("");
  const [paErr,setPaErr]=useState("");
  const [paLoading,setPaLoading]=useState(false);
  useEffect(()=>{
    db.getSchools().then(({data})=>{ setSchools((data||[]).filter(s=>s.status!=="suspended")); setLoading(false); });
  },[]);
  const doPALogin=async()=>{
    if(!paPin){setPaErr("PIN required.");return;}
    setPaLoading(true); setPaErr("");
    const err=await onPlatformAdmin(paPin);
    setPaLoading(false);
    if(err) setPaErr(err);
  };
  const onSignupSuccess=(newSchool)=>{ setShowSignup(false); onSelect(newSchool); };
  return(
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",
      justifyContent:"center",padding:"24px 16px",position:"relative",overflow:"hidden",
      background:dark?`linear-gradient(135deg,#030712 0%,#0d1f3c 50%,#050e1a 100%)`
        :`linear-gradient(135deg,#0b2257 0%,#111827 60%,#0d4a8a 100%)`}}>
      {/* Background decorations */}
      <div style={{position:"fixed",top:-100,right:-100,width:400,height:400,borderRadius:"50%",
        background:"rgba(255,255,255,.03)",pointerEvents:"none"}}/>
      <div style={{position:"fixed",bottom:-80,left:-80,width:300,height:300,borderRadius:"50%",
        background:"rgba(232,86,10,.06)",pointerEvents:"none"}}/>
      <div style={{position:"fixed",top:"40%",left:"15%",width:150,height:150,borderRadius:"50%",
        background:"rgba(26,79,160,.15)",pointerEvents:"none"}}/>

      {/* Header */}
      <div style={{textAlign:"center",marginBottom:36,position:"relative",zIndex:1}}>
        <div style={{display:"inline-flex",alignItems:"center",gap:10,marginBottom:12,
          background:"rgba(255,255,255,.08)",backdropFilter:"blur(12px)",
          border:"1px solid rgba(255,255,255,.12)",borderRadius:50,padding:"8px 20px"}}>
          <div style={{width:8,height:8,borderRadius:"50%",background:"#4ade80",
            boxShadow:"0 0 8px #4ade80"}}/>
          <span style={{color:"rgba(255,255,255,.75)",fontSize:12,fontWeight:600,letterSpacing:.5}}>
            School & Staff Portal
          </span>
        </div>
        <div style={{color:"rgba(255,255,255,.9)",fontSize:28,fontWeight:900,letterSpacing:"-.02em",
          lineHeight:1.2}}>Select Your School</div>
        <div style={{color:"rgba(255,255,255,.45)",fontSize:13,marginTop:6}}>
          Choose your school to continue
        </div>
      </div>

      {loading
        ? <div style={{display:"flex",alignItems:"center",gap:10,color:"rgba(255,255,255,.5)",fontSize:13,
            background:"rgba(255,255,255,.07)",padding:"14px 24px",borderRadius:12,
            border:"1px solid rgba(255,255,255,.1)"}}>
            <div style={{width:16,height:16,border:"2px solid rgba(255,255,255,.3)",
              borderTop:"2px solid rgba(255,255,255,.8)",borderRadius:"50%",
              animation:"spin .7s linear infinite"}}/>
            Loading businesses…
          </div>
        : <div style={{display:"flex",flexDirection:"column",gap:10,width:"100%",maxWidth:440,position:"relative",zIndex:1}}>
            {schools.map(s=>(
              <button key={s.id} onClick={()=>onSelect(s)}
                style={{background:"rgba(255,255,255,.09)",
                  border:"1px solid rgba(255,255,255,.15)",borderRadius:18,padding:"16px 20px",
                  cursor:"pointer",textAlign:"left",transition:"all .18s cubic-bezier(.4,0,.2,1)",
                  display:"flex",alignItems:"center",gap:14,backdropFilter:"blur(12px)"}}
                onMouseEnter={e=>{
                  e.currentTarget.style.background="rgba(255,255,255,.16)";
                  e.currentTarget.style.borderColor="rgba(255,255,255,.35)";
                  e.currentTarget.style.transform="translateY(-1px)";
                  e.currentTarget.style.boxShadow="0 8px 24px rgba(0,0,0,.2)";
                }}
                onMouseLeave={e=>{
                  e.currentTarget.style.background="rgba(255,255,255,.09)";
                  e.currentTarget.style.borderColor="rgba(255,255,255,.15)";
                  e.currentTarget.style.transform="none";
                  e.currentTarget.style.boxShadow="none";
                }}>
                {s.logo
                  ? <img src={s.logo} alt="" style={{width:46,height:46,borderRadius:12,objectFit:"contain",
                      background:"rgba(255,255,255,.9)",padding:3,flexShrink:0,
                      boxShadow:"0 2px 8px rgba(0,0,0,.2)"}}/>
                  : <div style={{width:46,height:46,borderRadius:12,
                      background:"linear-gradient(135deg,rgba(255,255,255,.2),rgba(255,255,255,.1))",
                      border:"1px solid rgba(255,255,255,.2)",
                      display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                      <School size={22} color="#fff"/>
                    </div>
                }
                <div style={{flex:1,minWidth:0}}>
                  <div style={{color:"#fff",fontWeight:800,fontSize:14,letterSpacing:"-.01em"}}>{s.name}</div>
                  {s.address&&<div style={{color:"rgba(255,255,255,.45)",fontSize:11.5,marginTop:2,
                    overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.address}</div>}
                </div>
                <div style={{width:28,height:28,borderRadius:"50%",background:"rgba(255,255,255,.1)",
                  display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <ChevronRight size={14} color="rgba(255,255,255,.6)"/>
                </div>
              </button>
            ))}

            {/* Register new business */}
            <button onClick={()=>setShowSignup(true)}
              style={{background:"rgba(232,86,10,.12)",border:"1.5px dashed rgba(232,86,10,.45)",
                borderRadius:18,padding:"14px 20px",cursor:"pointer",textAlign:"center",
                color:"rgba(255,200,150,.9)",fontSize:13,fontWeight:700,
                display:"flex",alignItems:"center",justifyContent:"center",gap:8,
                transition:"all .15s",marginTop:4}}
              onMouseEnter={e=>{e.currentTarget.style.background="rgba(232,86,10,.22)";e.currentTarget.style.borderColor="rgba(232,86,10,.7)";}}
              onMouseLeave={e=>{e.currentTarget.style.background="rgba(232,86,10,.12)";e.currentTarget.style.borderColor="rgba(232,86,10,.45)";}}>
              <Plus size={15}/> Register a School
            </button>
          </div>
      }

      {/* Platform admin link */}
      <button onClick={()=>setShowPALogin(true)}
        style={{marginTop:28,background:"none",border:"1px solid rgba(255,255,255,.1)",
          borderRadius:8,color:"rgba(255,255,255,.3)",padding:"6px 16px",
          fontSize:11,cursor:"pointer",fontWeight:500,transition:"all .15s",zIndex:1,position:"relative"}}
        onMouseEnter={e=>{e.currentTarget.style.color="rgba(255,255,255,.55)";e.currentTarget.style.borderColor="rgba(255,255,255,.2)";}}
        onMouseLeave={e=>{e.currentTarget.style.color="rgba(255,255,255,.3)";e.currentTarget.style.borderColor="rgba(255,255,255,.1)";}}>
        Platform Admin Login
      </button>

      {showSignup&&<OrgSignupModal onClose={()=>setShowSignup(false)} onSuccess={onSignupSuccess}/>}

      {/* Platform admin login modal */}
      {showPALogin&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.75)",display:"flex",
          alignItems:"center",justifyContent:"center",zIndex:9000,padding:16}}>
          <div style={{background:"#0d1f3c",border:"1.5px solid rgba(255,255,255,.12)",borderRadius:20,
            width:"100%",maxWidth:380,padding:32,boxShadow:"0 32px 80px rgba(0,0,0,.6)"}}>
            <div style={{textAlign:"center",marginBottom:24}}>
              <div style={{fontSize:16,fontWeight:900,color:"#fff"}}>Platform Admin Login</div>
              <div style={{fontSize:12,color:"rgba(255,255,255,.4)",marginTop:4}}>Apex Super-Admin Console</div>
            </div>
            {paErr&&<div style={{background:"rgba(220,38,38,.15)",border:"1px solid rgba(220,38,38,.4)",
              color:"#fca5a5",padding:"10px 14px",borderRadius:8,fontSize:12,marginBottom:16}}>{paErr}</div>}
            <div style={{marginBottom:8,fontSize:12,color:"rgba(255,255,255,.5)",textAlign:"center"}}>Enter your admin PIN</div>
            <div style={{marginBottom:16}}>
              <input type="password" inputMode="numeric" value={paPin} onChange={e=>setPaPin(e.target.value)}
                placeholder="••••••••" onKeyDown={e=>e.key==="Enter"&&doPALogin()}
                style={{width:"100%",padding:"13px 14px",borderRadius:10,border:"1.5px solid rgba(255,255,255,.15)",
                  background:"rgba(255,255,255,.07)",color:"#fff",fontSize:20,outline:"none",
                  boxSizing:"border-box",textAlign:"center",letterSpacing:6}}/>
            </div>
            <button onClick={doPALogin} disabled={paLoading}
              style={{width:"100%",background:paLoading?"rgba(255,255,255,.1)":"linear-gradient(135deg,#111827,#0c4a7a)",
                color:"#fff",border:"none",padding:"12px",borderRadius:11,fontSize:14,fontWeight:800,
                cursor:paLoading?"not-allowed":"pointer",marginBottom:12}}>
              {paLoading?"Signing in…":"Sign In →"}
            </button>
            <button onClick={()=>{setShowPALogin(false);setPaErr("");setPaPin("");}}
              style={{width:"100%",background:"none",border:"1.5px solid rgba(255,255,255,.12)",
                color:"rgba(255,255,255,.5)",padding:"10px",borderRadius:11,fontSize:13,cursor:"pointer"}}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}



// ─── COPY SCHOOL SETTINGS MODAL ──────────────────────────────────────────────
function CopySettingsModal({schools, onClose}){
  const {dark}=useDark(); C=dark?DARK:LIGHT;
  const [srcId,setSrcId]=useState("");
  const [dstId,setDstId]=useState("");
  const [items,setItems]=useState({
    sections:true, section_subjects:true, classes:true,
    sessions:true, terms:true, grading:true,
    fee_items:true, fee_templates:true,
    cae_traits:true, cae_ratings:true,
    school_settings:false,
  });
  const [log,setLog]=useState([]); // progress messages
  const [running,setRunning]=useState(false);
  const [done,setDone]=useState(false);
  const toggle=k=>setItems(p=>({...p,[k]:!p[k]}));
  const addLog=(msg,ok=true)=>setLog(p=>[...p,{msg,ok,t:Date.now()}]);

  const ITEM_LABELS=[
    {k:"sections",        label:"Sections"},
    {k:"section_subjects",label:"Section Categories"},
    {k:"classes",         label:"Groups"},
    {k:"sessions",        label:"Cycles"},
    {k:"terms",           label:"Periods (requires Cycles)"},
    {k:"grading",         label:"Grading Schema"},
    {k:"fee_items",       label:"Billing Items"},
    {k:"fee_templates",   label:"Billing Templates & Items"},
    {k:"cae_traits",      label:"CAE Traits"},
    {k:"cae_ratings",     label:"CAE Ratings"},
    {k:"school_settings", label:"Organization Settings (key-value store)"},
  ];

  const run=async()=>{
    if(!srcId||!dstId){addLog("Select both source and target organizations.","error");return;}
    if(srcId===dstId){addLog("Source and target must be different organizations.","error");return;}
    setRunning(true); setLog([]); setDone(false);
    const {error:copyErr,log:copyLog}=await db.copySchoolSettings(srcId,dstId,items);
    copyLog.forEach(({msg,ok})=>addLog(msg,ok));
    if(copyErr) addLog("Copy finished with errors. Check log above.","error");
    else addLog("✓ Copy completed successfully!",true);
    setRunning(false); setDone(true);
  };

  const src=schools.find(s=>s.id===srcId);
  const dst=schools.find(s=>s.id===dstId);

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.7)",display:"flex",
      alignItems:"center",justifyContent:"center",zIndex:9000,padding:16}}>
      <div style={{background:C.white,borderRadius:20,width:"100%",maxWidth:560,maxHeight:"92vh",
        display:"flex",flexDirection:"column",boxShadow:"0 32px 80px rgba(0,0,0,.45)"}}>

        {/* Header */}
        <div style={{background:`linear-gradient(135deg,${C.blueDark},${C.blue})`,borderRadius:"20px 20px 0 0",
          padding:"18px 24px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
          <div>
            <div style={{color:"#fff",fontWeight:900,fontSize:16}}>Copy Organization Settings</div>
            <div style={{color:"rgba(255,255,255,.55)",fontSize:12,marginTop:2}}>
              Clone configuration from one organization to another
            </div>
          </div>
          <button onClick={onClose} style={{background:"rgba(255,255,255,.15)",border:"none",
            color:"#fff",width:30,height:30,borderRadius:"50%",cursor:"pointer",
            display:"flex",alignItems:"center",justifyContent:"center"}}>
            <X size={15}/>
          </button>
        </div>

        <div style={{padding:24,overflowY:"auto",flex:1}}>

          {/* Organization pickers */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:20}}>
            <div>
              <label style={{display:"block",fontSize:11,fontWeight:700,color:C.muted,
                textTransform:"uppercase",letterSpacing:.7,marginBottom:6}}>Copy FROM</label>
              <select value={srcId} onChange={e=>{setSrcId(e.target.value);setLog([]);setDone(false);}}
                style={{width:"100%",padding:"10px 12px",border:`1.5px solid ${srcId?C.blue:C.border}`,
                  borderRadius:9,fontSize:13,background:C.white,color:C.text,outline:"none",
                  boxSizing:"border-box",cursor:"pointer"}}>
                <option value="">— Select source —</option>
                {schools.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              {src&&<div style={{fontSize:11,color:C.muted,marginTop:4}}>{src.student_count||0} members</div>}
            </div>
            <div>
              <label style={{display:"block",fontSize:11,fontWeight:700,color:C.muted,
                textTransform:"uppercase",letterSpacing:.7,marginBottom:6}}>Copy TO</label>
              <select value={dstId} onChange={e=>{setDstId(e.target.value);setLog([]);setDone(false);}}
                style={{width:"100%",padding:"10px 12px",border:`1.5px solid ${dstId?C.orange:C.border}`,
                  borderRadius:9,fontSize:13,background:C.white,color:C.text,outline:"none",
                  boxSizing:"border-box",cursor:"pointer"}}>
                <option value="">— Select target —</option>
                {schools.filter(s=>s.id!==srcId).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              {dst&&<div style={{fontSize:11,color:C.amber,marginTop:4}}>⚠ Existing matching records will be skipped</div>}
            </div>
          </div>

          {/* What to copy */}
          <div style={{marginBottom:20}}>
            <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",
              letterSpacing:.7,marginBottom:10}}>What to copy</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
              {ITEM_LABELS.map(({k,label})=>(
                <label key={k} style={{display:"flex",alignItems:"center",gap:8,
                  padding:"8px 12px",borderRadius:8,cursor:"pointer",
                  background:items[k]?C.bluePale:C.offWhite,
                  border:`1px solid ${items[k]?C.blue+"40":C.border}`,transition:"all .15s"}}>
                  <input type="checkbox" checked={items[k]} onChange={()=>toggle(k)}
                    style={{accentColor:C.blue,width:14,height:14,flexShrink:0}}/>
                  <span style={{fontSize:12,fontWeight:items[k]?700:400,
                    color:items[k]?C.blue:C.muted}}>{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Warning */}
          {dstId&&(
            <div style={{background:C.amberPale,border:`1px solid ${C.amber}30`,borderRadius:8,
              padding:"10px 14px",fontSize:12,color:C.amber,marginBottom:16,display:"flex",gap:8}}>
              <AlertTriangle size={14} style={{flexShrink:0,marginTop:1}}/>
              <span>This operation <strong>adds</strong> data to the target organization. It does not delete or overwrite existing records.</span>
            </div>
          )}

          {/* Progress log */}
          {log.length>0&&(
            <div style={{background:C.offWhite,border:`1px solid ${C.border}`,borderRadius:10,
              padding:14,maxHeight:180,overflowY:"auto",marginBottom:16,fontFamily:"monospace"}}>
              {log.map((l,i)=>(
                <div key={i} style={{fontSize:11.5,color:l.ok?C.green:C.red,
                  marginBottom:3,display:"flex",alignItems:"flex-start",gap:6}}>
                  <span style={{flexShrink:0}}>{l.ok?"✓":"✗"}</span>
                  <span>{l.msg}</span>
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div style={{display:"flex",gap:10}}>
            {!done?(
              <button onClick={run} disabled={running||!srcId||!dstId}
                style={{flex:1,background:running||!srcId||!dstId?"#CBD5E1":
                  `linear-gradient(135deg,${C.blue},${C.blueDark})`,
                  color:"#fff",border:"none",padding:"12px",borderRadius:10,
                  fontSize:14,fontWeight:800,cursor:running||!srcId||!dstId?"not-allowed":"pointer",
                  display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                {running&&<div style={{width:14,height:14,border:"2px solid rgba(255,255,255,.4)",
                  borderTop:"2px solid #fff",borderRadius:"50%",animation:"spin .7s linear infinite"}}/>}
                {running?"Copying…":"Start Copy →"}
              </button>
            ):(
              <button onClick={()=>{setLog([]);setDone(false);setSrcId("");setDstId("");}}
                style={{flex:1,background:C.greenPale,border:`1px solid ${C.green}40`,
                  color:C.green,padding:"12px",borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer"}}>
                Copy Again
              </button>
            )}
            <button onClick={onClose}
              style={{background:C.offWhite,border:`1px solid ${C.border}`,color:C.muted,
                padding:"12px 20px",borderRadius:10,fontSize:13,fontWeight:600,cursor:"pointer"}}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── DELETE SCHOOL MODAL ─────────────────────────────────────────────────────
function DeleteSchoolModal({school,onClose,onDeleted}){
  const [confirm,setConfirm]=useState("");
  const [busy,setBusy]=useState(false);
  const [err,setErr]=useState("");
  const doDelete=async()=>{
    if(confirm!==school.name){setErr("Organization name does not match.");return;}
    setBusy(true);
    const {error}=await db.deleteSchool(school.id);
    setBusy(false);
    if(error){setErr(error.message||"Delete failed.");return;}
    await db.logPlatformAction("DELETE_SCHOOL","school",school.id,school.name,"Permanently deleted by platform admin");
    onDeleted(school.id);
  };
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.7)",display:"flex",
      alignItems:"center",justifyContent:"center",zIndex:9100,padding:16}}>
      <div style={{background:"#fff",borderRadius:20,width:"100%",maxWidth:420,padding:32,
        boxShadow:"0 32px 80px rgba(0,0,0,.4)"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
          <div style={{width:40,height:40,borderRadius:12,background:"rgba(220,38,38,.1)",
            display:"flex",alignItems:"center",justifyContent:"center"}}>
            <Trash2 size={20} color="#dc2626"/>
          </div>
          <div>
            <div style={{fontWeight:800,fontSize:15,color:"#111"}}>Delete Organization</div>
            <div style={{fontSize:12,color:"#6b7280"}}>This action is permanent and cannot be undone</div>
          </div>
        </div>
        <div style={{background:"rgba(220,38,38,.06)",border:"1.5px solid rgba(220,38,38,.18)",
          borderRadius:10,padding:"12px 14px",marginBottom:18,fontSize:12,color:"#7f1d1d"}}>
          <strong>All data for "{school.name}" will be permanently deleted</strong> — members, staff, results, billing, settings, and all records.
        </div>
        <div style={{marginBottom:8,fontSize:12,color:"#374151"}}>
          Type <strong>{school.name}</strong> to confirm:
        </div>
        <input value={confirm} onChange={e=>{setConfirm(e.target.value);setErr("");}}
          placeholder={school.name}
          style={{width:"100%",padding:"10px 12px",border:`1.5px solid ${err?"#dc2626":"#d1d5db"}`,borderRadius:9,
            fontSize:13,outline:"none",boxSizing:"border-box",marginBottom:8}}/>
        {err&&<div style={{color:"#dc2626",fontSize:12,marginBottom:8}}>{err}</div>}
        <div style={{display:"flex",gap:10,marginTop:8}}>
          <button onClick={onClose} style={{flex:1,background:"#f3f4f6",border:"none",borderRadius:10,
            padding:"11px",fontSize:13,fontWeight:600,cursor:"pointer",color:"#374151"}}>
            Cancel
          </button>
          <button onClick={doDelete} disabled={busy||confirm!==school.name}
            style={{flex:1,background:confirm===school.name?"#dc2626":"rgba(220,38,38,.3)",border:"none",
              borderRadius:10,padding:"11px",fontSize:13,fontWeight:700,cursor:confirm===school.name?"pointer":"not-allowed",
              color:"#fff"}}>
            {busy?"Deleting…":"Delete Forever"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── CHANGE PIN MODAL ────────────────────────────────────────────────────────
function ChangePinModal({onClose,onSuccess}){
  const [cur,setCur]=useState("");
  const [next,setNext]=useState("");
  const [confirm,setConfirm]=useState("");
  const [err,setErr]=useState("");
  const [busy,setBusy]=useState(false);

  const save=async()=>{
    setErr("");
    if(!cur||!next||!confirm){setErr("All fields are required.");return;}
    if(next!==confirm){setErr("New PINs do not match.");return;}
    if(next.length<4){setErr("PIN must be at least 4 characters.");return;}
    setBusy(true);
    const {admin,error}=await db.getPlatformAdmin();
    if(error||!admin){setErr("Could not load admin record.");setBusy(false);return;}
    if(admin.password_hash!==cur){setErr("Current PIN is incorrect.");setBusy(false);return;}
    const {error:upErr}=await db.updatePlatformAdminPin(admin.id,next);
    setBusy(false);
    if(upErr){setErr("Failed to save new PIN.");return;}
    onSuccess("PIN updated successfully.");
  };

  const inputStyle={width:"100%",padding:"11px 14px",borderRadius:10,border:"1.5px solid rgba(255,255,255,.15)",
    background:"rgba(255,255,255,.07)",color:"#fff",fontSize:16,outline:"none",
    boxSizing:"border-box",textAlign:"center",letterSpacing:4};

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.75)",display:"flex",
      alignItems:"center",justifyContent:"center",zIndex:9100,padding:16}}>
      <div style={{background:"#0d1f3c",border:"1.5px solid rgba(255,255,255,.12)",borderRadius:20,
        width:"100%",maxWidth:360,padding:32,boxShadow:"0 32px 80px rgba(0,0,0,.6)"}}>
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{fontSize:15,fontWeight:900,color:"#fff"}}>Change Admin PIN</div>
          <div style={{fontSize:12,color:"rgba(255,255,255,.4)",marginTop:4}}>Enter your current PIN then choose a new one</div>
        </div>
        {err&&<div style={{background:"rgba(220,38,38,.15)",border:"1px solid rgba(220,38,38,.4)",
          color:"#fca5a5",padding:"10px 14px",borderRadius:8,fontSize:12,marginBottom:16}}>{err}</div>}
        <div style={{fontSize:11,color:"rgba(255,255,255,.4)",marginBottom:4}}>Current PIN</div>
        <input type="password" value={cur} onChange={e=>setCur(e.target.value)} placeholder="••••••••"
          style={{...inputStyle,marginBottom:14}}/>
        <div style={{fontSize:11,color:"rgba(255,255,255,.4)",marginBottom:4}}>New PIN</div>
        <input type="password" value={next} onChange={e=>setNext(e.target.value)} placeholder="••••••••"
          style={{...inputStyle,marginBottom:14}}/>
        <div style={{fontSize:11,color:"rgba(255,255,255,.4)",marginBottom:4}}>Confirm New PIN</div>
        <input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="••••••••"
          onKeyDown={e=>e.key==="Enter"&&save()}
          style={{...inputStyle,marginBottom:20}}/>
        <button onClick={save} disabled={busy}
          style={{width:"100%",background:busy?"rgba(255,255,255,.1)":"linear-gradient(135deg,#111827,#0c4a7a)",
            color:"#fff",border:"none",padding:"12px",borderRadius:11,fontSize:14,fontWeight:800,
            cursor:busy?"not-allowed":"pointer",marginBottom:10}}>
          {busy?"Saving…":"Save New PIN"}
        </button>
        <button onClick={onClose}
          style={{width:"100%",background:"none",border:"1.5px solid rgba(255,255,255,.12)",
            color:"rgba(255,255,255,.5)",padding:"10px",borderRadius:11,fontSize:13,cursor:"pointer"}}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── PLATFORM DASHBOARD ───────────────────────────────────────────────────────
const PLANS=["free","starter","pro","enterprise"];
const PLAN_COLORS={free:{bg:"rgba(107,114,128,.12)",color:"#6b7280"},starter:{bg:"rgba(59,130,246,.12)",color:"#3b82f6"},pro:{bg:"rgba(139,92,246,.12)",color:"#7c3aed"},enterprise:{bg:"rgba(245,158,11,.14)",color:"#d97706"}};
function planStyle(p){const c=PLAN_COLORS[p]||PLAN_COLORS.free;return{display:"inline-block",padding:"2px 9px",borderRadius:20,fontSize:10,fontWeight:800,textTransform:"uppercase",letterSpacing:.7,background:c.bg,color:c.color};}

function PlatformDashboardPage({admin,onLogout}){
  const {dark}=useDark();
  C=dark?DARK:LIGHT;
  const [schools,setSchools]=useState([]);
  const [loading,setLoading]=useState(true);
  const [busyId,setBusyId]=useState(null);
  const [manageSchool,setManageSchool]=useState(null);
  const [deleteSchool,setDeleteSchool]=useState(null);
  const [showCopy,setShowCopy]=useState(false);
  const [showChangePin,setShowChangePin]=useState(false);
  const [showAddSchool,setShowAddSchool]=useState(false);
  const [tab,setTab]=useState("schools");
  const [auditLog,setAuditLog]=useState([]);
  const [auditLoading,setAuditLoading]=useState(false);
  const [auditFilter,setAuditFilter]=useState("");
  const [notify_,setNotify_]=useState(null);

  const showMsg=(msg,type="success")=>{ setNotify_({msg,type}); setTimeout(()=>setNotify_(null),3500); };

  const load=()=>{
    setLoading(true);
    db.getAllSchools().then(({data})=>{ setSchools(data||[]); setLoading(false); });
  };
  useEffect(()=>{ load(); },[]);

  const loadAudit=()=>{
    setAuditLoading(true);
    db.getAllPlatformAuditLog().then(({data})=>{ setAuditLog(data||[]); setAuditLoading(false); });
  };
  useEffect(()=>{ if(tab==="audit") loadAudit(); },[tab]);

  const toggleStatus=async(school)=>{
    const newStatus=school.status==="active"?"suspended":"active";
    setBusyId(school.id);
    const {error}=await db.updateSchoolStatus(school.id,newStatus);
    if(!error){ await db.logPlatformAction(newStatus==="active"?"ACTIVATE_SCHOOL":"SUSPEND_SCHOOL","school",school.id,school.name,null); }
    setBusyId(null);
    if(error){showMsg("Failed to update status","error");return;}
    setSchools(sc=>sc.map(s=>s.id===school.id?{...s,status:newStatus}:s));
    showMsg(`${school.name} ${newStatus==="active"?"activated":"suspended"}.`);
  };

  const changePlan=async(school,plan)=>{
    const {error}=await db.updateSchoolPlan(school.id,plan);
    if(error){showMsg("Failed to update plan","error");return;}
    await db.logPlatformAction("CHANGE_PLAN","school",school.id,school.name,`Plan → ${plan}`);
    setSchools(sc=>sc.map(s=>s.id===school.id?{...s,plan}:s));
    showMsg(`${school.name} plan set to ${plan}.`);
  };

  const totalStudents=schools.reduce((a,s)=>a+(s.student_count||0),0);
  const activeCount=schools.filter(s=>s.status==="active").length;
  const setupCount=schools.filter(s=>s.setup_done).length;

  const cardStyle={background:C.white,borderRadius:16,padding:"20px 24px",border:`1px solid ${C.border}`,flex:1,minWidth:130};
  const statLabel={fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.7,marginBottom:6};
  const statVal={fontSize:28,fontWeight:900,color:C.text};
  const tabBtn=(id,label,icon)=>(
    <button onClick={()=>setTab(id)} style={{display:"flex",alignItems:"center",gap:6,padding:"8px 16px",
      borderRadius:9,border:"none",cursor:"pointer",fontSize:13,fontWeight:tab===id?700:500,
      background:tab===id?(dark?"#1e3a5f":C.blue):"transparent",
      color:tab===id?"#fff":C.muted,transition:"all .15s"}}>
      {icon}{label}
    </button>
  );

  const filteredAudit=auditFilter
    ? auditLog.filter(a=>a.entity_name?.toLowerCase().includes(auditFilter.toLowerCase())||a.action?.toLowerCase().includes(auditFilter.toLowerCase())||a.notes?.toLowerCase().includes(auditFilter.toLowerCase()))
    : auditLog;

  const schoolNameMap={};
  schools.forEach(s=>{schoolNameMap[s.id]=s.name;});

  return(
    <div style={{minHeight:"100vh",background:C.offWhite}}>
      {/* Header */}
      <div style={{background:dark?"#0d1f3c":"#111827",padding:"0 24px",
        display:"flex",alignItems:"center",justifyContent:"space-between",height:60,
        boxShadow:"0 2px 12px rgba(0,0,0,.18)"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <img src="/jd-logo.svg" alt="JAMES-DENNING"
            style={{height:36,width:"auto",filter:"drop-shadow(0 2px 8px rgba(0,180,255,.4))"}}/>
          <div style={{color:"rgba(255,255,255,.5)",fontSize:10}}>Super-Admin Console</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          <button onClick={()=>setShowAddSchool(true)}
            style={{background:"rgba(255,255,255,.15)",border:"1.5px solid rgba(255,255,255,.25)",
              color:"#fff",padding:"6px 14px",borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer",
              display:"flex",alignItems:"center",gap:6}}>
            <Plus size={13}/> Add Organization
          </button>
          <button onClick={()=>setShowCopy(true)}
            style={{background:"rgba(255,255,255,.08)",border:"1.5px solid rgba(255,255,255,.15)",
              color:"rgba(255,255,255,.8)",padding:"6px 14px",borderRadius:8,fontSize:12,fontWeight:600,cursor:"pointer",
              display:"flex",alignItems:"center",gap:6}}>
            <Copy size={13}/> Copy Settings
          </button>
          <button onClick={()=>setShowChangePin(true)}
            style={{background:"rgba(255,255,255,.08)",border:"1.5px solid rgba(255,255,255,.15)",
              color:"rgba(255,255,255,.8)",padding:"6px 14px",borderRadius:8,fontSize:12,fontWeight:600,cursor:"pointer",
              display:"flex",alignItems:"center",gap:6}}>
            <KeyRound size={13}/> PIN
          </button>
          <button onClick={onLogout}
            style={{background:"rgba(220,38,38,.15)",border:"1.5px solid rgba(220,38,38,.3)",
              color:"#fca5a5",padding:"6px 14px",borderRadius:8,fontSize:12,fontWeight:600,cursor:"pointer",
              display:"flex",alignItems:"center",gap:6}}>
            <LogOut size={13}/> Logout
          </button>
        </div>
      </div>

      {/* Local toast */}
      {notify_&&(
        <div style={{position:"fixed",top:16,right:16,zIndex:9999,
          background:notify_.type==="error"?"#dc2626":"#16a34a",color:"#fff",
          padding:"10px 18px",borderRadius:10,fontSize:13,fontWeight:600,
          boxShadow:"0 4px 16px rgba(0,0,0,.25)"}}>
          {notify_.msg}
        </div>
      )}

      <div style={{maxWidth:1200,margin:"0 auto",padding:"28px 20px"}}>
        {/* Stats row */}
        <div style={{display:"flex",gap:14,marginBottom:24,flexWrap:"wrap"}}>
          <div style={cardStyle}>
            <div style={statLabel}>Total Organizations</div>
            <div style={statVal}>{schools.length}</div>
          </div>
          <div style={cardStyle}>
            <div style={statLabel}>Active</div>
            <div style={{...statVal,color:"#16a34a"}}>{activeCount}</div>
          </div>
          <div style={cardStyle}>
            <div style={statLabel}>Suspended</div>
            <div style={{...statVal,color:C.red}}>{schools.length-activeCount}</div>
          </div>
          <div style={cardStyle}>
            <div style={statLabel}>Setup Complete</div>
            <div style={{...statVal,color:C.blue}}>{setupCount}</div>
          </div>
          <div style={cardStyle}>
            <div style={statLabel}>Total Members</div>
            <div style={statVal}>{totalStudents.toLocaleString()}</div>
          </div>
        </div>

        {/* Tab nav */}
        <div style={{display:"flex",gap:4,marginBottom:20,background:C.white,
          borderRadius:12,padding:4,border:`1px solid ${C.border}`,width:"fit-content"}}>
          {tabBtn("schools","Organizations",<School size={13}/>)}
          {tabBtn("audit","Audit Log",<History size={13}/>)}
          {tabBtn("platform","Platform Settings",<Settings2 size={13}/>)}
        </div>

        {/* ── SCHOOLS TAB ── */}
        {tab==="schools"&&(
          <div style={{background:C.white,borderRadius:18,border:`1px solid ${C.border}`,overflow:"hidden"}}>
            <div style={{padding:"16px 22px",borderBottom:`1px solid ${C.border}`,
              display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{fontSize:15,fontWeight:800,color:C.text}}>All Organizations</div>
              <button onClick={load} style={{background:C.offWhite,border:`1px solid ${C.border}`,
                borderRadius:8,padding:"6px 12px",fontSize:12,fontWeight:600,color:C.muted,cursor:"pointer",
                display:"flex",alignItems:"center",gap:5}}>
                <RefreshCw size={12}/>Refresh
              </button>
            </div>
            {loading
              ? <div style={{padding:40,textAlign:"center",color:C.muted,fontSize:13}}>Loading…</div>
              : <div style={{overflowX:"auto"}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                    <thead>
                      <tr style={{background:C.offWhite}}>
                        {["Organization","Admin","Members","Plan","Status","Setup","Created","Actions"].map(h=>(
                          <th key={h} style={{padding:"10px 14px",textAlign:"left",fontWeight:700,
                            color:C.muted,fontSize:11,textTransform:"uppercase",letterSpacing:.6,
                            borderBottom:`1px solid ${C.border}`,whiteSpace:"nowrap"}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {schools.map((s,i)=>(
                        <tr key={s.id} style={{borderBottom:`1px solid ${C.border}`,
                          background:i%2===0?C.white:C.offWhite}}>
                          <td style={{padding:"12px 14px"}}>
                            <div style={{fontWeight:700,color:C.text,whiteSpace:"nowrap"}}>{s.name}</div>
                            <div style={{color:C.muted,fontSize:11,marginTop:2}}>{s.student_id_prefix}{s.state?` · ${s.state}`:""}</div>
                          </td>
                          <td style={{padding:"12px 14px"}}>
                            <div style={{color:C.text,fontSize:12,whiteSpace:"nowrap"}}>{s.admin_name||"—"}</div>
                            <div style={{color:C.muted,fontSize:11}}>{s.admin_email||"—"}</div>
                          </td>
                          <td style={{padding:"12px 14px",fontWeight:700,color:C.text,textAlign:"center"}}>{(s.student_count||0).toLocaleString()}</td>
                          <td style={{padding:"12px 14px"}}>
                            <select value={s.plan||"free"} onChange={e=>changePlan(s,e.target.value)}
                              style={{border:`1px solid ${C.border}`,borderRadius:7,padding:"3px 6px",
                                fontSize:11,fontWeight:700,background:C.white,color:C.text,cursor:"pointer"}}>
                              {PLANS.map(p=><option key={p} value={p}>{p.charAt(0).toUpperCase()+p.slice(1)}</option>)}
                            </select>
                          </td>
                          <td style={{padding:"12px 14px"}}>
                            <span style={{display:"inline-block",padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,
                              background:s.status==="active"?"rgba(22,163,74,.12)":"rgba(220,38,38,.1)",
                              color:s.status==="active"?"#16a34a":C.red}}>
                              {s.status==="active"?"Active":"Suspended"}
                            </span>
                          </td>
                          <td style={{padding:"12px 14px",textAlign:"center"}}>
                            {s.setup_done
                              ? <CheckCircle2 size={16} color="#16a34a"/>
                              : <CircleAlert size={16} color={C.muted}/>}
                          </td>
                          <td style={{padding:"12px 14px",color:C.muted,fontSize:11,whiteSpace:"nowrap"}}>
                            {s.created_at?new Date(s.created_at).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}):"—"}
                          </td>
                          <td style={{padding:"12px 14px"}}>
                            <div style={{display:"flex",gap:6,flexWrap:"nowrap"}}>
                              <button onClick={()=>setManageSchool(s)}
                                style={{background:C.offWhite,border:`1px solid ${C.border}`,borderRadius:7,
                                  padding:"5px 10px",fontSize:11,fontWeight:700,color:C.text,cursor:"pointer",
                                  display:"flex",alignItems:"center",gap:4,whiteSpace:"nowrap"}}>
                                <Settings size={10}/>Manage
                              </button>
                              <button onClick={()=>toggleStatus(s)} disabled={busyId===s.id}
                                style={{background:s.status==="active"?"rgba(220,38,38,.08)":"rgba(22,163,74,.1)",
                                  border:`1px solid ${s.status==="active"?"rgba(220,38,38,.25)":"rgba(22,163,74,.3)"}`,
                                  borderRadius:7,padding:"5px 10px",fontSize:11,fontWeight:700,
                                  color:s.status==="active"?C.red:"#16a34a",cursor:"pointer",whiteSpace:"nowrap"}}>
                                {busyId===s.id?"…":s.status==="active"?"Suspend":"Activate"}
                              </button>
                              <button onClick={()=>setDeleteSchool(s)}
                                style={{background:"rgba(220,38,38,.07)",border:"1px solid rgba(220,38,38,.2)",
                                  borderRadius:7,padding:"5px 8px",fontSize:11,color:C.red,cursor:"pointer"}}>
                                <Trash2 size={11}/>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {schools.length===0&&(
                        <tr><td colSpan={8} style={{padding:40,textAlign:"center",color:C.muted}}>No organizations registered yet.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
            }
          </div>
        )}

        {/* ── AUDIT LOG TAB ── */}
        {tab==="audit"&&(
          <div style={{background:C.white,borderRadius:18,border:`1px solid ${C.border}`,overflow:"hidden"}}>
            <div style={{padding:"16px 22px",borderBottom:`1px solid ${C.border}`,
              display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
              <div style={{fontSize:15,fontWeight:800,color:C.text}}>Platform Audit Log</div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <div style={{position:"relative"}}>
                  <Search size={13} style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:C.muted}}/>
                  <input value={auditFilter} onChange={e=>setAuditFilter(e.target.value)}
                    placeholder="Search actions…"
                    style={{padding:"7px 12px 7px 30px",border:`1px solid ${C.border}`,borderRadius:8,
                      fontSize:12,background:C.offWhite,color:C.text,outline:"none",width:200}}/>
                </div>
                <button onClick={loadAudit} style={{background:C.offWhite,border:`1px solid ${C.border}`,
                  borderRadius:8,padding:"6px 12px",fontSize:12,fontWeight:600,color:C.muted,cursor:"pointer",
                  display:"flex",alignItems:"center",gap:5}}>
                  <RefreshCw size={12}/>Refresh
                </button>
              </div>
            </div>
            {auditLoading
              ? <div style={{padding:40,textAlign:"center",color:C.muted}}>Loading…</div>
              : <div style={{overflowX:"auto"}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                    <thead>
                      <tr style={{background:C.offWhite}}>
                        {["Time","Action","Entity","Organization","Performed By","Notes"].map(h=>(
                          <th key={h} style={{padding:"10px 14px",textAlign:"left",fontWeight:700,
                            color:C.muted,fontSize:11,textTransform:"uppercase",letterSpacing:.6,
                            borderBottom:`1px solid ${C.border}`,whiteSpace:"nowrap"}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAudit.map((a,i)=>(
                        <tr key={a.id} style={{borderBottom:`1px solid ${C.border}`,background:i%2===0?C.white:C.offWhite}}>
                          <td style={{padding:"10px 14px",color:C.muted,fontSize:11,whiteSpace:"nowrap"}}>
                            {a.performed_at?new Date(a.performed_at).toLocaleString("en-GB",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}):"—"}
                          </td>
                          <td style={{padding:"10px 14px"}}>
                            <span style={{background:"rgba(59,130,246,.1)",color:"#3b82f6",padding:"2px 8px",
                              borderRadius:5,fontSize:11,fontWeight:700}}>{a.action||"—"}</span>
                          </td>
                          <td style={{padding:"10px 14px",color:C.text,fontSize:12}}>
                            <div>{a.entity_name||"—"}</div>
                            {a.entity_type&&<div style={{color:C.muted,fontSize:10}}>{a.entity_type}</div>}
                          </td>
                          <td style={{padding:"10px 14px",color:C.muted,fontSize:12}}>
                            {a.school_id?(schoolNameMap[a.school_id]||a.school_id.slice(0,8)+"…"):"Platform"}
                          </td>
                          <td style={{padding:"10px 14px",color:C.muted,fontSize:12}}>{a.performed_by||"—"}</td>
                          <td style={{padding:"10px 14px",color:C.muted,fontSize:12,maxWidth:200}}>{a.notes||"—"}</td>
                        </tr>
                      ))}
                      {filteredAudit.length===0&&(
                        <tr><td colSpan={6} style={{padding:40,textAlign:"center",color:C.muted}}>
                          {auditLog.length===0?"No audit entries yet.":"No entries match your search."}
                        </td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
            }
          </div>
        )}

        {/* ── PLATFORM SETTINGS TAB ── */}
        {tab==="platform"&&(
          <div style={{display:"flex",flexDirection:"column",gap:16,maxWidth:540}}>
            {/* Admin info card */}
            <div style={{background:C.white,borderRadius:16,border:`1px solid ${C.border}`,padding:"22px 24px"}}>
              <div style={{fontSize:14,fontWeight:800,color:C.text,marginBottom:16,
                display:"flex",alignItems:"center",gap:8}}>
                <Shield size={16} color={C.blue}/> Platform Admin Account
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                {[
                  {label:"Full Name",value:admin.full_name||"—"},
                  {label:"Email",value:admin.email||"—"},
                  {label:"Last Login",value:admin.last_login?new Date(admin.last_login).toLocaleString("en-GB",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}):"Never"},
                  {label:"Account Created",value:admin.created_at?new Date(admin.created_at).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}):"—"},
                ].map(({label,value})=>(
                  <div key={label}>
                    <div style={{fontSize:10,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.6,marginBottom:3}}>{label}</div>
                    <div style={{fontSize:13,color:C.text,fontWeight:500}}>{value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Security card */}
            <div style={{background:C.white,borderRadius:16,border:`1px solid ${C.border}`,padding:"22px 24px"}}>
              <div style={{fontSize:14,fontWeight:800,color:C.text,marginBottom:16,
                display:"flex",alignItems:"center",gap:8}}>
                <KeyRound size={16} color={C.blue}/> Security
              </div>
              <div style={{marginBottom:12,fontSize:13,color:C.muted}}>Change your platform admin PIN at any time.</div>
              <button onClick={()=>setShowChangePin(true)}
                style={{background:`linear-gradient(135deg,#111827,#2563eb)`,border:"none",
                  color:"#fff",padding:"10px 20px",borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer",
                  display:"flex",alignItems:"center",gap:7}}>
                <KeyRound size={14}/> Change PIN
              </button>
            </div>

            {/* Platform overview card */}
            <div style={{background:C.white,borderRadius:16,border:`1px solid ${C.border}`,padding:"22px 24px"}}>
              <div style={{fontSize:14,fontWeight:800,color:C.text,marginBottom:16,
                display:"flex",alignItems:"center",gap:8}}>
                <Building2 size={16} color={C.blue}/> Platform Overview
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                {[
                  {label:"Total Organizations",value:schools.length},
                  {label:"Active Organizations",value:activeCount},
                  {label:"Suspended",value:schools.length-activeCount},
                  {label:"Setup Complete",value:setupCount},
                  {label:"Total Members",value:totalStudents.toLocaleString()},
                  {label:"Free Plan",value:schools.filter(s=>!s.plan||s.plan==="free").length},
                  {label:"Starter Plan",value:schools.filter(s=>s.plan==="starter").length},
                  {label:"Pro Plan",value:schools.filter(s=>s.plan==="pro").length},
                  {label:"Enterprise Plan",value:schools.filter(s=>s.plan==="enterprise").length},
                ].map(({label,value})=>(
                  <div key={label}>
                    <div style={{fontSize:10,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.6,marginBottom:3}}>{label}</div>
                    <div style={{fontSize:18,color:C.text,fontWeight:800}}>{value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Danger zone */}
            <div style={{background:"rgba(220,38,38,.04)",borderRadius:16,border:"1.5px solid rgba(220,38,38,.15)",padding:"22px 24px"}}>
              <div style={{fontSize:14,fontWeight:800,color:C.red,marginBottom:8,
                display:"flex",alignItems:"center",gap:8}}>
                <AlertTriangle size={16}/> Danger Zone
              </div>
              <div style={{fontSize:12,color:C.muted,marginBottom:14}}>
                Deleting a organization is permanent and cannot be undone. All data for that organization will be removed.
                Use the Organizations tab to delete individual organizations.
              </div>
              <button onClick={()=>{setTab("schools");}}
                style={{background:"rgba(220,38,38,.1)",border:"1px solid rgba(220,38,38,.25)",
                  color:C.red,padding:"8px 16px",borderRadius:9,fontSize:12,fontWeight:700,cursor:"pointer",
                  display:"flex",alignItems:"center",gap:6}}>
                <Trash2 size={12}/> Go to Organizations → Delete
              </button>
            </div>
          </div>
        )}
      </div>

      {manageSchool&&<SchoolManagerModal school={manageSchool} onClose={()=>setManageSchool(null)}
        onSaved={(updated)=>{ setSchools(sc=>sc.map(s=>s.id===updated.id?{...s,...updated}:s)); setManageSchool(null); showMsg("Organization updated."); }}/>}
      {deleteSchool&&<DeleteSchoolModal school={deleteSchool} onClose={()=>setDeleteSchool(null)}
        onDeleted={(id)=>{ setSchools(sc=>sc.filter(s=>s.id!==id)); setDeleteSchool(null); showMsg(`${deleteSchool.name} deleted.`); }}/>}
      {showCopy&&<CopySettingsModal schools={schools} onClose={()=>setShowCopy(false)}/>}
      {showChangePin&&<ChangePinModal onClose={()=>setShowChangePin(false)} onSuccess={(msg)=>{showMsg(msg);setShowChangePin(false);}}/>}
      {showAddSchool&&<OrgSignupModal onClose={()=>setShowAddSchool(false)} onSuccess={(school)=>{ load(); setShowAddSchool(false); showMsg(`${school?.name||"Organization"} created successfully.`); }}/>}
    </div>
  );
}

// ─── SCHOOL MANAGER MODAL ─────────────────────────────────────────────────────

// ─── LOGIN ────────────────────────────────────────────────────────────────────

// ─── DASHBOARD ────────────────────────────────────────────────────────────────

// ─── STUDENT DASHBOARD ───────────────────────────────────────────────────────
// ─── RBAC: PERMISSION GROUPS DEFINITION ───────────────────────────────────────────────
export const PERM_GROUPS=[
  {id:"academic",label:"Performance",color:"#111827",perms:[
    {id:"page:report-cards",        label:"Reports",               desc:"Access the Reports page"},
    {id:"page:my-results",          label:"My Report (Member)",   desc:"Member's own report card view"},
    {id:"page:results-admin",       label:"Results Entry (Admin view)", desc:"Admin results entry page"},
    {id:"page:results-teach",       label:"Results Upload (Staff)",   desc:"Staff results upload"},
    {id:"page:transcript",          label:"Transcript",                 desc:"View performance transcript"},
    {id:"page:grading",             label:"Grading & CAE",              desc:"Manage grade schema & CAE traits"},
    {id:"page:report-card-settings",label:"Report Settings",       desc:"Configure report card templates"},
    {id:"page:assignments",         label:"Assignments",                desc:"View/manage assignments"},
    {id:"page:result-approvals",    label:"Result Approvals",           desc:"Approve/lock result submissions"},
    {id:"page:calendar",            label:"Calendar",          desc:"View and manage organization calendar events"},
    {id:"page:timetable",           label:"Timetable",                  desc:"View group timetables and weekly schedules"},
    {id:"page:broadsheet",          label:"Broadsheet",                 desc:"Generate and export group broadsheets (PDF + Excel)"},
    {id:"action:edit_grades",              label:"Edit Grades",                desc:"Can enter and modify scores"},
    {id:"action:download_result_template", label:"Download Result Templates",   desc:"Can download group/section XLS templates for result entry"},
    {id:"action:publish_results",          label:"Publish Results",             desc:"Can publish report cards"},
    {id:"action:approve_ea",               label:"Educator Approval (EA)",      desc:"Can give EA-level approval"},
    {id:"action:approve_ma",               label:"Manager Approval (MA)",       desc:"Can lock results with MA"},
    {id:"action:download_reports",         label:"Download Reports",       desc:"Can download/print PDF reports"},
  ]},
  {id:"student_mgmt",label:"Member Management",color:"#1A8C3C",perms:[
    {id:"page:members",             label:"Members Page",               desc:"View all members list"},
    {id:"page:students",            label:"Members Page",              desc:"Access members management"},
    {id:"page:add-students",        label:"Add Members",               desc:"Submit new member requests"},
    {id:"page:approvals",           label:"Member Approvals",          desc:"Approve new member requests"},
    {id:"page:access-requests",     label:"Access Requests (Admin)",    desc:"Review and approve staff access requests"},
    {id:"page:request-access",      label:"Request Access (Staff)",   desc:"Staff submit access requests to admin"},
    {id:"page:bulk-promote",        label:"Promotions",                 desc:"End-of-cycle promotion & rollover"},
    {id:"action:edit_students",     label:"Edit Member Profiles",      desc:"Modify member name, group, etc."},
    {id:"action:delete_students",   label:"Delete Members",            desc:"Permanently remove members"},
    {id:"action:manage_status",     label:"Manage Member Status",      desc:"Activate/suspend/graduate"},
  ]},
  {id:"staff_mgmt",label:"Staff Management",color:"#111827",perms:[
    {id:"page:teachers",            label:"Staff Page",              desc:"View/manage staff list"},
    {id:"page:classes",             label:"Groups",                    desc:"Manage groups"},
    {id:"page:subjects",            label:"Categories",                   desc:"Manage categories"},
    {id:"page:sections",            label:"Sections",                   desc:"Manage sections/departments"},
    {id:"page:my-classes",          label:"My Groups (Staff)",       desc:"Staff's own group view"},
    {id:"action:edit_staff",        label:"Edit Staff Profiles",        desc:"Modify staff details"},
    {id:"action:delete_staff",      label:"Delete Staff",               desc:"Remove staff from system"},
    {id:"action:assign_classes",    label:"Assign Groups",             desc:"Assign staff to groups"},
  ]},
  {id:"financial",label:"Financial",color:"#7C3AED",perms:[
    {id:"page:fee-tracker",         label:"Payment Tracker",            desc:"View/record billing payments"},
    {id:"page:fee-items",           label:"Billing Items",                  desc:"Manage billing categories"},
    {id:"page:fee-templates",       label:"Billing Templates",              desc:"Create billing bundles"},
    {id:"page:fee-generate",        label:"Generate Bills",             desc:"Generate billing bills for members"},
    {id:"page:fee-stats",           label:"Billing Analytics",             desc:"Revenue charts and reports"},
    {id:"page:my-payments",         label:"My Payments (Member)",      desc:"Member's own payment records"},
    {id:"page:my-bill",             label:"My Bill (Member)",          desc:"Member's billing bill"},
    {id:"action:record_payments",   label:"Record Payments",            desc:"Mark bills as paid"},
    {id:"action:edit_fees",         label:"Edit Billing Records",           desc:"Modify billing amounts"},
    {id:"action:generate_invoices", label:"Generate Invoices",          desc:"Print/export invoices"},
  ]},
  {id:"communication",label:"Communication",color:"#0891B2",perms:[
    {id:"page:announce",            label:"Announcements",              desc:"View and post announcements"},
    {id:"page:attendance",          label:"Attendance",                 desc:"Record/view attendance"},
    {id:"page:mail-compose",        label:"Send Email",                 desc:"Send emails via portal"},
    {id:"page:mail-logs",           label:"Email Logs",                 desc:"View sent email history"},
    {id:"action:send_announcements",label:"Send Announcements",         desc:"Can create & publish announcements"},
    {id:"action:send_email",        label:"Send Emails",                desc:"Can send portal emails"},
    {id:"action:manage_attendance", label:"Manage Attendance",          desc:"Can record and edit attendance"},
  ]},
  {id:"system",label:"System",color:"#64748B",perms:[
    {id:"page:dashboard",           label:"Dashboard",                  desc:"Access main dashboard"},
    {id:"page:audit-log",           label:"Audit Trail",                desc:"View system activity log"},
    {id:"page:recycle-bin",         label:"Recycle Bin",                desc:"Restore recently deleted records"},
    {id:"page:export",              label:"Data Export",                desc:"Export organization data as Excel spreadsheets"},
    {id:"page:activity",            label:"Login Activity",             desc:"View user last-login analytics"},
    {id:"action:configure_settings",label:"Configure Settings",         desc:"Change organization-wide settings"},
    {id:"action:manage_permissions",label:"Manage Permissions",         desc:"Change role & user permissions"},
    {id:"action:view_audit_log",    label:"View Audit Log",             desc:"Access permission change history"},
  ]},
];
export const PERM_ROLE_DEFAULTS={
  teacher:["page:dashboard","page:report-cards","page:results-teach","page:transcript","page:my-classes","page:add-students","page:announce","page:attendance","page:calendar","page:timetable","page:request-access","action:edit_grades","action:download_result_template","action:download_reports"],
  student:["page:dashboard","page:my-results","page:my-payments","page:my-bill","page:transcript","page:announce","action:download_reports"],
  manager:["page:dashboard","page:fee-tracker","page:fee-items","page:fee-templates","page:fee-generate","page:fee-stats","page:members","page:students","page:announce","page:mail-compose","page:mail-logs","action:record_payments","action:edit_fees","action:generate_invoices","action:send_email"],
  bursar:["page:dashboard","page:fee-tracker","page:fee-items","page:fee-templates","page:fee-generate","page:fee-stats","page:members","page:students","page:announce","action:record_payments","action:edit_fees","action:generate_invoices"],
};
export const RBAC_ROLES=[
  {id:"teacher", label:"Staff",  color:"#1A8C3C",desc:"Teaching staff — upload results, manage their group report cards"},
  {id:"manager", label:"Manager",  color:"#7C3AED",desc:"Finance officer — full access to billing, billing and payments"},
  {id:"bursar",  label:"Finance Manager",   color:"#B45309",desc:"Dedicated finance role — billing, billing and payment management only"},
  {id:"student", label:"Member",  color:"#111827",desc:"Enrolled members — view own records, results and bills"},
];
function SaveTemplateForm({roles,onSave}){
  const[name,setName]=useState("");const[role,setRole]=useState("teacher");
  return(<div style={{display:"flex",flexDirection:"column",gap:8}}>
    <input value={name} onChange={e=>setName(e.target.value)} placeholder="Template name (e.g. Default Staff)"
      style={{padding:"8px 10px",border:`1px solid ${C.border}`,borderRadius:8,fontSize:12,outline:"none",background:C.white,color:C.text}}/>
    <select value={role} onChange={e=>setRole(e.target.value)}
      style={{padding:"8px 10px",border:`1px solid ${C.border}`,borderRadius:8,fontSize:12}}>
      {roles.map(r=><option key={r.id} value={r.id}>{r.label}</option>)}
    </select>
    <button onClick={()=>{if(name.trim()){onSave(role,name.trim());setName("");}}} disabled={!name.trim()}
      style={{padding:"8px 12px",borderRadius:8,background:"#111827",color:"#fff",border:"none",cursor:"pointer",fontSize:12,fontWeight:700,opacity:name.trim()?1:.5}}>
      Save Template
    </button>
  </div>);
}
function ApplyTemplateBtn({roles,templateName,onApply}){
  const[open,setOpen]=useState(false);const[role,setRole]=useState("teacher");
  if(!open)return(<button onClick={()=>setOpen(true)} style={{padding:"4px 8px",borderRadius:6,border:`1px solid ${C.blue}`,background:C.bluePale,color:C.blue,cursor:"pointer",fontSize:11,fontWeight:700}}>Apply</button>);
  return(<div style={{display:"flex",gap:4,alignItems:"center"}}>
    <select value={role} onChange={e=>setRole(e.target.value)} style={{padding:"4px 6px",border:`1px solid ${C.border}`,borderRadius:6,fontSize:11}}>
      {roles.map(r=><option key={r.id} value={r.id}>{r.label}</option>)}
    </select>
    <button onClick={()=>{onApply(templateName,role);setOpen(false);}} style={{padding:"4px 6px",borderRadius:6,border:`1px solid ${C.blue}`,background:C.blue,color:"#fff",cursor:"pointer",fontSize:11,fontWeight:700}}>✓</button>
    <button onClick={()=>setOpen(false)} style={{padding:"4px 6px",borderRadius:6,border:`1px solid ${C.border}`,background:C.white,color:C.muted,cursor:"pointer",fontSize:11}}>✕</button>
  </div>);
}
// ─── PERMISSIONS PAGE ─────────────────────────────────────────────────────────────────────────────────
// Admin can control what roles and individual users can access

// ─── PAYMENTS PAGE (Admin) ────────────────────────────────────────────────────

// ─── MY PAYMENTS (Member) ────────────────────────────────────────────────────



// ─── PDF BUILDER (shared by tracker + student bill page) ──────────────────────


// ─── ACTIONS DROPDOWN MENU ────────────────────────────────────────────────────
// Usage: <ActionsMenu items={[{label, icon, onClick, color?, danger?}]}/>


// ─── SECTION PILL TABS ────────────────────────────────────────────────────────
// Reusable "All | Nursery | Primary | Secondary …" tab bar

// ═══════════════════════════════════════════════════════════════════════════════
// FEES MODULE — Admin + Member Pages
// ═══════════════════════════════════════════════════════════════════════════════

// ── Helpers ───────────────────────────────────────────────────────────────────
const TERMS = ["1st Period","2nd Period","3rd Period"];
const STUDENT_TYPES = [{value:"all",label:"All Members"},{value:"new",label:"New Members"},{value:"old",label:"Old Members"}];

// ─── FEE ITEMS PAGE (Admin) ───────────────────────────────────────────────────

// ─── FEE TEMPLATES PAGE (Admin) ───────────────────────────────────────────────

// ─── FEE GENERATE PAGE (Admin) ────────────────────────────────────────────────

// ─── MY BILL PAGE (Member) ───────────────────────────────────────────────────

// ─── ANNOUNCEMENTS ────────────────────────────────────────────────────────────

// ─── TRANSCRIPT PDF BUILDER ───────────────────────────────────────────────────
function buildMultiPeriodTranscriptHTML({studentName,studentId,className,sectionName,gender,dob,academicYear,subjects,classPeriods,gradingSchema,settings,today,logoBase64}){
  const schoolName=settings?.school_name||"Your Organization";
  const schoolAddr=settings?.school_address||"";
  const schoolPhone=settings?.school_phone||"";
  const logoUrl=logoBase64||settings?.portal_logo_base64||"";
  const docTitle=pdfName(studentName,"TRANSCRIPT",academicYear);

  const gradeOf=score=>{
    if(score==null||score==="")return"—";
    const n=+score;const schema=gradingSchema||[];
    if(schema.length){const g=schema.find(s=>n>=s.min_score&&n<=s.max_score);return g?.grade||"—";}
    if(n>=70)return"A";if(n>=60)return"B";if(n>=50)return"C";if(n>=45)return"D";if(n>=40)return"E";return"F";
  };
  const remarkOf=score=>{
    if(score==null||score==="")return"—";const n=+score;const schema=gradingSchema||[];
    if(schema.length){const g=schema.find(s=>n>=s.min_score&&n<=s.max_score);return g?.remark||"—";}
    if(n>=70)return"Excellent";if(n>=60)return"Very Good";if(n>=50)return"Good";if(n>=45)return"Pass";if(n>=40)return"Fair";return"Fail";
  };
  const fmt=v=>(v==null||v===""||isNaN(+v))?"—":(+v%1===0?+v:(+v).toFixed(1));

  const periodAvg=p=>{
    const vals=[p.t1,p.t2,p.t3].filter(v=>v!=null&&v!==""&&!isNaN(+v)).map(Number);
    return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null;
  };

  // Summary stats
  const allAvgs=subjects.flatMap(s=>classPeriods.map((_,pi)=>periodAvg(s.periods[pi]||{}))).filter(v=>v!=null);
  const overallAvg=allAvgs.length?allAvgs.reduce((a,b)=>a+b,0)/allAvgs.length:null;
  const overallGrade=overallAvg!=null?gradeOf(overallAvg):"—";
  const overallRemark=overallAvg!=null?remarkOf(overallAvg):"—";
  const passes=subjects.filter(s=>{
    const avgs=classPeriods.map((_,pi)=>periodAvg(s.periods[pi]||{})).filter(v=>v!=null);
    if(!avgs.length)return false;
    return avgs.reduce((a,b)=>a+b,0)/avgs.length>=40;
  }).length;

  // Chunk periods into groups of max 3
  const CHUNK=3;
  const chunks=[];
  for(let i=0;i<classPeriods.length;i+=CHUNK) chunks.push({periods:classPeriods.slice(i,i+CHUNK),start:i});

  const buildChunkTable=(chunk)=>{
    const cps=chunk.periods;const si=chunk.start;
    // Row 1 — Group name: navy bg, white text, underlined, left border accent between groups
    const classHdrs=cps.map((p,ci)=>`
      <th colspan="5" style="background:#1e3a5f;color:#fff;padding:8px 6px;text-align:center;
        font-size:11px;font-weight:700;border:1px solid #2a4a72;
        ${ci>0?"border-left:3px solid #6b9fd4":""};
        text-decoration:underline;text-underline-offset:4px;letter-spacing:.4px">
        ${p.class_name||"—"}
      </th>`).join("");
    // Row 2 — Performance year: slightly lighter navy, italic
    const yearHdrs=cps.map((p,ci)=>`
      <th colspan="5" style="background:#2c4f7c;color:#c8dff5;padding:6px;text-align:center;
        font-size:10px;font-weight:400;border:1px solid #3a5f8a;font-style:italic;
        ${ci>0?"border-left:3px solid #6b9fd4":""}">
        ${p.academic_year||"—"}
      </th>`).join("");
    // Row 3 — Period headers: medium blue, term cols lighter; avg/grade cols darker with gold text
    const termHdrs=cps.map((_,ci)=>`
      <th style="background:#3b6fa8;color:#e8f2fc;padding:6px 4px;text-align:center;font-size:8.5px;font-weight:700;border:1px solid #4a7dba;min-width:52px;${ci>0?"border-left:3px solid #6b9fd4":""}">1st<br/>Period</th>
      <th style="background:#3b6fa8;color:#e8f2fc;padding:6px 4px;text-align:center;font-size:8.5px;font-weight:700;border:1px solid #4a7dba;min-width:52px">2nd<br/>Period</th>
      <th style="background:#3b6fa8;color:#e8f2fc;padding:6px 4px;text-align:center;font-size:8.5px;font-weight:700;border:1px solid #4a7dba;min-width:52px">3rd<br/>Period</th>
      <th style="background:#1e3a5f;color:#f0c040;padding:6px 4px;text-align:center;font-size:8.5px;font-weight:700;border:1px solid #2a4a72;min-width:46px">AVG</th>
      <th style="background:#1e3a5f;color:#f0c040;padding:6px 4px;text-align:center;font-size:8.5px;font-weight:700;border:1px solid #2a4a72;min-width:38px">GRD</th>`
    ).join("");
    const rows=subjects.map((s,i)=>{
      const bg=i%2===0?"#ffffff":"#f4f7fb";
      const cells=cps.map((_,ci)=>{
        const pi=si+ci;const p=s.periods[pi]||{t1:null,t2:null,t3:null};
        const avg=periodAvg(p);
        const borderL=ci>0?"border-left:3px solid #b8d0ea":"";
        return `
<td style="padding:6px 5px;border:1px solid #d4e2f0;${borderL};text-align:center;font-size:10.5px;color:#333">${fmt(p.t1)}</td>
<td style="padding:6px 5px;border:1px solid #d4e2f0;text-align:center;font-size:10.5px;color:#333">${fmt(p.t2)}</td>
<td style="padding:6px 5px;border:1px solid #d4e2f0;text-align:center;font-size:10.5px;color:#333">${fmt(p.t3)}</td>
<td style="padding:6px 5px;border:1px solid #d4e2f0;background:#e8f0f8;text-align:center;font-size:10.5px;font-weight:700;color:#1e3a5f">${avg!=null?avg.toFixed(1):"—"}</td>
<td style="padding:6px 5px;border:1px solid #d4e2f0;background:#e8f0f8;text-align:center;font-size:10.5px;font-weight:700;color:#1e3a5f">${avg!=null?gradeOf(avg):"—"}</td>`;
      }).join("");
      return `<tr style="background:${bg}">
<td style="padding:6px 10px;border:1px solid #d4e2f0;font-size:10.5px;font-weight:600;color:#111;text-transform:uppercase;letter-spacing:.2px">${s.name||""}</td>
${cells}
</tr>`;
    }).join("");
    return `
<table style="width:100%;border-collapse:collapse;border:2px solid #1e3a5f">
<thead>
<tr>
  <th rowspan="3" style="background:#1e3a5f;color:#fff;padding:8px 10px;text-align:left;min-width:140px;border:1px solid #2a4a72;font-size:9.5px;font-weight:700;vertical-align:bottom;letter-spacing:.5px;text-transform:uppercase">Category</th>
  ${classHdrs}
</tr>
<tr>${yearHdrs}</tr>
<tr>${termHdrs}</tr>
</thead>
<tbody>${rows}</tbody>
</table>`;
  };

  const allTables=chunks.map((chunk,ci)=>`
<div class="chunk" style="margin-bottom:${ci<chunks.length-1?22:0}px">
  ${ci>0?`<div style="margin:8px 0 6px;padding:5px 12px;background:#eef4fb;border-left:3px solid #3b6fa8;font-size:8.5px;color:#3b6fa8;font-weight:700;letter-spacing:.5px;text-transform:uppercase">
    ↓ Continued — Group Periods ${chunk.start+1}–${chunk.start+chunk.periods.length}
  </div>`:""}
  ${buildChunkTable(chunk)}
</div>`).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${docTitle}</title>
<script>document.title=${JSON.stringify(docTitle)}</script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{background:#dce4ed}
body{font-family:Georgia,"Times New Roman",serif;color:#111;font-size:11px;padding:24px}
.page{background:#fff;max-width:1060px;margin:0 auto;padding:26px 30px 30px;border:1px solid #b0bec5;position:relative;box-shadow:0 2px 12px rgba(0,0,0,.1)}
/* Faint diagonal watermark */
.watermark{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-38deg);font-size:110px;font-weight:900;color:rgba(30,58,95,.04);pointer-events:none;white-space:nowrap;letter-spacing:18px;z-index:0;font-family:Georgia,serif}
/* Header */
.hdr{display:flex;align-items:center;gap:16px;border-bottom:3px solid #1e3a5f;padding-bottom:14px;margin-bottom:14px}
.logo-wrap{width:68px;height:68px;border-radius:50%;border:2px solid #b0bec5;display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden;background:#f0f4f8}
.logo-wrap img{width:64px;height:64px;object-fit:contain}
.logo-init{font-size:14px;font-weight:900;color:#1e3a5f;text-align:center;line-height:1.1}
.school-info{flex:1;text-align:center}
.school-name{font-size:18px;font-weight:900;letter-spacing:.6px;text-transform:uppercase;color:#1e3a5f}
.school-sub{font-size:9px;color:#6b7e8f;margin:3px 0}
.doc-badge{display:inline-block;margin-top:6px;padding:3px 16px;border:1px solid #1e3a5f;font-size:9.5px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#1e3a5f}
.hdr-date{text-align:right;font-size:9px;color:#6b7e8f;min-width:90px;flex-shrink:0;white-space:nowrap}
/* Member info band */
.student-band{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;border:1px solid #b8ccd8;margin-bottom:16px;background:#f4f8fb}
.si-cell{padding:8px 12px;border-right:1px solid #ccdbe6}
.si-cell:last-child{border-right:none}
.si-lbl{font-size:7.5px;color:#6b7e8f;text-transform:uppercase;font-weight:700;letter-spacing:.6px;margin-bottom:3px}
.si-val{font-size:11.5px;font-weight:700;color:#1e3a5f}
/* Section heading */
.sec-hd{font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#1e3a5f;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid #b8ccd8}
.chunk{page-break-inside:avoid}
/* Summary cards */
.summary{display:grid;grid-template-columns:repeat(7,1fr);gap:8px;margin:18px 0}
.sc{border:1px solid #b8ccd8;padding:8px 6px;text-align:center;background:#f4f8fb}
.sc.accent{background:#1e3a5f;border-color:#1e3a5f}
.sc-val{font-size:17px;font-weight:900;color:#1e3a5f;line-height:1}
.sc.accent .sc-val{color:#f0c040}
.sc-lbl{font-size:7.5px;color:#6b7e8f;text-transform:uppercase;letter-spacing:.5px;margin-top:4px}
.sc.accent .sc-lbl{color:#9bb8d4}
/* Footer */
.footer{border-top:2px solid #1e3a5f;padding-top:16px;display:grid;grid-template-columns:1fr auto 1fr;gap:20px;align-items:end}
.sig{text-align:center}
.sig-sp{height:34px}
.sig-ln{border-top:1px solid #555;padding-top:5px;font-size:8.5px;color:#555}
.stamp{text-align:center;font-size:8px;color:#9bb8d4;line-height:1.6}
.stamp-c{width:86px;height:86px;border-radius:50%;border:1.5px dashed #b8ccd8;margin:0 auto 6px;display:flex;align-items:center;justify-content:center}
.no-print{position:fixed;top:16px;right:16px;z-index:9999;display:flex;gap:8px;font-family:system-ui,sans-serif}
.hint-bar{position:fixed;bottom:0;left:0;right:0;z-index:9998;background:rgba(30,58,95,.93);color:#D1D5DB;font-size:11.5px;padding:8px 18px;text-align:center;font-family:system-ui,sans-serif}
@media print{
  @page{size:A4 landscape;margin:10mm}
  html,body{background:#fff;padding:0}
  .page{border:none;max-width:100%;padding:0;box-shadow:none}
  .no-print,.hint-bar{display:none!important}
  body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
</style>
</head>
<body>

<div class="no-print">
  <button onclick="document.querySelectorAll('.no-print,.hint-bar').forEach(function(e){e.style.display='none'});window.print();document.querySelectorAll('.no-print').forEach(function(e){e.style.display='flex'});document.querySelectorAll('.hint-bar').forEach(function(e){e.style.display='block'})"
    style="padding:10px 24px;background:#111827;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.2)">
    🖨️ Print / Save PDF
  </button>
  <button onclick="window.close()"
    style="padding:10px 16px;background:#fff;color:#64748b;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;cursor:pointer">
    ✕ Close
  </button>
</div>
<div class="hint-bar">
  💡 Click <b>Print / Save PDF</b> → choose <b>Save as PDF</b>, Orientation: <b>Landscape</b>, Margins: <b>None</b>
</div>

<div class="page">
  <div class="watermark">OFFICIAL</div>

  <!-- Header -->
  <div class="hdr">
    <div class="logo-wrap">
      ${logoUrl
        ?`<img src="${logoUrl}" alt="Logo"/>`
        :`<div class="logo-init">${schoolName.split(" ").map(w=>w[0]).join("").slice(0,3)}</div>`}
    </div>
    <div class="school-info">
      <div class="school-name">${schoolName}</div>
      ${schoolAddr||schoolPhone?`<div class="school-sub">${schoolAddr}${schoolPhone?" &nbsp;|&nbsp; Tel: "+schoolPhone:""}</div>`:""}
      <div class="doc-badge">Official Performance History</div>
    </div>
    <div class="hdr-date">Generated on<br/><strong>${today}</strong></div>
  </div>

  <!-- Member info -->
  <div class="student-band">
    <div class="si-cell">
      <div class="si-lbl">Full Name</div>
      <div class="si-val" style="font-size:12.5px">${studentName}</div>
    </div>
    <div class="si-cell">
      <div class="si-lbl">Member ID / Adm. No.</div>
      <div class="si-val">${studentId||"—"}</div>
    </div>
    <div class="si-cell">
      <div class="si-lbl">Gender &amp; Date of Birth</div>
      <div class="si-val">${gender||"—"}${dob?" · "+dob:""}</div>
    </div>
    <div class="si-cell">
      <div class="si-lbl">Current Group / Section</div>
      <div class="si-val">${className||"—"}${sectionName?" · "+sectionName:""}</div>
    </div>
  </div>

  <!-- Tables -->
  <div class="sec-hd">Performance Record</div>
  ${allTables}

  <!-- Summary -->
  <div class="summary">
    <div class="sc"><div class="sc-val">${subjects.length}</div><div class="sc-lbl">Categories Taken</div></div>
    <div class="sc"><div class="sc-val">${passes}</div><div class="sc-lbl">Passed</div></div>
    <div class="sc"><div class="sc-val">${subjects.length-passes}</div><div class="sc-lbl">Failed</div></div>
    <div class="sc"><div class="sc-val">${classPeriods.length}</div><div class="sc-lbl">Group Periods</div></div>
    <div class="sc accent"><div class="sc-val">${overallAvg!=null?overallAvg.toFixed(1)+"%":"—"}</div><div class="sc-lbl">Overall Average</div></div>
    <div class="sc accent"><div class="sc-val">${overallGrade}</div><div class="sc-lbl">Overall Grade</div></div>
    <div class="sc accent"><div class="sc-val" style="font-size:12px;padding-top:3px">${overallRemark}</div><div class="sc-lbl">Remark</div></div>
  </div>

  <!-- Footer -->
  <div class="footer">
    <div class="sig"><div class="sig-sp"></div><div class="sig-ln">Group Staff — Signature &amp; Date</div></div>
    <div class="stamp">
      <div class="stamp-c"><span style="font-size:7.5px;color:#c0cfda;font-weight:700;letter-spacing:1px;text-transform:uppercase">STAMP</span></div>
      <div>Official document of <strong style="color:#1e3a5f">${schoolName}</strong>.<br/>Any alteration renders it invalid.</div>
    </div>
    <div class="sig"><div class="sig-sp"></div><div class="sig-ln">Principal / Head Staff — Signature &amp; Date</div></div>
  </div>

</div><!-- /page -->
</body></html>`;
}

function buildTranscriptHTML({studentName,studentId,className,sectionName,gender,dob,academicYear,subjects,gradingSchema,settings,today,columns=null,structureName=null,logoBase64}){
  // subjects: [{name, scores: {[colName]: value}}]
  // columns: string[] | null — if null uses legacy 9-col (T1 CA/Exam/Total × 3)
  const schoolName=settings?.school_name||"Your Organization";
  const schoolAddr=settings?.school_address||"No. 1 Business Avenue, Abuja, FCT";
  const schoolPhone=settings?.school_phone||"";
  const logoUrl=logoBase64||settings?.portal_logo_base64||"";

  const gradeOf=score=>{
    if(score==null||score==="")return"—";
    const n=+score;
    const schema=gradingSchema||[];
    if(schema.length){const g=schema.find(s=>n>=s.min_score&&n<=s.max_score);return g?.grade||"—";}
    if(n>=70)return"A";if(n>=60)return"B";if(n>=50)return"C";if(n>=45)return"D";if(n>=40)return"E";return"F";
  };
  const remarkOf=score=>{
    if(score==null||score==="")return"—";
    const n=+score;
    const schema=gradingSchema||[];
    if(schema.length){const g=schema.find(s=>n>=s.min_score&&n<=s.max_score);return g?.remark||"—";}
    if(n>=70)return"Excellent";if(n>=60)return"Very Good";if(n>=50)return"Good";if(n>=45)return"Pass";if(n>=40)return"Fair";return"Fail";
  };
  const displayScore=v=>(v==null||v===""||isNaN(+v))?"—":Math.round(+v*10)/10;

  // Determine columns and per-subject totals
  const isCustom=!!(columns&&columns.length>0);
  // For custom structure: the last column whose name contains "total" (case-insensitive) is the total col;
  // if none found, use the last column.
  const totalColName=isCustom
    ?(columns.find(c=>/total/i.test(c))||columns[columns.length-1])
    :null;

  const getAnn=(s)=>{
    if(isCustom){
      // Use the value of the total column as the "score" for grading
      const sc=s.scores||{};
      if(totalColName!=null){const v=sc[totalColName];return(v===""||v==null)?null:+v;}
      const vals=Object.values(sc).filter(v=>v!==""&&v!=null).map(Number).filter(n=>!isNaN(n));
      return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null;
    }
    const sc=s.scores||{};
    const totals=["T1 Total","T2 Total","T3 Total"].map(k=>sc[k]).filter(v=>v!=null&&v!=="").map(Number);
    return totals.length?totals.reduce((a,b)=>a+b,0)/totals.length:null;
  };

  const rows=subjects.map((s,i)=>{
    const ann=getAnn(s);
    const grade=gradeOf(ann);
    const remark=remarkOf(ann);
    const bg=i%2===0?"#f8fafc":"#ffffff";
    const sc=s.scores||{};
    const scoreCells=isCustom
      ?columns.map(col=>`<td style="padding:6px;border:1px solid #e2e8f0;text-align:center;font-size:10px;${col===totalColName?"font-weight:700":"color:#64748b"}">${displayScore(sc[col])}</td>`).join("")
      :[["T1 CA","T1 Exam","T1 Total"],["T2 CA","T2 Exam","T2 Total"],["T3 CA","T3 Exam","T3 Total"]].flatMap((grp,gi)=>
        grp.map((col,fi)=>`<td style="padding:6px;border:1px solid #e2e8f0;text-align:center;font-size:10px;${fi===2?"font-weight:700":"color:#64748b"}">${displayScore(sc[col])}</td>`)
      ).join("");
    return `<tr style="background:${bg}">
      <td style="padding:6px 8px;border:1px solid #e2e8f0;font-size:10px;font-weight:600">${s.name||s.subject_name||""}</td>
      ${scoreCells}
      <td style="padding:6px;border:1px solid #e2e8f0;text-align:center;font-size:10px;font-weight:800;color:#030712">${ann!=null?ann.toFixed(1):"—"}</td>
      <td style="padding:6px;border:1px solid #e2e8f0;text-align:center;font-size:10px;font-weight:800;color:${grade==="A"?"#15803d":grade==="B"?"#1d4ed8":grade==="F"?"#b91c1c":"#92400e"}">${grade}</td>
      <td style="padding:6px 8px;border:1px solid #e2e8f0;font-size:10px;color:#374151">${remark}</td>
    </tr>`;
  }).join("");

  const allAnns=subjects.map(getAnn).filter(v=>v!=null);
  const overallAvg=allAnns.length?allAnns.reduce((a,b)=>a+b,0)/allAnns.length:null;
  const passes=subjects.filter(s=>{ const a=getAnn(s); return a!=null&&a>=40; }).length;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<title>${pdfName(studentName,"TRANSCRIPT",academicYear)}</title>
<script>document.title=${JSON.stringify(pdfName(studentName,"TRANSCRIPT",academicYear))}</script>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:"Times New Roman",serif;background:#fff;color:#111;padding:28px 32px;font-size:11px}
  @media print{@page{size:A4 landscape;margin:12mm}body{padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  .header{display:flex;align-items:center;gap:16px;border-bottom:3px double #030712;padding-bottom:14px;margin-bottom:14px}
  .logo{width:64px;height:64px;flex-shrink:0;object-fit:contain}
  .logo-placeholder{width:64px;height:64px;border-radius:50%;background:#030712;display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:900;text-align:center;flex-shrink:0}
  .school-info{flex:1;text-align:center}
  .school-name{font-size:20px;font-weight:900;color:#030712;letter-spacing:.3px}
  .school-addr{font-size:10px;color:#555;margin:2px 0}
  .doc-title{font-size:13px;font-weight:900;color:#b91c1c;text-transform:uppercase;letter-spacing:2px;margin-top:5px;border-top:1px solid #ddd;padding-top:5px}
  .info-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:0;border:1px solid #d1d5db;border-radius:4px;margin-bottom:14px;overflow:hidden;font-size:10.5px}
  .info-cell{padding:6px 10px;border-right:1px solid #d1d5db;border-bottom:1px solid #d1d5db}
  .info-cell:last-child{border-right:none}
  .info-label{font-size:9px;color:#6b7280;text-transform:uppercase;font-weight:700;letter-spacing:.5px;margin-bottom:2px}
  .info-val{font-weight:700;color:#111}
  table{width:100%;border-collapse:collapse;font-size:10px;margin-bottom:14px}
  thead tr{background:#030712;color:#fff}
  th{padding:7px 6px;text-align:center;font-size:9px;font-weight:700;letter-spacing:.3px;border:1px solid #1e40af}
  th.subj-col{text-align:left}
  .group-hdr{background:#1e3a8a;color:#D1D5DB;font-size:9px;font-weight:700;padding:4px 6px;text-align:center;letter-spacing:.5px;border:1px solid #1e40af}
  .summary{display:flex;gap:12px;margin-bottom:18px;flex-wrap:wrap}
  .sum-box{border:1px solid #d1d5db;border-radius:6px;padding:8px 14px;text-align:center;min-width:100px}
  .sum-val{font-size:18px;font-weight:900;color:#030712}
  .sum-lbl{font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;margin-top:2px}
  .footer{border-top:2px solid #030712;padding-top:14px;margin-top:8px;display:flex;justify-content:space-between;align-items:flex-end}
  .sig-box{text-align:center;min-width:140px}
  .sig-line{border-top:1px solid #333;margin-top:28px;padding-top:4px;font-size:9px;color:#374151}
  .watermark{font-size:9px;color:#9ca3af;text-align:center;margin-top:8px;font-style:italic}
</style></head><body>
  <div class="header">
    ${logoUrl?`<img src="${logoUrl}" class="logo" alt="Logo"/>`:`<div class="logo-placeholder">${schoolName.split(" ").map(w=>w[0]).join("").slice(0,3)}</div>`}
    <div class="school-info">
      <div class="school-name">${schoolName.toUpperCase()}</div>
      <div class="school-addr">${schoolAddr}${schoolPhone?" · Tel: "+schoolPhone:""}</div>
      <div class="doc-title">Official Performance History</div>
    </div>
    <div style="text-align:right;font-size:9px;color:#6b7280;min-width:90px">Generated:<br/><strong>${today}</strong></div>
  </div>

  <div class="info-grid">
    <div class="info-cell"><div class="info-label">Member Name</div><div class="info-val">${studentName}</div></div>
    <div class="info-cell"><div class="info-label">Member ID / Admission No.</div><div class="info-val">${studentId||"—"}</div></div>
    <div class="info-cell"><div class="info-label">Performance Year</div><div class="info-val">${academicYear}</div></div>
    <div class="info-cell"><div class="info-label">Group</div><div class="info-val">${className||"—"}</div></div>
    <div class="info-cell"><div class="info-label">Section / Department</div><div class="info-val">${sectionName||"—"}</div></div>
    <div class="info-cell" style="border-right:none"><div class="info-label">Gender</div><div class="info-val">${gender||"—"}${dob?` · DOB: ${dob}`:""}</div></div>
  </div>

  <table>
    <thead>
      ${isCustom
        ?`<tr>
          <th class="subj-col" style="min-width:130px">Category${structureName?` <span style="font-weight:400;font-size:8px;opacity:.8">(${structureName})</span>`:"" }</th>
          ${columns.map(col=>`<th style="min-width:52px">${col}</th>`).join("")}
          <th style="min-width:50px">Score</th>
          <th>Grade</th>
          <th style="min-width:70px">Remark</th>
        </tr>`
        :`<tr>
          <th class="subj-col" rowspan="2" style="min-width:130px">Category</th>
          <th class="group-hdr" colspan="3">First Period</th>
          <th class="group-hdr" colspan="3">Second Period</th>
          <th class="group-hdr" colspan="3">Third Period</th>
          <th rowspan="2" style="min-width:50px">Annual Avg</th>
          <th rowspan="2">Grade</th>
          <th rowspan="2" style="min-width:70px">Remark</th>
        </tr>
        <tr>
          <th>CA</th><th>Exam</th><th>Total</th>
          <th>CA</th><th>Exam</th><th>Total</th>
          <th>CA</th><th>Exam</th><th>Total</th>
        </tr>`
      }
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="summary">
    <div class="sum-box"><div class="sum-val">${subjects.length}</div><div class="sum-lbl">Categories Taken</div></div>
    <div class="sum-box"><div class="sum-val">${passes}</div><div class="sum-lbl">Categories Passed</div></div>
    <div class="sum-box"><div class="sum-val">${subjects.length-passes}</div><div class="sum-lbl">Categories Failed</div></div>
    <div class="sum-box"><div class="sum-val" style="color:${overallAvg!=null&&overallAvg>=50?"#15803d":"#b91c1c"}">${overallAvg!=null?overallAvg.toFixed(1)+"%" :"—"}</div><div class="sum-lbl">Overall Average</div></div>
    <div class="sum-box"><div class="sum-val">${overallAvg!=null?gradeOf(overallAvg):"—"}</div><div class="sum-lbl">Overall Grade</div></div>
  </div>

  <div class="footer">
    <div class="sig-box"><div class="sig-line">Group Staff's Signature</div></div>
    <div class="watermark">This is an official document of ${schoolName}.<br/>Any alteration renders it invalid.</div>
    <div class="sig-box"><div class="sig-line">Head Staff / Principal</div></div>
  </div>
</body></html>`;
}

function openTranscriptPDF(html, showPDF=null, studentName="", academicYear=""){
  openHtmlDoc(html, {title:pdfName(studentName,"TRANSCRIPT",academicYear), showPDF});
}

// TranscriptPage -- imported from ./pages/



// ─── STAMP TEMPLATE GENERATOR ────────────────────────────────────────────────

const STAMP_TEMPLATES=[
  {id:"blue",  label:"Classic Mono",   style:"blue"},
  {id:"red",   label:"Official Red",   style:"red"},
  {id:"gold",  label:"Gold Premium",   style:"gold"},
  {id:"green", label:"Emerald",        style:"green"},
  {id:"orange",label:"Organization Brand",   style:"orange"},
];

// ─── SETTINGS HELPERS — defined OUTSIDE SettingsPage so they are stable
// component references and never cause focus-loss on re-render ─────────────────

// ─── SETTINGS PAGE ────────────────────────────────────────────────────────────


// printTranscript replaced by buildTranscriptHTML + openTranscriptPDF above TranscriptPage

// ─── REPORT CARDS PAGE ────────────────────────────────────────────────────────

// ─── RESULT APPROVALS PAGE ────────────────────────────────────────────────────

// ─── SIGNATURES PAGE (removed — principal signature is set in Settings > Performance) ───

// ─── REPORT CARD SETTINGS PAGE ────────────────────────────────────────────────

// ─── REPORT TEMPLATES PAGE ────────────────────────────────────────────────────

// ─── REPORT CARD PDF GENERATOR ────────────────────────────────────────────────
function openReportCardPrintWindow(students,allData,cls,term,session,
  gradingSchema,caeTraits,caeRatings,publishInfo,settings,logoSrc,
  classTeacherComment,principalComment,nextTermBegins,pubOptions,teacherSig,principalSig,
  showPDF=null,htmlOnly=false,forStorage=false){

  const opts=pubOptions||{show_cae:true,show_teacher_comment:true,show_principal_comment:true,show_parent_ack:false,show_position:false,show_next_term:true,card_design:"classic"};
  const design=opts.card_design||"classic";

  // Hardcoded grade colours — independent of React theme (C.*) so they
  // always render correctly inside the plain HTML string.
  const gCol=g=>{
    const u=(g||"").toUpperCase();
    if(u==="A"||u==="A+"||u==="A1")return"#15803D";
    if(u==="B"||u==="B+"||u==="B2"||u==="B3")return"#111827";
    if(u==="C"||u==="C+"||u==="C4"||u==="C5"||u==="C6")return"#D97706";
    if(u==="D"||u==="D7")return"#EA580C";
    if(u==="E"||u==="E8")return"#DC2626";
    if(u==="F"||u==="F9")return"#991B1B";
    // Numeric grades
    const n=+u;
    if(!isNaN(n)){
      if(n>=70)return"#15803D";
      if(n>=60)return"#111827";
      if(n>=50)return"#D97706";
      if(n>=40)return"#EA580C";
      return"#991B1B";
    }
    return"#475569";// fallback: visible dark slate
  };

  const schoolName=settings.school_name||"Your Organization";
  const schoolAddress=settings.school_address||"No. 1 Business Avenue, Abuja, FCT";
  const schoolMotto=settings.school_motto||"Excellence in Learning";
  const classTeacherTitle=settings.report_class_teacher_title||"Group Staff";
  const principalTitle=settings.report_principal_title||"Organization Principal";
  const footerText=settings.report_footer_text||"This report card is computer-generated.";
  const today=new Date().toLocaleDateString("en-NG",{day:"numeric",month:"long",year:"numeric"});
  const fmtDate=v=>{ try{ return v?new Date(v).toLocaleDateString("en-NG",{day:"numeric",month:"long",year:"numeric"}):"—"; }catch{return"—";} };
  const termClosingDate=fmtDate(settings.term_closing_date);
  const termOpeningDate=fmtDate(settings.term_opening_date);
  // Principal signature: per-publication override → global template (principalSig) → settings base64
  const principalSigUrl=principalSig?.image_url||settings.principal_signature_base64||null;
  const principalStampUrl=settings.principal_stamp_base64||null;
  // Font settings (default: 5% bigger than original, Times New Roman)
  const rcFontScale=(+(settings.report_card_font_size||105)/100).toFixed(3); // e.g. 1.050
  const rcFontFamily=settings.report_card_font_family||"'Times New Roman',Georgia,serif";

  const logoHtml=logoSrc
    ?`<img src="${logoSrc}" style="width:44px;height:44px;object-fit:contain;border-radius:4px;" alt="logo"/>`
    :`<div style="width:44px;height:44px;border-radius:50%;background:#111827;display:flex;align-items:center;justify-content:center;flex-shrink:0;border:2px solid #fff;">
        <div style="width:34px;height:34px;border-radius:50%;background:#111827;display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:900;font-family:Georgia,serif;">JD</div>
      </div>`;

  const cardHtml=students.map(stu=>{
    const stuData=allData[stu.id]||{results:[],caeResults:[]};
    const {results,caeResults}=stuData;
    const totalScore=results.reduce((a,b)=>a+(+b.total_score||0),0);
    const avg=results.length?totalScore/results.length:0;
    const overallG=getGrade(avg,gradingSchema);
    const overallR=getRemark(avg,gradingSchema);
    const gc=gCol(overallG);
    const stuName=[stu.first_name,stu.middle_name,stu.last_name].filter(Boolean).join(" ")||stu.name||"—";
    const ntbStr=nextTermBegins?new Date(nextTermBegins).toLocaleDateString("en-NG",{day:"numeric",month:"long",year:"numeric"}):"—";
    const caMax=+(settings.result_ca_max||40);
    const exMax=+(settings.result_exam_max||60);
    const _cc=settings._caeComps||[];const _hasCC=_cc.length>=2;const _scCols=_hasCC?_cc.length:2;
    const _scoreBanner=_hasCC?_cc.map(c=>c.component_name+'('+c.value_or_formula+')').join(' + ')+' = '+(caMax+exMax):'CA ('+caMax+') + Exam ('+exMax+') = Total ('+(caMax+exMax)+')';
    const _parseCS=(r)=>{try{return r.component_scores?JSON.parse(r.component_scores):{};}catch{return{};}};
    const _scoreHdr=(sty)=>_hasCC?_cc.map(c=>'<th style="'+sty+'">'+c.component_name+'</th>').join(''):'<th style="'+sty+'">CA</th><th style="'+sty+'">Exam</th>';
    const _scoreCells=(r,sty)=>{const cs=_parseCS(r);return _hasCC?_cc.map(c=>'<td style="'+sty+'">'+(cs[c.component_name]!=null?cs[c.component_name]:'—')+'</td>').join(''):'<td style="'+sty+'">'+(r.ca_score!=null?r.ca_score:'—')+'</td><td style="'+sty+'">'+(r.exam_score!=null?r.exam_score:'—')+'</td>';};

    // Shared CAE builder
    const buildCae=(labelBg,labelColor,divider)=>caeTraits.map(trait=>{
      const caeR=caeResults.find(c=>c.trait_id===trait.id);
      const rating=caeR?caeRatings.find(r=>r.id===caeR.rating_id):null;
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:1px 6px;border-bottom:1px solid ${divider};font-size:8px;">
        <span style="font-weight:600;color:#1a202c;">${trait.category}</span>
        <span style="font-weight:700;color:${rating?labelColor:"#94a3b8"};">${rating?`${rating.symbol||""} ${rating.label}`:"—"}</span>
      </div>`;
    }).join("");

    const ratingLegend=caeRatings.map(r=>`<span style="margin-right:8px;"><b>${r.symbol||r.label[0]}</b>=${r.label}</span>`).join("");
    const _gradeSchemaForKey=gradingSchema.length?gradingSchema:GRADES;
    const gradeKey=_gradeSchemaForKey.slice().reverse().map(g=>`<span style="margin-right:8px;"><b style="color:${gCol(g.grade)};">${g.grade}</b>=${g.remark}(${g.min_score??g.min}–${g.max_score??g.max})</span>`).join("");

    // ── REPORT CARD TEMPLATE ────────────────────────────────────────────────
    {
      const bdr="#c7d2de";
      // ── Spacing preset ─────────────────────────────────────────────────────
      const _sp=opts.card_spacing||"normal";
      const _spMult=_sp==="compact"?0.55:_sp==="spacious"?1.8:1.0;
      const sm=`${Math.round(5*_spMult)}px`;    // section gap (3/5/9px)
      const sm2=`${Math.round(3*_spMult)}px`;   // small gap  (2/3/5px)
      const rp=`${Math.round(3*_spMult)}px 4px`; // row cell pad (2/3/5px 4px)
      const sp6=`${Math.round(3*_spMult)}px 6px`; // subj cell pad
      const scSty=`padding:${rp};border:1px solid ${bdr};text-align:center;font-size:8.5px;color:#334155;`;
      const subjSty=`padding:${sp6};border:1px solid ${bdr};font-weight:600;font-size:8px;word-wrap:break-word;overflow-wrap:break-word;line-height:1.3;`;
      const rows=results.map((r,i)=>{const g=getGrade(r.total_score,gradingSchema);const rem=getRemark(r.total_score,gradingSchema);const rc=gCol(g);const cs=_parseCS(r);const scoreTds=_hasCC?_cc.map(c=>`<td style="${scSty}">${cs[c.component_name]!=null?cs[c.component_name]:"—"}</td>`).join(""):`<td style="${scSty}">${r.ca_score!=null?r.ca_score:"—"}</td><td style="${scSty}">${r.exam_score!=null?r.exam_score:"—"}</td>`;return`<tr style="background:${i%2===0?"#fff":"#f1f6fc"};"><td style="${subjSty}">${r.section_subjects?.name||"—"}</td>${scoreTds}<td style="padding:3px 4px;border:1px solid ${bdr};text-align:center;font-weight:800;font-size:9px;">${r.total_score??"—"}</td><td style="padding:3px 4px;border:1px solid ${bdr};text-align:center;font-weight:700;font-size:9px;color:${rc};">${g}</td><td style="padding:3px 5px;border:1px solid ${bdr};font-size:8px;color:${rc};font-weight:600;">${rem}</td></tr>`;}).join("");
      const perSubjMax=caMax+exMax;const maxScore=results.length*perSubjMax;
      const hSty=`text-align:center;padding:3px 2px;font-size:6.5px;font-weight:700;color:#fff;background:#111827;border:1px solid ${bdr};text-transform:uppercase;vertical-align:bottom;line-height:1.25;word-wrap:break-word;overflow-wrap:break-word;`;
      const _brk=(s)=>s.replace(/\s+/g,"<br>");
      const vScoreHdr=_hasCC?_cc.map(c=>`<th style="${hSty}">${_brk(c.component_name)}<br><span style="font-size:6px;opacity:.85;">(${c.value_or_formula})</span></th>`).join(""):`<th style="${hSty}">CA<br><span style="font-size:6px;opacity:.85;">(${caMax})</span></th><th style="${hSty}">EXAM<br><span style="font-size:6px;opacity:.85;">(${exMax})</span></th>`;
      const scoreColCount=_hasCC?_cc.length:2;
      const colgroup=`<colgroup><col style="width:auto;"/>${'<col style="width:38px;"/>'.repeat(scoreColCount)}<col style="width:36px;"/><col style="width:28px;"/><col style="width:58px;"/></colgroup>`;
      const watermark=logoSrc?`<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);opacity:0.04;pointer-events:none;z-index:0;"><img src="${logoSrc}" style="width:220px;height:220px;object-fit:contain;"/></div>`:`<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);opacity:0.04;pointer-events:none;z-index:0;font-size:110px;font-weight:900;color:#111827;font-family:Georgia,serif;">JD</div>`;
      return `<div class="report-card" style="font-family:${rcFontFamily};color:#1a202c;background:#fff;overflow:hidden;">
        <div style="height:5px;background:linear-gradient(90deg,#111827 30%,#1A8C3C 50%,#111827 70%);"></div>
        <div style="background:linear-gradient(135deg,#030712,#111827);color:#fff;padding:10px 16px;display:flex;align-items:center;gap:12px;">
          ${logoHtml}
          <div style="flex:1;text-align:center;">
            <div style="font-size:17px;font-weight:900;letter-spacing:1px;text-transform:uppercase;">${schoolName}</div>
            <div style="font-size:9px;color:#b3d4ff;font-style:italic;margin-top:2px;">${schoolAddress}</div>
            <div style="margin-top:5px;display:inline-block;background:rgba(232,86,10,.85);color:#fff;padding:3px 14px;border-radius:12px;font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">${cls?.sections?.name||"Member Report"}</div>
          </div>
          <div style="text-align:center;min-width:64px;flex-shrink:0;background:rgba(255,255,255,.1);border-radius:8px;padding:6px 8px;">
            <div style="font-size:26px;font-weight:900;color:#fff;line-height:1;">${overallG}</div>
            <div style="font-size:11px;font-weight:700;color:#b3d4ff;margin-top:2px;">${avg.toFixed(1)}%</div>
            <div style="font-size:8px;color:#fde68a;font-style:italic;margin-top:1px;">${overallR}</div>
          </div>
        </div>
        <div style="background:#1A8C3C;color:#fff;padding:3px 16px;text-align:center;font-size:9.5px;font-weight:700;letter-spacing:.5px;">${session?.name||""} ${(term?.name||"").toUpperCase()} FINAL REPORT</div>
        <div style="margin:${sm} 10px;border:1px solid ${bdr};font-size:8.5px;display:flex;background:#fafcff;">
          <div style="flex:1;border-right:1px solid ${bdr};">
            <div style="padding:3px 8px;border-bottom:1px solid #e8edf3;display:flex;justify-content:space-between;"><span style="color:#7a8ba3;">Id</span><b style="color:#111827;">${stu.student_id||stu.id||"—"}</b></div>
            <div style="padding:3px 8px;border-bottom:1px solid #e8edf3;display:flex;justify-content:space-between;"><span style="color:#7a8ba3;">Full Name</span><b style="font-size:9.5px;">${stuName}</b></div>
            <div style="padding:3px 8px;display:flex;justify-content:space-between;"><span style="color:#7a8ba3;">Sex</span><span>${stu.gender||"—"}</span></div>
          </div>
          <div style="flex:1;border-right:1px solid ${bdr};">
            <div style="padding:3px 8px;border-bottom:1px solid #e8edf3;display:flex;justify-content:space-between;"><span style="color:#7a8ba3;">Cycle / Period</span><b>${session?.name||""} / ${term?.name||""}</b></div>
            <div style="padding:3px 8px;border-bottom:1px solid #e8edf3;display:flex;justify-content:space-between;"><span style="color:#7a8ba3;">Group</span><b>${cls?.name||"—"}</b></div>
            <div style="padding:3px 8px;display:flex;justify-content:space-between;"><span style="color:#7a8ba3;">Issued</span><span>${today}</span></div>
          </div>
          <div style="flex:1;">
            <div style="padding:3px 8px;border-bottom:1px solid #e8edf3;display:flex;justify-content:space-between;"><span style="color:#7a8ba3;">Average</span><b style="font-size:11px;color:${gc};">${avg.toFixed(1)}</b></div>
            <div style="padding:3px 8px;border-bottom:1px solid #e8edf3;display:flex;justify-content:space-between;"><span style="color:#7a8ba3;">Grade</span><b style="color:${gc};font-size:11px;">${overallG}</b></div>
            <div style="padding:3px 8px;display:flex;justify-content:space-between;"><span style="color:#7a8ba3;">Remark</span><b style="color:${gc};">${overallR}</b></div>
          </div>
        </div>
        <div style="display:flex;gap:6px;margin:0 10px;">
          <div style="flex:1;min-width:0;position:relative;">
            <div style="background:#111827;color:#fff;text-align:center;padding:3px;font-weight:700;font-size:9px;letter-spacing:.5px;border:1px solid ${bdr};border-bottom:none;">Cognitive Domain</div>
            <div style="position:relative;">
              ${watermark}
              <table style="width:100%;border-collapse:collapse;table-layout:fixed;position:relative;z-index:1;">
                ${colgroup}
                <thead><tr><th style="padding:2px 5px;border:1px solid ${bdr};text-align:left;font-size:8px;color:#fff;background:#111827;font-weight:700;vertical-align:bottom;">Category</th>${vScoreHdr}<th style="${hSty}">TOTAL<br><span style="font-size:6px;opacity:.85;">(${perSubjMax})</span></th><th style="padding:2px 2px;border:1px solid ${bdr};text-align:center;font-size:8px;color:#fff;background:#111827;font-weight:700;width:28px;vertical-align:bottom;">Grade</th><th style="padding:2px 4px;border:1px solid ${bdr};text-align:left;font-size:8px;color:#fff;background:#111827;font-weight:700;vertical-align:bottom;">Remark</th></tr></thead>
                <tbody>${rows}</tbody>
              </table>
            </div>
          </div>
          <div style="width:105px;flex-shrink:0;border:1px solid ${bdr};text-align:center;display:flex;flex-direction:column;justify-content:center;padding:10px 5px;background:linear-gradient(180deg,#f0f6ff,#fff);">
            <div style="font-size:8px;color:#7a8ba3;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Total Score</div>
            <div style="font-size:20px;font-weight:900;color:#111827;margin-top:3px;">${totalScore}<span style="font-size:11px;color:#94a3b8;"> / ${maxScore}</span></div>
            <div style="border-top:2px solid #1A8C3C;margin:8px 12px;"></div>
            <div style="font-size:15px;font-weight:900;color:${gc};">${avg.toFixed(1)}%</div>
            <div style="font-size:11px;font-weight:800;color:${gc};margin-top:2px;">${overallG}</div>
            <div style="font-size:9px;color:#64748b;font-weight:600;margin-top:1px;">${overallR}</div>
          </div>
        </div>
        <div style="margin:${sm} 10px;border:1px solid ${bdr};background:#fafcff;">
          <div style="text-align:center;padding:3px;font-weight:700;font-size:8.5px;color:#fff;background:#111827;letter-spacing:.5px;">Cognitive Grade Keys</div>
          <div style="padding:3px 8px;font-size:8px;color:#475569;">${gradeKey}</div>
        </div>
        ${opts.show_cae&&caeTraits.length?`<div style="margin:0 10px ${sm};border:1px solid ${bdr};"><div style="text-align:center;padding:3px;font-weight:700;font-size:8.5px;color:#fff;background:#1A8C3C;letter-spacing:.5px;">Affective Domain</div><div style="display:flex;flex-wrap:wrap;">${caeTraits.map(trait=>{const caeR=caeResults.find(c=>c.trait_id===trait.id);const rating=caeR?caeRatings.find(r=>r.id===caeR.rating_id):null;return`<div style="width:50%;padding:2px 8px;font-size:8px;display:flex;justify-content:space-between;border-bottom:1px solid #e8edf3;"><span style="font-weight:600;">${trait.category}</span><span style="font-weight:700;color:${rating?"#1A8C3C":"#94a3b8"};">${rating?(rating.symbol||"")+" "+rating.label:"—"}</span></div>`;}).join("")}</div><div style="padding:2px 8px;font-size:7.5px;color:#64748b;border-top:1px solid #e2e8f0;"><b>Scale:</b> ${ratingLegend}</div></div>`:""}
        <div style="margin:${sm} 10px;border-top:1px solid ${bdr};padding-top:${sm};font-size:8px;">
          ${opts.show_teacher_comment&&classTeacherComment?`
          <div style="margin-bottom:${sm};">
            <div style="font-weight:700;color:#111827;font-size:9px;">${classTeacherTitle}</div>
            <div style="font-style:italic;font-size:8px;color:#475569;margin-top:2px;">${classTeacherComment}</div>
          </div>`:""}
          ${opts.show_principal_comment&&principalComment?`
          <div style="margin-bottom:${sm};">
            <div style="font-weight:700;color:#111827;font-size:9px;">${principalTitle}</div>
            <div style="font-style:italic;font-size:8px;color:#475569;margin-top:2px;">${principalComment}</div>
          </div>`:""}
          ${settings._formTeacherName?`<div style="margin-bottom:8px;font-size:8.5px;border-top:1px solid ${bdr};padding-top:6px;"><span style="color:#7a8ba3;font-weight:600;">Form Staff: </span><b style="color:#111827;">${settings._formTeacherName}</b></div>`:''}
          <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:10px;">
            <div>
              <div style="font-weight:700;color:#111827;font-size:9px;margin-bottom:6px;">${principalTitle}</div>
              <div style="position:relative;display:inline-block;min-width:160px;height:72px;margin-bottom:2px;">
                ${principalSigUrl
                  ?`<img src="${principalSigUrl}" style="height:40px;max-width:150px;object-fit:contain;display:block;position:absolute;bottom:0;left:0;"/>`
                  :`<div style="width:150px;border-bottom:1.5px solid #111827;position:absolute;bottom:0;left:0;"></div>`}
                ${principalStampUrl?`<img src="${principalStampUrl}" style="position:absolute;left:0;top:50%;transform:translateY(-50%);height:72px;width:72px;object-fit:contain;opacity:0.82;mix-blend-mode:multiply;"/>`:``}
              </div>
              <div style="font-size:7.5px;color:#94a3b8;">Signature &amp; Stamp</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:7.5px;color:#94a3b8;margin-bottom:2px;">Date of Issue</div>
              <div style="font-size:9px;font-weight:700;color:#111827;">${today}</div>
            </div>
          </div>
        </div>
        ${opts.show_next_term?`<div style="margin:${sm2} 10px ${sm2};font-size:8.5px;display:flex;gap:24px;"><span><b style="color:#1A8C3C;">Closing Date:</b> ${termClosingDate}</span><span><b style="color:#1A8C3C;">Resumption Date:</b> ${ntbStr!=="—"?ntbStr:termOpeningDate}</span></div>`:""}
        <div style="margin-top:4px;padding:4px 10px;background:linear-gradient(135deg,#030712,#111827);color:#b3d4ff;font-size:8px;text-align:center;">${footerText} · ${schoolName} · <b style="color:#fff;">${schoolMotto}</b></div>
        <div style="height:4px;background:linear-gradient(90deg,#111827,#1A8C3C,#111827);"></div>
      </div>`;
    }

  }).join("");

  const rcFilename=pdfName(students.length===1?`${students[0].first_name||""} ${students[0].last_name||""}`.trim():cls?.name||"GROUP","REPORT",term?.name||"",session?.name||"");

  const fullHtml=`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="${forStorage?'width=device-width,initial-scale=1.0,user-scalable=no':'width=595,initial-scale=1.0,maximum-scale=1.0'}"/>
  <title>${rcFilename}</title>
  <script>document.title=${JSON.stringify(rcFilename)}</script>
  ${forStorage?`<script>
  (function(){
    function scaleCards(){
      var vw=window.innerWidth||document.documentElement.clientWidth||595;
      var CARD=571,PAD=24;
      var avail=vw-PAD;
      var z=avail<CARD?+(avail/CARD).toFixed(4):1;
      var cards=document.querySelectorAll('.report-card');
      cards.forEach(function(c){c.style.zoom=z;});
      document.body.style.padding=z<1?'6px':'12px';
    }
    if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',scaleCards);}
    else{scaleCards();}
    window.addEventListener('resize',scaleCards);
  })();
  </script>`:''}
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    ${forStorage?`
    /* ── STORAGE / EMAIL / DOWNLOAD VIEW ── mirrors the @media print styles so
       the card captures identically to Chrome's "Save as PDF" output (blue
       border, padding, centered layout). */
    *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}
    html{
      width:100%!important;
      height:auto!important;overflow-x:hidden!important;
      background:#f4f5f7!important;margin:0!important;padding:0!important;
    }
    body{
      width:100%!important;
      height:auto!important;
      background:#f4f5f7!important;
      margin:0 auto!important;
      padding:12px 16px!important;
      font-family:${rcFontFamily};
      box-sizing:border-box!important;
      display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;
    }
    .report-card{
      width:100%!important;max-width:100%!important;
      margin:0 auto 12px auto!important;
      box-shadow:none!important;
      border:2px solid #111827!important;
      border-radius:8px!important;
      overflow:hidden!important;
      page-break-after:always;break-after:always;
      page-break-inside:avoid!important;break-inside:avoid!important;
    }
    .report-card:last-child{margin-bottom:0!important;page-break-after:avoid!important;break-after:avoid!important;}
    table{width:100%!important;table-layout:fixed;}
    .no-print{display:none!important;}
    @page{size:A4 portrait;margin:0;}
    `:`
    /* ── PORTAL / DOWNLOAD VIEW ── */
    *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;box-sizing:border-box;}
    html{
      width:595px!important;min-width:595px!important;max-width:595px!important;
      height:auto!important;overflow:visible!important;
      background:#e5e7eb!important;margin:0!important;padding:0!important;
    }
    body{
      width:595px!important;min-width:595px!important;max-width:595px!important;
      height:auto!important;overflow:visible!important;
      background:#e5e7eb!important;
      margin:0 auto!important;
      padding:16px!important;
      font-family:${rcFontFamily};
    }
    .report-card{
      width:563px!important;max-width:563px!important;
      margin:0 auto 12px auto!important;
      box-shadow:0 4px 16px rgba(0,0,0,.15)!important;
      overflow:hidden!important;
      border-radius:6px!important;
      zoom:${rcFontScale};
    }
    .report-card:last-child{margin-bottom:0!important;}
    table{width:100%!important;table-layout:fixed;}
    @page{size:A4 portrait;margin:0;}
    @media print{
      .no-print{display:none!important;position:absolute!important;width:0!important;height:0!important;overflow:hidden!important;}
      html,body{
        width:100%!important;min-width:100%!important;max-width:100%!important;
        background:#f4f5f7!important;margin:0!important;padding:0!important;
      }
      body{display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;padding:12px 16px!important;}
      .report-card{
        width:100%!important;max-width:100%!important;
        margin:0 auto!important;
        box-shadow:none!important;
        border:2px solid #111827!important;
        border-radius:8px!important;
        overflow:hidden!important;
        page-break-after:always;break-after:always;
        page-break-inside:avoid!important;break-inside:avoid!important;
      }
      .report-card:last-child{page-break-after:avoid!important;break-after:avoid!important;}
    }
    `}
  </style>
  <script>
    window.addEventListener('beforeprint',function(){
      var cards=document.querySelectorAll('.report-card');
      cards.forEach(function(c){
        c.style.zoom='1';
        c.style.width='100%';
        var ch=c.scrollHeight;
        var pageH=842;
        var avail=pageH-16;
        if(ch>0){
          var z;
          if(ch>avail){
            // shrink to fit — always ensure one page
            z=avail/ch;
            z=Math.max(z,0.4);
          } else {
            // scale up to fill nicely
            z=Math.min((avail/ch)*1.05,1.6);
          }
          var w=Math.floor(100/z);
          c.style.width=w+'%';
          c.style.margin='0 auto';
          c.style.zoom=z;
        }
      });
    });
    window.addEventListener('afterprint',function(){
      var cards=document.querySelectorAll('.report-card');
      cards.forEach(function(c){c.style.zoom='1';c.style.width='100%';c.style.margin='';});
    });
  </script>
</head>
<body>
  <div style="width:100%;margin:0;overflow:visible;background:transparent;">
    ${forStorage?'':`<div class="no-print" style="position:fixed;top:16px;right:16px;z-index:999;display:flex;gap:10px;">
      <button onclick="document.querySelectorAll('.no-print').forEach(function(e){e.style.display='none'});window.print();document.querySelectorAll('.no-print').forEach(function(e){e.style.display=''})" style="padding:10px 24px;background:#111827;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.2);">🖨️ Print / Save PDF</button>
      <button onclick="window.close()" style="padding:10px 16px;background:#fff;color:#64748b;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;cursor:pointer;">✕ Close</button>
    </div>
    <div class="no-print" style="text-align:center;padding:16px 0;color:#64748b;font-size:13px;font-family:sans-serif;">
      💡 Click <b>Print / Save PDF</b> → choose <b>Save as PDF</b>, set <b>Margins: None</b> for best results
    </div>`}
    ${cardHtml}
  </div>
</body>
</html>`;
  if(htmlOnly)return fullHtml;
  if(showPDF){openHtmlDoc(fullHtml,{title:rcFilename,showPDF});return;}
  const w=window.open("","_blank");
  if(!w){alert("Please allow popups to generate PDFs.");return;}
  w.document.write(fullHtml);
  w.document.close();
  try{w.document.title=rcFilename;}catch(_){}
  try{w.history.replaceState({},"","/"+encodeURIComponent(rcFilename));}catch(_){}
  w.focus();
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
  const recipientId=user?.role==="admin"?"admin":(user?.role==="teacher"?user.teacher_db_id:user?.student_id)||user?.id;

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
      <button onClick={()=>{setOpen(p=>!p);if(!open)load();}}
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

// ─── ACADEMIC CALENDAR PAGE ───────────────────────────────────────────────────
const CAL_TYPES=[
  {id:"resumption", label:"Resumption",   color:"#10B981"},
  {id:"mid_term",   label:"Mid-Period",     color:"#F59E0B"},
  {id:"exam",       label:"Exams",        color:"#6366F1"},
  {id:"vacation",   label:"Vacation",     color:"#EF4444"},
  {id:"holiday",    label:"Public Holiday",color:"#EC4899"},
  {id:"event",      label:"Organization Event", color:"#0891B2"},
  {id:"other",      label:"Other",        color:"#94A3B8"},
];
const MONTHS=["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function CalEventRow({ev,typeMap,isAdmin,onEdit,onDelete}){
  const t=typeMap[ev.event_type]||typeMap.other;
  const start=new Date(ev.start_date+"T00:00:00");
  const end=ev.end_date?new Date(ev.end_date+"T00:00:00"):null;
  const fmt=d=>d.toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"});
  const today=new Date().toISOString().slice(0,10);
  const isPast=(ev.end_date||ev.start_date)<today;
  return(
    <div style={{display:"flex",alignItems:"center",gap:12,padding:"11px 16px",
      background:C.white,border:`1.5px solid ${C.border}`,borderRadius:10,marginBottom:6,
      opacity:isPast?.65:1}}>
      <div style={{width:10,borderRadius:5,alignSelf:"stretch",background:t.color,flexShrink:0}}/>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontWeight:800,fontSize:13,color:C.text}}>{ev.title}</div>
        <div style={{display:"flex",gap:8,alignItems:"center",marginTop:3,flexWrap:"wrap"}}>
          <span style={{background:t.color+"18",color:t.color,border:`1px solid ${t.color}30`,
            borderRadius:6,padding:"1px 7px",fontSize:10,fontWeight:700}}>{t.label}</span>
          <span style={{fontSize:11,color:C.muted}}>{fmt(start)}{end&&end.getTime()!==start.getTime()?` – ${fmt(end)}`:""}</span>
          {ev.description&&<span style={{fontSize:11,color:C.light,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:200}}>{ev.description}</span>}
        </div>
      </div>
      {isAdmin&&(
        <div style={{display:"flex",gap:6,flexShrink:0}}>
          <button onClick={()=>onEdit(ev)} style={{padding:"4px 8px",borderRadius:6,border:`1px solid ${C.border}`,
            background:C.white,color:C.muted,fontSize:11,cursor:"pointer",display:"flex",alignItems:"center",gap:3}}>
            <Pencil size={11}/>Edit
          </button>
        </div>
      )}
    </div>
  );
}

// ─── TIMETABLE PAGE ───────────────────────────────────────────────────────────
const WEEK_DAYS=[{d:1,l:"Monday"},{d:2,l:"Tuesday"},{d:3,l:"Wednesday"},{d:4,l:"Thursday"},{d:5,l:"Friday"}];

// ─── DATA EXPORT PAGE ─────────────────────────────────────────────────────────

// ─── ACTIVITY ANALYTICS PAGE ──────────────────────────────────────────────────

// ─── BROADSHEET ───────────────────────────────────────────────────────────────
// Builds the full HTML for PDF print/save. Called by BroadsheetPage.exportPDF.


// ─── AUDIT LOG PAGE ───────────────────────────────────────────────────────────

// ─── BULK PROMOTION PAGE ──────────────────────────────────────────────────────
