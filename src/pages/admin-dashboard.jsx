import React,{useCallback,useEffect,useMemo,useState} from "react";
import {Activity,ArrowUpRight,Bell,BriefcaseBusiness,CheckCircle2,Clock3,FileText,Mail,Package,RefreshCw,Shield,Users,Wallet,AlertCircle,Settings,ClipboardList} from "lucide-react";
import {db} from "../supabaseClient.js";

const ink="var(--jd-text,#25262a)",muted="var(--jd-muted,#777b83)",line="var(--jd-border,#e8e5df)",paper="var(--jd-card,#fffdf8)",soft="var(--jd-soft,#f5f2eb)";
const shortcuts=[
 {id:"jd-operations",title:"Operations",detail:"Tasks, execution runs and organisation workflows",icon:Activity},
 {id:"jd-skills",title:"Skills catalogue",detail:"Review imported capabilities and publication status",icon:Package},
 {id:"hiring",title:"People & recruitment",detail:"Vacancies, candidates and hiring pipeline",icon:Users},
 {id:"billing",title:"Billing & usage",detail:"Workspace billing settings and usage summaries",icon:Wallet},
 {id:"permissions",title:"Access control",detail:"Role and user permission settings",icon:Shield},
 {id:"settings",title:"Workspace settings",detail:"Organisation preferences and security",icon:Settings},
 {id:"mail-logs",title:"Email delivery",detail:"Recent outbound email batches and delivery records",icon:Mail},
 {id:"admin-tools",title:"Admin tools",detail:"Maintenance utilities and audit trail",icon:ClipboardList},
 {id:"audit-log",title:"Audit trail",detail:"Review recorded administrative actions",icon:FileText},
 {id:"notifications",title:"Notifications",detail:"Workspace alerts and admin notices",icon:Bell},
];
function Metric({label,value,note,icon:Icon,onClick}){return <button type="button" onClick={onClick} style={{textAlign:"left",background:paper,border:"1px solid "+line,borderRadius:14,padding:17,minWidth:0,cursor:onClick?"pointer":"default",color:ink}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}><span style={{fontSize:11,color:muted,fontWeight:700}}>{label}</span><Icon size={17} color={muted}/></div><div style={{fontSize:28,fontWeight:750,letterSpacing:"-.04em",marginTop:9}}>{value}</div><div style={{fontSize:11,color:muted,marginTop:4}}>{note}</div></button>}
export function AdminDashboardPage({ctx}){
 const {user,selectedSchool,setPage,notify}=ctx||{};
 const [loading,setLoading]=useState(true),[error,setError]=useState(""),[audit,setAudit]=useState([]),[notifications,setNotifications]=useState([]),[emailBatches,setEmailBatches]=useState([]),[school,setSchool]=useState(null),[updatedAt,setUpdatedAt]=useState(null);
 const admin= user?.role==="admin";
 const refresh=useCallback(async()=>{
  if(!admin){setLoading(false);return;}
  setLoading(true);setError("");
  try{
   const schoolId=selectedSchool?.id||user?.school_id;
   const results=await Promise.all([
    db.getAdminAuditLog({limit:12}),
    db.getAdminNotifications(20),
    db.getEmailBatches(),
    schoolId?db.getSchool(schoolId):Promise.resolve({data:null,error:null})
   ]);
   const failure=results.find(r=>r?.error);
   if(failure)throw failure.error;
   setAudit(results[0]?.data||[]);
   setNotifications(results[1]?.data||[]);
   setEmailBatches(results[2]?.data||[]);
   setSchool(results[3]?.data||null);
   setUpdatedAt(new Date());
  }catch(e){setError(e?.message||"Some dashboard records could not be loaded.");}
  finally{setLoading(false);}
 },[admin,selectedSchool?.id,user?.school_id]);
 useEffect(()=>{refresh();},[refresh]);
 const unread=useMemo(()=>notifications.filter(n=>!n.read_at).length,[notifications]);
 const delivered=useMemo(()=>emailBatches.reduce((n,b)=>n+Number(b.sent||0),0),[emailBatches]);
 const orgName=school?.name||selectedSchool?.name||"Your workspace";
 if(!admin)return <section role="alert" style={{padding:24,color:ink}}>Administrator access is required to open this page.</section>;
 return <div style={{maxWidth:1180,margin:"0 auto",padding:"8px 0 42px",color:ink}}>
  <header style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:14,flexWrap:"wrap",marginBottom:22}}>
   <div><div style={{fontSize:10,letterSpacing:".16em",textTransform:"uppercase",color:muted,fontWeight:750}}>James-Denning · Control room</div><h1 style={{fontFamily:"'JD Serif',Georgia,serif",fontSize:"clamp(28px,5vw,40px)",fontWeight:500,margin:"7px 0 5px"}}>Admin dashboard</h1><p style={{fontSize:13,color:muted}}>{orgName} · Signed in as {user?.email||user?.name||"Workspace administrator"}</p></div>
   <button type="button" onClick={refresh} disabled={loading} style={{display:"inline-flex",alignItems:"center",gap:7,border:"1px solid "+line,borderRadius:10,padding:"10px 13px",background:paper,color:ink,cursor:"pointer"}}><RefreshCw size={14}/>{loading?"Refreshing":"Refresh data"}</button>
  </header>
  <section style={{border:"1px solid "+line,borderRadius:16,padding:18,background:soft,marginBottom:16}}>
   <div style={{display:"flex",justifyContent:"space-between",gap:10,flexWrap:"wrap",alignItems:"center"}}><div><div style={{fontSize:12,fontWeight:750}}>Workspace status</div><div style={{fontSize:12,color:muted,marginTop:4}}>Your account has the administrator role. This page links to existing workspace controls; it does not grant additional privileges.</div></div><span style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:11,border:"1px solid "+line,borderRadius:30,padding:"6px 10px",background:paper}}><CheckCircle2 size={13}/> Admin session</span></div>
  </section>
  {error&&<div role="alert" style={{padding:12,marginBottom:14,borderRadius:10,border:"1px solid "+line,background:soft,fontSize:12}}><AlertCircle size={14} style={{verticalAlign:"-2px",marginRight:6}}/>{error}</div>}
  <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(165px,1fr))",gap:10,marginBottom:24}}>
   <Metric label="Recent audit events" value={loading?"—":audit.length} note="Latest records loaded" icon={Activity} onClick={()=>setPage("audit-log")}/>
   <Metric label="Unread admin alerts" value={loading?"—":unread} note="Notifications addressed to admin" icon={Bell} onClick={()=>setPage("notifications")}/>
   <Metric label="Email batches" value={loading?"—":emailBatches.length} note={delivered+" delivered messages recorded"} icon={Mail} onClick={()=>setPage("mail-logs")}/>
   <Metric label="Workspace role" value="Admin" note="Current signed-in profile" icon={Shield}/>
  </section>
  <section style={{marginBottom:24}}>
   <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:10,marginBottom:11}}><h2 style={{fontSize:17,fontWeight:750}}>Administration</h2><span style={{fontSize:10,color:muted}}>Open an existing control area</span></div>
   <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(225px,1fr))",gap:10}}>
    {shortcuts.map(({id,title,detail,icon:Icon})=><button key={id} type="button" onClick={()=>setPage(id)} style={{display:"flex",alignItems:"flex-start",gap:12,textAlign:"left",padding:15,border:"1px solid "+line,borderRadius:13,background:paper,color:ink,cursor:"pointer",minHeight:88}}>
     <span style={{width:34,height:34,borderRadius:10,display:"grid",placeItems:"center",background:soft,flexShrink:0}}><Icon size={16}/></span><span style={{flex:1,minWidth:0}}><strong style={{display:"block",fontSize:13}}>{title}</strong><span style={{display:"block",fontSize:11,color:muted,lineHeight:1.45,marginTop:4}}>{detail}</span></span><ArrowUpRight size={14} color={muted}/>
    </button>)}
   </div>
  </section>
  <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:12}}>
   <div style={{border:"1px solid "+line,borderRadius:14,background:paper,padding:16}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}><h2 style={{fontSize:14}}>Recent activity</h2><button onClick={()=>setPage("audit-log")} style={{border:0,background:"transparent",color:muted,fontSize:11,cursor:"pointer"}}>View all ↗</button></div>
    {loading?<p style={{fontSize:12,color:muted}}>Loading audit records…</p>:audit.length?audit.slice(0,7).map((item,i)=><div key={item.id||i} style={{padding:"9px 0",borderTop:i?"1px solid "+line:"none"}}><div style={{fontSize:12,fontWeight:650}}>{item.summary||item.action||"Recorded event"}</div><div style={{fontSize:10,color:muted,marginTop:3}}>{item.performed_by||"System"} · {item.performed_at?new Date(item.performed_at).toLocaleString():"Time unavailable"}</div></div>):<p style={{fontSize:12,color:muted}}>No audit events were returned.</p>}
   </div>
   <div style={{border:"1px solid "+line,borderRadius:14,background:paper,padding:16}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}><h2 style={{fontSize:14}}>Admin notifications</h2><button onClick={()=>setPage("notifications")} style={{border:0,background:"transparent",color:muted,fontSize:11,cursor:"pointer"}}>Open inbox ↗</button></div>
    {loading?<p style={{fontSize:12,color:muted}}>Loading notifications…</p>:notifications.slice(0,7).length?notifications.slice(0,7).map((item,i)=><div key={item.id||i} style={{padding:"9px 0",borderTop:i?"1px solid "+line:"none"}}><div style={{display:"flex",gap:7,alignItems:"center"}}><span style={{width:6,height:6,borderRadius:8,background:item.read_at?"transparent":"var(--jd-text,#25262a)",border:"1px solid "+muted}}/><strong style={{fontSize:12}}>{item.title||"Notification"}</strong></div><div style={{fontSize:10,color:muted,marginTop:3}}>{item.body||"No additional details"} · {item.created_at?new Date(item.created_at).toLocaleString():"Time unavailable"}</div></div>):<p style={{fontSize:12,color:muted}}>No admin notifications were returned.</p>}
   </div>
  </section>
  <footer style={{fontSize:10,color:muted,marginTop:15}}>Data is read from the selected workspace. {updatedAt?"Last refreshed "+updatedAt.toLocaleTimeString():"Live records have not yet been confirmed."} Counts reflect returned records, not total platform-wide figures.</footer>
 </div>;
}
