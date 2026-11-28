/**
 * Email delivery logs for the organisation workspace.
 */
import React, { useState, useEffect } from "react";
import { Trash2, Search, Lock, RefreshCw } from "lucide-react";
import { db } from "../supabaseClient.js";
import { C } from "../config/theme.js";
import { Card, Btn, Modal, Spinner, AppIcon } from "../components/ui.jsx";

// ─── MAIL LOGS PAGE ───────────────────────────────────────────────────────────
export function MailLogsPage({ctx}){
  const {notify,role,canAccess,selectedSchool}=ctx;
  const canView=role==="admin"||canAccess("page:mail-logs");
  const [logs,setLogs]=useState([]);
  const [batches,setBatches]=useState([]);
  const [loading,setLoading]=useState(true);
  const [expanded,setExpanded]=useState(null);
  const [search,setSearch]=useState("");
  const [filterStatus,setFilterStatus]=useState("");
  const [filterAge,setFilterAge]=useState("");
  const [page,setPage]=useState(0);
  const [retriggeringId,setRetriggeringId]=useState(null);
  const PAGE_SIZE=25;
  const [selIds,setSelIds]=useState(new Set());
  const toggleSel=id=>setSelIds(p=>{const s=new Set(p);s.has(id)?s.delete(id):s.add(id);return s;});
  const clearSel=()=>setSelIds(new Set());
  const [purgeModal,setPurgeModal]=useState(false);
  const [purgeAge,setPurgeAge]=useState("90");
  const [purging,setPurging]=useState(false);

  const [loadError,setLoadError]=useState("");
  const load=()=>{
    if(!canView){setLoading(false);return;}
    setLoading(true);setLoadError("");
    Promise.resolve().then(()=>Promise.all([db.getEmailLogs(5000), db.getEmailBatches()])).then(([logsRes,batchRes])=>{
      setLogs(logsRes?.data||[]);
      setBatches(batchRes?.data||[]);
      clearSel();setPage(0);
    })
      // A failed read must end the spinner with a retryable message, not hang.
      .catch(e=>setLoadError(e?.message||"Could not load email logs right now."))
      .finally(()=>setLoading(false));
  };
  useEffect(load,[]);

  const retrigger=async(batch)=>{
    setRetriggeringId(batch.batch_id);
    await db.retriggerBatch(batch.batch_id);
    try{
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email-batch`,{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':`Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`},
        body:JSON.stringify({batch_id:batch.batch_id,rate_per_min:10}),
      });
    }catch(e){}
    setRetriggeringId(null);
    notify("Batch re-triggered. Refresh in a moment to see updated counts.");
    setTimeout(()=>Promise.resolve().then(()=>db.getEmailBatches()).then(({data}={})=>setBatches(data||[])).catch(()=>{}),5000);
  };

  if(!canView)return(
    <Card style={{textAlign:"center",padding:52}}>
      <div style={{marginBottom:10}}><Lock size={40} color={C.muted}/></div>
      <div style={{fontWeight:800,color:C.blue,fontSize:16}}>Access Denied</div>
      <div style={{color:C.muted,fontSize:13,marginTop:6}}>You don't have permission to view email logs.</div>
    </Card>
  );

  const cutoff=filterAge?new Date(Date.now()-+filterAge*86400000):null;
  const filtered=logs.filter(l=>{
    if(filterStatus&&l.status!==filterStatus)return false;
    if(cutoff&&new Date(l.sent_at)<cutoff)return false;
    if(search){
      const q=search.toLowerCase();
      if(!(l.subject||"").toLowerCase().includes(q)&&!(l.body||"").toLowerCase().includes(q)&&!(l.recipients||"").toLowerCase().includes(q))return false;
    }
    return true;
  });
  const totalPages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
  const paged=filtered.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE);
  const allPageSelected=paged.length>0&&paged.every(l=>selIds.has(l.id));
  const somePageSelected=!allPageSelected&&paged.some(l=>selIds.has(l.id));
  const togglePage=()=>allPageSelected?paged.forEach(l=>setSelIds(p=>{const s=new Set(p);s.delete(l.id);return s;})):paged.forEach(l=>setSelIds(p=>{const s=new Set(p);s.add(l.id);return s;}));

  // A delete only leaves the list (and only reports success) once the backend
  // confirms it; otherwise stale rows reappear on refresh and the operator has
  // been told data was removed that is still there.
  const deleteOne=async(id,e)=>{
    e?.stopPropagation?.();
    if(!window.confirm("Delete this log entry?"))return;
    try{
      const {error}=await db.deleteEmailLog(id);
      if(error)throw error;
      setLogs(p=>p.filter(l=>l.id!==id));
      clearSel();
      notify("Log deleted");
    }catch(err){notify("Delete failed: "+(err?.message||"the log was not removed"),"error");}
  };

  const deleteSelected=async()=>{
    if(!selIds.size)return;
    const count=selIds.size;
    if(!window.confirm(`Delete ${count} log entry${count!==1?"ies":"y"}?`))return;
    try{
      const {error}=await db.deleteEmailLogs([...selIds]);
      if(error)throw error;
      setLogs(p=>p.filter(l=>!selIds.has(l.id)));
      clearSel();
      notify(`${count} log${count!==1?"s":""} deleted`);
    }catch(err){notify("Delete failed: "+(err?.message||"the logs were not removed"),"error");}
  };

  const purge=async()=>{
    setPurging(true);
    const cutoffDate=new Date(Date.now()-+purgeAge*86400000).toISOString();
    const {error}=await db.deleteEmailLogsBefore(cutoffDate);
    setPurging(false);
    if(error){notify("Purge failed: "+error.message,"error");return;}
    setPurgeModal(false);
    notify(`Logs older than ${purgeAge} days purged \u2713`,"warn");
    load();
  };

  const SC={sent:C.green,failed:C.red,partial:C.amber};
  const SB={sent:C.greenPale,failed:C.redPale,partial:C.amberPale};

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:18,flexWrap:"wrap",gap:10}}>
        <div>
          <h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="mail-logs" size={20}/>Email Logs</h2>
          <p style={{color:C.muted,fontSize:12}}>{logs.length.toLocaleString()} total entries \u00b7 Click a row to expand body</p>
        </div>
        <div style={{display:"flex",gap:8}}>
          <Btn onClick={load} color={C.blue} outline sm><RefreshCw size={13} style={{marginRight:4}}/>Refresh</Btn>
          <Btn onClick={()=>setPurgeModal(true)} color={C.red} outline sm>Purge Old Logs</Btn>
        </div>
      </div>

      {batches.length>0&&(
        <div style={{marginBottom:18}}>
          <div style={{fontSize:12,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.7,marginBottom:8}}>Batch Sends</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {batches.map(b=>{
              const pct=b.total>0?Math.round((b.sent+b.failed)/b.total*100):0;
              const isDone=b.pending===0;
              const hasStuck=b.pending>0;
              return(
                <Card key={b.batch_id} style={{padding:"14px 18px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                    <div style={{flex:1,minWidth:180}}>
                      <div style={{fontWeight:700,fontSize:13,color:C.text,marginBottom:2}}>{b.subject||"(no category)"}</div>
                      <div style={{fontSize:11,color:C.muted}}>
                        {new Date(b.created_at).toLocaleString("en-NG",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:true})}
                        {" \u00b7 "}{b.total} recipient{b.total!==1?"s":""}
                      </div>
                    </div>
                    <div style={{display:"flex",gap:12,fontSize:12}}>
                      <span style={{color:C.green,fontWeight:700}}>\u2713 {b.sent} sent</span>
                      {b.failed>0&&<span style={{color:C.red,fontWeight:700}}>\u2717 {b.failed} failed</span>}
                      {b.pending>0&&<span style={{color:C.amber,fontWeight:700}}>\u23f3 {b.pending} pending</span>}
                    </div>
                    {hasStuck&&(
                      <button onClick={()=>retrigger(b)} disabled={retriggeringId===b.batch_id}
                        style={{background:C.amber,color:"var(--jd-card)",border:"none",borderRadius:8,padding:"5px 12px",
                          fontSize:11,fontWeight:700,cursor:"pointer",flexShrink:0}}>
                        {retriggeringId===b.batch_id?"Retrying\u2026":"Retry Pending"}
                      </button>
                    )}
                    {isDone&&<span style={{padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,
                      background:b.failed===0?C.greenPale:C.amberPale,color:b.failed===0?C.green:C.amber,
                      border:`1px solid ${b.failed===0?C.green:C.amber}33`}}>
                      {b.failed===0?"Complete":"Partial"}
                    </span>}
                  </div>
                  <div style={{marginTop:10,height:6,background:C.offWhite,borderRadius:3,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${pct}%`,background:b.failed>0?C.amber:C.green,borderRadius:3,transition:"width .4s"}}/>
                  </div>
                  {b.failedRecipients.length>0&&(
                    <div style={{marginTop:8,fontSize:11,color:C.red}}>
                      Failed: {b.failedRecipients.slice(0,5).map(r=>r.email).join(", ")}
                      {b.failedRecipients.length>5&&` +${b.failedRecipients.length-5} more`}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      )}

      <Card style={{marginBottom:14,padding:"12px 16px"}}>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
          <input value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}}
            placeholder="Search category or body…"
            style={{flex:2,minWidth:180,padding:"8px 12px",border:`2px solid ${C.border}`,borderRadius:8,fontSize:13,outline:"none"}}/>
          <select value={filterStatus} onChange={e=>{setFilterStatus(e.target.value);setPage(0);}}
            style={{padding:"8px 12px",border:`2px solid ${C.border}`,borderRadius:8,fontSize:13,color:C.text,background:"var(--jd-card)",outline:"none"}}>
            <option value="">All Statuses</option>
            <option value="sent">Sent</option>
            <option value="failed">Failed</option>
            <option value="partial">Partial</option>
          </select>
          <select value={filterAge} onChange={e=>{setFilterAge(e.target.value);setPage(0);}}
            style={{padding:"8px 12px",border:`2px solid ${C.border}`,borderRadius:8,fontSize:13,color:C.text,background:"var(--jd-card)",outline:"none"}}>
            <option value="">All Time</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="365">Last year</option>
          </select>
          {(search||filterStatus||filterAge)&&(
            <Btn sm outline color={C.muted} onClick={()=>{setSearch("");setFilterStatus("");setFilterAge("");setPage(0);}}>Clear</Btn>
          )}
          <span style={{fontSize:12,color:C.muted,marginLeft:"auto"}}>{filtered.length.toLocaleString()} result{filtered.length!==1?"s":""}</span>
        </div>
      </Card>

      {selIds.size>0&&(
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",marginBottom:10,
          background:C.redPale,border:`1.5px solid ${C.red}44`,borderRadius:10,flexWrap:"wrap"}}>
          <span style={{fontWeight:700,color:C.red,fontSize:13,flex:1}}>
            {selIds.size} log{selIds.size!==1?"s":""} selected
          </span>
          <Btn sm onClick={deleteSelected} color={C.red}>Delete Selected</Btn>
          <Btn sm outline color={C.muted} onClick={clearSel}>Clear</Btn>
        </div>
      )}

      {loading?<Spinner/>:loadError?(
        <Card style={{textAlign:"center",padding:52}}>
          <div style={{fontWeight:800,color:C.red,fontSize:16}}>Could not load email logs</div>
          <div style={{color:C.muted,fontSize:13,marginTop:6}}>{loadError}</div>
          <div style={{marginTop:12}}><Btn onClick={load}>Try again</Btn></div>
        </Card>
      ):filtered.length===0?(
        <Card style={{textAlign:"center",padding:52}}>
          <div style={{fontSize:40,marginBottom:10}}>{logs.length===0?"\u2014":"?"}</div>
          <div style={{fontWeight:800,color:C.blue,fontSize:16}}>{logs.length===0?"No Emails Sent Yet":"No Results"}</div>
          <div style={{color:C.muted,fontSize:13,marginTop:6}}>{logs.length===0?"Emails sent through the portal will appear here.":"Try adjusting your filters."}</div>
        </Card>
      ):(
        <>
          <Card style={{padding:0,overflow:"hidden"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
              <thead>
                <tr style={{background:C.blue}}>
                  <th style={{padding:"9px 12px",width:36}}>
                    <input type="checkbox" checked={allPageSelected}
                      ref={el=>{if(el)el.indeterminate=somePageSelected;}}
                      onChange={togglePage}
                      style={{width:15,height:15,cursor:"pointer",accentColor:"var(--jd-card)"}}/>
                  </th>
                  {["Category","Recipients","Sent","Status",""].map((h,i)=>(
                    <th key={i} style={{padding:"9px 12px",color:"var(--jd-card)",textAlign:"left",fontWeight:700,fontSize:11,whiteSpace:"nowrap"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map((log,i)=>{
                  const sc=SC[log.status]||C.muted;
                  const sb=SB[log.status]||C.offWhite;
                  const isOpen=expanded===log.id;
                  const checked=selIds.has(log.id);
                  return(
                    <React.Fragment key={log.id}>
                      <tr style={{background:i%2===0?C.white:C.offWhite,borderBottom:`1px solid ${C.border}`,cursor:"pointer"}}
                        onClick={()=>setExpanded(isOpen?null:log.id)}>
                        <td style={{padding:"9px 12px"}} onClick={e=>e.stopPropagation()}>
                          <input type="checkbox" checked={checked} onChange={()=>toggleSel(log.id)}
                            style={{width:15,height:15,cursor:"pointer",accentColor:C.blue}}/>
                        </td>
                        <td style={{padding:"9px 12px",maxWidth:320,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                          {(()=>{let meta={};try{meta=JSON.parse(log.metadata||"{}")}catch(e){}return meta.batch_id?(
                            <span style={{fontSize:10,fontWeight:700,background:C.bluePale,color:C.blue,
                              border:`1px solid ${C.blue}33`,borderRadius:4,padding:"1px 6px",marginRight:6}}>BATCH</span>
                          ):null})()}
                          <span style={{fontWeight:700}}>{log.subject||"(no category)"}</span>
                        </td>
                        <td style={{padding:"9px 12px",color:C.muted,whiteSpace:"nowrap"}}>
                          <span style={{color:C.text,fontWeight:600}}>{log.recipient_count||1}</span>
                          {(log.delivered_count>0||log.failed_count>0)&&(
                            <span style={{fontSize:10,marginLeft:6}}>
                              <span style={{color:C.green}}>\u2713{log.delivered_count||0}</span>
                              {log.failed_count>0&&<span style={{color:C.red,marginLeft:3}}>\u2717{log.failed_count}</span>}
                            </span>
                          )}
                        </td>
                        <td style={{padding:"9px 12px",color:C.muted,whiteSpace:"nowrap",fontSize:12}}>
                          {new Date(log.sent_at).toLocaleString("en-NG",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:true})}
                        </td>
                        <td style={{padding:"9px 12px"}}>
                          <span style={{padding:"2px 10px",borderRadius:20,fontSize:11,fontWeight:700,
                            background:sb,color:sc,border:`1px solid ${sc}33`,whiteSpace:"nowrap"}}>
                            {log.status==="sent"?"Sent":log.status==="failed"?"Failed":"Partial"}
                          </span>
                        </td>
                        <td style={{padding:"9px 8px",textAlign:"right"}} onClick={e=>e.stopPropagation()}>
                          <button onClick={e=>deleteOne(log.id,e)}
                            title="Delete this log"
                            style={{background:"none",border:"none",cursor:"pointer",color:C.red,fontSize:16,padding:"2px 6px",borderRadius:6,lineHeight:1}}
                            onMouseEnter={e=>e.currentTarget.style.background=C.redPale}
                            onMouseLeave={e=>e.currentTarget.style.background="none"}>
                            <Trash2 size={14}/>
                          </button>
                        </td>
                      </tr>
                      {isOpen&&(
                        <tr style={{background:C.bluePale}}>
                          <td colSpan={6} style={{padding:"12px 16px 16px",borderBottom:`2px solid ${C.blue}22`}}>
                            <div style={{fontSize:11,fontWeight:700,color:C.muted,marginBottom:6,textTransform:"uppercase",letterSpacing:.5}}>Message Body</div>
                            <div style={{fontSize:12,color:C.text,whiteSpace:"pre-wrap",background:C.white,
                              border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px",maxHeight:200,overflowY:"auto",lineHeight:1.7}}>
                              {log.body||"(no body stored)"}
                            </div>
                            {(log.delivered_count>0||log.failed_count>0)&&(
                              <div style={{display:"flex",gap:12,marginTop:8,fontSize:12}}>
                                <span style={{color:C.green,fontWeight:700}}>\u2713 {log.delivered_count||0} delivered</span>
                                {log.failed_count>0&&<span style={{color:C.red,fontWeight:700}}>\u2717 {log.failed_count} failed</span>}
                              </div>
                            )}
                            {log.failed_count>0&&Array.isArray(log.failed_recipients)&&log.failed_recipients.length>0&&(
                              <div style={{marginTop:8,padding:"8px 12px",background:C.redPale,borderRadius:8,fontSize:12,color:C.red}}>
                                <div style={{fontWeight:700,marginBottom:4}}>Failed recipients:</div>
                                {log.failed_recipients.map((r,i)=>(
                                  <div key={i} style={{marginBottom:2}}>\u2022 {typeof r==="object"?r.email||JSON.stringify(r):r}{typeof r==="object"&&r.error?` \u2014 ${r.error}`:""}</div>
                                ))}
                              </div>
                            )}
                            {log.error_message&&(
                              <div style={{marginTop:8,padding:"8px 12px",background:C.redPale,borderRadius:8,fontSize:12,color:C.red}}>
                                <b>Error:</b> {log.error_message}
                              </div>
                            )}
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
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginTop:14,flexWrap:"wrap"}}>
              <button onClick={()=>setPage(0)} disabled={page===0}
                style={{padding:"6px 10px",borderRadius:7,border:`1px solid ${C.border}`,background:page===0?C.offWhite:"var(--jd-card)",color:page===0?C.light:C.text,cursor:page===0?"default":"pointer",fontWeight:700}}>\u00ab</button>
              <button onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={page===0}
                style={{padding:"6px 14px",borderRadius:7,border:`1px solid ${C.border}`,background:page===0?C.offWhite:"var(--jd-card)",color:page===0?C.light:C.text,cursor:page===0?"default":"pointer",fontWeight:600}}>‹ Prev</button>
              <span style={{fontSize:12,color:C.muted,padding:"0 6px"}}>Page {page+1} of {totalPages}</span>
              <button onClick={()=>setPage(p=>Math.min(totalPages-1,p+1))} disabled={page===totalPages-1}
                style={{padding:"6px 14px",borderRadius:7,border:`1px solid ${C.border}`,background:page===totalPages-1?C.offWhite:"var(--jd-card)",color:page===totalPages-1?C.light:C.text,cursor:page===totalPages-1?"default":"pointer",fontWeight:600}}>Next ›</button>
              <button onClick={()=>setPage(totalPages-1)} disabled={page===totalPages-1}
                style={{padding:"6px 10px",borderRadius:7,border:`1px solid ${C.border}`,background:page===totalPages-1?C.offWhite:"var(--jd-card)",color:page===totalPages-1?C.light:C.text,cursor:page===totalPages-1?"default":"pointer",fontWeight:700}}>\u00bb</button>
            </div>
          )}
        </>
      )}

      {purgeModal&&(
        <Modal title="Purge Old Logs" onClose={()=>setPurgeModal(false)} width={400}>
          <div style={{marginBottom:14,fontSize:13,color:C.text,lineHeight:1.7}}>
            Permanently delete email log entries older than a chosen period. This cannot be undone.
          </div>
          <div style={{marginBottom:16}}>
            <label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:6,textTransform:"uppercase",letterSpacing:.5}}>Delete logs older than</label>
            {[{v:"30",l:"30 days"},{v:"60",l:"60 days"},{v:"90",l:"90 days (recommended)"},{v:"180",l:"6 months"},{v:"365",l:"1 year"}].map(o=>(
              <label key={o.v} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",border:`2px solid ${purgeAge===o.v?C.red:C.border}`,
                borderRadius:8,cursor:"pointer",marginBottom:6,background:purgeAge===o.v?C.redPale:"var(--jd-card)"}}>
                <input type="radio" checked={purgeAge===o.v} onChange={()=>setPurgeAge(o.v)} style={{accentColor:C.red}}/>
                <span style={{fontSize:13,color:C.text}}>{o.l}</span>
                <span style={{fontSize:11,color:C.muted,marginLeft:"auto"}}>
                  {logs.filter(l=>new Date(l.sent_at)<new Date(Date.now()-+o.v*86400000)).length} entries
                </span>
              </label>
            ))}
          </div>
          <div style={{background:C.redPale,border:`1px solid ${C.red}33`,borderRadius:8,padding:"9px 12px",marginBottom:14,fontSize:12,color:C.red}}>
            This will permanently delete {logs.filter(l=>new Date(l.sent_at)<new Date(Date.now()-+purgeAge*86400000)).length} log entries. This cannot be undone.
          </div>
          <div style={{display:"flex",gap:10}}>
            <Btn onClick={purge} color={C.red} disabled={purging} style={{flex:1}}>
              {purging?"Purging\u2026":"Purge Now"}
            </Btn>
            <Btn onClick={()=>setPurgeModal(false)} color={C.muted} outline style={{flex:1}}>Cancel</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}
