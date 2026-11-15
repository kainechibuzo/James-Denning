/**
 * JAMES-DENNING — Dedicated Mobile App
 * Standalone React app for Android/iOS via Capacitor.
 * All screens, real Supabase data, matches the Claude design prototype.
 */
const APP_VERSION = PRODUCT.version;
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  LayoutDashboard, UsersRound, Wallet, FileText, Menu,
  ClipboardCheck, BarChart3, CalendarDays, UserCircle,
  Bell, Sun, Moon, ArrowLeft, ChevronRight, Search,
  Users, GraduationCap, CheckCircle2, TrendingUp, Download,
  Mail, Calendar, Settings, History, Trash2, Activity,
  Award, LogOut, Lock, Pencil, HelpCircle, Info,
  AlertTriangle, Loader2, Plus, Send, Eye, EyeOff,
  CreditCard, ReceiptText, X, Check, BookOpen,
  BarChart2, ClipboardList, UserCheck,
} from "lucide-react";
import { db, supabase } from "./supabaseClient.js";
import { fmt, fullName } from "./utils/grades.js";
import { saveSession, clearSession, saveSelectedSchool, loadSelectedSchool } from "./utils/session.js";
import { PRODUCT } from "./config/product.js";

// ─── THEME ────────────────────────────────────────────────────────────────────
const CLARITY = {
  id:"clarity", dark:false, bg:"#F7F8F8", card:"#FFFFFF", hdr:"#FFFFFF", pri:"#202124", acc:"#202124", txt:"#202124", sft:"#737980", mut:"#969BA2", brd:"#E5E7E9", tabBg:"#FFFFFF", tabA:"#202124", tabI:"#969BA2",
  tag:{blue:["#F1F2F3","#202124"],green:["#EAF5EE","#16794B"],orange:["#F1F2F3","#44484E"],red:["#FFF0EE","#B42318"],purple:["#F1F2F4","#5C6470"],amber:["#FFF7E5","#946200"]},
};
const MIDNIGHT = {
  id:"midnight", dark:true, bg:"#101214", card:"#191C1F", hdr:"#191C1F", pri:"#F3F4F6", acc:"#F3F4F6", txt:"#F9FAFB", sft:"#9CA3AF", mut:"#6B7280", brd:"#303438", tabBg:"#111111", tabA:"#F3F4F6", tabI:"#6B7280",
  tag:{blue:["rgba(243,244,246,.12)","#F3F4F6"],green:["rgba(134,239,172,.1)","#86EFAC"],orange:["rgba(243,244,246,.12)","#D1D5DB"],red:["rgba(252,165,165,.1)","#FCA5A5"],purple:["rgba(209,213,219,.12)","#D1D5DB"],amber:["rgba(252,211,77,.1)","#FCD34D"]},
};

// ─── ATOMS ────────────────────────────────────────────────────────────────────
function MBadge({t, label, color="blue"}){
  const [bg,tc]=t.tag[color]||["#eee","#555"];
  return(
    <span style={{background:bg,color:tc,borderRadius:6,padding:"2px 8px",
      fontSize:10,fontWeight:700,whiteSpace:"nowrap",flexShrink:0}}>{label}</span>
  );
}

function MAvatar({name="?", size=38, color="#111827"}){
  const parts=(name||"?").split(" ");
  const ini=((parts[0]?.[0]||"")+(parts[1]?.[0]||"")).toUpperCase()||"?";
  return(
    <div style={{width:size,height:size,borderRadius:size/2,
      background:color+"22",color,flexShrink:0,
      display:"flex",alignItems:"center",justifyContent:"center",
      fontSize:size*.36,fontWeight:800}}>{ini}</div>
  );
}

function MRow({t, children, last, onClick, style={}}){
  return(
    <div onClick={onClick} role={onClick?"button":undefined} tabIndex={onClick?0:undefined}
      onKeyDown={onClick?(e)=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onClick();}}:undefined}
      style={{padding:"11px 16px",borderBottom:last?"none":`1px solid ${t.brd}`,
        display:"flex",alignItems:"center",gap:12,
        cursor:onClick?"pointer":"default",
        transition:"background .1s", ...style}}>
      {children}
    </div>
  );
}

function MSHdr({t, title, action, onAction}){
  return(
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
      <div style={{fontSize:15,fontWeight:800,color:t.txt,letterSpacing:-.3}}>{title}</div>
      {action&&(
        <div onClick={onAction}
          style={{fontSize:12,fontWeight:700,color:t.pri,cursor:"pointer"}}>{action}</div>
      )}
    </div>
  );
}

function MStatCard({t, label, value, sub, color="blue", icon}){
  const [bg,tc]=t.tag[color]||["#F8FAFC",t.txt];
  return(
    <div style={{background:bg,borderRadius:14,padding:"13px 14px",flex:1,minWidth:0}}>
      <div style={{marginBottom:4,color:tc,opacity:.8}}>{icon}</div>
      <div style={{fontSize:20,fontWeight:900,color:tc,lineHeight:1.1}}>{value}</div>
      <div style={{fontSize:10,color:tc,opacity:.75,fontWeight:700,marginTop:2,
        textTransform:"uppercase",letterSpacing:.3}}>{label}</div>
      {sub&&<div style={{fontSize:10,color:tc,opacity:.5,marginTop:1}}>{sub}</div>}
    </div>
  );
}

function MCard({t, children, style={}}){
  return(
    <div style={{background:t.card,borderRadius:16,overflow:"hidden",
      border:`1px solid ${t.brd}`, ...style}}>{children}</div>
  );
}

function MSpinner({t}){
  return(
    <div style={{display:"flex",justifyContent:"center",alignItems:"center",padding:40}}>
      <Loader2 size={28} color={t.pri} style={{animation:"spin 1s linear infinite"}}/>
    </div>
  );
}

function MEmpty({t, message="Nothing here yet"}){
  return(
    <div style={{textAlign:"center",padding:"40px 20px",color:t.mut,fontSize:14}}>{message}</div>
  );
}

function MSearchBar({t, value, onChange, placeholder="Search…"}){
  return(
    <div style={{height:38,borderRadius:11,background:t.bg,border:`1px solid ${t.brd}`,
      display:"flex",alignItems:"center",padding:"0 12px",gap:8}}>
      <Search size={15} color={t.mut}/>
      <input value={value} onChange={e=>onChange(e.target.value)}
        placeholder={placeholder}
        style={{border:"none",outline:"none",background:"transparent",
          flex:1,fontSize:14,color:t.txt,fontFamily:"inherit"}}/>
      {value&&<X size={14} color={t.mut} style={{cursor:"pointer",flexShrink:0}}
        onClick={()=>onChange("")}/>}
    </div>
  );
}

function MFilterChip({t, label, active, onClick}){
  return(
    <div onClick={onClick}
      style={{padding:"5px 13px",borderRadius:20,fontSize:12,fontWeight:600,
        cursor:"pointer",whiteSpace:"nowrap",
        background:active?t.pri:t.card,color:active?"#fff":t.sft,
        border:`1px solid ${active?t.pri:t.brd}`}}>{label}</div>
  );
}

function MToast({t, message, type="success"}){
  if(!message) return null;
  const col=type==="error"?t.tag.red[1]:type==="warn"?t.tag.amber[1]:t.tag.green[1];
  const bg=type==="error"?t.tag.red[0]:type==="warn"?t.tag.amber[0]:t.tag.green[0];
  return(
    <div style={{position:"fixed",bottom:110,left:"50%",transform:"translateX(-50%)",
      zIndex:9999,background:bg,color:col,borderRadius:12,padding:"11px 18px",
      fontSize:13,fontWeight:700,whiteSpace:"nowrap",
      boxShadow:"0 4px 20px rgba(0,0,0,.22)",
      animation:"fadeUp .25s ease-out",pointerEvents:"none",border:`1px solid ${col}30`}}>
      {message}
    </div>
  );
}

function MBottomSheet({t, open, onClose, title, children}){
  if(!open) return null;
  return(
    <div style={{position:"fixed",inset:0,zIndex:9000,display:"flex",
      flexDirection:"column",justifyContent:"flex-end"}}>
      <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.45)"}} onClick={onClose}/>
      <div style={{position:"relative",background:t.card,borderRadius:"20px 20px 0 0",
        padding:"20px 16px 32px",maxHeight:"85vh",overflowY:"auto",
        animation:"fadeUp .22s ease-out"}}>
        <div style={{width:36,height:4,borderRadius:2,background:t.brd,margin:"0 auto 16px"}}/>
        {title&&<div style={{fontSize:16,fontWeight:800,color:t.txt,marginBottom:16}}>{title}</div>}
        {children}
      </div>
    </div>
  );
}

function MInputField({t, label, value, onChange, placeholder="", type="text", textarea=false}){
  const [foc,setFoc]=useState(false);
  const s={width:"100%",borderRadius:11,border:`1.5px solid ${foc?t.pri:t.brd}`,
    background:t.bg,padding:textarea?"10px 13px":"0 13px",
    fontSize:14,color:t.txt,fontFamily:"inherit",outline:"none",
    height:textarea?"auto":44,resize:"none",boxSizing:"border-box",display:"block"};
  return(
    <div style={{marginBottom:12}}>
      {label&&<div style={{fontSize:11,fontWeight:700,color:t.sft,marginBottom:5,
        textTransform:"uppercase",letterSpacing:.5}}>{label}</div>}
      {textarea
        ?<textarea rows={3} value={value} onChange={e=>onChange(e.target.value)}
            placeholder={placeholder} onFocus={()=>setFoc(true)} onBlur={()=>setFoc(false)} style={s}/>
        :<input type={type} value={value} onChange={e=>onChange(e.target.value)}
            placeholder={placeholder} onFocus={()=>setFoc(true)} onBlur={()=>setFoc(false)} style={s}/>
      }
    </div>
  );
}

function MSelectField({t, label, value, onChange, options=[]}){
  return(
    <div style={{marginBottom:12}}>
      {label&&<div style={{fontSize:11,fontWeight:700,color:t.sft,marginBottom:5,
        textTransform:"uppercase",letterSpacing:.5}}>{label}</div>}
      <select value={value} onChange={e=>onChange(e.target.value)}
        style={{width:"100%",height:44,borderRadius:11,border:`1.5px solid ${t.brd}`,
          background:t.bg,padding:"0 13px",fontSize:14,color:t.txt,
          fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}>
        {options.map(({v,l})=><option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}

function MPrimaryBtn({t, label, onClick, loading=false, disabled=false, danger=false}){
  const bg=danger?"#DC2626":t.hdr;
  const dis=loading||disabled;
  return(
    <button onClick={!dis?onClick:undefined} disabled={dis}
      style={{width:"100%",height:48,borderRadius:13,border:"none",
        background:dis?"rgba(100,116,139,.25)":bg,
        color:"#fff",fontSize:15,fontWeight:800,
        cursor:dis?"default":"pointer",marginTop:4,
        display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
      {loading?<Loader2 size={18} style={{animation:"spin 1s linear infinite"}}/>:label}
    </button>
  );
}

// ─── APP HEADER ───────────────────────────────────────────────────────────────
function MAppHeader({t, user, role, onBack, backLabel, onToggleDark, pendingNotifs=0}){
  const parts=(user?.name||"?").split(" ");
  const ini=((parts[0]?.[0]||"")+(parts[1]?.[0]||"")).toUpperCase();
  const h=new Date().getHours();
  const greeting=h<12?"Good morning":h<17?"Good afternoon":"Good evening";
  const roleLbl={admin:"Administrator",teacher:"Staff Portal",manager:"Finance Officer",student:"Member Portal"}[role]||role;
  return(
    <div style={{background:t.hdr,padding:"52px 16px 14px",display:"flex",
      alignItems:"center",justifyContent:"space-between",flexShrink:0,gap:8}}>
      {onBack
        ?<div onClick={onBack} style={{display:"flex",alignItems:"center",gap:7,
            cursor:"pointer",flex:1,minWidth:0}}>
            <ArrowLeft size={18} strokeWidth={2.5} color="rgba(255,255,255,.85)"/>
            <span style={{fontSize:16,fontWeight:700,color:"#fff",
              overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{backLabel}</span>
          </div>
        :<div style={{display:"flex",alignItems:"center",gap:10,flex:1,minWidth:0}}>
            <div style={{width:40,height:40,borderRadius:20,
              background:"rgba(255,255,255,.18)",border:"1.5px solid rgba(255,255,255,.3)",
              display:"flex",alignItems:"center",justifyContent:"center",
              fontSize:15,fontWeight:900,color:"#fff",flexShrink:0}}>{ini}</div>
            <div style={{minWidth:0}}>
              <div style={{fontSize:11,color:"rgba(255,255,255,.55)"}}>{greeting},</div>
              <div style={{fontSize:16,fontWeight:800,color:"#fff",lineHeight:1.2,
                overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                {user?.name?.split(" ")[0]||"User"}
              </div>
              <div style={{fontSize:11,color:"rgba(255,255,255,.55)"}}>{roleLbl}</div>
            </div>
          </div>
      }
      <div style={{display:"flex",alignItems:"center",gap:7,flexShrink:0}}>
        {/* Version badge */}
        <div style={{fontSize:9,fontWeight:800,color:"rgba(255,255,255,.5)",
          letterSpacing:.4,padding:"2px 6px",borderRadius:5,
          border:"1px solid rgba(255,255,255,.18)",background:"rgba(255,255,255,.08)"}}>
          {APP_VERSION}
        </div>
        <button onClick={onToggleDark}
          style={{width:34,height:34,borderRadius:10,background:"rgba(255,255,255,.14)",
            border:"none",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
          {t.dark?<Sun size={16} color="#fff"/>:<Moon size={16} color="#fff"/>}
        </button>
        <div style={{position:"relative"}}>
          <button style={{width:34,height:34,borderRadius:10,background:"rgba(255,255,255,.14)",
            border:"none",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
            <Bell size={17} color="#fff"/>
          </button>
          {pendingNotifs>0&&(
            <div style={{position:"absolute",top:6,right:6,width:8,height:8,
              borderRadius:4,background:"#111827",border:"1.5px solid rgba(26,79,160,.6)"}}/>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── TAB BAR ─────────────────────────────────────────────────────────────────
const TABS={
  admin:[
    {id:"dashboard",   label:"Home",       Icon:LayoutDashboard},
    {id:"students",    label:"Members",   Icon:UsersRound},
    {id:"fee-tracker", label:"Billing",       Icon:Wallet},
    {id:"results",     label:"Results",    Icon:FileText},
    {id:"more",        label:"More",       Icon:Menu},
  ],
  teacher:[
    {id:"dashboard",   label:"Home",       Icon:LayoutDashboard},
    {id:"attendance",  label:"Attendance", Icon:ClipboardCheck},
    {id:"results",     label:"Results",    Icon:BarChart3},
    {id:"timetable",   label:"Timetable",  Icon:CalendarDays},
    {id:"profile",     label:"Profile",    Icon:UserCircle},
  ],
  manager:[
    {id:"dashboard",   label:"Home",       Icon:LayoutDashboard},
    {id:"fee-tracker", label:"Tracker",    Icon:Wallet},
    {id:"fee-stats",   label:"Stats",      Icon:BarChart3},
    {id:"announce",    label:"Notices",    Icon:Bell},
    {id:"profile",     label:"Profile",    Icon:UserCircle},
  ],
  student:[
    {id:"dashboard",   label:"Home",       Icon:LayoutDashboard},
    {id:"my-results",  label:"Results",    Icon:BarChart3},
    {id:"my-bill",     label:"My Bill",    Icon:CreditCard},
    {id:"announce",    label:"Notices",    Icon:Bell},
    {id:"profile",     label:"Profile",    Icon:UserCircle},
  ],
};

function MTabBar({t, role, activeScreen, onSelect}){
  const tabs=TABS[role]||TABS.admin;
  const isTab=(s)=>tabs.some(tb=>tb.id===s);
  const activeTab=isTab(activeScreen)?activeScreen:(tabs[0]?.id||"dashboard");
  return(
    <div style={{display:"flex",background:t.tabBg,borderTop:`1px solid ${t.brd}`,
      paddingBottom:"env(safe-area-inset-bottom,18px)",paddingTop:8,flexShrink:0,
      boxShadow:"0 -2px 12px rgba(0,0,0,.08)"}}>
      {tabs.map(({id,label,Icon})=>{
        const active=activeTab===id;
        const col=active?t.tabA:t.tabI;
        return(
          <div key={id} onClick={()=>onSelect(id)}
            style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",
              gap:3,cursor:"pointer",position:"relative",paddingBottom:2}}>
            <div style={{height:26,display:"flex",alignItems:"center"}}>
              <Icon size={22} color={col} strokeWidth={active?2.2:1.8}/>
            </div>
            <div style={{fontSize:10,fontWeight:active?700:500,color:col,letterSpacing:-.1}}>
              {label}
            </div>
            {active&&<div style={{position:"absolute",bottom:0,left:"20%",right:"20%",
              height:2.5,borderRadius:"2px 2px 0 0",background:t.tabA}}/>}
          </div>
        );
      })}
    </div>
  );
}

// ─── LOGIN SCREEN ─────────────────────────────────────────────────────────────
function MLoginScreen({t, onLogin, loading, error, school, schools=[], onSelectSchool}){
  const [id,setId]=useState("");
  const [pw,setPw]=useState("");
  const [showPw,setShowPw]=useState(false);
  // If no school selected yet and multiple schools exist — show picker first
  const [picking,setPicking]=useState(!school && schools.length>1);
  const submit=()=>{ if(id.trim()&&pw) onLogin(id.trim(),pw); };

  // Organization picker view
  if(picking || (!school && schools.length>1)){
    return(
      <div style={{height:"100%",background:t.hdr,display:"flex",flexDirection:"column",
        alignItems:"center",justifyContent:"flex-end",position:"relative",overflow:"hidden"}}>
        {/* Decorative circles */}
        <div style={{position:"absolute",top:-80,right:-80,width:240,height:240,
          borderRadius:"50%",background:"rgba(255,255,255,.06)"}}/>
        <div style={{position:"absolute",top:100,left:-60,width:180,height:180,
          borderRadius:"50%",background:"rgba(255,255,255,.04)"}}/>
        {/* Title */}
        <div style={{position:"absolute",top:"12%",left:0,right:0,
          display:"flex",flexDirection:"column",alignItems:"center",gap:14}}>
          <div style={{width:84,height:84,borderRadius:24,
            background:"rgba(255,255,255,.15)",backdropFilter:"blur(10px)",
            border:"1.5px solid rgba(255,255,255,.3)",
            display:"flex",alignItems:"center",justifyContent:"center"}}>
            <GraduationCap size={40} color="rgba(255,255,255,.9)"/>
          </div>
          <div style={{color:"rgba(255,255,255,.95)",fontSize:19,fontWeight:800,
            letterSpacing:-.4,textAlign:"center",lineHeight:1.3}}>
            Select Your Business
          </div>
          <div style={{color:"rgba(255,255,255,.55)",fontSize:13}}>Tap your organization to continue</div>
        </div>
        {/* Organization list sheet */}
        <div style={{width:"100%",background:t.card,borderRadius:"28px 28px 0 0",
          padding:"26px 24px 40px",boxShadow:"0 -12px 40px rgba(0,0,0,.18)",maxHeight:"55vh",overflowY:"auto"}}>
          <div style={{fontSize:16,fontWeight:800,color:t.txt,marginBottom:16}}>
            Available Organizations
          </div>
          {schools.map((s,i)=>(
            <div key={s.id||i} onClick={()=>{
              onSelectSchool(s);
              setPicking(false);
            }}
              style={{display:"flex",alignItems:"center",gap:14,
                padding:"14px 16px",borderRadius:14,marginBottom:10,cursor:"pointer",
                background:school?.id===s.id?t.pri+"18":t.bg,
                border:`1.5px solid ${school?.id===s.id?t.pri:t.brd}`,
                transition:"all .15s"}}>
              <div style={{width:44,height:44,borderRadius:12,
                background:t.pri+"20",display:"flex",alignItems:"center",
                justifyContent:"center",flexShrink:0}}>
                <GraduationCap size={22} color={t.pri}/>
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:15,fontWeight:700,color:t.txt,
                  overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                  {s.name||"Unnamed Organization"}
                </div>
                {s.address&&<div style={{fontSize:12,color:t.sft,marginTop:2,
                  overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                  {s.address}
                </div>}
              </div>
              {school?.id===s.id&&<Check size={18} color={t.pri}/>}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return(
    <div style={{height:"100%",background:t.hdr,display:"flex",flexDirection:"column",
      alignItems:"center",justifyContent:"flex-end",position:"relative",overflow:"hidden"}}>
      {/* Decorative circles */}
      <div style={{position:"absolute",top:-80,right:-80,width:240,height:240,
        borderRadius:"50%",background:"rgba(255,255,255,.06)"}}/>
      <div style={{position:"absolute",top:100,left:-60,width:180,height:180,
        borderRadius:"50%",background:"rgba(255,255,255,.04)"}}/>
      {/* Logo + school name */}
      <div style={{position:"absolute",top:"12%",left:0,right:0,
        display:"flex",flexDirection:"column",alignItems:"center",gap:14}}>
        <div style={{width:84,height:84,borderRadius:24,
          background:"rgba(255,255,255,.15)",backdropFilter:"blur(10px)",
          border:"1.5px solid rgba(255,255,255,.3)",
          display:"flex",alignItems:"center",justifyContent:"center"}}>
          <GraduationCap size={40} color="rgba(255,255,255,.9)"/>
        </div>
        <div style={{color:"rgba(255,255,255,.95)",fontSize:19,fontWeight:800,
          letterSpacing:-.4,textAlign:"center",lineHeight:1.3,padding:"0 24px"}}>
          {school?.name||"JAMES-DENNING"}
        </div>
        {/* Organization switcher link — shown when multiple schools exist */}
        {schools.length>1&&(
          <div onClick={()=>setPicking(true)}
            style={{display:"flex",alignItems:"center",gap:5,cursor:"pointer",
              background:"rgba(255,255,255,.12)",borderRadius:20,padding:"5px 14px",
              border:"1px solid rgba(255,255,255,.2)"}}>
            <Settings size={12} color="rgba(255,255,255,.7)"/>
            <span style={{color:"rgba(255,255,255,.8)",fontSize:12,fontWeight:600}}>
              Change organization
            </span>
          </div>
        )}
        <div style={{color:"rgba(255,255,255,.55)",fontSize:13}}>Business Portal</div>
      </div>
      {/* Bottom sheet */}
      <div style={{width:"100%",background:t.card,borderRadius:"28px 28px 0 0",
        padding:"26px 24px 32px",boxShadow:"0 -12px 40px rgba(0,0,0,.18)"}}>
        <div style={{fontSize:22,fontWeight:900,color:t.txt,marginBottom:4}}>Sign In</div>
        <div style={{fontSize:13,color:t.sft,marginBottom:22}}>Enter your credentials to continue.</div>
        {error&&(
          <div style={{background:t.tag.red[0],color:t.tag.red[1],borderRadius:10,
            padding:"10px 14px",fontSize:13,fontWeight:600,marginBottom:16}}>
            {error}
          </div>
        )}
        {/* ID field */}
        <div style={{marginBottom:12}}>
          <div style={{fontSize:11,fontWeight:700,color:t.sft,marginBottom:5,
            textTransform:"uppercase",letterSpacing:.5}}>Staff / Member ID</div>
          <input value={id} onChange={e=>setId(e.target.value)}
            placeholder="e.g. TCH/0023 or JD/0847"
            onKeyDown={e=>e.key==="Enter"&&document.getElementById("mpw")?.focus()}
            style={{width:"100%",height:46,borderRadius:12,border:`1.5px solid ${t.brd}`,
              background:t.bg,padding:"0 14px",fontSize:15,color:t.txt,
              fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>
        </div>
        {/* Password field */}
        <div style={{marginBottom:22}}>
          <div style={{fontSize:11,fontWeight:700,color:t.sft,marginBottom:5,
            textTransform:"uppercase",letterSpacing:.5}}>Password</div>
          <div style={{position:"relative"}}>
            <input id="mpw" type={showPw?"text":"password"} value={pw}
              onChange={e=>setPw(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&submit()}
              placeholder="Your password"
              style={{width:"100%",height:46,borderRadius:12,border:`1.5px solid ${t.brd}`,
                background:t.bg,padding:"0 44px 0 14px",fontSize:15,color:t.txt,
                fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>
            <div onClick={()=>setShowPw(p=>!p)}
              style={{position:"absolute",right:14,top:"50%",transform:"translateY(-50%)",
                cursor:"pointer",color:t.mut}}>
              {showPw?<EyeOff size={18}/>:<Eye size={18}/>}
            </div>
          </div>
        </div>
        <button onClick={submit} disabled={loading||!id||!pw}
          style={{width:"100%",height:52,borderRadius:14,border:"none",
            background:loading||!id||!pw?"rgba(26,79,160,.4)":t.hdr,
            color:"#fff",fontSize:16,fontWeight:800,cursor:loading||!id||!pw?"default":"pointer",
            display:"flex",alignItems:"center",justifyContent:"center",gap:8,
            boxShadow:"0 4px 16px rgba(0,0,0,.2)"}}>
          {loading?<Loader2 size={20} style={{animation:"spin 1s linear infinite"}}/>:"Sign In →"}
        </button>
        <div style={{textAlign:"center",marginTop:14,fontSize:13,color:t.sft}}>
          Forgot password?&nbsp;<span style={{color:t.pri,fontWeight:700}}>Contact admin</span>
        </div>
      </div>
    </div>
  );
}

// ─── ADMIN: DASHBOARD ─────────────────────────────────────────────────────────
function AdminDashboard({t, ctx}){
  const {setScreen}=ctx;
  const [stats,setStats]=useState({students:0,teachers:0,eaApproved:0,feesCollected:0});
  const [activity,setActivity]=useState([]);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    Promise.all([
      db.getStudents(),
      db.getTeachers(),
      db.getFeePayments(),
      db.getResultApprovals(),
    ]).then(([stu,tch,pay,approvals])=>{
      const students=(stu.data||[]).filter(s=>s.status==="active").length;
      const teachers=(tch.data||[]).length;
      const payments=pay.data||[];
      const feesCollected=payments.reduce((s,p)=>s+(+p.amount||0),0);
      const eaApproved=(approvals.data||[]).filter(a=>a.ea_status==="approved").length;
      setStats({students,teachers,eaApproved,feesCollected});
      // Recent activity from payments
      const recent=payments.slice(0,4).map(p=>({
        name:p.student_name||p.student_id||"Member",
        action:`Billing payment — ${fmt(+p.amount||0)}`,
        time:"recently",
        color:"#15803D",
      }));
      setActivity(recent);
      setLoading(false);
    }).catch(()=>setLoading(false));
  },[]);

  const quickActions=[
    {l:"Add Member",   Icon:Plus,         screen:"students"},
    {l:"Generate Bill", Icon:ReceiptText,  screen:"fee-generate"},
    {l:"Send Email",    Icon:Mail,         screen:"mail-compose"},
    {l:"Export",        Icon:Download,     screen:"export"},
  ];

  return(
    <div style={{padding:"14px 14px 0",background:t.bg,minHeight:"100%"}}>
      {loading?<MSpinner t={t}/>:<>
        {/* Stats */}
        <div style={{display:"flex",gap:9,marginBottom:9}}>
          <MStatCard t={t} label="Members" value={stats.students.toLocaleString()}
            sub="Active" color="blue" icon={<UsersRound size={18}/>}/>
          <MStatCard t={t} label="Staff" value={stats.teachers}
            sub="On staff" color="purple" icon={<UserCheck size={18}/>}/>
        </div>
        <div style={{display:"flex",gap:9,marginBottom:18}}>
          <MStatCard t={t} label="EA Approved" value={stats.eaApproved}
            sub="This period" color="green" icon={<CheckCircle2 size={18}/>}/>
          <MStatCard t={t} label="Billing Collected" value={`₦${(stats.feesCollected/1000000).toFixed(1)}M`}
            sub="This period" color="orange" icon={<TrendingUp size={18}/>}/>
        </div>
        {/* Quick actions */}
        <MSHdr t={t} title="Quick Actions"/>
        <div style={{display:"flex",gap:8,marginBottom:18}}>
          {quickActions.map((a,i)=>(
            <div key={i} onClick={()=>setScreen(a.screen)}
              style={{flex:1,background:t.card,borderRadius:12,padding:"11px 4px",
                textAlign:"center",border:`1px solid ${t.brd}`,cursor:"pointer"}}>
              <div style={{display:"flex",justifyContent:"center",marginBottom:4,color:t.pri}}>
                <a.Icon size={18}/>
              </div>
              <div style={{fontSize:10,fontWeight:700,color:t.sft,lineHeight:1.2}}>{a.l}</div>
            </div>
          ))}
        </div>
        {/* Recent activity */}
        <MSHdr t={t} title="Recent Activity" action="See all" onAction={()=>setScreen("audit-log")}/>
        <MCard t={t} style={{marginBottom:18}}>
          {activity.length===0?<MEmpty t={t} message="No recent activity"/>:
            activity.map((item,i)=>(
              <MRow key={i} t={t} last={i===activity.length-1}>
                <MAvatar name={item.name} size={35} color={item.color}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:700,color:t.txt,
                    whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{item.name}</div>
                  <div style={{fontSize:12,color:t.sft}}>{item.action}</div>
                </div>
                <div style={{fontSize:11,color:t.mut,whiteSpace:"nowrap"}}>{item.time}</div>
              </MRow>
            ))
          }
        </MCard>
      </>}
    </div>
  );
}

// ─── ADMIN: STUDENTS ──────────────────────────────────────────────────────────
function AdminStudents({t, ctx}){
  const [students,setStudents]=useState([]);
  const [loading,setLoading]=useState(true);
  const [search,setSearch]=useState("");
  const [filter,setFilter]=useState(0);
  const [addSheet,setAddSheet]=useState(false);
  const filters=["All","Primary","JSS","SSS"];

  const load=()=>{
    setLoading(true);
    db.getStudents().then(({data})=>{setStudents(data||[]);setLoading(false);})
      .catch(()=>setLoading(false));
  };
  useEffect(load,[]);

  const filtered=students.filter(s=>{
    const q=search.toLowerCase();
    const name=fullName(s).toLowerCase();
    const id=String(s.student_id||s.id||"").toLowerCase();
    const cls=(s.class_name||"").toLowerCase();
    const matchQ=!q||name.includes(q)||id.includes(q)||cls.includes(q);
    const matchF=filter===0||cls.toLowerCase().includes(filters[filter].toLowerCase());
    return matchQ&&matchF;
  });

  const openDetail=(s)=>{
    ctx.setSelected({student:s});
    ctx.setScreen("student-detail");
  };

  return(
    <div style={{background:t.bg,minHeight:"100%",position:"relative"}}>
      <div style={{background:t.card,padding:"10px 14px",borderBottom:`1px solid ${t.brd}`}}>
        <MSearchBar t={t} value={search} onChange={setSearch} placeholder="Search members…"/>
      </div>
      <div style={{display:"flex",gap:7,padding:"10px 14px",overflowX:"auto"}}>
        {filters.map((f,i)=>(
          <MFilterChip key={i} t={t} label={`${f}${filter===i&&students.length?` (${filtered.length})`:""}` } active={filter===i} onClick={()=>setFilter(i)}/>
        ))}
      </div>
      <div style={{padding:"0 14px 80px"}}>
        {loading?<MSpinner t={t}/>:
          <MCard t={t}>
            {filtered.length===0?<MEmpty t={t} message="No members found"/>:
              filtered.map((s,i)=>{
                const name=fullName(s);
                const sid=s.student_id||s.id||"—";
                const cls=s.class_name||"—";
                const active=s.status==="active";
                return(
                  <MRow key={s.id||i} t={t} last={i===filtered.length-1}
                    onClick={()=>openDetail(s)}>
                    <MAvatar name={name} color={t.pri}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:14,fontWeight:700,color:t.txt}}>{name}</div>
                      <div style={{fontSize:12,color:t.sft}}>{sid} · {cls}</div>
                    </div>
                    <MBadge t={t} label={active?"Active":s.status||"Inactive"} color={active?"green":s.status==="suspended"?"amber":"red"}/>
                    <ChevronRight size={15} color={t.mut} style={{marginLeft:4,flexShrink:0}}/>
                  </MRow>
                );
              })
            }
          </MCard>
        }
      </div>
      {/* FAB */}
      <div onClick={()=>setAddSheet(true)}
        style={{position:"fixed",bottom:90,right:20,width:52,height:52,borderRadius:26,
          background:t.pri,boxShadow:"0 4px 18px rgba(0,0,0,.28)",
          display:"flex",alignItems:"center",justifyContent:"center",
          cursor:"pointer",zIndex:100}}>
        <Plus size={24} color="#fff" strokeWidth={2.5}/>
      </div>
      {/* Add student sheet */}
      <AddStudentSheet t={t} ctx={ctx} open={addSheet}
        onClose={()=>setAddSheet(false)}
        onDone={()=>{setAddSheet(false);load();}}/>
    </div>
  );
}

function AddStudentSheet({t, ctx, open, onClose, onDone}){
  const [firstName,setFirstName]=useState("");
  const [lastName,setLastName]=useState("");
  const [classes,setClasses]=useState([]);
  const [classId,setClassId]=useState("");
  const [saving,setSaving]=useState(false);

  useEffect(()=>{
    if(open&&classes.length===0){
      db.getClasses().then(({data})=>{
        const c=data||[];
        setClasses(c);
        if(c[0]) setClassId(String(c[0].id));
      }).catch(()=>{});
    }
  },[open]);

  const save=async()=>{
    if(!firstName.trim()||!lastName.trim()){ctx.notify?.("Enter first and last name","warn");return;}
    if(!classId){ctx.notify?.("Select a group","warn");return;}
    setSaving(true);
    try{
      await db.upsertStudent({
        first_name:firstName.trim(),last_name:lastName.trim(),
        class_id:classId,status:"active",
      });
      ctx.notify?.("Member added!");
      setFirstName("");setLastName("");
      onDone?.();
    }catch(e){ctx.notify?.("Failed to add member","error");}
    setSaving(false);
  };

  return(
    <MBottomSheet t={t} open={open} onClose={onClose} title="Add New Member">
      <MInputField t={t} label="First Name" value={firstName} onChange={setFirstName} placeholder="First name"/>
      <MInputField t={t} label="Last Name" value={lastName} onChange={setLastName} placeholder="Last name"/>
      <MSelectField t={t} label="Group" value={classId} onChange={setClassId}
        options={classes.map(c=>({v:String(c.id),l:c.name}))}/>
      <MPrimaryBtn t={t} label="Add Member" onClick={save} loading={saving}/>
    </MBottomSheet>
  );
}

// ─── ADMIN: FEES ─────────────────────────────────────────────────────────────
function AdminFees({t, ctx}){
  const {setScreen}=ctx;
  const [bills,setBills]=useState([]);
  const [loading,setLoading]=useState(true);
  const [stats,setStats]=useState({collected:0,rate:0,paid:0,partial:0,unpaid:0,total:0});

  useEffect(()=>{
    Promise.all([db.getFeeBills(),db.getFeePayments()]).then(([b,p])=>{
      const allBills=b.data||[];
      const payments=p.data||[];
      const collected=payments.reduce((s,p)=>s+(+p.amount||0),0);
      const paid=allBills.filter(b=>b.status==="paid").length;
      const partial=allBills.filter(b=>b.status==="partial").length;
      const unpaid=allBills.filter(b=>b.status==="unpaid"||!b.status).length;
      const total=allBills.length;
      const rate=total>0?Math.round((paid/total)*100):0;
      setStats({collected,rate,paid,partial,unpaid,total});
      // Show last 10 bills
      setBills(allBills.slice(0,10));
      setLoading(false);
    }).catch(()=>setLoading(false));
  },[]);

  if(loading) return <MSpinner t={t}/>;
  return(
    <div style={{padding:"14px 14px 0",background:t.bg}}>
      {/* Summary card */}
      <div style={{background:t.card,borderRadius:18,padding:16,marginBottom:14,
        border:`1px solid ${t.brd}`}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:11}}>
          <div>
            <div style={{fontSize:11,color:t.sft,fontWeight:600,textTransform:"uppercase",letterSpacing:.3}}>
              Total Collected</div>
            <div style={{fontSize:24,fontWeight:900,color:t.tag.green[1]}}>
              {fmt(stats.collected)}</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:11,color:t.sft,fontWeight:600,textTransform:"uppercase",letterSpacing:.3}}>
              Collection Rate</div>
            <div style={{fontSize:24,fontWeight:900,color:t.pri}}>{stats.rate}%</div>
          </div>
        </div>
        <div style={{height:8,borderRadius:4,background:t.bg,overflow:"hidden"}}>
          <div style={{width:`${stats.rate}%`,height:"100%",borderRadius:4,
            background:`linear-gradient(90deg,${t.pri},${t.acc})`}}/>
        </div>
        <div style={{fontSize:12,color:t.sft,marginTop:7}}>
          {stats.paid} paid · {stats.partial} partial · {stats.unpaid} unpaid
        </div>
      </div>
      {/* Mini stats */}
      <div style={{display:"flex",gap:8,marginBottom:14}}>
        {[
          {n:stats.paid,   l:"PAID",    c:"green"},
          {n:stats.partial,l:"PARTIAL", c:"amber"},
          {n:stats.unpaid, l:"UNPAID",  c:"red"},
        ].map(({n,l,c})=>{
          const [,tc]=t.tag[c];
          return(
            <div key={l} style={{flex:1,background:t.card,borderRadius:14,padding:12,
              border:`1px solid ${t.brd}`,textAlign:"center"}}>
              <div style={{fontSize:20,fontWeight:900,color:tc}}>{n}</div>
              <div style={{fontSize:10,fontWeight:700,color:t.sft,marginTop:2}}>{l}</div>
            </div>
          );
        })}
      </div>
      {/* Billing tracker list */}
      <MSHdr t={t} title="Payment Tracker" action="Generate Bills" onAction={()=>setScreen("fee-generate")}/>
      <MCard t={t} style={{marginBottom:14}}>
        {bills.length===0?<MEmpty t={t} message="No bills found"/>:
          bills.map((b,i)=>{
            const name=b.student_name||b.student_id||"Member";
            const sc=b.status==="paid"?"green":b.status==="partial"?"amber":"red";
            const lbl=b.status==="paid"?"Paid":b.status==="partial"?"Partial":"Unpaid";
            return(
              <MRow key={b.id||i} t={t} last={i===bills.length-1}
                onClick={()=>{ctx.setSelected?.({bill:b});setScreen("bill-detail");}}>
                <MAvatar name={name} color={t.pri}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:700,color:t.txt}}>{name}</div>
                  <div style={{fontSize:11,color:t.sft}}>
                    {fmt(+b.amount_paid||0)} / {fmt(+b.total_amount||0)}</div>
                </div>
                <MBadge t={t} label={lbl} color={sc}/>
                <ChevronRight size={15} color={t.mut} style={{marginLeft:4,flexShrink:0}}/>
              </MRow>
            );
          })
        }
      </MCard>
    </div>
  );
}

// ─── ADMIN: RESULTS ───────────────────────────────────────────────────────────
function AdminResults({t, ctx}){
  const {user,notify}=ctx;
  const [approvals,setApprovals]=useState([]);
  const [published,setPublished]=useState([]);
  const [loading,setLoading]=useState(true);
  const [acting,setActing]=useState(null);

  const load=()=>{
    setLoading(true);
    Promise.all([db.getResultApprovals(),db.getReportPublish()])
      .then(([a,p])=>{
        setApprovals(a.data||[]);
        setPublished((p.data||[]).filter(r=>r.is_published));
        setLoading(false);
      }).catch(()=>setLoading(false));
  };
  useEffect(load,[]);

  const handleApprove=async(item)=>{
    const key=item.id+"approve";
    setActing(key);
    try{
      const cid=item.class_id, tid=item.term_id, sid=item.session_id, uid=user?.id||"admin";
      const role=user?.role||"admin";
      // EA approve if not done, else MA approve
      if(item.ea_status!=="approved"){
        await db.approveEA(cid,tid,sid,uid,"Approved via mobile app");
        notify?.("EA approved!");
      } else if(item.ma_status!=="approved"){
        await db.approveMA(cid,tid,sid,uid,"Approved via mobile app");
        notify?.("MA approved!");
      }
      load();
    }catch(e){notify?.("Approval failed","error");}
    setActing(null);
  };

  const handlePublish=async(item)=>{
    const key=item.id+"publish";
    setActing(key);
    try{
      await db.upsertReportPublish({
        class_id:item.class_id,term_id:item.term_id,
        session_id:item.session_id,is_published:true,
        published_by:user?.id||"admin",
        published_at:new Date().toISOString(),
      });
      notify?.("Results published!");
      load();
    }catch(e){notify?.("Publish failed","error");}
    setActing(null);
  };

  if(loading) return <MSpinner t={t}/>;
  return(
    <div style={{padding:"14px 14px 0",background:t.bg}}>
      <MSHdr t={t} title="Result Approvals"/>
      <MCard t={t} style={{marginBottom:14}}>
        {approvals.length===0?<MEmpty t={t} message="No approvals yet"/>:
          approvals.map((item,i)=>{
            const eaCol=item.ea_status==="approved"?"green":item.ea_status==="pending"?"amber":"blue";
            const maCol=item.ma_status==="approved"?"green":item.ma_status==="pending"?"amber":"blue";
            const bothApproved=item.ea_status==="approved"&&item.ma_status==="approved";
            const isPublished=published.some(p=>p.class_id===item.class_id&&p.term_id===item.term_id);
            const btnKey=item.id+(bothApproved?"publish":"approve");
            const busy=acting===btnKey;
            return(
              <MRow key={item.id||i} t={t} last={i===approvals.length-1}>
                <div style={{width:40,height:40,borderRadius:11,background:t.bg,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  flexShrink:0,color:t.pri}}>
                  <ClipboardList size={20}/>
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:700,color:t.txt}}>
                    {item.class_name||`Group ${item.class_id}`}</div>
                  <div style={{display:"flex",gap:5,marginTop:3,flexWrap:"wrap"}}>
                    <MBadge t={t} label={`EA: ${item.ea_status||"none"}`} color={eaCol}/>
                    <MBadge t={t} label={`MA: ${item.ma_status||"none"}`} color={maCol}/>
                  </div>
                </div>
                {!isPublished&&(
                  <div onClick={()=>bothApproved?handlePublish(item):handleApprove(item)}
                    style={{padding:"6px 10px",borderRadius:8,fontSize:12,fontWeight:700,
                      cursor:busy?"default":"pointer",flexShrink:0,
                      background:bothApproved?t.tag.green[0]:t.tag.amber[0],
                      color:bothApproved?t.tag.green[1]:t.tag.amber[1],
                      border:`1px solid ${bothApproved?t.tag.green[1]:t.tag.amber[1]}40`,
                      opacity:busy?.5:1,
                      display:"flex",alignItems:"center",gap:4}}>
                    {busy?<Loader2 size={12} style={{animation:"spin 1s linear infinite"}}/>:null}
                    {bothApproved?"Publish":"Approve"}
                  </div>
                )}
                {isPublished&&<MBadge t={t} label="Live" color="green"/>}
              </MRow>
            );
          })
        }
      </MCard>
      <MSHdr t={t} title="Published Reports"/>
      <MCard t={t} style={{marginBottom:14}}>
        {published.length===0?<MEmpty t={t} message="No published cards yet"/>:
          published.map((r,i)=>(
            <MRow key={r.id||i} t={t} last={i===published.length-1}>
              <div style={{width:40,height:40,borderRadius:11,background:t.tag.green[0],
                display:"flex",alignItems:"center",justifyContent:"center",
                flexShrink:0,color:t.tag.green[1]}}>
                <FileText size={18}/>
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:14,fontWeight:700,color:t.txt}}>
                  {r.class_name||`Group ${r.class_id}`} — {r.term_name||"Period"}</div>
                <div style={{fontSize:12,color:t.sft}}>Published</div>
              </div>
              <MBadge t={t} label="Live" color="green"/>
            </MRow>
          ))
        }
      </MCard>
    </div>
  );
}

// ─── ADMIN: MORE (Module Hub) ─────────────────────────────────────────────────
function AdminMore({t, ctx}){
  const {setScreen,pendingApprovals}=ctx;
  const modules=[
    {id:"members",      l:"Members",       sub:"Staff management",   Icon:Users,        col:"#111827"},
    {id:"announce",     l:"Announcements", sub:"Post & view notices", Icon:Bell,         col:"#111827"},
    {id:"calendar",     l:"Calendar",      sub:"Performance events",    Icon:Calendar,     col:"#15803D"},
    {id:"settings",     l:"Settings",      sub:"Organization config",      Icon:Settings,     col:"#7C3AED"},
    {id:"mail-compose", l:"Email",         sub:"Compose & send",     Icon:Mail,         col:"#111827"},
    {id:"report-cards", l:"Reports",  sub:"Publish cards",      Icon:FileText,     col:"#15803D"},
    {id:"grading",      l:"Grading",       sub:"Grade schema",       Icon:Award,        col:"#D97706"},
    {id:"timetable",    l:"Timetable",     sub:"Group schedule",     Icon:CalendarDays, col:"#7C3AED"},
    {id:"audit-log",    l:"Audit Log",     sub:"All actions",        Icon:History,      col:"#111827"},
    {id:"export",       l:"Data Export",   sub:"Download XLS",       Icon:Download,     col:"#15803D"},
    {id:"recycle-bin",  l:"Recycle Bin",   sub:"Deleted items",      Icon:Trash2,       col:"#DC2626"},
    {id:"activity",     l:"Activity",      sub:"Login history",      Icon:Activity,     col:"#D97706"},
    {id:"approvals",    l:"Approvals",     sub:"Member requests",   Icon:CheckCircle2, col:"#15803D"},
    {id:"fee-stats",    l:"Billing Stats",     sub:"Financial analysis", Icon:BarChart2,    col:"#111827"},
    {id:"profile",      l:"My Profile",    sub:"Account & settings", Icon:UserCircle,   col:"#64748B"},
  ];
  return(
    <div style={{padding:"14px 14px 18px",background:t.bg,minHeight:"100%"}}>
      <div style={{fontSize:15,fontWeight:800,color:t.txt,letterSpacing:-.3,marginBottom:14}}>
        All Modules</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
        {modules.map(m=>(
          <div key={m.id} onClick={()=>setScreen(m.id)}
            style={{background:t.card,borderRadius:16,padding:"14px 10px 12px",
              border:`1px solid ${t.brd}`,textAlign:"center",cursor:"pointer",
              transition:"transform .08s"}}
            onTouchStart={e=>e.currentTarget.style.transform="scale(.94)"}
            onTouchEnd={e=>e.currentTarget.style.transform="scale(1)"}>
            <div style={{width:46,height:46,borderRadius:14,background:m.col+"18",
              margin:"0 auto 8px",display:"flex",alignItems:"center",justifyContent:"center",
              color:m.col}}>
              <m.Icon size={22}/>
            </div>
            <div style={{fontSize:12,fontWeight:800,color:t.txt,marginBottom:2,lineHeight:1.2}}>
              {m.l}
              {m.id==="approvals"&&pendingApprovals>0&&(
                <span style={{marginLeft:4,background:"#111827",color:"#fff",
                  borderRadius:8,fontSize:9,fontWeight:900,padding:"1px 5px"}}>
                  {pendingApprovals}</span>
              )}
            </div>
            <div style={{fontSize:10,color:t.sft}}>{m.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── TEACHER: DASHBOARD ───────────────────────────────────────────────────────
function TeacherDashboard({t, ctx}){
  const {user,setScreen}=ctx;
  const [slots,setSlots]=useState([]);
  const [actions,setActions]=useState([]);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    const today=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][new Date().getDay()];
    Promise.all([
      db.getTimetableForTeacher?db.getTimetableForTeacher(user?.staff_id):Promise.resolve({data:[]}),
      db.getResultApprovals(),
    ]).then(([tt,approvals])=>{
      const todaySlots=(tt.data||[]).filter(s=>s.day===today).sort((a,b)=>a.start_time>b.start_time?1:-1);
      setSlots(todaySlots.slice(0,4));
      const pending=(approvals.data||[]).filter(a=>a.ea_status==="pending");
      const acts=[];
      if(pending.length>0) acts.push({title:`Submit EA Approval`,sub:`${pending.length} class(es) pending`,urgent:true,screen:"results"});
      acts.push({title:"Upload Results",sub:"Check all groups are uploaded",urgent:false,screen:"results"});
      acts.push({title:"Mark Attendance",sub:"Today's attendance",urgent:false,screen:"attendance"});
      setActions(acts);
      setLoading(false);
    }).catch(()=>setLoading(false));
  },[]);

  if(loading) return <MSpinner t={t}/>;
  return(
    <div style={{padding:"14px 14px 0",background:t.bg}}>
      <MSHdr t={t} title="Today's Groups"/>
      <div style={{display:"flex",flexDirection:"column",gap:9,marginBottom:18}}>
        {slots.length===0
          ?<div style={{background:t.card,borderRadius:14,padding:"16px",
              border:`1px solid ${t.brd}`,textAlign:"center",color:t.sft,fontSize:14}}>
              No groups today
            </div>
          :slots.map((c,i)=>{
            const done=false;
            return(
              <div key={i} style={{background:t.card,borderRadius:14,padding:"11px 14px",
                border:`1px solid ${t.brd}`,display:"flex",gap:12,alignItems:"center",
                opacity:done?.7:1}}>
                <div style={{width:44,height:44,borderRadius:12,
                  background:done?t.tag.green[0]:t.tag.blue[0],
                  display:"flex",alignItems:"center",justifyContent:"center",
                  color:done?t.tag.green[1]:t.pri}}>
                  <BookOpen size={20}/>
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:14,fontWeight:700,color:t.txt}}>
                    {c.class_name||"Group"} — {c.subject_name||"Category"}</div>
                  <div style={{fontSize:12,color:t.sft}}>{c.start_time} – {c.end_time}</div>
                </div>
                {!done&&<ChevronRight size={16} color={t.mut}/>}
              </div>
            );
          })
        }
      </div>
      <MSHdr t={t} title="Action Required"/>
      <MCard t={t} style={{marginBottom:14}}>
        {actions.map((item,i)=>(
          <MRow key={i} t={t} last={i===actions.length-1} onClick={()=>setScreen(item.screen)}>
            <div style={{width:7,height:7,borderRadius:4,flexShrink:0,
              background:item.urgent?t.acc:t.pri}}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:700,color:t.txt}}>{item.title}</div>
              <div style={{fontSize:12,color:t.sft}}>{item.sub}</div>
            </div>
            <ChevronRight size={16} color={t.mut}/>
          </MRow>
        ))}
      </MCard>
    </div>
  );
}

// ─── TEACHER: ATTENDANCE ──────────────────────────────────────────────────────
function TeacherAttendance({t, ctx}){
  const {user,notify}=ctx;
  const [classes,setClasses]=useState([]);
  const [selClass,setSelClass]=useState(null);
  const [students,setStudents]=useState([]);
  const [marked,setMarked]=useState(new Set());
  const [saving,setSaving]=useState(false);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    db.getClasses().then(({data})=>{
      const cls=data||[];
      setClasses(cls);
      if(cls[0]) setSelClass(cls[0]);
      setLoading(false);
    }).catch(()=>setLoading(false));
  },[]);

  useEffect(()=>{
    if(!selClass) return;
    setLoading(true);
    db.getStudents(null,{class_id:selClass.id}).then(({data})=>{
      const studs=data||[];
      setStudents(studs);
      setMarked(new Set(studs.map((_,i)=>i))); // default all present
      setLoading(false);
    }).catch(()=>setLoading(false));
  },[selClass?.id]);

  const toggle=i=>{
    setMarked(prev=>{const n=new Set(prev);n.has(i)?n.delete(i):n.add(i);return n;});
  };

  const save=async()=>{
    setSaving(true);
    const today=new Date().toISOString().split("T")[0];
    const records=students.map((s,i)=>({
      student_id:String(s.student_id||s.id),
      date:today,
      present:marked.has(i),
    }));
    try{
      if(db.upsertAttendance) await db.upsertAttendance(records);
      notify?.("Attendance saved!");
    }catch(e){ notify?.("Error saving attendance","error"); }
    setSaving(false);
  };

  return(
    <div style={{background:t.bg,minHeight:"100%",display:"flex",flexDirection:"column"}}>
      {/* Group selector */}
      <div style={{background:t.card,padding:"10px 14px",borderBottom:`1px solid ${t.brd}`,
        display:"flex",gap:7,overflowX:"auto"}}>
        {classes.map((c,i)=>(
          <MFilterChip key={c.id||i} t={t} label={c.name}
            active={selClass?.id===c.id} onClick={()=>setSelClass(c)}/>
        ))}
      </div>
      {/* Stats bar */}
      <div style={{background:t.card,padding:"9px 14px",borderBottom:`1px solid ${t.brd}`,
        display:"flex",gap:18}}>
        <div style={{fontSize:12,color:t.tag.green[1],fontWeight:700}}>✓ {marked.size} Present</div>
        <div style={{fontSize:12,color:t.tag.red[1],fontWeight:700}}>✗ {students.length-marked.size} Absent</div>
        <div style={{fontSize:12,color:t.sft}}>{students.length} Total</div>
      </div>
      {/* Member list */}
      <div style={{flex:1,overflowY:"auto",padding:"10px 14px"}}>
        {loading?<MSpinner t={t}/>:
          <MCard t={t}>
            {students.length===0?<MEmpty t={t} message="No members in this group"/>:
              students.map((s,i)=>{
                const present=marked.has(i);
                const name=fullName(s);
                return(
                  <MRow key={s.id||i} t={t} last={i===students.length-1}>
                    <MAvatar name={name} size={34}
                      color={present?t.tag.green[1]:t.tag.red[1]}/>
                    <div style={{flex:1,fontSize:13,fontWeight:600,color:t.txt}}>{name}</div>
                    <div onClick={()=>toggle(i)}
                      style={{width:30,height:30,borderRadius:8,cursor:"pointer",
                        background:present?t.tag.green[0]:t.tag.red[0],
                        border:`2px solid ${present?t.tag.green[1]:t.tag.red[1]}`,
                        display:"flex",alignItems:"center",justifyContent:"center",
                        color:present?t.tag.green[1]:t.tag.red[1],fontWeight:800}}>
                      {present?<Check size={14}/>:<X size={14}/>}
                    </div>
                  </MRow>
                );
              })
            }
          </MCard>
        }
      </div>
      {/* Save button */}
      <div style={{padding:"10px 14px 18px",background:t.bg,borderTop:`1px solid ${t.brd}`}}>
        <button onClick={save} disabled={saving}
          style={{width:"100%",height:48,borderRadius:14,border:"none",
            background:t.hdr,color:"#fff",fontSize:15,fontWeight:800,
            cursor:saving?"default":"pointer",
            display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
          {saving?<Loader2 size={18} style={{animation:"spin 1s linear infinite"}}/>:"Save Attendance"}
        </button>
      </div>
    </div>
  );
}

// ─── TEACHER: RESULTS ─────────────────────────────────────────────────────────
function TeacherResults({t, ctx}){
  const {user,notify}=ctx;
  const [approvals,setApprovals]=useState([]);
  const [loading,setLoading]=useState(true);
  const [eaSheet,setEaSheet]=useState(null); // holds the item to submit EA for
  const [notes,setNotes]=useState("");
  const [submitting,setSubmitting]=useState(false);

  const load=()=>{
    setLoading(true);
    db.getResultApprovals().then(({data})=>{setApprovals(data||[]);setLoading(false);})
      .catch(()=>setLoading(false));
  };
  useEffect(load,[]);

  const submitEA=async()=>{
    if(!eaSheet) return;
    setSubmitting(true);
    try{
      await db.approveEA(eaSheet.class_id,eaSheet.term_id,eaSheet.session_id,
        user?.teacher_db_id||user?.id,notes||"Submitted via mobile app");
      notify?.("EA submitted for approval!");
      setEaSheet(null);setNotes("");
      load();
    }catch(e){notify?.("Submission failed","error");}
    setSubmitting(false);
  };

  if(loading) return <MSpinner t={t}/>;
  return(
    <div style={{padding:"14px 14px 0",background:t.bg}}>
      <MSHdr t={t} title="Results Upload Status"/>
      <div style={{fontSize:12,color:t.sft,marginBottom:10,padding:"8px 12px",
        background:t.card,borderRadius:10,border:`1px solid ${t.brd}`}}>
        💡 Upload raw scores via the web portal. Use this screen to submit EA approval.
      </div>
      <MCard t={t} style={{marginBottom:14}}>
        {approvals.length===0?<MEmpty t={t} message="No groups found"/>:
          approvals.map((c,i)=>{
            const eaStatus=c.ea_status||"none";
            const eaCol=eaStatus==="approved"?"green":eaStatus==="pending"?"amber":"blue";
            const maCol=(c.ma_status||"none")==="approved"?"green":(c.ma_status||"none")==="pending"?"amber":"blue";
            const canSubmit=eaStatus==="none"||eaStatus==="pending";
            return(
              <MRow key={c.id||i} t={t} last={i===approvals.length-1}>
                <div style={{width:42,height:42,borderRadius:12,background:t.bg,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  color:t.pri,flexShrink:0}}>
                  <ClipboardList size={20}/>
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:14,fontWeight:700,color:t.txt}}>
                    {c.class_name||`Group ${c.class_id}`}</div>
                  <div style={{display:"flex",gap:5,marginTop:3,flexWrap:"wrap"}}>
                    <MBadge t={t} label={`EA: ${eaStatus}`} color={eaCol}/>
                    {c.ma_status&&c.ma_status!=="none"&&
                      <MBadge t={t} label={`MA: ${c.ma_status}`} color={maCol}/>}
                  </div>
                </div>
                {eaStatus==="approved"
                  ?<MBadge t={t} label="Done" color="green"/>
                  :<div onClick={()=>{setEaSheet(c);setNotes("");}}
                    style={{padding:"6px 10px",borderRadius:8,fontSize:12,fontWeight:700,
                      cursor:"pointer",background:t.tag.amber[0],color:t.tag.amber[1],
                      border:`1px solid ${t.tag.amber[1]}40`}}>
                    Submit EA
                  </div>
                }
              </MRow>
            );
          })
        }
      </MCard>
      <MBottomSheet t={t} open={!!eaSheet} onClose={()=>{setEaSheet(null);setNotes("");}}
        title={`Submit EA — ${eaSheet?.class_name||"Group"}`}>
        <div style={{fontSize:13,color:t.sft,marginBottom:14}}>
          Confirm that results for this group are ready for management approval.
        </div>
        <MInputField t={t} label="Notes (optional)" value={notes} onChange={setNotes}
          placeholder="Any notes for management…" textarea/>
        <MPrimaryBtn t={t} label="Submit for EA Approval" onClick={submitEA} loading={submitting}/>
      </MBottomSheet>
    </div>
  );
}

// ─── TEACHER: TIMETABLE ───────────────────────────────────────────────────────
function TeacherTimetable({t, ctx}){
  const {user}=ctx;
  const [slots,setSlots]=useState([]);
  const [loading,setLoading]=useState(true);
  const days=["Mon","Tue","Wed","Thu","Fri"];
  const times=["8am","9am","10am","11am","12pm","1pm","2pm"];

  useEffect(()=>{
    const fn=db.getTimetableForTeacher||db.getTimetableSlots;
    if(!fn){setLoading(false);return;}
    fn(user?.staff_id).then(({data})=>{setSlots(data||[]);setLoading(false);})
      .catch(()=>setLoading(false));
  },[]);

  const grid={};
  slots.forEach(s=>{
    const day=s.day?.slice(0,3);
    const hr=parseInt((s.start_time||"0").split(":")[0]);
    const key=`${day}-${hr<12?hr+"am":hr===12?"12pm":(hr-12)+"pm"}`;
    grid[key]={cls:s.class_name||"",sub:s.subject_name||""};
  });

  if(loading) return <MSpinner t={t}/>;
  return(
    <div style={{background:t.bg,overflowX:"auto",padding:14}}>
      <div style={{minWidth:380}}>
        <div style={{display:"flex",gap:4,marginBottom:4}}>
          <div style={{width:32}}/>
          {days.map(d=>(
            <div key={d} style={{flex:1,textAlign:"center",fontSize:11,fontWeight:800,
              color:t.sft,padding:"3px 0"}}>{d}</div>
          ))}
        </div>
        {times.map(slot=>(
          <div key={slot} style={{display:"flex",gap:4,marginBottom:4}}>
            <div style={{width:32,fontSize:10,color:t.mut,paddingTop:8,
              textAlign:"right",paddingRight:4}}>{slot}</div>
            {days.map(day=>{
              const e=grid[`${day}-${slot}`];
              return(
                <div key={day} style={{flex:1,height:48,borderRadius:8,
                  background:e?t.pri+"1A":t.card,
                  border:`1px solid ${e?t.pri+"40":t.brd}`,
                  display:"flex",flexDirection:"column",
                  alignItems:"center",justifyContent:"center",padding:2}}>
                  {e&&<>
                    <div style={{fontSize:9,fontWeight:800,color:t.pri,lineHeight:1.3}}>{e.cls}</div>
                    <div style={{fontSize:9,color:t.sft}}>{e.sub}</div>
                  </>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── STUDENT: DASHBOARD ───────────────────────────────────────────────────────
function StudentDashboard({t, ctx}){
  const {user,setScreen}=ctx;
  const [bill,setBill]=useState(null);
  const [results,setResults]=useState([]);
  const [notices,setNotices]=useState([]);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    Promise.all([
      db.getStudentBills?db.getStudentBills(user?.student_id):db.getFeeBills(),
      db.getResults?db.getResults({student_id:user?.student_id}):Promise.resolve({data:[]}),
      db.getAnnouncements?.()??Promise.resolve({data:[]}),
    ]).then(([b,r,a])=>{
      const bills=b.data||[];
      const latestBill=bills[0]||null;
      setBill(latestBill);
      setResults((r.data||[]).slice(0,3));
      setNotices((a.data||[]).slice(0,1));
      setLoading(false);
    }).catch(()=>setLoading(false));
  },[]);

  if(loading) return <MSpinner t={t}/>;
  const balance=bill?(+bill.total_amount||0)-(+bill.amount_paid||0):0;
  return(
    <div style={{background:t.bg}}>
      {/* Outstanding balance alert */}
      {balance>0&&(
        <div onClick={()=>setScreen("my-bill")}
          style={{margin:"14px 14px 0",borderRadius:16,padding:"13px 14px",
            background:"linear-gradient(135deg,#DC2626,#B91C1C)",
            display:"flex",gap:12,alignItems:"center",cursor:"pointer"}}>
          <AlertTriangle size={22} color="#fff"/>
          <div style={{flex:1}}>
            <div style={{fontSize:14,fontWeight:800,color:"#fff"}}>Outstanding Balance</div>
            <div style={{fontSize:12,color:"rgba(255,255,255,.8)"}}>
              {fmt(balance)} due — tap to pay</div>
          </div>
          <ChevronRight size={18} color="#fff"/>
        </div>
      )}
      {/* Stat cards */}
      <div style={{display:"flex",gap:9,padding:"12px 14px 0"}}>
        <MStatCard t={t} label="Current Period" value="2nd" sub="2024/25"
          color="blue" icon={<CalendarDays size={18}/>}/>
        <MStatCard t={t} label="Last Average"
          value={results.length?`${Math.round(results.reduce((s,r)=>s+(+r.total_score||0),0)/results.length)}%`:"—"}
          sub="1st Period" color="green" icon={<BarChart3 size={18}/>}/>
      </div>
      {/* Recent results */}
      <div style={{padding:"14px 14px 0"}}>
        <MSHdr t={t} title="Recent Results" action="View All" onAction={()=>setScreen("my-results")}/>
        <MCard t={t} style={{marginBottom:14}}>
          {results.length===0?<MEmpty t={t} message="No results yet"/>:
            results.map((r,i)=>{
              const score=+r.total_score||0;
              const grade=r.grade||"—";
              const gc=grade==="A"?t.tag.green[1]:grade==="B"?t.pri:
                grade==="F"?t.tag.red[1]:t.tag.amber[1];
              return(
                <MRow key={r.id||i} t={t} last={i===results.length-1}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:700,color:t.txt,marginBottom:5}}>
                      {r.subject_name||`Category ${r.subject_id}`}</div>
                    <div style={{height:4,borderRadius:2,background:t.bg,overflow:"hidden"}}>
                      <div style={{width:`${Math.min(score,100)}%`,height:"100%",
                        background:gc,borderRadius:2}}/>
                    </div>
                  </div>
                  <div style={{width:36,height:36,borderRadius:10,marginLeft:12,
                    background:gc+"18",color:gc,display:"flex",flexDirection:"column",
                    alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    <div style={{fontSize:14,fontWeight:900}}>{grade}</div>
                    <div style={{fontSize:9,fontWeight:600}}>{score}</div>
                  </div>
                </MRow>
              );
            })
          }
        </MCard>
        {/* Notices preview */}
        {notices.length>0&&<>
          <MSHdr t={t} title="Announcements" action="See All" onAction={()=>setScreen("announce")}/>
          {notices.map((n,i)=>(
            <div key={i} style={{background:t.card,borderRadius:14,padding:"13px 14px",
              border:`1px solid ${t.brd}`,marginBottom:14}}>
              <div style={{fontSize:13,fontWeight:700,color:t.txt}}>📢 {n.title}</div>
              <div style={{fontSize:12,color:t.sft,marginTop:4,lineHeight:1.5}}>
                {(n.body||n.content||"").slice(0,100)}…</div>
              <div style={{fontSize:11,color:t.mut,marginTop:6}}>
                {n.created_at?new Date(n.created_at).toLocaleDateString("en-NG"):"Recently"}</div>
            </div>
          ))}
        </>}
      </div>
    </div>
  );
}

// ─── STUDENT: MY BILL ─────────────────────────────────────────────────────────
function StudentBill({t, ctx}){
  const {user}=ctx;
  const [bills,setBills]=useState([]);
  const [selTerm,setSelTerm]=useState(0);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    db.getFeeBills().then(({data})=>{
      const mine=(data||[]).filter(b=>String(b.student_id)===String(user?.student_id||user?.id));
      setBills(mine);
      setLoading(false);
    }).catch(()=>setLoading(false));
  },[]);

  if(loading) return <MSpinner t={t}/>;
  const bill=bills[selTerm]||bills[0];
  const items=(bill?.fee_bill_items||[]);
  const total=+bill?.total_amount||0;
  const paid=+bill?.amount_paid||0;
  const balance=total-paid;
  const pct=total>0?Math.round((paid/total)*100):0;

  return(
    <div style={{padding:"14px 14px 0",background:t.bg}}>
      {/* Period selector */}
      <div style={{display:"flex",gap:7,marginBottom:14}}>
        {bills.length===0
          ?<div style={{color:t.sft,fontSize:14,padding:"8px 0"}}>No bills found</div>
          :bills.slice(0,3).map((b,i)=>(
            <div key={i} onClick={()=>setSelTerm(i)}
              style={{flex:1,textAlign:"center",padding:"8px 4px",borderRadius:10,
                fontSize:12,fontWeight:600,cursor:"pointer",
                background:selTerm===i?t.pri:t.card,
                color:selTerm===i?"#fff":t.sft,
                border:`1px solid ${selTerm===i?t.pri:t.brd}`}}>
              {b.term_name||`Bill ${i+1}`}
            </div>
          ))
        }
      </div>
      {bill&&<>
        {/* Summary card */}
        <div style={{background:t.card,borderRadius:18,padding:16,marginBottom:14,
          border:`1px solid ${t.brd}`}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:11}}>
            <div>
              <div style={{fontSize:11,color:t.sft,textTransform:"uppercase",letterSpacing:.3}}>
                Total Billing</div>
              <div style={{fontSize:22,fontWeight:900,color:t.txt}}>{fmt(total)}</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:11,color:t.sft,textTransform:"uppercase",letterSpacing:.3}}>
                Balance Due</div>
              <div style={{fontSize:22,fontWeight:900,color:"#DC2626"}}>{fmt(balance)}</div>
            </div>
          </div>
          <div style={{height:8,borderRadius:4,background:t.bg,overflow:"hidden",marginBottom:7}}>
            <div style={{width:`${pct}%`,height:"100%",background:"#15803D",borderRadius:4}}/>
          </div>
          <div style={{fontSize:12,color:t.sft}}>{fmt(paid)} paid · {fmt(balance)} remaining</div>
        </div>
        {/* Billing breakdown */}
        <MSHdr t={t} title="Billing Breakdown"/>
        <MCard t={t} style={{marginBottom:14}}>
          {items.length===0
            ?<MEmpty t={t} message="No items"/>
            :items.map((item,i)=>(
              <div key={i} style={{padding:"11px 14px",
                borderBottom:i<items.length-1?`1px solid ${t.brd}`:"none",
                display:"flex",alignItems:"center"}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:14,fontWeight:600,color:t.txt}}>{item.label||item.name}</div>
                  {!item.is_compulsory&&
                    <div style={{fontSize:11,color:t.mut}}>Optional</div>}
                </div>
                <div style={{fontSize:14,fontWeight:700,color:t.txt}}>{fmt(+item.amount||0)}</div>
              </div>
            ))
          }
        </MCard>
        {/* Pay button */}
        {balance>0&&(
          <div style={{marginBottom:18}}>
            <div style={{background:t.tag.amber[0],borderRadius:12,padding:"11px 14px",
              marginBottom:10,border:`1px solid ${t.tag.amber[1]}40`,
              fontSize:13,color:t.tag.amber[1],fontWeight:600}}>
              💳 To pay your balance of {fmt(balance)}, visit the organization's payment portal or pay at the bursary. Contact your organization administrator for the payment link.
            </div>
          </div>
        )}
      </>}
    </div>
  );
}

// ─── MEMBER: MY RESULTS ─────────────────────────────────────────────────────
function StudentResults({t, ctx}){
  const {user}=ctx;
  const [results,setResults]=useState([]);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    db.getResults?.({student_id:user?.student_id||user?.id})
      .then(({data})=>{setResults(data||[]);setLoading(false);})
      .catch(()=>setLoading(false));
  },[]);

  if(loading) return <MSpinner t={t}/>;
  const avg=results.length?Math.round(results.reduce((s,r)=>s+(+r.total_score||0),0)/results.length):0;
  return(
    <div style={{background:t.bg}}>
      {/* Stats bar */}
      <div style={{background:t.card,padding:"11px 14px",borderBottom:`1px solid ${t.brd}`,
        display:"flex",gap:18,alignItems:"center"}}>
        <div>
          <div style={{fontSize:11,color:t.sft,textTransform:"uppercase",letterSpacing:.3}}>Average</div>
          <div style={{fontSize:26,fontWeight:900,
            color:avg>=70?t.tag.green[1]:avg>=50?t.pri:"#DC2626"}}>{avg}%</div>
        </div>
        <div style={{width:1,height:38,background:t.brd}}/>
        <div>
          <div style={{fontSize:11,color:t.sft,textTransform:"uppercase",letterSpacing:.3}}>Categories</div>
          <div style={{fontSize:26,fontWeight:900,color:t.txt}}>{results.length}</div>
        </div>
        <div style={{width:1,height:38,background:t.brd}}/>
        <div>
          <div style={{fontSize:11,color:t.sft,textTransform:"uppercase",letterSpacing:.3}}>Period</div>
          <div style={{fontSize:14,fontWeight:800,color:t.txt}}>2nd Period</div>
          <div style={{fontSize:11,color:t.mut}}>2024/2025</div>
        </div>
      </div>
      {/* Results table */}
      <div style={{padding:"12px 14px"}}>
        <MCard t={t}>
          <div style={{display:"flex",padding:"7px 14px",borderBottom:`1px solid ${t.brd}`,
            background:t.bg}}>
            <div style={{flex:1,fontSize:11,fontWeight:700,color:t.mut,textTransform:"uppercase"}}>Category</div>
            <div style={{width:30,textAlign:"center",fontSize:11,fontWeight:700,color:t.mut}}>CA</div>
            <div style={{width:38,textAlign:"center",fontSize:11,fontWeight:700,color:t.mut}}>Exam</div>
            <div style={{width:38,textAlign:"center",fontSize:11,fontWeight:700,color:t.mut}}>Total</div>
            <div style={{width:28,textAlign:"center",fontSize:11,fontWeight:700,color:t.mut}}>Grd</div>
          </div>
          {results.length===0?<MEmpty t={t} message="No results yet"/>:
            results.map((s,i)=>{
              const g=s.grade||"—";
              const gc=g==="A"?t.tag.green[1]:g==="B"?t.pri:g==="F"?t.tag.red[1]:t.tag.amber[1];
              return(
                <div key={s.id||i} style={{display:"flex",alignItems:"center",
                  padding:"9px 14px",borderBottom:i<results.length-1?`1px solid ${t.brd}`:"none"}}>
                  <div style={{flex:1,fontSize:13,fontWeight:600,color:t.txt}}>
                    {s.subject_name||`Category ${s.subject_id}`}</div>
                  <div style={{width:30,textAlign:"center",fontSize:12,color:t.sft}}>{s.ca_score??"—"}</div>
                  <div style={{width:38,textAlign:"center",fontSize:12,color:t.sft}}>{s.exam_score??"—"}</div>
                  <div style={{width:38,textAlign:"center",fontSize:13,fontWeight:800,color:t.txt}}>
                    {s.total_score??"—"}</div>
                  <div style={{width:28,textAlign:"center"}}>
                    <span style={{fontSize:11,fontWeight:900,color:gc,
                      background:gc+"18",borderRadius:5,padding:"2px 5px"}}>{g}</span>
                  </div>
                </div>
              );
            })
          }
        </MCard>
      </div>
    </div>
  );
}

// ─── PROFILE SCREEN ───────────────────────────────────────────────────────────
function MProfileScreen({t, user, role, onLogout, onToggleDark, ctx}){
  const parts=(user?.name||"?").split(" ");
  const ini=((parts[0]?.[0]||"")+(parts[1]?.[0]||"")).toUpperCase();
  const roleLbl={admin:"Administrator",teacher:"Group Staff",
    manager:"Finance Officer",student:"Member"}[role]||role;
  const notify=ctx?.notify;

  const [pwSheet,setPwSheet]=useState(false);
  const [oldPw,setOldPw]=useState("");
  const [newPw,setNewPw]=useState("");
  const [confirmPw,setConfirmPw]=useState("");
  const [saving,setSaving]=useState(false);

  const changePassword=async()=>{
    if(!newPw.trim()){notify?.("Enter a new password","warn");return;}
    if(newPw!==confirmPw){notify?.("Passwords don't match","warn");return;}
    if(newPw.length<4){notify?.("Password too short","warn");return;}
    setSaving(true);
    try{
      if(role==="student"){
        await db.upsertStudent({password_hash:newPw.trim()},user?.student_id||user?.id);
      } else {
        await db.updateTeacherCredentials(user?.teacher_db_id||user?.id,{password_hash:newPw.trim()});
      }
      notify?.("Password changed!");
      setPwSheet(false);setOldPw("");setNewPw("");setConfirmPw("");
    }catch(e){notify?.("Failed to change password","error");}
    setSaving(false);
  };

  return(
    <div style={{background:t.bg,minHeight:"100%"}}>
      {/* Profile header */}
      <div style={{background:t.hdr,padding:"26px 20px 28px",
        display:"flex",flexDirection:"column",alignItems:"center",gap:10}}>
        <div style={{width:72,height:72,borderRadius:36,
          background:"rgba(255,255,255,.2)",border:"2px solid rgba(255,255,255,.35)",
          display:"flex",alignItems:"center",justifyContent:"center",
          fontSize:26,fontWeight:900,color:"#fff"}}>{ini}</div>
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:18,fontWeight:800,color:"#fff"}}>{user?.name||"—"}</div>
          <div style={{fontSize:13,color:"rgba(255,255,255,.6)",marginTop:3}}>
            {roleLbl}
            {(user?.staff_id||user?.student_id)&&` · ${user?.staff_id||user?.student_id}`}
          </div>
        </div>
      </div>
      <div style={{padding:"18px 14px"}}>
        <MCard t={t} style={{marginBottom:12}}>
          {/* Dark mode toggle */}
          <MRow t={t} last={false} onClick={onToggleDark}>
            <div style={{width:36,height:36,borderRadius:10,
              background:t.dark?t.pri+"22":"#F3F4F6",
              display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              {t.dark?<Sun size={17} color={t.pri}/>:<Moon size={17} color="#111827"/>}
            </div>
            <div style={{flex:1,fontSize:14,fontWeight:600,color:t.txt}}>
              {t.dark?"Switch to Light Mode":"Switch to Dark Mode"}</div>
            <div style={{width:42,height:24,borderRadius:12,
              background:t.dark?t.pri:t.brd,position:"relative",cursor:"pointer",
              transition:"background .2s",flexShrink:0}}>
              <div style={{width:20,height:20,borderRadius:10,background:"#fff",
                position:"absolute",top:2,left:t.dark?20:2,
                transition:"left .2s",boxShadow:"0 1px 4px rgba(0,0,0,.2)"}}/>
            </div>
          </MRow>
          <MRow t={t} last={false} onClick={()=>setPwSheet(true)}>
            <div style={{width:36,height:36,borderRadius:10,background:t.bg,
              border:`1px solid ${t.brd}`,display:"flex",alignItems:"center",
              justifyContent:"center",color:t.mut,flexShrink:0}}>
              <Lock size={17}/>
            </div>
            <div style={{flex:1,fontSize:14,fontWeight:600,color:t.txt}}>Change Password</div>
            <ChevronRight size={16} color={t.mut}/>
          </MRow>
          <MRow t={t} last={false} onClick={()=>notify?.("Contact your organization admin for support")}>
            <div style={{width:36,height:36,borderRadius:10,background:t.bg,
              border:`1px solid ${t.brd}`,display:"flex",alignItems:"center",
              justifyContent:"center",color:t.mut,flexShrink:0}}>
              <HelpCircle size={17}/>
            </div>
            <div style={{flex:1,fontSize:14,fontWeight:600,color:t.txt}}>Help & Support</div>
            <ChevronRight size={16} color={t.mut}/>
          </MRow>
          <MRow t={t} last onClick={()=>notify?.("JAMES-DENNING v1.0 · JAMES-DENNING")}>
            <div style={{width:36,height:36,borderRadius:10,background:t.bg,
              border:`1px solid ${t.brd}`,display:"flex",alignItems:"center",
              justifyContent:"center",color:t.mut,flexShrink:0}}>
              <Info size={17}/>
            </div>
            <div style={{flex:1,fontSize:14,fontWeight:600,color:t.txt}}>About JAMES-DENNING</div>
            <ChevronRight size={16} color={t.mut}/>
          </MRow>
        </MCard>
        {/* App info */}
        <MCard t={t} style={{marginBottom:12}}>
          <div style={{padding:"11px 16px",display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:36,height:36,borderRadius:10,background:"#111827"+"18",
              display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              <Info size={16} color="#111827"/>
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:12,fontWeight:700,color:t.txt}}>JAMES-DENNING</div>
              <div style={{fontSize:11,color:t.sft}}>v32.89 · JAMES-DENNING</div>
            </div>
          </div>
        </MCard>
        <button onClick={onLogout}
          style={{width:"100%",height:50,borderRadius:14,border:"none",
            background:"#FEF2F2",color:"#DC2626",fontSize:15,fontWeight:800,
            cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
          <LogOut size={17}/> Sign Out
        </button>
      </div>
      {/* Change password sheet */}
      <MBottomSheet t={t} open={pwSheet} onClose={()=>{setPwSheet(false);setOldPw("");setNewPw("");setConfirmPw("");}}
        title="Change Password">
        <MInputField t={t} label="New Password" value={newPw} onChange={setNewPw}
          placeholder="Enter new password" type="password"/>
        <MInputField t={t} label="Confirm Password" value={confirmPw} onChange={setConfirmPw}
          placeholder="Repeat new password" type="password"/>
        <MPrimaryBtn t={t} label="Save New Password" onClick={changePassword} loading={saving}/>
      </MBottomSheet>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export function MobileApp(){
  const [theme,setTheme]=useState(()=>localStorage.getItem("rgs_mobile_theme")||"clarity");
  const t=theme==="midnight"?MIDNIGHT:CLARITY;
  const toggleTheme=()=>{
    const next=theme==="midnight"?"clarity":"midnight";
    setTheme(next);
    localStorage.setItem("rgs_mobile_theme",next);
  };

  const [user,setUser]=useState(null);
  const [school,setSchool]=useState(()=>loadSelectedSchool());
  const [schools,setSchools]=useState([]); // all available schools
  const [loginLoading,setLoginLoading]=useState(false);
  const [loginError,setLoginError]=useState("");

  // Screen state — virtual router
  const [screen,setScreen]=useState("dashboard");
  const [screenHistory,setScreenHistory]=useState([]);
  const [pendingApprovals,setPendingApprovals]=useState(0);

  // Toast notifications
  const [toast,setToast]=useState(null);
  const toastTimer=useRef(null);
  const notify=(msg,type="success")=>{
    setToast({msg,type});
    clearTimeout(toastTimer.current);
    toastTimer.current=setTimeout(()=>setToast(null),2800);
  };

  // Shared selection state (pass data between list→detail screens)
  const [selected,setSelected]=useState({});

  // Tab-root screens per role
  const TAB_ROOTS={
    admin:["dashboard","students","fee-tracker","results","more"],
    teacher:["dashboard","attendance","results","timetable","profile"],
    manager:["dashboard","fee-tracker","fee-stats","announce","profile"],
    student:["dashboard","my-results","my-bill","announce","profile"],
  };

  const role=user?.role||"student";
  const tabRoots=TAB_ROOTS[role]||TAB_ROOTS.admin;
  const isTabRoot=tabRoots.includes(screen);
  const isSubScreen=!isTabRoot;

  // Back label map
  const SCREEN_LABELS={
    members:"Team", announce:"Notices", calendar:"Calendar", settings:"Settings",
    "mail-compose":"Send Email","report-cards":"Reports", grading:"Scoring", "audit-log":"Audit Trail", export:"Data Export",
    "recycle-bin":"Recycle Bin", activity:"Login Activity", approvals:"People Approvals", "fee-stats":"Billing Analytics",
    "fee-items":"Billing Items","fee-tracker":"Payment Tracker", "fee-generate":"Generate Bills", "my-profile":"My Profile",
    "my-payments":"My Payments", "my-bill":"My Bill", "my-results":"My Reports", timetable:"Schedule",
    students:"People", "result-approvals":"Approval Queue", attendance:"Attendance", results:"Performance", profile:"Profile",
    "student-detail":"Member Profile", "member-detail":"Staff Profile", "bill-detail":"Bill Details",
  };

  const navigate=(target)=>{
    setScreenHistory(h=>[...h,screen]);
    setScreen(target);
  };
  const goBack=()=>{
    const h=[...screenHistory];
    const prev=h.pop()||"dashboard";
    setScreenHistory(h);
    setScreen(prev);
  };
  const selectTab=(id)=>{
    setScreenHistory([]);
    setScreen(id);
  };

  const ctx={user,role,screen,setScreen:navigate,pendingApprovals,setPendingApprovals,
    selected,setSelected,notify};

  // Load pending approvals for admin
  useEffect(()=>{
    if(user?.role==="admin"){
      db.getStudentRequests?.("pending").then(({data})=>setPendingApprovals((data||[]).length)).catch(()=>{});
    }
  },[user]);

  // Restore only a real Supabase Auth session. Legacy local-only sessions are not trusted.
  useEffect(()=>{
    let active=true;
    const restore=async()=>{
      const {data:{session},error:sessionError}=await supabase.auth.getSession();
      if(!active)return;
      if(sessionError||!session?.user){clearSession();setUser(null);return;}
      const {data:profile,error:profileError}=await supabase.from("profiles").select("*").eq("id",session.user.id).maybeSingle();
      if(!active)return;
      if(profileError||!profile?.school_id){
        await supabase.auth.signOut();
        if(active){clearSession();setUser(null);setLoginError("Your account is not linked to an organization. Contact your administrator.");}
        return;
      }
      const {data:org,error:orgError}=await db.getSchool(profile.school_id);
      if(!active)return;
      if(orgError||!org){
        await supabase.auth.signOut();
        if(active){clearSession();setUser(null);setLoginError("We couldn't load your organization. Please sign in again.");}
        return;
      }
      db.setSchool(org.id,org.student_id_prefix||"SCH",org.name||"");
      saveSelectedSchool(org);setSchool(org);
      const u={id:profile.id,role:profile.role||"admin",name:profile.full_name||session.user.email,email:session.user.email,school_id:org.id,_authUserId:session.user.id};
      if(["teacher","manager","bursar"].includes(u.role)){
        const t=await supabase.from("teachers").select("*").eq("profile_id",session.user.id).maybeSingle();
        if(t.data){u.staff_id=t.data.staff_id;u.teacher_db_id=t.data.id;u.name=t.data.display_name||t.data.full_name||u.name;u._userType="teacher";}
      }
      if(u.role==="student"){
        const link=await supabase.from("student_profiles").select("student_id").eq("profile_id",session.user.id).maybeSingle();
        if(link.data){const st=await supabase.from("students").select("*").eq("id",link.data.student_id).maybeSingle();if(st.data){u.student_id=st.data.id;u.class_id=st.data.class_id;u.name=st.data.display_name||st.data.name||u.name;u._userType="student";}}
      }
      if(!active)return;
      saveSession(u);setUser(u);
    };
    restore().catch(async()=>{
      if(active){clearSession();setUser(null);setLoginError("Unable to restore your secure session. Please sign in again.");}
    });
    return()=>{active=false;};
  },[]);

  // Load organizations for the pre-authentication picker.
  useEffect(()=>{
    const saved=loadSelectedSchool();
    db.getSchools?.().then(({data})=>{
      const list=data||[];
      setSchools(list);
      if(saved?.id){
        db.setSchool(saved.id,saved.student_id_prefix||null,saved.name||null);
        setSchool(current=>current?.id?current:saved);
      }else if(list.length===1){
        const s=list[0];
        db.setSchool(s.id,s.student_id_prefix||null,s.name||null);
        saveSelectedSchool(s);setSchool(current=>current?.id?current:s);
      }
    }).catch(()=>{});
  },[]);

  // Handler for school picker selection
  const handleSelectSchool=(s)=>{
    db.setSchool(s.id,s.student_id_prefix||null,s.name||null);
    saveSelectedSchool(s);
    setSchool(s);
    setLoginError("");
  };

  const login=async(identifier,password)=>{
    setLoginLoading(true);setLoginError("");
    try{
      const id=(identifier||"").trim(),pw=password||"",schoolId=school?.id||db._schoolId||null;
      if(!id||!pw){setLoginError("Enter your ID and password.");setLoginLoading(false);return;}
      if(!schoolId){setLoginError("Select an organization first.");setLoginLoading(false);return;}
      const access=await db.getLoginAccessSettings(schoolId);
      if(access?.error)throw access.error;
      let authEmail="",expectedRole="",teacher=null,student=null,admin=null;
      if(id.toLowerCase()==="admin"){
        const result=await db.loginGetSchoolAdmin(schoolId);
        if(result.error)throw result.error;
        admin=result.data;
        if(!admin?.admin_email){setLoginError("Administrator sign-in is not configured for this organization.");setLoginLoading(false);return;}
        authEmail=String(admin.admin_email).trim().toLowerCase();expectedRole="admin";
      }else{
        const teacherResult=await db.loginFindTeacher(id,schoolId);
        if(teacherResult.error)throw teacherResult.error;
        teacher=teacherResult.data;
        if(teacher){
          if(access.login_teachers_disabled==="true"){setLoginError((access.login_disabled_message||"Staff logins are currently disabled.").trim());setLoginLoading(false);return;}
          if(teacher.status&&teacher.status!=="active"){setLoginError("This staff account is not active.");setLoginLoading(false);return;}
          const clean=id.toLowerCase().replace(/[^a-z0-9]/g,"");
          authEmail=`staff-${clean}--${schoolId}@login.internal`;expectedRole="teacher";
        }else{
          const studentResult=await db.loginFindStudent(id,schoolId);
          if(studentResult.error)throw studentResult.error;
          student=studentResult.data;
          if(!student){setLoginError("ID not recognised. Check your organization and ID.");setLoginLoading(false);return;}
          const status=student.status||"active";
          if(status!=="active"){setLoginError("This member account is not active.");setLoginLoading(false);return;}
          if(access.login_students_disabled==="true"){setLoginError((access.login_disabled_message||"Member logins are currently disabled.").trim());setLoginLoading(false);return;}
          const clean=id.toLowerCase().replace(/[^a-z0-9]/g,"");
          authEmail=`student-${clean}--${schoolId}@login.internal`;expectedRole="student";
        }
      }
      const {data:authData,error:authError}=await supabase.auth.signInWithPassword({email:authEmail,password:pw});
      if(authError||!authData?.user){setLoginError(expectedRole==="admin"?"Wrong administrator password.":"Incorrect ID or password.");setLoginLoading(false);return;}
      const authUser=authData.user;
      const {data:profile,error:profileError}=await supabase.from("profiles").select("*").eq("id",authUser.id).maybeSingle();
      const allowedRoles=expectedRole==="teacher"?["teacher","manager","bursar"]:[expectedRole];
      if(profileError||!profile?.school_id||profile.school_id!==schoolId||!allowedRoles.includes(profile.role)){
        await supabase.auth.signOut();
        setLoginError("This account is not linked to the selected organization or role.");
        setLoginLoading(false);return;
      }
      let u;
      if(expectedRole==="admin"){
        u={id:"admin",role:"admin",name:admin.admin_name||profile.full_name||"Administrator",email:authUser.email,is_admin:true,school_id:schoolId,_authUserId:authUser.id};
      }else if(expectedRole==="teacher"){
        u={id:String(teacher.id),role:teacher.role||profile.role||"teacher",name:teacher.display_name||teacher.full_name||profile.full_name,staff_id:teacher.staff_id,teacher_db_id:teacher.id,email:teacher.email||authUser.email,school_id:schoolId,_authUserId:authUser.id,_userType:"teacher"};
        db.recordLogin?.("teacher",teacher.id);
      }else{
        u={id:student.id,role:"student",name:student.display_name||fullName(student)||profile.full_name,student_id:student.id,class_id:student.class_id,email:student.email||authUser.email,school_id:schoolId,_authUserId:authUser.id,_userType:"student"};
        db.recordLogin?.("student",student.id);
      }
      db.setSchool(schoolId,school?.student_id_prefix||"SCH",school?.name||"");
      saveSession(u);setUser(u);setScreen("dashboard");setScreenHistory([]);
    }catch(e){await supabase.auth.signOut();setLoginError("Login failed. Please try again.");}
    setLoginLoading(false);
  };

  const logout=async()=>{
    await supabase.auth.signOut();
    clearSession();
    setUser(null);
    setScreen("dashboard");
    setScreenHistory([]);
    const saved=loadSelectedSchool();
    if(saved?.id) db.setSchool(saved.id,saved.student_id_prefix||null,saved.name||null);
  };

  // ── Screen renderer ──────────────────────────────────────────────────────────
  const renderScreen=()=>{
    if(!user) return <MLoginScreen t={t} onLogin={login} loading={loginLoading} error={loginError}
      school={school} schools={schools} onSelectSchool={handleSelectSchool}/>;

    // Profile is shared across all roles
    if(screen==="profile") return <MProfileScreen t={t} user={user} role={role} onLogout={logout} onToggleDark={toggleTheme} ctx={ctx}/>;

    // Cross-role detail screens
    if(screen==="student-detail")   return <StudentDetailScreen t={t} ctx={ctx}/>;
    if(screen==="member-detail")    return <MemberDetailScreen t={t} ctx={ctx}/>;
    if(screen==="bill-detail")      return <BillDetailScreen t={t} ctx={ctx}/>;
    if(screen==="announce")         return <AnnouncementsScreen t={t} ctx={ctx}/>;
    if(screen==="mail-compose")     return <MailComposeScreen t={t} ctx={ctx}/>;
    if(screen==="approvals")        return <ApprovalsScreen t={t} ctx={ctx}/>;
    if(screen==="fee-stats")        return <FeeStatsScreen t={t} ctx={ctx}/>;

    if(role==="admin"||role==="manager"){
      if(screen==="dashboard")      return <AdminDashboard t={t} ctx={ctx}/>;
      if(screen==="students")       return <AdminStudents t={t} ctx={ctx}/>;
      if(screen==="fee-tracker")    return <AdminFees t={t} ctx={ctx}/>;
      if(screen==="results"||screen==="result-approvals") return <AdminResults t={t} ctx={ctx}/>;
      if(screen==="more")           return <AdminMore t={t} ctx={ctx}/>;
      if(screen==="members")        return <AdminMembers t={t} ctx={ctx}/>;
      if(screen==="calendar")       return <AdminCalendar t={t} ctx={ctx}/>;
      if(screen==="settings")       return <AdminSettings t={t} ctx={ctx}/>;
      if(screen==="report-cards")   return <AdminReportCards t={t} ctx={ctx}/>;
      if(screen==="audit-log")      return <AdminAuditLog t={t} ctx={ctx}/>;
      if(screen==="fee-generate")   return <AdminFeeGenerate t={t} ctx={ctx}/>;
      if(screen==="export")         return <AdminExport t={t} ctx={ctx}/>;
      if(screen==="timetable")      return <TeacherTimetable t={t} ctx={ctx}/>;
    }
    if(role==="teacher"){
      if(screen==="dashboard")      return <TeacherDashboard t={t} ctx={ctx}/>;
      if(screen==="attendance")     return <TeacherAttendance t={t} ctx={ctx}/>;
      if(screen==="results")        return <TeacherResults t={t} ctx={ctx}/>;
      if(screen==="timetable")      return <TeacherTimetable t={t} ctx={ctx}/>;
    }
    if(role==="student"){
      if(screen==="dashboard")      return <StudentDashboard t={t} ctx={ctx}/>;
      if(screen==="my-results")     return <StudentResults t={t} ctx={ctx}/>;
      if(screen==="my-bill")        return <StudentBill t={t} ctx={ctx}/>;
    }
    if(screen==="recycle-bin")    return <AdminRecycleBin t={t} ctx={ctx}/>;
    if(screen==="activity")       return <AdminActivity t={t} ctx={ctx}/>;
    if(screen==="grading")        return <AdminGrading t={t} ctx={ctx}/>;
    return <MGenericScreen t={t} title={SCREEN_LABELS[screen]||screen} icon={<LayoutDashboard size={20}/>}/>;
  };

  return(
    <div style={{display:"flex",flexDirection:"column",height:"100dvh",
      background:t.bg,overflow:"hidden",fontFamily:"-apple-system,'Segoe UI',system-ui,sans-serif"}}>

      {/* Header */}
      {user&&(
        <MAppHeader
          t={t} user={user} role={role}
          onBack={isSubScreen?goBack:null}
          backLabel={SCREEN_LABELS[screen]||screen}
          onToggleDark={toggleTheme}
          pendingNotifs={pendingApprovals}
        />
      )}

      {/* Page content */}
      <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",background:t.bg}}>
        {renderScreen()}
      </div>

      {/* Tab bar */}
      {user&&(
        <MTabBar t={t} role={role} activeScreen={screen} onSelect={selectTab}/>
      )}

      {/* Toast */}
      {toast&&<MToast t={t} message={toast.msg} type={toast.type}/>}

      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        body{-webkit-tap-highlight-color:transparent;}
        input,textarea,select{font-family:inherit;font-size:16px!important;outline:none;}
        button{font-family:inherit;cursor:pointer;}
        ::-webkit-scrollbar{display:none;}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
      `}</style>
    </div>
  );
}

// ─── EXTRA SCREENS ────────────────────────────────────────────────────────────
function MGenericScreen({t, title, icon}){
  return(
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",
      justifyContent:"center",minHeight:300,gap:12,padding:40,color:t.sft}}>
      <div style={{color:t.mut}}>{icon}</div>
      <div style={{fontSize:15,fontWeight:700,color:t.txt}}>{title}</div>
      <div style={{fontSize:13,textAlign:"center",color:t.sft}}>
        This screen opens the full web portal section.{"\n"}
        Tap the back arrow to return.
      </div>
    </div>
  );
}

function AdminMembers({t, ctx}){
  const [staff,setStaff]=useState([]);
  const [loading,setLoading]=useState(true);
  const [search,setSearch]=useState("");
  useEffect(()=>{
    db.getTeachers().then(({data})=>{setStaff(data||[]);setLoading(false);}).catch(()=>setLoading(false));
  },[]);
  const filtered=staff.filter(s=>{
    const q=search.toLowerCase();
    return !q||(s.full_name||"").toLowerCase().includes(q)||(s.staff_id||"").toLowerCase().includes(q);
  });
  const openDetail=(s)=>{
    ctx.setSelected?.({member:s});
    ctx.setScreen("member-detail");
  };
  return(
    <div style={{background:t.bg,minHeight:"100%"}}>
      <div style={{background:t.card,padding:"10px 14px",borderBottom:`1px solid ${t.brd}`}}>
        <MSearchBar t={t} value={search} onChange={setSearch} placeholder="Search staff…"/>
      </div>
      <div style={{padding:"12px 14px"}}>
        {loading?<MSpinner t={t}/>:
          <MCard t={t}>
            {filtered.length===0?<MEmpty t={t} message="No staff found"/>:
              filtered.map((s,i)=>(
                <MRow key={s.id||i} t={t} last={i===filtered.length-1} onClick={()=>openDetail(s)}>
                  <MAvatar name={s.full_name} color={s.role==="manager"?"#7C3AED":t.pri}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:14,fontWeight:700,color:t.txt}}>{s.full_name}</div>
                    <div style={{fontSize:12,color:t.sft}}>{s.staff_id} · {s.class_name||"—"}</div>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:3}}>
                    <MBadge t={t} label={s.role==="manager"?"Manager":"Staff"}
                      color={s.role==="manager"?"purple":"blue"}/>
                    <div style={{fontSize:10,color:t.mut}}>
                      {s.last_login?new Date(s.last_login).toLocaleDateString("en-NG"):"Never"}
                    </div>
                  </div>
                  <ChevronRight size={15} color={t.mut} style={{marginLeft:4,flexShrink:0}}/>
                </MRow>
              ))
            }
          </MCard>
        }
      </div>
    </div>
  );
}

function AdminCalendar({t, ctx}){
  const [events,setEvents]=useState([]);
  const [loading,setLoading]=useState(true);
  const days=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const now=new Date();
  const month=now.toLocaleString("en-NG",{month:"long",year:"numeric"});
  const daysInMonth=new Date(now.getFullYear(),now.getMonth()+1,0).getDate();
  const firstDay=new Date(now.getFullYear(),now.getMonth(),1).getDay();
  const today=now.getDate();

  useEffect(()=>{
    db.getCalendarEvents?.().then(({data})=>{setEvents(data||[]);setLoading(false);})
      .catch(()=>setLoading(false));
  },[]);

  const evMap={};
  events.forEach(e=>{
    const d=new Date(e.event_date||e.date||e.start_date);
    if(!isNaN(d)&&d.getMonth()===now.getMonth()) evMap[d.getDate()]=e;
  });
  const upcoming=events.filter(e=>new Date(e.event_date||e.date||e.start_date)>=now)
    .sort((a,b)=>new Date(a.event_date||a.date)-new Date(b.event_date||b.date))
    .slice(0,5);
  const COLORS=["#7C3AED","#DC2626","#D97706","#15803D","#111827"];

  return(
    <div style={{padding:"14px 14px 0",background:t.bg}}>
      <MCard t={t} style={{padding:14,marginBottom:14}}>
        <div style={{fontSize:15,fontWeight:800,color:t.txt,marginBottom:12,textAlign:"center"}}>{month}</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:8}}>
          {days.map(d=><div key={d} style={{textAlign:"center",fontSize:10,fontWeight:700,color:t.mut,padding:"3px 0"}}>{d}</div>)}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3}}>
          {Array.from({length:firstDay}).map((_,i)=><div key={"p"+i}/>)}
          {Array.from({length:daysInMonth},(_,i)=>i+1).map(d=>{
            const ev=evMap[d];
            const isToday=d===today;
            return(
              <div key={d} style={{height:32,borderRadius:8,display:"flex",flexDirection:"column",
                alignItems:"center",justifyContent:"center",
                background:isToday?t.pri:ev?ev.color+"18":"transparent",
                border:isToday?`2px solid ${t.pri}`:ev?`1px solid ${(ev.color||"#7C3AED")}40`:"none"}}>
                <div style={{fontSize:12,fontWeight:isToday||ev?800:400,
                  color:isToday?"#fff":ev?(ev.color||t.txt):t.txt}}>{d}</div>
                {ev&&!isToday&&<div style={{width:4,height:4,borderRadius:2,
                  background:ev.color||"#7C3AED",marginTop:1}}/>}
              </div>
            );
          })}
        </div>
      </MCard>
      <MSHdr t={t} title="Upcoming Events"/>
      {upcoming.length===0?<MEmpty t={t} message="No upcoming events"/>:
        upcoming.map((ev,i)=>{
          const col=ev.color||COLORS[i%COLORS.length];
          const d=new Date(ev.event_date||ev.date||ev.start_date);
          return(
            <div key={i} style={{background:t.card,borderRadius:14,padding:"12px 14px",
              border:`1px solid ${t.brd}`,marginBottom:8,display:"flex",alignItems:"center",gap:12}}>
              <div style={{width:44,height:44,borderRadius:12,background:col+"18",
                display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                flexShrink:0}}>
                <div style={{fontSize:11,fontWeight:900,color:col}}>
                  {isNaN(d)?"—":d.toLocaleDateString("en-NG",{day:"2-digit",month:"short"})}</div>
              </div>
              <div style={{flex:1}}><div style={{fontSize:14,fontWeight:700,color:t.txt}}>{ev.title||ev.name}</div></div>
              <div style={{width:10,height:10,borderRadius:5,background:col,flexShrink:0}}/>
            </div>
          );
        })
      }
    </div>
  );
}

function AdminExport({t, ctx}){
  const {notify}=ctx;
  const [downloading,setDownloading]=useState(null);

  const downloadCSV=(filename,rows,headers)=>{
    const lines=[headers.join(","),...rows.map(r=>headers.map(h=>{
      const v=r[h]??r[h.toLowerCase()]??"";
      const s=String(v).replace(/"/g,'""');
      return s.includes(",")||s.includes('"')||s.includes("\n")?`"${s}"`:s;
    }).join(","))];
    const blob=new Blob([lines.join("\n")],{type:"text/csv"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;a.download=filename;a.click();
    URL.revokeObjectURL(url);
  };

  const doExport=async(type)=>{
    setDownloading(type);
    try{
      if(type==="students"){
        const{data}=await db.getStudents();
        const rows=(data||[]).map(s=>({
          "Member ID":s.student_id||s.id,
          "First Name":s.first_name,"Last Name":s.last_name,
          "Group":s.class_name,"Status":s.status,"Email":s.email||"",
        }));
        downloadCSV("rgs_students.csv",rows,["Member ID","First Name","Last Name","Group","Status","Email"]);
        notify?.("Members exported!");
      } else if(type==="staff"){
        const{data}=await db.getTeachers();
        const rows=(data||[]).map(s=>({
          "Staff ID":s.staff_id,"Name":s.full_name,"Role":s.role,
          "Group":s.class_name||"","Email":s.email||"",
          "Last Login":s.last_login?new Date(s.last_login).toLocaleDateString("en-NG"):"Never",
        }));
        downloadCSV("rgs_staff.csv",rows,["Staff ID","Name","Role","Group","Email","Last Login"]);
        notify?.("Staff exported!");
      } else if(type==="results"){
        const{data}=await db.getResultApprovals();
        const rows=(data||[]).map(r=>({
          "Group":r.class_name||r.class_id,"Period":r.term_name||r.term_id,
          "Cycle":r.session_name||r.session_id,
          "EA Status":r.ea_status||"none","MA Status":r.ma_status||"none",
        }));
        downloadCSV("rgs_results.csv",rows,["Group","Period","Cycle","EA Status","MA Status"]);
        notify?.("Results exported!");
      } else if(type==="fees"){
        const{data}=await db.getFeeBills();
        const rows=(data||[]).map(b=>({
          "Member":b.student_name||b.student_id,"Group":b.class_name||"",
          "Period":b.term_name||"","Total":b.total_amount||0,
          "Paid":b.amount_paid||0,"Balance":(+b.total_amount||0)-(+b.amount_paid||0),
          "Status":b.status||"unpaid",
        }));
        downloadCSV("rgs_fees.csv",rows,["Member","Group","Period","Total","Paid","Balance","Status"]);
        notify?.("Billing bills exported!");
      } else if(type==="attendance"){
        const{data}=await db.getAttendance?.()??{data:[]};
        const rows=(data||[]).map(a=>({
          "Member ID":a.student_id,"Date":a.date,"Present":a.present?"Yes":"No",
          "Group":a.class_name||"",
        }));
        downloadCSV("rgs_attendance.csv",rows,["Member ID","Date","Present","Group"]);
        notify?.("Attendance exported!");
      }
    }catch(e){notify?.("Export failed","error");}
    setDownloading(null);
  };

  const exports=[
    {id:"students",   l:"Members",        sub:"Active members with group info",   Icon:UsersRound,    col:"blue"},
    {id:"staff",      l:"Staff / Staff",sub:"All staff with roles & last login", Icon:UserCheck,     col:"purple"},
    {id:"results",    l:"Period Results",    sub:"Approval status by group & period",   Icon:BarChart3,     col:"green"},
    {id:"fees",       l:"Bills",       sub:"All bills with payment status",     Icon:ReceiptText,   col:"orange"},
    {id:"attendance", l:"Attendance",      sub:"Daily attendance by group",         Icon:ClipboardCheck,col:"amber"},
  ];
  return(
    <div style={{padding:"14px 14px 0",background:t.bg}}>
      <MSHdr t={t} title="Export Data"/>
      {exports.map((ex,i)=>{
        const [bg,tc]=t.tag[ex.col]||["#eee","#555"];
        const busy=downloading===ex.id;
        return(
          <div key={i} onClick={()=>!downloading&&doExport(ex.id)}
            style={{background:t.card,borderRadius:14,padding:"13px 14px",
              border:`1px solid ${t.brd}`,marginBottom:9,
              display:"flex",alignItems:"center",gap:12,
              cursor:downloading?"default":"pointer",opacity:downloading&&!busy?.5:1}}>
            <div style={{width:44,height:44,borderRadius:13,background:bg,
              display:"flex",alignItems:"center",justifyContent:"center",
              color:tc,flexShrink:0}}>
              {busy?<Loader2 size={22} style={{animation:"spin 1s linear infinite"}}/>:<ex.Icon size={22}/>}
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:14,fontWeight:700,color:t.txt}}>{ex.l}</div>
              <div style={{fontSize:12,color:t.sft}}>{ex.sub}</div>
            </div>
            <div style={{padding:"7px 12px",borderRadius:9,background:bg,
              border:`1px solid ${tc}40`,fontSize:12,fontWeight:700,color:tc}}>
              {busy?"…":"CSV"}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── STUDENT DETAIL SCREEN ────────────────────────────────────────────────────
function StudentDetailScreen({t, ctx}){
  const {selected,notify,setScreen}=ctx;
  const student=selected?.student||{};
  const [status,setStatus]=useState(student.status||"active");
  const [classId,setClassId]=useState(String(student.class_id||""));
  const [classes,setClasses]=useState([]);
  const [saving,setSaving]=useState(false);
  const [pwSheet,setPwSheet]=useState(false);
  const [newPw,setNewPw]=useState("");
  const [pwSaving,setPwSaving]=useState(false);

  useEffect(()=>{
    db.getClasses().then(({data})=>{
      const c=data||[];
      setClasses(c);
    }).catch(()=>{});
  },[]);

  const saveChanges=async()=>{
    setSaving(true);
    try{
      const payload={status};
      if(classId) payload.class_id=classId;
      await db.upsertStudent(payload,student.id);
      notify?.("Member updated!");
      setScreen("students");
    }catch(e){notify?.("Failed to save","error");}
    setSaving(false);
  };

  const resetPassword=async()=>{
    if(!newPw.trim()){notify?.("Enter a new password","warn");return;}
    setPwSaving(true);
    try{
      await db.upsertStudent({password_hash:newPw.trim()},student.id);
      notify?.("Password reset!");
      setPwSheet(false);setNewPw("");
    }catch(e){notify?.("Reset failed","error");}
    setPwSaving(false);
  };

  const name=fullName(student)||student.display_name||"Member";
  const statusColor=status==="active"?"green":status==="suspended"?"amber":"red";

  return(
    <div style={{background:t.bg,minHeight:"100%",paddingBottom:32}}>
      {/* Profile card */}
      <div style={{background:t.card,padding:"18px 16px 16px",
        borderBottom:`1px solid ${t.brd}`,display:"flex",alignItems:"center",gap:14}}>
        <MAvatar name={name} size={60} color={t.pri}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:18,fontWeight:800,color:t.txt,marginBottom:2}}>{name}</div>
          <div style={{fontSize:13,color:t.sft}}>{student.student_id||"—"}</div>
          <div style={{fontSize:12,color:t.sft,marginTop:1}}>{student.class_name||"—"}</div>
          <div style={{marginTop:6}}>
            <MBadge t={t} label={status} color={statusColor}/>
          </div>
        </div>
      </div>

      <div style={{padding:"16px 14px"}}>
        {/* Edit section */}
        <div style={{fontSize:11,fontWeight:700,color:t.sft,textTransform:"uppercase",
          letterSpacing:.5,marginBottom:10}}>Edit Member</div>
        <div style={{background:t.card,borderRadius:14,padding:"14px 14px 6px",
          border:`1px solid ${t.brd}`,marginBottom:14}}>
          <MSelectField t={t} label="Status" value={status} onChange={setStatus}
            options={[
              {v:"active",l:"Active"},
              {v:"suspended",l:"Suspended"},
              {v:"withdrawn",l:"Withdrawn"},
              {v:"graduated",l:"Graduated"},
              {v:"inactive",l:"Inactive"},
            ]}/>
          <MSelectField t={t} label="Group Assignment" value={classId} onChange={setClassId}
            options={[{v:"",l:"Keep current group"},...classes.map(c=>({v:String(c.id),l:c.name}))]}/>
          <MPrimaryBtn t={t} label="Save Changes" onClick={saveChanges} loading={saving}/>
        </div>

        {/* Actions card */}
        <MCard t={t} style={{marginBottom:14}}>
          <MRow t={t} last={false} onClick={()=>setPwSheet(true)}>
            <div style={{width:36,height:36,borderRadius:10,background:t.tag.amber[0],
              display:"flex",alignItems:"center",justifyContent:"center",color:t.tag.amber[1],flexShrink:0}}>
              <Lock size={17}/>
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:14,fontWeight:600,color:t.txt}}>Reset Password</div>
              <div style={{fontSize:12,color:t.sft}}>Change this member's login password</div>
            </div>
            <ChevronRight size={16} color={t.mut}/>
          </MRow>
          <MRow t={t} last onClick={()=>{ctx.setSelected?.({...selected,studentForBill:student});ctx.setScreen("fee-tracker");}}>
            <div style={{width:36,height:36,borderRadius:10,background:t.tag.green[0],
              display:"flex",alignItems:"center",justifyContent:"center",color:t.tag.green[1],flexShrink:0}}>
              <CreditCard size={17}/>
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:14,fontWeight:600,color:t.txt}}>View Bills</div>
              <div style={{fontSize:12,color:t.sft}}>See payment status</div>
            </div>
            <ChevronRight size={16} color={t.mut}/>
          </MRow>
        </MCard>

        {/* Info section */}
        {(student.email||student.phone||student.guardian_name)&&(
          <MCard t={t}>
            {[
              student.email&&{l:"Email",v:student.email},
              student.phone&&{l:"Phone",v:student.phone},
              student.guardian_name&&{l:"Guardian",v:student.guardian_name},
              student.date_of_birth&&{l:"Date of Birth",v:student.date_of_birth},
            ].filter(Boolean).map(({l,v},i,a)=>(
              <div key={i} style={{padding:"10px 14px",
                borderBottom:i<a.length-1?`1px solid ${t.brd}`:"none",
                display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{fontSize:13,color:t.sft}}>{l}</div>
                <div style={{fontSize:13,fontWeight:600,color:t.txt,
                  maxWidth:"55%",textAlign:"right",wordBreak:"break-all"}}>{v}</div>
              </div>
            ))}
          </MCard>
        )}
      </div>

      <MBottomSheet t={t} open={pwSheet} onClose={()=>{setPwSheet(false);setNewPw("");}} title="Reset Member Password">
        <div style={{fontSize:13,color:t.sft,marginBottom:14}}>
          Set a new password for <strong style={{color:t.txt}}>{name}</strong>.
          They can change it again from their profile.
        </div>
        <MInputField t={t} label="New Password" value={newPw} onChange={setNewPw}
          placeholder="Enter new password" type="password"/>
        <MPrimaryBtn t={t} label="Reset Password" onClick={resetPassword} loading={pwSaving}/>
      </MBottomSheet>
    </div>
  );
}

// ─── MEMBER DETAIL SCREEN ─────────────────────────────────────────────────────
function MemberDetailScreen({t, ctx}){
  const {selected,notify,setScreen}=ctx;
  const member=selected?.member||{};
  const [role,setRole]=useState(member.role||"teacher");
  const [saving,setSaving]=useState(false);
  const [pwSheet,setPwSheet]=useState(false);
  const [newPw,setNewPw]=useState("");
  const [pwSaving,setPwSaving]=useState(false);

  const saveRole=async()=>{
    setSaving(true);
    try{
      await db.setTeacherRole(member.id,role);
      notify?.("Role updated!");
      setScreen("members");
    }catch(e){notify?.("Failed to update role","error");}
    setSaving(false);
  };

  const resetPassword=async()=>{
    if(!newPw.trim()){notify?.("Enter a new password","warn");return;}
    setPwSaving(true);
    try{
      await db.updateTeacherCredentials(member.id,{password_hash:newPw.trim()});
      notify?.("Password reset!");
      setPwSheet(false);setNewPw("");
    }catch(e){notify?.("Reset failed","error");}
    setPwSaving(false);
  };

  const name=member.full_name||member.display_name||"Staff";
  const roleLbl={teacher:"Staff",manager:"Finance Officer",admin:"Administrator"}[member.role]||member.role;

  return(
    <div style={{background:t.bg,minHeight:"100%",paddingBottom:32}}>
      <div style={{background:t.card,padding:"18px 16px 16px",
        borderBottom:`1px solid ${t.brd}`,display:"flex",alignItems:"center",gap:14}}>
        <MAvatar name={name} size={60} color={member.role==="manager"?"#7C3AED":t.pri}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:18,fontWeight:800,color:t.txt,marginBottom:2}}>{name}</div>
          <div style={{fontSize:13,color:t.sft}}>{member.staff_id||"—"}</div>
          <div style={{fontSize:12,color:t.sft,marginTop:1}}>{member.email||"—"}</div>
          <div style={{marginTop:6}}>
            <MBadge t={t} label={roleLbl} color={member.role==="manager"?"purple":"blue"}/>
          </div>
        </div>
      </div>

      <div style={{padding:"16px 14px"}}>
        <div style={{fontSize:11,fontWeight:700,color:t.sft,textTransform:"uppercase",
          letterSpacing:.5,marginBottom:10}}>Edit Staff</div>
        <div style={{background:t.card,borderRadius:14,padding:"14px 14px 6px",
          border:`1px solid ${t.brd}`,marginBottom:14}}>
          <MSelectField t={t} label="Role" value={role} onChange={setRole}
            options={[
              {v:"teacher",l:"Staff"},
              {v:"manager",l:"Finance Officer (Manager)"},
              {v:"admin",l:"Administrator"},
            ]}/>
          <MPrimaryBtn t={t} label="Update Role" onClick={saveRole} loading={saving}/>
        </div>

        <MCard t={t} style={{marginBottom:14}}>
          <MRow t={t} last onClick={()=>setPwSheet(true)}>
            <div style={{width:36,height:36,borderRadius:10,background:t.tag.amber[0],
              display:"flex",alignItems:"center",justifyContent:"center",color:t.tag.amber[1],flexShrink:0}}>
              <Lock size={17}/>
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:14,fontWeight:600,color:t.txt}}>Reset Password</div>
              <div style={{fontSize:12,color:t.sft}}>Change this staff member's password</div>
            </div>
            <ChevronRight size={16} color={t.mut}/>
          </MRow>
        </MCard>

        {/* Info */}
        <MCard t={t}>
          {[
            {l:"Assigned Group",v:member.class_name||"—"},
            {l:"Last Login",v:member.last_login?new Date(member.last_login).toLocaleDateString("en-NG"):"Never"},
            {l:"Account Status",v:member.status||"active"},
            {l:"Join Date",v:member.created_at?new Date(member.created_at).toLocaleDateString("en-NG"):"—"},
          ].map(({l,v},i,a)=>(
            <div key={i} style={{padding:"10px 14px",
              borderBottom:i<a.length-1?`1px solid ${t.brd}`:"none",
              display:"flex",justifyContent:"space-between"}}>
              <div style={{fontSize:13,color:t.sft}}>{l}</div>
              <div style={{fontSize:13,fontWeight:600,color:t.txt}}>{v}</div>
            </div>
          ))}
        </MCard>
      </div>

      <MBottomSheet t={t} open={pwSheet} onClose={()=>{setPwSheet(false);setNewPw("");}} title="Reset Staff Password">
        <div style={{fontSize:13,color:t.sft,marginBottom:14}}>
          Set a new password for <strong style={{color:t.txt}}>{name}</strong>.
        </div>
        <MInputField t={t} label="New Password" value={newPw} onChange={setNewPw}
          placeholder="Enter new password" type="password"/>
        <MPrimaryBtn t={t} label="Reset Password" onClick={resetPassword} loading={pwSaving}/>
      </MBottomSheet>
    </div>
  );
}

// ─── BILL DETAIL SCREEN ───────────────────────────────────────────────────────
function BillDetailScreen({t, ctx}){
  const {selected,notify}=ctx;
  const [bill,setBill]=useState(selected?.bill||{});
  const [paySheet,setPaySheet]=useState(false);
  const [amount,setAmount]=useState("");
  const [method,setMethod]=useState("cash");
  const [paying,setPaying]=useState(false);

  const total=+bill.total_amount||0;
  const paid=+bill.amount_paid||0;
  const balance=total-paid;
  const pct=total>0?Math.round((paid/total)*100):0;
  const items=bill.fee_bill_items||[];
  const payments=bill.fee_payments||[];
  const statusColor=bill.status==="paid"?"green":bill.status==="partial"?"amber":"red";
  const name=bill.student_name||bill.student_id||"Member";

  const recordPayment=async()=>{
    const amt=parseFloat(amount);
    if(!amt||amt<=0){notify?.("Enter a valid amount","warn");return;}
    if(amt>balance+0.01){notify?.(`Max is ${fmt(balance)}`,"warn");return;}
    setPaying(true);
    try{
      await db.insertFeePayment({
        fee_bill_id:bill.id,
        student_id:bill.student_id,
        amount:amt,
        method,
        school_id:db._schoolId,
        recorded_by:"admin",
        payment_date:new Date().toISOString().split("T")[0],
      });
      notify?.("Payment recorded!");
      setPaySheet(false);setAmount("");
      // Refresh bill data
      const{data:fresh}=await db.getFeeBills({id:bill.id});
      if(fresh?.[0]) setBill(fresh[0]);
    }catch(e){notify?.("Failed to record payment","error");}
    setPaying(false);
  };

  return(
    <div style={{background:t.bg,minHeight:"100%",paddingBottom:32}}>
      {/* Header summary */}
      <div style={{background:t.card,padding:"16px 14px",borderBottom:`1px solid ${t.brd}`}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
          <MAvatar name={name} size={46} color={t.pri}/>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:16,fontWeight:800,color:t.txt}}>{name}</div>
            <div style={{fontSize:12,color:t.sft}}>{bill.class_name||"—"} · {bill.term_name||bill.session_name||"—"}</div>
          </div>
          <MBadge t={t} label={bill.status||"unpaid"} color={statusColor}/>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:7}}>
          <div>
            <div style={{fontSize:10,color:t.sft,textTransform:"uppercase",letterSpacing:.3}}>Total Billing</div>
            <div style={{fontSize:20,fontWeight:900,color:t.txt}}>{fmt(total)}</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:10,color:t.sft,textTransform:"uppercase",letterSpacing:.3}}>Balance Due</div>
            <div style={{fontSize:20,fontWeight:900,color:balance>0?"#DC2626":t.tag.green[1]}}>{fmt(balance)}</div>
          </div>
        </div>
        <div style={{height:8,borderRadius:4,background:t.bg,overflow:"hidden",marginBottom:5}}>
          <div style={{width:`${pct}%`,height:"100%",borderRadius:4,
            background:`linear-gradient(90deg,#15803D,#22c55e)`}}/>
        </div>
        <div style={{fontSize:12,color:t.sft}}>{fmt(paid)} paid · {pct}% complete</div>
      </div>

      <div style={{padding:"14px 14px"}}>
        {/* Billing items */}
        {items.length>0&&<>
          <MSHdr t={t} title="Billing Breakdown"/>
          <MCard t={t} style={{marginBottom:14}}>
            {items.map((item,i)=>(
              <div key={i} style={{padding:"10px 14px",
                borderBottom:i<items.length-1?`1px solid ${t.brd}`:"none",
                display:"flex",alignItems:"center"}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:600,color:t.txt}}>{item.label||item.name}</div>
                  {!item.is_compulsory&&<div style={{fontSize:11,color:t.mut}}>Optional</div>}
                </div>
                <div style={{fontSize:13,fontWeight:700,color:t.txt}}>{fmt(+item.amount||0)}</div>
              </div>
            ))}
            <div style={{padding:"10px 14px",background:t.bg,
              display:"flex",justifyContent:"space-between",borderTop:`1px solid ${t.brd}`}}>
              <div style={{fontSize:14,fontWeight:800,color:t.txt}}>Total</div>
              <div style={{fontSize:14,fontWeight:900,color:t.txt}}>{fmt(total)}</div>
            </div>
          </MCard>
        </>}

        {/* Payment history */}
        {payments.length>0&&<>
          <MSHdr t={t} title="Payment History"/>
          <MCard t={t} style={{marginBottom:14}}>
            {payments.map((p,i)=>(
              <MRow key={i} t={t} last={i===payments.length-1}>
                <div style={{width:36,height:36,borderRadius:10,background:t.tag.green[0],
                  display:"flex",alignItems:"center",justifyContent:"center",
                  color:t.tag.green[1],flexShrink:0}}>
                  <Check size={16}/>
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:700,color:t.txt}}>{fmt(+p.amount||0)}</div>
                  <div style={{fontSize:11,color:t.sft}}>
                    {(p.method||"cash").replace("_"," ")} · {p.payment_date||"—"}
                  </div>
                </div>
                <MBadge t={t} label="Paid" color="green"/>
              </MRow>
            ))}
          </MCard>
        </>}

        {balance>0&&(
          <MPrimaryBtn t={t} label={`Record Payment  ·  ${fmt(balance)} due`}
            onClick={()=>setPaySheet(true)}/>
        )}
        {balance<=0&&(
          <div style={{textAlign:"center",padding:"16px",fontSize:14,
            color:t.tag.green[1],fontWeight:700}}>
            ✓ Fully paid
          </div>
        )}
      </div>

      <MBottomSheet t={t} open={paySheet}
        onClose={()=>{setPaySheet(false);setAmount("");}} title="Record Payment">
        <div style={{fontSize:13,color:t.sft,marginBottom:14}}>
          Recording payment for <strong style={{color:t.txt}}>{name}</strong>.
          Outstanding: <strong style={{color:"#DC2626"}}>{fmt(balance)}</strong>
        </div>
        <MInputField t={t} label="Amount (₦)" value={amount} onChange={setAmount}
          placeholder={`Up to ${fmt(balance)}`} type="number"/>
        <MSelectField t={t} label="Payment Method" value={method} onChange={setMethod}
          options={[
            {v:"cash",l:"Cash"},
            {v:"bank_transfer",l:"Bank Transfer"},
            {v:"pos",l:"POS Terminal"},
            {v:"online",l:"Online Payment"},
            {v:"cheque",l:"Cheque"},
          ]}/>
        <MPrimaryBtn t={t} label="Record Payment" onClick={recordPayment} loading={paying}/>
      </MBottomSheet>
    </div>
  );
}

// ─── ANNOUNCEMENTS SCREEN ─────────────────────────────────────────────────────
function AnnouncementsScreen({t, ctx}){
  const {user,role,notify}=ctx;
  const [notices,setNotices]=useState([]);
  const [loading,setLoading]=useState(true);
  const [sheet,setSheet]=useState(false);
  const [title,setTitle]=useState("");
  const [body,setBody]=useState("");
  const [audience,setAudience]=useState("all");
  const [saving,setSaving]=useState(false);
  const canCreate=role==="admin"||role==="manager";

  const load=()=>{
    setLoading(true);
    db.getAnnouncements?.()
      .then(({data})=>{setNotices(data||[]);setLoading(false);})
      .catch(()=>setLoading(false));
  };
  useEffect(load,[]);

  const create=async()=>{
    if(!title.trim()){notify?.("Enter a title","warn");return;}
    if(!body.trim()){notify?.("Enter a message","warn");return;}
    setSaving(true);
    try{
      await db.upsertAnnouncement({
        title:title.trim(),
        body:body.trim(),
        created_by:user?.id||user?.teacher_db_id||"admin",
        audience,
      });
      notify?.("Announcement posted!");
      setSheet(false);setTitle("");setBody("");
      load();
    }catch(e){notify?.("Failed to post","error");}
    setSaving(false);
  };

  const AUDIENCE_COLORS={all:"blue",students:"green",teachers:"purple",parents:"orange"};

  return(
    <div style={{background:t.bg,minHeight:"100%"}}>
      {loading?<MSpinner t={t}/>:
        <div style={{padding:"14px 14px 24px"}}>
          {canCreate&&(
            <div onClick={()=>setSheet(true)}
              style={{background:t.pri,borderRadius:13,padding:"12px 16px",
                marginBottom:16,display:"flex",alignItems:"center",gap:10,cursor:"pointer",
                boxShadow:`0 3px 12px ${t.pri}40`}}>
              <Plus size={20} color="#fff" strokeWidth={2.5}/>
              <div style={{fontSize:14,fontWeight:700,color:"#fff"}}>New Announcement</div>
            </div>
          )}
          {notices.length===0
            ?<MEmpty t={t} message="No announcements yet"/>
            :notices.map((n,i)=>{
              const acol=AUDIENCE_COLORS[n.audience||"all"]||"blue";
              return(
                <div key={n.id||i} style={{background:t.card,borderRadius:14,
                  padding:"14px 14px",border:`1px solid ${t.brd}`,marginBottom:10}}>
                  <div style={{display:"flex",alignItems:"flex-start",
                    justifyContent:"space-between",gap:8,marginBottom:7}}>
                    <div style={{fontSize:14,fontWeight:800,color:t.txt,
                      flex:1,lineHeight:1.3}}>📢 {n.title}</div>
                    <MBadge t={t} label={n.audience||"All"} color={acol}/>
                  </div>
                  <div style={{fontSize:13,color:t.sft,lineHeight:1.6}}>
                    {n.body||n.content||""}</div>
                  <div style={{fontSize:11,color:t.mut,marginTop:8}}>
                    {n.created_at
                      ?new Date(n.created_at).toLocaleDateString("en-NG",
                          {day:"2-digit",month:"short",year:"numeric"})
                      :"Recently"}
                  </div>
                </div>
              );
            })
          }
        </div>
      }
      <MBottomSheet t={t} open={sheet} onClose={()=>setSheet(false)} title="New Announcement">
        <MInputField t={t} label="Title" value={title} onChange={setTitle}
          placeholder="e.g. Organization Closing Notice"/>
        <MInputField t={t} label="Message" value={body} onChange={setBody}
          placeholder="Write your announcement here…" textarea/>
        <MSelectField t={t} label="Audience" value={audience} onChange={setAudience}
          options={[
            {v:"all",l:"Everyone"},
            {v:"students",l:"Members only"},
            {v:"teachers",l:"Staff only"},
            {v:"parents",l:"Contacts only"},
          ]}/>
        <MPrimaryBtn t={t} label="Post Announcement" onClick={create} loading={saving}/>
      </MBottomSheet>
    </div>
  );
}

// ─── MAIL COMPOSE SCREEN ──────────────────────────────────────────────────────
function MailComposeScreen({t, ctx}){
  const {user,notify}=ctx;
  const [to,setTo]=useState("");
  const [subject,setSubject]=useState("");
  const [body,setBody]=useState("");
  const [sending,setSending]=useState(false);
  const [sent,setSent]=useState(false);

  const send=async()=>{
    if(!to.trim()){notify?.("Enter recipient email","warn");return;}
    if(!subject.trim()){notify?.("Enter a category","warn");return;}
    if(!body.trim()){notify?.("Write your message","warn");return;}
    setSending(true);
    try{
      await db.sendEmail({
        to:to.trim(),
        subject:subject.trim(),
        html:`<div style="font-family:sans-serif;max-width:600px;margin:auto">
          <p>${body.trim().replace(/\n/g,"<br/>")}</p>
          <hr/><p style="color:#888;font-size:12px">
          Sent from JAMES-DENNING · ${user?.name||"Admin"}</p>
        </div>`,
      });
      notify?.("Email sent!");
      setSent(true);
      setTo("");setSubject("");setBody("");
      setTimeout(()=>setSent(false),3000);
    }catch(e){notify?.("Failed to send email","error");}
    setSending(false);
  };

  return(
    <div style={{background:t.bg,minHeight:"100%",padding:"14px 14px 24px"}}>
      {sent&&(
        <div style={{background:t.tag.green[0],borderRadius:12,padding:"12px 14px",
          marginBottom:14,display:"flex",alignItems:"center",gap:10,
          border:`1px solid ${t.tag.green[1]}40`}}>
          <CheckCircle2 size={18} color={t.tag.green[1]}/>
          <div style={{fontSize:13,fontWeight:700,color:t.tag.green[1]}}>Email sent successfully!</div>
        </div>
      )}
      <div style={{background:t.card,borderRadius:14,padding:"14px 14px 6px",
        border:`1px solid ${t.brd}`,marginBottom:14}}>
        <MInputField t={t} label="To (email address)" value={to} onChange={setTo}
          placeholder="recipient@school.com" type="email"/>
        <MInputField t={t} label="Category" value={subject} onChange={setSubject}
          placeholder="Email category line"/>
        <MInputField t={t} label="Message" value={body} onChange={setBody}
          placeholder="Write your message here…" textarea/>
      </div>
      <MPrimaryBtn t={t} label="Send Email" onClick={send} loading={sending}/>
      <div style={{marginTop:10,fontSize:12,color:t.sft,textAlign:"center"}}>
        Sent from JAMES-DENNING on behalf of {user?.name||"Admin"}
      </div>
    </div>
  );
}

// ─── APPROVALS SCREEN ─────────────────────────────────────────────────────────
function ApprovalsScreen({t, ctx}){
  const {user,notify,setPendingApprovals}=ctx;
  const [requests,setRequests]=useState([]);
  const [loading,setLoading]=useState(true);
  const [filter,setFilter]=useState("pending");
  const [acting,setActing]=useState(null);

  const load=()=>{
    setLoading(true);
    db.getStudentRequests?.()
      .then(({data})=>{
        const all=data||[];
        setRequests(all);
        const pending=all.filter(r=>r.status==="pending").length;
        setPendingApprovals?.(pending);
        setLoading(false);
      })
      .catch(()=>setLoading(false));
  };
  useEffect(load,[]);

  const act=async(id,status)=>{
    const key=id+status;
    setActing(key);
    try{
      await db.reviewStudentRequest?.(id,status,"",user?.name||"Admin");
      notify?.(status==="approved"?"Request approved!":"Request rejected");
      load();
    }catch(e){notify?.("Action failed","error");}
    setActing(null);
  };

  const visible=requests.filter(r=>filter==="all"||r.status===filter);

  if(loading) return <MSpinner t={t}/>;
  return(
    <div style={{background:t.bg,minHeight:"100%"}}>
      <div style={{display:"flex",gap:7,padding:"10px 14px",
        background:t.card,borderBottom:`1px solid ${t.brd}`}}>
        {["pending","approved","rejected","all"].map(f=>(
          <MFilterChip key={f} t={t}
            label={f==="all"?"All":f.charAt(0).toUpperCase()+f.slice(1)}
            active={filter===f} onClick={()=>setFilter(f)}/>
        ))}
      </div>
      <div style={{padding:"12px 14px 24px"}}>
        {visible.length===0?<MEmpty t={t} message={`No ${filter} requests`}/>:
          visible.map((r,i)=>{
            const col=r.status==="approved"?"green":r.status==="rejected"?"red":"amber";
            return(
              <div key={r.id||i} style={{background:t.card,borderRadius:14,padding:"13px 14px",
                border:`1px solid ${t.brd}`,marginBottom:9}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                  <MAvatar name={r.student_name||"Member"} size={36} color={t.pri}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:14,fontWeight:700,color:t.txt}}>
                      {r.student_name||r.student_id||"Member"}</div>
                    <div style={{fontSize:12,color:t.sft}}>
                      {r.request_type||r.type||"General Request"}</div>
                  </div>
                  <MBadge t={t} label={r.status||"pending"} color={col}/>
                </div>
                {(r.message||r.reason)&&(
                  <div style={{fontSize:13,color:t.sft,lineHeight:1.5,marginBottom:8,
                    padding:"8px 10px",background:t.bg,borderRadius:8,
                    border:`1px solid ${t.brd}`}}>
                    {r.message||r.reason}
                  </div>
                )}
                <div style={{fontSize:11,color:t.mut,marginBottom:r.status==="pending"?10:0}}>
                  {r.created_at?new Date(r.created_at).toLocaleDateString("en-NG",
                    {day:"2-digit",month:"short",year:"numeric"}):"Recently"}
                </div>
                {r.status==="pending"&&(
                  <div style={{display:"flex",gap:8}}>
                    <div onClick={()=>acting?null:act(r.id,"rejected")}
                      style={{flex:1,height:38,borderRadius:9,background:t.tag.red[0],
                        color:t.tag.red[1],fontSize:13,fontWeight:700,
                        display:"flex",alignItems:"center",justifyContent:"center",
                        cursor:acting?"default":"pointer",
                        border:`1px solid ${t.tag.red[1]}40`,
                        opacity:acting===r.id+"rejected"?.4:1}}>
                      {acting===r.id+"rejected"
                        ?<Loader2 size={14} style={{animation:"spin 1s linear infinite"}}/>
                        :"✗ Reject"}
                    </div>
                    <div onClick={()=>acting?null:act(r.id,"approved")}
                      style={{flex:1,height:38,borderRadius:9,background:t.tag.green[0],
                        color:t.tag.green[1],fontSize:13,fontWeight:700,
                        display:"flex",alignItems:"center",justifyContent:"center",
                        cursor:acting?"default":"pointer",
                        border:`1px solid ${t.tag.green[1]}40`,
                        opacity:acting===r.id+"approved"?.4:1}}>
                      {acting===r.id+"approved"
                        ?<Loader2 size={14} style={{animation:"spin 1s linear infinite"}}/>
                        :"✓ Approve"}
                    </div>
                  </div>
                )}
                {r.admin_note&&(
                  <div style={{fontSize:12,color:t.sft,marginTop:6,fontStyle:"italic"}}>
                    Note: {r.admin_note}
                  </div>
                )}
              </div>
            );
          })
        }
      </div>
    </div>
  );
}

// ─── FEE STATS SCREEN ─────────────────────────────────────────────────────────
function FeeStatsScreen({t, ctx}){
  const [stats,setStats]=useState(null);
  const [classBreakdown,setClassBreakdown]=useState([]);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    Promise.all([db.getFeeBills(),db.getFeePayments()]).then(([b,p])=>{
      const bills=b.data||[];
      const payments=p.data||[];
      const total=bills.reduce((s,b)=>s+(+b.total_amount||0),0);
      const collected=payments.reduce((s,p)=>s+(+p.amount||0),0);
      const outstanding=total-collected;
      const paid=bills.filter(b=>b.status==="paid").length;
      const partial=bills.filter(b=>b.status==="partial").length;
      const unpaid=bills.filter(b=>!b.status||b.status==="unpaid").length;
      const rate=bills.length?Math.round((paid/bills.length)*100):0;
      setStats({total,collected,outstanding,paid,partial,unpaid,count:bills.length,rate});
      // Group breakdown
      const byClass={};
      bills.forEach(b=>{
        const cls=b.class_name||"Unknown";
        if(!byClass[cls]) byClass[cls]={name:cls,collected:0,total:0,count:0};
        byClass[cls].total+=+b.total_amount||0;
        byClass[cls].collected+=+b.amount_paid||0;
        byClass[cls].count++;
      });
      setClassBreakdown(Object.values(byClass).sort((a,b)=>b.collected-a.collected).slice(0,8));
      setLoading(false);
    }).catch(()=>setLoading(false));
  },[]);

  if(loading) return <MSpinner t={t}/>;
  return(
    <div style={{background:t.bg,minHeight:"100%",padding:"14px 14px 24px"}}>
      {/* Big summary */}
      <div style={{background:t.card,borderRadius:18,padding:18,marginBottom:14,
        border:`1px solid ${t.brd}`}}>
        <div style={{fontSize:11,color:t.sft,fontWeight:700,textTransform:"uppercase",letterSpacing:.4,marginBottom:4}}>
          Total Collected</div>
        <div style={{fontSize:32,fontWeight:900,color:t.tag.green[1]}}>{fmt(stats.collected)}</div>
        <div style={{fontSize:13,color:t.sft,marginTop:4}}>
          of {fmt(stats.total)} total billing</div>
        <div style={{height:10,borderRadius:5,background:t.bg,overflow:"hidden",marginTop:12}}>
          <div style={{width:`${stats.rate}%`,height:"100%",borderRadius:5,
            background:`linear-gradient(90deg,${t.pri},${t.acc})`}}/>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",marginTop:6}}>
          <div style={{fontSize:12,color:t.sft}}>{stats.rate}% collected</div>
          <div style={{fontSize:12,color:"#DC2626",fontWeight:700}}>
            {fmt(stats.outstanding)} outstanding</div>
        </div>
      </div>

      {/* Mini stats */}
      <div style={{display:"flex",gap:9,marginBottom:14}}>
        <MStatCard t={t} label="Fully Paid" value={stats.paid}
          sub={`of ${stats.count} bills`} color="green" icon={<Check size={16}/>}/>
        <MStatCard t={t} label="Partial" value={stats.partial}
          sub="bills" color="amber" icon={<AlertTriangle size={16}/>}/>
        <MStatCard t={t} label="Unpaid" value={stats.unpaid}
          sub="bills" color="red" icon={<X size={16}/>}/>
      </div>

      {/* Group breakdown */}
      {classBreakdown.length>0&&<>
        <MSHdr t={t} title="By Group"/>
        <MCard t={t}>
          {classBreakdown.map((cls,i)=>{
            const pct=cls.total>0?Math.round((cls.collected/cls.total)*100):0;
            return(
              <div key={i} style={{padding:"11px 14px",
                borderBottom:i<classBreakdown.length-1?`1px solid ${t.brd}`:"none"}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                  <div style={{fontSize:13,fontWeight:700,color:t.txt}}>{cls.name}</div>
                  <div style={{fontSize:12,fontWeight:700,
                    color:pct>=80?t.tag.green[1]:pct>=50?t.tag.amber[1]:t.tag.red[1]}}>
                    {pct}%
                  </div>
                </div>
                <div style={{height:5,borderRadius:3,background:t.bg,overflow:"hidden"}}>
                  <div style={{width:`${pct}%`,height:"100%",borderRadius:3,
                    background:pct>=80?"#15803D":pct>=50?"#D97706":"#DC2626"}}/>
                </div>
                <div style={{fontSize:11,color:t.mut,marginTop:4}}>
                  {fmt(cls.collected)} / {fmt(cls.total)} · {cls.count} bills
                </div>
              </div>
            );
          })}
        </MCard>
      </>}
    </div>
  );
}

// ─── ADMIN: REPORT CARDS ──────────────────────────────────────────────────────
function AdminReportCards({t, ctx}){
  const {notify}=ctx;
  const [published,setPublished]=useState([]);
  const [approvals,setApprovals]=useState([]);
  const [loading,setLoading]=useState(true);
  const [acting,setActing]=useState(null);

  const load=()=>{
    setLoading(true);
    Promise.all([db.getReportPublish(),db.getResultApprovals()]).then(([p,a])=>{
      setPublished(p.data||[]);setApprovals(a.data||[]);setLoading(false);
    }).catch(()=>setLoading(false));
  };
  useEffect(load,[]);

  const togglePublish=async(item,pub)=>{
    const key=(item.id||item.class_id)+(pub?"pub":"unpub");
    setActing(key);
    try{
      await db.upsertReportPublish({...item,is_published:pub,
        published_at:pub?new Date().toISOString():null});
      notify?.(pub?"Published!":"Unpublished");
      load();
    }catch(e){notify?.("Failed","error");}
    setActing(null);
  };

  if(loading) return <MSpinner t={t}/>;
  const ready=approvals.filter(a=>a.ea_status==="approved"&&a.ma_status==="approved");
  const live=(published||[]).filter(p=>p.is_published);

  return(
    <div style={{padding:"14px 14px 24px",background:t.bg}}>
      {ready.length>0&&<>
        <MSHdr t={t} title="Ready to Publish"/>
        <MCard t={t} style={{marginBottom:14}}>
          {ready.map((a,i)=>{
            const ex=published.find(p=>p.class_id===a.class_id&&p.term_id===a.term_id);
            const isLive=ex?.is_published;
            const busy=acting===((ex?.id||a.class_id)+(isLive?"unpub":"pub"));
            return(
              <MRow key={a.id||i} t={t} last={i===ready.length-1}>
                <div style={{width:40,height:40,borderRadius:11,background:t.tag.green[0],
                  display:"flex",alignItems:"center",justifyContent:"center",
                  color:t.tag.green[1],flexShrink:0}}><FileText size={18}/></div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:14,fontWeight:700,color:t.txt}}>{a.class_name||`Group ${a.class_id}`}</div>
                  <div style={{fontSize:12,color:t.sft}}>{a.term_name||"Period"}</div>
                </div>
                <div onClick={()=>!busy&&togglePublish(
                    ex||{class_id:a.class_id,term_id:a.term_id,session_id:a.session_id},!isLive)}
                  style={{padding:"6px 12px",borderRadius:8,fontSize:12,fontWeight:700,
                    cursor:busy?"default":"pointer",flexShrink:0,display:"flex",alignItems:"center",gap:4,
                    background:isLive?t.tag.red[0]:t.tag.green[0],
                    color:isLive?t.tag.red[1]:t.tag.green[1],
                    border:`1px solid ${isLive?t.tag.red[1]:t.tag.green[1]}40`}}>
                  {busy&&<Loader2 size={12} style={{animation:"spin 1s linear infinite"}}/>}
                  {isLive?"Unpublish":"Publish"}
                </div>
              </MRow>
            );
          })}
        </MCard>
      </>}
      <MSHdr t={t} title="Live Reports"/>
      <MCard t={t}>
        {live.length===0?<MEmpty t={t} message="No published cards yet"/>:
          live.map((r,i)=>(
            <MRow key={r.id||i} t={t} last={i===live.length-1}>
              <div style={{width:40,height:40,borderRadius:11,background:t.tag.blue[0],
                display:"flex",alignItems:"center",justifyContent:"center",
                color:t.tag.blue[1],flexShrink:0}}><FileText size={18}/></div>
              <div style={{flex:1}}>
                <div style={{fontSize:14,fontWeight:700,color:t.txt}}>{r.class_name||`Group ${r.class_id}`}</div>
                <div style={{fontSize:12,color:t.sft}}>{r.term_name||"Period"}</div>
              </div>
              <MBadge t={t} label="Live" color="green"/>
            </MRow>
          ))
        }
      </MCard>
    </div>
  );
}

// ─── ADMIN: AUDIT LOG ─────────────────────────────────────────────────────────
function AdminAuditLog({t, ctx}){
  const [logs,setLogs]=useState([]);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    db.getFeePayments().then(({data})=>{
      setLogs((data||[]).slice(0,30).map(p=>({
        id:p.id,action:"Billing Payment",
        detail:`${p.student_name||p.student_id||"Member"} — ${fmt(+p.amount||0)} (${p.method||"cash"})`,
        timestamp:p.created_at||p.payment_date,
      })));
      setLoading(false);
    }).catch(()=>setLoading(false));
  },[]);
  if(loading) return <MSpinner t={t}/>;
  return(
    <div style={{padding:"14px 14px 24px",background:t.bg}}>
      <div style={{fontSize:12,color:t.sft,marginBottom:12,padding:"9px 12px",
        background:t.card,borderRadius:10,border:`1px solid ${t.brd}`}}>
        Showing recent payment activity. Full audit log is on the web portal.
      </div>
      <MCard t={t}>
        {logs.length===0?<MEmpty t={t} message="No activity yet"/>:
          logs.map((log,i)=>(
            <MRow key={log.id||i} t={t} last={i===logs.length-1}>
              <div style={{width:38,height:38,borderRadius:10,background:t.tag.green[0],
                color:t.tag.green[1],display:"flex",alignItems:"center",
                justifyContent:"center",flexShrink:0}}><CreditCard size={16}/></div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:700,color:t.txt}}>{log.action}</div>
                <div style={{fontSize:12,color:t.sft,overflow:"hidden",
                  textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{log.detail}</div>
              </div>
              <div style={{fontSize:11,color:t.mut,whiteSpace:"nowrap",flexShrink:0}}>
                {log.timestamp?new Date(log.timestamp).toLocaleDateString("en-NG"):"—"}
              </div>
            </MRow>
          ))
        }
      </MCard>
    </div>
  );
}

// ─── ADMIN: SETTINGS ──────────────────────────────────────────────────────────
function AdminSettings({t, ctx}){
  const [school,setSchool]=useState(null);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    db.getSchools?.().then(({data})=>{setSchool((data||[])[0]||null);setLoading(false);})
      .catch(()=>setLoading(false));
  },[]);
  if(loading) return <MSpinner t={t}/>;
  const info=[
    {l:"Business Name",v:school?.name||"—"},{l:"Admin Email",v:school?.admin_email||"—"},
    {l:"Member ID Prefix",v:school?.student_id_prefix||"—"},
    {l:"Staff ID Prefix",v:school?.staff_id_prefix||"—"},
    {l:"Country",v:school?.country||"Nigeria"},{l:"Currency",v:school?.currency||"NGN"},
  ];
  return(
    <div style={{padding:"14px 14px 24px",background:t.bg}}>
      <MSHdr t={t} title="Organization Information"/>
      <MCard t={t} style={{marginBottom:14}}>
        {info.map(({l,v},i)=>(
          <div key={i} style={{padding:"11px 14px",
            borderBottom:i<info.length-1?`1px solid ${t.brd}`:"none",
            display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontSize:13,color:t.sft}}>{l}</div>
            <div style={{fontSize:13,fontWeight:700,color:t.txt,maxWidth:"55%",textAlign:"right"}}>{v}</div>
          </div>
        ))}
      </MCard>
      <div style={{background:t.tag.blue[0],borderRadius:12,padding:"12px 14px",
        border:`1px solid ${t.tag.blue[1]}40`,fontSize:13,color:t.tag.blue[1]}}>
        To change organization settings, billing structures, and performance calendar — use the full web portal.
      </div>
    </div>
  );
}

// ─── ADMIN: FEE GENERATE ──────────────────────────────────────────────────────
function AdminFeeGenerate({t, ctx}){
  const {notify}=ctx;
  const [classes,setClasses]=useState([]);
  const [terms,setTerms]=useState([]);
  const [sessions,setSessions]=useState([]);
  const [classId,setClassId]=useState("");
  const [termId,setTermId]=useState("");
  const [sessionId,setSessionId]=useState("");
  const [loading,setLoading]=useState(true);
  const [generating,setGenerating]=useState(false);

  useEffect(()=>{
    Promise.all([
      db.getClasses(),
      db.getTerms?.()??Promise.resolve({data:[]}),
      db.getSessions?.()??Promise.resolve({data:[]}),
    ]).then(([c,tm,se])=>{
      const cs=c.data||[];const ts=tm.data||[];const ss=se.data||[];
      setClasses(cs);setTerms(ts);setSessions(ss);
      if(cs[0]) setClassId(String(cs[0].id));
      if(ts[0]) setTermId(String(ts[0].id));
      if(ss[0]) setSessionId(String(ss[0].id));
      setLoading(false);
    }).catch(()=>setLoading(false));
  },[]);

  const generate=async()=>{
    if(!classId||!termId){notify?.("Select group and period","warn");return;}
    setGenerating(true);
    try{
      if(db.generateFeeBills){
        await db.generateFeeBills({class_id:classId,term_id:termId,session_id:sessionId});
        notify?.("Bills generated successfully!");
      } else {
        notify?.("Use the web portal to generate bills","warn");
      }
    }catch(e){notify?.("Generation failed — use web portal","error");}
    setGenerating(false);
  };

  if(loading) return <MSpinner t={t}/>;
  return(
    <div style={{padding:"14px 14px 24px",background:t.bg}}>
      <div style={{background:t.card,borderRadius:14,padding:"14px 14px 6px",
        border:`1px solid ${t.brd}`,marginBottom:14}}>
        <MSelectField t={t} label="Group" value={classId} onChange={setClassId}
          options={classes.map(c=>({v:String(c.id),l:c.name}))}/>
        <MSelectField t={t} label="Period" value={termId} onChange={setTermId}
          options={terms.map(tm=>({v:String(tm.id),l:tm.name}))}/>
        {sessions.length>0&&(
          <MSelectField t={t} label="Cycle" value={sessionId} onChange={setSessionId}
            options={sessions.map(s=>({v:String(s.id),l:s.name}))}/>
        )}
        <MPrimaryBtn t={t} label="Generate Bills" onClick={generate} loading={generating}/>
      </div>
      <div style={{background:t.tag.amber[0],borderRadius:12,padding:"12px 14px",
        border:`1px solid ${t.tag.amber[1]}40`,fontSize:13,color:t.tag.amber[1]}}>
        ⚠️ Creates billing bills for all members in the selected group based on configured billing items. Existing bills are not overwritten.
      </div>
    </div>
  );
}

// ─── ADMIN: RECYCLE BIN ───────────────────────────────────────────────────────
function AdminRecycleBin({t, ctx}){
  return(
    <div style={{padding:"14px 14px 24px",background:t.bg}}>
      <div style={{background:t.card,borderRadius:14,padding:"28px 16px",
        border:`1px solid ${t.brd}`,textAlign:"center"}}>
        <Trash2 size={40} color={t.mut} style={{margin:"0 auto 14px"}}/>
        <div style={{fontSize:15,fontWeight:700,color:t.txt,marginBottom:8}}>Recycle Bin</div>
        <div style={{fontSize:13,color:t.sft,lineHeight:1.7}}>
          Deleted records are kept for 30 days. Use the full web portal to browse and restore deleted items.
        </div>
      </div>
    </div>
  );
}

// ─── ADMIN: ACTIVITY (LOGIN HISTORY) ─────────────────────────────────────────
function AdminActivity({t, ctx}){
  const [logs,setLogs]=useState([]);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    db.getLoginHistory?.().then(({data})=>{setLogs((data||[]).slice(0,40));setLoading(false);})
      .catch(()=>{
        db.getTeachers().then(({data})=>{
          setLogs((data||[]).filter(s=>s.last_login)
            .sort((a,b)=>new Date(b.last_login)-new Date(a.last_login))
            .slice(0,30)
            .map(s=>({name:s.full_name,role:s.role,time:s.last_login,id:s.id})));
          setLoading(false);
        }).catch(()=>setLoading(false));
      });
  },[]);
  if(loading) return <MSpinner t={t}/>;
  return(
    <div style={{padding:"14px 14px 24px",background:t.bg}}>
      <MSHdr t={t} title="Recent Login Activity"/>
      <MCard t={t}>
        {logs.length===0?<MEmpty t={t} message="No login history available"/>:
          logs.map((log,i)=>{
            const name=log.name||log.full_name||"User";
            const role=log.role||"staff";
            const time=log.time||log.last_login||log.created_at;
            const rc=role==="admin"?"orange":role==="manager"?"purple":"blue";
            return(
              <MRow key={log.id||i} t={t} last={i===logs.length-1}>
                <MAvatar name={name} size={36} color={t.pri}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:700,color:t.txt}}>{name}</div>
                  <MBadge t={t} label={role} color={rc}/>
                </div>
                <div style={{fontSize:11,color:t.mut,textAlign:"right",flexShrink:0}}>
                  {time?new Date(time).toLocaleDateString("en-NG",{day:"2-digit",month:"short"}):"—"}
                  <div style={{marginTop:2}}>
                    {time?new Date(time).toLocaleTimeString("en-NG",{hour:"2-digit",minute:"2-digit"}):""}
                  </div>
                </div>
              </MRow>
            );
          })
        }
      </MCard>
    </div>
  );
}

// ─── ADMIN: GRADING ───────────────────────────────────────────────────────────
function AdminGrading({t, ctx}){
  const [grades,setGrades]=useState([]);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    db.getGradingSchema?.().then(({data})=>{setGrades(data||[]);setLoading(false);})
      .catch(()=>{
        setGrades([
          {grade:"A",min:75,max:100,remark:"Excellent"},{grade:"B",min:65,max:74,remark:"Very Good"},
          {grade:"C",min:50,max:64,remark:"Good"},{grade:"D",min:40,max:49,remark:"Pass"},
          {grade:"F",min:0,max:39,remark:"Fail"},
        ]);
        setLoading(false);
      });
  },[]);
  const GC={A:"green",B:"blue",C:"amber",D:"orange",F:"red"};
  if(loading) return <MSpinner t={t}/>;
  return(
    <div style={{padding:"14px 14px 24px",background:t.bg}}>
      <MSHdr t={t} title="Grade Scale"/>
      <MCard t={t} style={{marginBottom:14}}>
        <div style={{display:"flex",padding:"8px 14px",background:t.bg,
          borderBottom:`1px solid ${t.brd}`}}>
          {["Grade","Range","Remark"].map((h,i)=>(
            <div key={i} style={{[i===0?"width":i===1?"width":"flex"]:[44,90,1][i],
              fontSize:11,fontWeight:700,color:t.mut,textTransform:"uppercase"}}>{h}</div>
          ))}
        </div>
        {grades.map((g,i)=>{
          const col=GC[g.grade]||"blue";
          const [bg,tc]=t.tag[col]||["#eee","#555"];
          return(
            <div key={i} style={{display:"flex",alignItems:"center",padding:"12px 14px",
              borderBottom:i<grades.length-1?`1px solid ${t.brd}`:"none"}}>
              <div style={{width:44}}>
                <span style={{background:bg,color:tc,borderRadius:7,
                  padding:"3px 9px",fontSize:14,fontWeight:900}}>{g.grade}</span>
              </div>
              <div style={{width:90,fontSize:13,color:t.sft}}>{g.min}% – {g.max}%</div>
              <div style={{flex:1,fontSize:13,fontWeight:600,color:t.txt}}>{g.remark}</div>
            </div>
          );
        })}
      </MCard>
      <div style={{background:t.tag.blue[0],borderRadius:12,padding:"12px 14px",
        border:`1px solid ${t.tag.blue[1]}40`,fontSize:13,color:t.tag.blue[1]}}>
        To edit grade boundaries and remarks, use the full web portal settings.
      </div>
    </div>
  );
}
