/**
 * Dashboard domain: DashboardPage, StudentDashboard, MyProfilePage,
 * TeacherDashboard, SectionsPage, ManagerDashboard, BursarDashboard
 */
import React, { useState, useEffect, useContext } from "react";
import {
  Activity, AlertTriangle, BookUser, Check, CheckCircle, ChevronRight,
  ClipboardCheck, ClipboardList, Dot, DollarSign,
  Edit, GraduationCap, Info, Lock, Megaphone, Pencil, Save, School,
  Settings, ShieldCheck, Trash2, Upload, Users, XCircle, Zap, ReceiptText, Wallet, Mail, BarChart3, CreditCard,
} from "lucide-react";
import { db } from "../supabaseClient.js";
import { C } from "../config/theme.js";
import { SectionCtx, useSection } from "../contexts/section.jsx";
import { useConfirm } from "../contexts/confirm.jsx";
import {
  Logo, Card, Btn, Badge, Inp, Modal, StatCard, Spinner, AppIcon,
} from "../components/ui.jsx";
import { fmt } from "../utils/grades.js";

function getGreeting(name){
  const h=new Date().getHours();
  const n=(name||"").split(" ")[0]||"there";
  if(h>=5&&h<12) return `Good morning, ${n}.`;
  if(h>=12&&h<17) return `Good afternoon, ${n}.`;
  return `Good evening, ${n}.`;
}

export function DashboardPage({ctx}){
  const {user,role,setPage,refreshKey}=ctx;
  const [data,setData]=useState({students:0,staff:0,groups:0,bills:0,collected:0,notices:[],activity:[]});
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    let live=true;
    setLoading(true);
    Promise.all([
      db.countStudents(), db.getTeachers(), db.getClasses(), db.getFeeBills(),
      db.getAnnouncements(), db.getAdminAuditLog({limit:6})
    ]).then(([students,staff,groups,bills,notices,activity])=>{
      if(!live)return;
      const billRows=bills.data||[];
      const collected=billRows.reduce((sum,b)=>sum+(Number(b.amount_paid)||0),0);
      setData({
        students:Number(students.count)||0,
        staff:(staff.data||[]).length,
        groups:(groups.data||[]).length,
        bills:billRows.length,
        collected,
        notices:(notices.data||[]).slice(0,3),
        activity:activity.data||[]
      });
    }).catch(err=>console.error("[Dashboard] load failed:",err)).finally(()=>{if(live)setLoading(false)});
    return()=>{live=false};
  },[refreshKey]);
  const money=n=>new Intl.NumberFormat("en-NG",{style:"currency",currency:"NGN",maximumFractionDigits:0}).format(n||0);
  const go=(page)=>setPage(page);
  const panel={background:"#101010",border:"1px solid #292929",borderRadius:18};
  const action=(label,detail,Icon,page)=>({label,detail,Icon,page});
  const actions=[
    action("Add a person","Create or onboard a member",Users,"students"),
    action("Manage billing","Configure charges and bills",DollarSign,"fees"),
    action("Track payments","Review recorded payments",ClipboardList,"fee-tracker"),
    action("Send an announcement","Share an update with the workspace",Megaphone,"announce"),
    action("View reports","Open performance and reports",GraduationCap,"results"),
    action("Manage staff","View team access and roles",BookUser,"teachers")
  ];
  const modules=[
    {title:"People",desc:"Member directory and onboarding",Icon:Users,page:"students"},
    {title:"Staff & access",desc:"Staff records, permissions and approvals",Icon:BookUser,page:"teachers"},
    {title:"Groups",desc:"Organize people into groups",Icon:School,page:"classes"},
    {title:"Billing",desc:"Billing items, templates and bill generation",Icon:CreditCard,page:"fees"},
    {title:"Payment tracking",desc:"Review payments and outstanding balances",Icon:Wallet,page:"fee-tracker"},
    {title:"Communication",desc:"Announcements and email tools",Icon:Mail,page:"announce"},
    {title:"Performance",desc:"Records, scoring and report cards",Icon:BarChart3,page:"results"},
    {title:"Administration",desc:"Permissions, audit trail and workspace settings",Icon:Settings,page:"settings"}
  ];
  const labelColor="#A1A1AA";
  const titleStyle={fontSize:15,fontWeight:800,color:"#F5F5F5",letterSpacing:"-.02em"};
  const buttonStyle={border:"1px solid #303030",background:"#151515",color:"#F4F4F5",borderRadius:12,cursor:"pointer",padding:"12px 14px",display:"flex",alignItems:"center",gap:10,textAlign:"left",width:"100%"};
  return <div style={{color:"#F5F5F5",maxWidth:1440,margin:"0 auto",paddingBottom:28}}>
    <section style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",gap:16,flexWrap:"wrap",marginBottom:24}}>
      <div>
        <div style={{fontSize:11,fontWeight:800,letterSpacing:1.7,textTransform:"uppercase",color:"#D9B650",marginBottom:8}}>Workspace overview</div>
        <h1 style={{fontSize:30,lineHeight:1.12,letterSpacing:"-.04em",margin:"0 0 8px",fontWeight:850}}>{getGreeting(user?.name||"there")}</h1>
        <p style={{margin:0,color:labelColor,fontSize:13}}>A live view of your people, billing, communication and operations.</p>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:8,color:labelColor,fontSize:12,background:"#111",border:"1px solid #2b2b2b",padding:"10px 13px",borderRadius:12}}>
        <Activity size={15} color="#D9B650"/> Updated from your workspace data
      </div>
    </section>
    <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12,marginBottom:18}}>
      {[
        {label:"People",value:data.students,Icon:Users,page:"students"},
        {label:"Staff",value:data.staff,Icon:BookUser,page:"teachers"},
        {label:"Groups",value:data.groups,Icon:School,page:"classes"},
        {label:"Fee records",value:data.bills,Icon:ReceiptText,page:"fees"},
        {label:"Payments recorded",value:money(data.collected),Icon:Wallet,page:"payments"}
      ].map((item,i)=><button key={item.label} onClick={()=>go(item.page)} style={{...panel,padding:"17px 18px",textAlign:"left",cursor:"pointer",color:"#F5F5F5",minHeight:112}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:15}}>
          <span style={{fontSize:12,color:labelColor,fontWeight:650}}>{item.label}</span>
          <item.Icon size={18} color={i===0?"#E5C15C":"#D4D4D8"}/>
        </div>
        <div style={{fontSize:25,fontWeight:850,letterSpacing:"-.04em"}}>{loading?"—":item.value}</div>
      </button>)}
    </section>
    <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(290px,1fr))",gap:14,marginBottom:14}}>
      <div style={{...panel,padding:20,minWidth:0}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div><div style={titleStyle}>Recent activity</div><div style={{fontSize:12,color:labelColor,marginTop:4}}>Latest recorded workspace actions</div></div>
          <button onClick={()=>go("admin-tools")} style={{background:"none",border:0,color:"#E2C15D",fontSize:12,fontWeight:750,cursor:"pointer"}}>View activity →</button>
        </div>
        {loading?<div style={{padding:24,color:labelColor}}>Loading activity…</div>:data.activity.length?data.activity.map((item,i)=><div key={item.id||i} style={{display:"flex",gap:12,alignItems:"center",padding:"13px 0",borderTop:"1px solid #252525"}}>
          <div style={{width:34,height:34,borderRadius:10,background:"#242016",display:"grid",placeItems:"center",flexShrink:0}}><Activity size={16} color="#D9B650"/></div>
          <div style={{minWidth:0,flex:1}}><div style={{fontSize:13,fontWeight:700,color:"#F4F4F5"}}>{item.action||item.event_type||item.description||"Workspace activity"}</div><div style={{fontSize:11,color:labelColor,marginTop:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.details||item.target_type||item.entity_type||"Activity recorded"}</div></div>
          <div style={{fontSize:10,color:"#858585",whiteSpace:"nowrap"}}>{item.created_at?new Date(item.created_at).toLocaleDateString("en-NG",{day:"numeric",month:"short"}):""}</div>
        </div>):<div style={{padding:"25px 0",color:labelColor,fontSize:13}}>No recent activity has been recorded yet.</div>}
      </div>
      <div style={{...panel,padding:20}}>
        <div style={{...titleStyle,marginBottom:5}}>Quick actions</div>
        <div style={{fontSize:12,color:labelColor,marginBottom:15}}>Jump straight into common tasks.</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:9}}>
          {actions.map(({label,detail,Icon,page})=><button key={page+label} onClick={()=>go(page)} style={{...buttonStyle,display:"block",minHeight:86}}>
            <Icon size={18} color="#D9B650"/><div style={{fontSize:12,fontWeight:750,marginTop:9}}>{label}</div><div style={{fontSize:10,color:labelColor,marginTop:4,lineHeight:1.4}}>{detail}</div>
          </button>)}
        </div>
      </div>
    </section>
    <section style={{...panel,padding:20,marginBottom:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,marginBottom:15,flexWrap:"wrap"}}>
        <div><div style={titleStyle}>Your workspace modules</div><div style={{fontSize:12,color:labelColor,marginTop:4}}>Open the features currently available in this workspace.</div></div>
        <span style={{fontSize:10,color:"#D9B650",border:"1px solid #5A4A24",background:"#211D12",padding:"5px 9px",borderRadius:20}}>LIVE MODULES</span>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:9}}>
        {modules.filter(m=>m.page!=="results"||role==="admin"||role==="teacher").map(({title,desc,Icon,page})=><button key={page} onClick={()=>go(page)} style={{...buttonStyle,minHeight:76}}>
          <div style={{width:36,height:36,borderRadius:11,background:"#242016",display:"grid",placeItems:"center",flexShrink:0}}><Icon size={17} color="#D9B650"/></div>
          <div style={{minWidth:0,flex:1}}><div style={{fontSize:12,fontWeight:750}}>{title}</div><div style={{fontSize:10,color:labelColor,marginTop:4,lineHeight:1.4}}>{desc}</div></div><ChevronRight size={15} color="#777"/>
        </button>)}
      </div>
    </section>
    <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:14}}>
      <div style={{...panel,padding:19}}>
        <div style={{...titleStyle,marginBottom:12}}>Announcements</div>
        {data.notices.length?data.notices.map((n,i)=><div key={n.id||i} style={{padding:"10px 0",borderTop:"1px solid #252525"}}><div style={{fontSize:12,fontWeight:750}}>{n.title||n.subject||"Announcement"}</div><div style={{fontSize:11,color:labelColor,marginTop:4}}>{n.created_at?new Date(n.created_at).toLocaleDateString("en-NG",{day:"numeric",month:"short",year:"numeric"}):"Workspace update"}</div></div>):<div style={{fontSize:12,color:labelColor}}>No announcements yet.</div>}
        <button onClick={()=>go("announce")} style={{marginTop:9,background:"none",border:0,padding:0,color:"#D9B650",fontWeight:750,fontSize:11,cursor:"pointer"}}>Open announcements →</button>
      </div>
      <div style={{...panel,padding:19}}>
        <div style={{...titleStyle,marginBottom:8}}>Workspace administration</div>
        <p style={{fontSize:12,color:labelColor,lineHeight:1.6,margin:"0 0 14px"}}>Manage organization details, permissions, access requests and operational settings.</p>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <button onClick={()=>go("settings")} style={{...buttonStyle,width:"auto",fontSize:11}}> <Settings size={14}/> Settings</button>
          <button onClick={()=>go("permissions")} style={{...buttonStyle,width:"auto",fontSize:11}}><ShieldCheck size={14}/> Permissions</button>
          <button onClick={()=>go("access-requests")} style={{...buttonStyle,width:"auto",fontSize:11}}><Lock size={14}/> Access requests</button>
        </div>
      </div>
    </section>
  </div>;
}

// ─── ACCESS DENIED (shared by page guards) ────────────────────────────────────
export function ManagerDashboard({ctx}){
  const{setPage}=ctx;
  return(
    <div style={{padding:"24px 16px",maxWidth:900,margin:"0 auto"}}>
      <div style={{background:"linear-gradient(135deg,#6d28d9,#7C3AED)",color:"#fff",borderRadius:16,padding:"24px 28px",marginBottom:20,display:"flex",alignItems:"center",gap:16}}>
        <DollarSign size={36} color="#fff" style={{opacity:.85}}/>
        <div>
          <div style={{fontWeight:900,fontSize:20}}>Finance Overview</div>
          <div style={{fontSize:13,opacity:.8,marginTop:2}}>Manage billing charges, payments and financial records</div>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12}}>
        {[
          {label:"Payment Tracker",page:"fee-tracker",bg:"#7C3AED",desc:"Record & track payments"},
          {label:"Billing Items",      page:"fee-items",  bg:"#6d28d9",desc:"Manage billing categories"},
          {label:"Billing Templates",  page:"fee-templates",bg:"#5b21b6",desc:"Create billing bundles"},
          {label:"Generate Bills", page:"fee-generate",bg:"#4c1d95",desc:"Bill members"},
          {label:"Statistics",     page:"fee-stats",  bg:"#3b0764",desc:"Revenue reports"},
          {label:"Announcements",  page:"announce",   bg:"#1A4FA0",desc:"Post announcements"},
        ].map(q=>(
          <button key={q.page} onClick={()=>setPage(q.page)}
            style={{padding:"16px",borderRadius:12,border:"none",background:q.bg,color:"#fff",cursor:"pointer",textAlign:"left",transition:"transform .15s",boxShadow:"0 2px 8px rgba(0,0,0,.15)"}}>
            <div style={{fontWeight:800,fontSize:13,marginBottom:4}}>{q.label}</div>
            <div style={{fontSize:10,opacity:.8}}>{q.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
// ─── BURSAR DASHBOARD ─────────────────────────────────────────────────────────
export function BursarDashboard({ctx}){
  const{setPage}=ctx;
  return(
    <div style={{padding:"24px 16px",maxWidth:900,margin:"0 auto"}}>
      <div style={{background:"linear-gradient(135deg,#92400e,#B45309)",color:"#fff",borderRadius:16,padding:"24px 28px",marginBottom:20,display:"flex",alignItems:"center",gap:16}}>
        <DollarSign size={36} color="#fff" style={{opacity:.85}}/>
        <div>
          <div style={{fontWeight:900,fontSize:20}}>Finance Manager — Finance Overview</div>
          <div style={{fontSize:13,opacity:.8,marginTop:2}}>Manage billing charges, payments and financial records</div>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12}}>
        {[
          {label:"Payment Tracker",page:"fee-tracker",  bg:"#B45309",desc:"Record & track payments"},
          {label:"Billing Items",      page:"fee-items",    bg:"#92400e",desc:"Manage billing categories"},
          {label:"Billing Templates",  page:"fee-templates",bg:"#78350f",desc:"Create billing bundles"},
          {label:"Generate Bills", page:"fee-generate", bg:"#6b2d09",desc:"Bill members"},
          {label:"Statistics",     page:"fee-stats",    bg:"#5c2508",desc:"Revenue reports"},
          {label:"Announcements",  page:"announce",     bg:"#1A4FA0",desc:"Post announcements"},
        ].map(q=>(
          <button key={q.page} onClick={()=>setPage(q.page)}
            style={{padding:"16px",borderRadius:12,border:"none",background:q.bg,color:"#fff",cursor:"pointer",textAlign:"left",transition:"transform .15s",boxShadow:"0 2px 8px rgba(0,0,0,.15)"}}>
            <div style={{fontWeight:800,fontSize:13,marginBottom:4}}>{q.label}</div>
            <div style={{fontSize:10,opacity:.8}}>{q.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
// PERM_GROUPS, RBAC_ROLES, PERM_ROLE_DEFAULTS → now in AppDemo.jsx (main bundle).
// Imported by permissions.jsx. Not used directly in dashboard.jsx.
