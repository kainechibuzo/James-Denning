/**
 * Administration pages: AuditLogPage, AdminToolsPage.
 */
import React, { useState, useEffect, useMemo } from "react";
import { Search } from "lucide-react";
import { db } from "../supabaseClient.js";
import { C } from "../config/theme.js";
import { useIsMobile } from "../utils/hooks.js";
import { Card, Btn, Badge, Spinner, AppIcon } from "../components/ui.jsx";

// ─── AUDIT LOG PAGE ───────────────────────────────────────────────────────────
export function AuditLogPage({ctx}){
  const {notify}=ctx;
  const isMobile=useIsMobile();
  const [logs,setLogs]=useState([]);
  const [loading,setLoading]=useState(true);
  const [filterType,setFilterType]=useState("");
  const [filterAction,setFilterAction]=useState("");
  const [filterActor,setFilterActor]=useState("");
  const [fromDate,setFromDate]=useState("");
  const [toDate,setToDate]=useState("");
  const [search,setSearch]=useState("");
  const [page,setPage]=useState(0);
  const [expanded,setExpanded]=useState(null);
  const PAGE_SIZE=50;

  const loadLogs=(reset=false)=>{
    setLoading(true);
    const filters={limit:5000};
    if(fromDate)filters.from=new Date(fromDate).toISOString();
    if(toDate){const d=new Date(toDate);d.setHours(23,59,59,999);filters.to=d.toISOString();}
    db.getAdminAuditLog(filters).then(({data})=>{setLogs(data||[]);setLoading(false);if(reset)setPage(0);});
  };
  useEffect(()=>{loadLogs(true);},[fromDate,toDate]);

  const actionIcon=(a)=>({status_change:"↻",delete:"✕",edit:"✎",create:"+",
    login_success:"→",login_failed:"⚠",logout:"←",logout_kicked:"⏏",logout_idle:"⏱",
    role_change:"⇄",setting_change:"⚙",bulk_delete:"✕",bulk_status_change:"↻",
    page_view:"👁",data_export:"⇩"}[a]||"•");
  const actionLabel=(a)=>({status_change:"Status Change",delete:"Deleted",edit:"Edited",create:"Created",
    login_success:"Login",login_failed:"Login Failed",logout:"Logout",logout_kicked:"Kicked",logout_idle:"Idle Logout",
    role_change:"Role Change",setting_change:"Setting Changed",
    bulk_delete:"Bulk Delete",bulk_status_change:"Bulk Status",
    page_view:"Page View",data_export:"Data Exported"}[a]||a);
  const typeColor=(t)=>({auth:C.orange,setting:"var(--jd-muted)",member:C.muted,
    page:C.muted,dataset:C.muted}[t]||C.muted);
  const actionColor=(a)=>({login_success:C.green,login_failed:C.red,logout:C.muted,logout_kicked:C.red,
    delete:C.red,bulk_delete:C.red,create:C.green,edit:C.blue,role_change:C.purple,
    setting_change:"var(--jd-muted)",page_view:C.muted,data_export:C.muted}[a]||C.text);

  const actors=useMemo(()=>{const s=new Set();logs.forEach(l=>{if(l.performed_by)s.add(l.performed_by);});return[...s].sort();},[logs]);
  const actions=useMemo(()=>{const s=new Set();logs.forEach(l=>{if(l.action)s.add(l.action);});return[...s].sort();},[logs]);
  const entityTypes=useMemo(()=>{const s=new Set();logs.forEach(l=>{if(l.entity_type)s.add(l.entity_type);});return[...s].sort();},[logs]);

  const filtered=useMemo(()=>logs.filter(l=>{
    if(filterType&&l.entity_type!==filterType)return false;
    if(filterAction&&l.action!==filterAction)return false;
    if(filterActor&&!(l.performed_by||"").toLowerCase().includes(filterActor.toLowerCase())&&
       !(l.actor_email||"").toLowerCase().includes(filterActor.toLowerCase()))return false;
    if(search){const q=search.toLowerCase();
      if(!(l.entity_name||"").toLowerCase().includes(q)&&
         !(l.entity_id||"").toLowerCase().includes(q)&&
         !(l.performed_by||"").toLowerCase().includes(q)&&
         !(l.summary||"").toLowerCase().includes(q)&&
         !(l.notes||"").toLowerCase().includes(q))return false;}
    return true;
  }),[logs,filterType,filterAction,filterActor,search]);

  const paged=filtered.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE);
  const totalPages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
  const safePage=Math.min(page,totalPages-1);

  const exportCSV=()=>{
    const rows=[["Date","Action","Type","ID","Name","Summary","Old Value","New Value","Actor","Actor Email","Actor Role","IP","Cycle"],...filtered.map(l=>[
      new Date(l.performed_at).toLocaleString("en-NG"),
      l.action,l.entity_type,l.entity_id,l.entity_name||"",l.summary||l.notes||"",
      JSON.stringify(l.old_value||""),JSON.stringify(l.new_value||""),
      l.performed_by,l.actor_email||"",l.actor_type||"",l.ip_address||"",l.session_id||""
    ])];
    const csv=rows.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(",")).join("\n");
    const a=document.createElement("a");a.href="data:text/csv;charset=utf-8,"+encodeURIComponent(csv);
    a.download=`audit_trail_${new Date().toISOString().slice(0,10)}.csv`;a.click();
  };
  const clearFilters=()=>{setSearch("");setFilterType("");setFilterAction("");setFilterActor("");setFromDate("");setToDate("");setPage(0);};

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18,flexWrap:"wrap",gap:10}}>
        <div>
          <h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="audit-log" size={20}/>Audit Trail</h2>
          <p style={{color:C.muted,fontSize:12}}>Every action by every user — logins, edits, deletes and settings. Click a row to see full details.</p>
        </div>
        <div style={{display:"flex",gap:8}}>
          <Btn onClick={()=>loadLogs(false)} color={C.blue} outline>Refresh</Btn>
          <Btn onClick={exportCSV} color={C.green} outline>Export CSV</Btn>
        </div>
      </div>
      <Card style={{padding:12,marginBottom:12}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:8,alignItems:"end"}}>
          <div>
            <label style={{fontSize:10,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5}}>Search</label>
            <input value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}} placeholder="Name, ID, actor, note…"
              style={{width:"100%",padding:"7px 10px",border:`1.5px solid ${C.border}`,borderRadius:6,fontSize:13,outline:"none",boxSizing:"border-box"}}/>
          </div>
          <div>
            <label style={{fontSize:10,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5}}>Actor</label>
            <select value={filterActor} onChange={e=>{setFilterActor(e.target.value);setPage(0);}}
              style={{width:"100%",padding:"7px 10px",border:`1.5px solid ${C.border}`,borderRadius:6,fontSize:13,background:C.white,outline:"none",boxSizing:"border-box",cursor:"pointer"}}>
              <option value="">All users</option>
              {actors.map(a=><option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label style={{fontSize:10,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5}}>Action</label>
            <select value={filterAction} onChange={e=>{setFilterAction(e.target.value);setPage(0);}}
              style={{width:"100%",padding:"7px 10px",border:`1.5px solid ${C.border}`,borderRadius:6,fontSize:13,background:C.white,outline:"none",boxSizing:"border-box",cursor:"pointer"}}>
              <option value="">All actions</option>
              {actions.map(a=><option key={a} value={a}>{actionLabel(a)}</option>)}
            </select>
          </div>
          <div>
            <label style={{fontSize:10,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5}}>Entity</label>
            <select value={filterType} onChange={e=>{setFilterType(e.target.value);setPage(0);}}
              style={{width:"100%",padding:"7px 10px",border:`1.5px solid ${C.border}`,borderRadius:6,fontSize:13,background:C.white,outline:"none",boxSizing:"border-box",cursor:"pointer"}}>
              <option value="">All entities</option>
              {entityTypes.map(t=><option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={{fontSize:10,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5}}>From</label>
            <input type="date" value={fromDate} onChange={e=>setFromDate(e.target.value)}
              style={{width:"100%",padding:"7px 10px",border:`1.5px solid ${C.border}`,borderRadius:6,fontSize:13,outline:"none",boxSizing:"border-box"}}/>
          </div>
          <div>
            <label style={{fontSize:10,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5}}>To</label>
            <input type="date" value={toDate} onChange={e=>setToDate(e.target.value)}
              style={{width:"100%",padding:"7px 10px",border:`1.5px solid ${C.border}`,borderRadius:6,fontSize:13,outline:"none",boxSizing:"border-box"}}/>
          </div>
          <div style={{display:"flex",alignItems:"end"}}>
            {(search||filterType||filterAction||filterActor||fromDate||toDate)
              ?<Btn outline color={C.muted} onClick={clearFilters} style={{width:"100%"}}>Clear all</Btn>
              :<div style={{fontSize:11,color:C.muted,padding:"8px 0"}}>{filtered.length} of {logs.length} event(s)</div>}
          </div>
        </div>
        {(search||filterType||filterAction||filterActor||fromDate||toDate)&&(
          <div style={{marginTop:8,fontSize:11,color:C.muted}}>
            Showing {filtered.length.toLocaleString()} of {logs.length.toLocaleString()} event(s)
          </div>
        )}
      </Card>
      {loading?<Spinner/>:filtered.length===0?(
        <Card style={{textAlign:"center",padding:52}}>
          <div style={{marginBottom:10}}><AppIcon name="audit-log" size={40} color={C.muted}/></div>
          <div style={{fontWeight:800,color:C.blue,fontSize:16}}>No Audit Records</div>
          <div style={{color:C.muted,fontSize:13,marginTop:6}}>No events match the current filters.</div>
        </Card>
      ):(
        <>
        <Card style={{padding:0,overflow:isMobile?"auto":"hidden"}}>
          <table style={{width:"100%",minWidth:isMobile?720:undefined,borderCollapse:"collapse"}}>
            <thead>
              <tr style={{background:C.offWhite,borderBottom:`2px solid ${C.border}`}}>
                {["When","Actor","Action","Entity","Summary / Change",""].map(h=>(
                  <th key={h} style={{padding:"10px 14px",textAlign:"left",fontSize:11,fontWeight:800,
                    color:C.muted,textTransform:"uppercase",letterSpacing:.5}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map((l,i)=>{
                const isOpen=expanded===l.id;
                return(
                  <React.Fragment key={l.id}>
                    <tr style={{borderBottom:`1px solid ${C.border}`,background:i%2===0?C.white:C.offWhite,cursor:"pointer"}}
                        onClick={()=>setExpanded(isOpen?null:l.id)}>
                      <td style={{padding:"10px 14px",fontSize:12,color:C.muted,whiteSpace:"nowrap"}}>
                        {new Date(l.performed_at).toLocaleString("en-NG",{day:"numeric",month:"short",year:"2-digit",hour:"2-digit",minute:"2-digit"})}
                      </td>
                      <td style={{padding:"10px 14px",fontSize:12}}>
                        <div style={{fontWeight:700,color:C.text}}>{l.performed_by||"System"}</div>
                        {l.actor_email&&<div style={{color:C.muted,fontSize:10}}>{l.actor_email}</div>}
                      </td>
                      <td style={{padding:"10px 14px"}}>
                        <span style={{fontSize:13,display:"flex",alignItems:"center",gap:6,color:actionColor(l.action),fontWeight:700}}>
                          <span>{actionIcon(l.action)}</span>
                          <span style={{fontSize:12}}>{actionLabel(l.action)}</span>
                        </span>
                      </td>
                      <td style={{padding:"10px 14px",fontSize:12}}>
                        {l.entity_type&&<Badge color={typeColor(l.entity_type)} style={{fontSize:10,marginRight:6}}>{l.entity_type}</Badge>}
                        <div style={{fontWeight:700,color:C.text,marginTop:3}}>{l.entity_name||"—"}</div>
                        {l.entity_id&&<div style={{color:C.muted,fontSize:10}}>{l.entity_id}</div>}
                      </td>
                      <td style={{padding:"10px 14px",fontSize:12,color:C.muted,maxWidth:280,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                        {l.summary||(l.old_value&&l.new_value?(
                          <span>
                            <span style={{color:C.red}}>{JSON.stringify(l.old_value).slice(0,60)}</span>
                            {" → "}
                            <span style={{color:C.green,fontWeight:700}}>{JSON.stringify(l.new_value).slice(0,60)}</span>
                          </span>
                        ):l.notes||(l.new_value?JSON.stringify(l.new_value).slice(0,80):"—"))}
                      </td>
                      <td style={{padding:"10px 14px",fontSize:11,color:C.muted,whiteSpace:"nowrap"}}>
                        {isOpen?"▼":"▶"}
                      </td>
                    </tr>
                    {isOpen&&(
                      <tr style={{background:C.bluePale}}>
                        <td colSpan={6} style={{padding:"14px 18px",borderBottom:`1px solid ${C.border}`}}>
                          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:14,fontSize:12}}>
                            <div><strong style={{color:C.blue}}>Actor</strong><div>{l.performed_by}</div>
                              {l.actor_email&&<div style={{color:C.muted,fontSize:11}}>{l.actor_email}</div>}
                              {l.actor_type&&<div style={{color:C.muted,fontSize:11}}>Role: {l.actor_type}</div>}
                              {l.actor_id&&<div style={{color:C.muted,fontSize:11}}>ID: {l.actor_id}</div>}
                            </div>
                            <div><strong style={{color:C.blue}}>Cycle</strong>
                              <div style={{color:C.muted,fontSize:11,wordBreak:"break-all"}}>{l.session_id||"—"}</div>
                              {l.ip_address&&<div style={{color:C.muted,fontSize:11}}>IP: {l.ip_address}</div>}
                              {l.user_agent&&<div style={{color:C.muted,fontSize:10,maxHeight:60,overflow:"auto"}}>{l.user_agent}</div>}
                            </div>
                            <div><strong style={{color:C.blue}}>Target</strong>
                              <div>{l.entity_type||"—"} / {l.entity_id||"—"}</div>
                              <div style={{color:C.muted,fontSize:11}}>{l.entity_name||""}</div>
                            </div>
                            <div><strong style={{color:C.blue}}>When</strong>
                              <div>{new Date(l.performed_at).toLocaleString("en-NG")}</div>
                            </div>
                          </div>
                          {(l.old_value||l.new_value)&&(
                            <div style={{marginTop:14,display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:14}}>
                              <div>
                                <strong style={{color:C.red,fontSize:11,textTransform:"uppercase",letterSpacing:.5}}>Before</strong>
                                <pre style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:6,padding:10,fontSize:11,overflow:"auto",maxHeight:240,margin:0}}>
{l.old_value?JSON.stringify(l.old_value,null,2):"—"}
                                </pre>
                              </div>
                              <div>
                                <strong style={{color:C.green,fontSize:11,textTransform:"uppercase",letterSpacing:.5}}>After</strong>
                                <pre style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:6,padding:10,fontSize:11,overflow:"auto",maxHeight:240,margin:0}}>
{l.new_value?JSON.stringify(l.new_value,null,2):"—"}
                                </pre>
                              </div>
                            </div>
                          )}
                          {l.notes&&<div style={{marginTop:10,fontSize:12,color:C.muted}}><strong>Notes:</strong> {l.notes}</div>}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </Card>
        {totalPages>1&&(
          <div style={{display:"flex",flexDirection:isMobile?"column":"row",justifyContent:"space-between",alignItems:isMobile?"stretch":"center",gap:8,marginTop:12,fontSize:12,color:C.muted}}>
            <div style={{textAlign:isMobile?"center":"left"}}>Page {safePage+1} of {totalPages} · {filtered.length.toLocaleString()} event(s)</div>
            <div style={{display:"flex",gap:6,justifyContent:"center"}}>
              <Btn outline color={C.muted} onClick={()=>setPage(0)} disabled={safePage===0}>First</Btn>
              <Btn outline color={C.muted} onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={safePage===0}>Prev</Btn>
              <Btn outline color={C.muted} onClick={()=>setPage(p=>Math.min(totalPages-1,p+1))} disabled={safePage>=totalPages-1}>Next</Btn>
              <Btn outline color={C.muted} onClick={()=>setPage(totalPages-1)} disabled={safePage>=totalPages-1}>Last</Btn>
            </div>
          </div>
        )}
        </>
      )}
    </div>
  );
}


export function AdminToolsPage({ctx}){
  const {setPage}=ctx;

  const TOOLS=[
    {id:"audit-log",     icon:"audit-log",     label:"Audit Trail",
     desc:"Full chronological record of every admin action taken in the workspace.",
     color:"var(--jd-text-soft)",bg:"var(--jd-soft)"},
  ];

  return(
    <div style={{maxWidth:860,margin:"0 auto",paddingBottom:40}}>
      <div className="jd-page-header" style={{background:`linear-gradient(135deg,var(--jd-text),var(--jd-text-soft))`,
        padding:"20px 28px",marginBottom:28,display:"flex",alignItems:"center",gap:16,borderRadius:14}}>
        <div style={{background:"color-mix(in srgb, var(--jd-card) 18%, transparent)",borderRadius:10,padding:10,display:"flex"}}>
          <AppIcon name="database" size={22} color="var(--jd-card)"/>
        </div>
        <div>
          <h2 style={{color:"var(--jd-card)",fontWeight:900,fontSize:18,margin:0}}>Admin Tools</h2>
          <p style={{color:"color-mix(in srgb, var(--jd-card) 75%, transparent)",fontSize:12,margin:"2px 0 0"}}>
            Maintenance, exports, audit history and system utilities
          </p>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:16}}>
        {TOOLS.map(t=>(
          <div key={t.id} onClick={()=>setPage(t.id)}
            style={{background:C.white,border:`1.5px solid ${C.border}`,borderRadius:14,
              padding:"20px 22px",cursor:"pointer",transition:"all .15s",
              boxShadow:"0 1px 4px rgba(0,0,0,.06)"}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor=t.color;e.currentTarget.style.boxShadow=`0 4px 16px ${t.color}22`;}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.boxShadow="0 1px 4px rgba(0,0,0,.06)";}}>
            <div style={{width:46,height:46,borderRadius:12,background:t.bg,
              display:"flex",alignItems:"center",justifyContent:"center",marginBottom:14}}>
              <AppIcon name={t.icon} size={22} color={t.color}/>
            </div>
            <div style={{fontWeight:800,fontSize:14,color:C.text,marginBottom:6}}>{t.label}</div>
            <div style={{fontSize:12,color:C.muted,lineHeight:1.6}}>{t.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
