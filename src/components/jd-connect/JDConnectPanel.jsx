import React,{useCallback,useEffect,useState} from "react";
import {supabase} from "../../supabaseClient.js";
import {Activity,CheckCircle2,ChevronDown,ChevronRight,Clock,Link2,Loader2,Plus,RefreshCw,ShieldCheck,Unplug,XCircle} from "lucide-react";

const card={background:"var(--jd-card,#fff)",border:"1px solid var(--jd-border,#e5e7eb)",borderRadius:12,padding:16,marginBottom:12};
const field={width:"100%",padding:"10px 12px",border:"1px solid var(--jd-border,#d1d5db)",borderRadius:8,fontSize:13,background:"var(--jd-input,#fff)",color:"var(--jd-text,#111827)"};
const button={border:0,borderRadius:8,padding:"9px 12px",fontSize:12,fontWeight:700,cursor:"pointer"};
export function JDConnectPanel({notify=()=>{}}){
 const [servers,setServers]=useState([]),[tools,setTools]=useState([]),[approvals,setApprovals]=useState([]),[executions,setExecutions]=useState([]);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(""),[error,setError]=useState(""),[success,setSuccess]=useState("");
 const [name,setName]=useState(""),[endpoint,setEndpoint]=useState(""),[token,setToken]=useState("");
 const [showRegister,setShowRegister]=useState(false),[expanded,setExpanded]=useState(""),[toolArgs,setToolArgs]=useState({}),[argErrors,setArgErrors]=useState({}),[reconnectTokens,setReconnectTokens]=useState({});
 const call=useCallback(async(action,extra={})=>{
  const {data,error}=await supabase.functions.invoke("jd-connect",{body:{action,...extra}});
  if(error)throw new Error(error.message||"JD Connect request failed");
  if(data?.error)throw new Error(data.error);
  return data||{};
 },[]);
 const load=useCallback(async()=>{
  setLoading(true);setError("");
  try{const [s,t,a,e]=await Promise.all([call("servers.list"),call("tools.list"),call("approvals.list"),call("executions.list")]);setServers(s.servers||[]);setTools(t.tools||[]);setApprovals(a.approvals||[]);setExecutions(e.executions||[]);}
  catch(e){setError(e.message||"Could not load JD Connect");}
  finally{setLoading(false);}
 },[call]);
 useEffect(()=>{load();},[load]);
 const run=async(key,fn)=>{
  setBusy(key);setError("");setSuccess("");
  try{const result=await fn();if(result?.requiresApproval)setSuccess("Approval requested. Nothing has been executed yet.");else if(result?.executionId)setSuccess("Tool executed and result recorded.");await load();return result;}
  catch(e){setError(e.message||"Operation failed");return null;}
  finally{setBusy("");}
 };
 const register=()=>run("register",async()=>{
  const r=await call("servers.register",{name,endpoint,bearerToken:token});
  setName("");setEndpoint("");setToken("");setShowRegister(false);setSuccess(r.notice||"Connector registered");return r;
 });
 const refresh=id=>run("refresh:"+id,()=>call("tools.refresh",{serverId:id}));
 const disconnect=id=>run("disconnect:"+id,()=>call("servers.disconnect",{serverId:id}));
 const reconnect=id=>run("reconnect:"+id,()=>call("servers.reconnect",{serverId:id,bearerToken:reconnectTokens[id]||""}));
 const invoke=id=>run("tool:"+id,async()=>{
  let args={};try{args=JSON.parse(toolArgs[id]||"{}");if(!args||typeof args!=="object"||Array.isArray(args))throw new Error("Arguments must be a JSON object");}
  catch(e){setArgErrors(p=>({...p,[id]:e.message||"Invalid JSON"}));throw new Error(e.message||"Invalid JSON");}
  setArgErrors(p=>({...p,[id]:""}));return call("tools.call",{toolId:id,arguments:args});
 });
 const decide=(id,decision)=>run("approval:"+id,()=>call("approvals.resolve",{approvalId:id,decision}));
 const trustTool=(id,enabled)=>run("trust:"+id,()=>call("tools.set_read_only",{toolId:id,enabled}));
 const statusColor=s=>s==="succeeded"||s==="connected"||s==="executed"?"#15803d":s==="failed"||s==="error"||s==="denied"?"#b91c1c":"#b45309";
 if(loading)return <div style={{padding:28,textAlign:"center",color:"var(--jd-muted,#6b7280)"}}><Loader2 className="animate-spin" size={20}/> Loading JD Connect…</div>;
 return <div style={{color:"var(--jd-text,#111827)"}}>
  <div style={{...card,background:"linear-gradient(135deg,#101820,#243747)",color:"#fff",border:0}}>
   <div style={{display:"flex",alignItems:"center",gap:10}}><Link2 size={22}/><div style={{fontSize:17,fontWeight:900}}>JD Connect</div><span style={{marginLeft:"auto",fontSize:10,opacity:.75}}>MCP GATEWAY</span></div>
   <p style={{fontSize:12,lineHeight:1.7,opacity:.82,margin:"9px 0 0"}}>Connect remote MCP servers and grant JD read-only, read/write or full-control access separately for each service. Write access is enabled only after an authorized manager grants it.</p>
  </div>
  {error&&<div role="alert" style={{...card,borderColor:"#fecaca",background:"#fef2f2",color:"#991b1b",fontSize:12}}>{error}</div>}
  {success&&<div role="status" style={{...card,borderColor:"#bbf7d0",background:"#f0fdf4",color:"#166534",fontSize:12}}>{success}</div>}
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",margin:"18px 0 10px",gap:8}}>
   <div><div style={{fontWeight:900,fontSize:14}}>Connected servers</div><div style={{fontSize:11,color:"var(--jd-muted,#6b7280)"}}>{servers.length} server(s) registered</div></div>
   <div style={{display:"flex",gap:6}}>
    <button onClick={load} style={{...button,background:"var(--jd-soft,#f3f4f6)",color:"inherit"}}><RefreshCw size={13}/></button>
    <button onClick={()=>setShowRegister(v=>!v)} style={{...button,background:"#111827",color:"#fff",display:"flex",alignItems:"center",gap:6}}><Plus size={14}/> Add server</button>
   </div>
  </div>
  {showRegister&&<div style={card}>
   <div style={{fontWeight:800,fontSize:13,marginBottom:12}}>Register remote MCP server</div>
   <label style={{display:"block",fontSize:11,fontWeight:700,marginBottom:5}}>Display name</label><input style={field} value={name} onChange={e=>setName(e.target.value)} placeholder="Team knowledge server"/>
   <label style={{display:"block",fontSize:11,fontWeight:700,margin:"12px 0 5px"}}>HTTPS MCP endpoint</label><input style={field} value={endpoint} onChange={e=>setEndpoint(e.target.value)} placeholder="https://mcp.example.com/mcp" autoCapitalize="none"/>
   <label style={{display:"block",fontSize:11,fontWeight:700,margin:"12px 0 5px"}}>Bearer token <span style={{fontWeight:400,color:"var(--jd-muted,#6b7280)"}}>(optional)</span></label><input type="password" autoComplete="new-password" style={field} value={token} onChange={e=>setToken(e.target.value)} placeholder="Stored encrypted; never shown again"/>
   <p style={{fontSize:11,lineHeight:1.6,color:"var(--jd-muted,#6b7280)"}}>The server hostname must be explicitly allowlisted by the JD operator. Use only trusted servers. Credentials are encrypted at rest.</p>
   <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><button onClick={()=>setShowRegister(false)} style={{...button,background:"var(--jd-soft,#f3f4f6)",color:"inherit"}}>Cancel</button><button disabled={!!busy||!name.trim()||!endpoint.trim()} onClick={register} style={{...button,background:"#111827",color:"#fff",opacity:busy?0.6:1}}>{busy==="register"?"Connecting…":"Connect and discover tools"}</button></div>
  </div>}
  {!servers.length&&!showRegister&&<div style={{...card,textAlign:"center",padding:28}}><Link2 size={25} style={{opacity:.5}}/><div style={{fontWeight:800,marginTop:8}}>No MCP servers connected</div><p style={{fontSize:12,color:"var(--jd-muted,#6b7280)"}}>Add an allowlisted remote MCP server to discover its available tools.</p></div>}
  {servers.map(server=>{
   const list=tools.filter(t=>t.server_id===server.id);
   return <div key={server.id} style={card}>
    <div style={{display:"flex",alignItems:"center",gap:9}}>
     <div style={{width:34,height:34,borderRadius:9,background:"var(--jd-soft,#f3f4f6)",display:"grid",placeItems:"center"}}><Link2 size={17}/></div>
     <div style={{flex:1,minWidth:0}}><div style={{fontWeight:800,fontSize:13}}>{server.name}</div><div style={{fontSize:10,color:"var(--jd-muted,#6b7280)",overflowWrap:"anywhere"}}>{server.host}</div></div>
     <span style={{fontSize:10,fontWeight:800,color:statusColor(server.status)}}>{server.status.toUpperCase()}</span>
    </div>
    <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginTop:12,padding:"10px 0",borderTop:"1px solid var(--jd-border,#e5e7eb)"}}>
     <div style={{fontSize:11,fontWeight:800}}>JD access</div>
     <select aria-label={`JD access for ${server.name}`} value={server.grant?.access_level||"read_only"} disabled={!!busy} onChange={e=>run("grant:"+server.id,()=>call("grants.set",{serverId:server.id,accessLevel:e.target.value}))} style={{...field,width:"auto",minWidth:170,padding:"8px"}}>
      <option value="read_only">Read only</option><option value="read_write">Read and write</option><option value="full_control">Full control</option>
     </select>
     {server.grant?.access_level&&server.grant.access_level!=="read_only"&&<button onClick={()=>run("revoke-grant:"+server.id,()=>call("grants.revoke",{serverId:server.id}))} disabled={!!busy} style={{...button,background:"#fef2f2",color:"#991b1b"}}>Revoke elevated access</button>}
     <span style={{fontSize:10,color:"var(--jd-muted,#6b7280)"}}>{server.grant?.expires_at?("Expires "+new Date(server.grant.expires_at).toLocaleString()):"No expiry set"}</span>
    </div>
    <div style={{display:"flex",gap:7,marginTop:12,flexWrap:"wrap"}}>
     <button onClick={()=>setExpanded(expanded===server.id?"":server.id)} style={{...button,background:"var(--jd-soft,#f3f4f6)",color:"inherit"}}>{list.length} tools {expanded===server.id?"Hide":"View"}</button>
     {server.status==="connected"&&<><button onClick={()=>refresh(server.id)} disabled={!!busy} style={{...button,background:"var(--jd-soft,#f3f4f6)",color:"inherit"}}>{busy==="refresh:"+server.id?"Refreshing…":"Refresh tools"}</button>
     <button onClick={()=>disconnect(server.id)} disabled={!!busy} style={{...button,background:"#fef2f2",color:"#991b1b"}}>{busy==="disconnect:"+server.id?"Disconnecting…":"Disconnect"}</button></>}
     {server.status!=="connected"&&<div style={{display:"flex",gap:6,flexBasis:"100%"}}><input type="password" autoComplete="new-password" style={{...field,flex:1}} value={reconnectTokens[server.id]||""} onChange={e=>setReconnectTokens(p=>({...p,[server.id]:e.target.value}))} placeholder="New bearer token (optional for public servers)"/><button onClick={()=>reconnect(server.id)} disabled={!!busy} style={{...button,background:"#166534",color:"#fff"}}>{busy==="reconnect:"+server.id?"Connecting…":"Reconnect"}</button></div>}
    </div>
    {expanded===server.id&&<div style={{marginTop:12,borderTop:"1px solid var(--jd-border,#e5e7eb)",paddingTop:10}}>
     {!list.length?<div style={{fontSize:11,color:"var(--jd-muted,#6b7280)"}}>No tools discovered.</div>:list.map(tool=><div key={tool.id} style={{padding:"10px 0",borderBottom:"1px solid var(--jd-border,#e5e7eb)"}}>
      <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}><strong style={{fontSize:12}}>{tool.name}</strong><span style={{fontSize:9,fontWeight:800,color:tool.read_only?"#15803d":"#b45309"}}>{tool.read_only?"AUTO READ-ONLY":tool.annotations?.readOnlyHint===true?"READ-ONLY CANDIDATE · APPROVAL":"APPROVAL REQUIRED"}</span></div>
      {tool.description&&<div style={{fontSize:11,color:"var(--jd-muted,#6b7280)",margin:"4px 0 8px"}}>{tool.description}</div>}
      <textarea aria-label={`Arguments for ${tool.name}`} value={toolArgs[tool.id]??"{}"} onChange={e=>setToolArgs(p=>({...p,[tool.id]:e.target.value}))} spellCheck={false} style={{...field,minHeight:68,marginBottom:6,fontFamily:"monospace",fontSize:11}}/>
      {argErrors[tool.id]&&<div role="alert" style={{fontSize:10,color:"#b91c1c",marginBottom:5}}>{argErrors[tool.id]}</div>}
      {tool.annotations?.readOnlyHint===true&&<button onClick={()=>trustTool(tool.id,!tool.read_only)} disabled={!!busy} style={{...button,background:tool.read_only?"#fef2f2":"#ecfdf5",color:tool.read_only?"#991b1b":"#166534",marginRight:6}}>{tool.read_only?"Require approval":"Trust read-only"}</button>}
      <button onClick={()=>invoke(tool.id)} disabled={!!busy} style={{...button,background:"#111827",color:"#fff"}}>{busy==="tool:"+tool.id?"Running…":tool.read_only?"Run trusted read-only tool":"Request approval"}</button>
     </div>)}
    </div>}
   </div>;
  })}
  <div style={{display:"flex",gap:8,alignItems:"center",margin:"22px 0 10px"}}><ShieldCheck size={17}/><div style={{fontWeight:900,fontSize:14}}>Approval queue</div><span style={{fontSize:10,color:"var(--jd-muted,#6b7280)"}}>{approvals.length} pending</span></div>
  {!approvals.length?<div style={{...card,fontSize:12,color:"var(--jd-muted,#6b7280)"}}>No actions awaiting approval.</div>:approvals.map(a=><div key={a.id} style={card}><div style={{fontWeight:800,fontSize:12}}>{a.tool_name}</div><div style={{fontSize:10,color:"var(--jd-muted,#6b7280)",margin:"4px 0 8px"}}>Requested by {a.requested_by} · Expires {new Date(a.expires_at).toLocaleString()}</div><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere",fontSize:10,background:"var(--jd-soft,#f3f4f6)",padding:9,borderRadius:7,maxHeight:180,overflow:"auto"}}>{JSON.stringify(a.arguments||{},null,2)}</pre><div style={{display:"flex",gap:8}}><button onClick={()=>decide(a.id,"approve")} disabled={!!busy} style={{...button,background:"#166534",color:"#fff"}}>Approve and execute</button><button onClick={()=>decide(a.id,"deny")} disabled={!!busy} style={{...button,background:"#fef2f2",color:"#991b1b"}}>Decline</button></div></div>)}
  <div style={{display:"flex",gap:8,alignItems:"center",margin:"22px 0 10px"}}><Activity size={17}/><div style={{fontWeight:900,fontSize:14}}>Recent executions</div></div>
  <div style={card}>{executions.length===0?<div style={{fontSize:12,color:"var(--jd-muted,#6b7280)"}}>No connector executions yet.</div>:executions.slice(0,20).map(e=><div key={e.id} style={{display:"flex",gap:8,alignItems:"center",padding:"9px 0",borderBottom:"1px solid var(--jd-border,#e5e7eb)"}}><span style={{color:statusColor(e.status)}}>{e.status==="succeeded"?<CheckCircle2 size={15}/>:e.status==="failed"?<XCircle size={15}/>:<Clock size={15}/>}</span><div style={{flex:1,minWidth:0}}><div style={{fontWeight:700,fontSize:11}}>{e.tool_name}</div><div style={{fontSize:10,color:"var(--jd-muted,#6b7280)"}}>{new Date(e.created_at).toLocaleString()} · {e.duration_ms??"—"} ms</div></div><span style={{fontSize:9,fontWeight:800,color:statusColor(e.status)}}>{e.status}</span></div>)}</div>
  <div style={{fontSize:10,color:"var(--jd-muted,#6b7280)",lineHeight:1.6,marginTop:12}}>MCP tool discovery and read/write execution are supported over remote HTTPS Streamable HTTP. Permissions are granted per provider; read-only is the default. Read/write enables ordinary write tools, while destructive and open-world tools still require approval. Full control enables all discovered tools to execute under the provider grant. Revoking elevated access immediately returns the provider to read-only. Approval-required calls are stored as encrypted arguments and executed only after an authorized manager approves.</div>
 </div>;
}
