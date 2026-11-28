import React,{useCallback,useEffect,useState} from "react";
import {supabase} from "../supabaseClient.js";
import {Activity,Users,UserRound,RefreshCw,Pause,Play,Archive,Clock3,ShieldAlert,MessageCircle,Send,X,Sparkles,Wallet} from "lucide-react";
import "./workforce-control-centre.css";
const stateLabel={active:"Active",paused:"Paused",retired:"Retired",queued:"Queued",claimed:"Claimed",running:"Running",report_returned:"Report returned",failed:"Failed",cancellation_requested:"Cancellation requested",cancelled:"Cancelled"};
const stamp=v=>v?new Date(v).toLocaleString():"—";
// Guided first-hire presets: each drafts a real reviewed proposal through JD's
// approved pipeline (chat request → proposal for review → owner approval →
// activation). No preset creates an employee directly.
const HIRE_PRESETS=[
 {id:"dispatch",title:"Dispatch Coordinator",department:"Operations & Fleet Management",purpose:"Plan and monitor daily dispatch, routing and driver assignment so every delivery has an owner and a status.",responsibilities:["Build and maintain the daily dispatch plan","Assign drivers and vehicles to routes","Track delivery status and escalate slips","Report daily fleet utilisation"],access:["Read-only dispatch and routing records","Read-only task and schedule data"],message:"Draft a workforce proposal for my review: hire a \"Dispatch Coordinator\" in the \"Operations & Fleet Management\" department. Purpose: plan and monitor daily dispatch, routing and driver assignment. Responsibilities: build the daily dispatch plan, assign drivers and vehicles to routes, track delivery status and escalate slips, report daily fleet utilisation. Requested access: read-only dispatch, routing, task and schedule records. Submit it to the Review Centre for my approval — do not activate anything without approval."},
 {id:"billing",title:"Billing & Collections Officer",department:"Finance & Administration",purpose:"Keep invoicing current: draft customer invoices, chase outstanding balances and reconcile payments against the ledger.",responsibilities:["Draft customer invoices for completed work","Track outstanding balances and send reminders","Reconcile payments against records","Flag billing anomalies for review"],access:["Read-only customer and billing records","Draft invoice documents for review"],message:"Draft a workforce proposal for my review: hire a \"Billing & Collections Officer\" in the \"Finance & Administration\" department. Purpose: keep invoicing current and reconcile payments. Responsibilities: draft customer invoices, track outstanding balances and send reminders, reconcile payments, flag billing anomalies. Requested access: read-only customer and billing records; draft invoice documents for review only. Submit it to the Review Centre for my approval — no money movement, no charges without my explicit confirmation."},
 {id:"solutions",title:"AI Solutions Architect",department:"AI Solutions Engineering",purpose:"Turn client requirements into concrete agent designs: scoped specialist teams, tool needs and delivery checkpoints.",responsibilities:["Analyse client requirements into agent designs","Propose specialist teams and tool needs","Define evaluation criteria and checkpoints","Document delivery risks"],access:["Read-only workspace capability data","Draft design documents for review"],message:"Draft a workforce proposal for my review: hire an \"AI Solutions Architect\" in the \"AI Solutions Engineering\" department. Purpose: turn client requirements into concrete agent designs. Responsibilities: analyse requirements into agent designs, propose specialist teams and tool needs, define evaluation criteria and checkpoints, document delivery risks. Requested access: read-only workspace capability data; draft design documents for review only. Submit it to the Review Centre for my approval — design work only, no execution."},
];
const usd=micros=>(Number(micros||0)/1000000).toFixed(2);
function Modal({title,onClose,children}){
 return <div className="jd-wfc-modal-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>
  <div className="jd-wfc-modal" role="dialog" aria-modal="true" aria-label={title}>
   <header><h3>{title}</h3><button type="button" onClick={onClose} aria-label="Close dialog"><X size={15}/></button></header>
   {children}
  </div>
 </div>;
}
export function WorkforceControlCentre({onClose,onHireRequest}){
 const [snapshot,setSnapshot]=useState(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(""),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [activeChat,setActiveChat]=useState(null),[chatMessages,setChatMessages]=useState([]),[chatDraft,setChatDraft]=useState(""),[chatBusy,setChatBusy]=useState(false),[chatRequestId,setChatRequestId]=useState("");
 const [modal,setModal]=useState(null);
 const [specialistCatalogue,setSpecialistCatalogue]=useState([]),[catalogueLoading,setCatalogueLoading]=useState(true),[catalogueError,setCatalogueError]=useState("");
 const call=useCallback(async(body)=>{const {data,error}=await supabase.functions.invoke("jd-automation",{body});if(error||data?.error)throw new Error(data?.error||error?.message||"Workforce request was not confirmed.");return data;},[]);
 const refresh=useCallback(async()=>{setLoading(true);setError("");try{setSnapshot(await call({action:"workforce.control.snapshot"}));}catch(e){setError(e.message);setSnapshot(null);}finally{setLoading(false);}},[call]);
 useEffect(()=>{void refresh();},[refresh]);
 const loadSpecialists=useCallback(async()=>{
  setCatalogueLoading(true);setCatalogueError("");
  try{
   const result=await call({action:"workforce.specialist.catalogue"});
   if(result?.read_only!==true||result?.hiring_enabled!==false||result?.billing_enabled!==false||!Array.isArray(result.specialists))throw new Error("Specialist catalogue eligibility could not be verified.");
   setSpecialistCatalogue(result.specialists);
  }catch(error){setSpecialistCatalogue([]);setCatalogueError(error.message||"Specialist catalogue unavailable.");}
  finally{setCatalogueLoading(false);}
 },[call]);
 useEffect(()=>{void loadSpecialists();},[loadSpecialists]);

 const cancelAssignment=async item=>{
  if(!window.confirm("Request cancellation? A running worker must acknowledge before JD reports it stopped."))return;
  setBusy(item.id);setError("");setNotice("");
  try{const result=await call({action:"workforce.assignment.cancel",assignmentId:item.id});setNotice(result.receipt?.status==="cancelled"?"Cancelled before a worker claimed it.":"Cancellation requested; waiting for worker acknowledgement.");await refresh();}
  catch(e){setError(e.message);}finally{setBusy("");}
 };
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
 const submitBudget=async()=>{
  if(!modal)return;
  const amount=Number(modal.budget),hourly=Number(modal.rate);
  if(!Number.isFinite(amount)||amount<0||amount>1000000000000||!Number.isFinite(hourly)||hourly<0||hourly>1000000000){setError("Enter valid non-negative budget and rate values.");return;}
  setBusy(modal.target.id);setError("");setNotice("");
  try{
   if(modal.kind==="employee-budget"){
    await call({action:"workforce.employee.budget",employeeId:modal.target.id,expectedVersion:modal.current?.version??0,budgetMicros:Math.round(amount*1000000),rateMicrosPerHour:Math.round(hourly*1000000),requestId:crypto.randomUUID()});
    setNotice("Shadow budget saved. This is a limit and estimate only; no charge or invoice was created.");
   }else{
    await call({action:"workforce.team.budget",teamId:modal.target.id,expectedVersion:modal.current?.version??0,budgetMicros:Math.round(amount*1000000),requestId:crypto.randomUUID()});
    setNotice("Team shadow budget saved. Member usage will be aggregated against this ceiling; no charge or invoice was created.");
   }
   setModal(null);await refresh();
  }catch(e){setError(e.message);}finally{setBusy("");}
 };
 const submitMembership=async()=>{
  if(!modal||!modal.employeeId){setError("Choose an employee first.");return;}
  setBusy("membership");setError("");setNotice("");
  try{
   await call({action:"workforce.team.membership",teamId:modal.target.id,employeeId:modal.employeeId,operation:modal.operation,memberRole:"member",requestId:crypto.randomUUID()});
   setNotice((modal.operation==="add"?"Added to ":"Removed from ")+modal.target.name+".");setModal(null);await refresh();
  }catch(e){setError(e.message);}finally{setBusy("");}
 };
 const removeMembership=(team,teamName)=>{
  const active=members.filter(m=>m.team_id===team);
  if(!active.length){setError("This team has no active members.");return;}
  setModal({kind:"remove-member",target:team,targetName:teamName,employeeId:"",operation:"remove"});
 };
 const changeMembership=(team,teamName)=>{
  if(!employees.length){setError("Activate an employee before adding team members.");return;}
  setModal({kind:"add-member",target:team,targetName:teamName,employeeId:"",operation:"add"});
 };
 const configureBudget=(employee)=>{
  const current=budgets.find(b=>b.employee_id===employee.id);
  setModal({kind:"employee-budget",target:employee,targetName:employee.display_name,current,budget:String((current?.budget_micros||0)/1000000),rate:String((current?.rate_micros_per_hour??1000000)/1000000)});
 };
 const configureTeamBudget=team=>{
  const current=teamBudgets.find(b=>b.team_id===team.id);
  setModal({kind:"team-budget",target:team,targetName:team.name,current,budget:String((current?.budget_micros||0)/1000000),rate:null});
 };
 const control=async(kind,id,operation,name)=>{if(!window.confirm(operation==="retire"?`Retire ${name}? Historical assignments will remain available.`:`${operation==="pause"?"Pause":"Resume"} ${name}?`))return;setBusy(id);setError("");setNotice("");try{const r=await call({action:"workforce.control",targetKind:kind,targetId:id,operation,requestId:crypto.randomUUID()});setNotice(`${name}: ${stateLabel[r.receipt.state]||r.receipt.state}. This changes workforce availability only; it does not stop or resume an in-flight assignment.`);await refresh();}catch(e){setError(e.message);}finally{setBusy("");}};
 const employees=snapshot?.employees||[],teams=snapshot?.teams||[],members=snapshot?.members||[],assignments=snapshot?.assignments||[],lifecycle=snapshot?.assignmentLifecycle||[],budgets=snapshot?.budgets||[],employeeUsage=snapshot?.employeeUsage||[],teamBudgets=snapshot?.teamBudgets||[];
 const active=employees.filter(x=>x.lifecycle_state==="active").length;
 const hire=preset=>{setModal(null);if(onHireRequest)onHireRequest(preset.message,preset.title);};
 return <main className="jd-workforce-centre">
  <header className="jd-wfc-head"><div><div className="jd-wfc-eyebrow"><Users size={14}/> JAMES-DENNING / WORKFORCE</div><h1>Workforce <em>control centre</em></h1><p>Inspect your workforce, team structure, assignment history and usage status.</p></div><div className="jd-wfc-actions"><button onClick={refresh} disabled={loading}><RefreshCw size={15}/> Refresh</button>{onClose&&<button onClick={onClose}>Back to chat</button>}</div></header>
  {error&&<div className="jd-wfc-alert" role="alert">{error}</div>}{notice&&<div className="jd-wfc-notice" role="status">{notice}</div>}
  <section className="jd-wfc-stats"><article><span>Employee instances</span><strong>{loading?"—":employees.length}</strong></article><article><span>Available</span><strong>{loading?"—":active}</strong></article><article><span>Teams</span><strong>{loading?"—":teams.length}</strong></article><article><span>Recorded assignments</span><strong>{loading?"—":assignments.length}</strong></article></section>
  <details className="jd-wfc-boundary"><summary><ShieldAlert size={13}/><span className="jd-wfc-badge">Activation only — employees appear here after an approved proposal is activated in Review Centre.</span></summary><p>Pausing or retiring an employee does not cancel a running assignment. Tool access, connector permissions, assignment execution, private agent conversations and payable billing remain separate controls; usage is not presented as an amount due.</p></details>
  <section className="jd-wfc-hire" aria-label="Specialist catalogue">
   <div className="jd-wfc-hire-head"><Sparkles size={16}/><div><h2>Specialist catalogue</h2><p>Choose from built-in specialists and published, execution-authorized registry agents. Selecting a specialist drafts a proposal for owner review; it does not hire, grant access or start billable work.</p></div><button type="button" onClick={loadSpecialists} disabled={catalogueLoading}><RefreshCw size={14}/> Refresh catalogue</button></div>
   {catalogueError&&<div className="jd-wfc-alert" role="alert">{catalogueError}</div>}
   {catalogueLoading?<p className="jd-wfc-empty">Verifying available specialists…</p>:specialistCatalogue.length===0?<p className="jd-wfc-empty">No eligible specialists could be verified. Draft registry agents are not hireable; publish and authorize a version first.</p>:<div className="jd-wfc-hire-grid">{specialistCatalogue.map(item=><article key={item.specialist_kind+":"+item.specialist_ref+":"+(item.specialist_version||"builtin")}>
    <div className="jd-wfc-card-top"><span className="jd-wfc-state active">{item.specialist_kind==="builtin"?"Built-in":"Published registry"}</span><small>{item.specialist_version? "Version "+item.specialist_version:"Built-in definition"}</small></div>
    <h3>{item.name}</h3>
    <span>{item.specialist_ref}</span>
    {item.responsibility&&<p>{item.responsibility}</p>}
    {Array.isArray(item.capabilities)&&item.capabilities.length>0&&<div className="jd-wfc-meta"><strong>Capabilities:</strong> {item.capabilities.join(" · ")}</div>}
    {Array.isArray(item.deliverables)&&item.deliverables.length>0&&<div className="jd-wfc-meta"><strong>Deliverables:</strong> {item.deliverables.join(" · ")}</div>}
    {Array.isArray(item.limitations)&&item.limitations.length>0&&<div className="jd-wfc-meta"><strong>Limitations:</strong> {item.limitations.join(" · ")}</div>}
    <div className="jd-wfc-meta"><strong>Pricing:</strong> Not configured — no price will be invented or charged</div>
    <div className="jd-wfc-meta"><strong>Permissions:</strong> Must be specified in the proposal; nothing is granted by selection</div>
    <button type="button" onClick={()=>{const version=item.specialist_version?"; exact specialist_version "+item.specialist_version:"";const prompt="Prepare an individual workforce employee proposal using exactly specialist_kind "+item.specialist_kind+" and specialist_ref "+item.specialist_ref+version+". Use the selected published specialist version only; do not substitute another agent. Propose a sensible name, department, purpose and concrete responsibilities based on the definition. List requested permissions separately and default to least privilege. Include pricing only if an authoritative configured price exists; otherwise state not configured. Submit the proposal to Review Centre for explicit owner approval. Do not activate, grant tools, authorize connectors, start assignments or enable billing.";hire({message:prompt,title:item.name});}}><Sparkles size={13}/> Propose this specialist</button>
   </article>)}</div>}
  </section>
  <section className="jd-wfc-section"><div className="jd-wfc-section-title"><div><UserRound size={17}/><h2>Employees</h2></div><span>{employees.length} records</span></div>
   {loading?<p className="jd-wfc-empty">Loading workforce records…</p>:employees.length===0?<p className="jd-wfc-empty">No employee instances have been activated in this workspace yet. Use the guided hire flow above — specialist definitions are not automatically counted as hired employees.</p>:<div className="jd-wfc-grid">{employees.map(a=><article className="jd-wfc-card" key={a.id}><div className="jd-wfc-card-top"><span className={"jd-wfc-state "+a.lifecycle_state}>{stateLabel[a.lifecycle_state]}</span><small>{a.agent_kind==="builtin"?"Built-in specialist":"Published registry agent"}{a.agent_version? ` · v${a.agent_version}`:""}</small></div><h3>{a.display_name}</h3><p>{a.role_title||a.agent_ref?.replaceAll("_"," ")||"Specialist"} · {a.department||"No department assigned"}</p>{a.purpose&&<p>{a.purpose}</p>}{(()=>{const latest=assignments.find(item=>item.employee_id===a.id);return latest?<div className="jd-wfc-meta"><strong>Latest assignment:</strong> {latest.task} · {stateLabel[latest.status]||latest.status}</div>:<div className="jd-wfc-meta">No assignments recorded for this employee yet.</div>;})()}{Array.isArray(a.responsibilities)&&a.responsibilities.length>0&&<div className="jd-wfc-meta"><strong>Responsibilities:</strong> {a.responsibilities.join(" · ")}</div>}{Array.isArray(a.requested_access)&&a.requested_access.length>0&&<div className="jd-wfc-meta"><strong>Access requested (not granted):</strong> {a.requested_access.join(" · ")}</div>}<div className="jd-wfc-meta">{(()=>{const b=budgets.find(x=>x.employee_id===a.id);return b?`Budget ${usd(b.budget_micros)} · Rate ${usd(b.rate_micros_per_hour)}/hr · Shadow only`:"No employee budget configured";})()}</div><div className="jd-wfc-meta">Added {stamp(a.created_at)}</div><div className="jd-wfc-card-actions">{snapshot?.agentChatEnabled&&a.lifecycle_state==="active"&&<button disabled={!!busy||chatBusy} onClick={()=>openPrivateChat(a)}><MessageCircle size={13}/> Private chat</button>}<button disabled={!!busy} onClick={()=>configureBudget(a)}><Wallet size={13}/> Set budget</button>{a.lifecycle_state==="active"?<button disabled={!!busy} onClick={()=>control("employee",a.id,"pause",a.display_name)}><Pause size={13}/> Pause</button>:a.lifecycle_state==="paused"?<button disabled={!!busy} onClick={()=>control("employee",a.id,"resume",a.display_name)}><Play size={13}/> Resume</button>:null}{a.lifecycle_state!=="retired"&&<button className="danger" disabled={!!busy} onClick={()=>control("employee",a.id,"retire",a.display_name)}><Archive size={13}/> End employee</button>}</div></article>)}</div>}
  </section>
  {activeChat&&<section className="jd-wfc-chat">
   <header><div><span>PRIVATE SPECIALIST CONVERSATION</span><h2>{activeChat.employee.display_name}</h2><p>{activeChat.employee.role_title||activeChat.employee.agent_ref.replaceAll("_"," ")} · Separate from assignments</p></div><button type="button" onClick={()=>{setActiveChat(null);setChatMessages([]);setChatDraft("");setChatRequestId("");}} aria-label="Close private chat"><X size={16}/></button></header>
   <div className="jd-wfc-chat-messages">{chatMessages.length===0?<p className="jd-wfc-empty">Start a private reasoning conversation. This employee has no tools and cannot execute actions from this chat.</p>:chatMessages.map(message=><article className={message.sender_kind==="agent"?"agent":"user"} key={message.id}><small>{message.sender_kind==="agent"?activeChat.employee.display_name:"You"} · {stamp(message.created_at)}</small><p>{message.content}</p></article>)}</div>
   <form onSubmit={event=>{event.preventDefault();void sendPrivateMessage();}}><textarea value={chatDraft} onChange={event=>{setChatDraft(event.target.value);setChatRequestId("");}} maxLength={8000} placeholder={"Message "+activeChat.employee.display_name+"…"} rows={3}/><button type="submit" disabled={chatBusy||!chatDraft.trim()}>{chatBusy?"Replying…":<><Send size={14}/> Send</>}</button></form>
   <p className="jd-wfc-chat-note">Reasoning only · No tools · No connector access · No assignment changes · No billing</p>
  </section>}
  <section className="jd-wfc-section"><div className="jd-wfc-section-title"><div><Users size={17}/><h2>Teams</h2></div><span>{teams.length} records</span></div>
   {loading?<p className="jd-wfc-empty">Loading teams…</p>:teams.length===0?<p className="jd-wfc-empty">No teams have been created yet.</p>:<div className="jd-wfc-grid">{teams.map(t=>{const count=members.filter(m=>m.team_id===t.id).length;return <article className="jd-wfc-card" key={t.id}><div className="jd-wfc-card-top"><span className={"jd-wfc-state "+t.lifecycle_state}>{stateLabel[t.lifecycle_state]}</span><small>{count} active members</small></div><h3>{t.name}</h3><p>{t.department||"No department assigned"} · {t.purpose}</p>{t.coordinator_specialist_ref&&<div className="jd-wfc-meta">Coordinator: {t.coordinator_specialist_name||t.coordinator_specialist_ref.replaceAll("_"," ")}</div>}{Array.isArray(t.responsibilities)&&t.responsibilities.length>0&&<div className="jd-wfc-meta"><strong>Responsibilities:</strong> {t.responsibilities.join(" · ")}</div>}{Array.isArray(t.requested_access)&&t.requested_access.length>0&&<div className="jd-wfc-meta"><strong>Access requested (not granted):</strong> {t.requested_access.join(" · ")}</div>}<div className="jd-wfc-meta">{(()=>{const b=teamBudgets.find(x=>x.team_id===t.id);return b?"Team ceiling "+usd(b.budget_micros)+" · accrued "+usd(b.accrued_micros)+" · shadow only":"No team budget configured";})()}</div><div className="jd-wfc-card-actions"><button disabled={!!busy} onClick={()=>configureTeamBudget(t)}>Set team budget</button><button disabled={!!busy||t.lifecycle_state!=="active"} onClick={()=>changeMembership(t.id,t.name)}>Add member</button><button disabled={!!busy||!members.some(m=>m.team_id===t.id)} onClick={()=>removeMembership(t.id,t.name)}>Remove member</button>{t.lifecycle_state==="active"?<button disabled={!!busy} onClick={()=>control("team",t.id,"pause",t.name)}><Pause size={13}/> Pause team</button>:t.lifecycle_state==="paused"?<button disabled={!!busy} onClick={()=>control("team",t.id,"resume",t.name)}><Play size={13}/> Resume team</button>:null}{t.lifecycle_state!=="retired"&&<button className="danger" disabled={!!busy} onClick={()=>control("team",t.id,"retire",t.name)}><Archive size={13}/> End team</button>}</div></article>})}</div>}
  </section>
  <section className="jd-wfc-section"><div className="jd-wfc-section-title"><div><Activity size={17}/><h2>Assignment history</h2></div><span>{lifecycle.length} lifecycle · {assignments.length} reports</span></div>
   {loading?<p className="jd-wfc-empty">Loading assignment records…</p>:lifecycle.length===0&&assignments.length===0?<p className="jd-wfc-empty">No persisted specialist assignment records were returned.</p>:<div className="jd-wfc-table">
    {lifecycle.map(a=><article key={a.id}><div><strong>{employees.find(e=>e.id===a.employee_id)?.display_name||a.agent_ref}</strong><p>{a.agent_ref.replaceAll("_"," ")} · {stateLabel[a.status]||a.status}</p><small>{stamp(a.created_at)} · attempt {a.attempt_count} · {a.outcome_certainty==="unknown"?"Outcome uncertain":a.outcome_certainty==="known"?"Outcome recorded":"Not started"}</small><small>{a.team_id?"Team: "+(teams.find(t=>t.id===a.team_id)?.name||"Team unavailable"):"Individual assignment"}{a.worker_acknowledged_at?" · Worker acknowledged":""}{a.cancel_acknowledged_at?" · Stop acknowledged":a.status==="cancellation_requested"?" · Waiting for worker acknowledgement":""}</small></div><div className="jd-wfc-row-actions"><span className="jd-wfc-state">{stateLabel[a.status]||a.status}</span>{["queued","claimed","running"].includes(a.status)&&<button className="danger" disabled={!!busy} onClick={()=>cancelAssignment(a)}>Cancel</button>}</div></article>)}
    {assignments.map(a=><article key={"report-"+a.id}><div><strong>{a.agent_name}</strong><p>{a.task}</p><small>{stamp(a.created_at)} · {a.agent_kind}{a.agent_version?` v${a.agent_version}`:""}</small><small>{a.employee_id?"Employee: "+(employees.find(e=>e.id===a.employee_id)?.display_name||"Identity unavailable"):"Temporary specialist"}{a.team_id?" · Team: "+(teams.find(t=>t.id===a.team_id)?.name||"Team unavailable"):""}</small></div><span className="jd-wfc-state">{stateLabel[a.status]||a.status} · {a.verification_status?.replaceAll("_"," ")}</span></article>)}
   </div>}
  </section>
  <section className="jd-wfc-section"><div className="jd-wfc-section-title"><div><Clock3 size={17}/><h2>Shadow usage ledger</h2></div><span>{employeeUsage.length} observations</span></div><p className="jd-wfc-empty">These records estimate observed employee assignment time using the hourly rate saved when the usage event was recorded. They are not invoices, payroll, payable balances or charges. Disputed and unreconciled rows remain estimates only.</p>{employeeUsage.length===0?<p className="jd-wfc-empty">No employee-attributed usage observations have been recorded yet.</p>:<div className="jd-wfc-table">{employeeUsage.map(u=><article key={u.id}><div><strong>{employees.find(e=>e.id===u.employee_id)?.display_name||"Employee identity unavailable"}</strong><p>Assignment {u.assignment_id}</p><small>{stamp(u.created_at)} · {(u.active_microseconds/1000000/60).toFixed(1)} active minutes · Rate {usd(u.rate_micros_per_hour)}/hr</small></div><span className="jd-wfc-state">{usd(u.amount_micros)} shadow estimate · {u.reconciliation_status?.replaceAll("_"," ")}</span></article>)}</div>}</section>
  <footer className="jd-wfc-foot">Snapshot {stamp(snapshot?.snapshotAt)} · Tenant-scoped records · {snapshot?.billingMode==="shadow_only"?"Shadow billing only":"Billing state unavailable"}</footer>
  {modal&&<Modal title={modal.kind==="employee-budget"?"Budget — "+modal.targetName:modal.kind==="team-budget"?"Team ceiling — "+modal.targetName:modal.kind==="add-member"?"Add member to "+modal.targetName:"Remove member from "+modal.targetName} onClose={()=>setModal(null)}>
   {(modal.kind==="employee-budget"||modal.kind==="team-budget")&&<form className="jd-wfc-modal-form" onSubmit={event=>{event.preventDefault();void submitBudget();}}>
    <label>{modal.kind==="team-budget"?"Team budget in USD (aggregate shadow ceiling; 0 means no ceiling)":"Budget in USD (shadow limit only)"}<input type="number" min="0" step="0.01" value={modal.budget} onChange={event=>setModal(current=>({...current,budget:event.target.value}))} autoFocus/></label>
    {modal.kind==="employee-budget"&&<label>Hourly rate in USD (shadow estimate only)<input type="number" min="0" step="0.01" value={modal.rate||""} onChange={event=>setModal(current=>({...current,rate:event.target.value}))}/></label>}
    <p>Limits and estimates only — no charge or invoice is created.</p>
    <div className="jd-wfc-modal-actions"><button type="button" onClick={()=>setModal(null)}>Cancel</button><button type="submit" disabled={busy===modal.target?.id} className="primary">{busy===modal.target?.id?"Saving…":"Save budget"}</button></div>
   </form>}
   {(modal.kind==="add-member"||modal.kind==="remove-member")&&<form className="jd-wfc-modal-form" onSubmit={event=>{event.preventDefault();void submitMembership();}}>
    <label>{modal.kind==="add-member"?"Employee to add":"Employee to remove"}
     <select value={modal.employeeId} onChange={event=>setModal(current=>({...current,employeeId:event.target.value}))} autoFocus>
      <option value="">Choose…</option>
      {(modal.kind==="add-member"?employees.filter(e=>e.lifecycle_state==="active"):members.filter(m=>m.team_id===modal.target.id).map(m=>employees.find(e=>e.id===m.employee_id)).filter(Boolean)).map(employee=><option key={employee.id} value={employee.id}>{employee.display_name}</option>)}
     </select>
    </label>
    <div className="jd-wfc-modal-actions"><button type="button" onClick={()=>setModal(null)}>Cancel</button><button type="submit" disabled={busy==="membership"||!modal.employeeId} className="primary">{busy==="membership"?"Working…":modal.kind==="add-member"?"Add to team":"Remove from team"}</button></div>
   </form>}
  </Modal>}
 </main>;
}
