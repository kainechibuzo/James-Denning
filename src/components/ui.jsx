/**
 * Shared UI Primitives
 *
 * Exports all reusable presentational components used across the portal:
 * ErrorBoundary, DangerBtn, Logo, Card, Btn, Badge, Inp, Sel, Modal,
 * Toast, StatCard, Th, TRow, ClassMultiSelect, Spinner, PDFViewer,
 * SectionSelector, ICON_MAP, AppIcon, ActionsMenu, SectionPillTabs,
 * PageHeader, EmptyState.
 *
 * C is imported as a live ES-module binding from config/theme.js —
 * it always reflects the current palette because setTheme() is called
 * by DarkProvider on every toggle.
 */

import React, { useState, useEffect, useContext, useRef, Component } from "react";
import ReactDOM from "react-dom";
import {
  LayoutDashboard, Users, GraduationCap, BookUser, School, BookOpen, Layers,
  Link2, BarChart3, FileText, ScrollText, ShieldCheck, Settings2, ListChecks,
  Tag, FileStack, Zap, CreditCard, TrendingUp, Megaphone, ClipboardCheck,
  Mail, Inbox, ArrowUpCircle, History, CheckCircle2, UserPlus, Upload,
  Wallet, Settings, ReceiptText, Bell, Plus, Pencil, Trash2, Eye, EyeOff,
  Download, Send, Search, Filter, RefreshCw, X, Check, AlertTriangle, Info,
  LogOut, UserCircle, ChevronDown, Calendar, Clock, Star, Home, Menu,
  Lock, Unlock, Shield, Key, Globe, Phone, MapPin, Building2, Image,
  File, Folder, Archive, Database, Activity, PieChart, BarChart2,
  TrendingDown, Banknote, Receipt, PiggyBank, Calculator, ListOrdered,
  BookMarked, FlaskConical, Award, ClipboardList, UserCheck, UserX,
  Table, TableProperties, CheckCircle, Share2, Printer, Save, Copy,
  AlignLeft, AlignCenter, Target, Compass, Package, Store, Building,
  PenLine, Type, List, LayoutGrid, Sidebar, Move, Maximize2, Minimize2,
  SquarePlus, SquareMinus, SquareCheck, PlusCircle, MinusCircle, XCircle,
  AlertCircle, Loader2, WifiOff, Wifi, ArrowRight, ArrowLeft, KeyRound,
  MapPin as MapPinIcon, ExternalLink, MoreHorizontal,
} from "lucide-react";

import { C, LIGHT, DARK } from "../config/theme.js";
import { useIsMobile }    from "../utils/hooks.js";
import { useSection }     from "../contexts/section.jsx";
import { useConfirm }     from "../contexts/confirm.jsx";
import { isNative }       from "../utils/platform.js";
import { PRODUCT }         from "../config/product.js";

// ── Error Boundary ─────────────────────────────────────────────────────────────
export class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError:false, error:null, info:null }; }
  static getDerivedStateFromError(error) { return { hasError:true, error }; }
  componentDidCatch(error, info) { console.error("JAMES-DENNING Error:", error, info); this.setState({ info }); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center",
          background:"linear-gradient(135deg,#0d2d6e,#1A4FA0)", fontFamily:"'Segoe UI',system-ui,sans-serif", padding:24 }}>
          <div style={{ background:"#fff", borderRadius:20, padding:"38px 32px", maxWidth:500, width:"100%",
            boxShadow:"0 24px 60px rgba(0,0,0,.35)", textAlign:"center" }}>
            <div style={{ marginBottom:14 }}><Shield size={52} color={C.blue}/></div>
            <div style={{ fontSize:21, fontWeight:900, color:"#dc2626", marginBottom:8 }}>Something went wrong</div>
            <div style={{ fontSize:13, color:"#6b7280", lineHeight:1.7, marginBottom:6 }}>
              The portal hit an unexpected error. Your data is safe — this is a display issue only.
            </div>
            <div style={{ fontSize:12, color:"#94a3b8", lineHeight:1.6, marginBottom:20 }}>
              Click <b>Try Again</b> to dismiss, or <b>Reload</b> if the issue persists.
            </div>
            {this.state.error?.message && (
              <details style={{ textAlign:"left", marginBottom:20 }}>
                <summary style={{ cursor:"pointer", fontSize:12, color:"#6b7280", fontWeight:600, userSelect:"none" }}>
                  Technical details
                </summary>
                <pre style={{ background:"#fef2f2", borderRadius:8, padding:"10px 12px", fontSize:11,
                  color:"#dc2626", overflow:"auto", maxHeight:120, marginTop:6, border:"1px solid #fca5a5",
                  whiteSpace:"pre-wrap", wordBreak:"break-word" }}>
                  {this.state.error.message}
                </pre>
              </details>
            )}
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={() => this.setState({ hasError:false, error:null, info:null })}
                style={{ flex:1, background:"#fff", color:"#1A4FA0", border:"2px solid #1A4FA0",
                  padding:"12px", borderRadius:10, fontWeight:700, fontSize:13, cursor:"pointer" }}>
                ↩ Try Again
              </button>
              <button onClick={() => window.location.reload()}
                style={{ flex:1, background:"#1A4FA0", color:"#fff", border:"none", padding:"12px",
                  borderRadius:10, fontWeight:800, fontSize:13, cursor:"pointer",
                  boxShadow:"0 4px 14px rgba(26,79,160,.4)" }}>
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

// ── Danger Button ──────────────────────────────────────────────────────────────
export function DangerBtn({ label, icon, typePhrase, onClick }) {
  const confirm = useConfirm();
  const handle = async () => {
    const ok = await confirm({
      title: `${label}`,
      message: "This action is IRREVERSIBLE and will permanently delete all records. Type the phrase below to confirm.",
      icon: null, confirmLabel: label, danger: true, typeToConfirm: typePhrase,
    });
    if (ok) onClick();
  };
  return (
    <button onClick={handle}
      style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 14px",
        border:`1px solid ${C.red}40`, background:C.redPale,
        color:C.red, borderRadius:8, cursor:"pointer", fontSize:12, fontWeight:700 }}>
      {icon} {label}
    </button>
  );
}

// ── Logo ───────────────────────────────────────────────────────────────────────
export function Logo({ size = 44 }) {
  const ctx  = useSection();
  const logo = ctx?.schoolLogo;
  if (logo) {
    return <img src={logo} alt="Organization logo" style={{ width:size, height:size, objectFit:"contain", borderRadius:size*0.18, background:"transparent" }}/>;
  }
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label={PRODUCT.name}>
      <rect width="48" height="48" rx="13" fill={C.text}/>
      <path d="M13 13h5v22h-5zM18 13h7.5c5.5 0 8.5 2.7 8.5 7.1 0 2.7-1.4 4.8-3.9 5.9L35 35h-6.2l-5.1-7.5H18V35h-5V13h5Zm0 9.8h7c2.4 0 3.7-.9 3.7-2.7s-1.3-2.7-3.7-2.7h-7v5.4Z" fill="#fff"/>
      <path d="M37 11.5h2v25h-2z" fill={C.light}/>
    </svg>
  );
}

// ── Card ───────────────────────────────────────────────────────────────────────
export function Card({ children, style = {}, onClick }) {
  const [h, setH] = useState(false);
  return (
    <div onClick={onClick}
      onMouseEnter={() => onClick && setH(true)}
      onMouseLeave={() => setH(false)}
      style={{ background:C.white, borderRadius:20, padding:22,
        boxShadow:h ? C.shadowMd : C.cardGlow,
        border:`1px solid ${h && onClick ? C.blue+"28" : C.border}`,
        cursor:onClick ? "pointer" : "default",
        transform:h && onClick ? "translateY(-2px)" : "none",
        transition:"all .2s ease", ...style }}>
      {children}
    </div>
  );
}

// ── Button ─────────────────────────────────────────────────────────────────────
export function Btn({ children, onClick, color, outline = false, sm = false, xs = false, disabled = false, style = {} }) {
  const [h, setH] = useState(false);
  const btnColor = color || C.blue;
  const p   = xs ? "4px 10px" : sm ? "7px 14px" : "10px 20px";
  const fs  = xs ? 11 : sm ? 12 : 13;
  const rad = xs ? 6 : sm ? 8 : 9;
  return (
    <button onClick={onClick} disabled={disabled}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        background: outline ? "transparent" : disabled ? "#CBD5E1" : h
          ? `linear-gradient(135deg,${btnColor}ee,${btnColor}bb)`
          : `linear-gradient(135deg,${btnColor},${btnColor}cc)`,
        color: outline ? (disabled ? C.light : btnColor) : "#fff",
        border: outline ? `1.5px solid ${disabled ? C.border : btnColor}` : "none",
        padding:p, borderRadius:rad, cursor:disabled ? "not-allowed" : "pointer",
        fontSize:fs, fontWeight:700, display:"inline-flex", alignItems:"center", gap:5,
        whiteSpace:"nowrap", transition:"all .15s ease", opacity:disabled ? .55 : 1,
        boxShadow: (!outline && !disabled && h) ? `0 4px 12px ${btnColor}40` : "none",
        transform: (!disabled && h) ? "translateY(-1px)" : "none",
        letterSpacing:".01em", ...style,
      }}>
      {children}
    </button>
  );
}

// ── Badge ──────────────────────────────────────────────────────────────────────
export function Badge({ children, color, style = {} }) {
  const badgeColor = color || C.blue;
  return (
    <span style={{ background:badgeColor+"15", color:badgeColor, padding:"3px 10px", borderRadius:20,
      fontSize:11, fontWeight:700, border:`1px solid ${badgeColor}25`, whiteSpace:"nowrap",
      letterSpacing:".02em", ...style }}>
      {children}
    </span>
  );
}

// ── Input ──────────────────────────────────────────────────────────────────────
export function Inp({ label, value, onChange, type = "text", placeholder = "", disabled = false, required = false, style = {} }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ marginBottom:14 }}>
      {label && (
        <label style={{ display:"block", fontSize:11, fontWeight:700,
          color:focused ? C.accent2 : C.muted, textTransform:"uppercase",
          letterSpacing:.6, marginBottom:5, transition:"color .15s" }}>
          {label}{required && <span style={{ color:C.red }}> *</span>}
        </label>
      )}
      <input type={type} value={value ?? ""} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} disabled={disabled}
        onFocus={e => { setFocused(true); e.target.style.borderColor=C.accent2; e.target.style.boxShadow=C.ring; }}
        onBlur={e  => { setFocused(false); e.target.style.borderColor=C.border; e.target.style.boxShadow="none"; }}
        style={{ display:"block", width:"100%", padding:"10px 13px",
          border:`1.5px solid ${focused ? C.blue : C.border}`,
          borderRadius:11, fontSize:13, background:disabled ? C.offWhite : C.white,
          color:C.text, transition:"border-color .15s,box-shadow .15s", outline:"none",
          boxSizing:"border-box", ...style }}/>
    </div>
  );
}

// ── Select ─────────────────────────────────────────────────────────────────────
export function Sel({ label, value, onChange, options = [], disabled = false }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ marginBottom:14 }}>
      {label && (
        <label style={{ display:"block", fontSize:11, fontWeight:700,
          color:focused ? C.accent2 : C.muted, textTransform:"uppercase",
          letterSpacing:.6, marginBottom:5, transition:"color .15s" }}>
          {label}
        </label>
      )}
      <select value={value ?? ""} onChange={e => onChange(e.target.value)} disabled={disabled}
        onFocus={e => { setFocused(true); e.target.style.borderColor=C.accent2; e.target.style.boxShadow=C.ring; }}
        onBlur={e  => { setFocused(false); e.target.style.borderColor=C.border; e.target.style.boxShadow="none"; }}
        style={{ display:"block", width:"100%", padding:"10px 13px",
          border:`1.5px solid ${focused ? C.blue : C.border}`,
          borderRadius:9, fontSize:13, background:disabled ? C.offWhite : C.white, color:C.text,
          cursor:disabled ? "not-allowed" : "pointer", outline:"none", transition:"all .15s",
          boxSizing:"border-box" }}>
        {options.map(o => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
      </select>
    </div>
  );
}

// ── Modal ──────────────────────────────────────────────────────────────────────
export function Modal({ title, children, onClose, width = 520 }) {
  const isMobile = useIsMobile();
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(2,6,23,.6)", backdropFilter:"blur(6px)",
      display:"flex",
      alignItems: isMobile ? "flex-end" : "flex-start",
      justifyContent:"center",
      zIndex:800, padding:isMobile ? "0" : "28px 16px", overflowY:isMobile ? "hidden" : "auto" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background:C.white,
        borderRadius: isMobile ? "20px 20px 0 0" : "20px",
        width:"100%", maxWidth: isMobile ? "100%" : width,
        maxHeight: isMobile ? "92vh" : "none",
        display:"flex", flexDirection:"column",
        boxShadow:C.shadowXl,
        animation: isMobile ? "sheetUp .28s cubic-bezier(.34,1.3,.64,1)" : "modalUp .22s cubic-bezier(.34,1.56,.64,1)",
        transition:"background .2s" }}>
        <div style={{ background:`linear-gradient(135deg,${C.blue} 0%,${C.blueDark} 100%)`,
          borderRadius: isMobile ? "20px 20px 0 0" : "20px 20px 0 0",
          padding:"16px 22px", flexShrink:0,
          display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          {isMobile && <div style={{ width:36, height:4, borderRadius:2,
            background:"rgba(255,255,255,.3)", margin:"0 auto 0 0", flexShrink:0 }}/>}
          <span style={{ color:"#fff", fontWeight:800, fontSize:15, letterSpacing:".01em", flex:1,
            textAlign: isMobile ? "center" : "left" }}>{title}</span>
          <button onClick={onClose}
            style={{ background:"rgba(255,255,255,.15)", color:"rgba(255,255,255,.9)",
              border:"1px solid rgba(255,255,255,.2)", width:30, height:30, borderRadius:"50%",
              cursor:"pointer", fontSize:14, display:"flex", alignItems:"center",
              justifyContent:"center", transition:"background .15s", flexShrink:0 }}
            onMouseEnter={e => e.target.style.background="rgba(255,255,255,.28)"}
            onMouseLeave={e => e.target.style.background="rgba(255,255,255,.15)"}>
            ✕
          </button>
        </div>
        <div style={{ padding: isMobile ? "20px 16px 32px" : 24, overflowY:"auto" }}>{children}</div>
      </div>
    </div>
  );
}

// ── Toast ──────────────────────────────────────────────────────────────────────
export function Toast({ t, rm }) {
  const msg    = t?.msg  || "";
  const type   = t?.type || "success";
  const onClose = () => rm(t?.id);
  useEffect(() => { const tid = setTimeout(onClose, 4000); return () => clearTimeout(tid); }, []);
  const configs = {
    success: { bg:`linear-gradient(135deg,${LIGHT.green},#16A34A)`,  icon:"check",   bdr:LIGHT.green },
    error:   { bg:"linear-gradient(135deg,#DC2626,#B91C1C)",          icon:"close",   bdr:"#DC2626"   },
    warn:    { bg:"linear-gradient(135deg,#D97706,#B45309)",          icon:"warning", bdr:"#D97706"   },
  };
  const cfg = configs[type] || configs.success;
  return (
    <div style={{ background:cfg.bg, color:"#fff", padding:"12px 16px", borderRadius:12,
      fontWeight:600, fontSize:13, boxShadow:`0 8px 24px ${cfg.bdr}40`,
      display:"flex", alignItems:"center", gap:10, minWidth:240, maxWidth:360,
      animation:"slideInRight .28s cubic-bezier(.34,1.56,.64,1)",
      border:`1px solid ${cfg.bdr}80` }}>
      <div style={{ width:22, height:22, borderRadius:"50%", background:"rgba(255,255,255,.2)",
        display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
        <AppIcon name={cfg.icon} size={13} color="#fff"/>
      </div>
      <span style={{ flex:1, lineHeight:1.4 }}>{msg}</span>
      <button onClick={onClose}
        style={{ background:"rgba(255,255,255,.15)", border:"none", color:"#fff",
          cursor:"pointer", width:22, height:22, borderRadius:"50%", fontSize:12,
          display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
        ✕
      </button>
    </div>
  );
}

// ── Stat Card ──────────────────────────────────────────────────────────────────
export function StatCard({ label, value, icon, color, sub, valueSize = 28 }) {
  const [h, setH] = useState(false);
  const [displayed, setDisplayed] = useState(0);
  const cardColor = color || C.blue;
  const isNum = typeof value === "number" && isFinite(value);

  useEffect(() => {
    if (!isNum) return;
    const duration = 650;
    const start = Date.now();
    const tick = setInterval(() => {
      const t = Math.min((Date.now() - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayed(Math.round(value * eased));
      if (t >= 1) clearInterval(tick);
    }, 16);
    return () => clearInterval(tick);
  }, [value]);

  const displayValue = isNum ? displayed : value;

  return (
    <div onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ background:C.white, borderRadius:18, padding:"18px 20px",
        boxShadow:h ? C.shadowMd : C.shadow, border:`1px solid ${h ? cardColor+"30" : C.border}`,
        position:"relative", overflow:"hidden", minWidth:0,
        transform:h ? "translateY(-2px)" : "none", transition:"all .2s ease" }}>
      <div style={{ position:"absolute", top:0, left:0, right:0, height:3,
        background:`linear-gradient(90deg,${cardColor},${cardColor}88)` }}/>
      <div style={{ position:"absolute", bottom:-16, right:-16, width:80, height:80,
        borderRadius:"50%", background:cardColor+"08", transition:"transform .3s",
        transform:h ? "scale(1.2)" : "scale(1)" }}/>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
        <div style={{ minWidth:0, overflow:"hidden" }}>
          <div style={{ fontSize:10.5, fontWeight:700, color:C.muted, textTransform:"uppercase",
            letterSpacing:.9, marginBottom:8 }}>{label}</div>
          <div style={{ fontSize:valueSize, fontWeight:900, color:C.text, lineHeight:1, marginBottom:sub?4:0,
            whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{displayValue}</div>
          {sub && <div style={{ fontSize:11.5, color:C.muted, marginTop:3 }}>{sub}</div>}
        </div>
        <div style={{ width:46, height:46, borderRadius:13,
          background:`linear-gradient(135deg,${cardColor}22,${cardColor}10)`,
          border:`1.5px solid ${cardColor}20`,
          display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0,
          boxShadow:`0 4px 12px ${cardColor}20`, transition:"all .2s",
          transform:h ? "scale(1.08)" : "scale(1)" }}>
          {icon}
        </div>
      </div>
    </div>
  );
}

// ── Table Header ───────────────────────────────────────────────────────────────
// Pass `sticky` to keep the header pinned while a long table scrolls.
export function Th({ cols, sticky = false }) {
  const stickyStyle = sticky
    ? { position:"sticky", top:0, zIndex:2, boxShadow:`0 1px 0 ${C.border}` }
    : {};
  return (
    <thead>
      <tr style={{ background:C.offWhite, borderBottom:`1.5px solid ${C.border}` }}>
        {cols.map((c, i) => (
          <th key={i} style={{ padding:"10px 14px", color:C.muted,
            textAlign:"left", fontWeight:700, fontSize:10.5, whiteSpace:"nowrap",
            textTransform:"uppercase", letterSpacing:.8, background:C.offWhite, ...stickyStyle }}>{c}</th>
        ))}
      </tr>
    </thead>
  );
}

// ── Table Row ──────────────────────────────────────────────────────────────────
export function TRow({ cells, i, onClick }) {
  const [h, setH] = useState(false);
  return (
    <tr onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      onClick={onClick}
      style={{ background:h ? C.bluePale : i%2===0 ? C.white : C.offWhite,
        borderBottom:`1px solid ${C.border}`, transition:"background .1s",
        cursor: onClick ? "pointer" : "default" }}>
      {cells.map((c, j) => <td key={j} style={{ padding:"10px 14px", verticalAlign:"middle", fontSize:13 }}>{c}</td>)}
    </tr>
  );
}

// ── Group Multi-Select Dropdown ────────────────────────────────────────────────
export function ClassMultiSelect({ classes, selClasses, onToggle, onClear, placeholder = "All Groups" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  const count = selClasses.size;
  const label = count === 0 ? placeholder : count === 1
    ? (classes.find(c => selClasses.has(String(c.id)))?.name || "1 group selected")
    : `${count} classes selected`;
  return (
    <div ref={ref} style={{ position:"relative", flex:1, minWidth:150 }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ width:"100%", padding:"9px 10px", border:`2px solid ${count>0 ? C.orange : C.border}`,
          borderRadius:8, fontSize:13, background:count>0 ? C.orangePale : C.white, color:C.text,
          fontWeight:count>0 ? 700 : 400, cursor:"pointer", display:"flex", justifyContent:"space-between",
          alignItems:"center", gap:6, textAlign:"left" }}>
        <span style={{ flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{label}</span>
        <span style={{ fontSize:10, opacity:.6, flexShrink:0 }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{ position:"absolute", top:"calc(100% + 4px)", left:0, right:0, zIndex:999,
          background:C.white, border:`2px solid ${C.border}`, borderRadius:10,
          boxShadow:"0 8px 24px rgba(0,0,0,.12)", maxHeight:280, overflowY:"auto" }}>
          <div onClick={() => { onClear(); }}
            style={{ padding:"9px 14px", cursor:"pointer", fontWeight:700, fontSize:13,
              color:count===0 ? C.orange : C.text,
              background:count===0 ? C.orangePale : "transparent",
              borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", gap:8 }}
            onMouseEnter={e => e.currentTarget.style.background = count===0 ? C.orangePale : C.offWhite}
            onMouseLeave={e => e.currentTarget.style.background = count===0 ? C.orangePale : "transparent"}>
            <span style={{ width:16, height:16, borderRadius:4, display:"inline-flex", alignItems:"center",
              justifyContent:"center", fontSize:11,
              background:count===0 ? C.orange : "transparent",
              border:`2px solid ${count===0 ? C.orange : C.border}`, color:"#fff", flexShrink:0 }}>
              {count===0 ? "✓" : ""}
            </span>
            All Groups
          </div>
          {classes.map(c => {
            const sid     = String(c.id);
            const checked = selClasses.has(sid);
            return (
              <div key={c.id} onClick={() => onToggle(sid)}
                style={{ padding:"8px 14px", cursor:"pointer", fontSize:13,
                  background:checked ? C.orangePale : "transparent",
                  display:"flex", alignItems:"center", gap:8,
                  borderBottom:`1px solid ${C.border}22` }}
                onMouseEnter={e => e.currentTarget.style.background = checked ? C.orangePale : C.offWhite}
                onMouseLeave={e => e.currentTarget.style.background = checked ? C.orangePale : "transparent"}>
                <span style={{ width:16, height:16, borderRadius:4, display:"inline-flex", alignItems:"center",
                  justifyContent:"center", fontSize:11, flexShrink:0,
                  background:checked ? C.orange : "transparent",
                  border:`2px solid ${checked ? C.orange : C.border}`, color:"#fff" }}>
                  {checked ? "✓" : ""}
                </span>
                <span style={{ flex:1 }}>{c.name}</span>
                {c.sections && <span style={{ fontSize:11, color:C.muted }}>{c.sections.code || c.sections.name}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Spinner ────────────────────────────────────────────────────────────────────
export function Spinner({ text = "Loading…" }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center",
      justifyContent:"center", padding:"56px 24px", gap:16 }}>
      <div style={{ width:40, height:40, borderRadius:"50%",
        border:`3px solid ${C.blue}20`, borderTop:`3px solid ${C.blue}`,
        animation:"spin .7s linear infinite" }}/>
      <div style={{ fontSize:13, color:C.muted, fontWeight:500 }}>{text}</div>
    </div>
  );
}

// ── Skeleton (content-shaped loading placeholder) ──────────────────────────────
export function Skeleton({ width = "100%", height = 14, radius = 6, style = {} }) {
  return (
    <span style={{ display:"inline-block", width, height, borderRadius:radius,
      background:`linear-gradient(90deg, ${C.border}55 25%, ${C.border}aa 37%, ${C.border}55 63%)`,
      backgroundSize:"840px 100%", animation:"skeletonShimmer 1.4s ease-in-out infinite",
      ...style }}/>
  );
}

// ── Table Skeleton (rows of shimmer bars matching a real table's shape) ─────────
export function TableSkeleton({ rows = 6, cols = 5 }) {
  return (
    <tbody>
      {Array.from({ length:rows }).map((_, r) => (
        <tr key={r} style={{ borderBottom:`1px solid ${C.border}` }}>
          {Array.from({ length:cols }).map((_, c) => (
            <td key={c} style={{ padding:"12px 14px" }}>
              <Skeleton width={c === 0 ? "55%" : `${45 + ((r + c) % 4) * 12}%`} height={12}/>
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

// ── Card Skeleton (stat-card / grid placeholder) ────────────────────────────────
export function CardSkeleton({ height = 90 }) {
  return (
    <div style={{ background:C.white, borderRadius:18, padding:"18px 20px",
      border:`1px solid ${C.border}`, boxShadow:C.shadow, minHeight:height,
      display:"flex", flexDirection:"column", gap:12 }}>
      <Skeleton width="45%" height={10}/>
      <Skeleton width="65%" height={24}/>
      <Skeleton width="35%" height={10}/>
    </div>
  );
}

// ── In-App PDF Viewer (mobile / Capacitor) ─────────────────────────────────────
export function PDFViewer({ html, title, onClose }) {
  const safeTop   = "env(safe-area-inset-top, 0px)";
  const iframeRef = React.useRef(null);
  const [sharing, setSharing] = React.useState(false);
  const [zoom, setZoom]       = React.useState(100);
  const [shareMsg, setShareMsg] = React.useState(null);

  const showBanner = (text, ok = true) => {
    setShareMsg({ text, ok });
    setTimeout(() => setShareMsg(null), 5000);
  };

  const handleShare = async () => {
    setSharing(true);
    try {
      const blob     = new Blob([html], { type:"text/html;charset=utf-8" });
      const safeName = title.replace(/[^a-zA-Z0-9_\-]/g, "_");
      // Use window.File to avoid Lucide File icon shadowing
      const file = new window.File([blob], `${safeName}.html`, { type:"text/html" });
      if (navigator.share && navigator.canShare?.({ files:[file] })) {
        await navigator.share({ files:[file], title, text:`${title} — JAMES-DENNING` });
        showBanner("✅ Shared! Open the file in Chrome → tap ⋮ → Print → Save as PDF", true);
      } else if (navigator.share) {
        const url = URL.createObjectURL(blob);
        await navigator.share({ url, title });
        setTimeout(() => URL.revokeObjectURL(url), 30000);
        showBanner("✅ Link shared! Open it in Chrome → tap ⋮ → Print → Save as PDF", true);
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${safeName}.html`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 10000);
        showBanner("📥 File downloaded! Open it in Chrome to print as PDF", true);
      }
    } catch (e) {
      if (e.name !== "AbortError") {
        console.warn("[PDFViewer] share error", e);
        showBanner("⚠️ Could not share — try again", false);
      }
    } finally { setSharing(false); }
  };

  const handlePrint = () => {
    const w = iframeRef.current?.contentWindow;
    if (w) { w.focus(); w.print(); }
  };

  return (
    <div style={{ position:"fixed", inset:0, zIndex:9998,
      background:C.offWhite, display:"flex", flexDirection:"column",
      fontFamily:"'Segoe UI',system-ui,sans-serif" }}>
      {/* Header */}
      <div style={{ background:`linear-gradient(135deg,${LIGHT.blueDark} 0%,${LIGHT.blue} 100%)`,
        paddingTop:`calc(${safeTop} + 10px)`, paddingBottom:10,
        paddingLeft:12, paddingRight:12,
        display:"flex", alignItems:"center", gap:8, flexShrink:0,
        boxShadow:"0 3px 16px rgba(0,0,0,.3)" }}>
        <button onClick={onClose}
          style={{ color:"#fff", background:"rgba(255,255,255,.12)",
            border:"1px solid rgba(255,255,255,.2)",
            borderRadius:10, padding:"9px 14px", cursor:"pointer", fontWeight:700, fontSize:13,
            display:"flex", alignItems:"center", gap:5, flexShrink:0, whiteSpace:"nowrap" }}>
          ← Back
        </button>
        <span style={{ color:"#fff", fontWeight:700, flex:1, fontSize:13,
          overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", opacity:.9 }}>
          {title}
        </span>
        {!isNative() && (
          <div style={{ display:"flex", alignItems:"center", gap:4, flexShrink:0 }}>
            <button onClick={() => setZoom(z => Math.max(50, z-10))}
              style={{ background:"rgba(255,255,255,.12)", border:"1px solid rgba(255,255,255,.2)",
                color:"#fff", borderRadius:7, width:28, height:28, cursor:"pointer", fontSize:14,
                display:"flex", alignItems:"center", justifyContent:"center" }}>−</button>
            <span style={{ color:"rgba(255,255,255,.7)", fontSize:11, minWidth:36, textAlign:"center" }}>{zoom}%</span>
            <button onClick={() => setZoom(z => Math.min(200, z+10))}
              style={{ background:"rgba(255,255,255,.12)", border:"1px solid rgba(255,255,255,.2)",
                color:"#fff", borderRadius:7, width:28, height:28, cursor:"pointer", fontSize:14,
                display:"flex", alignItems:"center", justifyContent:"center" }}>+</button>
          </div>
        )}
        {!isNative() && (
          <button onClick={handlePrint}
            style={{ color:"#fff", background:"rgba(255,255,255,.12)",
              border:"1px solid rgba(255,255,255,.2)",
              borderRadius:10, padding:"9px 13px", cursor:"pointer", fontWeight:700,
              fontSize:13, display:"flex", alignItems:"center", gap:5, flexShrink:0 }}>
            Print
          </button>
        )}
        <button onClick={handleShare} disabled={sharing}
          style={{ color:"#fff", background:sharing ? "rgba(255,255,255,.15)" : LIGHT.orange,
            border:"none", borderRadius:10, padding:"9px 16px", cursor:sharing ? "wait" : "pointer",
            fontWeight:800, fontSize:13, display:"flex", alignItems:"center", gap:6, flexShrink:0,
            boxShadow:sharing ? "none" : `0 3px 12px ${LIGHT.orange}55`, whiteSpace:"nowrap",
            opacity:sharing ? .7 : 1 }}>
          {sharing
            ? <><div style={{ width:13, height:13, border:"2px solid rgba(255,255,255,.4)",
                borderTop:"2px solid #fff", borderRadius:"50%", animation:"spin .7s linear infinite" }}/> Wait…</>
            : <>{isNative() ? "Share" : "Download"}</>
          }
        </button>
      </div>
      {/* Tip bar */}
      <div style={{ background:C.amberPale, borderBottom:`1px solid ${C.amber}30`,
        padding:"8px 14px", fontSize:12, color:C.amber, display:"flex",
        alignItems:"center", gap:6, flexShrink:0, lineHeight:1.4 }}>
        {isNative()
          ? <span>Tap <b>Share</b> → open in <b>Chrome</b> → tap ⋮ → <b>Print</b> → <b>Save as PDF</b></span>
          : <span>Use <b>Print</b> to save as PDF, or <b>Download</b> to get the HTML file</span>
        }
      </div>
      {/* Share result banner */}
      {shareMsg && (
        <div style={{
          background: shareMsg.ok ? C.greenPale : C.redPale,
          borderBottom:`1px solid ${shareMsg.ok ? C.green : C.red}40`,
          padding:"9px 14px", fontSize:12,
          color: shareMsg.ok ? C.green : C.red,
          display:"flex", alignItems:"center", gap:6, flexShrink:0, lineHeight:1.5,
          animation:"fadeIn .2s ease",
        }}>
          <span style={{ flexShrink:0 }}>
            {shareMsg.ok ? <CheckCircle size={14} color={C.green}/> : <AlertTriangle size={14} color={C.red}/>}
          </span>
          <span>{shareMsg.text}</span>
          <button onClick={() => setShareMsg(null)}
            style={{ marginLeft:"auto", background:"none", border:"none", cursor:"pointer",
              fontSize:14, color:"inherit", opacity:.6, padding:"0 2px", flexShrink:0 }}>✕</button>
        </div>
      )}
      {/* Document iframe */}
      <div style={{ flex:1, overflow:"auto", padding:isNative() ? 0 : "12px 0",
        display:"flex", justifyContent:"center", background:C.offWhite }}>
        <iframe
          ref={iframeRef}
          srcDoc={html}
          style={{
            width: isNative() ? "100%" : "calc(100% - 24px)",
            maxWidth: isNative() ? "100%" : 860,
            flex: isNative() ? 1 : "none",
            height: isNative() ? "100%" : "auto",
            minHeight: isNative() ? undefined : "80vh",
            border:"none", background:"#fff",
            borderRadius: isNative() ? 0 : 8,
            boxShadow: isNative() ? "none" : "0 4px 24px rgba(0,0,0,.12)",
            transform: isNative() ? undefined : `scale(${zoom/100})`,
            transformOrigin:"top center",
          }}
          title={title}
          sandbox="allow-same-origin allow-scripts allow-modals"/>
      </div>
    </div>
  );
}

// ── Section Pill Selector ──────────────────────────────────────────────────────
export function SectionSelector() {
  const { sections, selectedSection, selectSection, loading } = useSection();
  const [hover, setHover] = useState(null);
  const pills = [
    { id:"all", label:"All Sections", code:"ALL", color:C.muted },
    ...sections.map(s => ({ id:s.id, label:s.name, code:s.code, color:s.color||C.blue, data:s })),
  ];
  if (loading) return (
    <div style={{ background:C.white, borderBottom:`1px solid ${C.border}`, padding:"10px 20px" }}>
      <span style={{ color:C.muted, fontSize:12 }}>Loading sections…</span>
    </div>
  );
  return (
    <div style={{ background:C.white, borderBottom:`1px solid ${C.border}`,
      padding:"8px 12px", display:"flex", alignItems:"center", gap:10,
      overflowX:"auto", scrollbarWidth:"none", WebkitOverflowScrolling:"touch",
      boxShadow:"0 1px 4px rgba(0,0,0,.04)", flexShrink:0 }}>
      <span style={{ fontSize:10, fontWeight:800, color:C.muted, textTransform:"uppercase",
        letterSpacing:1.2, whiteSpace:"nowrap", display:"flex", alignItems:"center", gap:4, flexShrink:0 }}>
        <Folder size={11} style={{ flexShrink:0 }}/> Section
      </span>
      <div style={{ width:1, height:18, background:C.border, flexShrink:0 }}/>
      <div style={{ display:"flex", gap:5, flexShrink:0 }}>
        {pills.map(p => {
          const active = p.id === "all" ? selectedSection === null : selectedSection?.id === p.id;
          return (
            <button key={p.id}
              onMouseEnter={() => setHover(p.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => selectSection(p.id === "all" ? null : p.data)}
              style={{
                padding:"5px 14px", borderRadius:20,
                border:`1.5px solid ${active ? p.color : hover===p.id ? p.color+"66" : "transparent"}`,
                background: active ? p.color : hover===p.id ? p.color+"10" : C.offWhite,
                color: active ? "#fff" : hover===p.id ? p.color : C.muted,
                fontSize:11.5, fontWeight:active ? 700 : 500, cursor:"pointer",
                transition:"all .15s ease", letterSpacing:.2,
                display:"flex", alignItems:"center", gap:5,
                boxShadow: active ? `0 2px 8px ${p.color}40` : "none",
              }}>
              {p.label}
              {p.code !== "ALL" && (
                <span style={{
                  background: active ? "rgba(255,255,255,.22)" : p.color+"18",
                  color: active ? "#fff" : p.color,
                  padding:"1px 6px", borderRadius:8, fontSize:9, fontWeight:800, letterSpacing:.5,
                }}>{p.code}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Icon Map + AppIcon ─────────────────────────────────────────────────────────
export const ICON_MAP = {
  // Navigation
  dashboard: LayoutDashboard, members: Users, students: GraduationCap,
  teachers: BookUser, classes: School, subjects: BookOpen, sections: Layers,
  assignments: Link2, results: BarChart3, "report-cards": FileText,
  transcript: ScrollText, "result-approvals": ShieldCheck,
  "report-settings": Settings2, grading: ListChecks,
  "fee-items": Tag, "fee-templates": FileStack, "fee-generate": Zap,
  "fee-tracker": CreditCard, "fee-stats": TrendingUp,
  announce: Megaphone, attendance: ClipboardCheck,
  mail: Mail, "mail-logs": Inbox,
  "bulk-promote": ArrowUpCircle, "recycle-bin": Trash2, "audit-log": History, approvals: CheckCircle2,
  timetable: TableProperties, export: Download, "login-activity": Activity, broadsheet: Table,
  "my-classes": School, "upload-results": Upload, "add-students": UserPlus,
  "my-results": FileText, "my-payments": CreditCard,
  // Actions
  add: Plus, edit: Pencil, delete: Trash2, view: Eye, hide: EyeOff,
  download: Download, send: Send, search: Search, filter: Filter,
  refresh: RefreshCw, close: X, check: Check, warning: AlertTriangle,
  info: Info, logout: LogOut, user: UserCircle, settings: Settings,
  lock: Lock, unlock: Unlock, shield: Shield, key: Key,
  calendar: Calendar, clock: Clock, star: Star, home: Home,
  menu: Menu, bell: Bell, link: Link2, copy: Copy, share: Share2,
  print: Printer, save: Save, archive: Archive, database: Database,
  activity: Activity, chart: BarChart2, "pie-chart": PieChart,
  trending: TrendingUp, "trending-down": TrendingDown,
  wallet: Wallet, banknote: Banknote, receipt: ReceiptText, calculator: Calculator,
  award: Award, bookmark: BookMarked, flag: Archive, target: Target,
  clipboard: ClipboardList, "user-check": UserCheck, "user-x": UserX,
  building: Building2, globe: Globe, phone: Phone, map: MapPinIcon,
  image: Image, file: File, folder: Folder, package: Package,
  pencil: Pencil,
};

export function AppIcon({ name, size = 16, color, style = {} }) {
  const Ic = ICON_MAP[name];
  if (!Ic) return null;
  return <Ic size={size} color={color} style={{ flexShrink:0, ...style }}/>;
}

// ── Actions (⋯) Menu ──────────────────────────────────────────────────────────
export function ActionsMenu({ items }) {
  const [open, setOpen]   = React.useState(false);
  const [pos, setPos]     = React.useState({ btnTop:0, btnRight:0 });
  const btnRef  = React.useRef(null);
  const dropRef = React.useRef(null);
  const closeRef= React.useRef(null);

  React.useEffect(() => {
    if (!open) {
      if (closeRef.current) { document.removeEventListener("mousedown", closeRef.current); closeRef.current = null; }
      return;
    }
    closeRef.current = (e) => {
      if (btnRef.current  && btnRef.current.contains(e.target))  return;
      if (dropRef.current && dropRef.current.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", closeRef.current);
    return () => {
      if (closeRef.current) { document.removeEventListener("mousedown", closeRef.current); closeRef.current = null; }
    };
  }, [open]);

  const handleToggle = (e) => {
    e.stopPropagation();
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ btnTop:r.top, btnRight:r.right });
    }
    setOpen(o => !o);
  };

  const dropStyle = {
    position:"fixed",
    right: Math.max(8, window.innerWidth - pos.btnRight),
    bottom: window.innerHeight - pos.btnTop + 4,
    zIndex:99999,
    background:C.white,
    border:`1px solid ${C.border}`,
    borderRadius:10,
    boxShadow:"0 -4px 28px rgba(0,0,0,.16), 0 2px 8px rgba(0,0,0,.06)",
    minWidth:196,
    overflow:"hidden",
  };

  return (
    <>
      <button ref={btnRef} onClick={handleToggle}
        style={{ background:open ? C.offWhite : C.white,
          border:`1px solid ${open ? C.blue : C.border}`,
          borderRadius:8, width:32, height:32, cursor:"pointer",
          display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:18, color:open ? C.blue : C.muted,
          transition:"all .15s", flexShrink:0 }}>
        ⋯
      </button>
      {open && ReactDOM.createPortal(
        <div ref={dropRef} style={dropStyle}>
          {items.map((item, i) => (
            item === null
              ? <div key={i} style={{ height:1, background:C.border, margin:"2px 0" }}/>
              : <button key={i}
                  onClick={(e) => { e.stopPropagation(); if (!item.disabled) { item.onClick(); setOpen(false); } }}
                  disabled={!!item.disabled}
                  title={item.disabled ? "No email address on file" : undefined}
                  style={{ display:"flex", alignItems:"center", gap:10, width:"100%",
                    padding:"10px 14px", border:"none", background:"transparent",
                    cursor:item.disabled ? "not-allowed" : "pointer", fontSize:13, fontWeight:600, textAlign:"left",
                    color:item.disabled ? C.light : item.danger ? C.red : item.color || C.text,
                    opacity:item.disabled ? .5 : 1,
                    transition:"background .1s", whiteSpace:"nowrap" }}
                  onMouseEnter={e => { if (!item.disabled) e.currentTarget.style.background = item.danger ? "#fff5f5" : C.offWhite; }}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <span style={{ width:20, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                    <AppIcon name={item.icon || "file"} size={15} color={item.danger ? C.red : item.color || C.muted}/>
                  </span>
                  {item.label}
                </button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}

// ── Section Pill Tabs ──────────────────────────────────────────────────────────
// ── Page Header ────────────────────────────────────────────────────────────────
export function PageHeader({ icon, title, subtitle, action, gradient }) {
  const bg = gradient || `radial-gradient(900px 300px at 90% -40%, rgba(255,255,255,.18), transparent 55%), linear-gradient(135deg,${C.blue} 0%,${C.blueDark} 100%)`;
  return (
    <div style={{ background:bg, borderRadius:18, padding:"22px 26px", marginBottom:24,
      display:"flex", alignItems:"center", justifyContent:"space-between", gap:16,
      boxShadow:`0 12px 34px -12px ${C.blue}44, inset 0 1px 0 rgba(255,255,255,.08)` }}>
      <div style={{ display:"flex", alignItems:"center", gap:14 }}>
        {icon && (
          <div style={{ background:"rgba(255,255,255,.14)", border:"1px solid rgba(255,255,255,.14)", borderRadius:13, padding:10,
            display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
            boxShadow:"inset 0 1px 0 rgba(255,255,255,.12)" }}>
            {typeof icon === "string"
              ? <AppIcon name={icon} size={22} color="#fff"/>
              : React.cloneElement(icon, { size:22, color:"#fff" })}
          </div>
        )}
        <div>
          <h2 style={{ color:"#fff", fontWeight:900, fontSize:19, margin:0, lineHeight:1.2 }}>{title}</h2>
          {subtitle && (
            <p style={{ color:"rgba(255,255,255,.72)", fontSize:12.5, margin:"4px 0 0", lineHeight:1.4 }}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {action && <div style={{ flexShrink:0 }}>{action}</div>}
    </div>
  );
}

// ── Empty State ────────────────────────────────────────────────────────────────
export function EmptyState({ icon, title, message, action }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
      padding:"48px 24px", textAlign:"center", gap:10 }}>
      <div style={{ width:68, height:68, borderRadius:20, background:C.offWhite,
        border:`1.5px solid ${C.border}`,
        display:"flex", alignItems:"center", justifyContent:"center", marginBottom:4 }}>
        {icon || <Inbox size={28} color={C.muted}/>}
      </div>
      <div style={{ fontSize:15, fontWeight:700, color:C.text }}>{title || "Nothing here yet"}</div>
      {message && <div style={{ fontSize:13, color:C.muted, maxWidth:320, lineHeight:1.5 }}>{message}</div>}
      {action && <div style={{ marginTop:8 }}>{action}</div>}
    </div>
  );
}

export function SectionPillTabs({ sections, value, onChange }) {
  const all = [{ id:"", name:"All Sections", color:null }, ...sections];
  return (
    <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:16 }}>
      {all.map(s => {
        const active = value === (s.id ? ""+s.id : "");
        return (
          <button key={s.id || "all"} onClick={() => onChange(s.id ? ""+s.id : "")}
            style={{ padding:"6px 16px", borderRadius:20,
              border:`2px solid ${active ? (s.color||C.blue) : C.border}`,
              background: active ? (s.color||C.blue) : (s.color ? s.color+"18" : C.white),
              color: active ? "#fff" : (s.color||C.blue),
              fontSize:12, fontWeight:700, cursor:"pointer", transition:"all .15s",
              whiteSpace:"nowrap" }}>
            {s.id ? `${s.code || s.name}` : "All"}
          </button>
        );
      })}
    </div>
  );
}
