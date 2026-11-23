import React,{useCallback,useEffect,useState} from "react";
import {supabase} from "../supabaseClient.js";
import {Activity,Users,UserRound,RefreshCw,Pause,Play,Archive,Clock3,ShieldAlert} from "lucide-react";
import "./workforce-control-centre.css";
const stateLabel={active:"Active",paused:"Paused",retired:"Retired",report_returned:"Report returned",failed:"Failed"};
const stamp=v=>v?new Date(v).toLocaleString():"—";
export function WorkforceControlCentre({onClose}){
 const [snapshot,setSnapshot]=useState(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(""),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const call=useCallback(async(body)=>{const {data,error}=await supabase.functions.invoke("jd-automation",{body});if(error||data?.error)throw new Error(data?.error||error?.message||"Workforce request was not confirmed.");return data;},[]);
 const refresh=useCallback(async()=>{setLoading(true);setError("");try{setSnapshot(await call({action:"workforce.control.snapshot"}));}catch(e){setError(e.message);setSnapshot(null);}finally{setLoading(false);}},[call]);
 useEffect(()=>{void refresh();},[refresh]);
 const createEmployee=async()=>{
  const roles=["business_advisor","research_analyst","finance_analyst","operations_planner","product_designer","software_engineer","security_reviewer","quality_assurance"];
  const ref=window.prompt("Choose a built-in specialist:\\n"+roles.join("\\n"));
  if(!ref)return;if(!roles.includes(ref)){setError("Choose one of the listed built-in specialists.");return;}
  const name=window.prompt("Employee display name:",ref.replaceAll("_"," "));
  if(!name||name.trim().length<2)return;
  const department=window.prompt("Department (optional):","")||null;setBusy("provision");
  try{const result=await call({action:"workforce.employee.create",kind:"builtin",ref,name,department,requestId:crypto.randomUUID()});setNotice("Employee identity activated. No assignment has been started.");await refresh();}catch(e){setError(e.message);}finally{setBusy("");}
 };
 const createTeam=async()=>{
  const name=window.prompt("Team name:");if(!name||name.trim().length<2)return;
  const purpose=window.prompt("What is this team responsible for?");if(!purpose||purpose.trim().length<10)return;
  setBusy("provision");try{await call({action:"workforce.team.create",name,purpose,requestId:crypto.randomUUID()});setNotice("Team created.");await refresh();}catch(e){setError(e.message);}finally{setBusy("");}
 };
 const changeMembership=async(team,teamName)=>{
  if(!employees.length){setError("Activate an employee before adding team members.");return;}
  const choices=employees.filter(e=>e.lifecycle_state==="active");
  const picked=window.prompt("Enter the exact employee name to add:\\n"+choices.map(e=>e.display_name).join("\\n"));
  const employee=choices.find(e=>e.display_name===picked);if(!employee){if(picked)setError("No active employee matched that exact name.");return;}
  setBusy(team);try{await call({action:"workforce.team.membership",teamId:team,employeeId:employee.id,operation:"add",memberRole:"member",requestId:crypto.randomUUID()});setNotice(employee.display_name+" added to "+teamName+".");await refresh();}catch(e){setError(e.message);}finally{setBusy("");}
 };
 const control=async(kind,id,operation,name)=>{if(!window.confirm(operation==="retire"?`Retire ${name}? Historical assignments will remain available.`:`${operation==="pause"?"Pause":"Resume"} ${name}?`))return;setBusy(id);setError("");setNotice("");try{const r=await call({action:"workforce.control",targetKind:kind,targetId:id,operation,requestId:crypto.randomUUID()});setNotice(`${name}: ${stateLabel[r.receipt.state]||r.receipt.state}. This changes workforce availability only; it does not stop or resume an in-flight assignment.`);await refresh();}catch(e){setError(e.message);}finally{setBusy("");}};
 const employees=snapshot?.employees||[],teams=snapshot?.teams||[],members=snapshot?.members||[],assignments=snapshot?.assignments||[];
 const active=employees.filter(x=>x.lifecycle_state==="active").length;
 return <main className="jd-workforce-centre">
  <header className="jd-wfc-head"><div><div className="jd-wfc-eyebrow"><Users size={14}/> JAMES-DENNING / WORKFORCE</div><h1>Workforce <em>control centre</em></h1><p>Inspect your workforce, team structure, assignment history and usage status.</p></div><div className="jd-wfc-actions"><button onClick={()=>void createEmployee()} disabled={!!busy}>Add employee</button><button onClick={()=>void createTeam()} disabled={!!busy}>Create team</button><button onClick={refresh} disabled={loading}><RefreshCw size={15}/> Refresh</button>{onClose&&<button onClick={onClose}>Back to chat</button>}</div></header>
  {error&&<div className="jd-wfc-alert" role="alert">{error}</div>}{notice&&<div className="jd-wfc-notice" role="status">{notice}</div>}
  <section className="jd-wfc-stats"><article><span>Employee instances</span><strong>{loading?"—":employees.length}</strong></article><article><span>Available</span><strong>{loading?"—":active}</strong></article><article><span>Teams</span><strong>{loading?"—":teams.length}</strong></article><article><span>Recorded assignments</span><strong>{loading?"—":assignments.length}</strong></article></section>
  <section className="jd-wfc-boundary"><ShieldAlert size={17}/><div><strong>Control boundary</strong><p>Employee and team availability controls are connected to persisted records. Pausing or retiring an employee does not cancel a running assignment. Worker-level pause/cancel acknowledgements, private agent conversations and reconciled payable billing are not yet enabled. Usage is not currently presented as an amount due.</p></div></section>
  <section className="jd-wfc-section"><div className="jd-wfc-section-title"><div><UserRound size={17}/><h2>Employees</h2></div><span>{employees.length} records</span></div>
   {loading?<p className="jd-wfc-empty">Loading workforce records…</p>:employees.length===0?<p className="jd-wfc-empty">No employee instances have been activated in this workspace. Specialist definitions are not automatically counted as hired employees.</p>:<div className="jd-wfc-grid">{employees.map(a=><article className="jd-wfc-card" key={a.id}><div className="jd-wfc-card-top"><span className={"jd-wfc-state "+a.lifecycle_state}>{stateLabel[a.lifecycle_state]}</span><small>{a.agent_kind==="builtin"?"Built-in specialist":"Published registry agent"}{a.agent_version? ` · v${a.agent_version}`:""}</small></div><h3>{a.display_name}</h3><p>{a.department||"No department assigned"}</p><div className="jd-wfc-meta">Added {stamp(a.created_at)}</div><div className="jd-wfc-card-actions">{a.lifecycle_state==="active"?<button disabled={!!busy} onClick={()=>control("employee",a.id,"pause",a.display_name)}><Pause size={13}/> Pause</button>:a.lifecycle_state==="paused"?<button disabled={!!busy} onClick={()=>control("employee",a.id,"resume",a.display_name)}><Play size={13}/> Resume</button>:null}{a.lifecycle_state!=="retired"&&<button className="danger" disabled={!!busy} onClick={()=>control("employee",a.id,"retire",a.display_name)}><Archive size={13}/> End employee</button>}</div></article>)}</div>}
  </section>
  <section className="jd-wfc-section"><div className="jd-wfc-section-title"><div><Users size={17}/><h2>Teams</h2></div><span>{teams.length} records</span></div>
   {loading?<p className="jd-wfc-empty">Loading teams…</p>:teams.length===0?<p className="jd-wfc-empty">No teams have been created yet.</p>:<div className="jd-wfc-grid">{teams.map(t=>{const count=members.filter(m=>m.team_id===t.id).length;return <article className="jd-wfc-card" key={t.id}><div className="jd-wfc-card-top"><span className={"jd-wfc-state "+t.lifecycle_state}>{stateLabel[t.lifecycle_state]}</span><small>{count} active members</small></div><h3>{t.name}</h3><p>{t.purpose}</p><div className="jd-wfc-card-actions"><button disabled={!!busy||t.lifecycle_state!=="active"} onClick={()=>changeMembership(t.id,t.name)}>Add member</button>{t.lifecycle_state==="active"?<button disabled={!!busy} onClick={()=>control("team",t.id,"pause",t.name)}><Pause size={13}/> Pause team</button>:t.lifecycle_state==="paused"?<button disabled={!!busy} onClick={()=>control("team",t.id,"resume",t.name)}><Play size={13}/> Resume team</button>:null}{t.lifecycle_state!=="retired"&&<button className="danger" disabled={!!busy} onClick={()=>control("team",t.id,"retire",t.name)}><Archive size={13}/> End team</button>}</div></article>})}</div>}
  </section>
  <section className="jd-wfc-section"><div className="jd-wfc-section-title"><div><Activity size={17}/><h2>Assignment history</h2></div><span>Latest {assignments.length}</span></div>
   {loading?<p className="jd-wfc-empty">Loading assignment records…</p>:assignments.length===0?<p className="jd-wfc-empty">No persisted specialist assignment records were returned.</p>:<div className="jd-wfc-table">{assignments.map(a=><article key={a.id}><div><strong>{a.agent_name}</strong><p>{a.task}</p><small>{stamp(a.created_at)} · {a.agent_kind}{a.agent_version?` v${a.agent_version}`:""}</small></div><span className="jd-wfc-state">{stateLabel[a.status]||a.status} · {a.verification_status?.replaceAll("_"," ")}</span></article>)}</div>}
  </section>
  <section className="jd-wfc-section"><div className="jd-wfc-section-title"><div><Clock3 size={17}/><h2>Usage & billing</h2></div></div><p className="jd-wfc-empty">Employee-level usage attribution and team budgets are not yet reconciled to verified employee identities. Existing shadow estimates are not payable and are intentionally not shown as charges here.</p></section>
  <footer className="jd-wfc-foot">Snapshot {stamp(snapshot?.snapshotAt)} · Tenant-scoped records · {snapshot?.billingMode==="shadow_only"?"Shadow billing only":"Billing state unavailable"}</footer>
 </main>;
}
