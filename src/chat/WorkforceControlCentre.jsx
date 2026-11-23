import React,{useCallback,useEffect,useState} from "react";
import {supabase} from "../supabaseClient.js";
import {Activity,Users,UserRound,RefreshCw,Pause,Play,Archive,Clock3,ShieldAlert,MessageCircle,Send,X} from "lucide-react";
import "./workforce-control-centre.css";
const stateLabel={active:"Active",paused:"Paused",retired:"Retired",report_returned:"Report returned",failed:"Failed"};
const stamp=v=>v?new Date(v).toLocaleString():"—";
export function WorkforceControlCentre({onClose}){
 const [snapshot,setSnapshot]=useState(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(""),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [activeChat,setActiveChat]=useState(null),[chatMessages,setChatMessages]=useState([]),[chatDraft,setChatDraft]=useState(""),[chatBusy,setChatBusy]=useState(false),[chatRequestId,setChatRequestId]=useState("");
 const call=useCallback(async(body)=>{const {data,error}=await supabase.functions.invoke("jd-automation",{body});if(error||data?.error)throw new Error(data?.error||error?.message||"Workforce request was not confirmed.");return data;},[]);
 const refresh=useCallback(async()=>{setLoading(true);setError("");try{setSnapshot(await call({action:"workforce.control.snapshot"}));}catch(e){setError(e.message);setSnapshot(null);}finally{setLoading(false);}},[call]);
 useEffect(()=>{void refresh();},[refresh]);
 const openPrivateChat=async employee=>{
  setChatBusy(true);setError("");setChatRequestId("");
  try{
   const opened=await call({action:"workforce.agent.thread.open",employeeId:employee.id});
   const history=await call({action:"workforce.agent.thread.history",employeeId:employee.id,threadId:opened.thread.id});
   setActiveChat({employee,thread:opened.thread});setChatMessages(history.messages||[]);setChatDraft("");
  }catch(e){setError(e.message);}finally{setChatBusy(false);}
 };
 const sendPrivateMessage=async()=>{
  if(!activeChat||!chatDraft.trim()||chatBusy)return;
  const content=chatDraft.trim(),requestId=chatRequestId||crypto.randomUUID();
  setChatRequestId(requestId);setChatBusy(true);setError("");
  try{
   const result=await call({action:"workforce.agent.message.send",employeeId:activeChat.employee.id,threadId:activeChat.thread.id,requestId,content});
   setChatMessages(current=>{const ids=new Set(current.map(m=>m.id));return [...current,...(result.messages||[]).filter(m=>!ids.has(m.id))];});
   setChatDraft("");setChatRequestId("");
  }catch(e){setError(e.message);}finally{setChatBusy(false);}
 };
 const configureBudget=async(employee)=>{
  const current=budgets.find(b=>b.employee_id===employee.id);
  const budget=window.prompt("Employee budget in USD (shadow limit only):",String((current?.budget_micros||0)/1000000));
  if(budget===null)return;const amount=Number(budget);
  const rate=window.prompt("Hourly rate in USD (shadow estimate only):",String((current?.rate_micros_per_hour??1000000)/1000000));
  if(rate===null)return;const hourly=Number(rate);
  if(!Number.isFinite(amount)||amount<0||amount>1000000000000||!Number.isFinite(hourly)||hourly<0||hourly>1000000000){setError("Enter valid non-negative budget and rate values.");return;}
  setBusy(employee.id);try{const receipt=await call({action:"workforce.employee.budget",employeeId:employee.id,expectedVersion:current?.version??0,budgetMicros:Math.round(amount*1000000),rateMicrosPerHour:Math.round(hourly*1000000),requestId:crypto.randomUUID()});setNotice("Shadow budget saved. This is a limit and estimate only; no charge or invoice was created.");await refresh();}catch(e){setError(e.message);}finally{setBusy("");}
 };
 const removeMembership=async(team,teamName)=>{
  const active=members.filter(m=>m.team_id===team);
  if(!active.length){setError("This team has no active members.");return;}
  const names=active.map(m=>employees.find(e=>e.id===m.employee_id)?.display_name||m.employee_id);
  const picked=window.prompt("Enter the exact employee name to remove from "+teamName+":\\n"+names.join("\\n"));
  const member=active.find(m=>(employees.find(e=>e.id===m.employee_id)?.display_name||m.employee_id)===picked);
  if(!member){if(picked)setError("No active team member matched that exact name.");return;}
  setBusy(team);try{await call({action:"workforce.team.membership",teamId:team,employeeId:member.employee_id,operation:"remove",requestId:crypto.randomUUID()});setNotice((picked||"Employee")+" removed from "+teamName+".");await refresh();}catch(e){setError(e.message);}finally{setBusy("");}
 };
 const changeMembership=async(team,teamName)=>{
  if(!employees.length){setError("Activate an employee before adding team members.");return;}
  const choices=employees.filter(e=>e.lifecycle_state==="active");
  const picked=window.prompt("Enter the exact employee name to add:\\n"+choices.map(e=>e.display_name).join("\\n"));
  const employee=choices.find(e=>e.display_name===picked);if(!employee){if(picked)setError("No active employee matched that exact name.");return;}
  setBusy(team);try{await call({action:"workforce.team.membership",teamId:team,employeeId:employee.id,operation:"add",memberRole:"member",requestId:crypto.randomUUID()});setNotice(employee.display_name+" added to "+teamName+".");await refresh();}catch(e){setError(e.message);}finally{setBusy("");}
 };
 const control=async(kind,id,operation,name)=>{if(!window.confirm(operation==="retire"?`Retire ${name}? Historical assignments will remain available.`:`${operation==="pause"?"Pause":"Resume"} ${name}?`))return;setBusy(id);setError("");setNotice("");try{const r=await call({action:"workforce.control",targetKind:kind,targetId:id,operation,requestId:crypto.randomUUID()});setNotice(`${name}: ${stateLabel[r.receipt.state]||r.receipt.state}. This changes workforce availability only; it does not stop or resume an in-flight assignment.`);await refresh();}catch(e){setError(e.message);}finally{setBusy("");}};
 const employees=snapshot?.employees||[],teams=snapshot?.teams||[],members=snapshot?.members||[],assignments=snapshot?.assignments||[],budgets=snapshot?.budgets||[],employeeUsage=snapshot?.employeeUsage||[];
 const active=employees.filter(x=>x.lifecycle_state==="active").length;
 return <main className="jd-workforce-centre">
  <header className="jd-wfc-head"><div><div className="jd-wfc-eyebrow"><Users size={14}/> JAMES-DENNING / WORKFORCE</div><h1>Workforce <em>control centre</em></h1><p>Inspect your workforce, team structure, assignment history and usage status.</p></div><div className="jd-wfc-actions"><button onClick={refresh} disabled={loading}><RefreshCw size={15}/> Refresh</button>{onClose&&<button onClick={onClose}>Back to chat</button>}</div></header>
  {error&&<div className="jd-wfc-alert" role="alert">{error}</div>}{notice&&<div className="jd-wfc-notice" role="status">{notice}</div>}
  <section className="jd-wfc-stats"><article><span>Employee instances</span><strong>{loading?"—":employees.length}</strong></article><article><span>Available</span><strong>{loading?"—":active}</strong></article><article><span>Teams</span><strong>{loading?"—":teams.length}</strong></article><article><span>Recorded assignments</span><strong>{loading?"—":assignments.length}</strong></article></section>
  <section className="jd-wfc-boundary"><ShieldAlert size={17}/><div><strong>Control boundary</strong><p>Employee and team identities appear here only after an owner or administrator activates an approved proposal in Review Centre. Pausing or retiring an employee does not cancel a running assignment. Tool access, connector permissions, assignment execution, private agent conversations and payable billing remain separate controls; usage is not presented as an amount due.</p></div></section>
  <section className="jd-wfc-section"><div className="jd-wfc-section-title"><div><UserRound size={17}/><h2>Employees</h2></div><span>{employees.length} records</span></div>
   {loading?<p className="jd-wfc-empty">Loading workforce records…</p>:employees.length===0?<p className="jd-wfc-empty">No employee instances have been activated in this workspace. Specialist definitions are not automatically counted as hired employees.</p>:<div className="jd-wfc-grid">{employees.map(a=><article className="jd-wfc-card" key={a.id}><div className="jd-wfc-card-top"><span className={"jd-wfc-state "+a.lifecycle_state}>{stateLabel[a.lifecycle_state]}</span><small>{a.agent_kind==="builtin"?"Built-in specialist":"Published registry agent"}{a.agent_version? ` · v${a.agent_version}`:""}</small></div><h3>{a.display_name}</h3><p>{a.role_title||a.agent_ref?.replaceAll("_"," ")||"Specialist"} · {a.department||"No department assigned"}</p>{a.purpose&&<p>{a.purpose}</p>}{Array.isArray(a.responsibilities)&&a.responsibilities.length>0&&<div className="jd-wfc-meta"><strong>Responsibilities:</strong> {a.responsibilities.join(" · ")}</div>}{Array.isArray(a.requested_access)&&a.requested_access.length>0&&<div className="jd-wfc-meta"><strong>Access requested (not granted):</strong> {a.requested_access.join(" · ")}</div>}<div className="jd-wfc-meta">{(()=>{const b=budgets.find(x=>x.employee_id===a.id);return b?`Budget ${(b.budget_micros/1000000).toFixed(2)} · Rate ${(b.rate_micros_per_hour/1000000).toFixed(2)}/hr · Shadow only`:"No employee budget configured";})()}</div><div className="jd-wfc-meta">Added {stamp(a.created_at)}</div><div className="jd-wfc-card-actions">{snapshot?.agentChatEnabled&&a.lifecycle_state==="active"&&<button disabled={!!busy||chatBusy} onClick={()=>openPrivateChat(a)}><MessageCircle size={13}/> Private chat</button>}<button disabled={!!busy} onClick={()=>configureBudget(a)}>Set budget</button>{a.lifecycle_state==="active"?<button disabled={!!busy} onClick={()=>control("employee",a.id,"pause",a.display_name)}><Pause size={13}/> Pause</button>:a.lifecycle_state==="paused"?<button disabled={!!busy} onClick={()=>control("employee",a.id,"resume",a.display_name)}><Play size={13}/> Resume</button>:null}{a.lifecycle_state!=="retired"&&<button className="danger" disabled={!!busy} onClick={()=>control("employee",a.id,"retire",a.display_name)}><Archive size={13}/> End employee</button>}</div></article>)}</div>}
  </section>
  {activeChat&&<section className="jd-wfc-chat">
   <header><div><span>PRIVATE SPECIALIST CONVERSATION</span><h2>{activeChat.employee.display_name}</h2><p>{activeChat.employee.role_title||activeChat.employee.agent_ref.replaceAll("_"," ")} · Separate from assignments</p></div><button type="button" onClick={()=>{setActiveChat(null);setChatMessages([]);setChatDraft("");setChatRequestId("");}} aria-label="Close private chat"><X size={16}/></button></header>
   <div className="jd-wfc-chat-messages">{chatMessages.length===0?<p className="jd-wfc-empty">Start a private reasoning conversation. This employee has no tools and cannot execute actions from this chat.</p>:chatMessages.map(message=><article className={message.sender_kind==="agent"?"agent":"user"} key={message.id}><small>{message.sender_kind==="agent"?activeChat.employee.display_name:"You"} · {stamp(message.created_at)}</small><p>{message.content}</p></article>)}</div>
   <form onSubmit={event=>{event.preventDefault();void sendPrivateMessage();}}><textarea value={chatDraft} onChange={event=>{setChatDraft(event.target.value);setChatRequestId("");}} maxLength={8000} placeholder={"Message "+activeChat.employee.display_name+"…"} rows={3}/><button type="submit" disabled={chatBusy||!chatDraft.trim()}>{chatBusy?"Replying…":<><Send size={14}/> Send</>}</button></form>
   <p className="jd-wfc-chat-note">Reasoning only · No tools · No connector access · No assignment changes · No billing</p>
  </section>}
  <section className="jd-wfc-section"><div className="jd-wfc-section-title"><div><Users size={17}/><h2>Teams</h2></div><span>{teams.length} records</span></div>
   {loading?<p className="jd-wfc-empty">Loading teams…</p>:teams.length===0?<p className="jd-wfc-empty">No teams have been created yet.</p>:<div className="jd-wfc-grid">{teams.map(t=>{const count=members.filter(m=>m.team_id===t.id).length;return <article className="jd-wfc-card" key={t.id}><div className="jd-wfc-card-top"><span className={"jd-wfc-state "+t.lifecycle_state}>{stateLabel[t.lifecycle_state]}</span><small>{count} active members</small></div><h3>{t.name}</h3><p>{t.department||"No department assigned"} · {t.purpose}</p>{t.coordinator_specialist_ref&&<div className="jd-wfc-meta">Coordinator: {t.coordinator_specialist_name||t.coordinator_specialist_ref.replaceAll("_"," ")}</div>}{Array.isArray(t.responsibilities)&&t.responsibilities.length>0&&<div className="jd-wfc-meta"><strong>Responsibilities:</strong> {t.responsibilities.join(" · ")}</div>}{Array.isArray(t.requested_access)&&t.requested_access.length>0&&<div className="jd-wfc-meta"><strong>Access requested (not granted):</strong> {t.requested_access.join(" · ")}</div>}<div className="jd-wfc-card-actions"><button disabled={!!busy||t.lifecycle_state!=="active"} onClick={()=>changeMembership(t.id,t.name)}>Add member</button><button disabled={!!busy||!members.some(m=>m.team_id===t.id)} onClick={()=>removeMembership(t.id,t.name)}>Remove member</button>{t.lifecycle_state==="active"?<button disabled={!!busy} onClick={()=>control("team",t.id,"pause",t.name)}><Pause size={13}/> Pause team</button>:t.lifecycle_state==="paused"?<button disabled={!!busy} onClick={()=>control("team",t.id,"resume",t.name)}><Play size={13}/> Resume team</button>:null}{t.lifecycle_state!=="retired"&&<button className="danger" disabled={!!busy} onClick={()=>control("team",t.id,"retire",t.name)}><Archive size={13}/> End team</button>}</div></article>})}</div>}
  </section>
  <section className="jd-wfc-section"><div className="jd-wfc-section-title"><div><Activity size={17}/><h2>Assignment history</h2></div><span>Latest {assignments.length}</span></div>
   {loading?<p className="jd-wfc-empty">Loading assignment records…</p>:assignments.length===0?<p className="jd-wfc-empty">No persisted specialist assignment records were returned.</p>:<div className="jd-wfc-table">{assignments.map(a=><article key={a.id}><div><strong>{a.agent_name}</strong><p>{a.task}</p><small>{stamp(a.created_at)} · {a.agent_kind}{a.agent_version?` v${a.agent_version}`:""}</small><small>{a.employee_id?"Employee: "+(employees.find(e=>e.id===a.employee_id)?.display_name||"Identity unavailable"):"Temporary specialist"}{a.team_id?" · Team: "+(teams.find(t=>t.id===a.team_id)?.name||"Team unavailable"):""}</small></div><span className="jd-wfc-state">{stateLabel[a.status]||a.status} · {a.verification_status?.replaceAll("_"," ")}</span></article>)}</div>}
  </section>
  <section className="jd-wfc-section"><div className="jd-wfc-section-title"><div><Clock3 size={17}/><h2>Usage & billing</h2></div></div><p className="jd-wfc-empty">Employee budgets and hourly rates are saved as shadow limits only. The assignment worker is not yet emitting employee-attributed usage receipts, so accrued time and payable amounts remain unavailable. Existing shadow estimates are not invoices and are not charges. {employeeUsage.length} employee usage evidence rows are currently recorded; only reconciled rows can ever be considered for billing.</p></section>
  <footer className="jd-wfc-foot">Snapshot {stamp(snapshot?.snapshotAt)} · Tenant-scoped records · {snapshot?.billingMode==="shadow_only"?"Shadow billing only":"Billing state unavailable"}</footer>
 </main>;
}
